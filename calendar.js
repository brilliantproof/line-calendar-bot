const { google } = require('googleapis');
const fs = require('fs');

const CAL_SCOPES = ['https://www.googleapis.com/auth/calendar'];
const SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth(scopes) {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    : JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  return new google.auth.GoogleAuth({ credentials, scopes });
}

function getCalClient() {
  return google.calendar({ version: 'v3', auth: getAuth(CAL_SCOPES) });
}

// ── Google Sheets：存 contextId → calendarId ──────────────
async function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth(SHEET_SCOPES) });
}

async function getCalendarIdForContext(contextId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'A:B',
  });
  const rows = res.data.values || [];
  const row = rows.find(r => r[0] === contextId);
  return row ? row[1] : null;
}

async function saveCalendarIdForContext(contextId, calendarId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'A:B',
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === contextId);
  if (rowIndex >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `B${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: { values: [[calendarId]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'A:B',
      valueInputOption: 'RAW',
      resource: { values: [[contextId, calendarId]] },
    });
  }
}

// ── 建立新行事曆 ────────────────────────────────────────
async function createCalendarForContext(contextId, name) {
  const calendar = getCalClient();
  const cal = await calendar.calendars.insert({
    resource: { summary: name, timeZone: 'Asia/Taipei' },
  });
  const calendarId = cal.data.id;
  await saveCalendarIdForContext(contextId, calendarId);
  return calendarId;
}

function getSubscribeLink(calendarId) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`;
}

// ── 行事曆 CRUD ─────────────────────────────────────────
async function createCalendarEvent(parsed, calendarId) {
  const calendar = getCalClient();
  const startDateTime = `${parsed.date}T${parsed.time}:00+08:00`;
  const endDateTime = `${parsed.date}T${parsed.endTime}:00+08:00`;

  const response = await calendar.events.insert({
    calendarId,
    resource: {
      summary: parsed.title,
      location: parsed.location || '',
      start: { dateTime: startDateTime, timeZone: 'Asia/Taipei' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Taipei' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
    },
  });
  return response.data.htmlLink;
}

async function getCalendarEvents(calendarId, startDate, endDate) {
  const calendar = getCalClient();
  const response = await calendar.events.list({
    calendarId,
    timeMin: new Date(`${startDate}T00:00:00+08:00`).toISOString(),
    timeMax: new Date(`${endDate}T23:59:59+08:00`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });
  return response.data.items || [];
}

async function cancelCalendarEvent(calendarId, title, date, time) {
  const calendar = getCalClient();
  const response = await calendar.events.list({
    calendarId,
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
  await calendar.events.delete({ calendarId, eventId: matched[0].id });
  return matched[0].summary;
}

module.exports = {
  getCalendarIdForContext,
  createCalendarForContext,
  getSubscribeLink,
  createCalendarEvent,
  getCalendarEvents,
  cancelCalendarEvent,
};
