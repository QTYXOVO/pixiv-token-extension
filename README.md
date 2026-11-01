# Pixiv Token 获取器

![AI Generated](https://img.shields.io/badge/Code-AI%20Generated-blueviolet)

> 🤖 本项目代码由 AI 助手生成，仅供学习交流使用，使用前请自行审阅代码。

一个 Chrome / Edge 浏览器扩展（Manifest V3），通过 pixiv 官方 OAuth（PKCE）流程登录，快速获取 `access_token` 和 `refresh_token`，用于调用 pixiv API（如 pixivpy 等第三方客户端）。

## 功能

- 一键打开 pixiv 官方登录页，登录后自动截获授权码并换取 Token
- 展示 `access_token` / `refresh_token`、过期倒计时，一键复制
- 展示登录用户信息（头像、昵称、UID）
- 支持用 `refresh_token` 直接刷新 `access_token`
- 一键获取 Web 端 `PHPSESSID` Cookie（适用于 Pixeval 等使用 WebAPI 的工具）
- Token 默认遮罩显示，防止截图/肩窥泄露
- 支持一键清除本地保存的数据

## 安装

1. 下载或克隆本仓库
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库目录
4. 点击工具栏上的扩展图标即可使用

## 使用方法

1. 点击「登录 pixiv 并获取 Token」，扩展会打开 pixiv 官方登录页
2. 完成登录（如弹出「打开 Pixiv？」提示，点取消即可，Token 已被扩展截获）
3. 登录成功后扩展自动换取 Token，登录页自动关闭
4. 在弹窗中复制 `access_token` / `refresh_token`

`access_token` 有效期约 1 小时，过期后可用 `refresh_token` 在弹窗中一键刷新，无需重新登录。

### 获取 Web 端 Cookie

点击「获取 pixiv.net Cookie」，扩展会读取浏览器中 `www.pixiv.net` 的 `PHPSESSID` 并按 `PHPSESSID=xxx` 格式展示，复制后即可填入 Pixeval 等工具。若未获取到，会自动打开 pixiv.net，登录后重新点击即可。

## 工作原理

```
用户点击登录
   │
   ▼
生成 PKCE code_verifier / code_challenge (S256)
   │
   ▼
打开 https://app-api.pixiv.net/web/v1/login?code_challenge=...
   │
   ▼
用户完成登录，pixiv 302 重定向到 pixiv://account/login?code=xxx
   │
   ▼
扩展通过 webRequest.onBeforeRedirect 截获授权码
   │
   ▼
POST https://oauth.secure.pixiv.net/auth/token（code + code_verifier）
   │
   ▼
得到 access_token / refresh_token，存入 chrome.storage.local
```

## 文件结构

```
├── manifest.json     # 扩展清单（MV3）
├── background.js     # OAuth 流程、code 截获、token 换取与刷新
├── popup.html        # 弹窗页面
├── popup.css         # 弹窗样式
├── popup.js          # 弹窗交互逻辑
└── icons/            # 扩展图标
```

## 常见问题

**提示「The client credentials are invalid」？**
pixiv 会不定期轮换 OAuth 客户端密钥。请到 [pixivpy](https://github.com/upbit/pixivpy) 源码中查询最新的 `client_id` / `client_secret`，更新 `background.js` 顶部的 `CLIENT_ID` / `CLIENT_SECRET` 常量后重试。

**授权码过期或流程中断？**
授权码为一次性且很快过期，重新点击登录按钮再走一遍即可。

## 安全提示

`access_token` / `refresh_token` 等同于你的账号密码，请勿泄露给他人或提交到公开仓库。本扩展所有数据仅保存在本地 `chrome.storage`，不会发送到任何第三方服务器（除 pixiv 官方域名外无其他网络请求）。

## 免责声明

本项目仅供学习交流使用，与 pixiv 官方无关。使用的 OAuth 客户端参数来自 pixiv 官方 App 的公开逆向成果（见 pixivpy）。
