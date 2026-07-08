# LINE Calendar Bot

> **For AI assistants reading this file:**
> This is a LINE messaging bot that uses Google Gemini to parse natural language and automatically create events (including all-day events) in Google Calendar, or log unparseable 1:1 messages as notes. The backend is Node.js + Express. As of 2026-07-08 it runs on **both** Render (legacy, auto-deploys from `main`) and Google Cloud Run (current, manually deployed via `gcloud run deploy` — see "Deploy to Cloud Run" below) — check which URL the LINE webhook actually points at before assuming either one is "production." It uses a Google Service Account (not user OAuth) to manage a shared calendar. All secrets are injected via environment variables — no credentials exist in the codebase. The Gemini API key **must** live in a GCP project with no billing account attached, or it silently gets upgraded from the free tier to a paid Prepay plan with a $0 balance (see "Design Notes"). Entry point: `index.js`. AI parsing: `gemini.js`. Calendar + Sheets logic: `calendar.js`.

A LINE Bot that turns natural language messages into Google Calendar events — no forms, no tapping. Just say it.

Built and deployed for real team use.

---

## What It Does

Send a message to the bot in LINE (or a group chat), and it automatically creates the event in a shared Google Calendar.

**Supported intents:**

| Intent | Example |
|---|---|
| Create event (timed) | "明天下午三點開會" / "Team lunch next Friday at noon" |
| Create event (all-day) | "8/21暑輔結束" — a clear future date with no clock time creates an all-day event |
| Query events | "這週有什麼行程？" |
| Cancel event | "取消明天的會議" |
| Capture a note (1:1 chats only) | Any message that isn't calendar-shaped (e.g. "完成了 API 串接") gets logged to a `notes` sheet tab instead of dropped. Not supported in group chats yet — unparseable group messages are silently ignored. |
| Query today's notes | "我今天記了什麼？" |
| Subscribe to calendar | `/subscribe` |

Multi-event support: "Monday 9am standup, Wednesday 2pm client call" creates two events in one message.

---

## Architecture

```
LINE user message
  → LINE Webhook → index.js
  → gemini.js        # Gemini AI parses intent + extracts structured data
  → calendar.js      # Google Calendar API creates / queries / deletes event, Sheets for notes/logs/deploys
  → LINE reply
```

