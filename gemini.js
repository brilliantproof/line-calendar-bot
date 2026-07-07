const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logEvent } = require('./calendar');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
});

async function parseMessage(text) {
  const today = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Taipei'
  });

  const prompt = `
今天是 ${today}（台灣時間）。

分析以下訊息，判斷使用者的意圖，回傳 JSON。

訊息：「${text}」

可能的意圖：
1. create（新增行程）：包含具體時間和事件
2. query（查詢行程）：詢問某段時間有什麼「行程」
3. cancel（取消行程）：要取消或刪除某個行程
4. need_info（用戶想建立行程，但沒有提供具體時間）
5. query_notes（查詢筆記）：用戶用問句要求回顧/查看自己之前記錄的筆記內容（不是行程）
6. null（與上述皆無關，包含單純的工作記錄、心得、進度更新等「陳述句」——這些本身就是一則筆記，不是要求查詢）

query_notes 和 null 的關鍵差異：query_notes 是「問句／要求」，null 是「陳述句」。
- 「我今天記了什麼？」「幫我看一下今天的筆記」「回顧一下今天」→ query_notes（這是在要求回顧）
- 「完成了 API 串接」「今天開了三個會」→ null（這本身就是一則要被記下來的筆記，不是在要求查詢）

create 的關鍵條件：每一項都必須有明確的時間線索（例如「三點」「下午」「明天」「這週五」）。
即使句子裡提到「會議」「報告」「開會」這類聽起來像行程的字眼，只要沒有任何時間線索，就一律是 null，
不要硬湊成 create——那是在描述已經做完的事，不是要排時間。
- 「今天完成了電子報、開了影響力概念會議、完成了財務報告」→ null（沒有任何時間線索，這是工作記錄）
- 「明天下午三點開影響力概念會議」→ create（有明確時間）

視訊息中包含的行程數量，回傳對應結構：
- 只有 1 個行程：回傳單一 JSON 物件
- 有 2 個或以上行程：回傳 JSON array，每個行程一個物件，有幾個就放幾個
- 查詢筆記：回傳 {"action":"query_notes"}
- 與上述皆無關：回傳 null

範例（純 JSON，不加任何說明文字）：

單一行程（endTime 和 location 有說清楚）：
{"action":"create","title":"開會","date":"2026-07-03","time":"15:00","endTime":"16:00","location":"台北辦公室"}

單一行程（endTime 或 location 不清楚時用 JSON null）：
{"action":"create","title":"去超市","date":"2026-07-03","time":"18:00","endTime":null,"location":null}

多個行程（不限數量，有幾個就放幾個）：
[
  {"action":"create","title":"第一個行程","date":"2026-07-03","time":"08:00","endTime":"09:00","location":null},
  {"action":"create","title":"第二個行程","date":"2026-07-03","time":"15:00","endTime":null,"location":"捧運站"}
]

查詢行程：
{"action":"query","startDate":"2026-07-03","endDate":"2026-07-03"}

取消行程：
{"action":"cancel","title":"開會","date":"2026-07-03","time":null}

想建立行程但缺少時間等資訊（例如「請幫我建立行程」「新增一個行程」）：
{"action":"need_info"}

查詢筆記（例如「我今天記了什麼」「幫我看一下今天的筆記」「回顧一下今天做的事」）：
{"action":"query_notes"}

無關（單純的工作記錄/心得/進度更新，本身就是一則筆記）：
null

注意：
- 「這週」= 本週一到週日
- 「今天」「明天」「後天」請換算成實際日期
- 「下週」= 下週一到週日
- endTime 若沒說清楚填 null（JSON null，不是字串）
- location 若沒說清楚填 null（JSON null，不是字串）
- 取消時 time 若沒說清楚填 null
- 只回傳 JSON，不加任何文字
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    if (raw === 'null' || raw === '') return null;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error(`[ERROR] Gemini parse failed for text="${text}" error=${e.message}`);
    logEvent('error', 'gemini', `parse failed text="${text}" error=${e.message}`)
      .catch(logErr => console.error(`[ERROR] logEvent failed: ${logErr.message}`));
    return null;
  }
}

module.exports = { parseMessage };
