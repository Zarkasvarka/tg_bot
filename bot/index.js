require('dotenv').config();
const bot = require('./services/bot');

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Бот запущен и готов к работе!');