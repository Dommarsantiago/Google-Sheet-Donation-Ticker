const express = require('express');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const app = express();
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return {
      sheetUrl: '',
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

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const body = req.body;
  const config = loadConfig();
  if (body.sheetUrl !== undefined) config.sheetUrl = String(body.sheetUrl);
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
  const url = req.query.url;
  if (!isValidSheetUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing sheet URL. Use a Google Sheets export URL.' });
  }
  let csvUrl = url;
  if (!csvUrl.includes('/export')) {
    const match = url.match(/\/d\/([^/]+)(?:\/edit)?(?:\?.*gid=(\d+))?/);
    if (match) {
      const id = match[1];
      const gid = match[2] || '0';
      csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    }
  }
  try {
    const resp = await fetch(csvUrl, { headers: { 'User-Agent': 'DonationTicker/1' } });
    if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status}`);
    const text = await resp.text();
    const rows = parse(text, { relax_column_count: true, skip_empty_lines: true });
    if (rows.length === 0) {
      return res.json({ header: [], rows: [] });
    }
    const header = rows[0];
    const dataRows = rows.slice(1).map((row) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
      });
      return obj;
    });
    res.json({ header, rows: dataRows });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Donation Ticker server at http://localhost:${PORT}`);
  console.log(`  Control: http://localhost:${PORT}/`);
  console.log(`  Ticker:  http://localhost:${PORT}/ticker`);
});
