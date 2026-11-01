// Pixiv Token 获取器 - 后台 Service Worker
// 流程：PKCE -> 打开官方登录页 -> 监听重定向到 pixiv://account/login?code=xxx -> 换取 token

const CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";
const REDIRECT_URI = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback";
const TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token";
const LOGIN_URL = "https://app-api.pixiv.net/web/v1/login";
const USER_AGENT = "PixivAndroidApp/5.0.234 (Android 11; Pixel 5)";

// ---------- PKCE ----------
function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePkce() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

// ---------- 存储 ----------
function setStatus(status) {
  // status: { state: "idle" | "waiting" | "exchanging" | "success" | "error", error? }
  return chrome.storage.local.set({ pixivTokenStatus: status });
}

async function saveToken(data) {
  const record = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    obtained_at: Date.now(),
    user: data.user || null,
    device_token: data.device_token || null,
  };
  await chrome.storage.local.set({ pixivToken: record });
  await setStatus({ state: "success" });
}

// ---------- Token 请求 ----------
async function tokenRequest(extra) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      include_policy: "true",
      ...extra,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.has_error) {
    const msg =
      (json.errors && json.errors.system && json.errors.system.message) ||
      json.error_description ||
      json.error ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function exchangeCode(code, verifier) {
  const data = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
  });
  await saveToken(data);
}

async function refreshToken(refreshToken) {
  const data = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  await saveToken(data);
}

// ---------- 登录流程 ----------
async function startLogin() {
  const { verifier, challenge } = await generatePkce();
  await chrome.storage.session.set({ pkce_verifier: verifier, login_in_progress: true });
  const url =
    `${LOGIN_URL}?code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256&client=pixiv-android`;
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ login_tab_id: tab.id });
  await setStatus({ state: "waiting" });
  return { ok: true };
}

let exchangingCode = null;

async function onAuthCode(code) {
  const session = await chrome.storage.session.get(["pkce_verifier", "login_in_progress", "login_tab_id"]);
  if (!session.login_in_progress) return;
  if (!session.pkce_verifier) {
    await setStatus({ state: "error", error: "登录会话状态丢失（可能重启过浏览器），请重新点击登录按钮" });
    return;
  }
  if (exchangingCode === code) return; // 防止两个监听路径重复触发
  exchangingCode = code;
  try {
    await chrome.storage.session.set({ login_in_progress: false });
    await setStatus({ state: "exchanging" });
    await exchangeCode(code, session.pkce_verifier);
    // 关闭我们打开并跳到 pixiv:// 的空白登录页
    if (typeof session.login_tab_id === "number") {
      try {
        await chrome.tabs.remove(session.login_tab_id);
      } catch (_) {}
    }
  } catch (e) {
    await setStatus({ state: "error", error: String((e && e.message) || e) });
  } finally {
    exchangingCode = null;
  }
}

function extractCodeFromUrl(urlStr) {
  if (!urlStr) return null;
  if (urlStr.startsWith("pixiv://account/login")) {
    return new URLSearchParams(urlStr.slice(urlStr.indexOf("?") + 1)).get("code");
  }
  if (urlStr.startsWith(REDIRECT_URI)) {
    return new URL(urlStr).searchParams.get("code");
  }
  return null;
}

// 登录成功后 pixiv 会 302 重定向到 pixiv://account/login?code=...
// webRequest 无法直接监听自定义协议，但 onBeforeRedirect 的 redirectUrl 能看到它
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    const code = extractCodeFromUrl(details.redirectUrl);
    if (code) onAuthCode(code);
  },
  { urls: ["*://accounts.pixiv.net/*", "*://app-api.pixiv.net/*"] }
);

// 兜底：部分环境下标签页 URL 会直接变为 pixiv://...
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo && changeInfo.url) {
    const code = extractCodeFromUrl(changeInfo.url);
    if (code) onAuthCode(code);
  }
});

// 用户中途关闭登录页时解除“等待登录”状态，否则 popup 按钮会一直禁用
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await chrome.storage.session.get(["login_tab_id", "login_in_progress"]);
  if (session.login_in_progress && session.login_tab_id === tabId) {
    await chrome.storage.session.set({ login_in_progress: false });
    await setStatus({ state: "idle" });
  }
});

// ---------- 与 popup 通信 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "start_login") {
    startLogin().then(sendResponse, (e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (msg && msg.type === "refresh_token") {
    refreshToken(msg.refresh_token)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
});
