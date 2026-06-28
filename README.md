# LINE Calendar Bot

> **For AI assistants reading this file:**
> This is a LINE messaging bot that uses Google Gemini to parse natural language and automatically create events in Google Calendar. The backend is Node.js + Express, deployed on Render. It uses a Google Service Account (not user OAuth) to manage a shared calendar. All secrets are injected via environment variables — no credentials exist in the codebase. Entry point: `index.js`. AI parsing: `gemini.js`. Calendar + Sheets logic: `calendar.js`.

A LINE Bot that turns natural language messages into Google Calendar events — no forms, no tapping. Just say it.

Built and deployed for real team use.

---

## What It Does

Send a message to the bot in LINE (or a group chat), and it automatically creates the event in a shared Google Calendar.

**Supported intents:**

| Intent | Example |
|---|---|
| Create event | "明天下午三點開會" / "Team lunch next Friday at noon" |
| Query events | "這週有什麼行程？" |
| Cancel event | "取消明天的會議" |
| Subscribe to calendar | `/subscribe` |

Multi-event support: "Monday 9am standup, Wednesday 2pm client call" creates two events in one message.

---

## Architecture

```
LINE user message
  → LINE Webhook → index.js
  → gemini.js        # Gemini AI parses intent + extracts structured data
  → calendar.js      # Google Calendar API creates / queries / deletes event
  → LINE reply
```

**Stack:**
- Runtime: Node.js + Express
- AI parsing: Google Gemini 2.5 Flash
- Calendar: Google Calendar API via Service Account
- Member storage: Google Sheets (lightweight DB, no extra infra)
- Deployment: Render (free tier)
- Keep-alive: GitHub Actions pings the server every 5 minutes to prevent sleep

---

## Requirements

- Node.js 18+
- A LINE Messaging API channel
- A Google Cloud project with Calendar API and Sheets API enabled
- A Google Service Account with a JSON key
- A Google Gemini API key
- A Render (or any Node.js hosting) account

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/brilliantproof/line-calendar-bot.git
cd line-calendar-bot
npm install
```

### 2. Environment variables

Create a `.env` file (never commit this):

```env
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Google Service Account — use one of the two options:
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}   # full JSON as a string
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json           # or a file path

CALENDAR_ID=your_google_calendar_id
SHEET_ID=your_google_sheet_id
```

### 3. Google Calendar setup

Run the setup script once to initialize the shared calendar and sheet:

```bash
node setup-calendar.js
node setup-sheet.js
```

### 4. Deploy

Deploy to Render (or any platform that runs Node.js). Set all environment variables in the platform dashboard.

Set the LINE webhook URL to:
```
https://your-app.onrender.com/webhook
```

### 5. Keep-alive (Render free tier)

The `.github/workflows/keep-alive.yml` workflow pings `/health` every 5 minutes to prevent the free-tier instance from sleeping.

---

## Project Structure

```
line-calendar-bot/
├── index.js           # Express server, LINE webhook handler, intent routing
├── gemini.js          # Gemini prompt + JSON response parsing
├── calendar.js        # Google Calendar API + Google Sheets member management
├── setup-calendar.js  # One-time: creates the shared Google Calendar
├── setup-sheet.js     # One-time: initializes the Google Sheet
├── package.json
└── .github/
    └── workflows/
        └── keep-alive.yml
