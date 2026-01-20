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

# データディレクトリを作成
RUN mkdir -p /app/data

# ポートを公開
EXPOSE 3000

# アプリケーションを起動
CMD ["npm", "start"]
