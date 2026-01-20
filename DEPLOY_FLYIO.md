# Fly.io デプロイガイド

Fly.ioを使って、Slackボットを無料で24時間365日稼働させる手順です。

## Fly.ioの特徴

- ✅ **3つのアプリまで完全無料**（256MB RAM × 3）
- ✅ **スリープしない**（常時稼働）
- ✅ **複数アプリをホスティング可能**（無料枠内）
- ✅ **日本リージョン対応**（低レイテンシ）
- ⚠️ クレジットカード登録が必要（無料枠内なら請求されない）

---

## 1. Fly.io アカウント作成

### 1-1. サインアップ
1. https://fly.io にアクセス
2. 「**Sign Up**」をクリック
3. メールアドレスとパスワードを入力して登録
4. メールアドレスを確認

### 1-2. クレジットカード登録
1. ダッシュボードにログイン
2. クレジットカード情報を入力
   - **無料枠内なら請求されません**
   - 無料枠を超える前に警告が来ます

---

## 2. Fly.io CLIのインストール

### Windows (PowerShell)
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### インストール確認
```bash
fly version
```

### ログイン
```bash
fly auth login
```

ブラウザが開くので、ログインを承認してください。

---

## 3. プロジェクトの準備

### 3-1. Dockerfileを作成

プロジェクトフォルダに `Dockerfile` を作成します：

```dockerfile
# Node.js 18を使用
FROM node:18-alpine

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production

# アプリケーションファイルをコピー
COPY . .

# ポートを公開
EXPOSE 3000

# アプリケーションを起動
CMD ["npm", "start"]
```

### 3-2. .dockerignoreを作成

不要なファイルをDockerイメージから除外：

```
node_modules
npm-debug.log
.env
.git
.gitignore
data/
*.db
*.db-shm
*.db-wal
README.md
SETUP_GUIDE.md
```

---

## 4. Fly.ioアプリの作成

### 4-1. アプリを初期化

```bash
cd C:\dev\slack-phone-lookup-bot
fly launch
```

対話式の質問に答えます：

```
? Choose an app name (leave blank to generate one): slack-phone-bot
? Choose a region for deployment: Tokyo, Japan (nrt)
? Would you like to set up a Postgresql database now? No
? Would you like to set up an Upstash Redis database now? No
? Would you like to deploy now? No
```

これで `fly.toml` ファイルが生成されます。

### 4-2. fly.tomlを編集

生成された `fly.toml` を以下のように修正：

```toml
app = "slack-phone-bot"
primary_region = "nrt"

[build]

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = false
  min_machines_running = 1

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

**重要ポイント：**
- `auto_stop_machines = false` → スリープしない
- `min_machines_running = 1` → 常に1台稼働
- `memory = '256mb'` → 無料枠内

---

## 5. 環境変数の設定

Slackの認証情報を設定します：

```bash
fly secrets set SLACK_BOT_TOKEN="xoxb-your-bot-token-here"
fly secrets set SLACK_SIGNING_SECRET="your-signing-secret-here"
fly secrets set SLACK_SOCKET_MODE="false"
```

**注意**: Socket ModeはFly.ioでは使えないので `false` に設定します。

### 環境変数の確認
```bash
fly secrets list
```

---

## 6. デプロイ

### 6-1. 初回デプロイ
```bash
fly deploy
```

デプロイには数分かかります。完了すると以下のように表示されます：

```
--> v0 deployed successfully
```

### 6-2. デプロイ後のURL取得
```bash
fly status
```

または

```bash
fly open
```

表示されたURL（例: `https://slack-phone-bot.fly.dev`）をコピーします。

---

## 7. Slack側の設定変更

### 7-1. Socket Modeを無効化
1. https://api.slack.com/apps にアクセス
2. アプリを選択
3. 「**Socket Mode**」→ **OFF**に変更

