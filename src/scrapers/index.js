/**
 * Phone number lookup using Google Sheets API (authenticated).
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { normalizePhoneNumber } = require('../utils/phoneParser');

const DEFAULT_SHEET_ID = '1ijBHI5EaxsO6kmlPqwnYon5-Z5P7ez9_xsi-Dmhfm8Y';
const DEFAULT_SHEET_GID = '1654711040';
const DEFAULT_SHEET_NAME = 'DB';
const CACHE_TTL_MS = 5 * 60 * 1000;

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ||
  path.join(__dirname, '..', '..', 'credentials.json');

let cached = {
  fetchedAt: 0,
  data: null
};

let sheetsClient = null;

/**
 * Initialize Google Sheets API client
 */
async function initSheetsClient() {
  if (sheetsClient) {
    return sheetsClient;
  }

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.warn(`Google credentials file not found at ${CREDENTIALS_PATH}`);
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('Google Sheets API (read) initialized');
    return sheetsClient;
  } catch (error) {
    console.error('Failed to initialize Google Sheets API:', error.message);
    return null;
  }
}

function deriveSpamScore(category) {
  if (!category) return null;
  if (String(category).includes('営業')) return 7;
  return 0;
}

async function getSheetData() {
  const now = Date.now();
  if (cached.data && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = await initSheetsClient();
  if (!client) {
    throw new Error('Google Sheets API not available');
  }

  const sheetId = process.env.PHONE_DB_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = process.env.PHONE_DB_SHEET_NAME || DEFAULT_SHEET_NAME;

  const response = await client.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:E`,
  });

  const rows = response.data.values || [];
  const header = rows[0] || [];
  const dataRows = rows.slice(1);

  // Find column indices
  const phoneIndex = header.indexOf('電話番号') !== -1 ? header.indexOf('電話番号') : 0;
  const nameIndex = header.indexOf('会社名') !== -1 ? header.indexOf('会社名') : 1;
  const categoryIndex = header.indexOf('カテゴリ') !== -1 ? header.indexOf('カテゴリ') : 2;
  const countIndex = header.indexOf('荷電回数') !== -1 ? header.indexOf('荷電回数') : 3;
  const lastCallDateIndex = header.indexOf('最新荷電日') !== -1 ? header.indexOf('最新荷電日') : 4;

  const byPhone = new Map();

  dataRows.forEach(cols => {
    const rawPhone = cols[phoneIndex] || '';
    if (!rawPhone) return;
    const normalized = normalizePhoneNumber(String(rawPhone).trim());
    const digitsOnly = normalized.replace(/-/g, '');

    const record = {
      phoneNumber: normalized,
      companyName: cols[nameIndex] ? String(cols[nameIndex]).trim() : null,
      category: cols[categoryIndex] ? String(cols[categoryIndex]).trim() : null,
      callCount: cols[countIndex] ? Number(cols[countIndex]) : null,
      lastCallDate: cols[lastCallDateIndex] ? String(cols[lastCallDateIndex]).trim() : null
    };

    byPhone.set(normalized, record);
    byPhone.set(digitsOnly, record);
  });

  cached = {
    fetchedAt: now,
    data: { byPhone }
  };

  console.log(`Loaded ${dataRows.length} phone records from sheet`);
  return cached.data;
}

/**
 * Look up a phone number in the Google Sheet.
 * @param {string} phoneNumber - Phone number to lookup.
 * @returns {Promise<Object>} - Lookup result.
 */
async function lookupPhone(phoneNumber) {
  console.log(`Looking up phone number: ${phoneNumber}`);

  const normalized = normalizePhoneNumber(phoneNumber);
  const digitsOnly = normalized.replace(/-/g, '');

  const data = await getSheetData();
  const record = data.byPhone.get(normalized) || data.byPhone.get(digitsOnly);

  if (!record) {
    return {
      phoneNumber,
      found: false,
      sources: [],
      companyName: null,
      category: null,
      spamScore: null,
      hasComments: false,
      commentCount: 0,
      tags: [],
      comments: [],
      details: { sheet: null }
    };
  }

  return {
    phoneNumber,
    found: true,
    sources: ['sheet'],
    companyName: record.companyName || null,
    category: record.category || null,
    spamScore: deriveSpamScore(record.category),
    hasComments: false,
    commentCount: 0,
    tags: [],
    comments: [],
    details: { sheet: record }
  };
}

/**
 * スパムスコアに基づいて絵文字を返す
 */
function getSpamEmoji(spamScore) {
  if (spamScore === null) return ':white_circle:';
  if (spamScore >= 7) return ':red_circle:';
  if (spamScore >= 4) return ':yellow_circle:';
  return ':green_circle:';
}

/**
 * スパムスコアの説明を返す
 */
function getSpamDescription(spamScore) {
  if (spamScore === null) return '口コミがないため不明';
  if (spamScore >= 7) return '営業電話の可能性が高いです';
  if (spamScore >= 4) return '営業電話の可能性があります';
  return '特に問題の報告はありません';
}

/**
 * キャッシュをクリアして次回のlookupで最新データを取得
 */
function clearCache() {
  cached = {
    fetchedAt: 0,
    data: null
  };
  console.log('Sheet cache cleared');
}

module.exports = {
  lookupPhone,
  getSpamEmoji,
  getSpamDescription,
  clearCache
};