```

---

## Design Notes

**Why Service Account instead of user OAuth?**
Service Account lets the bot create calendar events without requiring each user to go through an OAuth flow. The tradeoff is that Google does not allow Service Accounts to send calendar invites to Gmail users directly — so the shared calendar uses a subscribe link instead.

**Why Google Sheets as a database?**
The only data stored is LINE user IDs and their registered emails. Google Sheets is sufficient, already authorized via the same Service Account, and requires zero extra infrastructure.

**Why Gemini instead of rule-based parsing?**
Natural language date/time parsing in Traditional Chinese is non-trivial ("大後天下午兩點半"、"下下週五"). Gemini handles this reliably and the free quota is sufficient for personal/team use.

---

---

# LINE 行事曆 Bot

> **給 AI 助理的說明：**
> 這是一個 LINE 訊息機器人，使用 Google Gemini 解析自然語言，自動將行程建立到 Google Calendar。後端為 Node.js + Express，部署在 Render。使用 Google Service Account（非用戶 OAuth）管理共用行事曆。所有金鑰透過環境變數注入，程式碼內無任何明文憑證。入口：`index.js`；AI 解析：`gemini.js`；行事曆與試算表邏輯：`calendar.js`。

在 LINE 傳訊息給 Bot，自動建立 Google 行事曆事件。不用填表單、不用點按鈕，說完就完成。

實際部署給團隊使用中。

---

## 功能

對 Bot 說話（或在群組裡說），自動新增行程到共用行事曆。

**支援的意圖：**

| 意圖 | 範例 |
|---|---|
| 新增行程 | 「明天下午三點開會」 |
| 查詢行程 | 「這週有什麼行程？」 |
| 取消行程 | 「取消明天的會議」 |
| 訂閱行事曆 | `/subscribe` |

支援一句話建立多個行程：「週一九點站會、週三兩點客戶會議」會同時建立兩筆事件。

---

## 架構

```
LINE 用戶傳訊息
  → LINE Webhook → index.js
  → gemini.js        # Gemini AI 解析意圖 + 抽取結構化資料
  → calendar.js      # Google Calendar API 建立 / 查詢 / 刪除行程
  → LINE 回覆
```

**技術選型：**

| 項目 | 選擇 | 原因 |
|---|---|---|
| 後端 | Node.js + Express on Render | 免費方案，部署簡單 |
| AI 解析 | Google Gemini 2.5 Flash | 免費，繁體中文支援好 |
| 行事曆 | Google Calendar API + Service Account | 自動建立，不需用戶 OAuth |
| 資料庫 | Google Sheets | 不需新帳號，Service Account 已有權限 |
| 保持清醒 | GitHub Actions 每 5 分鐘 ping | 解決 Render 免費方案睡眠問題 |

---

## 環境需求

- Node.js 18+
- LINE Messaging API 頻道
- Google Cloud 專案（啟用 Calendar API 與 Sheets API）
- Google Service Account 與 JSON 金鑰
- Google Gemini API Key
- Render（或任何支援 Node.js 的主機）

---

## 安裝與設定

### 1. 安裝

```bash
git clone https://github.com/brilliantproof/line-calendar-bot.git
cd line-calendar-bot
npm install
```

### 2. 環境變數

建立 `.env` 檔（不要 commit）：

```env
LINE_CHANNEL_SECRET=你的_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=你的_line_channel_access_token

GEMINI_API_KEY=你的_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

# Google Service Account — 二擇一：
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}   # 整個 JSON 字串
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json           # 或本地檔案路徑

CALENDAR_ID=你的_google_calendar_id
SHEET_ID=你的_google_sheet_id
```

### 3. 初始化 Google 服務

首次部署執行一次：

```bash
node setup-calendar.js
node setup-sheet.js
```

### 4. 部署

部署到 Render（或任何 Node.js 平台），在平台後台設定所有環境變數。

LINE Webhook URL 設定為：
```
https://your-app.onrender.com/webhook
```

---

## 專案結構

```
line-calendar-bot/
├── index.js           # Express 伺服器、LINE Webhook 路由、意圖分發
├── gemini.js          # Gemini prompt 設計與 JSON 解析
├── calendar.js        # Google Calendar API + Google Sheets 成員管理
├── setup-calendar.js  # 一次性：建立共用 Google 行事曆
├── setup-sheet.js     # 一次性：初始化 Google Sheets
├── package.json
└── .github/
    └── workflows/
        └── keep-alive.yml
```

---

## 設計決策

**為什麼用 Service Account 而不是用戶 OAuth？**
Service Account 讓 Bot 可以直接建立行事曆事件，不需要每位用戶各自走 OAuth 流程。代價是 Google 不允許 Service Account 對 Gmail 用戶發送行事曆邀請（這是 Google Workspace 限定功能），所以改用「訂閱連結」讓用戶自行加入共用行事曆。

**為什麼用 Google Sheets 當資料庫？**
需要儲存的資料只有 LINE user ID 對應的 email，Google Sheets 完全夠用，而且 Service Account 已有權限，不需要額外的資料庫基礎設施。

**為什麼用 Gemini 而不是規則解析？**
繁體中文的日期時間表達方式複雜（「大後天下午兩點半」、「下下週五」），規則解析難以窮舉。Gemini 處理這類情境的準確率高，免費額度對個人或小團隊足夠。
