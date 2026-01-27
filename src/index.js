/**
 * Slack電話番号検索Bot メインファイル
 * Updated: trigger nodemon restart
 */

require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const { extractPhoneNumbers } = require('./utils/phoneParser');
const { lookupPhone, clearCache } = require('./scrapers');
const db = require('./database/db');
const adminRouter = require('./admin/server');
const googleSheets = require('./services/googleSheets');
const claude = require('./services/claude');

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
 * 電話番号を含むメッセージを検知して自動的に検索
 */
app.event('message', async ({ event, client, logger }) => {
  try {
    // ボット自身のメッセージのみ無視（fondeskなど他のボットは処理する）
    // 無限ループを防ぐため、自分が投稿したメッセージは無視
    if (event.bot_id && event.username && event.username.includes('Phone Lookup')) {
      return;
    }

    // スレッド返信は無視（元のメッセージのみ処理）
    if (event.thread_ts && event.thread_ts !== event.ts) {
      return;
    }

    const messageText = event.text || '';

    // attachmentsからテキストを抽出（fondeskの録音テキストはここに含まれる）
    let attachmentText = '';
    if (event.attachments && event.attachments.length > 0) {
      attachmentText = event.attachments.map(a => {
        // attachments内のblocksからテキストを抽出（fondesk形式）
        if (a.blocks && a.blocks.length > 0) {
          return a.blocks.map(b => b.text?.text || '').join('\n');
        }
        return a.text || a.fallback || '';
      }).join('\n');
    }

    // 電話番号はメインテキストからのみ抽出（録音内の折り返し番号を除外）
    const phoneNumbers = extractPhoneNumbers(messageText);

    if (phoneNumbers.length === 0) {
      return;
    }

    logger.info(`Found ${phoneNumbers.length} phone number(s) in message: ${phoneNumbers.join(', ')}`);

    for (const phoneNumber of phoneNumbers) {
      await processPhoneNumber(phoneNumber, event, client, logger);
    }

    // 録音内容がある場合、宛先を特定してメンション（attachmentTextを使用）
    const fullText = messageText + '\n' + attachmentText;
    await processTranscriptionMention(fullText, event, client, logger);
  } catch (error) {
    logger.error('Error processing message:', error);
  }
});

/**
 * 電話番号を処理して結果をSlackに投稿
 */
async function processPhoneNumber(phoneNumber, event, client, logger) {
  try {
    const searchingMsg = await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `:mag: ${phoneNumber} を検索中...`
    });

    const registeredCompany = db.getRegisteredCompany(phoneNumber);
    if (registeredCompany) {
      await updateWithRegisteredInfo(client, event.channel, searchingMsg.ts, phoneNumber, registeredCompany);
      return;
    }

    const blocked = db.isBlocked(phoneNumber);
    if (blocked) {
      await updateWithBlockedInfo(client, event.channel, searchingMsg.ts, phoneNumber, blocked);
      return;
    }

    const result = await lookupPhone(phoneNumber);

    // 未登録番号→スプレッドシートに追加、登録済み→荷電回数+1
    let isNewlyAdded = false;
    if (googleSheets.isAvailable()) {
      if (!result.found) {
        const added = await googleSheets.addPhoneNumber(phoneNumber, '', '');
        if (added) {
          logger.info(`Added unregistered phone number to sheet: ${phoneNumber}`);
          clearCache();
          result.found = true;
          result.details = { sheet: { phoneNumber, companyName: null, category: null, callCount: 1 } };
          isNewlyAdded = true;
        }
      } else {
        const currentCount = result.details?.sheet?.callCount || 0;
        const updated = await googleSheets.incrementCallCount(phoneNumber, currentCount);
        if (updated) {
          result.details.sheet.callCount = currentCount + 1;
          clearCache();
        }
      }
    }

    const message = formatLookupResult(phoneNumber, result, isNewlyAdded);

    await client.chat.update({
      channel: event.channel,
      ts: searchingMsg.ts,
      text: message
    });

    db.saveCallHistory(phoneNumber, result, {
      messageTs: event.ts,
      channel: event.channel
    });

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
function formatLookupResult(phoneNumber, result, isNewlyAdded = false) {
  let message = `:telephone: *${phoneNumber}* の検索結果\n\n`;

  if (result.found) {
    const rawName = result.companyName ? String(result.companyName).trim() : '';
    const companyName = rawName && rawName !== '?' ? rawName : '不明';
    const category = result.category ? String(result.category).trim() : '不明';
    const callCount = result.details && result.details.sheet
      ? result.details.sheet.callCount
      : null;
    const callCountText = callCount !== null && !Number.isNaN(callCount)
      ? callCount
      : '不明';

    message += `:pushpin: *会社名*: ${companyName}\n`;
    message += `:label: *カテゴリ*: ${category}\n`;
    message += `:bar_chart: *荷電回数*: ${callCountText}\n`;

    if (isNewlyAdded) {
      message += `\n:new: _新規登録されました_`;
    }
  } else {
    message += ':information_source: シートに該当がありませんでした。';
  }

  const history = db.getCallHistory(phoneNumber, 5);
  if (history && history.length > 1) {
    message += `\n\n:clipboard: *直近の着信*: ${history.length}件`;
  }

  return message;
}

