const crypto = require('crypto');

function validateTelegramData(initData, botToken) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Сортируем параметры по алфавиту и формируем строку проверки
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // Формируем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Вычисляем хэш
    const computedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return null;

    // Проверяем срок действия auth_date (например, не старше 1 дня)
    const authDate = parseInt(params.get('auth_date'), 10);
    if (Date.now() / 1000 - authDate > 86400) return null;

    // Парсим user
    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson);

    return user;
  } catch (e) {
    return null;
  }
}

module.exports = validateTelegramData;
