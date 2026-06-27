require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { parseEvent } = require('./gemini');
const { createCalendarEvent, addUserEmail, getUserEmails } = require('./calendar');

const app = express();

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  res.status(200).end();
  const events = req.body.events || [];
  console.log(`[webhook] received ${events.length} event(s)`);

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    try {
      await handleMessage(event);
    } catch (err) {
      console.error('[webhook] failed to handle message:', err);
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
    if (!email.includes('@')) {
      return reply(replyToken, '格式錯誤，請輸入：/register your@gmail.com');
    }
    await addUserEmail(userId, email);
    return reply(replyToken, `已登記 ${email}，之後建立行程時會邀請你！`);
  }

  // 指令：查看已登記成員
  if (text === '/members') {
    const emails = await getUserEmails(groupId);
    if (emails.length === 0) return reply(replyToken, '目前沒有人登記 email，請輸入 /register your@gmail.com');
    return reply(replyToken, `已登記成員：\n${emails.join('\n')}`);
  }

  // 解析行程
  const parsed = await parseEvent(text);
  if (!parsed) {
    console.log('[message] no calendar event detected');
    return reply(replyToken, '我還沒讀到明確的日期或時間。請試試：「明天下午 3 點和王小明開會」');
  }

  console.log('[calendar] parsed event:', parsed);

  try {
    const emails = await getUserEmails(groupId || userId);
    const calendarLink = await createCalendarEvent(parsed, emails);

    const attendeeInfo = emails.length > 0
      ? `👥 已邀請 ${emails.length} 位成員`
      : '（尚未有人登記 email，輸入 /register your@gmail.com 來加入邀請）';

    await reply(replyToken,
      `✅ 行程已建立！\n\n` +
      `📌 ${parsed.title}\n` +
      `📅 ${parsed.date} ${parsed.time}\n` +
      `📍 ${parsed.location || '未指定地點'}\n` +
      `${attendeeInfo}\n\n` +
      `🔗 ${calendarLink}`
    );
  } catch (err) {
    console.error('[calendar] create event failed:', err);
    await reply(replyToken, '行程建立失敗，請稍後再試。');
  }
}

async function reply(replyToken, text) {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  } catch (err) {
    console.error('[line] reply failed:', err.message);
    if (err.body) console.error('[line] reply body:', err.body);
    throw err;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
