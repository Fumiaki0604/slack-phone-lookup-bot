/**
 * jpnumber.com から電話番号情報をスクレイピング
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * jpnumber.comで電話番号を検索
 * @param {string} phoneNumber - 検索する電話番号（ハイフンなし）
 * @returns {Promise<Object>} - 検索結果
 */
async function searchPhone(phoneNumber) {
  try {
    // ハイフンを除去
    const cleanNumber = phoneNumber.replace(/-/g, '');
    const url = `https://www.jpnumber.com/numberinfo_${cleanNumber}.html`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    // 基本情報を抽出
    const result = {
      phoneNumber: phoneNumber,
      source: 'jpnumber',
      found: false,
      companyName: null,
      category: null,
      spamScore: 0,
      commentCount: 0,
      comments: [],
      tags: []
    };

    // 会社名・事業者名
    const companyElement = $('h1.number-title');
    if (companyElement.length > 0) {
      result.found = true;
      result.companyName = companyElement.text().trim().replace(cleanNumber, '').trim();
    }

    // カテゴリ・タグ
    $('.tag-item').each((i, elem) => {
      const tag = $(elem).text().trim();
      result.tags.push(tag);

      // 営業電話関連のタグをチェック
      if (tag.includes('営業') || tag.includes('セールス') || tag.includes('勧誘')) {
        result.spamScore += 3;
      }
    });

    // コメント数
    const commentCountText = $('.comment-count').text();
    const commentMatch = commentCountText.match(/(\d+)/);
    if (commentMatch) {
      result.commentCount = parseInt(commentMatch[1]);
    }

    // コメントを取得（最大5件）
    $('.comment-item').slice(0, 5).each((i, elem) => {
      const commentText = $(elem).find('.comment-text').text().trim();
      result.comments.push(commentText);

      // コメント内容から営業電話を判定
      if (commentText.includes('営業') || commentText.includes('セールス') ||
          commentText.includes('迷惑') || commentText.includes('しつこい')) {
        result.spamScore += 1;
      }
    });

    // スパムスコアを正規化（0-10）
    result.spamScore = Math.min(result.spamScore, 10);

    return result;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        phoneNumber: phoneNumber,
        source: 'jpnumber',
        found: false,
        error: '情報が見つかりませんでした'
      };
    }

    console.error('jpnumber scraping error:', error.message);
    return {
      phoneNumber: phoneNumber,
      source: 'jpnumber',
      found: false,
      error: error.message
    };
  }
}

module.exports = {
  searchPhone
};
