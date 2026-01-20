/**
 * 電話番号を検出・パースするユーティリティ
 */

/**
 * メッセージから日本の電話番号を抽出
 * @param {string} text - 検索対象のテキスト
 * @returns {Array<string>} - 抽出された電話番号の配列
 */
function extractPhoneNumbers(text) {
  // 日本の電話番号パターン
  const patterns = [
    // 050-XXXX-XXXX, 03-XXXX-XXXX, 06-XXXX-XXXX など
    /0\d{1,4}-\d{1,4}-\d{4}/g,
    // 0XXXXXXXXXX (ハイフンなし)
    /0\d{9,10}/g,
  ];

  const phoneNumbers = new Set();

  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // ハイフンを正規化
        const normalized = normalizePhoneNumber(match);
        phoneNumbers.add(normalized);
      });
    }
  });

  return Array.from(phoneNumbers);
}

/**
 * 電話番号を正規化（ハイフンあり形式に統一）
 * @param {string} phone - 電話番号
 * @returns {string} - 正規化された電話番号
 */
function normalizePhoneNumber(phone) {
  // ハイフンを除去
  const digits = phone.replace(/-/g, '');

  // 050, 070, 080, 090 などの携帯・IP電話
  if (digits.match(/^(050|070|080|090)\d{8}$/)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  // 03, 06 などの主要都市（10桁）
  if (digits.match(/^0[3-6]\d{8}$/)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // 0120, 0800 などのフリーダイヤル
  if (digits.match(/^(0120|0800)\d{6}$/)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // その他の市外局番（11桁）
  if (digits.match(/^0\d{9,10}$/)) {
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
  }

  return phone;
}

/**
 * 電話番号の種類を判定
 * @param {string} phone - 電話番号
 * @returns {string} - 電話番号の種類
 */
function getPhoneType(phone) {
  const digits = phone.replace(/-/g, '');

  if (digits.startsWith('050')) return 'IP電話';
  if (digits.startsWith('070') || digits.startsWith('080') || digits.startsWith('090')) return '携帯電話';
  if (digits.startsWith('0120') || digits.startsWith('0800')) return 'フリーダイヤル';
  if (digits.startsWith('03')) return '東京（固定電話）';
  if (digits.startsWith('06')) return '大阪（固定電話）';

  return '固定電話';
}

module.exports = {
  extractPhoneNumbers,
  normalizePhoneNumber,
  getPhoneType
};
