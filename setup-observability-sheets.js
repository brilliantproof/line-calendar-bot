require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function setup() {
  const credentials = JSON.parse(fs.readFileSync('./calendar-bot-key.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const sheetId = process.env.SHEET_ID;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    resource: {
      requests: [
        { addSheet: { properties: { title: 'deploys' } } },
        { addSheet: { properties: { title: 'logs' } } },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'deploys!A1:C1',
    valueInputOption: 'RAW',
    resource: { values: [['timestamp', 'commit_sha', 'node_env']] },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'logs!A1:D1',
    valueInputOption: 'RAW',
    resource: { values: [['timestamp', 'level', 'context', 'message']] },
  });

  console.log('已在既有 Sheet（SHEET_ID=' + sheetId + '）新增 deploys 與 logs 分頁');
}

setup().catch(console.error);
