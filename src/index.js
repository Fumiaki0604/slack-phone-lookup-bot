/**
 * Slack電話番号検索Bot メインファイル
 */

require('dotenv').config();
const { App } = require('@slack/bolt');
const { extractPhoneNumbers, getPhoneType } = require('./utils/phoneParser');
const { lookupPhone, getSpamEmoji, getSpamDescription } = require('./scrapers');
const db = require('./database/db');

// データベースを初期化
db.initDatabase();

// Slackアプリを初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: process.env.SLACK_SOCKET_MODE === 'true',
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000
});

/**
 * メッセージイベントをリッスン
 * 電話番号を含むメッセージを検出して自動的に検索
 */
app.event('message', async ({ event, client, logger }) => {
  try {
    // ボット自身のメッセージは無視
    if (event.subtype === 'bot_message' || event.bot_id) {
      return;
    }

    // スレッド返信は無視（元のメッセージのみ処理）
    if (event.thread_ts && event.thread_ts !== event.ts) {
      return;
    }

    const text = event.text || '';
    const phoneNumbers = extractPhoneNumbers(text);

    if (phoneNumbers.length === 0) {
      return;
    }

    logger.info(`Found ${phoneNumbers.length} phone number(s) in message: ${phoneNumbers.join(', ')}`);

    // 各電話番号を処理
    for (const phoneNumber of phoneNumbers) {
      await processPhoneNumber(phoneNumber, event, client, logger);
    }
  } catch (error) {
    logger.error('Error processing message:', error);
  }
});

/**
 * 電話番号を処理して結果をSlackに投稿
 */
async function processPhoneNumber(phoneNumber, event, client, logger) {
  try {
    // まず「検索中」メッセージを投稿
    const searchingMsg = await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `🔍 ${phoneNumber} を検索中...`
    });

    // 登録済み企業情報をチェック
    const registeredCompany = db.getRegisteredCompany(phoneNumber);
    if (registeredCompany) {
      await updateWithRegisteredInfo(client, event.channel, searchingMsg.ts, phoneNumber, registeredCompany);
      return;
    }

    // ブロックリストをチェック
    const blocked = db.isBlocked(phoneNumber);
    if (blocked) {
      await updateWithBlockedInfo(client, event.channel, searchingMsg.ts, phoneNumber, blocked);
      return;
    }

    // 電話番号を検索
    const result = await lookupPhone(phoneNumber);

    // 検索結果をフォーマット
    const message = formatLookupResult(phoneNumber, result);

    // 「検索中」メッセージを更新
    await client.chat.update({
      channel: event.channel,
      ts: searchingMsg.ts,
      text: message
    });

    // 着信履歴を保存
    db.saveCallHistory(phoneNumber, result, {
      messageTs: event.ts,
      channel: event.channel
    });

    // スパムスコアが高い場合は警告リアクションを追加
    if (result.spamScore >= 7) {
      await client.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: 'warning'
      });
    }

    logger.info(`Successfully processed phone number: ${phoneNumber}`);
  } catch (error) {
    logger.error(`Error processing phone number ${phoneNumber}:`, error);
  }
}

/**
 * 検索結果をフォーマット
 */
function formatLookupResult(phoneNumber, result) {
  const emoji = getSpamEmoji(result.spamScore);
  const description = getSpamDescription(result.spamScore);
  const phoneType = getPhoneType(phoneNumber);

  let message = `${emoji} **${phoneNumber}** の検索結果\n\n`;

  if (result.found) {
    // 会社名
    if (result.companyName) {
      message += `📌 **事業者名**: ${result.companyName}\n`;
    }

    // カテゴリ
    if (result.category) {
      message += `🏷️ **カテゴリ**: ${result.category}\n`;
    }

    // 電話番号の種類
    message += `📞 **種別**: ${phoneType}\n`;

    // スパムスコア
    message += `⚠️ **営業電話スコア**: ${result.spamScore}/10 - ${description}\n`;

    // タグ
    if (result.tags && result.tags.length > 0) {
      message += `🏷️ **タグ**: ${result.tags.join(', ')}\n`;
    }

    // 情報源
    message += `\n📊 **情報源**: ${result.sources.join(', ')}\n`;

    // コメント（最大3件）
    if (result.comments && result.comments.length > 0) {
      message += `\n💬 **最近のコメント**:\n`;
      result.comments.slice(0, 3).forEach((comment, index) => {
        message += `${index + 1}. ${comment.substring(0, 100)}${comment.length > 100 ? '...' : ''}\n`;
      });
    }
  } else {
    message += `📞 **種別**: ${phoneType}\n`;
    message += `\nℹ️ この電話番号の情報は見つかりませんでした。\n`;
    message += `初めての着信の可能性があります。`;
  }

  // 過去の着信履歴
  const history = db.getCallHistory(phoneNumber, 5);
  if (history && history.length > 1) {
    message += `\n\n📋 **過去の着信**: ${history.length}回`;
  }

  return message;
}

