/**
 * Web管理画面サーバー
 */

const express = require('express');
const path = require('path');
const db = require('../database/db');

const router = express.Router();

// 静的ファイル
router.use(express.static(path.join(__dirname, 'public')));
router.use(express.json());

// 管理画面のHTMLを返す
router.get('/', (req, res) => {
  res.send(getAdminHTML());
});

// API: 登録企業一覧を取得
router.get('/api/companies', (req, res) => {
  try {
    const companies = db.getAllRegisteredCompanies();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 企業を登録
router.post('/api/companies', (req, res) => {
  try {
    const { phoneNumber, companyName, category, notes } = req.body;
    if (!phoneNumber || !companyName) {
      return res.status(400).json({ error: '電話番号と企業名は必須です' });
    }
    db.registerCompany(phoneNumber, companyName, category, notes, 'admin');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 企業を削除
router.delete('/api/companies/:phoneNumber', (req, res) => {
  try {
    const { phoneNumber } = req.params;
    db.deleteRegisteredCompany(phoneNumber);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: ブロックリスト一覧を取得
router.get('/api/blocklist', (req, res) => {
  try {
    const blocklist = db.getAllBlocklist();
    res.json(blocklist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: ブロックリストに追加
router.post('/api/blocklist', (req, res) => {
  try {
    const { phoneNumber, reason } = req.body;
    if (!phoneNumber || !reason) {
      return res.status(400).json({ error: '電話番号と理由は必須です' });
    }
    db.addToBlocklist(phoneNumber, reason, 'admin');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: ブロックリストから削除
router.delete('/api/blocklist/:phoneNumber', (req, res) => {
  try {
    const { phoneNumber } = req.params;
    db.removeFromBlocklist(phoneNumber);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 着信履歴を取得
router.get('/api/history', (req, res) => {
  try {
    const history = db.getRecentCallHistory(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 統計情報を取得
router.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>電話番号検索Bot 管理画面</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; margin-bottom: 20px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; background: #fff; border: none; cursor: pointer; border-radius: 5px; font-size: 14px; }
    .tab.active { background: #4CAF50; color: white; }
    .panel { display: none; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .panel.active { display: block; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-card h3 { font-size: 24px; color: #4CAF50; }
    .stat-card p { color: #666; font-size: 12px; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
    .form-group input, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
    .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; }
    .btn-primary { background: #4CAF50; color: white; }
    .btn-danger { background: #f44336; color: white; }
    .btn:hover { opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: bold; }
    tr:hover { background: #f5f5f5; }
    .delete-btn { color: #f44336; cursor: pointer; border: none; background: none; }
    .message { padding: 10px; border-radius: 5px; margin-bottom: 15px; }
    .message.success { background: #d4edda; color: #155724; }
    .message.error { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📞 電話番号検索Bot 管理画面</h1>

    <div class="tabs">
      <button class="tab active" onclick="showPanel('stats')">📊 統計</button>
      <button class="tab" onclick="showPanel('companies')">🏢 企業登録</button>
      <button class="tab" onclick="showPanel('blocklist')">🚫 ブロックリスト</button>
      <button class="tab" onclick="showPanel('history')">📋 着信履歴</button>
    </div>

    <!-- 統計パネル -->
    <div id="stats" class="panel active">
      <div class="stats" id="statsCards"></div>
    </div>

    <!-- 企業登録パネル -->
    <div id="companies" class="panel">
      <h2>企業を登録</h2>
      <div id="companyMessage"></div>
      <form id="companyForm" onsubmit="addCompany(event)">
        <div class="form-group">
          <label>電話番号</label>
          <input type="text" id="companyPhone" placeholder="050-1234-5678" required>
        </div>
        <div class="form-group">
          <label>企業名</label>
          <input type="text" id="companyName" placeholder="株式会社〇〇" required>
        </div>
        <div class="form-group">
          <label>カテゴリ</label>
          <input type="text" id="companyCategory" placeholder="取引先、営業など">
        </div>
        <div class="form-group">
          <label>メモ</label>
          <textarea id="companyNotes" rows="2" placeholder="備考"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">登録</button>
      </form>
      <table id="companiesTable">
        <thead><tr><th>電話番号</th><th>企業名</th><th>カテゴリ</th><th>メモ</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- ブロックリストパネル -->
    <div id="blocklist" class="panel">
      <h2>ブロックリストに追加</h2>
      <div id="blockMessage"></div>
      <form id="blockForm" onsubmit="addBlock(event)">
        <div class="form-group">
          <label>電話番号</label>
          <input type="text" id="blockPhone" placeholder="050-1234-5678" required>
        </div>
        <div class="form-group">
          <label>ブロック理由</label>
          <input type="text" id="blockReason" placeholder="しつこい営業電話" required>
        </div>
        <button type="submit" class="btn btn-danger">ブロックに追加</button>
      </form>
      <table id="blocklistTable">
        <thead><tr><th>電話番号</th><th>理由</th><th>登録日</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- 着信履歴パネル -->
    <div id="history" class="panel">
      <h2>最近の着信履歴</h2>
      <table id="historyTable">
        <thead><tr><th>日時</th><th>電話番号</th><th>企業名</th><th>スパムスコア</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <script>
    function showPanel(panelId) {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(panelId).classList.add('active');
      event.target.classList.add('active');
      loadData();
    }

    async function loadData() {
      // 統計
      const stats = await fetch('/admin/api/stats').then(r => r.json());
      document.getElementById('statsCards').innerHTML = \`
        <div class="stat-card"><h3>\${stats.totalCalls}</h3><p>総着信数</p></div>
        <div class="stat-card"><h3>\${stats.registeredCompanies}</h3><p>登録企業数</p></div>
        <div class="stat-card"><h3>\${stats.blockedNumbers}</h3><p>ブロック数</p></div>
      \`;

      // 企業一覧
      const companies = await fetch('/admin/api/companies').then(r => r.json());
      document.querySelector('#companiesTable tbody').innerHTML = companies.map(c => \`
        <tr>
          <td>\${c.phone_number}</td>
          <td>\${c.company_name}</td>
          <td>\${c.category || '-'}</td>
          <td>\${c.notes || '-'}</td>
          <td><button class="delete-btn" onclick="deleteCompany('\${c.phone_number}')">🗑️</button></td>
        </tr>
      \`).join('');

      // ブロックリスト
      const blocklist = await fetch('/admin/api/blocklist').then(r => r.json());
      document.querySelector('#blocklistTable tbody').innerHTML = blocklist.map(b => \`
        <tr>
          <td>\${b.phone_number}</td>
          <td>\${b.reason}</td>
          <td>\${new Date(b.created_at).toLocaleDateString('ja-JP')}</td>
          <td><button class="delete-btn" onclick="deleteBlock('\${b.phone_number}')">🗑️</button></td>
        </tr>
      \`).join('');

      // 着信履歴
      const history = await fetch('/admin/api/history').then(r => r.json());
      document.querySelector('#historyTable tbody').innerHTML = history.map(h => \`
        <tr>
          <td>\${new Date(h.created_at).toLocaleString('ja-JP')}</td>
          <td>\${h.phone_number}</td>
          <td>\${h.company_name || '-'}</td>
          <td>\${h.spam_score}/10</td>
        </tr>
      \`).join('');
    }

    async function addCompany(e) {
      e.preventDefault();
      const data = {
        phoneNumber: document.getElementById('companyPhone').value,
        companyName: document.getElementById('companyName').value,
        category: document.getElementById('companyCategory').value,
        notes: document.getElementById('companyNotes').value
      };
      const res = await fetch('/admin/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showMessage('companyMessage', '登録しました', 'success');
        document.getElementById('companyForm').reset();
        loadData();
      } else {
        const err = await res.json();
        showMessage('companyMessage', err.error, 'error');
      }
    }

    async function deleteCompany(phone) {
      if (!confirm('削除しますか？')) return;
      await fetch('/admin/api/companies/' + encodeURIComponent(phone), { method: 'DELETE' });
      loadData();
    }

    async function addBlock(e) {
      e.preventDefault();
      const data = {
        phoneNumber: document.getElementById('blockPhone').value,
        reason: document.getElementById('blockReason').value
      };
      const res = await fetch('/admin/api/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showMessage('blockMessage', 'ブロックリストに追加しました', 'success');
        document.getElementById('blockForm').reset();
        loadData();
      } else {
        const err = await res.json();
        showMessage('blockMessage', err.error, 'error');
      }
    }

    async function deleteBlock(phone) {
      if (!confirm('削除しますか？')) return;
      await fetch('/admin/api/blocklist/' + encodeURIComponent(phone), { method: 'DELETE' });
      loadData();
    }

    function showMessage(id, text, type) {
      const el = document.getElementById(id);
      el.className = 'message ' + type;
      el.textContent = text;
      setTimeout(() => el.textContent = '', 3000);
    }

    loadData();
  </script>
</body>
</html>`;
}

module.exports = router;
