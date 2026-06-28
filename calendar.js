const { google } = require('googleapis');
const fs = require('fs');

function getAuth(scopes) {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    : JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
  return new google.auth.GoogleAuth({ credentials, scopes });
}

// ── Google Sheets 當資料庫 ──────────────────────────────
const SHEET_ID = process.env.SHEET_ID;
const SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth(SHEET_SCOPES) });
}

async function addUserEmail(userId, email) {
  const sheets = await getSheetsClient();
  // 先讀取現有資料，避免重複
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A:B',
  });
  const rows = res.data.values || [];
  const exists = rows.some(row => row[0] === userId);
  if (exists) {
    // 更新現有的
    const rowIndex = rows.findIndex(row => row[0] === userId) + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `B${rowIndex}`,
      valueInputOption: 'RAW',
      resource: { values: [[email]] },
    });
  } else {
    // 新增一列
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

// ── Google Calendar ────────────────────────────────────
async function createCalendarEvent(parsed, attendeeEmails) {
  const calendar = google.calendar({
    version: 'v3',
    auth: getAuth(['https://www.googleapis.com/auth/calendar']),
  });

  const startDateTime = `${parsed.date}T${parsed.time}:00+08:00`;
  const endDateTime = `${parsed.date}T${parsed.endTime}:00+08:00`;

  const description = attendeeEmails.length > 0
    ? `參與成員：\n${attendeeEmails.join('\n')}`
    : '';

  const event = {
    summary: parsed.title,
    location: parsed.location || '',
    description,
    start: { dateTime: startDateTime, timeZone: 'Asia/Taipei' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Taipei' },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };

  const response = await calendar.events.insert({
    calendarId: process.env.CALENDAR_ID || 'primary',
    resource: event,
  });

  return response.data.htmlLink;
}

module.exports = { createCalendarEvent, addUserEmail, getUserEmails };
