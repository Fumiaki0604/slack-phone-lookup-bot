/**
 * データベース管理（sql.js - 純粋JavaScript実装のSQLite）
 * 着信履歴とブロックリストを管理
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db = null;
let dbPath = null;

/**
 * データベースを初期化
 */
async function initDatabase() {
  const SQL = await initSqlJs();
  dbPath = path.join(__dirname, '../../data/phone_lookup.db');

  // データディレクトリを作成
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 既存のデータベースファイルを読み込むか、新規作成
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // テーブルを作成
  createTables();

  console.log('Database initialized');
  return db;
}

/**
 * データベースをファイルに保存
 */
function saveDatabase() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * テーブルを作成
 */
function createTables() {
  // 着信履歴テーブル
  db.run(`
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
  db.run(`
    CREATE TABLE IF NOT EXISTS blocklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT UNIQUE NOT NULL,
      reason TEXT,
      added_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 手動登録した企業情報
  db.run(`
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_call_history_phone ON call_history(phone_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_blocklist_phone ON blocklist(phone_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_company_phone ON company_registry(phone_number)`);

  saveDatabase();
}

/**
 * 着信履歴を保存
 */
function saveCallHistory(phoneNumber, lookupResult, slackInfo) {
  // spamScoreがnullの場合は-1として保存（不明を表す）
  const spamScore = lookupResult.spamScore !== null ? lookupResult.spamScore : -1;

  db.run(`
    INSERT INTO call_history (phone_number, company_name, spam_score, category, slack_message_ts, slack_channel)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    phoneNumber,
    lookupResult.companyName || null,
    spamScore,
    lookupResult.category || null,
    slackInfo.messageTs || null,
    slackInfo.channel || null
  ]);

  saveDatabase();
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
  stmt.bind([phoneNumber, limit]);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * ブロックリストに追加
 */
function addToBlocklist(phoneNumber, reason, addedBy) {
  // 既存のエントリを削除してから挿入（REPLACE相当）
  db.run(`DELETE FROM blocklist WHERE phone_number = ?`, [phoneNumber]);
  db.run(`
    INSERT INTO blocklist (phone_number, reason, added_by)
    VALUES (?, ?, ?)
  `, [phoneNumber, reason, addedBy]);

  saveDatabase();
}

/**
 * ブロックリストをチェック
 */
function isBlocked(phoneNumber) {
  const stmt = db.prepare(`
    SELECT * FROM blocklist WHERE phone_number = ?
  `);
  stmt.bind([phoneNumber]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}

/**
 * 企業情報を手動登録
 */
function registerCompany(phoneNumber, companyName, category, notes, addedBy) {
  // 既存のエントリを削除してから挿入（REPLACE相当）
  db.run(`DELETE FROM company_registry WHERE phone_number = ?`, [phoneNumber]);
  db.run(`
    INSERT INTO company_registry (phone_number, company_name, category, notes, added_by, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [phoneNumber, companyName, category, notes, addedBy]);

  saveDatabase();
}

/**
 * 登録済み企業情報を取得
 */
function getRegisteredCompany(phoneNumber) {
  const stmt = db.prepare(`
    SELECT * FROM company_registry WHERE phone_number = ?
  `);
  stmt.bind([phoneNumber]);

  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();

  return result;
}

/**
 * 登録企業一覧を取得
 */
function getAllRegisteredCompanies() {
  const stmt = db.prepare(`
    SELECT * FROM company_registry
    ORDER BY created_at DESC
  `);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * 登録企業を削除
 */
function deleteRegisteredCompany(phoneNumber) {
  db.run(`DELETE FROM company_registry WHERE phone_number = ?`, [phoneNumber]);
  saveDatabase();
}

/**
 * ブロックリスト一覧を取得
 */
function getAllBlocklist() {
  const stmt = db.prepare(`
    SELECT * FROM blocklist
    ORDER BY created_at DESC
  `);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * ブロックリストから削除
 */
function removeFromBlocklist(phoneNumber) {
  db.run(`DELETE FROM blocklist WHERE phone_number = ?`, [phoneNumber]);
  saveDatabase();
}

/**
 * 最近の着信履歴を取得
 */
function getRecentCallHistory(limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM call_history
    ORDER BY created_at DESC
    LIMIT ?
  `);
  stmt.bind([limit]);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * 統計情報を取得
 */
function getStats() {
  const totalCallsStmt = db.prepare('SELECT COUNT(*) as count FROM call_history');
  totalCallsStmt.step();
  const totalCalls = totalCallsStmt.getAsObject().count;
  totalCallsStmt.free();

  const blockedStmt = db.prepare('SELECT COUNT(*) as count FROM blocklist');
  blockedStmt.step();
  const blockedNumbers = blockedStmt.getAsObject().count;
  blockedStmt.free();

  const registeredStmt = db.prepare('SELECT COUNT(*) as count FROM company_registry');
  registeredStmt.step();
  const registeredCompanies = registeredStmt.getAsObject().count;
  registeredStmt.free();

  const topSpamStmt = db.prepare(`
    SELECT phone_number, company_name, spam_score, COUNT(*) as call_count
    FROM call_history
    WHERE spam_score >= 7
    GROUP BY phone_number
    ORDER BY call_count DESC
    LIMIT 10
  `);

  const topSpamCalls = [];
  while (topSpamStmt.step()) {
    topSpamCalls.push(topSpamStmt.getAsObject());
  }
  topSpamStmt.free();

  return {
    totalCalls,
    blockedNumbers,
    registeredCompanies,
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
  getStats,
  getAllRegisteredCompanies,
  deleteRegisteredCompany,
  getAllBlocklist,
  removeFromBlocklist,
  getRecentCallHistory
};
