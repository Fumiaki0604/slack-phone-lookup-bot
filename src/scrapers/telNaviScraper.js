/**
 * 電話帳ナビ (telnavi.jp) から電話番号情報をスクレイピング
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * 電話帳ナビで電話番号を検索
 * @param {string} phoneNumber - 検索する電話番号
 * @returns {Promise<Object>} - 検索結果
 */
async function searchPhone(phoneNumber) {
  try {
    const cleanNumber = phoneNumber.replace(/-/g, '');
    const url = `https://www.telnavi.jp/phone/${cleanNumber}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    const result = {
      phoneNumber: phoneNumber,
      source: 'telnavi',
      found: false,
      companyName: null,
      category: null,
      spamScore: 0,
      accessCount: 0,
      rating: null,
      tags: []
    };

    // 事業者名
    const titleElement = $('h1.number_detail_title');
    if (titleElement.length > 0) {
      result.found = true;
      const title = titleElement.text().trim();
      result.companyName = title.replace(/の電話番号情報.*/, '').trim();
    }

    // カテゴリー
    const categoryElement = $('.category-label');
    if (categoryElement.length > 0) {
      result.category = categoryElement.text().trim();
    }

    // アクセス数（人気度）
    const accessElement = $('.access-count');
    if (accessElement.length > 0) {
      const accessText = accessElement.text();
      const accessMatch = accessText.match(/(\d+)/);
      if (accessMatch) {
        result.accessCount = parseInt(accessMatch[1]);
      }
    }

    // 評価・迷惑度
    const ratingElement = $('.spam-score, .rating-score');
    if (ratingElement.length > 0) {
      const ratingText = ratingElement.text();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
      if (ratingMatch) {
        result.rating = parseFloat(ratingMatch[1]);
        // 評価が高い（迷惑度が高い）場合はスパムスコアを上げる
        if (result.rating > 3) {
          result.spamScore = Math.min(result.rating * 2, 10);
        }
      }
    }

    // タグ・キーワード
    $('.tag, .keyword-tag').each((i, elem) => {
      const tag = $(elem).text().trim();
      if (tag) {
        result.tags.push(tag);

        // 営業電話関連のタグをチェック
        if (tag.includes('営業') || tag.includes('セールス') ||
            tag.includes('勧誘') || tag.includes('迷惑')) {
          result.spamScore += 2;
        }
      }
    });

    // スパムスコアを正規化
    result.spamScore = Math.min(result.spamScore, 10);

    return result;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        phoneNumber: phoneNumber,
        source: 'telnavi',
        found: false,
        error: '情報が見つかりませんでした'
      };
    }

    console.error('telnavi scraping error:', error.message);
    return {
      phoneNumber: phoneNumber,
      source: 'telnavi',
      found: false,
      error: error.message
    };
  }
}

module.exports = {
  searchPhone
};
