const pages = document.querySelectorAll('.page');
const nav = document.querySelectorAll('[data-page]');
nav.forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('hidden', page.id !== button.dataset.page));
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.page === button.dataset.page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));
let seconds = 0;
let interval;
let activeSessionId;
let targetTimeout;
let reactionStartedAt;
let reactionTimes = [];
let clickTargets = 0;
let clickMisses = 0;
let falseAlarms = 0;
let clockwise = true;
let orbitFrame;
let orbitAngle = 0;
let activeVoice;
let instructionsPlaying = false;
let latestAttentionScore = 42;
const start = document.querySelector('#start');
const stage = document.querySelector('#stage');
const orb = document.querySelector('#orb');
const timer = document.querySelector('#timer');
const percent = document.querySelector('#percent');
const fill = document.querySelector('#fill');
const status = document.querySelector('#status');
const overviewDate = document.querySelector('#dashboard .topbar .eyebrow');
if (overviewDate) overviewDate.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
const attentionNav = Array.from(document.querySelectorAll('.nav')).find(button => button.dataset.page === 'training');
if (attentionNav) attentionNav.querySelector('span').textContent = 'Attention training';
document.querySelector('#training .instruction h1').textContent = 'Attention training';
const relaxationNav = document.createElement('button');
relaxationNav.className = 'nav'; relaxationNav.dataset.page = 'relaxation'; relaxationNav.innerHTML = '☾ <span>Relaxation</span>';
attentionNav?.insertAdjacentElement('afterend', relaxationNav);
const relaxationPage = document.createElement('main');
relaxationPage.id = 'relaxation'; relaxationPage.className = 'page hidden';
relaxationPage.innerHTML = `<header class="training-header"><button class="back" data-page="dashboard">← Back to dashboard</button><div class="brand"><span>✦</span> AttUne</div><div id="relax-eeg-status" class="connected">EEG waiting</div></header><section class="relaxation-layout"><div class="instruction"><p class="eyebrow">CALM NEUROFEEDBACK</p><h1>Relaxation training</h1><p>Rest your attention on the living EEG waveform. There is no orb in this exercise.</p><ol><li>Connect OpenBCI GUI’s <b>Time Series Raw</b> UDP stream to port 12345</li><li>Watch the signal gently while breathing slowly</li><li>Let the guidance play without trying to force a result</li></ol><button id="relax-start" class="primary big">Begin relaxation →</button><small>◌ Wellness training only. This is not medical advice or a diagnostic tool.</small></div><div class="relax-card"><div class="wave-head"><span>CHANNEL 1 · LIVE EEG</span><b id="relax-timer">00:00</b></div><canvas id="eeg-waveform" width="720" height="300" aria-label="Live one-channel EEG waveform"></canvas><p id="relax-wave-status">Waiting for OpenBCI GUI Time Series Raw data.</p><div class="relax-guide"><b>AttUne Meditation Guide</b><p id="relax-guidance">When you begin, I’ll guide you to observe the waveform with a calm, soft focus.</p><small id="relax-guide-status">Gemini-powered · ElevenLabs voice</small></div></div></section>`;
document.body.insertBefore(relaxationPage, document.querySelector('#auth-gate'));
relaxationNav.addEventListener('click', () => { document.querySelectorAll('.page').forEach(page => page.classList.toggle('hidden', page.id !== 'relaxation')); document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.page === 'relaxation')); window.scrollTo({ top: 0, behavior: 'smooth' }); });
relaxationPage.querySelector('[data-page="dashboard"]').addEventListener('click', () => attentionNav?.closest('nav').querySelector('[data-page="dashboard"]')?.click());
let latestEegWaveform = [];
let relaxationSeconds = 0;
let relaxationInterval;
let relaxationSessionId;
async function saveRelaxationReading(score) {
  if (!relaxationSessionId) return;
  await fetch(`/api/sessions/${relaxationSessionId}/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ focusProxy: score, eegQuality: eegLiveQuality, source: 'relaxation-eeg' }) }).catch(() => {});
}
async function completeRelaxationSession() {
  if (!relaxationSessionId) return;
  await fetch(`/api/sessions/${relaxationSessionId}/complete`, { method: 'PATCH' }).catch(() => {});
  relaxationSessionId = undefined; loadDashboard(); loadProgress(); loadHistory(); loadProfile(); loadGlobalRanking();
}
function drawEegWaveform(samples) {
  const canvas = document.querySelector('#eeg-waveform'); if (!canvas) return;
  const context = canvas.getContext('2d'); const { width, height } = canvas;
  context.fillStyle = '#071323'; context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(125,206,250,.18)'; context.lineWidth = 1;
  for (let y = 45; y < height; y += 55) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  if (!samples.length) return;
  const center = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const scale = Math.max(...samples.map(value => Math.abs(value - center)), 1);
  context.strokeStyle = '#72d7ff'; context.lineWidth = 2; context.beginPath();
  samples.forEach((value, index) => { const x = index * width / Math.max(1, samples.length - 1); const y = height / 2 - ((value - center) / scale) * height * .38; index ? context.lineTo(x, y) : context.moveTo(x, y); });
  context.stroke();
}
async function generateRelaxationGuidance(introduction = false) {
  const message = 'Generate one gentle, non-medical meditation cue for a user watching their live EEG waveform during relaxation training. Do not mention an orb. Keep it under two sentences.';
  const statusNode = document.querySelector('#relax-guide-status'); const guidance = document.querySelector('#relax-guidance');
  statusNode.textContent = 'Gemini is preparing guidance…';
  try { const response = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, focus: eegAvailable ? Math.round(eegComponent * 100) : 50 }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); guidance.textContent = data.text; statusNode.textContent = 'ElevenLabs is speaking…'; if (!instructionsPlaying) speakGuidance(data.text, introduction); }
  catch (error) { statusNode.textContent = error.message || 'Guidance is unavailable right now.'; }
}
document.querySelector('#relax-start').addEventListener('click', () => {
  const running = !relaxationInterval; document.querySelector('#relax-start').textContent = running ? 'End relaxation' : 'Begin relaxation →';
  if (!running) { clearInterval(relaxationInterval); relaxationInterval = undefined; completeRelaxationSession(); return; }
  relaxationSeconds = 0; generateRelaxationGuidance(true);
  fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: 'Relaxation training' }) }).then(response => response.json()).then(data => { relaxationSessionId = data.sessionId; }).catch(() => { relaxationSessionId = undefined; });
  relaxationInterval = setInterval(() => { relaxationSeconds += 1; const score = eegAvailable ? Math.round(eegComponent * 100) : 50; document.querySelector('#relax-timer').textContent = `${String(Math.floor(relaxationSeconds / 60)).padStart(2, '0')}:${String(relaxationSeconds % 60).padStart(2, '0')}`; saveRelaxationReading(score); updateOverview(score, relaxationSeconds); if (relaxationSeconds % 45 === 0 && !instructionsPlaying) generateRelaxationGuidance(); }, 1000);
});
let todayTrainingSeconds = 0;
document.querySelector('.insight')?.remove();
document.querySelector('.stack')?.remove();
document.querySelector('.recent')?.remove();
document.querySelector('.score-card .text-button')?.remove();
document.querySelector('.bell')?.remove();
const rankingCard = document.createElement('article');
rankingCard.className = 'card streak ranking-card';
rankingCard.innerHTML = '<div class="mini-icon">⌁</div><p class="eyebrow">GLOBAL TRAINING RANK</p><h3 id="global-rank">— <small>of —</small></h3><p id="global-rank-copy">Complete a 1-minute session to join the ranking.</p>';
document.querySelector('.grid-two')?.append(rankingCard);
document.querySelector('.avatar')?.addEventListener('click', () => {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('hidden', page.id !== 'profile'));
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.page === 'profile'));
  loadProfile(); window.scrollTo({ top: 0, behavior: 'smooth' });
});
const support = document.querySelector('.support');
if (support) {
  support.innerHTML = '✦ <span><b>Need a hand?</b><small>Ask Gemini-powered AttUne Coach</small></span>';
  support.addEventListener('click', () => {
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('hidden', page.id !== 'training'));
    document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.page === 'training'));
    setTimeout(() => document.querySelector('#coach-input')?.focus(), 0);
  });
}
function formatTrainingTime(value) {
  const minutes = Math.floor(value / 60); const seconds = value % 60;
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
function updateOverview(score, extraSeconds = 0) {
  const visibleScore = Number.isFinite(score) ? Math.round(score) : null;
  const ring = document.querySelector('.score-ring');
  if (visibleScore !== null) {
    ring.style.background = `conic-gradient(var(--blue) 0 ${visibleScore}%,#e5f1f7 ${visibleScore}%)`;
    ring.querySelector('strong').textContent = visibleScore;
    const label = visibleScore >= 75 ? 'Strong focus' : visibleScore >= 60 ? 'Steady focus' : visibleScore >= 45 ? 'Building focus' : 'Time to reset';
    document.querySelector('.score-card h2').textContent = label;
    ring.querySelector('em').textContent = label;
    document.querySelector('.score-card p:not(.eyebrow)').innerHTML = 'Your live training proxy updates<br>as new attention signals arrive.';
  } else {
    ring.style.background = 'conic-gradient(#e5f1f7 0 100%)';
    ring.querySelector('strong').textContent = '—';
    ring.querySelector('em').textContent = 'No session yet';
    document.querySelector('.score-card h2').textContent = 'Ready when you are';
    document.querySelector('.score-card p:not(.eyebrow)').textContent = 'Complete a training session to build your first focus score.';
  }
  document.querySelector('.streak .eyebrow').textContent = 'TODAY’S TRAINING TIME';
  document.querySelector('.streak h3').innerHTML = `${formatTrainingTime(todayTrainingSeconds + extraSeconds)} <small>today</small>`;
  document.querySelector('.streak .week')?.remove();
}
document.querySelector('.instruction > p:not(.eyebrow)').textContent = 'Follow the orb with your eyes. When the orb turns red, press the fixed response button as quickly as you can.';
const responseButton = document.createElement('button');
responseButton.id = 'reaction-button';
responseButton.className = 'reaction-button';
responseButton.disabled = true;
responseButton.textContent = 'WAIT FOR RED';
stage.append(responseButton);

async function saveReading(focus) {
  if (!activeSessionId) return;
  await fetch(`/api/sessions/${activeSessionId}/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ focusProxy: focus, source: 'browser-demo' }) }).catch(() => {});
}
async function completeSession() {
  if (!activeSessionId) return;
  await fetch(`/api/sessions/${activeSessionId}/complete`, { method: 'PATCH' }).catch(() => {});
  activeSessionId = undefined;
  loadHistory();
  loadProgress();
  loadDashboard();
  loadGlobalRanking();
}
async function loadGlobalRanking() {
  try {
    const response = await fetch('/api/ranking'); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (!data.best) return;
    document.querySelector('#global-rank').innerHTML = `#${data.best.global_rank} <small>of ${data.total_sessions}</small>`;
    document.querySelector('#global-rank-copy').textContent = `Best eligible session: ${data.best.score}/100 for ${Math.floor(data.best.duration_seconds / 60)} min.`;
  } catch { document.querySelector('#global-rank-copy').textContent = 'Ranking is unavailable until the database is connected.'; }
}
let pendingAttentionStart = false;
async function beginAttentionSession() {
  stage.classList.add('running');
  start.disabled = false; start.textContent = 'Pause session Ⅱ'; status.textContent = 'SESSION IN PROGRESS';
  if (!activeSessionId) seconds = 0;
  reactionTimes = []; clickTargets = 0; clickMisses = 0; falseAlarms = 0; clockwise = Math.random() > .5;
  document.querySelector('#direction-readout').textContent = `ORBIT: ${clockwise ? 'CLOCKWISE' : 'COUNTERCLOCKWISE'}`;
  if (!cameraStream) cameraStatus.textContent = 'Before you begin, choose “Turn on camera” below so gaze tracking can contribute to your score.';
  animateOrb(performance.now());
  speakGuidance('Welcome to Orbital Focus. First, turn on your camera below and allow access. Then follow the large orb with your eyes. When the orb turns red, press the fixed response button as quickly as you can.', true);
  scheduleTarget();
  try {
    const response = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise: 'Attention training' }) });
    const data = await response.json();
    activeSessionId = data.sessionId;
    if (activeSessionId) saveReading(Number(percent.textContent.replace('%', '')));
  } catch { activeSessionId = undefined; }
  interval = setInterval(() => {
    seconds += 1;
    const focus = calculateAttentionScore();
    latestAttentionScore = focus;
    updateOverview(focus, seconds);
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    percent.textContent = `${focus}%`;
    fill.style.width = `${focus}%`;
    document.querySelector('#eeg-readout').textContent = eegAvailable ? `EEG: ${Math.round(eegComponent * 100)}%` : 'EEG: CYTON+DAISY NOT CONNECTED';
    saveReading(focus);
    if (seconds > 0 && seconds % 30 === 0 && !instructionsPlaying) {
      askCoach(`The session has run for ${seconds} seconds with attention proxy ${focus}. Give one short automatic coaching cue.`)
        .then(() => { if (!instructionsPlaying) speakGuidance(coachMessage.textContent); });
    }
  }, 1000);
}
start.addEventListener('click', () => {
  if (stage.classList.contains('running')) {
    stage.classList.remove('running'); clearInterval(interval); clearTimeout(targetTimeout); cancelAnimationFrame(orbitFrame);
    orb.classList.remove('target'); responseButton.disabled = true; start.textContent = 'Begin training →'; status.textContent = 'SESSION COMPLETE'; completeSession(); return;
  }
  if (faceLandmarker && cameraStream) { beginAttentionSession(); return; }
  pendingAttentionStart = true;
  start.disabled = true; start.textContent = 'Starting eye tracker…'; status.textContent = 'CAMERA & EYE TRACKER CONNECTING';
  if (!cameraStream) { cameraStatus.textContent = 'Requesting camera access…'; cameraToggle.click(); }
});
function animateOrb(timestamp) {
  if (!stage.classList.contains('running')) return;
  orbitAngle += (clockwise ? 1 : -1) * 0.035;
  const x = 50 + Math.cos(orbitAngle) * 32;
  const y = 51 + Math.sin(orbitAngle) * 32;
  orb.style.left = `${x}%`;
  orb.style.top = `${y}%`;
  orbitFrame = requestAnimationFrame(animateOrb);
}
function scheduleTarget() { clearTimeout(targetTimeout); targetTimeout = setTimeout(() => { if (!stage.classList.contains('running')) return; clickTargets += 1; responseButton.disabled = false; responseButton.textContent = 'RESPOND'; orb.classList.add('target'); reactionStartedAt = performance.now(); targetTimeout = setTimeout(() => { orb.classList.remove('target'); responseButton.disabled = true; responseButton.textContent = 'WAIT FOR RED'; clickMisses += 1; document.querySelector('#reaction-readout').textContent = 'REACTION: MISSED'; scheduleTarget(); }, 3000); }, 7000 + Math.random() * 7000); }
responseButton.addEventListener('click', () => { if (!orb.classList.contains('target')) { if (stage.classList.contains('running')) falseAlarms += 1; return; } const reaction = Math.round(performance.now() - reactionStartedAt); const reactionPercent = Math.round(clamp(100 - (reaction - 200) / 10, 0, 100)); reactionTimes.push(reaction); orb.classList.remove('target'); responseButton.disabled = true; responseButton.textContent = 'WAIT FOR RED'; clearTimeout(targetTimeout); document.querySelector('#reaction-readout').textContent = `REACTION: ${reaction} MS · ${reactionPercent}%`; scheduleTarget(); });

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function median(values) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function z(value, mean, sd, direction) { return clamp(direction * (value - mean) / sd, -3, 3); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function weightedStrength(metrics) {
  const usable = metrics.filter(metric => Number.isFinite(metric.value));
  if (!usable.length) return null;
  const numerator = usable.reduce((sum, metric) => sum + metric.weight * z(metric.value, metric.mean, metric.sd, metric.direction), 0);
  return numerator / usable.reduce((sum, metric) => sum + metric.weight, 0);
}
function calculateAttentionScore() {
  const hitRate = clickTargets ? reactionTimes.length / clickTargets : null;
  const rt = median(reactionTimes);
  const rtVariation = reactionTimes.length > 1 ? Math.sqrt(average(reactionTimes.map(value => (value - average(reactionTimes)) ** 2))) : null;
  const lapseRate = clickTargets ? clickMisses / clickTargets : null;
  const falseAlarmRate = clickTargets ? falseAlarms / clickTargets : null;
  const clickStrength = (reactionTimes.length + clickMisses) >= 1 ? weightedStrength([
    { value: hitRate, mean: .95, sd: .06, direction: 1, weight: 1 }, { value: rt, mean: 700, sd: 200, direction: -1, weight: .8 },
    { value: rtVariation, mean: 80, sd: 45, direction: -1, weight: 1 }, { value: lapseRate, mean: .05, sd: .08, direction: -1, weight: 1 },
    { value: falseAlarmRate, mean: .03, sd: .05, direction: -1, weight: .5 }
  ]) : null;
  const eyeStrength = getEyeStrength();
  const components = [
    { value: clickStrength, weight: .45 * Math.min(1, clickTargets / 8) }, { value: eyeStrength, weight: .35 * eyeDataQuality },
    { value: eegAvailable ? eegStrength : null, weight: .20 }
  ].filter(component => Number.isFinite(component.value) && component.weight > 0);
  if (!components.length) return 50;
  const totalStrength = components.reduce((sum, component) => sum + component.value * component.weight, 0) / components.reduce((sum, component) => sum + component.weight, 0);
  return Math.round(clamp(50 + 25 * totalStrength, 1, 100));
}

const coachMessage = document.querySelector('#coach-message');
const voice = document.querySelector('#voice');
const coachStatus = document.querySelector('#coach-status');
async function askCoach(message) {
  coachMessage.textContent = 'AttUne Coach is thinking…';
  coachStatus.textContent = 'Asking Gemini…';
  try {
    const response = await fetch('/api/coach', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, focus: Number(percent.textContent.replace('%', '')) })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gemini returned an unknown error.');
    coachMessage.textContent = data.text;
    coachStatus.textContent = 'Gemini response received.';
  } catch (error) {
    coachMessage.textContent = 'AttUne Coach needs a quick setup check.';
    coachStatus.textContent = error.message;
  }
}
document.querySelectorAll('.coach-prompt[data-message]').forEach(button => button.addEventListener('click', () => askCoach(button.dataset.message)));
const instantGuidance = [
  'Let your shoulders soften. Pick one point on the orb and simply return to it when your mind drifts.',
  'Try a 10-second reset: breathe out slowly, unclench your jaw, and bring your gaze back to center.',
  'You do not need perfect focus. Notice the next distraction, let it pass, and rejoin the exercise.'
];
document.querySelector('#auto-guide').addEventListener('click', () => {
  const focus = Number(percent.textContent.replace('%', ''));
  coachMessage.textContent = focus < 55 ? instantGuidance[1] : instantGuidance[seconds % instantGuidance.length];
  coachStatus.textContent = 'Instant on-device guidance — no Gemini wait.';
});
document.querySelector('#coach-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#coach-input');
  const question = input.value.trim();
  if (!question) return;
  askCoach(question);
  input.value = '';
});
voice.addEventListener('click', () => {
  if (instructionsPlaying) { coachStatus.textContent = 'Directions are still playing. The coach will speak after they finish.'; return; }
  speakGuidance(coachMessage.textContent);
});
function speakGuidance(text, isInstruction = false) {
  if (activeVoice) { activeVoice.pause(); activeVoice = undefined; }
  if (isInstruction) instructionsPlaying = true;
  voice.classList.add('active'); coachStatus.textContent = 'Creating ElevenLabs audio…';
  return fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    .then(async response => { const type = response.headers.get('content-type'); const data = type?.includes('application/json') ? await response.json() : null; if (!response.ok) throw new Error(data?.error || 'ElevenLabs returned an unknown error.'); return response.blob(); })
    .then(blob => {
      activeVoice = new Audio(URL.createObjectURL(blob));
      activeVoice.onended = () => { activeVoice = undefined; voice.classList.remove('active'); if (isInstruction) instructionsPlaying = false; coachStatus.textContent = 'Ready to connect.'; };
      coachStatus.textContent = 'Playing ElevenLabs audio.';
      return activeVoice.play();
    })
    .catch(error => { voice.classList.remove('active'); if (isInstruction) instructionsPlaying = false; coachStatus.textContent = error.message || 'Voice guidance needs ElevenLabs to be available.'; });
}

