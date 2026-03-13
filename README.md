# Slack 電話番号検索Bot

Fondeskなどからの着信通知をSlackで受け取った際、自動的に電話番号の発信元を検索して営業電話かどうかを判定するSlackボットです。

## 機能

### 🔍 自動検索
- Slackに投稿された電話番号を自動検出（ユーザー・ボットアプリ問わず）
- Fondeskなどのボットアプリからの着信通知にも自動対応
- Google Sheetsから電話番号データを取得（5分間キャッシュ）
- jpnumber.comから補助情報を取得
- スレッドに検索結果を自動返信
- 未登録番号は自動的にスプレッドシートに追加（荷電回数=1）
- 既存番号は荷電回数を自動インクリメント＋最新荷電日を更新
- 返信に前回荷電日と間隔を表示

### 🔔 自動メンション
- 録音テキストをClaude APIで解析し、宛先社員にメンション
- 顧客系カテゴリかつF列（対応者）が設定されている場合、前回対応者にメンション
- 録音宛先とF列が同一人物 → F列優先（同姓複数問題を回避）
- 録音宛先とF列が異なる人物 → 録音優先
- 同姓の社員が複数いる場合は全員にメンション

### 🚨 営業電話判定
- スパムスコア（0-10）で営業電話の可能性を表示
- 🟢 安全 / 🟡 要注意 / 🔴 営業電話の可能性大
- 過去のユーザーコメントから自動判定

### 💾 データベース管理
- 着信履歴の自動保存
- ブロックリスト機能
- 手動で企業情報を登録可能

### 📊 統計情報
- 総着信数、ブロック数の確認
- 営業電話ランキング

## セットアップ

### 1. Slackアプリの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From scratch」を選択
3. アプリ名とワークスペースを設定

### 2. Slack アプリの設定

#### OAuth & Permissions
以下のBot Token Scopesを追加:
- `chat:write`
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `reactions:write`
- `commands`

#### Event Subscriptions
- Enable Events をオン
- Subscribe to bot events:
  - `message.channels`
  - `message.groups`
  - `message.im`
  - `message.mpim`

#### Socket Mode（推奨：ローカル開発用）
- Enable Socket Mode をオン
- App-Level Token を生成（`connections:write`権限）

#### Slash Commands
以下のコマンドを追加:
- `/phone-register` - 企業情報を手動登録
- `/phone-block` - 電話番号をブロックリストに追加
- `/phone-stats` - 統計情報を表示

### 3. アプリのインストール

```bash
cd C:\dev\slack-phone-lookup-bot
npm install
```

### 4. 環境変数の設定

`.env.example` を `.env` にコピーして、Slackのトークンを設定:

```bash
cp .env.example .env
```

`.env` ファイルを編集:
```env
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SOCKET_MODE=true
PORT=3000
ADMIN_PORT=3001
PHONE_DB_SHEET_ID=your-spreadsheet-id-here
PHONE_DB_SHEET_GID=0
PHONE_DB_SHEET_NAME=DB
EMPLOYEE_SHEET_NAME=社員
GOOGLE_CREDENTIALS_PATH=./credentials.json
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

**Google認証情報の設定:**
- ローカル環境: `credentials.json`ファイルをプロジェクトルートに配置
- クラウド環境（Render等）: 環境変数`GOOGLE_CREDENTIALS_JSON`にcredentials.jsonの内容をJSON文字列として設定

### 5. ボットの起動

```bash
npm start
```

開発モード（自動再起動）:
```bash
npm run dev
```

**PM2による常時稼働（推奨）:**
```bash
npm install -g pm2
pm2 start src/index.js --name slack-bot
pm2 save
```

Windows自動起動:
```bash
npm install -g pm2-windows-startup
pm2-startup install
```

## 使い方

### 自動検索
Slackチャンネルに電話番号を含むメッセージを投稿すると、自動的に検索結果がスレッドに返信されます。

例:
```
atojに 050-3642-3776 から着信がありました。
```

ボットが自動的に:
1. 電話番号を検出
2. 発信元を検索
3. 営業電話スコアを計算
4. スレッドに結果を投稿

### スラッシュコマンド

#### 企業情報を登録
```
/phone-register 050-1234-5678 株式会社テスト 取引先 いつもお世話になっている会社
```

#### ブロックリストに追加
```
/phone-block 050-9999-9999 しつこい営業電話
```

#### 統計情報を表示
```
/phone-stats
```

## プロジェクト構成

```
slack-phone-lookup-bot/
├── src/
│   ├── index.js              # メインファイル
│   ├── database/
│   │   └── db.js             # データベース管理
│   ├── scrapers/
│   │   ├── index.js          # スクレイパー統合
│   │   ├── jpnumber.js       # jpnumber.comスクレイパー
│   │   └── telNaviScraper.js # 電話帳ナビスクレイパー
│   └── utils/
│       └── phoneParser.js    # 電話番号パーサー
├── data/                     # SQLiteデータベース（自動生成）
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## デプロイ

