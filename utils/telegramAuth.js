const crypto = require('crypto');

function validateTelegramData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const dataToCheck = Array.from(params.entries())
      .filter(([key]) => key !== 'hash')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secret = crypto.createHash('sha256').update(botToken).digest();
    const calculatedHash = crypto
      .createHmac('sha256', secret)
      .update(dataToCheck)
      .digest('hex');

    return calculatedHash === hash ? JSON.parse(params.get('user')) : null;
  } catch (e) {
    return null;
  }
}

module.exports = validateTelegramData;