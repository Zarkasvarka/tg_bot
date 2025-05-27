require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const app = express();
const bot = require('./services/bot');

const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

// API для получения списка дисциплин из БД
app.get('/api/disciplines', async (req, res) => {
  try {
    const result = await pool.query('SELECT disciplineid, name FROM disciplines');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для получения одной дисциплины по ID
app.get('/api/disciplines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT disciplineid, name FROM disciplines WHERE disciplineid = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Дисциплина не найдена' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен: ${PORT}`);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Бот запущен и готов к работе!');