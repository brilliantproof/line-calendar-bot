require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { parseMessage } = require('./gemini');
const { createCalendarEvent, addUserEmail, getUserEmails, getCalendarEvents, cancelCalendarEvent } = require('./calendar');

const app = express();

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.status(200).end();
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    try {
      await handleMessage(event);
    } catch (err) {
      console.error('[webhook] error:', err.message);
    }
  }
});

async function handleMessage(event) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId || null;

  console.log(`[message] ${text}`);

  // 指令：登記 email
  if (text.startsWith('/register ')) {
    const email = text.replace('/register ', '').trim();
    if (!email.includes('@')) return reply(replyToken, '格式錯誤，請輸入：/register your@gmail.com');
    await addUserEmail(userId, email);
    return reply(replyToken, `已登記 ${email}，之後建立行程時會記錄你！`);
  }

  // 指令：查看已登記成員
  if (text === '/members') {
    const emails = await getUserEmails();
    if (emails.length === 0) return reply(replyToken, '目前沒有人登記 email，請輸入 /register your@gmail.com');
    return reply(replyToken, `已登記成員：\n${emails.join('\n')}`);
  }

  // AI 判斷意圖
  const parsed = await parseMessage(text);
  if (!parsed) return;

  if (parsed.action === 'create') {
    const emails = await getUserEmails();
    await createCalendarEvent(parsed, emails);
    const attendeeInfo = emails.length > 0
      ? `👥 ${emails.length} 位成員已記錄`
      : '（尚未有人登記 email，輸入 /register your@gmail.com）';
    return reply(replyToken,
      `✅ 行程已建立！\n\n📌 ${parsed.title}\n📅 ${parsed.date} ${parsed.time}\n📍 ${parsed.location || '未指定地點'}\n${attendeeInfo}\n\n請開啟 Google 行事曆查看。`
    );
  }

  if (parsed.action === 'query') {
    const events = await getCalendarEvents(parsed.startDate, parsed.endDate);
    if (events.length === 0) return reply(replyToken, `📅 ${parsed.startDate} ~ ${parsed.endDate} 沒有任何行程。`);
    const list = events.map(e => {
      const time = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
        : e.start?.date;
      return `• ${time} ${e.summary}`;
    }).join('\n');
    return reply(replyToken, `📅 行程列表：\n\n${list}`);
  }

  if (parsed.action === 'cancel') {
    const deleted = await cancelCalendarEvent(parsed.title, parsed.date, parsed.time);
    if (!deleted) return reply(replyToken, `找不到符合的行程：「${parsed.title}」（${parsed.date}）`);
    return reply(replyToken, `🗑️ 已取消行程：${deleted}`);
  }
}

async function reply(replyToken, text) {
  try {
    await client.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
  } catch (err) {
    console.error('[line] reply failed:', err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
