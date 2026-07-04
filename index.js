require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { parseMessage } = require('./gemini');
const { createCalendarEvent, addUserEmail, getUserEmails, getCalendarEvents, cancelCalendarEvent, getSubscribeLink } = require('./calendar');

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
  for (const event of req.body.events || []) {
    try {
      if (event.type === 'follow') await handleFollow(event);
      else if (event.type === 'join') await handleJoin(event);
      else if (event.type === 'message' && event.message.type === 'text') await handleMessage(event);
    } catch (err) {
      const ctx = event.source?.groupId || event.source?.userId || 'unknown';
      const msg = event.message?.text || '(non-text)';
      console.error(`[ERROR] ctx=${ctx} msg="${msg}" error=${err.message}`);
      console.error(err.stack);
    }
  }
});

async function handleFollow(event) {
  const link = getSubscribeLink(process.env.CALENDAR_ID);
  await reply(event.replyToken,
    '你好！我是行程小幫手 📅\n\n' +
    '請點以下連結訂閱共用行事曆（只需做一次）：\n' + link + '\n\n' +
    '訂閱後，跟我說任何行程，就會自動出現在你的 Google 行事曆裡。\n\n' +
    '也可以輸入 /register your@gmail.com 登記你的 email。\n\n' +
    '試試看：「明天下午三點開會」'
  );
}

async function handleJoin(event) {
  const link = getSubscribeLink(process.env.CALENDAR_ID);
  await reply(event.replyToken,
    '大家好！我是行程小幫手 📅\n\n' +
    '請每位成員點以下連結訂閱共用行事曆（每人只需做一次）：\n' + link + '\n\n' +
    '訂閱後，跟我說任何行程，就會自動出現在大家的 Google 行事曆裡。\n\n' +
    '試試看：「明天下午三點開會」'
  );
}

async function handleMessage(event) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const contextId = event.source.groupId || event.source.roomId || userId;

  console.log(`[msg] ctx=${contextId} text="${text}"`);

  if (text.startsWith('/register ')) {
    const email = text.replace('/register ', '').trim();
    if (!email.includes('@')) return reply(replyToken, '格式錯誤，請輸入：/register your@gmail.com');
    await addUserEmail(userId, email);
    return reply(replyToken, '已登記 ' + email + '，之後建立行程時會記錄你！');
  }

  if (text === '/members') {
    const emails = await getUserEmails();
    if (emails.length === 0) return reply(replyToken, '目前沒有人登記 email，請輸入 /register your@gmail.com');
    return reply(replyToken, '已登記成員：\n' + emails.join('\n'));
  }

  if (text === '/subscribe') {
    const link = getSubscribeLink(process.env.CALENDAR_ID);
    return reply(replyToken, '點這裡訂閱共用行事曆（只需一次）：\n' + link);
  }

  const parsed = await parseMessage(text);
  if (!parsed) {
    console.log(`[msg] ctx=${contextId} -> no action (unrelated or parse failed)`);
    return;
  }

  const actions = Array.isArray(parsed) ? parsed : [parsed];
  const first = actions[0];
  console.log(`[msg] ctx=${contextId} -> action=${first.action} count=${actions.length}`);

  if (first.action === 'need_info') {
    return reply(replyToken,
      '請告訴我行程的時間和內容！📅\n\n' +
      '例如：\n' +
      '「明天下午三點開會」\n' +
      '「週六上午十點到十二點 社子島導覽」'
    );
  }

  if (first.action === 'query') {
    const events = await getCalendarEvents(first.startDate, first.endDate);
    if (events.length === 0) return reply(replyToken, '📅 ' + first.startDate + ' ~ ' + first.endDate + ' 沒有任何行程。');
    const list = events.map(e => {
      const time = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
        : e.start?.date;
      return '• ' + time + ' ' + e.summary;
    }).join('\n');
    return reply(replyToken, '📅 行程列表：\n\n' + list);
  }

  if (first.action === 'cancel') {
    const deleted = await cancelCalendarEvent(first.title, first.date, first.time);
    if (!deleted) return reply(replyToken, '找不到符合的行程：「' + first.title + '」（' + first.date + '）');
    return reply(replyToken, '🗑️ 已取消行程：' + deleted);
  }

  if (actions.some(a => a.action === 'create')) {
    const emails = await getUserEmails();
    const attendeeInfo = emails.length > 0
      ? '👥 ' + emails.length + ' 位成員已記錄'
      : '（尚未有人登記 email，輸入 /register your@gmail.com）';

    const creates = actions.filter(a => a.action === 'create');
    const lines = [];
    for (const a of creates) {
      await createCalendarEvent(a, emails);
      lines.push('📌 ' + a.title + '\n📅 ' + a.date + ' ' + a.time + '\n📍 ' + (a.location || '未指定地點'));
    }

    const header = creates.length > 1 ? '✅ ' + creates.length + ' 個行程已建立！' : '✅ 行程已建立！';
    return reply(replyToken, header + '\n\n' + lines.join('\n\n') + '\n\n' + attendeeInfo + '\n\n請開啟 Google 行事曆查看。');
  }
}

async function reply(replyToken, text) {
  try {
    await client.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
  } catch (err) {
    console.error(`[ERROR] reply failed: ${err.message}`);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
