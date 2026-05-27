require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const {
  MYSQL_HOST = 'localhost',
  MYSQL_PORT = 3306,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE,
} = process.env;

if (!MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
  console.error('Missing MySQL configuration. Fill .env or environment variables.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Machines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      machine_name VARCHAR(255) NOT NULL,
      frame_number INT NOT NULL UNIQUE,
      score1 INT NOT NULL DEFAULT 0,
      score2 INT NOT NULL DEFAULT 0,
      score3 INT NOT NULL DEFAULT 0,
      score4 INT NOT NULL DEFAULT 0,
      score5 INT NOT NULL DEFAULT 0,
      score6 INT NOT NULL DEFAULT 0,
      score7 INT NOT NULL DEFAULT 0,
      score8 INT NOT NULL DEFAULT 0,
      score9 INT NOT NULL DEFAULT 0,
      score10 INT NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Players (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_name VARCHAR(255) NOT NULL UNIQUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      player_id INT NOT NULL,
      frame INT NOT NULL,
      machine_id INT NOT NULL,
      ball1 INT NOT NULL DEFAULT 0,
      ball2 INT NOT NULL DEFAULT 0,
      ball3 INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_player_frame (player_id, frame),
      INDEX idx_player_id (player_id),
      INDEX idx_machine_id (machine_id),
      CONSTRAINT fk_scores_player FOREIGN KEY (player_id) REFERENCES Players(id) ON DELETE CASCADE,
      CONSTRAINT fk_scores_machine FOREIGN KEY (machine_id) REFERENCES Machines(id) ON DELETE CASCADE
    )
  `);
}

function serializeMachine(row) {
  return {
    id: row.id,
    machine_name: row.machine_name,
    frame_number: row.frame_number,
    values: {
      1: row.score1,
      2: row.score2,
      3: row.score3,
      4: row.score4,
      5: row.score5,
      6: row.score6,
      7: row.score7,
      8: row.score8,
      9: row.score9,
      10: row.score10,
    },
  };
}

app.get('/api/machines', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM Machines ORDER BY frame_number ASC');
  res.json(rows.map(serializeMachine));
});

app.post('/api/machines', async (req, res) => {
  const { machine_name, frame_number, values } = req.body;
  if (!machine_name || !frame_number || !values) {
    return res.status(400).json({ error: 'machine_name, frame_number, and values are required' });
  }

  const params = [machine_name, frame_number];
  for (let i = 1; i <= 10; i += 1) {
    params.push(values[i] || 0);
  }

  const [result] = await pool.query(
    `INSERT INTO Machines (machine_name, frame_number, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );

  const [rows] = await pool.query('SELECT * FROM Machines WHERE id = ?', [result.insertId]);
  res.json(serializeMachine(rows[0]));
});

app.put('/api/machines/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { machine_name, frame_number, values } = req.body;
  if (!id || !machine_name || !frame_number || !values) {
    return res.status(400).json({ error: 'id, machine_name, frame_number, and values are required' });
  }

  const params = [machine_name, frame_number];
  for (let i = 1; i <= 10; i += 1) {
    params.push(values[i] || 0);
  }
  params.push(id);

  await pool.query(
    `UPDATE Machines SET machine_name = ?, frame_number = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?`,
    params
  );

  const [rows] = await pool.query('SELECT * FROM Machines WHERE id = ?', [id]);
  res.json(serializeMachine(rows[0]));
});

app.delete('/api/machines/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid machine id' });
  await pool.query('DELETE FROM Machines WHERE id = ?', [id]);
  res.json({ success: true });
});

app.get('/api/players', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM Players ORDER BY player_name ASC');
  res.json(rows);
});

app.post('/api/players', async (req, res) => {
  const { player_name } = req.body;
  if (!player_name) {
    return res.status(400).json({ error: 'player_name is required' });
  }

  try {
    const [result] = await pool.query('INSERT INTO Players (player_name) VALUES (?)', [player_name]);
    const [rows] = await pool.query('SELECT * FROM Players WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.query('SELECT * FROM Players WHERE player_name = ?', [player_name]);
      return res.json(rows[0]);
    }
    console.error(error);
    res.status(500).json({ error: 'Unable to add player' });
  }
});

app.get('/api/scores', async (req, res) => {
  const playerId = Number(req.query.playerId);
  if (!playerId) {
    return res.status(400).json({ error: 'playerId query parameter is required' });
  }

  const [rows] = await pool.query(
    `SELECT s.id, s.player_id, s.frame, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name, m.frame_number
     FROM Scores s
     JOIN Machines m ON m.id = s.machine_id
     WHERE s.player_id = ?
     ORDER BY s.frame ASC`,
    [playerId]
  );

  res.json(rows);
});

app.post('/api/scores', async (req, res) => {
  const { playerId, frame, machineId, ball1 = 0, ball2 = 0, ball3 = 0 } = req.body;
  if (!playerId || !frame || !machineId) {
    return res.status(400).json({ error: 'playerId, frame, and machineId are required' });
  }

  await pool.query(
    `INSERT INTO Scores (player_id, frame, machine_id, ball1, ball2, ball3)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), ball1 = VALUES(ball1), ball2 = VALUES(ball2), ball3 = VALUES(ball3)`,
    [playerId, frame, machineId, ball1, ball2, ball3]
  );

  const [rows] = await pool.query('SELECT * FROM Scores WHERE player_id = ? AND frame = ?', [playerId, frame]);
  res.json(rows[0]);
});

app.delete('/api/scores', async (req, res) => {
  const playerId = Number(req.query.playerId);
  if (!playerId) {
    return res.status(400).json({ error: 'playerId query parameter is required' });
  }
  await pool.query('DELETE FROM Scores WHERE player_id = ?', [playerId]);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`PinBowling server running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Unable to initialize database:', error);
    process.exit(1);
  });