### Render.comへのデプロイ

1. [Render.com](https://render.com) でアカウント作成
2. 「New Web Service」を選択
3. GitHubリポジトリを接続
4. 以下の設定:
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Region**: Singapore（日本に近い）
   - **Instance Type**: Free

5. 環境変数を設定（以下を追加）:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_SOCKET_MODE=false
   PORT=3000
   ADMIN_PORT=3001
   PHONE_DB_SHEET_ID=...
   PHONE_DB_SHEET_GID=0
   PHONE_DB_SHEET_NAME=DB
   EMPLOYEE_SHEET_NAME=社員
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
   ```
   **重要**: `GOOGLE_CREDENTIALS_JSON`はcredentials.jsonの内容を1行のJSON文字列として設定
   **重要**: `SLACK_APP_TOKEN`は不要（HTTP Modeのため）

6. デプロイ完了後、Renderから提供されるURL（例: `https://your-app.onrender.com`）を確認

7. SlackアプリのEvent Subscriptionsを設定:
   - https://api.slack.com/apps でアプリを選択
   - 「Event Subscriptions」→「Enable Events」をON
   - Request URLに `https://your-app.onrender.com/slack/events` を入力
   - Verified表示を確認
   - 「Save Changes」をクリック

**注意**: Render無料プランは15分間リクエストがないとスリープします。次のリクエスト時に起動（30秒〜1分遅延）。常時起動が必要な場合は有料プラン（$7/月〜）を検討してください。

### Herokuへのデプロイ

1. `Procfile`を作成（既に含まれています）
2. Heroku CLIでデプロイ:

```bash
heroku create your-app-name
heroku config:set SLACK_BOT_TOKEN=xoxb-...
heroku config:set SLACK_SIGNING_SECRET=...
heroku config:set SLACK_SOCKET_MODE=false
git push heroku main
```

## アーキテクチャ

### データフロー
1. Slackチャンネルにメッセージが投稿される
2. `src/index.js`のmessageイベントハンドラが電話番号を検出
3. `src/utils/phoneParser.js`で電話番号を抽出・正規化
4. `src/scrapers/index.js`がGoogle Sheetsから電話番号データを検索（5分間キャッシュ）
5. 未登録番号は自動的にスプレッドシートに追加
6. スレッドに検索結果を返信、履歴をDBに保存
7. 録音テキストがある場合、Claude APIで宛先を解析し該当社員にメンション

### 主要モジュール
- **src/index.js**: Slack Boltアプリのエントリーポイント。メッセージイベント処理、スラッシュコマンド、録音解析・メンション機能
- **src/scrapers/index.js**: Google Sheets API（サービスアカウント認証）から電話番号データを取得。キャッシュ機能付き
- **src/scrapers/jpnumber.js**: jpnumber.comからの補助情報取得（口コミ・スパムスコア）
- **src/services/googleSheets.js**: Google Sheets API。未登録番号の自動追加、社員名簿の取得
- **src/services/claude.js**: Claude APIで録音テキストから宛先（ひらがな姓）を抽出
- **src/database/db.js**: sql.js (WebAssembly SQLite)。着信履歴・ブロックリスト・企業登録の3テーブル
- **src/utils/phoneParser.js**: 日本の電話番号パターン検出、ハイフン正規化
- **src/admin/server.js**: Express管理パネル（PORT 3001）

### スパムスコア
- 0-3: 安全
- 4-6: 要注意
- 7-10: 営業電話の可能性大（元メッセージに⚠️リアクション付与）
- null: 口コミがないため不明

### Google Sheets構成

#### 電話番号シート（DB）
列: A=電話番号, B=会社名, C=カテゴリ, D=荷電回数, E=最新荷電日, F=対応者

- **カテゴリ**に「顧客」を含む場合、F列の対応者に自動メンション
- **F列（対応者）**: 前回対応したスタッフ名（社員シートの名前と一致させる）

#### 社員シート（社員）
列: A=名前, B=読み（ひらがな）, C=SlackユーザーID

## 注意事項

- Google Sheetsから電話番号データを取得しています
- 過度なリクエストを避けるため、検索結果はキャッシュされます
- ブロックリストと登録企業情報はSQLiteデータベースに保存されます

## トラブルシューティング

### ボットがメッセージに反応しない
1. Slackアプリの権限を確認（OAuth & Permissionsで必要な権限が付与されているか）
2. Event Subscriptionsが有効か確認
3. ボットがチャンネルに招待されているか確認（`/invite @ボット名`）
4. Fondeskなど他のボットからのメッセージの場合:
   - ボット自身のメッセージは処理対象外ですが、Fondeskなど他のボットアプリは処理します
   - ログを確認して電話番号が検出されているか確認してください

### スクレイピングエラー
- 検索サイトが一時的にダウンしている可能性
- ネットワーク接続を確認

### データベースエラー
- `data/`ディレクトリの書き込み権限を確認

## ライセンス

MIT

## 貢献

プルリクエストやイシューの報告を歓迎します！
