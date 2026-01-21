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
    // ハイフンを除去し、アンダースコア区切りに変換
    const cleanNumber = phoneNumber.replace(/-/g, '');
    const underscoreNumber = phoneNumber.replace(/-/g, '_');

    // 番号の種類によってURLを変更
    let url;
    if (cleanNumber.startsWith('050')) {
      // IP電話
      url = `https://www.jpnumber.com/ipphone/numberinfo_${underscoreNumber}.html`;
    } else if (cleanNumber.startsWith('0120') || cleanNumber.startsWith('0800')) {
      // フリーダイヤル
      url = `https://www.jpnumber.com/freedial/numberinfo_${underscoreNumber}.html`;
    } else {
      // 一般電話
      url = `https://www.jpnumber.com/numberinfo_${underscoreNumber}.html`;
    }

    console.log(`Searching jpnumber: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
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
      spamScore: null, // null = 不明（口コミなし）
      commentCount: 0,
      comments: [],
      tags: [],
      hasComments: false // 口コミがあるかどうか
    };

    // 会社名・事業者名をテーブルから取得
    // スクリーンショットの構造: <th>事業者</th><td>株式会社大崎室町営業所</td>
    $('table tr, table.tbl-basic tr').each((i, row) => {
      const th = $(row).find('th').text().trim();
      const td = $(row).find('td').text().trim();

      if (th === '事業者' || th.includes('事業者')) {
        if (td && td !== '' && !td.includes('未登録')) {
          result.found = true;
          result.companyName = td.replace(/▼.*$/, '').trim(); // 「▼詳細を見る」などを除去
          console.log(`jpnumber found company: ${result.companyName}`);
        }
      }

      // 番号種類
      if (th === '番号種類' || th.includes('種類')) {
        result.category = td;
      }
    });

    // h1タイトルからも試す（バックアップ）
    if (!result.companyName) {
      const companyElement = $('h1.number-title, h1');
      if (companyElement.length > 0) {
        const titleText = companyElement.first().text().trim();
        // 電話番号部分を除去
        const cleaned = titleText.replace(/[\d\-_]+/g, '').replace(/の基本情報/g, '').trim();
        if (cleaned && cleaned.length > 1) {
          result.found = true;
          result.companyName = cleaned;
        }
      }
    }

    // 口コミ件数をテーブルから取得
    $('table tr').each((i, row) => {
      const th = $(row).find('th').text().trim();
      const td = $(row).find('td').text().trim();
      if (th === '口コミ件数' || th.includes('口コミ')) {
        const match = td.match(/(\d+)/);
        if (match) {
          result.commentCount = parseInt(match[1]);
          result.hasComments = result.commentCount > 0;
        }
      }
    });

    // 口コミがある場合のみスパムスコアを計算
    if (result.hasComments) {
      result.spamScore = 0; // 口コミがあれば0から開始

      // コメントを取得して迷惑判定
      // jpnumberのコメントセクションを探す（複数のセレクタを試す）
      const commentSelectors = [
        '.comment-item',
        '.kuchikomi-item',
        '.review-item',
        'div[class*="comment"]',
        'div[class*="kuchikomi"]'
      ];

      let commentsFound = false;
      for (const selector of commentSelectors) {
        if (commentsFound) break;
        $(selector).slice(0, 5).each((i, elem) => {
          const commentText = $(elem).text().trim();
          if (commentText && commentText.length > 5) {
            commentsFound = true;
            result.comments.push(commentText.substring(0, 200));

            // コメント内容から迷惑電話を判定
            if (commentText.includes('営業') || commentText.includes('セールス')) {
              result.spamScore += 2;
            }
            if (commentText.includes('迷惑') || commentText.includes('しつこい')) {
              result.spamScore += 2;
            }
            if (commentText.includes('詐欺') || commentText.includes('怪しい')) {
              result.spamScore += 3;
            }
            if (commentText.includes('ワン切り') || commentText.includes('無言')) {
              result.spamScore += 2;
            }
          }
        });
      }

      // スパムスコアを正規化（0-10）
      result.spamScore = Math.min(result.spamScore, 10);
    }
    // 口コミがない場合、spamScoreはnull（不明）のまま

    console.log(`jpnumber result: found=${result.found}, company=${result.companyName}, comments=${result.commentCount}, spamScore=${result.spamScore}`);

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
