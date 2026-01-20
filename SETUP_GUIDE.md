# Slackアプリ セットアップガイド

このガイドでは、Slackアプリの作成から設定まで、ステップバイステップで説明します。

## 1. Slackアプリの作成

### 1-1. アプリを作成
1. https://api.slack.com/apps にアクセス
2. 「**Create New App**」をクリック
3. 「**From scratch**」を選択
4. 以下を入力:
   - **App Name**: `電話番号検索Bot`（任意の名前）
   - **Pick a workspace**: 使用するワークスペースを選択
5. 「**Create App**」をクリック

## 2. Socket Modeの設定（ローカル開発用・推奨）

Socket Modeを使うと、公開URLなしでローカル開発が可能です。

### 2-1. Socket Modeを有効化
1. 左メニューから「**Socket Mode**」を選択
2. 「**Enable Socket Mode**」をONにする
3. トークン名を入力（例: `socket-token`）
4. 「**Generate**」をクリック
5. **生成されたトークン（xapp-で始まる）をコピー**して保存
   - これが `SLACK_APP_TOKEN` になります

## 3. 権限の設定

### 3-1. OAuth & Permissions
1. 左メニューから「**OAuth & Permissions**」を選択
2. 「**Scopes**」セクションまでスクロール
3. 「**Bot Token Scopes**」に以下を追加:
   - `chat:write` - メッセージを送信
   - `channels:history` - パブリックチャンネルのメッセージを読む
   - `groups:history` - プライベートチャンネルのメッセージを読む
   - `im:history` - DMのメッセージを読む
   - `mpim:history` - グループDMのメッセージを読む
   - `reactions:write` - リアクションを追加
   - `commands` - スラッシュコマンドを使用

### 3-2. ワークスペースにインストール
1. ページ上部の「**Install to Workspace**」をクリック
2. 権限を確認して「**許可する**」をクリック
3. **Bot User OAuth Token（xoxb-で始まる）をコピー**して保存
   - これが `SLACK_BOT_TOKEN` になります

## 4. イベントの設定

### 4-1. Event Subscriptions
1. 左メニューから「**Event Subscriptions**」を選択
2. 「**Enable Events**」をONにする
3. 「**Subscribe to bot events**」セクションで以下を追加:
   - `message.channels` - パブリックチャンネルのメッセージ
   - `message.groups` - プライベートチャンネルのメッセージ
   - `message.im` - DMのメッセージ
   - `message.mpim` - グループDMのメッセージ
4. 「**Save Changes**」をクリック

## 5. スラッシュコマンドの設定

### 5-1. コマンド1: /phone-register
1. 左メニューから「**Slash Commands**」を選択
2. 「**Create New Command**」をクリック
3. 以下を入力:
   - **Command**: `/phone-register`
   - **Short Description**: `企業情報を手動登録`
   - **Usage Hint**: `電話番号 企業名 [カテゴリ] [メモ]`
4. 「**Save**」をクリック

### 5-2. コマンド2: /phone-block
1. 「**Create New Command**」をクリック
2. 以下を入力:
   - **Command**: `/phone-block`
   - **Short Description**: `電話番号をブロックリストに追加`
   - **Usage Hint**: `電話番号 理由`
3. 「**Save**」をクリック

### 5-3. コマンド3: /phone-stats
1. 「**Create New Command**」をクリック
2. 以下を入力:
   - **Command**: `/phone-stats`
   - **Short Description**: `統計情報を表示`
   - **Usage Hint**: （空白）
3. 「**Save**」をクリック

## 6. Signing Secretの取得

1. 左メニューから「**Basic Information**」を選択
2. 「**App Credentials**」セクションを探す
3. **Signing Secret** の「**Show**」をクリック
4. **表示された値をコピー**して保存
   - これが `SLACK_SIGNING_SECRET` になります

## 7. 環境変数の設定

プロジェクトフォルダで`.env`ファイルを作成し、以下を記入:

```env
# Step 3-2 で取得したBot Token
SLACK_BOT_TOKEN=xoxb-your-bot-token-here

# Step 6 で取得したSigning Secret
SLACK_SIGNING_SECRET=your-signing-secret-here

# Step 2-1 で取得したApp Token（Socket Mode使用時のみ）
SLACK_APP_TOKEN=xapp-your-app-token-here

# Socket Modeを使用（ローカル開発の場合: true）
SLACK_SOCKET_MODE=true

# サーバーポート
PORT=3000
```

## 8. ボットの起動

### 8-1. 依存関係をインストール
```bash
cd C:\dev\slack-phone-lookup-bot
npm install
```

### 8-2. ボットを起動
```bash
npm start
```

成功すると以下のメッセージが表示されます:
```
⚡️ Slack Phone Lookup Bot is running on port 3000
```

## 9. ボットをチャンネルに招待

1. Slackで任意のチャンネルを開く
2. チャンネル名をクリック → 「インテグレーション」タブ
3. 「アプリを追加する」をクリック
4. 作成したボット（電話番号検索Bot）を選択

## 10. テスト

チャンネルに以下のメッセージを投稿してみてください:
```
050-3642-3776 から着信がありました
```

ボットがスレッドに検索結果を返信すれば成功です！

## 本番環境へのデプロイ（Render.com）

Socket Modeを使わない場合、公開URLが必要です。

### Render.comへのデプロイ手順:

1. GitHubにコードをプッシュ
2. https://render.com でアカウント作成
3. 「New Web Service」を選択
4. GitHubリポジトリを接続
5. 以下を設定:
   - **Name**: `slack-phone-bot`（任意）
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Environment Variablesに以下を追加:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_SOCKET_MODE=false
   PORT=3000
   ```
7. 「Create Web Service」をクリック
8. デプロイ完了後、RenderのURL（例: `https://your-app.onrender.com`）をコピー
9. Slack APIの「Event Subscriptions」に戻る
10. Request URLに `https://your-app.onrender.com/slack/events` を入力
11. 検証が成功すれば完了

## トラブルシューティング

### ボットが反応しない
- [ ] ボットがチャンネルに招待されているか確認
- [ ] Event Subscriptionsが有効になっているか確認
- [ ] 環境変数が正しく設定されているか確認
- [ ] ボットが起動しているか確認（ターミナルでエラーが出ていないか）

### Socket Mode接続エラー
- [ ] `SLACK_APP_TOKEN` が正しく設定されているか確認
- [ ] Socket Modeが有効になっているか確認

### スラッシュコマンドが動かない
- [ ] コマンドが正しく登録されているか確認（Slash Commandsページ）
- [ ] Socket Modeを使用している場合、Request URLの設定は不要

---

これでセットアップは完了です！質問があれば、READMEを参照してください。
