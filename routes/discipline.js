const express = require('express');
const pool = require('../config/db');
const router = express.Router();

router.get('/api/discipline/:id/tournaments', async (req, res) => {
  const disciplineId = req.params.id;

  if (!disciplineId || isNaN(Number(disciplineId))) {
    return res.status(400).json({ error: 'Неверный параметр disciplineId' });
  }

  try {
    // Получаем дисциплину
    const disciplineResult = await pool.query(
      'SELECT disciplineid, name FROM disciplines WHERE disciplineid = $1',
      [Number(disciplineId)]
    );

    if (disciplineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Дисциплина не найдена' });
    }
    const discipline = disciplineResult.rows[0];

    // Получаем турниры дисциплины
    const tournamentsResult = await pool.query(
      'SELECT tournamentid, name FROM tournaments WHERE disciplineid = $1',
      [disciplineId]
    );
    const tournaments = tournamentsResult.rows;

    // Получаем матчи для всех турниров
    const tournamentIds = tournaments.map(t => t.tournamentid);
    let matches = [];
    if (tournamentIds.length > 0) {
      const matchesResult = await pool.query(
        'SELECT matchid, tournamentid, team1, team2, start_time, status, coefficients FROM matches WHERE tournamentid = ANY($1)',
        [tournamentIds]
      );
      matches = matchesResult.rows;
    }

    // Группируем матчи по турнирам
    const tournamentsWithMatches = tournaments.map(tournament => ({
      ...tournament,
      matches: matches.filter(m => m.tournamentid === tournament.tournamentid)
    }));

    res.json({
      discipline,
      tournaments: tournamentsWithMatches
    });
  } catch (error) {
    console.error('Ошибка при получении данных:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
