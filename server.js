const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const API_KEY = '92a8f835-6448-4093-920f-fd29c05f6e71';
const API_SECRET = 'n1qaybiozl';
const REDIRECT_URI = 'https://bullbear-trader-production.up.railway.app/callback';
const PORT = process.env.PORT || 3000;

let ACCESS_TOKEN = null;
let upstoxWS = null;
let clients = new Set();
const marketData = {};

const INSTRUMENTS = [
  'NSE_EQ|INE002A01018','NSE_EQ|INE040A01034',
  'NSE_EQ|INE090A01021','NSE_EQ|INE009A01021',
  'NSE_EQ|INE397D01024','NSE_EQ|INE860A01027',
  'NSE_EQ|INE075A01022','NSE_EQ|INE238A01034',
  'NSE_EQ|INE423A01024','NSE_EQ|INE585B01010',
  'NSE_EQ|INE018A01030','NSE_EQ|INE101A01026',
  'NSE_EQ|INE047A01021','NSE_EQ|INE918I01026',
  'NSE_EQ|INE752E01010','NSE_EQ|INE213A01029',
  'NSE_EQ|INE019A01038','NSE_EQ|INE038A01020',
  'NSE_EQ|INE155A01022','NSE_EQ|INE917I01010',
  'NSE_EQ|INE239A01016','NSE_EQ|INE669C01036',
  'NSE_EQ|INE089A01023','NSE_EQ|INE361B01024',
  'NSE_EQ|INE437A01024','NSE_EQ|INE066A01021',
  'NSE_EQ|INE795G01014','NSE_EQ|INE123W01016',
  'NSE_EQ|INE742F01042','NSE_EQ|INE192A01025',
  'NSE_EQ|INE154A01025','NSE_EQ|INE263A01024',
  'NSE_EQ|INE021A01026','NSE_EQ|INE075I01017'
];

const SYMBOL_MAP = {
  'NSE_EQ|INE002A01018':'RELIANCE',
  'NSE_EQ|INE040A01034':'HDFCBANK',
  'NSE_EQ|INE090A01021':'INFY',
  'NSE_EQ|INE009A01021':'HCLTECH',
  'NSE_EQ|INE397D01024':'BHARTIARTL',
  'NSE_EQ|INE860A01027':'SBIN',
  'NSE_EQ|INE075A01022':'LTIM',
  'NSE_EQ|INE238A01034':'AXISBANK',
  'NSE_EQ|INE423A01024':'ADANIENT',
  'NSE_EQ|INE585B01010':'ICICIBANK',
  'NSE_EQ|INE018A01030':'BAJFINANCE',
  'NSE_EQ|INE101A01026':'MM',
  'NSE_EQ|INE047A01021':'GRASIM',
  'NSE_EQ|INE918I01026':'BAJAJFINSV',
  'NSE_EQ|INE752E01010':'DRREDDY',
  'NSE_EQ|INE213A01029':'ONGC',
  'NSE_EQ|INE019A01038':'JSWSTEEL',
  'NSE_EQ|INE038A01020':'HINDUNILVR',
  'NSE_EQ|INE155A01022':'BEL',
  'NSE_EQ|INE917I01010':'BAJAJ-AUTO',
  'NSE_EQ|INE239A01016':'NESTLEIND',
  'NSE_EQ|INE669C01036':'HINDALCO',
  'NSE_EQ|INE089A01023':'WIPRO',
  'NSE_EQ|INE361B01024':'DIVISLAB',
  'NSE_EQ|INE437A01024':'APOLLOHOSP',
  'NSE_EQ|INE066A01021':'HEROMOTOCO',
  'NSE_EQ|INE795G01014':'NTPC',
  'NSE_EQ|INE123W01016':'SBILIFE',
  'NSE_EQ|INE742F01042':'ADANIPORTS',
  'NSE_EQ|INE192A01025':'COALINDIA',
  'NSE_EQ|INE154A01025':'ITC',
  'NSE_EQ|INE263A01024':'TECHM',
  'NSE_EQ|INE021A01026':'ASIANPAINT',
  'NSE_EQ|INE075I01017':'CIPLA'
};

