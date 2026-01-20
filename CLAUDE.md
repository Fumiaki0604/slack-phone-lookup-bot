# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slack電話番号検索Bot - Fondeskなどからの着信通知をSlackで受け取った際、自動的に電話番号の発信元を検索して営業電話かどうかを判定するSlackボット。

## Commands

```bash
# Install dependencies
npm install

# Start the bot
npm start

# Development mode (auto-restart with nodemon)
npm run dev
```

## Architecture

### Data Flow
1. Slackチャンネルにメッセージが投稿される
2. `src/index.js`のmessageイベントハンドラが電話番号を検出
3. `src/utils/phoneParser.js`で電話番号を抽出・正規化
4. `src/scrapers/index.js`が複数ソースに並列でスクレイピングを実行
5. 結果を統合し、スパムスコアを計算
6. スレッドに検索結果を返信、履歴をDBに保存

### Key Modules

- **src/index.js**: Slack Boltアプリのエントリーポイント。メッセージイベント処理とスラッシュコマンド（`/phone-register`, `/phone-block`, `/phone-stats`）を定義
- **src/scrapers/**: jpnumber.comと電話帳ナビからの情報取得。`index.js`が両スクレイパーを統合し、スパムスコアは最大値を採用
- **src/database/db.js**: SQLite (better-sqlite3)。着信履歴(call_history)、ブロックリスト(blocklist)、企業登録(company_registry)の3テーブル
- **src/utils/phoneParser.js**: 日本の電話番号パターン検出、ハイフン正規化、種別判定（IP電話/携帯/フリーダイヤル/固定）

### Spam Score System
- 0-3: 🟢 安全
- 4-6: 🟡 要注意
- 7-10: 🔴 営業電話の可能性大（元メッセージに⚠️リアクション付与）

## Environment Variables

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...  # Socket Mode用
SLACK_SOCKET_MODE=true    # ローカル開発時はtrue
PORT=3000
```

## Dependencies

- `@slack/bolt`: Slack Bot Framework
- `axios` + `cheerio`: Webスクレイピング
- `better-sqlite3`: SQLiteデータベース
- `dotenv`: 環境変数読み込み
