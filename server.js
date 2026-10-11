import express from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import dgram from 'dgram';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));
const sessionSecret = process.env.SESSION_SECRET || 'local-demo-secret-change-me';
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const eegUdpPort = Number(process.env.OPENBCI_UDP_PORT || 12345);
const eegLive = { updatedAt: 0, attention: null, quality: 0, bands: null, waveform: [], baseline: [], source: 'Waiting for OpenBCI GUI' };

function numericValues(value) {
  if (Array.isArray(value)) return value.flat(Infinity).filter(Number.isFinite);
  return [];
}
function receiveEegPacket(message) {
  try {
    const packet = JSON.parse(message.toString('utf8').trim());
    const type = String(packet.type || '').toLowerCase();
    if (type.includes('timeseries')) {
      const channelOne = Array.isArray(packet.data) && Array.isArray(packet.data[0]) ? numericValues(packet.data[0]) : numericValues(packet.data);
      if (channelOne.length) { eegLive.waveform = [...eegLive.waveform, ...channelOne].slice(-360); eegLive.updatedAt = Date.now(); eegLive.source = packet.type || 'OpenBCI GUI Time Series'; }
      return;
    }
    if (!type.includes('bandpower') && !type.includes('band_power')) return;
    const values = numericValues(packet.data);
    if (values.length < 5) return;
    const bands = Array.from({ length: 5 }, (_, band) => {
      const group = values.filter((_, index) => index % 5 === band);
      return group.reduce((sum, value) => sum + value, 0) / group.length;
    });
    const [delta, theta, alpha, beta] = bands;
    const betaTheta = beta / Math.max(theta, .000001);
    const alphaSuppression = 1 / Math.max(alpha, .000001);
    const signal = Math.log(betaTheta) + .35 * Math.log(alphaSuppression) - .15 * Math.log(Math.max(delta, .000001));
    if (eegLive.baseline.length < 50) eegLive.baseline.push(signal);
    const mean = eegLive.baseline.reduce((sum, value) => sum + value, 0) / eegLive.baseline.length;
    const variance = eegLive.baseline.reduce((sum, value) => sum + (value - mean) ** 2, 0) / eegLive.baseline.length;
    const sd = Math.max(Math.sqrt(variance), .15);
    eegLive.updatedAt = Date.now();
    eegLive.quality = Math.min(1, eegLive.baseline.length / 50);
    eegLive.attention = Math.round(Math.max(1, Math.min(100, 50 + 25 * Math.max(-3, Math.min(3, (signal - mean) / sd)))));
    eegLive.bands = { delta, theta, alpha, beta };
    eegLive.source = packet.type || 'OpenBCI GUI Band Power';
  } catch { /* Ignore unrelated or incomplete UDP packets. */ }
}
const eegUdp = dgram.createSocket('udp4');
eegUdp.on('message', receiveEegPacket);
eegUdp.on('error', error => console.error(`OpenBCI UDP bridge error: ${error.message}`));
eegUdp.bind(eegUdpPort, '127.0.0.1', () => console.log(`OpenBCI UDP bridge listening on 127.0.0.1:${eegUdpPort}`));

async function initializeDatabase() {
  if (!pool) return console.warn('DATABASE_URL is not set; sign-in is unavailable until you connect PostgreSQL/Tiger Data.');
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('Database tables are ready.');
}
function setSession(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email, name: user.display_name }, sessionSecret, { expiresIn: '7d' });
  res.cookie('attune_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });
}
function requireUser(req, res, next) {
  try { req.user = jwt.verify(req.cookies.attune_session, sessionSecret); next(); }
  catch { res.status(401).json({ error: 'Please sign in first.' }); }
}
function requireDatabase(res) { if (!pool) { res.status(503).json({ error: 'Database is not connected yet. Add DATABASE_URL to .env and restart.' }); return false; } return true; }
app.get('/api/health', (_req, res) => res.json({ status: 'ok', databaseConfigured: Boolean(pool), openBciBridgePort: eegUdpPort }));

