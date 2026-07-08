# LINE 行事曆 Bot — 產品決策記錄

## 核心價值主張

**語音輸入 → 自動建立 Google 行事曆事件**

用戶對 Bot 說話（LINE 語音輸入自動轉文字），Bot 解析後直接建立到 Google 行事曆。
零額外步驟，說完就完成。

---

## 架構演進與取捨

### v1：共用行事曆 + email 邀請
**做了什麼：** Service Account 建立共用行事曆，用戶 `/register email` 登記，Bot 建立事件時邀請所有人。

**發現的問題：**
- Google 不允許 Service Account 對 Gmail 用戶發送行事曆邀請（只有 Google Workspace 才行）
- email 改寫進備註欄，失去邀請意義
- `/register` 步驟增加摩擦，用戶要記指令

**決策：** 放棄 email 邀請系統，改用「訂閱共用行事曆」模式。

---

### v2：共用行事曆 + 訂閱連結
**做了什麼：** 移除 email 邀請，改為讓用戶點連結訂閱共用行事曆。

**討論到的問題：**
- LINE 內建瀏覽器體驗差，點連結不會跳到 Google Calendar App
- 「點連結才能加入行事曆」把「建立與否」交給用戶判斷——但這不是好設計

**Louis70109 開源專案的做法：** 只生成「加入行事曆」URL，不實際建立事件，讓用戶自己點。

**為什麼不採用：**
> 「用戶應該是『看行事曆才知道自己啥時有空』，強迫他們去點連結才能加入，是最粗重的那段，好聽是自由，難聽是沒幫助到。」

**核心洞察：** 真正的價值是事件自動出現在行事曆，不是給用戶一個連結去自己加。

---

### v3：每人專屬行事曆（目標架構）
**設計原則：**
1. 第一次加 Bot 好友 → Bot 自動建立該用戶的專屬行事曆
2. Bot 發送訂閱連結（**只需點一次**，這是唯一無法省略的步驟，因為 Google 需要用戶同意）
3. 之後說話就建行程，完全自動

**為什麼「點一次」無法省略：**
Google 不允許在未經用戶同意下將行事曆塞入其帳號，訂閱連結就是那個同意的動作。

**群組場景：** 同樣邏輯，群組有一個共用行事曆，成員各自點一次訂閱連結，之後自動同步。

---

### v4：部署平台從 Render 遷移到 Cloud Run（2026-07-08）

**動機：** Render 免費方案要靠 GitHub Actions 每 5 分鐘 ping 才不會睡眠，而且冷啟動延遲常常超過 LINE reply token 的有效期，導致訊息「已讀但沒反應」。Cloud Run 的 request-based 計費模式下，沒人用時直接縮到零、不計費，也不需要 keep-alive 這種 workaround。

**做了什麼：**
- 加了 `Dockerfile`、`.dockerignore`，改用 `gcloud run deploy --source .` 部署
- 環境變數改用 `env.yaml` + `--env-vars-file`，而不是 `--set-env-vars`（`GOOGLE_SERVICE_ACCOUNT_KEY` 是 JSON，內容有逗號，`--set-env-vars` 會照逗號切壞）
- 目前 Render 和 Cloud Run **同時存在**，LINE Webhook 已切到 Cloud Run，但 Render 還沒關掉（留著當備援，尚未決定何時正式退役）

**踩到的坑（意外發現，但影響重大）：**
為了讓 Cloud Run 部署成功，必須先在該 GCP project 啟用 billing。但 billing 是掛在整個 project 上，不是掛在單一 API——同一個 project 底下原本跑在免費層的 Gemini API key，因此被悄悄升級成付費 Prepay 方案，而新方案預設餘額是 $0。結果所有 Gemini 呼叫直接失敗（`429 prepayment credits are depleted`），每則 LINE 訊息都解析失敗又沒有任何錯誤提示,使用者只看到「已讀但沒反應」，一度被誤判成程式邏輯 bug。

**修法：** 把 Gemini API key 移到一個獨立、永遠不啟用 billing 的 GCP project，讓它從結構上留在免費層，而不是依賴「記得儲值」。這代表這個專案現在需要**兩個 GCP project**：一個給 Cloud Run/Calendar/Sheets（要 billing），一個給 Gemini（不要 billing）。細節見 [README.md](README.md) 的「部署到 Cloud Run」與「設計決策」。

**驗證方式的落差：** 現有的 `verify-deploy.yml` GitHub Action 只會 poll Render 的 `/version`，沒有涵蓋 Cloud Run。這代表「main 上的 commit 有沒有真的上線」這件事，Render 和 Cloud Run 要分開確認，CHANGELOG.md 已經註記這點——但 CI 本身還沒補上 Cloud Run 的驗證，算是已知的待辦。

---

## 功能取捨

| 功能 | 狀態 | 原因 |
|------|------|------|
| 自然語言建立行程 | ✅ 保留 | 核心功能 |
| 查詢行程 | ✅ 保留 | 有實際用途 |
| 取消行程 | ✅ 保留 | 有實際用途 |
| `/register` email | ❌ 移除 | 無實際效果，增加摩擦 |
| Google Sheets 成員管理 | ❌ 移除 | 隨 email 系統一起移除 |
| email 邀請 | ❌ 移除 | Google 技術限制 |

---

## 商業化討論

**討論過的方向：**
- App Store 上架：不需要，LINE Bot 本身就是 App，LINE 是分發渠道
- LINE Pay 收費：需要公司行號，個人無法申請商家帳號
- 開源釋出：讓其他人自己部署，用 GitHub 做分發

**Quota 問題：**
所有群組共用同一個 Gemini API Key，規模化後有以下選項：
1. 向用戶收費，自行吸收 API 費用
2. 用戶自帶 API Key（`/setup YOUR_KEY`）
3. 改用規則解析取代 AI（失去自然語言優勢）

**目前決策：** 先做好個人版，驗證使用情境，再考慮商業化。

---

## 技術選型紀錄

| 項目 | 選擇 | 原因 |
|------|------|------|
| AI 解析 | Gemini 1.5 Flash | 免費，繁體中文支援好 |
| 後端 | Node.js + Express，Render（舊）+ Cloud Run（現行） | Render 免費方案部署簡單，但冷啟動常拖過 LINE reply token 的有效期；Cloud Run scale-to-zero 沒有這個問題，代價是要多顧一個 GCP project 的 billing 設定，見上方 v4 |
| 資料庫 | Google Sheets | 不需新帳號，Service Account 已有權限 |
| 行事曆 | Google Calendar API + Service Account | 自動建立，不需用戶 OAuth |
| 保持伺服器清醒 | GitHub Actions 每 5 分鐘 ping | 解決 Render 免費方案睡眠問題 |