/**
 * 登録済み企業情報で更新
 */
async function updateWithRegisteredInfo(client, channel, messageTs, phoneNumber, companyInfo) {
  const message = `✅ **${phoneNumber}** - 登録済み企業\n\n` +
    `📌 **企業名**: ${companyInfo.company_name}\n` +
    (companyInfo.category ? `🏷️ **カテゴリ**: ${companyInfo.category}\n` : '') +
    (companyInfo.notes ? `📝 **メモ**: ${companyInfo.notes}\n` : '') +
    `\n💾 登録者: ${companyInfo.added_by}`;

  await client.chat.update({
    channel: channel,
    ts: messageTs,
    text: message
  });
}

/**
 * ブロック済み番号で更新
 */
async function updateWithBlockedInfo(client, channel, messageTs, phoneNumber, blockInfo) {
  const message = `🚫 **${phoneNumber}** - ブロック済み\n\n` +
    `⛔ **理由**: ${blockInfo.reason}\n` +
    `💾 登録者: ${blockInfo.added_by}\n\n` +
    `⚠️ この番号はブロックリストに登録されています。`;

  await client.chat.update({
    channel: channel,
    ts: messageTs,
    text: message
  });
}

/**
 * スラッシュコマンド: /phone-register
 * 手動で企業情報を登録
 */
app.command('/phone-register', async ({ command, ack, respond }) => {
  await ack();

  try {
    // コマンドの引数をパース
    // 例: /phone-register 050-1234-5678 株式会社テスト 取引先
    const args = command.text.split(' ');
    if (args.length < 2) {
      await respond('使い方: `/phone-register 電話番号 企業名 [カテゴリ] [メモ]`');
      return;
    }

    const phoneNumber = args[0];
    const companyName = args[1];
    const category = args[2] || null;
    const notes = args.slice(3).join(' ') || null;

    db.registerCompany(phoneNumber, companyName, category, notes, command.user_name);

    await respond(`✅ ${phoneNumber} を ${companyName} として登録しました。`);
  } catch (error) {
    await respond(`❌ エラーが発生しました: ${error.message}`);
  }
});

/**
 * スラッシュコマンド: /phone-block
 * 電話番号をブロックリストに追加
 */
app.command('/phone-block', async ({ command, ack, respond }) => {
  await ack();

  try {
    const args = command.text.split(' ');
    if (args.length < 2) {
      await respond('使い方: `/phone-block 電話番号 理由`');
      return;
    }

    const phoneNumber = args[0];
    const reason = args.slice(1).join(' ');

    db.addToBlocklist(phoneNumber, reason, command.user_name);

    await respond(`🚫 ${phoneNumber} をブロックリストに追加しました。`);
  } catch (error) {
    await respond(`❌ エラーが発生しました: ${error.message}`);
  }
});

/**
 * スラッシュコマンド: /phone-stats
 * 統計情報を表示
 */
app.command('/phone-stats', async ({ command, ack, respond }) => {
  await ack();

  try {
    const stats = db.getStats();

    let message = '📊 **電話番号検索Bot 統計情報**\n\n';
    message += `📞 総着信数: ${stats.totalCalls}\n`;
    message += `🚫 ブロック済み番号: ${stats.blockedNumbers}\n`;
    message += `💾 登録企業数: ${stats.registeredCompanies}\n`;

    if (stats.topSpamCalls && stats.topSpamCalls.length > 0) {
      message += `\n⚠️ **営業電話ランキング（スコア7以上）**:\n`;
      stats.topSpamCalls.forEach((call, index) => {
        message += `${index + 1}. ${call.phone_number} (${call.company_name || '不明'}) - ${call.call_count}回\n`;
      });
    }

    await respond(message);
  } catch (error) {
    await respond(`❌ エラーが発生しました: ${error.message}`);
  }
});

// アプリを起動
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Slack Phone Lookup Bot is running on port ${port}`);
})();
