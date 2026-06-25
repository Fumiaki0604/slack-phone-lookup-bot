/**
 * Claude API サービス
 * 録音内容から宛先を特定するためのAI解析機能
 */

const Anthropic = require('@anthropic-ai/sdk');

let client = null;

/**
 * Claude APIクライアントを初期化
 */
function initClient() {
  if (client) {
    return client;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set. AI mention feature will be disabled.');
    return null;
  }

  try {
    client = new Anthropic({ apiKey });
    console.log('Claude API initialized');
    return client;
  } catch (error) {
    console.error('Failed to initialize Claude API:', error.message);
    return null;
  }
}

/**
 * 録音内容から宛先の名前を抽出
 * @param {string} transcription - 録音のテキスト内容
 * @returns {Promise<Object>} - 抽出結果 { recipientName: string|null, confidence: string }
 */
async function extractRecipient(transcription) {
  const anthropic = initClient();
  if (!anthropic) {
    return { recipientName: null, confidence: 'none', reason: 'Claude API not available' };
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `以下は電話の録音内容です。この電話が誰宛てのものか、宛先の人の名前を抽出してください。

録音内容:
${transcription}

回答は以下のJSON形式で返してください:
{
  "recipientName": "名前（姓のみ、ひらがなで）",
  "confidence": "high/medium/low",
  "reason": "判断理由"
}

注意:
- 「○○様」「○○さん」などの敬称は除去してください
- 名前が聞き取れない場合や不明な場合はrecipientNameをnullにしてください
- 名前はひらがなで出力してください（例: 倉田 → くらた）
- confidenceは判断の確信度です（high=明確に名前が言及されている, medium=推測を含む, low=不確実）`
        }
      ]
    });

    const content = response.content[0].text;

    // JSONを抽出（マークダウンのコードブロック対応）
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // JSON以外の文字列が混ざっている場合の対応
    const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0];
    }

    const result = JSON.parse(jsonStr);
    console.log(`Claude extracted recipient: ${result.recipientName} (confidence: ${result.confidence})`);
    return result;
  } catch (error) {
    console.error('Failed to extract recipient with Claude:', error.message);
    return { recipientName: null, confidence: 'none', reason: error.message };
  }
}

/**
 * Claude APIが利用可能かどうか
 */
function isAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

module.exports = {
  initClient,
  extractRecipient,
  isAvailable,
};
