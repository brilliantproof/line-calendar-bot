const { google } = require('googleapis');
const fs = require('fs');

function getAuth(scopes) {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    : JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  return new google.auth.GoogleAuth({ credentials, scopes });
}

function addOneHour(time) {
  const [h, m] = time.split(':').map(Number);
  const endH = (h + 1) % 24;
  return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toStringOrNull(val) {
  if (!val || val === 'null') return null;
  return val;
}

// Google Sheets：userId → email
const SHEET_ID = process.env.SHEET_ID;
const SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth(SHEET_SCOPES) });
}

async function addUserEmail(userId, email) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A:B',
  });
  const rows = res.data.values || [];
  const exists = rows.some(row => row[0] === userId);
  if (exists) {
    const rowIndex = rows.findIndex(row => row[0] === userId) + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `B${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[email]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'A:B',
      valueInputOption: 'RAW',
      resource: { values: [[userId, email]] },
    });
  }
}

async function getUserEmails() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'B:B',
  });
  const rows = res.data.values || [];
  return rows.map(r => r[0]).filter(Boolean);
}

// Google Sheets：筆記 raw log
const NOTES_SHEET = 'notes';

async function addNote(text, context, source) {
  const sheets = await getSheetsClient();
  const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${NOTES_SHEET}!A:E`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [[timestamp, text, context, '', source]] },
  });
}

async function getNotesToday(context) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${NOTES_SHEET}!A:E`,
  });
  const rows = (res.data.values || []).slice(1); // 跳過標題列
  const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  return rows.filter(row => row[0] && row[0].startsWith(todayStr) && row[2] === context);
}

// Google Sheets：部署自我回報，讓「線上目前是哪個 commit」變成可查詢的紀錄
const DEPLOYS_SHEET = 'deploys';

async function recordDeploy() {
  const sheets = await getSheetsClient();
  const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  const commitSha = process.env.RENDER_GIT_COMMIT || 'local';
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${DEPLOYS_SHEET}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [[timestamp, commitSha, process.env.NODE_ENV || 'production']] },
  });
}

// Google Sheets：執行期錯誤紀錄，不再只留在 Render 的即時 log 串流裡
const LOGS_SHEET = 'logs';

async function logEvent(level, context, message) {
  const sheets = await getSheetsClient();
  const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${LOGS_SHEET}!A:D`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [[timestamp, level, context, message]] },
  });
}

// Google Calendar
function getSubscribeLink(calendarId) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`;
}

async function createCalendarEvent(parsed, attendeeEmails) {
  const calendar = google.calendar({
    version: 'v3',
    auth: getAuth(['https://www.googleapis.com/auth/calendar']),
  });

  const startDateTime = `${parsed.date}T${parsed.time}:00+08:00`;
  const endTime = toStringOrNull(parsed.endTime) || addOneHour(parsed.time);
  const endDateTime = `${parsed.date}T${endTime}:00+08:00`;
  const location = toStringOrNull(parsed.location) || '';

  const description = attendeeEmails.length > 0
    ? `參與成員：\n${attendeeEmails.join('\n')}`
    : '';

  const response = await calendar.events.insert({
    calendarId: process.env.CALENDAR_ID || 'primary',
    resource: {
      summary: parsed.title,
      location,
      description,
      start: { dateTime: startDateTime, timeZone: 'Asia/Taipei' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Taipei' },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }],
      },
    },
  });

  return response.data.htmlLink;
}

async function getCalendarEvents(startDate, endDate) {
  const calendar = google.calendar({
    version: 'v3',
    auth: getAuth(['https://www.googleapis.com/auth/calendar']),
  });

  const response = await calendar.events.list({
    calendarId: process.env.CALENDAR_ID || 'primary',
    timeMin: new Date(`${startDate}T00:00:00+08:00`).toISOString(),
    timeMax: new Date(`${endDate}T23:59:59+08:00`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

async function cancelCalendarEvent(title, date, time) {
  const calendar = google.calendar({
    version: 'v3',
    auth: getAuth(['https://www.googleapis.com/auth/calendar']),
  });

  const response = await calendar.events.list({
    calendarId: process.env.CALENDAR_ID || 'primary',
    timeMin: new Date(`${date}T00:00:00+08:00`).toISOString(),
    timeMax: new Date(`${date}T23:59:59+08:00`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];
  const keyword = title.toLowerCase();

  const matched = events.filter(e => {
    const nameMatch = e.summary && e.summary.toLowerCase().includes(keyword);
    if (!time) return nameMatch;
    const eventTime = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
      : null;
    return nameMatch && (!eventTime || eventTime === time);
  });

  if (matched.length === 0) return null;

  await calendar.events.delete({
    calendarId: process.env.CALENDAR_ID || 'primary',
    eventId: matched[0].id,
  });

  return matched[0].summary;
}

module.exports = { createCalendarEvent, addUserEmail, getUserEmails, getCalendarEvents, cancelCalendarEvent, getSubscribeLink, addNote, recordDeploy, logEvent, getNotesToday };