app.get('/', (req, res) => {
  if (ACCESS_TOKEN) {
    res.sendFile(path.join(__dirname, 'BullBearTrader.html'));
  } else {
    const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${API_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.send(`<!DOCTYPE html><html>
<head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{background:#0A0A0F;color:#F0F0F0;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0}
h1{color:#FFB300;font-size:24px;letter-spacing:2px}
p{color:#888;margin:10px 0 30px;text-align:center}
a{background:#7B2FBE;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold}
</style></head>
<body>
<h1>BULLBEAR TRADER</h1>
<p>Login with Upstox to start live data</p>
<a href="${loginUrl}">LOGIN WITH UPSTOX</a>
</body></html>`);
  }
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received');
  try {
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', API_KEY);
    params.append('client_secret', API_SECRET);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('grant_type', 'authorization_code');
    const response = await axios.post(
      'https://api.upstox.com/v2/login/authorization/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    ACCESS_TOKEN = response.data.access_token;
    startMarketStream();
    res.redirect('/');
  } catch (err) {
    res.send('Login failed: ' + JSON.stringify(err.response?.data || err.message));
  }
});

app.get('/check-token', (req, res) => res.json({ ok: !!ACCESS_TOKEN }));
app.get('/market-data', (req, res) => res.json(marketData));
app.get('/logout', (req, res) => { ACCESS_TOKEN = null; res.redirect('/'); });

wss.on('connection', (ws) => {
  clients.add(ws);
  if (Object.keys(marketData).length > 0) {
    ws.send(JSON.stringify({ type: 'market_data', data: marketData }));
  }
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(msg); } catch(e) {}
  });
}

function startMarketStream() {
  if (!ACCESS_TOKEN) return;
  try {
    upstoxWS = new WebSocket('wss://api.upstox.com/v2/feed/market-data-feed', {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    });
    upstoxWS.on('open', () => {
      upstoxWS.send(JSON.stringify({
        guid: 'bb-' + Date.now(),
        method: 'sub',
        data: { mode: 'full', instrumentKeys: INSTRUMENTS }
      }));
    });
    upstoxWS.on('message', (raw) => {
      try {
        const data = JSON.parse(raw);
        if (data.feeds) {
          Object.entries(data.feeds).forEach(([key, feed]) => {
            const sym = SYMBOL_MAP[key];
            if (!sym) return;
            const d = feed.ff?.marketFF || feed.ff?.indexFF;
            if (!d) return;
            const ltpc = d.ltpc || {};
            const bids = d.marketDepth?.bid || [];
            const asks = d.marketDepth?.ask || [];
            const totalBid = bids.reduce((a, b) => a + (b.quantity || 0), 0);
            const totalAsk = asks.reduce((a, b) => a + (b.quantity || 0), 0);
            const diff = totalBid - totalAsk;
            const diffPct = (totalBid + totalAsk) > 0 ? (diff / (totalBid + totalAsk)) * 100 : 0;
            marketData[sym] = {
              sym, price: ltpc.ltp || 0,
              chg: ltpc.cp > 0 ? (((ltpc.ltp - ltpc.cp) / ltpc.cp) * 100) : 0,
              high: d.marketOHLC?.['1d']?.high || 0,
              low: d.marketOHLC?.['1d']?.low || 0,
              pclose: ltpc.cp || 0,
              bids: bids.slice(0,5).map(b => ({ price: b.price, qty: b.quantity })),
              asks: asks.slice(0,5).map(a => ({ price: a.price, qty: a.quantity })),
              totalBid, totalAsk, diff, diffPct
            };
          });
          broadcast({ type: 'market_data', data: marketData });
        }
      } catch(e) {}
    });
    upstoxWS.on('error', (e) => { console.error('Stream error:', e.message); });
    upstoxWS.on('close', () => { setTimeout(startMarketStream, 5000); });
  } catch(e) {
    setTimeout(startMarketStream, 5000);
  }
}

server.listen(PORT, () => {
  console.log('BullBear Trader running on port ' + PORT);
});