const cameraToggle = document.querySelector('#camera-toggle');
const cameraPreview = document.querySelector('#camera-preview');
const cameraStatus = document.querySelector('#camera-status');
let cameraStream;
let faceLandmarker;
let trackingFrame;
let gazeSamples = [];
let lastVideoTime = -1;
let gazeDetected = false;
let eyeDataQuality = 0;
let eegAvailable = false;
let eegStrength = null;
let eegComponent = 0;
let eegLiveQuality = 0;
async function refreshEeg() {
  try {
    const response = await fetch('/api/eeg/live');
    if (!response.ok) return;
    const eeg = await response.json();
    eegLiveQuality = Number(eeg.quality) || 0;
    latestEegWaveform = Array.isArray(eeg.waveform) ? eeg.waveform : [];
    drawEegWaveform(latestEegWaveform);
    document.querySelector('#relax-wave-status').textContent = latestEegWaveform.length ? `Receiving ${latestEegWaveform.length} Channel 1 samples locally.` : 'Waiting for OpenBCI GUI Time Series Raw data.';
    eegAvailable = eeg.connected && Number.isFinite(eeg.attention);
    if (eegAvailable) {
      eegComponent = eeg.attention / 100;
      eegStrength = clamp((eeg.attention - 50) / 25, -3, 3);
      document.querySelector('.connected').innerHTML = '<i></i> EEG live';
      document.querySelector('#eeg-readout').textContent = `EEG: ${eeg.attention}% LIVE`;
      document.querySelector('#relax-eeg-status').innerHTML = '<i></i> EEG live';
    } else {
      eegStrength = null;
      document.querySelector('.connected').textContent = 'EEG not connected';
      document.querySelector('#relax-eeg-status').textContent = 'EEG waiting';
    }
  } catch { eegAvailable = false; eegStrength = null; }
}
setInterval(refreshEeg, 1000);
refreshEeg();

