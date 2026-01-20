/**
 * データベース管理（SQLite）
 * 着信履歴とブロックリストを管理
 */

const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * データベースを初期化
 */
function initDatabase() {
  const dbPath = path.join(__dirname, '../../data/phone_lookup.db');

  // データディレクトリを作成
  const fs = require('fs');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // テーブルを作成
  createTables();

  console.log('Database initialized');
  return db;
}

/**
 * テーブルを作成
 */
function createTables() {
  // 着信履歴テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS call_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      company_name TEXT,
      spam_score INTEGER DEFAULT 0,
      category TEXT,
      slack_message_ts TEXT,
      slack_channel TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ブロックリスト
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT UNIQUE NOT NULL,
      reason TEXT,
      added_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 手動登録した企業情報
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      category TEXT,
      notes TEXT,
      added_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // インデックスを作成
  db.exec(`CREATE INDEX IF NOT EXISTS idx_call_history_phone ON call_history(phone_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blocklist_phone ON blocklist(phone_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_phone ON company_registry(phone_number)`);
}

/**
 * 着信履歴を保存
 */
function saveCallHistory(phoneNumber, lookupResult, slackInfo) {
  const stmt = db.prepare(`
    INSERT INTO call_history (phone_number, company_name, spam_score, category, slack_message_ts, slack_channel)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return stmt.run(
    phoneNumber,
    lookupResult.companyName,
    lookupResult.spamScore,
    lookupResult.category,
    slackInfo.messageTs,
    slackInfo.channel
  );
}

/**
 * 電話番号の着信履歴を取得
 */
function getCallHistory(phoneNumber, limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM call_history
    WHERE phone_number = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return stmt.all(phoneNumber, limit);
}

/**
 * ブロックリストに追加
 */
function addToBlocklist(phoneNumber, reason, addedBy) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO blocklist (phone_number, reason, added_by)
    VALUES (?, ?, ?)
  `);

  return stmt.run(phoneNumber, reason, addedBy);
}

/**
 * ブロックリストをチェック
 */
function isBlocked(phoneNumber) {
  const stmt = db.prepare(`
    SELECT * FROM blocklist WHERE phone_number = ?
  `);

  return stmt.get(phoneNumber);
}

/**
 * 企業情報を手動登録
 */
function registerCompany(phoneNumber, companyName, category, notes, addedBy) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO company_registry (phone_number, company_name, category, notes, added_by, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  return stmt.run(phoneNumber, companyName, category, notes, addedBy);
}

/**
 * 登録済み企業情報を取得
 */
function getRegisteredCompany(phoneNumber) {
  const stmt = db.prepare(`
    SELECT * FROM company_registry WHERE phone_number = ?
  `);

  return stmt.get(phoneNumber);
}

/**
 * 統計情報を取得
 */
function getStats() {
  const totalCalls = db.prepare('SELECT COUNT(*) as count FROM call_history').get();
  const blockedNumbers = db.prepare('SELECT COUNT(*) as count FROM blocklist').get();
  const registeredCompanies = db.prepare('SELECT COUNT(*) as count FROM company_registry').get();
  const topSpamCalls = db.prepare(`
    SELECT phone_number, company_name, spam_score, COUNT(*) as call_count
    FROM call_history
    WHERE spam_score >= 7
    GROUP BY phone_number
    ORDER BY call_count DESC
    LIMIT 10
  `).all();

  return {
    totalCalls: totalCalls.count,
    blockedNumbers: blockedNumbers.count,
    registeredCompanies: registeredCompanies.count,
    topSpamCalls
  };
}

module.exports = {
  initDatabase,
  saveCallHistory,
  getCallHistory,
  addToBlocklist,
  isBlocked,
  registerCompany,
  getRegisteredCompany,
  getStats
};
