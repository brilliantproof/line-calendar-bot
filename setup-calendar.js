require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function setup() {
  const credentials = JSON.parse(fs.readFileSync('./calendar-bot-key.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // 建立新行事曆
  const cal = await calendar.calendars.insert({
    resource: {
      summary: '團隊行程',
      timeZone: 'Asia/Taipei',
    },
  });

  const calendarId = cal.data.id;
  console.log('行事曆 ID:', calendarId);

  // 分享給你的 Gmail
  await calendar.acl.insert({
    calendarId,
    resource: {
      role: 'owner',
      scope: { type: 'user', value: 'brilliantproof@gmail.com' },
    },
  });

  console.log('已分享給 brilliantproof@gmail.com');
  console.log('\n請把以下這行加入 .env 檔案：');
  console.log(`CALENDAR_ID=${calendarId}`);
}

setup().catch(console.error);
