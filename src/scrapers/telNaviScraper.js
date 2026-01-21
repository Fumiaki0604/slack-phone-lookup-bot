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

    console.log(`Searching telnavi: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    const result = {
      phoneNumber: phoneNumber,
      source: '電話帳ナビ',
      found: false,
      companyName: null,
      category: null,
      spamScore: 0,
      accessCount: 0,
      rating: null,
      tags: []
    };

    // 事業者名を取得（複数のセレクタを試す）
    // スクリーンショットから「大和証券／営業電話」のような形式
    let companyText = '';

    // テーブルから事業者名を取得
    $('table tr').each((i, row) => {
      const th = $(row).find('th').text().trim();
      const td = $(row).find('td').text().trim();
      if (th === '事業者名' || th.includes('事業者')) {
        companyText = td;
        result.found = true;
      }
    });

    // 事業者名をパース（「大和証券／営業電話」→「大和証券」）
    if (companyText) {
      const parts = companyText.split(/[／\/]/);
      result.companyName = parts[0].trim().replace(/["「」'']/g, '');

      // 「営業電話」などのタグ情報も取得
      if (parts.length > 1) {
        const tagPart = parts[1].trim();
        if (tagPart && !result.tags.includes(tagPart)) {
          result.tags.push(tagPart);
          if (tagPart.includes('営業')) {
            result.spamScore += 5;
          }
        }
      }
    }

    // ページタイトルからも情報を取得
    if (!result.companyName) {
      const pageTitle = $('title').text();
      const titleMatch = pageTitle.match(/(.+?)[／\/].*電話番号/);
      if (titleMatch) {
        result.companyName = titleMatch[1].trim();
        result.found = true;
      }
    }

    // h1タグから取得を試みる
    if (!result.companyName) {
      const h1Text = $('h1').first().text().trim();
      if (h1Text && !h1Text.match(/^0\d/)) {
        const h1Match = h1Text.match(/(.+?)(の電話番号|電話番号検索)/);
        if (h1Match) {
          result.companyName = h1Match[1].trim();
          result.found = true;
        }
      }
    }

    // 口コミ数
    const reviewCount = $('a:contains("クチコミ")').text();
    const reviewMatch = reviewCount.match(/(\d+)件/);
    if (reviewMatch) {
      const count = parseInt(reviewMatch[1]);
      if (count > 10) result.spamScore += 2;
      if (count > 50) result.spamScore += 2;
    }

    // アクセス数
    $('table tr').each((i, row) => {
      const th = $(row).find('th').text().trim();
      const td = $(row).find('td').text().trim();
      if (th === 'アクセス数' || th.includes('アクセス')) {
        const accessMatch = td.match(/(\d+)/);
        if (accessMatch) {
          result.accessCount = parseInt(accessMatch[1]);
        }
      }
    });

    // スパムスコアを正規化
    result.spamScore = Math.min(result.spamScore, 10);

    console.log(`telnavi result: found=${result.found}, company=${result.companyName}`);

    return result;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return {
        phoneNumber: phoneNumber,
        source: '電話帳ナビ',
        found: false,
        error: '情報が見つかりませんでした'
      };
    }

    console.error('telnavi scraping error:', error.message);
    return {
      phoneNumber: phoneNumber,
      source: '電話帳ナビ',
      found: false,
      error: error.message
    };
  }
}

module.exports = {
  searchPhone
};
