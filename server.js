const express = require('express');
const http = require('http');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const app = express();
/** Writable folder: same directory as the .exe when packaged with pkg; project root in dev. */
const APP_ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(APP_ROOT, 'config.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_CONFIG = {
  sheetUrl: '',
  sheetId: '',
  sheetGid: '0',
  rotationSeconds: 5,
  teamColumnName: 'Team E-W',
  neutral: { color: '#6b7280', logoUrl: '' },
  teams: [],
  fontSize: 14,
  tickerHeight: 48,
  textColor: '#ffffff',
  messageScrollDelaySeconds: 5,
  messageScrollDurationSeconds: 20,
};

function parseSheetRefFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'docs.google.com' || !url.includes('/spreadsheets/')) return null;
    const pathMatch = url.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!pathMatch) return null;
    const id = pathMatch[1];
    let gid = '0';
    const qGid = u.searchParams.get('gid');
    if (qGid && /^\d+$/.test(qGid)) gid = qGid;
    else {
      const hashGid = u.hash.match(/[#&]gid=(\d+)/);
      if (hashGid) gid = hashGid[1];
    }
    return { id, gid };
  } catch {
    return null;
  }
}

function normalizeConfig(raw) {
  const c = { ...DEFAULT_CONFIG, ...raw, neutral: { ...DEFAULT_CONFIG.neutral, ...(raw.neutral || {}) } };
  if (!(c.sheetId && String(c.sheetId).trim())) {
    const ref = parseSheetRefFromUrl(c.sheetUrl);
    if (ref) {
      c.sheetId = ref.id;
      c.sheetGid = ref.gid;
    }
  }
  const g = String(c.sheetGid || '0').trim();
  c.sheetGid = /^\d+$/.test(g) ? g : '0';
  return c;
}

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return normalizeConfig(JSON.parse(data));
  } catch (err) {
    return normalizeConfig({});
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function isValidSheetUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.hostname === 'docs.google.com' && url.includes('/spreadsheets/');
  } catch {
    return false;
  }
}

function isValidSheetId(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]+$/.test(id.trim());
}

