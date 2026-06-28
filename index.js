require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { parseMessage } = require('./gemini');
const {
  getCalendarIdForContext,
  createCalendarForContext,
  getSubscribeLink,
  createCalendarEvent,
  getCalendarEvents,
  cancelCalendarEvent,
} = require('./calendar');

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
      console.error('[webhook] error:', err.message);
    }
  }
});

// 用戶第一次加 Bot 好友
async function handleFollow(event) {
  const userId = event.source.userId;
  await setupCalendar(userId, '我的行程', event.replyToken);
}

// Bot 被加入群組
async function handleJoin(event) {
  const groupId = event.source.groupId || event.source.roomId;
  await setupCalendar(groupId, '團隊行程', event.replyToken);
}

// 建立行事曆並傳送訂閱連結（新用戶/群組）
async function setupCalendar(contextId, calendarName, replyToken) {
  let calendarId = await getCalendarIdForContext(contextId);

  if (!calendarId) {
    calendarId = await createCalendarForContext(contextId, calendarName);
  }

  const link = getSubscribeLink(calendarId);
  await reply(replyToken,
    `你好！我是行程小幫手 📅\n\n` +
    `請點以下連結訂閱專屬行事曆（只需做一次）：\n${link}\n\n` +
    `訂閱後，跟我說任何行程，就會自動出現在你的 Google 行事曆裡。\n\n` +
    `試試看：「明天下午三點開會」`
  );
}

async function handleMessage(event) {
  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const contextId = event.source.groupId || event.source.roomId || event.source.userId;

  console.log(`[message] ${text}`);

  // 確認行事曆已設定
  let calendarId = await getCalendarIdForContext(contextId);
  if (!calendarId) {
    calendarId = await createCalendarForContext(contextId, '我的行程');
    const link = getSubscribeLink(calendarId);
    return reply(replyToken, `先幫你建好行事曆了！點這裡訂閱（只需一次）：\n${link}`);
  }

  // AI 判斷意圖
  const parsed = await parseMessage(text);
  if (!parsed) return;

  if (parsed.action === 'create') {
    await createCalendarEvent(parsed, calendarId);
    return reply(replyToken,
      `✅ 行程已建立！\n\n` +
      `📌 ${parsed.title}\n` +
      `📅 ${parsed.date} ${parsed.time}\n` +
      `📍 ${parsed.location || '未指定地點'}\n\n` +
      `請開啟 Google 行事曆查看。`
    );
  }

  if (parsed.action === 'query') {
    const events = await getCalendarEvents(calendarId, parsed.startDate, parsed.endDate);
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
    const deleted = await cancelCalendarEvent(calendarId, parsed.title, parsed.date, parsed.time);
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
