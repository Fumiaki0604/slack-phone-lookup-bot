/**
 * Google Sheets API サービス
 * スプレッドシートへの書き込み機能を提供
 */

const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// 認証情報のパスまたはJSON文字列
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ||
  path.join(__dirname, '..', '..', 'credentials.json');
const CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON; // 環境変数からJSON文字列を取得

// スプレッドシート設定
const DEFAULT_SHEET_ID = process.env.PHONE_DB_SHEET_ID || '1ijBHI5EaxsO6kmlPqwnYon5-Z5P7ez9_xsi-Dmhfm8Y';
const DEFAULT_SHEET_NAME = process.env.PHONE_DB_SHEET_NAME || 'DB';
const EMPLOYEE_SHEET_NAME = process.env.EMPLOYEE_SHEET_NAME || '社員';

// 社員名簿キャッシュ
let employeeCache = {
  fetchedAt: 0,
  data: null
};
const EMPLOYEE_CACHE_TTL_MS = 10 * 60 * 1000; // 10分

let sheetsClient = null;

/**
 * Google Sheets APIクライアントを初期化
 */
async function initSheetsClient() {
  if (sheetsClient) {
    return sheetsClient;
  }

  try {
    let auth;

    // 環境変数にJSON文字列がある場合はそれを使用
    if (CREDENTIALS_JSON) {
      const credentials = JSON.parse(CREDENTIALS_JSON);
      auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      console.log('Using Google credentials from environment variable');
    }
    // それ以外はファイルパスから読み込み
    else if (fs.existsSync(CREDENTIALS_PATH)) {
      auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      console.log('Using Google credentials from file');
    }
    else {
      console.warn('Google credentials not found (neither GOOGLE_CREDENTIALS_JSON nor file)');
      console.warn('Sheet write functionality will be disabled.');
      return null;
    }

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('Google Sheets API initialized');
    return sheetsClient;
  } catch (error) {
    console.error('Failed to initialize Google Sheets API:', error.message);
    return null;
  }
}

/**
 * 未登録の電話番号をスプレッドシートに追加
 * @param {string} phoneNumber - 追加する電話番号
 * @param {string} companyName - 会社名（空白可）
 * @param {string} category - カテゴリ（空白可）
 * @returns {Promise<boolean>} - 成功したらtrue
 */
async function addPhoneNumber(phoneNumber, companyName = '', category = '') {
  const client = await initSheetsClient();
  if (!client) {
    console.warn('Google Sheets client not available. Skipping phone number registration.');
    return false;
  }

  try {
    const sheetId = process.env.PHONE_DB_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.PHONE_DB_SHEET_NAME || DEFAULT_SHEET_NAME;

    // 新しい行を追加（電話番号, 会社名, カテゴリ, 荷電回数=1）
    const values = [[phoneNumber, companyName, category, 1]];

    await client.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: values,
      },
    });

    console.log(`Added phone number to sheet: ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error('Failed to add phone number to sheet:', error.message);
    return false;
  }
}

/**
 * 電話番号の荷電回数を更新（インクリメント）
 * @param {string} phoneNumber - 更新する電話番号
 * @param {number} currentCount - 現在の荷電回数
 * @returns {Promise<boolean>} - 成功したらtrue
 */
async function incrementCallCount(phoneNumber, currentCount) {
  const client = await initSheetsClient();
  if (!client) {
    return false;
  }

  try {
    const sheetId = process.env.PHONE_DB_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.PHONE_DB_SHEET_NAME || DEFAULT_SHEET_NAME;

    // まず電話番号の行を検索
    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:D`,
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    // 電話番号を正規化して比較
    const normalizedTarget = phoneNumber.replace(/-/g, '');

    for (let i = 0; i < rows.length; i++) {
      const cellPhone = (rows[i][0] || '').replace(/-/g, '');
      if (cellPhone === normalizedTarget) {
        rowIndex = i + 1; // 1-indexed
        break;
      }
    }

    if (rowIndex === -1) {
      console.log(`Phone number not found in sheet for update: ${phoneNumber}`);
      return false;
    }

    // 荷電回数を更新（D列）
    const newCount = (currentCount || 0) + 1;
    await client.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[newCount]],
      },
    });

    console.log(`Updated call count for ${phoneNumber}: ${newCount}`);
    return true;
  } catch (error) {
    console.error('Failed to update call count:', error.message);
    return false;
  }
}

/**
 * Google Sheets APIが利用可能かどうか
 */
function isAvailable() {
  return CREDENTIALS_JSON || fs.existsSync(CREDENTIALS_PATH);
}

/**
 * 社員名簿を取得
 * スプレッドシートの「社員」シートから社員情報を取得
 * 列構成: A=名前, B=読み（ひらがな）, C=SlackユーザーID
 * @returns {Promise<Array>} - 社員リスト [{ name, reading, slackUserId }]
 */
async function getEmployees() {
  const now = Date.now();
  if (employeeCache.data && now - employeeCache.fetchedAt < EMPLOYEE_CACHE_TTL_MS) {
    return employeeCache.data;
  }

  const client = await initSheetsClient();
  if (!client) {
    console.warn('Google Sheets client not available. Cannot fetch employees.');
    return [];
  }

  try {
    const sheetId = process.env.PHONE_DB_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.EMPLOYEE_SHEET_NAME || EMPLOYEE_SHEET_NAME;

    const response = await client.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:C`,
    });

    const rows = response.data.values || [];
    // ヘッダー行をスキップ
    const dataRows = rows.slice(1);

    const employees = dataRows
      .filter(row => row[0] && row[2]) // 名前とSlackIDが必須
      .map(row => ({
        name: String(row[0]).trim(),
        reading: row[1] ? String(row[1]).trim() : '',
        slackUserId: String(row[2]).trim(),
      }));

    employeeCache = {
      fetchedAt: now,
      data: employees
    };

    console.log(`Loaded ${employees.length} employees from sheet`);
    return employees;
  } catch (error) {
    console.error('Failed to fetch employees:', error.message);
    return [];
  }
}

/**
 * 名前から社員を検索
 * @param {string} name - 検索する名前（ひらがな）
 * @returns {Promise<Object|null>} - 一致した社員 or null
 */
async function findEmployeeByName(name) {
  const results = await findEmployeesByName(name);
  return results.length > 0 ? results[0] : null;
}

/**
 * 社員名簿から名前で検索（複数人対応）
 * 同じ苗字が複数いる場合は全員返す
 */
async function findEmployeesByName(name) {
  if (!name) return [];

  const employees = await getEmployees();
  const normalizedName = name.toLowerCase().trim();

  // 完全一致を優先
  const exactMatches = employees.filter(e =>
    e.reading.toLowerCase() === normalizedName ||
    e.name.toLowerCase() === normalizedName
  );

  if (exactMatches.length > 0) return exactMatches;

  // 部分一致（名前が含まれている場合）
  const partialMatches = employees.filter(e =>
    e.reading.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(e.reading.toLowerCase()) ||
    e.name.toLowerCase().includes(normalizedName) ||
    normalizedName.includes(e.name.toLowerCase())
  );

  return partialMatches;
}

/**
 * 社員名簿キャッシュをクリア
 */
function clearEmployeeCache() {
  employeeCache = {
    fetchedAt: 0,
    data: null
  };
  console.log('Employee cache cleared');
}

module.exports = {
  initSheetsClient,
  addPhoneNumber,
  incrementCallCount,
  isAvailable,
  getEmployees,
  findEmployeeByName,
  findEmployeesByName,
  clearEmployeeCache,
};