app.post('/api/auth/signup', async (req, res) => {
  if (!requireDatabase(res)) return;
  const { name, email, password } = req.body;
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || String(password || '').length < 8) return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' });
  try {
    const user = { id: randomUUID(), email: email.trim().toLowerCase(), display_name: name.trim() };
    user.password_hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)', [user.id, user.email, user.password_hash, user.display_name]);
    await pool.query('INSERT INTO focus_scores (user_id, score, source) VALUES ($1, $2, $3)', [user.id, 72, 'onboarding-demo']);
    setSession(res, user); res.status(201).json({ user: { name: user.display_name, email: user.email } });
  } catch (error) {
    res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'An account with that email already exists.' : 'Could not create your account.' });
  }
});
app.post('/api/auth/signin', async (req, res) => {
  if (!requireDatabase(res)) return;
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  setSession(res, user); res.json({ user: { name: user.display_name, email: user.email } });
});
app.post('/api/auth/signout', (_req, res) => { res.clearCookie('attune_session'); res.status(204).end(); });
app.get('/api/me', requireUser, (req, res) => res.json({ user: { name: req.user.name, email: req.user.email } }));
app.get('/api/eeg/live', requireUser, (_req, res) => {
  const ageMs = eegLive.updatedAt ? Date.now() - eegLive.updatedAt : Infinity;
  res.json({ connected: ageMs < 3000, attention: eegLive.attention, quality: eegLive.quality, source: eegLive.source, bands: eegLive.bands, waveform: eegLive.waveform });
});
app.patch('/api/me', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const { name, email, password } = req.body;
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter a name and valid email address.' });
  if (password && password.length < 8) return res.status(400).json({ error: 'A new password must be at least 8 characters.' });
  try {
    const values = [name.trim(), email.trim().toLowerCase(), req.user.id];
    let query = 'UPDATE users SET display_name = $1, email = $2';
    if (password) { values.splice(2, 0, await bcrypt.hash(password, 12)); query += ', password_hash = $3 WHERE id = $4 RETURNING id, display_name, email'; }
    else query += ' WHERE id = $3 RETURNING id, display_name, email';
    const result = await pool.query(query, values);
    const user = result.rows[0]; setSession(res, user); res.json({ user: { name: user.display_name, email: user.email } });
  } catch (error) { res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'That email is already in use.' : 'Could not update account information.' }); }
});
app.patch('/api/me/wallet', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const walletAddress = String(req.body.walletAddress || '');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) return res.status(400).json({ error: 'That wallet address is not valid.' });
  try {
    await pool.query('UPDATE users SET wallet_address = $1 WHERE id = $2', [walletAddress, req.user.id]);
    res.json({ walletAddress });
  } catch (error) { res.status(409).json({ error: 'This wallet is already connected to another AttUne account.' }); }
});
app.get('/api/profile', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const user = await pool.query('SELECT display_name, email, wallet_address, created_at FROM users WHERE id = $1', [req.user.id]);
  const scores = await pool.query('SELECT score, source, created_at FROM focus_scores WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  const sessions = await pool.query('SELECT exercise, started_at, ended_at, average_focus FROM training_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 20', [req.user.id]);
  res.json({ user: user.rows[0], scores: scores.rows, sessions: sessions.rows });
});
app.get('/api/dashboard', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const scores = await pool.query("SELECT score, created_at FROM focus_scores WHERE user_id = $1 AND source = 'training-session' ORDER BY created_at DESC LIMIT 7", [req.user.id]);
  const sessions = await pool.query('SELECT exercise, started_at, average_focus FROM training_sessions WHERE user_id = $1 ORDER BY started_at DESC LIMIT 5', [req.user.id]);
  const duration = await pool.query(`SELECT COALESCE(SUM(EXTRACT(EPOCH FROM ended_at - started_at)), 0)::INT AS seconds
    FROM training_sessions WHERE user_id = $1 AND ended_at IS NOT NULL AND started_at::date = CURRENT_DATE`, [req.user.id]);
  res.json({ scores: scores.rows, sessions: sessions.rows, todaySeconds: duration.rows[0].seconds });
});
app.get('/api/ranking', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const result = await pool.query(
    `WITH eligible AS (
       SELECT user_id, average_focus AS score, EXTRACT(EPOCH FROM ended_at - started_at)::INT AS duration_seconds
       FROM training_sessions
       WHERE ended_at IS NOT NULL AND average_focus IS NOT NULL
         AND EXTRACT(EPOCH FROM ended_at - started_at) >= 60
     ), ranked AS (
       SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, duration_seconds DESC) AS global_rank FROM eligible
     )
     SELECT (SELECT COUNT(*)::INT FROM ranked) AS total_sessions,
       (SELECT row_to_json(m) FROM (SELECT global_rank, score, duration_seconds FROM ranked WHERE user_id = $1 ORDER BY global_rank LIMIT 1) m) AS best`, [req.user.id]
  );
  res.json(result.rows[0]);
});
app.get('/api/progress', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const ranges = { '7d': "CURRENT_DATE - INTERVAL '6 days'", '30d': "CURRENT_DATE - INTERVAL '29 days'", '1y': "CURRENT_DATE - INTERVAL '1 year'", all: "TIMESTAMPTZ '1970-01-01'" };
  const range = ranges[req.query.range] ? req.query.range : '7d';
  const since = ranges[range];
  const result = await pool.query(
    `WITH session_daily AS (
       SELECT started_at::date AS day, ROUND(AVG(average_focus))::INT AS session_average
       FROM training_sessions WHERE user_id = $1 AND average_focus IS NOT NULL
         AND started_at >= ${since} GROUP BY started_at::date
     ), ordered AS (
       SELECT r.recorded_at, r.focus_proxy,
         LAG(r.recorded_at) OVER (ORDER BY r.recorded_at) AS previous_at,
         LAG(r.focus_proxy) OVER (ORDER BY r.recorded_at) AS previous_focus
       FROM attention_readings r JOIN training_sessions s ON s.id = r.session_id
       WHERE s.user_id = $1 AND r.recorded_at >= ${since}
     ), reading_daily AS (
       SELECT recorded_at::date AS day, ROUND(AVG(focus_proxy))::INT AS reading_average,
         MAX(CASE WHEN recorded_at - previous_at BETWEEN INTERVAL '1 second' AND INTERVAL '2 seconds'
                  THEN LEAST(focus_proxy, previous_focus) END)::INT AS sustained_peak
       FROM ordered GROUP BY recorded_at::date
     )
     SELECT COALESCE(r.day, s.day) AS day, COALESCE(r.reading_average, s.session_average) AS average_attention,
       r.sustained_peak FROM reading_daily r FULL OUTER JOIN session_daily s ON r.day = s.day ORDER BY day`, [req.user.id]
  );
  res.json({ days: result.rows });
});
app.post('/api/sessions', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const id = randomUUID();
  const exercise = String(req.body.exercise || 'Orbital focus').slice(0, 80);
  await pool.query('INSERT INTO training_sessions (id, user_id, exercise) VALUES ($1, $2, $3)', [id, req.user.id, exercise]);
  res.status(201).json({ sessionId: id });
});
app.post('/api/sessions/:sessionId/readings', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const { focusProxy, blinkRate = null, eegQuality = null, source = 'browser-demo' } = req.body;
  if (!Number.isFinite(focusProxy) || focusProxy < 0 || focusProxy > 100) return res.status(400).json({ error: 'focusProxy must be between 0 and 100.' });
  const result = await pool.query(
    `INSERT INTO attention_readings (session_id, focus_proxy, blink_rate, eeg_quality, source)
     SELECT id, $1, $2, $3, $4 FROM training_sessions WHERE id = $5 AND user_id = $6 RETURNING id`,
    [focusProxy, blinkRate, eegQuality, source, req.params.sessionId, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Session not found.' });
  res.status(201).json({ saved: true });
});
app.patch('/api/sessions/:sessionId/complete', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const result = await pool.query(
    `UPDATE training_sessions SET ended_at = NOW(), average_focus = (
       SELECT ROUND(AVG(focus_proxy)::NUMERIC)::SMALLINT FROM attention_readings WHERE session_id = $1
     ) WHERE id = $1 AND user_id = $2 RETURNING average_focus`, [req.params.sessionId, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Session not found.' });
  const score = result.rows[0].average_focus;
  if (score !== null) await pool.query('INSERT INTO focus_scores (user_id, score, source) VALUES ($1, $2, $3)', [req.user.id, score, 'training-session']);
  res.json({ averageFocus: score });
});
app.get('/api/history', requireUser, async (req, res) => {
  if (!requireDatabase(res)) return;
  const sessions = await pool.query(
    `SELECT s.id, s.exercise, s.started_at, s.ended_at, s.average_focus, COUNT(r.id)::INT AS reading_count
     FROM training_sessions s LEFT JOIN attention_readings r ON r.session_id = s.id
     WHERE s.user_id = $1 GROUP BY s.id ORDER BY s.started_at DESC LIMIT 20`, [req.user.id]
  );
  const readings = await pool.query(
    `SELECT r.recorded_at, r.focus_proxy, r.blink_rate, r.eeg_quality, r.source
     FROM attention_readings r JOIN training_sessions s ON s.id = r.session_id
     WHERE s.user_id = $1 ORDER BY r.recorded_at DESC LIMIT 50`, [req.user.id]
  );
  res.json({ sessions: sessions.rows, readings: readings.rows });
});

const focusSystemPrompt = `You are AttUne Coach, a warm and concise ADHD attention-training guide.
You are not a doctor, do not diagnose ADHD, and do not give medical advice.
Do not recommend starting, stopping, or changing medications. If asked about medication, say to discuss it with a licensed clinician or pharmacist.
Give one supportive, practical suggestion in no more than two sentences.
The user is doing a short EEG attention-training exercise where they watch an orb.`;

app.post('/api/coach', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Gemini is not configured yet. Add GEMINI_API_KEY to .env.' });
  }
  try {
    const { message = 'Help me settle into this attention-training session.', focus = 42 } = req.body;
    const isRelaxation = /relaxation|meditation|calm neurofeedback/i.test(message);
    const systemPrompt = isRelaxation
      ? `You are AttUne Meditation Guide, a warm and concise relaxation-training companion. The user is watching a single live EEG waveform, not an orb. Invite slow breathing and gentle observation of the waveform without interpreting it. You are not a doctor, do not diagnose, and do not give medical advice. Give one practical suggestion in no more than two sentences.`
      : focusSystemPrompt;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: `${systemPrompt}\nCurrent focus estimate: ${focus}/100.\nUser says: ${message}`,
      config: { maxOutputTokens: 70, temperature: 0.6 }
    });
    res.json({ text: response.text || 'Take one gentle breath and return your attention to the orb.' });
  } catch (error) {
    console.error('Gemini request failed:', error.message);
    res.status(502).json({ error: `Gemini could not respond. ${error.message}` });
  }
});

app.post('/api/speak', async (req, res) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs is not configured yet. Add ELEVENLABS_API_KEY to .env.' });
  }
  try {
    const text = String(req.body.text || '').slice(0, 700);
    if (!text) return res.status(400).json({ error: 'Text is required.' });
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' })
    });
    if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}: ${await response.text()}`);
    res.type('audio/mpeg').send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('ElevenLabs request failed:', error.message);
    res.status(502).json({ error: `ElevenLabs could not create audio. ${error.message}` });
  }
});

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`AttUne is running at http://localhost:${port}`)))
  .catch(error => { console.error('Database setup failed:', error.message); process.exit(1); });