async function loadGazeTracker() {
  let vision;
  try {
    vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs');
  } catch {
    vision = await import('https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs?module');
  }
  const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
  faceLandmarker = await vision.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' },
    runningMode: 'VIDEO', numFaces: 1
  });
}
function eyeCoordinate(landmarks, iris, edgeA, edgeB, axis) {
  return (landmarks[iris][axis] - (landmarks[edgeA][axis] + landmarks[edgeB][axis]) / 2) / Math.abs(landmarks[edgeA][axis] - landmarks[edgeB][axis]);
}
function trackGaze(now) {
  if (!cameraStream || !faceLandmarker) return;
  if (cameraPreview.currentTime !== lastVideoTime) {
    lastVideoTime = cameraPreview.currentTime;
    const landmarks = faceLandmarker.detectForVideo(cameraPreview, now).faceLandmarks?.[0];
    if (landmarks?.[468] && landmarks?.[473]) {
      const gazeX = (eyeCoordinate(landmarks, 468, 33, 133, 'x') + eyeCoordinate(landmarks, 473, 362, 263, 'x')) / 2;
      const gazeY = (eyeCoordinate(landmarks, 468, 159, 145, 'y') + eyeCoordinate(landmarks, 473, 386, 374, 'y')) / 2;
      const expectedX = Math.cos(orbitAngle);
      const expectedY = Math.sin(orbitAngle);
      gazeSamples.push({ gazeX, gazeY, expectedX, expectedY, time: now });
      gazeSamples = gazeSamples.filter(sample => now - sample.time < 10000);
      gazeDetected = true;
      const eyeStrength = getEyeStrength();
      document.querySelector('#eye-readout').textContent = Number.isFinite(eyeStrength) ? `EYE: ${Math.round(clamp(50 + 25 * eyeStrength, 1, 100))}% LIVE` : 'EYE: CALIBRATING…';
      cameraStatus.textContent = Number.isFinite(eyeStrength) ? 'Gaze landmark detected — eye signal is contributing to your attention proxy.' : 'Gaze landmark detected — collecting a few seconds of movement.';
    } else {
      gazeDetected = false;
      document.querySelector('#eye-readout').textContent = 'EYE: FACE NOT FOUND';
      cameraStatus.textContent = 'Keep your face and both eyes in the camera frame.';
    }
  }
  trackingFrame = requestAnimationFrame(trackGaze);
}
function getEyeStrength() {
  if (gazeSamples.length < 120) { eyeDataQuality = 0; return null; }
  const correlation = (gazeKey, expectedKey, lag) => {
    const gazes = gazeSamples.slice(lag).map(sample => sample[gazeKey]); const expected = gazeSamples.slice(0, -lag || undefined).map(sample => sample[expectedKey]);
    const gazeMean = average(gazes); const expectedMean = average(expected);
    const numerator = gazes.reduce((sum, value, index) => sum + (value - gazeMean) * (expected[index] - expectedMean), 0);
    const denom = Math.sqrt(gazes.reduce((sum, value) => sum + (value - gazeMean) ** 2, 0) * expected.reduce((sum, value) => sum + (value - expectedMean) ** 2, 0));
    return denom ? Math.abs(numerator / denom) : 0;
  };
  let pursuit = 0;
  for (let lag = 1; lag <= 45; lag += 3) pursuit = Math.max(pursuit, (correlation('gazeX', 'expectedX', lag) + correlation('gazeY', 'expectedY', lag)) / 2);
  const trackingError = 1 - pursuit;
  eyeDataQuality = Math.min(1, (gazeSamples.length - 120) / 180) * Math.min(1, pursuit / .45);
  return weightedStrength([
    { value: pursuit, mean: .55, sd: .20, direction: 1, weight: 1 },
    { value: trackingError, mean: .45, sd: .20, direction: -1, weight: .8 }
  ]);
}
cameraToggle.addEventListener('click', async () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = undefined;
    cameraPreview.srcObject = null;
    cameraPreview.classList.remove('visible');
    cameraToggle.textContent = 'Turn on camera';
    cameraStatus.textContent = 'Camera off';
    document.querySelector('#eye-readout').textContent = 'EYE: CAMERA OFF';
    cancelAnimationFrame(trackingFrame); gazeSamples = []; gazeDetected = false;
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    cameraPreview.srcObject = cameraStream;
    cameraPreview.classList.add('visible');
    cameraToggle.textContent = 'Turn off camera';
    cameraStatus.textContent = 'Loading private, on-device gaze landmarks…';
    gazeSamples = [];
    await loadGazeTracker();
    cameraStatus.textContent = 'Look at the orb. Gaze tracking is active on this device.';
    trackingFrame = requestAnimationFrame(trackGaze);
    if (pendingAttentionStart) { pendingAttentionStart = false; beginAttentionSession(); }
  } catch (error) {
    console.error('Eye-tracker start failed:', error);
    cameraStatus.textContent = `Eye tracker could not start: ${error.message || 'please reload and try again.'}`;
    if (pendingAttentionStart) { pendingAttentionStart = false; start.disabled = false; start.textContent = 'Begin training →'; status.textContent = 'CAMERA REQUIRED'; }
  }
});