### 7-2. Event Subscriptions の Request URLを設定
1. 「**Event Subscriptions**」を選択
2. 「**Enable Events**」がONになっていることを確認
3. **Request URL** に以下を入力：
   ```
   https://your-app-name.fly.dev/slack/events
   ```
   例: `https://slack-phone-bot.fly.dev/slack/events`
4. URLが検証されて ✅ **Verified** と表示されればOK
5. 「**Save Changes**」をクリック

### 7-3. Slash Commandsの設定
各スラッシュコマンドの **Request URL** を設定：

1. 「**Slash Commands**」を選択
2. 各コマンドを編集して、Request URLに以下を設定：
   ```
   https://your-app-name.fly.dev/slack/events
   ```
3. 保存

---

## 8. 動作確認

### 8-1. ログを確認
```bash
fly logs
```

リアルタイムでログが表示されます。

### 8-2. Slackでテスト
Slackチャンネルで電話番号を含むメッセージを投稿：

```
050-3642-3776 から着信がありました
```

ボットが反応すれば成功です！

---

## 9. 運用コマンド

### アプリの状態を確認
```bash
fly status
```

### ログを確認（リアルタイム）
```bash
fly logs
```

### アプリを再起動
```bash
fly apps restart slack-phone-bot
```

### SSH接続（デバッグ用）
```bash
fly ssh console
```

### 環境変数を更新
```bash
fly secrets set KEY="value"
```

### アプリを停止（課金を止める）
```bash
fly scale count 0
```

### アプリを再開
```bash
fly scale count 1
```

---

## 10. データベースの永続化（オプション）

現在、SQLiteデータベースは `/app/data/` に保存されていますが、コンテナが再起動するとデータが消えます。

### データを永続化する方法

#### オプション1: Fly.io Volumes（推奨）

```bash
# ボリュームを作成（1GB）
fly volumes create phone_data --region nrt --size 1

# fly.tomlに追加
```

`fly.toml` に以下を追加：

```toml
[[mounts]]
  source = "phone_data"
  destination = "/app/data"
```

再デプロイ：

```bash
fly deploy
```

これで、データベースがコンテナ再起動後も保持されます。

#### オプション2: 外部データベースを使う

より本格的に運用する場合：
- Fly.io PostgreSQL（有料）
- Supabase（無料枠あり）
- PlanetScale（無料枠あり）

---

## 11. コスト管理

### 無料枠の確認
```bash
fly billing show
```

### 現在の使用量
Fly.ioダッシュボード: https://fly.io/dashboard

**無料枠：**
- 3つのVM（shared-cpu-1x, 256MB RAM）
- 160GB転送量/月
- このボット程度なら **完全無料**

---

## 12. トラブルシューティング

### デプロイが失敗する
```bash
# ログを確認
fly logs

# ビルドログを詳細表示
fly deploy --verbose
```

### Slack Event URLの検証が失敗する
- アプリが起動しているか確認: `fly status`
- ログを確認: `fly logs`
- 環境変数が正しいか確認: `fly secrets list`

### アプリがクラッシュする
```bash
# ログを確認
fly logs

# アプリを再起動
fly apps restart slack-phone-bot
```

### データベースが初期化されない
- ボリュームがマウントされているか確認
- `data/` ディレクトリの書き込み権限を確認

---

## 13. 更新・再デプロイ

コードを修正した後：

```bash
# 変更をコミット（Gitを使っている場合）
git add .
git commit -m "Update bot"

# 再デプロイ
fly deploy
```

自動的に新しいバージョンがデプロイされます。

---

## まとめ

✅ **Fly.ioなら完全無料で24時間稼働**
✅ **複数アプリを同じアカウントで管理可能**
✅ **スリープなし、即座に反応**

これで、社内PCをサーバー代わりにする必要なく、安定して運用できます！

---

## 参考リンク

- Fly.io公式ドキュメント: https://fly.io/docs/
- Fly.io Dashboard: https://fly.io/dashboard
- Fly.io料金: https://fly.io/docs/about/pricing/
