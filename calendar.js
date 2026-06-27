const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// 簡單用 JSON 檔案存 email（小規模夠用）
const DB_PATH = path.join(__dirname, 'users.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

async function addUserEmail(userId, email) {
  const db = loadDB();
  db[userId] = email;
  saveDB(db);
}

async function getUserEmails(contextId) {
  const db = loadDB();
  return Object.values(db);
}

function getCalendarClient() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

async function createCalendarEvent(parsed, attendeeEmails) {
  const calendar = getCalendarClient();

  const startDateTime = `${parsed.date}T${parsed.time}:00+08:00`;
  const endDateTime = `${parsed.date}T${parsed.endTime}:00+08:00`;

  const attendees = attendeeEmails.map(email => ({ email }));

  const event = {
    summary: parsed.title,
    location: parsed.location || '',
    start: { dateTime: startDateTime, timeZone: 'Asia/Taipei' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Taipei' },
    attendees,
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };

  const response = await calendar.events.insert({
    calendarId: process.env.CALENDAR_ID || 'primary',
    resource: event,
    sendUpdates: 'all',
  });

  return response.data.htmlLink;
}

module.exports = { createCalendarEvent, addUserEmail, getUserEmails };