const authGate = document.querySelector('#auth-gate');
const authCard = document.querySelector('.auth-card');
const authForm = document.querySelector('#auth-form');
const authSwitch = document.querySelector('#auth-switch');
const authTitle = document.querySelector('#auth-title');
const authCopy = document.querySelector('#auth-copy');
const authError = document.querySelector('#auth-error');
const authSubmit = document.querySelector('#auth-submit');
let creatingAccount = false;

function setSignedInUser(user) {
  authGate.classList.add('hidden');
  document.querySelector('.topbar h1').textContent = `Hey, ${user.name}`;
  document.querySelector('.avatar').textContent = user.name.slice(0, 2).toUpperCase();
  loadHistory();
  loadProfile();
  loadProgress();
  loadDashboard();
  loadGlobalRanking();
}
async function loadDashboard() {
  try {
    const response = await fetch('/api/dashboard'); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    todayTrainingSeconds = Number(data.todaySeconds) || 0;
    updateOverview(data.scores[0] ? Number(data.scores[0].score) : null);
  } catch { updateOverview(null); }
}
let progressRange = '7d';
async function loadProgress() {
  const panel = document.querySelector('.grid-two .panel');
  try {
    const response = await fetch(`/api/progress?range=${progressRange}`); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const maximumPoints = progressRange === '7d' ? 7 : 30;
    const step = Math.max(1, Math.ceil(data.days.length / maximumPoints));
    const days = data.days.filter((_, index) => index % step === 0 || index === data.days.length - 1);
    const points = days.map((day, index) => `${8 + index * (584 / Math.max(1, days.length - 1))},${150 - Number(day.average_attention) * 1.35}`).join(' ');
    const today = data.days[data.days.length - 1];
    const message = data.days.length ? 'Daily average is calculated from saved session readings.' : 'No completed saved sessions yet. Finish a training session to populate this chart.';
    panel.innerHTML = `<div class="panel-title"><div><p class="eyebrow">FOCUS PROGRESS</p><h2>Daily attention history</h2></div><select id="progress-range" class="select" aria-label="Focus progress period"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="1y">Last year</option><option value="all">All time</option></select></div><div class="chart"><svg viewBox="0 0 600 160" preserveAspectRatio="none"><path d="M0 120 H600 M0 75 H600 M0 30 H600"/><polyline points="${points}"/></svg></div><div class="days">${days.map(day => `<span>${new Date(day.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`).join('')}</div><div class="stats"><div><strong>${today?.average_attention ?? '—'}</strong><small>latest daily average</small></div><div><strong>${today?.sustained_peak ?? '—'}</strong><small>best 2-second sustained score</small></div><div><strong>${data.days.length}</strong><small>days with saved data</small></div></div><p class="table-note">${message}</p>`;
    const rangeControl = document.querySelector('#progress-range'); rangeControl.value = progressRange;
    rangeControl.addEventListener('change', () => { progressRange = rangeControl.value; loadProgress(); });
  } catch (error) { panel.innerHTML = `<div class="panel-title"><div><p class="eyebrow">FOCUS PROGRESS</p><h2>Daily attention history</h2></div></div><p class="table-note">Progress could not load: ${error.message || 'restart AttUne and try again.'}</p>`; }
}
async function loadProfile() {
  try {
    const response = await fetch('/api/profile'); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const user = data.user; const scores = data.scores; const sessions = data.sessions;
    document.querySelector('#profile-name').textContent = `${user.display_name}'s focus story`;
    document.querySelector('#profile-card-name').textContent = user.display_name;
    document.querySelector('#profile-email').textContent = user.email;
    document.querySelector('#profile-avatar').textContent = user.display_name.slice(0, 2).toUpperCase();
    document.querySelector('#profile-member').textContent = `Member since ${new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
    document.querySelector('#account-name').value = user.display_name; document.querySelector('#account-email').value = user.email;
    if (user.wallet_address) { document.querySelector('#solana-status').textContent = `Wallet saved: ${user.wallet_address.slice(0, 4)}…${user.wallet_address.slice(-4)}`; document.querySelector('#solana-claim').disabled = false; }
    const completed = sessions.filter(session => session.average_focus !== null);
    document.querySelector('#profile-session-count').textContent = sessions.length;
    document.querySelector('#profile-average').textContent = completed.length ? `${Math.round(completed.reduce((sum, session) => sum + Number(session.average_focus), 0) / completed.length)}` : '—';
    document.querySelector('#profile-best').textContent = scores.length ? Math.max(...scores.map(score => Number(score.score))) : '—';
    const bars = document.querySelector('#score-bars'); bars.replaceChildren();
    if (!scores.length) bars.innerHTML = '<p>Complete a session to build your trend.</p>';
    else scores.slice(0, 12).reverse().forEach(score => { const bar = document.createElement('i'); bar.style.height = `${Math.max(12, score.score)}%`; bar.title = `${score.score}/100 on ${new Date(score.created_at).toLocaleDateString()}`; bars.append(bar); });
    const sessionBody = document.querySelector('#profile-sessions'); sessionBody.replaceChildren();
    if (!sessions.length) sessionBody.innerHTML = '<tr><td colspan="3">No saved sessions yet.</td></tr>';
    else sessions.forEach(session => { const row = document.createElement('tr'); [session.exercise, new Date(session.started_at).toLocaleDateString(), session.average_focus === null ? 'In progress' : `${session.average_focus}/100`].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }); sessionBody.append(row); });
  } catch (error) { document.querySelector('#account-status').textContent = error.message || 'Profile data will appear after you connect the database.'; }
}
async function loadHistory() {
  const body = document.querySelector('#session-history');
  const status = document.querySelector('#history-status');
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load saved sessions.');
    body.replaceChildren();
    if (!data.sessions.length) {
      body.innerHTML = '<tr><td colspan="4">No saved sessions yet. Start a training session to save your first one.</td></tr>';
    } else {
      data.sessions.forEach(session => {
        const row = document.createElement('tr');
        const values = [session.exercise, new Date(session.started_at).toLocaleString(), session.average_focus === null ? 'In progress' : `${session.average_focus}/100`, session.reading_count];
        values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
        body.append(row);
      });
    }
    status.textContent = `${data.readings.length} recent signal samples stored in Tiger Data.`;
  } catch (error) { status.textContent = error.message; }
}
function renderAuthMode() {
  authCard.classList.toggle('signup', creatingAccount);
  authTitle.textContent = creatingAccount ? 'Create your AttUne account' : 'Welcome back';
  authCopy.textContent = creatingAccount ? 'Your attention history is stored privately in your account.' : 'Sign in to see your attention sessions and scores.';
  authSubmit.textContent = creatingAccount ? 'Create account' : 'Sign in';
  authSwitch.textContent = creatingAccount ? 'Already have an account? Sign in' : 'New here? Create an account';
  authError.textContent = '';
}
authSwitch.addEventListener('click', () => { creatingAccount = !creatingAccount; renderAuthMode(); });
authForm.addEventListener('submit', async event => {
  event.preventDefault(); authError.textContent = 'Connecting…';
  const payload = { email: document.querySelector('#auth-email').value, password: document.querySelector('#auth-password').value };
  if (creatingAccount) payload.name = document.querySelector('#auth-name').value;
  try {
    const response = await fetch(creatingAccount ? '/api/auth/signup' : '/api/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not sign in.');
    setSignedInUser(data.user);
  } catch (error) { authError.textContent = error.message; }
});
document.querySelector('#account-form').addEventListener('submit', async event => {
  event.preventDefault(); const status = document.querySelector('#account-status'); status.textContent = 'Saving…';
  const payload = { name: document.querySelector('#account-name').value, email: document.querySelector('#account-email').value, password: document.querySelector('#account-password').value };
  try { const response = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); document.querySelector('#account-password').value = ''; status.textContent = 'Saved.'; setSignedInUser(data.user); }
  catch (error) { status.textContent = error.message || 'Could not save changes.'; }
});
let solanaProvider;
const solanaConnect = document.querySelector('#solana-connect');
const solanaClaim = document.querySelector('#solana-claim');
const solanaStatus = document.querySelector('#solana-status');
solanaConnect.addEventListener('click', async () => {
  solanaProvider = window.phantom?.solana || window.solana;
  if (!solanaProvider?.isPhantom) { solanaStatus.textContent = 'Install Phantom, then refresh this page to connect a Devnet wallet.'; return; }
  try { const result = await solanaProvider.connect(); const walletAddress = result.publicKey.toString(); const response = await fetch('/api/me/wallet', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); solanaStatus.textContent = `Wallet connected: ${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`; solanaClaim.disabled = false; solanaConnect.textContent = 'Wallet connected'; } catch (error) { solanaStatus.textContent = error.message || 'Wallet connection was cancelled.'; }
});
solanaClaim.addEventListener('click', async () => {
  if (!solanaProvider || !window.solanaWeb3) { solanaStatus.textContent = 'Connect your wallet first.'; return; }
  try { const connection = new solanaWeb3.Connection('https://api.devnet.solana.com', 'confirmed'); const message = `AttUne completion proof | ${new Date().toISOString()}`; const transaction = new solanaWeb3.Transaction().add(new solanaWeb3.TransactionInstruction({ keys: [], programId: new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), data: new TextEncoder().encode(message) })); transaction.feePayer = solanaProvider.publicKey; transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash; const { signature } = await solanaProvider.signAndSendTransaction(transaction); solanaStatus.innerHTML = `Proof claimed: <a target="_blank" rel="noreferrer" href="https://explorer.solana.com/tx/${signature}?cluster=devnet">view on Solana Explorer</a>`; } catch (error) { solanaStatus.textContent = `Transaction was not completed: ${error.message || 'unknown wallet error'}`; }
});
fetch('/api/me').then(response => response.ok ? response.json() : null).then(data => { if (data?.user) setSignedInUser(data.user); }).catch(() => {});
