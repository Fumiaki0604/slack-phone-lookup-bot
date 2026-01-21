/**
 * Google検索を使って電話番号情報を取得
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Google検索で電話番号を検索（DuckDuckGoを使用）
 * @param {string} phoneNumber - 検索する電話番号
 * @returns {Promise<Object>} - 検索結果
 */
async function searchPhone(phoneNumber) {
  try {
    const cleanNumber = phoneNumber.replace(/-/g, '');

    // DuckDuckGo HTML版を使用（よりスクレイピングしやすい）
    const query = encodeURIComponent(`${phoneNumber} 電話 会社 迷惑`);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    console.log(`Searching DuckDuckGo: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    const result = {
      phoneNumber: phoneNumber,
      source: 'Web検索',
      found: false,
      companyName: null,
      category: null,
      spamScore: 0,
      snippets: [],
      tags: []
    };

    // DuckDuckGoの検索結果を取得（広告以外）
    $('.result:not(.result--ad)').each((i, elem) => {
      if (result.snippets.length >= 5) return false; // 最大5件

      const title = $(elem).find('.result__title').text().trim();
      const snippet = $(elem).find('.result__snippet').text().trim();
      const link = $(elem).find('.result__url').text().trim();

      // 広告をスキップ（複数の判定方法）
      if (title.includes('Ad\n') || title.includes('広告') ||
          title.includes('Viewing ads is privacy') ||
          link.includes('ad.') || link === '') {
        console.log(`Skipping ad: ${title.substring(0, 30)}...`);
        return true; // continue
      }

      console.log(`Result ${i}: title="${title.substring(0, 50)}", link="${link}"`);

      if (title || snippet) {
        result.found = true;
        result.snippets.push({ title, snippet, link });

        // 電話帳ナビやjpnumberの結果から会社名を抽出（優先）
        if (!result.companyName) {
          // 「大和証券／営業の電話番号検索結果」のようなパターン
          const telnaviMatch = title.match(/^(.+?)[／\/].*電話番号/);
          if (telnaviMatch) {
            result.companyName = telnaviMatch[1].trim();
          }
          // 「〇〇の電話番号」パターン
          if (!result.companyName) {
            const companyMatch = title.match(/^(.+?)(の電話番号|の口コミ|の評判|について)/);
            if (companyMatch && companyMatch[1].length > 2 && companyMatch[1].length < 30) {
              const candidate = companyMatch[1].trim();
              // 一般的なサイト名・番号パターンを除外
              if (!candidate.match(/^(電話番号|口コミ|迷惑電話|jpnumber|telnavi|IP電話|050|0\d{2,3})/i)) {
                result.companyName = candidate;
              }
            }
          }
        }

        // スパム判定キーワードをチェック
        const text = (title + ' ' + snippet).toLowerCase();
        if (text.includes('営業') || text.includes('セールス') || text.includes('勧誘')) {
          result.spamScore += 2;
          if (!result.tags.includes('営業電話')) result.tags.push('営業電話');
        }
        if (text.includes('迷惑') || text.includes('しつこい') || text.includes('詐欺')) {
          result.spamScore += 3;
          if (!result.tags.includes('迷惑電話')) result.tags.push('迷惑電話');
        }
        if (text.includes('不動産') || text.includes('投資') || text.includes('マンション')) {
          result.spamScore += 1;
          if (!result.tags.includes('不動産/投資')) result.tags.push('不動産/投資');
        }
        if (text.includes('光回線') || text.includes('インターネット') || text.includes('プロバイダ')) {
          result.spamScore += 1;
          if (!result.tags.includes('通信/回線')) result.tags.push('通信/回線');
        }
        if (text.includes('大和証券') || text.includes('証券')) {
          result.companyName = result.companyName || '証券会社';
          if (!result.tags.includes('証券')) result.tags.push('証券');
        }
      }
    });

    // スパムスコアを正規化（0-10）
    result.spamScore = Math.min(result.spamScore, 10);

    console.log(`DuckDuckGo result: found=${result.found}, company=${result.companyName}, snippets=${result.snippets.length}`);

    return result;
  } catch (error) {
    console.error('Web search error:', error.message);
    return {
      phoneNumber: phoneNumber,
      source: 'Web検索',
      found: false,
      error: error.message
    };
  }
}

module.exports = {
  searchPhone
};
