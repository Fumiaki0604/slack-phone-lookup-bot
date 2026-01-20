# Slack 電話番号検索Bot

Fondeskなどからの着信通知をSlackで受け取った際、自動的に電話番号の発信元を検索して営業電話かどうかを判定するSlackボットです。

## 機能

### 🔍 自動検索
- Slackに投稿された電話番号を自動検出
- jpnumber.com、電話帳ナビから情報をスクレイピング
- スレッドに検索結果を自動返信

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
```

### 5. ボットの起動

```bash
npm start
```

開発モード（自動再起動）:
```bash
npm run dev
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
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**: `.env`の内容を設定
   - `SLACK_SOCKET_MODE=false` に変更（公開URLを使用）

5. デプロイ後、RenderのURLをSlackのEvent SubscriptionsのRequest URLに設定

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

## 注意事項

- スクレイピングは無料のWebサイトから情報を取得しています
- サイトの仕様変更により動作しなくなる可能性があります
- 過度なリクエストを避けるため、検索結果はキャッシュされます
- ブロックリストと登録企業情報はSQLiteデータベースに保存されます

## トラブルシューティング

### ボットがメッセージに反応しない
1. Slackアプリの権限を確認
2. Event Subscriptionsが有効か確認
3. ボットがチャンネルに招待されているか確認

### スクレイピングエラー
- 検索サイトが一時的にダウンしている可能性
- ネットワーク接続を確認

### データベースエラー
- `data/`ディレクトリの書き込み権限を確認

## ライセンス

MIT

## 貢献

プルリクエストやイシューの報告を歓迎します！
