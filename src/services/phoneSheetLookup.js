const { normalizePhoneNumber } = require('../utils/phoneParser');
const { initSheetsClient } = require('./googleSheets');

const DEFAULT_SHEET_ID = process.env.PHONE_DB_SHEET_ID || '1ijBHI5EaxsO6kmlPqwnYon5-Z5P7ez9_xsi-Dmhfm8Y';
const DEFAULT_SHEET_NAME = process.env.PHONE_DB_SHEET_NAME || 'DB';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached = {
  fetchedAt: 0,
  data: null
};

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
    range: `${sheetName}!A:F`,
  });

  const rows = response.data.values || [];
  const header = rows[0] || [];
  const dataRows = rows.slice(1);

  const phoneIndex = header.indexOf('電話番号') !== -1 ? header.indexOf('電話番号') : 0;
  const nameIndex = header.indexOf('会社名') !== -1 ? header.indexOf('会社名') : 1;
  const categoryIndex = header.indexOf('カテゴリ') !== -1 ? header.indexOf('カテゴリ') : 2;
  const countIndex = header.indexOf('荷電回数') !== -1 ? header.indexOf('荷電回数') : 3;
  const lastCallDateIndex = header.indexOf('最新荷電日') !== -1 ? header.indexOf('最新荷電日') : 4;
  const responderIndex = header.indexOf('対応者') !== -1 ? header.indexOf('対応者') : 5;

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
      lastCallDate: cols[lastCallDateIndex] ? String(cols[lastCallDateIndex]).trim() : null,
      responder: cols[responderIndex] ? String(cols[responderIndex]).trim() : null
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

function clearCache() {
  cached = {
    fetchedAt: 0,
    data: null
  };
  console.log('Sheet cache cleared');
}

module.exports = {
  lookupPhone,
  clearCache
};
