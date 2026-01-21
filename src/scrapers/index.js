/**
 * Phone number lookup using a public Google Sheet (CSV export).
 */

const axios = require('axios');
const { normalizePhoneNumber } = require('../utils/phoneParser');

const DEFAULT_SHEET_ID = '1ijBHI5EaxsO6kmlPqwnYon5-Z5P7ez9_xsi-Dmhfm8Y';
const DEFAULT_SHEET_GID = '1654711040';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached = {
  fetchedAt: 0,
  data: null
};

function getSheetUrl() {
  const sheetId = process.env.PHONE_DB_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetGid = process.env.PHONE_DB_SHEET_GID || DEFAULT_SHEET_GID;
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field);
      field = '';

      if (char !== ',') {
        rows.push(row);
        row = [];
      }
      continue;
    }

    field += char;
  }

  row.push(field);
  rows.push(row);

  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

function getColumnIndex(header, name, fallback) {
  const idx = header.indexOf(name);
  return idx === -1 ? fallback : idx;
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

  const url = getSheetUrl();
  const response = await axios.get(url, { timeout: 10000 });
  const rows = parseCsv(response.data);
  const header = rows[0] || [];
  const dataRows = rows.slice(1);

  const phoneIndex = getColumnIndex(header, '電話番号', 0);
  const nameIndex = getColumnIndex(header, '会社名', 1);
  const categoryIndex = getColumnIndex(header, 'カテゴリ', 2);
  const countIndex = getColumnIndex(header, '荷電回数', 3);

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
      callCount: cols[countIndex] ? Number(cols[countIndex]) : null
    };

    byPhone.set(normalized, record);
    byPhone.set(digitsOnly, record);
  });

  cached = {
    fetchedAt: now,
    data: { byPhone }
  };

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
 * @param {number|null} spamScore - スパムスコア (0-10) または null (不明)
 * @returns {string} - 絵文字
 */
function getSpamEmoji(spamScore) {
  if (spamScore === null) return ':white_circle:';
  if (spamScore >= 7) return ':red_circle:';
  if (spamScore >= 4) return ':yellow_circle:';
  return ':green_circle:';
}

/**
 * スパムスコアの説明を返す
 * @param {number|null} spamScore - スパムスコア (0-10) または null (不明)
 * @returns {string} - 説明文
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