async function fetchSheetAsJson(csvUrl) {
  const resp = await fetch(csvUrl, { headers: { 'User-Agent': 'DonationTicker/1' } });
  if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status}`);
  const text = await resp.text();
  const rows = parse(text, { relax_column_count: true, skip_empty_lines: true });
  if (rows.length === 0) {
    return { header: [], rows: [] };
  }
  const header = rows[0];
  const dataRows = rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
    });
    return obj;
  });
  return { header, rows: dataRows };
}

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const body = req.body;
  const config = loadConfig();
  if (body.sheetUrl !== undefined) config.sheetUrl = String(body.sheetUrl);
  const pasted = body.sheetUrl !== undefined ? String(body.sheetUrl).trim() : null;
  const refFromUrl = pasted ? parseSheetRefFromUrl(pasted) : null;
  if (refFromUrl) {
    config.sheetId = refFromUrl.id;
    config.sheetGid = refFromUrl.gid;
  } else {
    if (body.sheetId !== undefined) config.sheetId = String(body.sheetId).trim();
    if (body.sheetGid !== undefined) {
      const g = String(body.sheetGid).trim();
      config.sheetGid = /^\d+$/.test(g) ? g : '0';
    }
  }
  if (body.rotationSeconds !== undefined) config.rotationSeconds = Math.max(1, Number(body.rotationSeconds) || 5);
  if (body.teamColumnName !== undefined) config.teamColumnName = String(body.teamColumnName).trim() || 'Team E-W';
  if (body.neutral !== undefined) {
    config.neutral = {
      color: body.neutral.color !== undefined ? String(body.neutral.color) : config.neutral.color,
      logoUrl: body.neutral.logoUrl !== undefined ? String(body.neutral.logoUrl) : config.neutral.logoUrl,
    };
  }
  if (body.teams !== undefined && Array.isArray(body.teams)) {
    config.teams = body.teams.map((t) => ({
      name: String(t.name || '').trim(),
      color: String(t.color || '#6b7280'),
      logoUrl: String(t.logoUrl || ''),
    })).filter((t) => t.name);
  }
  if (body.fontSize !== undefined) config.fontSize = Math.max(10, Math.min(72, Number(body.fontSize) || 14));
  if (body.tickerHeight !== undefined) config.tickerHeight = Math.max(24, Math.min(200, Number(body.tickerHeight) || 48));
  if (body.textColor !== undefined) config.textColor = String(body.textColor);
  if (body.messageScrollDelaySeconds !== undefined) config.messageScrollDelaySeconds = Math.max(0, Number(body.messageScrollDelaySeconds) || 5);
  if (body.messageScrollDurationSeconds !== undefined) config.messageScrollDurationSeconds = Math.max(1, Number(body.messageScrollDurationSeconds) || 20);
  saveConfig(config);
  res.json(config);
});

app.get('/api/sheet/test', (req, res) => {
  const header = ['NAME', 'AMOUNT', 'Team E-W', 'MESSAGE'];
  const rows = [
    { NAME: 'Test Donor West', AMOUNT: '$50', 'Team E-W': 'w', MESSAGE: 'Go West! #forthekids' },
    { NAME: 'Test Donor East', AMOUNT: '$25', 'Team E-W': 'e', MESSAGE: 'Go East squad!' },
    { NAME: 'Anonymous', AMOUNT: '$100', 'Team E-W': '', MESSAGE: 'For the kids.' },
    { NAME: 'Jane Smith', AMOUNT: '$75', 'Team E-W': 'w', MESSAGE: 'Proud of you!' },
    { NAME: 'John Doe', AMOUNT: '$30', 'Team E-W': 'e', MESSAGE: 'Congratulations!' },
  ];
  res.json({ header, rows });
});

app.get('/api/sheet', async (req, res) => {
  if (req.query.test === '1') {
    return res.redirect(302, '/api/sheet/test');
  }
  const idParam = req.query.id;
  let csvUrl = null;
  if (idParam != null && String(idParam).trim() !== '') {
    const id = String(idParam).trim();
    if (!isValidSheetId(id)) {
      return res.status(400).json({ error: 'Invalid spreadsheet id.' });
    }
    const gidRaw = req.query.gid;
    const gid = gidRaw != null && /^\d+$/.test(String(gidRaw).trim()) ? String(gidRaw).trim() : '0';
    csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  } else {
    const url = req.query.url;
    if (!isValidSheetUrl(url)) {
      return res.status(400).json({ error: 'Invalid or missing sheet URL or id. Use a Google Sheets URL or id + gid.' });
    }
    csvUrl = url;
    if (!csvUrl.includes('/export')) {
      const parsed = parseSheetRefFromUrl(url);
      if (parsed) {
        csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/export?format=csv&gid=${parsed.gid}`;
      }
    }
  }
  try {
    const data = await fetchSheetAsJson(csvUrl);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch or parse sheet', detail: err.message });
  }
});

app.get('/ticker', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ticker.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const preferredPort = Number(process.env.PORT) || 3000;
const portTryMax = Number(process.env.PORT_TRY_MAX) || 50;
const portCeil = preferredPort + Math.max(0, portTryMax);

const server = http.createServer(app);
let listenPort = preferredPort;

function onListening() {
  if (listenPort !== preferredPort) {
    console.log(`Port ${preferredPort} was in use; listening on ${listenPort} instead.`);
  }
  console.log(`Donation Ticker server at http://localhost:${listenPort}`);
  console.log(`  Control: http://localhost:${listenPort}/`);
  console.log(`  Ticker:  http://localhost:${listenPort}/ticker`);
}

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error(err);
    process.exit(1);
  }
  if (listenPort >= portCeil) {
    console.error(
      `No free port found between ${preferredPort} and ${portCeil}. Set PORT or raise PORT_TRY_MAX.`,
    );
    process.exit(1);
  }
  listenPort += 1;
  server.listen(listenPort, onListening);
});

server.listen(listenPort, onListening);
