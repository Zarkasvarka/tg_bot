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
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Telegram-InitData', 'Content-Type'],
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

// Получить историю ставок (GET)
app.get('/api/predictions', async (req, res) => {
  try {
    const initData = req.headers['telegram-initdata'];
    const user = validateTelegramData(initData, process.env.TELEGRAM_TOKEN);
    if (!user) return res.status(401).json({ error: 'Invalid auth' });

    const userRes = await pool.query('SELECT userid FROM users WHERE telegramid = $1', [user.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    const result = await pool.query(
      'SELECT * FROM predictions WHERE userid = $1 ORDER BY prediction_date DESC', 
      [userRes.rows[0].userid]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать ставку (POST)
app.post('/api/predictions', async (req, res) => {
  try {
    const initData = req.headers['telegram-initdata'];
    console.log('Request body:', req.body);
    const user = validateTelegramData(initData, process.env.TELEGRAM_TOKEN);
    if (!user) {
      console.error('[POST /predictions] Validation failed');
      return res.status(401).json({ error: 'Invalid auth' });
    }

    const { rows } = await pool.query('SELECT userid, token_balance FROM users WHERE telegramid = $1', [user.id]);
    if (rows.length === 0) {
      console.error('[POST /predictions] User not found in DB');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    console.log('[POST /predictions] User balance:', rows[0].token_balance);

    const { matchid, bet_amount, selected_team, coefficient_snapshot } = req.body;
    if (!matchid || !bet_amount || !selected_team || !coefficient_snapshot) {
      return res.status(400).json({ error: 'Не все поля заполнены' });
    }

    // Проверка наличия команды в коэффициентах
    const match = await pool.query('SELECT coefficients FROM matches WHERE matchid = $1', [matchid]);
    if (!match.rows[0].coefficients[selected_team]) {
      console.error('Invalid team for coefficient:', selected_team);
      return res.status(400).json({ error: 'Неверная команда' });
    }

    const userRes = await pool.query(
      'SELECT userid, token_balance FROM users WHERE telegramid = $1', 
      [user.id]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    if (bet_amount > userRes.rows[0].token_balance) {
      return res.status(400).json({ error: 'Недостаточно средств' });
    }

    await pool.query(
      `INSERT INTO predictions 
        (userid, matchid, bet_amount, selected_team, coefficient_snapshot, status, prediction_date) 
        VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
      [userRes.rows[0].userid, matchid, bet_amount, selected_team, coefficient_snapshot]
    );

    await pool.query(
      'UPDATE users SET token_balance = token_balance - $1 WHERE userid = $2',
      [bet_amount, userRes.rows[0].userid]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[POST /predictions] Error:', error);
    res.status(500).json({ error: error.message });
  }
});


// Получить историю транзакций
app.get('/api/transactions', async (req, res) => {
  try {
    const initData = req.headers['telegram-initdata'];
    const user = validateTelegramData(initData, process.env.TELEGRAM_TOKEN);
    
    if (!user) return res.status(401).json({ error: 'Invalid auth' });

    const { rows: userRows } = await pool.query(
      'SELECT userid FROM users WHERE telegramid = $1', 
      [user.id]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const { rows: transactionRows } = await pool.query(
      'SELECT * FROM transactions WHERE userid = $1 ORDER BY date DESC',
      [userRows[0].userid]
    );

    res.json(transactionRows);
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Эндпоинт для получения пользователя
app.get('/api/user', async (req, res) => {
  try {
    const initData = req.headers['telegram-initdata'];
    
    // 1. Проверка наличия initData
    if (!initData) {
      return res.status(400).json({ error: 'Требуется авторизация через Telegram' });
    }

    // 2. Строгая валидация данных Telegram
    const telegramUser = validateTelegramData(initData, process.env.TELEGRAM_TOKEN);
    if (!telegramUser) {
      return res.status(401).json({ error: 'Невалидные данные авторизации' });
    }

    // 3. Безопасный запрос к БД
    const { rows } = await pool.query(`
      SELECT 
        userid,
        telegramid,
        username,
        token_balance,
        registration_date
      FROM users 
      WHERE telegramid = $1
    `, [telegramUser.id]);

    // 4. Проверка существования пользователя
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не зарегистрирован' });
    }

    // 5. Форматирование ответа
    const dbUser = rows[0];
    const response = {
      id: dbUser.userid,
      telegramId: dbUser.telegramid,
      username: dbUser.username,
      balance: dbUser.token_balance,
      registeredAt: dbUser.registration_date,
      avatar: dbUser.username 
        ? `https://t.me/i/userpic/320/${dbUser.username}.jpg`
        : 'https://t.me/i/userpic/320/Amaizek.jpg'
    };

    res.json(response);

  } catch (error) {
    // 6. Логирование и обработка ошибок
    console.error('[USER API] Ошибка:', error);
    res.status(500).json({ 
      error: 'Произошла внутренняя ошибка',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
