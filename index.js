require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const bot = require('./services/bot');
const validateTelegramData = require('./utils/telegramAuth');
const app = express();
const PORT = process.env.PORT || 5000;

// CORS
app.use(cors({
  origin: 'https://webappkemgu.netlify.app',
  credentials: true
}));
app.use(express.json());

// --- Эндпоинты для фронта --- //

// Получить все дисциплины
app.get('/api/disciplines', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM disciplines');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить одну дисциплину по id
app.get('/api/disciplines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM disciplines WHERE disciplineid = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Дисциплина не найдена' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить турниры по disciplineid
app.get('/api/tournaments', async (req, res) => {
  try {
    const { disciplineid } = req.query;
    let result;
    if (disciplineid) {
      result = await pool.query('SELECT * FROM tournaments WHERE disciplineid = $1', [disciplineid]);
    } else {
      result = await pool.query('SELECT * FROM tournaments');
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить матчи по tournamentid
app.get('/api/matches', async (req, res) => {
  try {
    const { tournamentid } = req.query;
    let result;
    if (tournamentid) {
      result = await pool.query('SELECT * FROM matches WHERE tournamentid = $1', [tournamentid]);
    } else {
      result = await pool.query('SELECT * FROM matches');
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить тарифы
app.get('/api/tariffs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tariffs WHERE is_active = true');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить пользователя по telegramid (передается в query или в headers)
app.get('/api/user', async (req, res) => {
  try {
    const telegramid = req.query.telegramid || req.headers['x-telegram-id'];
    if (!telegramid) return res.status(400).json({ error: 'Не передан telegramid' });

    const result = await pool.query('SELECT * FROM users WHERE telegramid = $1', [telegramid]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить историю ставок пользователя
app.get('/api/predictions', async (req, res) => {
  try {
    const telegramid = req.query.telegramid || req.headers['x-telegram-id'];
    if (!telegramid) return res.status(400).json({ error: 'Не передан telegramid' });

    // Получаем uuid пользователя
    const userRes = await pool.query('SELECT userid FROM users WHERE telegramid = $1', [telegramid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    const userid = userRes.rows[0].userid;
    const result = await pool.query('SELECT * FROM predictions WHERE userid = $1 ORDER BY prediction_date DESC', [userid]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить историю транзакций пользователя
app.get('/api/transactions', async (req, res) => {
  try {
    const telegramid = req.query.telegramid || req.headers['x-telegram-id'];
    if (!telegramid) return res.status(400).json({ error: 'Не передан telegramid' });

    // Получаем uuid пользователя
    const userRes = await pool.query('SELECT userid FROM users WHERE telegramid = $1', [telegramid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    const userid = userRes.rows[0].userid;
    const result = await pool.query('SELECT * FROM transactions WHERE userid = $1 ORDER BY date DESC', [userid]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- Эндпоинт для создания ставки ---
app.post('/api/predictions', async (req, res) => {
  try {
    const { telegramid, matchid, bet_amount, selected_team, coefficient_snapshot } = req.body;
    if (!telegramid || !matchid || !bet_amount || !selected_team || !coefficient_snapshot)
      return res.status(400).json({ error: 'Не все поля заполнены' });

    // Получаем uuid и баланс пользователя
    const userRes = await pool.query('SELECT userid, token_balance FROM users WHERE telegramid = $1', [telegramid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    const userid = userRes.rows[0].userid;
    const balance = parseFloat(userRes.rows[0].token_balance);

    if (bet_amount > balance) return res.status(400).json({ error: 'Недостаточно средств' });

    // Сохраняем ставку
    await pool.query(
      'INSERT INTO predictions (userid, matchid, bet_amount, selected_team, coefficient_snapshot, status, prediction_date) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [userid, matchid, bet_amount, selected_team, coefficient_snapshot, 'pending']
    );
    // Обновляем баланс
    await pool.query('UPDATE users SET token_balance = token_balance - $1 WHERE userid = $2', [bet_amount, userid]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для получения пользователя
app.get('/api/user', async (req, res) => {
  try {
    const initData = req.headers['telegram-initdata'];
    
    // Валидация данных Telegram (примерная реализация)
    const user = validateTelegramData(initData, process.env.TELEGRAM_TOKEN);
    if (!user) return res.status(401).json({ error: 'Invalid auth' });

    // Поиск пользователя в БД
    const result = await pool.query(
      'SELECT * FROM users WHERE telegramid = $1',
      [user.id]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    
    // Форматируем ответ
    const userData = {
      ...result.rows[0],
      avatar_url: `https://t.me/i/userpic/320/${result.rows[0].username}.jpg`
    };
    
    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Запуск сервера ---
app.listen(PORT, () => {
  console.log(`Сервер запущен: ${PORT}`);
});

// --- Telegram bot ---
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});
