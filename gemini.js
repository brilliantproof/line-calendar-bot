const { GoogleGenerativeAI } = require('@google/generative-ai');

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
2. query（查詢行程）：詢問某段時間有什麼行程
3. cancel（取消行程）：要取消或刪除某個行程
4. null（與行程無關）

若訊息包含【多個行程】，每個行程各回傳一個物件，組成 JSON array。
若只有一個行程或意圖，回傳單一 JSON 物件。
與行程無關時，回傳 null。

回傳格式（純 JSON，不加任何說明）：

單一新增行程：
{"action":"create","title":"行程名稱","date":"YYYY-MM-DD","time":"HH:MM","endTime":"HH:MM","location":"地點或null"}

多個新增行程（array）：
[
  {"action":"create","title":"行程名稱","date":"YYYY-MM-DD","time":"HH:MM","endTime":"HH:MM","location":"地點或null"},
  {"action":"create","title":"行程名稱","date":"YYYY-MM-DD","time":"HH:MM","endTime":"HH:MM","location":"地點或null"}
]

查詢行程：
{"action":"query","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}

取消行程：
{"action":"cancel","title":"行程關鍵字","date":"YYYY-MM-DD","time":"HH:MM 或 null"}

無關：
null

注意：
- 「這週」= 本週一到週日
- 「今天」「明天」「後天」請換算成實際日期
- 「下週」= 下週一到週日
- 取消時 time 若沒說清楚填 null
- endTime 若沒說清楚，填 null（程式會自動加一小時）
- 只回傳 JSON，不加任何文字
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    if (raw === 'null' || raw === '') return null;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Gemini 解析失敗:', e.message);
    return null;
  }
}

module.exports = { parseMessage };
