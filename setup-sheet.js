require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

async function setup() {
  const credentials = JSON.parse(fs.readFileSync('./calendar-bot-key.json', 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  // 建立 Sheet
  const sheet = await sheets.spreadsheets.create({
    resource: {
      properties: { title: 'LINE Bot 成員名單' },
      sheets: [{ properties: { title: 'members' } }],
    },
  });

  const sheetId = sheet.data.spreadsheetId;
  console.log('Sheet ID:', sheetId);

  // 加標題列
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'members!A1:B1',
    valueInputOption: 'RAW',
    resource: { values: [['userId', 'email']] },
  });

  // 分享給你的 Gmail
  await drive.permissions.create({
    fileId: sheetId,
    resource: { role: 'owner', type: 'user', emailAddress: 'brilliantproof@gmail.com' },
    transferOwnership: true,
  });

  console.log('已分享給 brilliantproof@gmail.com');
  console.log('\n請把以下這行加入 .env 和 Render 環境變數：');
  console.log(`SHEET_ID=${sheetId}`);
}

setup().catch(console.error);
