const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const btnLogin = document.getElementById("btn-login");
const btnRefresh = document.getElementById("btn-refresh");
const accessEl = document.getElementById("access-token");
const refreshEl = document.getElementById("refresh-token");
const expireEl = document.getElementById("expire");
const userCard = document.getElementById("user-card");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userAccount = document.getElementById("user-account");
const btnCookie = document.getElementById("btn-cookie");
const cookieEl = document.getElementById("cookie-value");

// ---------- 字段遮罩 ----------
const fieldState = {}; // id -> { value, masked }

function setField(id, value) {
  fieldState[id] = { value, masked: true };
  renderField(id);
}

function renderField(id) {
  const el = document.getElementById(id);
  const st = fieldState[id];
  el.value = st && st.value ? (st.masked ? "•".repeat(Math.min(st.value.length, 24)) : st.value) : "";
  const btn = document.querySelector(`.btn-toggle[data-target="${id}"]`);
  if (btn) btn.textContent = st && !st.masked ? "隐藏" : "显示";
}

const STATUS_TEXT = {
  idle: "尚未获取 Token",
  waiting: "已打开登录页，请完成登录…",
  exchanging: "登录成功，正在换取 Token…",
  success: "获取成功",
  error: "出错了",
};

let expireTimer = null;

function renderStatus(status) {
  const state = (status && status.state) || "idle";
  statusEl.className = "status status-" + state;
  statusEl.textContent =
    state === "error" ? `出错了：${status.error || "未知错误"}` : STATUS_TEXT[state] || state;
  btnLogin.disabled = state === "waiting" || state === "exchanging";
  btnLogin.textContent =
    state === "waiting" || state === "exchanging" ? "等待登录完成…" : "登录 pixiv 并获取 Token";
}

function renderToken(token) {
  if (!token) {
    resultEl.classList.add("hidden");
    return;
  }
  resultEl.classList.remove("hidden");
  setField("access-token", token.access_token || "");
  setField("refresh-token", token.refresh_token || "");

  if (token.user) {
    userCard.classList.remove("hidden");
    userAvatar.src =
      (token.user.profile_image_urls && (token.user.profile_image_urls.px_50x50 || token.user.profile_image_urls.medium)) || "";
    userName.textContent = token.user.name || "";
    userAccount.textContent = `@${token.user.account} · UID ${token.user.id}`;
  } else {
    userCard.classList.add("hidden");
  }

  if (expireTimer) clearInterval(expireTimer);
  const update = () => {
    const remain = Math.floor((token.obtained_at + token.expires_in * 1000 - Date.now()) / 1000);
    if (remain <= 0) {
      expireEl.textContent = "已过期，请刷新";
      clearInterval(expireTimer);
      return;
    }
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    expireEl.textContent = `${m} 分 ${s} 秒后过期`;
  };
  update();
  expireTimer = setInterval(update, 1000);
}

async function load() {
  const { pixivToken, pixivTokenStatus } = await chrome.storage.local.get(["pixivToken", "pixivTokenStatus"]);
  renderStatus(pixivToken ? pixivTokenStatus || { state: "success" } : pixivTokenStatus);
  renderToken(pixivToken);
}

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  const res = await chrome.runtime.sendMessage({ type: "start_login" });
  if (!res || !res.ok) {
    renderStatus({ state: "error", error: (res && res.error) || "无法打开登录页" });
  }
});

btnRefresh.addEventListener("click", async () => {
  const st = fieldState["refresh-token"];
  const rt = st && st.value ? st.value.trim() : "";
  if (!rt) return;
  btnRefresh.disabled = true;
  btnRefresh.textContent = "刷新中…";
  const res = await chrome.runtime.sendMessage({ type: "refresh_token", refresh_token: rt });
  if (!res || !res.ok) {
    renderStatus({ state: "error", error: (res && res.error) || "刷新失败" });
  }
  btnRefresh.disabled = false;
  btnRefresh.textContent = "用 Refresh Token 刷新 Access Token";
});

document.querySelectorAll(".btn-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const st = fieldState[btn.dataset.copy];
    if (!st || !st.value) return;
    await navigator.clipboard.writeText(st.value);
    btn.textContent = "已复制";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  });
});

document.querySelectorAll(".btn-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const st = fieldState[btn.dataset.target];
    if (!st || !st.value) return;
    st.masked = !st.masked;
    renderField(btn.dataset.target);
  });
});

document.getElementById("btn-clear").addEventListener("click", async () => {
  if (!confirm("确定清除已保存的 Token 和用户信息吗？")) return;
  await chrome.storage.local.remove(["pixivToken", "pixivTokenStatus"]);
  ["access-token", "refresh-token", "cookie-value"].forEach((id) => setField(id, ""));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.pixivTokenStatus) renderStatus(changes.pixivTokenStatus.newValue);
  if (changes.pixivToken) renderToken(changes.pixivToken.newValue);
});

// ---------- Cookie（Web 端 PHPSESSID） ----------
async function loadCookie(showError) {
  if (!chrome.cookies) {
    cookieEl.placeholder = "缺少 cookies 权限，请到 chrome://extensions 重新加载扩展";
    return false;
  }
  btnCookie.disabled = true;
  try {
    const cookie = await chrome.cookies.get({ url: "https://www.pixiv.net/", name: "PHPSESSID" });
    if (cookie) {
      setField("cookie-value", `PHPSESSID=${cookie.value}`);
      return true;
    }
    if (showError) {
      setField("cookie-value", "");
      cookieEl.placeholder = "未获取到，请先在打开的页面登录 pixiv";
      chrome.tabs.create({ url: "https://www.pixiv.net/" });
    }
  } catch (e) {
    if (showError) cookieEl.placeholder = `获取失败：${(e && e.message) || e}`;
  } finally {
    btnCookie.disabled = false;
  }
  return false;
}

btnCookie.addEventListener("click", () => loadCookie(true));

load();
loadCookie(false); // 打开弹窗时静默尝试读取一次