/**
 * 登録済み企業情報で更新
 */
async function updateWithRegisteredInfo(client, channel, messageTs, phoneNumber, companyInfo) {
  const message = `:white_check_mark: *${phoneNumber}* - 登録済み企業\n\n` +
    `:pushpin: *会社名*: ${companyInfo.company_name}\n` +
    (companyInfo.category ? `:label: *カテゴリ*: ${companyInfo.category}\n` : '') +
    (companyInfo.notes ? `:memo: *メモ*: ${companyInfo.notes}\n` : '') +
    `\n:floppy_disk: 登録者 ${companyInfo.added_by}`;

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
  const message = `:no_entry_sign: *${phoneNumber}* - ブロック済み\n\n` +
    `:warning: *理由*: ${blockInfo.reason}\n` +
    `:floppy_disk: 登録者 ${blockInfo.added_by}\n\n` +
    ':warning: この番号はブロックリストに登録されています。';

  await client.chat.update({
    channel: channel,
    ts: messageTs,
    text: message
  });
}

/**
 * 録音内容から宛先を抽出してメンション
 * fondeskの録音テキストを解析し、該当社員にメンションを送る
 */
async function processTranscriptionMention(text, event, client, logger) {
  // Claude APIが利用可能でない場合はスキップ
  if (!claude.isAvailable()) {
    logger.info('Claude API not available, skipping transcription analysis');
    return;
  }

  // 録音内容を抽出（「録音:」の後のテキスト）
  const transcription = extractTranscription(text);
  logger.info(`Transcription extraction result: ${transcription ? transcription.substring(0, 50) + '...' : 'null'}`);
  if (!transcription) {
    return;
  }

  // 25文字未満は宛先特定困難のためスキップ
  if (transcription.length < 25) {
    logger.info(`Transcription too short (${transcription.length} chars), skipping Claude`);
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `:grey_question: 宛先を特定できませんでした。`
    });
    return;
  }

  logger.info('Found transcription in message, analyzing with Claude...');

  try {
    // Claudeで宛先を抽出
    const result = await claude.extractRecipient(transcription);

    if (!result.recipientName) {
      logger.info('No recipient name found in transcription');
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: `:grey_question: 宛先を特定できませんでした。`
      });
      return;
    }

    logger.info(`Claude extracted recipient: ${result.recipientName} (confidence: ${result.confidence})`);

    // confidence が low の場合はメッセージを投稿してスキップ
    if (result.confidence === 'low') {
      logger.info('Skipping mention due to low confidence');
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: `:grey_question: 宛先を特定できませんでした（信頼度が低いため）。`
      });
      return;
    }

    // 社員名簿から検索
    const employee = await googleSheets.findEmployeeByName(result.recipientName);

    if (!employee) {
      logger.info(`No matching employee found for: ${result.recipientName}`);
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: `:grey_question: 宛先「${result.recipientName}」に該当する社員が見つかりませんでした。`
      });
      return;
    }

    logger.info(`Found matching employee: ${employee.name} (${employee.slackUserId})`);

    // スレッドにメンション付きメッセージを投稿
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `:bell: <@${employee.slackUserId}> さん宛ての電話がありました。\n` +
        `> _${result.reason}_`
    });

    logger.info(`Sent mention to ${employee.name} (${employee.slackUserId})`);
  } catch (error) {
    logger.error('Error processing transcription mention:', error);
  }
}

