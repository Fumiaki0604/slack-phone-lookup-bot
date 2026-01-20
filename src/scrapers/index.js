/**
 * 電話番号検索の統合モジュール
 * 複数のソースから情報を収集して統合
 */

const jpnumber = require('./jpnumber');
const telnavi = require('./telNaviScraper');

/**
 * 複数のソースから電話番号情報を検索
 * @param {string} phoneNumber - 検索する電話番号
 * @returns {Promise<Object>} - 統合された検索結果
 */
async function lookupPhone(phoneNumber) {
  console.log(`Looking up phone number: ${phoneNumber}`);

  // 並列で複数のソースから検索
  const results = await Promise.allSettled([
    jpnumber.searchPhone(phoneNumber),
    telnavi.searchPhone(phoneNumber)
  ]);

  // 結果を統合
  const aggregated = {
    phoneNumber: phoneNumber,
    found: false,
    sources: [],
    companyName: null,
    category: null,
    spamScore: 0,
    tags: [],
    comments: [],
    details: {}
  };

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.found) {
      const data = result.value;
      aggregated.found = true;
      aggregated.sources.push(data.source);

      // 会社名（最初に見つかったものを採用）
      if (!aggregated.companyName && data.companyName) {
        aggregated.companyName = data.companyName;
      }

      // カテゴリ
      if (!aggregated.category && data.category) {
        aggregated.category = data.category;
      }

      // スパムスコア（最大値を採用）
      if (data.spamScore > aggregated.spamScore) {
        aggregated.spamScore = data.spamScore;
      }

      // タグを統合
      if (data.tags && data.tags.length > 0) {
        aggregated.tags = [...new Set([...aggregated.tags, ...data.tags])];
      }

      // コメントを統合
      if (data.comments && data.comments.length > 0) {
        aggregated.comments = [...aggregated.comments, ...data.comments];
      }

      // 各ソースの詳細データを保存
      aggregated.details[data.source] = data;
    }
  });

  return aggregated;
}

/**
 * スパムスコアに基づいて絵文字を返す
 * @param {number} spamScore - スパムスコア (0-10)
 * @returns {string} - 絵文字
 */
function getSpamEmoji(spamScore) {
  if (spamScore >= 7) return '🔴';  // 高リスク（営業電話の可能性大）
  if (spamScore >= 4) return '🟡';  // 中リスク（要注意）
  return '🟢';  // 低リスク（安全）
}

/**
 * スパムスコアの説明を返す
 * @param {number} spamScore - スパムスコア (0-10)
 * @returns {string} - 説明文
 */
function getSpamDescription(spamScore) {
  if (spamScore >= 7) return '営業電話の可能性が高いです';
  if (spamScore >= 4) return '営業電話の可能性があります';
  return '特に問題は報告されていません';
}

module.exports = {
  lookupPhone,
  getSpamEmoji,
  getSpamDescription
};
