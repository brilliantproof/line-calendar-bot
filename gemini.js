const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
});

async function parseEvent(text) {
  const today = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Taipei'
  });

  const prompt = `
今天是 ${today}（台灣時間）。

分析以下訊息，判斷是否包含行程安排（時間、日期）。
如果是行程，回傳 JSON；如果不是，回傳 null。

訊息：「${text}」

回傳格式（純 JSON，不要加任何說明）：
{
  "title": "行程名稱",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "endTime": "HH:MM",
  "location": "地點或null"
}

注意：
- 如果沒有明確時間，time 填 "09:00"
- endTime 預設為 time 加 1 小時
- 如果不是行程，直接回傳 null（不要 JSON 格式）
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

module.exports = { parseEvent };
