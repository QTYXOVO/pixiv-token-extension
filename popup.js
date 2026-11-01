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
  accessEl.value = token.access_token || "";
  refreshEl.value = token.refresh_token || "";

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
  const rt = refreshEl.value.trim();
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
    const target = document.getElementById(btn.dataset.copy);
    await navigator.clipboard.writeText(target.value);
    btn.textContent = "已复制";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.pixivTokenStatus) renderStatus(changes.pixivTokenStatus.newValue);
  if (changes.pixivToken) renderToken(changes.pixivToken.newValue);
});

// ---------- Cookie（Web 端 PHPSESSID） ----------
async function loadCookie(showError) {
  btnCookie.disabled = true;
  try {
    const cookie = await chrome.cookies.get({ url: "https://www.pixiv.net/", name: "PHPSESSID" });
    if (cookie) {
      cookieEl.value = `PHPSESSID=${cookie.value}`;
      return true;
    }
    if (showError) {
      cookieEl.value = "";
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
