const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

async function findUserByTelegramId(telegramId) {
  const res = await pool.query('SELECT * FROM users WHERE telegramid = $1', [telegramId]);
  return res.rows[0];
}

async function registerUser(telegramId, username) {
  const userId = uuidv4();
  await pool.query(
    `INSERT INTO users (userid, telegramid, username, token_balance, registration_date)
     VALUES ($1, $2, $3, 100, NOW())`,
    [userId, telegramId, username]
  );
  return 100; // Начисляем 100 токенов при регистрации
}

async function getBalance(telegramId) {
  const user = await findUserByTelegramId(telegramId);
  return user ? user.token_balance : 0;
}

module.exports = { findUserByTelegramId, registerUser, getBalance };