/**
 * メッセージから録音テキストを抽出
 * fondeskの形式: 「録音: ...」
 */
function extractTranscription(text) {
  // 「録音:」または「*録音*:」（太字）で始まる部分を抽出
  const match = text.match(/\*?録音\*?[:：]\s*([\s\S]+?)(?:\n少なく|$)/i);
  if (match) {
    return match[1].trim();
  }

  // 別のパターン: 詳細を開くの後に続くテキスト
  const altMatch = text.match(/詳細を開く\s*\n([\s\S]+?)(?:\n#|$)/i);
  if (altMatch) {
    return altMatch[1].trim();
  }

  return null;
}

/**
 * スラッシュコマンド /phone-register
 * 手動で企業情報を登録
 */
app.command('/phone-register', async ({ command, ack, respond }) => {
  await ack();

  try {
    const args = command.text.split(' ');
    if (args.length < 2) {
      await respond('使い方: `/phone-register 電話番号 会社名 [カテゴリ] [メモ]`');
      return;
    }

    const phoneNumber = args[0];
    const companyName = args[1];
    const category = args[2] || null;
    const notes = args.slice(3).join(' ') || null;

    db.registerCompany(phoneNumber, companyName, category, notes, command.user_name);

    await respond(`:white_check_mark: ${phoneNumber} を ${companyName} として登録しました。`);
  } catch (error) {
    await respond(`:x: エラーが発生しました: ${error.message}`);
  }
});

/**
 * スラッシュコマンド /phone-block
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

    await respond(`:no_entry_sign: ${phoneNumber} をブロックリストに追加しました。`);
  } catch (error) {
    await respond(`:x: エラーが発生しました: ${error.message}`);
  }
});

/**
 * スラッシュコマンド /phone-stats
 * 統計情報を表示
 */
app.command('/phone-stats', async ({ command, ack, respond }) => {
  await ack();

  try {
    const stats = db.getStats();

    let message = ':bar_chart: *電話番号検索Bot 統計情報*\n\n';
    message += `:telephone_receiver: 総着信数: ${stats.totalCalls}\n`;
    message += `:no_entry_sign: ブロック済み番号: ${stats.blockedNumbers}\n`;
    message += `:floppy_disk: 登録企業数: ${stats.registeredCompanies}\n`;

    if (stats.topSpamCalls && stats.topSpamCalls.length > 0) {
      message += '\n:warning: *営業電話ランキング (スコア7以上)*:\n';
      stats.topSpamCalls.forEach((call, index) => {
        message += `${index + 1}. ${call.phone_number} (${call.company_name || '不明'}) - ${call.call_count}回\n`;
      });
    }

    await respond(message);
  } catch (error) {
    await respond(`:x: エラーが発生しました: ${error.message}`);
  }
});

// アプリを起動
(async () => {
  await db.initDatabase();

  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`Slack Phone Lookup Bot is running on port ${port}`);

  const adminPort = process.env.ADMIN_PORT || 3001;
  const adminApp = express();
  adminApp.use('/admin', adminRouter);
  adminApp.get('/', (req, res) => res.redirect('/admin'));
  adminApp.listen(adminPort, () => {
    console.log(`Admin panel is running at http://localhost:${adminPort}/admin`);
  });
})();