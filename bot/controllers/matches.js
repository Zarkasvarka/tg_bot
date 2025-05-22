const pool = require('../config/db');

async function getDisciplines() {
  const res = await pool.query('SELECT disciplineid, name FROM disciplines ORDER BY disciplineid');
  return res.rows; // [{ disciplineid: 1, name: 'Dota 2' }, ...]
}

module.exports = { getDisciplines };