**Stack:**
- Runtime: Node.js + Express
- AI parsing: Google Gemini 2.5 Flash — **the API key's GCP project must not have billing enabled** (see Design Notes)
- Calendar: Google Calendar API via Service Account
- Storage: Google Sheets — member emails, `notes`, `logs` (errors), `deploys` (self-reported boot commit)
- Deployment: Render (legacy, free tier, auto-deploy from `main`) **and** Cloud Run (current, manual deploy, see below) — only one of them actually has the LINE webhook pointed at it at any given time
- Container build: `Dockerfile` + `.dockerignore` (Cloud Run only; Render doesn't need these)
- Keep-alive: GitHub Actions pings `/health` every 5 minutes — only relevant to Render; Cloud Run scales to zero and doesn't need it

---

## Requirements

- Node.js 18+
- A LINE Messaging API channel
- **Two separate GCP projects**, not one:
  1. A project with Calendar API + Sheets API enabled, a Service Account JSON key, and (if deploying to Cloud Run) an active billing account — this is the one `gcloud run deploy` uses.
  2. A **separate** project for the Gemini API key with **no billing account attached**, so it stays on the free tier. See "Design Notes" for why these can't be the same project.
- A Render account (legacy) and/or the `gcloud` CLI authenticated for Cloud Run (current)

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

### 4a. Deploy to Render (legacy)

Deploy to Render (or any platform that runs Node.js). Set all environment variables in the platform dashboard.

Set the LINE webhook URL to:
```
https://your-app.onrender.com/webhook
```

The `.github/workflows/keep-alive.yml` workflow pings `/health` every 5 minutes to prevent the free-tier instance from sleeping. Not needed on Cloud Run.

### 4b. Deploy to Cloud Run (current)

Requires the `gcloud` CLI, authenticated, with the **billing-enabled** project (not the Gemini one) set as active:

```bash
gcloud config set project YOUR_CLOUD_RUN_PROJECT_ID
```

Run this from **inside the repo directory**, not your home directory — `--source .` uploads the current working directory as the build context, and running it from `$HOME` will try to zip your entire home folder (this has actually failed before with a "ZIP does not support timestamps before 1980" error).

Cloud Run needs the same variables as `.env`, but as a `env.yaml` file (never commit this — it's already in `.gitignore`):

```yaml
LINE_CHANNEL_SECRET: "your_line_channel_secret"
LINE_CHANNEL_ACCESS_TOKEN: "your_line_channel_access_token"
GEMINI_API_KEY: "your_gemini_api_key"
GEMINI_MODEL: "gemini-2.5-flash"
GOOGLE_SERVICE_ACCOUNT_KEY: 'full JSON as a single line, single-quoted'
SHEET_ID: "your_google_sheet_id"
CALENDAR_ID: "your_google_calendar_id"
```

Two things that will bite you if skipped:
- **Don't use `--set-env-vars` with a comma-separated string.** `GOOGLE_SERVICE_ACCOUNT_KEY` is JSON and contains commas — `--set-env-vars` will split on them and corrupt the value. Use `--env-vars-file=env.yaml` instead.
- **`GOOGLE_SERVICE_ACCOUNT_KEY` must be single-quoted in the YAML, not double-quoted.** The key's `private_key` field contains literal `\n` escape sequences that must survive as two characters (backslash + n), not be turned into a real newline. YAML single-quoted scalars don't process backslash escapes; double-quoted ones do (which breaks `JSON.parse` downstream). Also collapse the key file to a single line first (`JSON.stringify(JSON.parse(fs.readFileSync(...)))`) — a pretty-printed multi-line key file breaks the single-line YAML scalar.
- Locally, `.env` typically uses `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` pointing at `calendar-bot-key.json` — but that file is excluded by `.dockerignore` and won't exist in the container, so `env.yaml` needs the **inline JSON** (`GOOGLE_SERVICE_ACCOUNT_KEY`), not the path variant.

```bash
gcloud run deploy line-calendar-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --env-vars-file=env.yaml
```

`--allow-unauthenticated` is required — LINE's webhook can't do Google IAM auth — but it also means `/health` and `/version` are publicly reachable by anyone, not just LINE.

After deploy, point the LINE webhook URL at `https://<service-url>/webhook` and confirm `/health` returns `{"ok":true}`.

---

## Project Structure

```
line-calendar-bot/
├── index.js                      # Express server, LINE webhook handler, intent routing
├── gemini.js                     # Gemini prompt + JSON response parsing
├── calendar.js                   # Google Calendar API + Google Sheets (members/notes/logs/deploys)
├── setup-calendar.js             # One-time: creates the shared Google Calendar
├── setup-sheet.js                # One-time: initializes the Google Sheet (members)
├── setup-notes-sheet.js          # One-time: initializes the `notes` sheet tab
├── setup-observability-sheets.js # One-time: initializes the `logs` and `deploys` sheet tabs
├── Dockerfile                    # Cloud Run build (not used by Render)
├── .dockerignore                 # Excludes .env, calendar-bot-key.json, node_modules, .git from the image
├── CHANGELOG.md                  # One entry per commit; tracks what's actually deployed where
├── package.json
└── .github/
    └── workflows/
        ├── keep-alive.yml        # Pings Render every 5 min (Render only)
        └── verify-deploy.yml     # Polls Render's /version after every push to main (Render only — does not check Cloud Run)
```

---

## Design Notes

**Why Service Account instead of user OAuth?**
Service Account lets the bot create calendar events without requiring each user to go through an OAuth flow. The tradeoff is that Google does not allow Service Accounts to send calendar invites to Gmail users directly — so the shared calendar uses a subscribe link instead.

**Why Google Sheets as a database?**
The data stored (member emails, notes, error logs, deploy history) is small and low-throughput. Google Sheets is sufficient, already authorized via the same Service Account, and requires zero extra infrastructure.

**Why Gemini instead of rule-based parsing?**
Natural language date/time parsing in Traditional Chinese is non-trivial ("大後天下午兩點半"、"下下週五"). Gemini handles this reliably and the free quota is sufficient for personal/team use.

**Why does a date-only message become an all-day event instead of a note?**
Gemini distinguishes "a future date marking when something happens/ends/is due" (→ all-day `create`) from "a retrospective statement that happens to mention a date, like a completed-work log" (→ `null`/note). E.g. "8/21暑輔結束" is all-day create; "今天完成了電子報" stays a note even though it also contains a date word ("今天").

**Why does the Gemini API key need its own GCP project with no billing?**
Billing is attached at the project level, not per-API. On 2026-07-08 we enabled billing on the Cloud Run project so `gcloud run deploy` would work — and it silently upgraded the Gemini API key living in that *same* project from the free tier to a paid Prepay plan. New Prepay plans start with a $0 balance, so every Gemini call immediately failed with `429 ... Your prepayment credits are depleted`, and every LINE message silently failed to parse (logged as `null`, no error shown to the user). Keeping the Gemini key in a project that never gets billing enabled avoids this entirely — it isn't a matter of remembering to top up, it's structural.

---

---

# LINE 行事曆 Bot

> **給 AI 助理的說明：**
> 這是一個 LINE 訊息機器人，使用 Google Gemini 解析自然語言，自動將行程（包含整天行程）建立到 Google Calendar，無法解析成行程的 1:1 訊息會記成筆記。後端為 Node.js + Express。截至 2026-07-08，**同時**跑在 Render（舊，push 到 `main` 就自動部署）和 Google Cloud Run（現行，手動用 `gcloud run deploy` 部署，見下方「部署到 Cloud Run」）——要先確認 LINE Webhook 實際指向哪一個網址，不要假設任一邊就是正式環境。使用 Google Service Account（非用戶 OAuth）管理共用行事曆。所有金鑰透過環境變數注入，程式碼內無任何明文憑證。**Gemini API key 一定要放在沒有啟用 billing 的 GCP project**，否則會被悄悄從免費層升級成付費 Prepay 方案、餘額卻是 $0（見「設計決策」）。入口：`index.js`；AI 解析：`gemini.js`；行事曆與試算表邏輯：`calendar.js`。

在 LINE 傳訊息給 Bot，自動建立 Google 行事曆事件。不用填表單、不用點按鈕，說完就完成。

實際部署給團隊使用中。

---

## 功能

對 Bot 說話（或在群組裡說），自動新增行程到共用行事曆。

**支援的意圖：**

| 意圖 | 範例 |
|---|---|
| 新增行程（有時間） | 「明天下午三點開會」 |
| 新增行程（整天） | 「8/21暑輔結束」——有明確未來日期、但沒有時鐘時間，會建成整天行程 |
| 查詢行程 | 「這週有什麼行程？」 |
| 取消行程 | 「取消明天的會議」 |
| 記筆記（僅限 1:1 私訊） | 任何無法解析成行程的訊息（例如「完成了 API 串接」）會記到 `notes` sheet，而不是被丟掉。群組還不支援——群組裡無法解析的訊息目前會靜默略過。 |
| 查詢今天的筆記 | 「我今天記了什麼？」 |
| 訂閱行事曆 | `/subscribe` |

支援一句話建立多個行程：「週一九點站會、週三兩點客戶會議」會同時建立兩筆事件。

---

## 架構

```
LINE 用戶傳訊息
  → LINE Webhook → index.js
  → gemini.js        # Gemini AI 解析意圖 + 抽取結構化資料
  → calendar.js      # Google Calendar API 建立/查詢/刪除行程，Sheets 存筆記/log/部署紀錄
  → LINE 回覆
```

**技術選型：**

| 項目 | 選擇 | 原因 |
|---|---|---|
| 後端 | Node.js + Express | — |
| AI 解析 | Google Gemini 2.5 Flash | 免費，繁體中文支援好——**但 API key 所在的 GCP project 不能啟用 billing**（見「設計決策」） |
| 行事曆 | Google Calendar API + Service Account | 自動建立，不需用戶 OAuth |
| 資料儲存 | Google Sheets | 成員 email、`notes`、`logs`（錯誤）、`deploys`（部署自報告） |
| 部署 | Render（舊，免費方案，push main 自動部署）**+** Cloud Run（現行，手動部署，見下方） | 同時間只有其中一邊真的接了 LINE Webhook |
| 容器建置 | `Dockerfile` + `.dockerignore` | 只有 Cloud Run 需要，Render 不用 |
| 保持清醒 | GitHub Actions 每 5 分鐘 ping | 只對 Render 有意義；Cloud Run 會自動縮到零、不需要這個 |

---

## 環境需求

- Node.js 18+
- LINE Messaging API 頻道
- **兩個獨立的 GCP project**，不能共用：
  1. 啟用 Calendar API + Sheets API、有 Service Account JSON 金鑰的 project——如果要部署到 Cloud Run，這個 project 需要啟用 billing。`gcloud run deploy` 用的就是這個 project。
  2. **另一個**專門放 Gemini API key 的 project，**不要啟用 billing**，這樣才能留在免費層。為什麼不能共用一個 project，見「設計決策」。
- Render 帳號（舊）和/或已登入、可用於 Cloud Run 的 `gcloud` CLI（現行）

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

### 4a. 部署到 Render（舊）

部署到 Render（或任何 Node.js 平台），在平台後台設定所有環境變數。

LINE Webhook URL 設定為：
```
https://your-app.onrender.com/webhook
```

`.github/workflows/keep-alive.yml` 每 5 分鐘 ping 一次 `/health`，避免免費方案的實例睡眠。Cloud Run 不需要這個。

### 4b. 部署到 Cloud Run（現行）

需要 `gcloud` CLI 已登入，並且目前 active 的 project 是**有啟用 billing 的那個**（不是放 Gemini key 的那個）：

```bash
gcloud config set project YOUR_CLOUD_RUN_PROJECT_ID
```

一定要在**專案資料夾內**執行，不要在家目錄執行——`--source .` 會把目前工作目錄打包上傳當 build context，在 `$HOME` 執行會嘗試打包整個家目錄（實際發生過一次，因為家目錄裡有太舊的檔案，撞到「ZIP does not support timestamps before 1980」的錯誤直接失敗）。

Cloud Run 需要跟 `.env` 一樣的變數，但要放進 `env.yaml` 檔案（不要 commit，已經在 `.gitignore` 裡）：

```yaml
LINE_CHANNEL_SECRET: "你的_line_channel_secret"
LINE_CHANNEL_ACCESS_TOKEN: "你的_line_channel_access_token"
GEMINI_API_KEY: "你的_gemini_api_key"
GEMINI_MODEL: "gemini-2.5-flash"
GOOGLE_SERVICE_ACCOUNT_KEY: '整個 JSON 壓成一行，用單引號包起來'
SHEET_ID: "你的_google_sheet_id"
CALENDAR_ID: "你的_google_calendar_id"
```

兩個容易踩到的坑：
- **不要用 `--set-env-vars` 帶逗號分隔的字串。**`GOOGLE_SERVICE_ACCOUNT_KEY` 是 JSON，內容本身就有逗號，`--set-env-vars` 會照逗號切開、把值弄壞。要用 `--env-vars-file=env.yaml`。
- **`GOOGLE_SERVICE_ACCOUNT_KEY` 在 YAML 裡要用單引號，不能用雙引號。**金鑰裡的 `private_key` 欄位含有字面上的 `\n` 逃逸序列，必須維持原樣兩個字元（反斜線加 n），不能被轉成真正的換行字元。YAML 單引號字串不處理反斜線逃逸，雙引號會處理（處理完 `JSON.parse` 就壞了）。另外金鑰檔案內容要先壓成單行（`JSON.stringify(JSON.parse(fs.readFileSync(...)))`）——原始金鑰檔通常是排版過的多行 JSON，會破壞 YAML 單行 scalar 的格式。
- 本機 `.env` 通常用 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 指向 `calendar-bot-key.json`——但這個檔案被 `.dockerignore` 排除，容器裡不會有，所以 `env.yaml` 要用**內嵌 JSON**（`GOOGLE_SERVICE_ACCOUNT_KEY`），不能用路徑那個變數。

```bash
gcloud run deploy line-calendar-bot \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --env-vars-file=env.yaml
```

`--allow-unauthenticated` 是必要的——LINE 的 webhook 沒辦法做 Google IAM 驗證——但這也代表 `/health`、`/version` 這些 endpoint 任何人都能連到，不只 LINE。

部署完成後，把 LINE Webhook URL 改成 `https://<service-url>/webhook`，並確認 `/health` 回傳 `{"ok":true}`。

---

## 專案結構

```
line-calendar-bot/
├── index.js                      # Express 伺服器、LINE Webhook 路由、意圖分發
├── gemini.js                     # Gemini prompt 設計與 JSON 解析
├── calendar.js                   # Google Calendar API + Google Sheets（成員/筆記/log/部署紀錄）
├── setup-calendar.js             # 一次性：建立共用 Google 行事曆
├── setup-sheet.js                # 一次性：初始化 Google Sheets（成員）
├── setup-notes-sheet.js          # 一次性：初始化 `notes` sheet tab
├── setup-observability-sheets.js # 一次性：初始化 `logs`、`deploys` sheet tab
├── Dockerfile                    # Cloud Run 建置用（Render 不需要）
├── .dockerignore                 # 排除 .env、calendar-bot-key.json、node_modules、.git，避免打包進 image
├── CHANGELOG.md                  # 每個 commit 一筆，用來追蹤實際部署到哪裡
├── package.json
└── .github/
    └── workflows/
        ├── keep-alive.yml        # 每 5 分鐘 ping Render（只對 Render 有用）
        └── verify-deploy.yml     # push main 後輪詢 Render 的 /version（只驗證 Render，不驗證 Cloud Run）
```

---

## 設計決策

**為什麼用 Service Account 而不是用戶 OAuth？**
Service Account 讓 Bot 可以直接建立行事曆事件，不需要每位用戶各自走 OAuth 流程。代價是 Google 不允許 Service Account 對 Gmail 用戶發送行事曆邀請（這是 Google Workspace 限定功能），所以改用「訂閱連結」讓用戶自行加入共用行事曆。

**為什麼用 Google Sheets 當資料庫？**
需要儲存的資料（成員 email、筆記、錯誤 log、部署紀錄）量小、頻率低，Google Sheets 完全夠用，而且 Service Account 已有權限，不需要額外的資料庫基礎設施。

**為什麼用 Gemini 而不是規則解析？**
繁體中文的日期時間表達方式複雜（「大後天下午兩點半」、「下下週五」），規則解析難以窮舉。Gemini 處理這類情境的準確率高，免費額度對個人或小團隊足夠。

**為什麼只有日期沒有時間的訊息會變成整天行程，而不是筆記？**
Gemini 會區分「標記某件事未來會發生/結束/到期的日期」（→ 整天 `create`）和「剛好提到日期、但其實是在回顧已完成事項的陳述句」（→ `null`/筆記）。例如「8/21暑輔結束」是整天行程；「今天完成了電子報」雖然也有日期字眼（「今天」），但仍然是筆記。

**為什麼 Gemini API key 要放在單獨、沒有 billing 的 GCP project？**
Billing 是掛在整個 project 上，不是掛在單一 API。2026-07-08 我們為了讓 `gcloud run deploy` 能跑，啟用了 Cloud Run project 的 billing——結果同一個 project 底下的 Gemini API key 也被悄悄從免費層升級成付費 Prepay 方案。新開的 Prepay 方案預設餘額是 $0，所以每次呼叫 Gemini 都直接失敗，錯誤是 `429 ... Your prepayment credits are depleted`，導致每則 LINE 訊息都解析失敗（記成 `null`，使用者端完全沒有錯誤提示）。把 Gemini key 放在永遠不啟用 billing 的獨立 project，可以從結構上避免這個問題，而不是靠「記得儲值」。

---
