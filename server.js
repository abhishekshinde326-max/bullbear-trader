/**
 * ============================================
 *   BullBear Trader — Upstox Live Data Server
 *   Mobile: 9579432644
 * ============================================
 * 
 * HOW TO RUN EVERY MORNING (before 9:15 AM):
 * 1. Open terminal / command prompt in this folder
 * 2. First time only: run  =>  npm install
 * 3. Every morning run  =>  node server.js
 * 4. It will open a login link — click it, login with Upstox
 * 5. After login, open your browser: http://localhost:3000
 * 6. Your BullBear Trader app runs with LIVE DATA!
 * 
 * STOP SERVER: Press Ctrl+C in terminal
 * ============================================
 */

const express     = require('express');
const http        = require('http');
const WebSocket   = require('ws');
const axios       = require('axios');
const path        = require('path');
const fs          = require('fs');
const open        = require('open');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ─── YOUR UPSTOX CREDENTIALS ───────────────────────────────────────────────
const API_KEY     = '92a8f835-6448-4093-920f-fd1364f236bf';
const API_SECRET  = 'n1qaybiozl';
const REDIRECT_URI = 'https://bullbear-trader-production.up.railway.app/callback';
// ────────────────────────────────────────────────────────────────────────────

let ACCESS_TOKEN  = null;
let upstoxWS      = null;
let clients       = new Set(); // connected browser tabs

// Nifty 50 instrument keys (Upstox format NSE_EQ|ISIN)
const NIFTY50_INSTRUMENTS = [
  'NSE_EQ|INE002A01018', // RELIANCE
  'NSE_EQ|INE040A01034', // HDFCBANK
  'NSE_EQ|INE467B01029', // TCS
  'NSE_EQ|INE090A01021', // ICICIBANK
  'NSE_EQ|INE009A01021', // INFY
  'NSE_EQ|INE062A01020', // SBIN
  'NSE_EQ|INE397D01024', // BHARTIARTL
  'NSE_EQ|INE860A01027', // HCLTECH
  'NSE_EQ|INE237A01028', // KOTAKBANK
  'NSE_EQ|INE075A01022', // WIPRO
  'NSE_EQ|INE238A01034', // AXISBANK
  'NSE_EQ|INE296A01024', // BAJFINANCE
  'NSE_EQ|INE423A01024', // ADANIENT
  'NSE_EQ|INE585B01010', // MARUTI
  'NSE_EQ|INE044A01036', // SUNPHARMA
  'NSE_EQ|INE018A01030', // LT
  'NSE_EQ|INE101A01026', // M&M
  'NSE_EQ|INE280A01028', // TITAN
  'NSE_EQ|INE047A01021', // GRASIM
  'NSE_EQ|INE918I01026', // BAJAJFINSV
  'NSE_EQ|INE733E01010', // NTPC
  'NSE_EQ|INE752E01010', // POWERGRID
  'NSE_EQ|INE213A01029', // ONGC
  'NSE_EQ|INE522F01014', // COALINDIA
  'NSE_EQ|INE019A01038', // JSWSTEEL
  'NSE_EQ|INE038A01020', // HINDALCO
  'NSE_EQ|INE081A01012', // TATASTEEL
  'NSE_EQ|INE155A01022', // TATAMOTORS
  'NSE_EQ|INE917I01010', // BAJAJ-AUTO
  'NSE_EQ|INE030A01027', // HINDUNILVR
  'NSE_EQ|INE239A01016', // NESTLEIND
  'NSE_EQ|INE669C01036', // TECHM
  'NSE_EQ|INE481G01011', // ULTRACEMCO
  'NSE_EQ|INE089A01023', // DRREDDY
  'NSE_EQ|INE361B01024', // DIVISLAB
  'NSE_EQ|INE059A01026', // CIPLA
  'NSE_EQ|INE437A01024', // APOLLOHOSP
  'NSE_EQ|INE066A01021', // EICHERMOT
  'NSE_EQ|INE029A01011', // BPCL
  'NSE_EQ|INE795G01014', // HDFCLIFE
  'NSE_EQ|INE123W01016', // SBILIFE
  'NSE_EQ|INE095A01012', // INDUSINDBK
  'NSE_EQ|INE742F01042', // ADANIPORTS
  'NSE_EQ|INE192A01025', // TATACONSUM
  'NSE_EQ|INE628A01036', // UPL
  'NSE_EQ|INE154A01025', // ITC
  'NSE_EQ|INE263A01024', // BEL
  'NSE_EQ|INE158A01026', // HEROMOTOCO
  'NSE_EQ|INE021A01026', // ASIANPAINT
  'NSE_EQ|INE075I01017', // INDIGO
];

// Store latest market depth per symbol
const marketData = {};

// ─── STEP 1: LOGIN PAGE ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (ACCESS_TOKEN) {
    res.sendFile(path.join(__dirname, 'BullBearTrader.html'));
  } else {
    const loginUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${API_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { background:#0A0A0F; color:#F0F0F0; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; }
          h1 { color:#FFB300; font-size:28px; letter-spacing:3px; }
          p { color:#888; margin:10px 0 30px; }
          a { background:#7B2FBE; color:white; padding:14px 32px; border-radius:8px; text-decoration:none; font-size:16px; font-weight:700; }
          a:hover { background:#9B4FDE; }
          .status { margin-top:20px; color:#888; font-size:13px; }
        </style>
      </head>
      <body>
        <h1>📊 BULLBEAR TRADER</h1>
        <p>Click below to login with Upstox and start live data</p>
        <a href="${loginUrl}" target="_blank">🔐 LOGIN WITH UPSTOX</a>
        <div class="status">After login, this page will auto-refresh with live data</div>
        <script>
          // Auto check every 3 seconds if token received
          setInterval(() => fetch('/check-token').then(r=>r.json()).then(d=>{ if(d.ready) location.reload(); }), 3000);
        </script>
      </body>
      </html>
    `);
  }
});

// ─── STEP 2: CATCH UPSTOX REDIRECT WITH AUTH CODE ───────────────────────────
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code received');

  try {
    const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', {
      code,
      client_id:     API_KEY,
      client_secret: API_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    ACCESS_TOKEN = response.data.access_token;
    console.log('\n✅ LOGIN SUCCESS! Access token received.');
    console.log('🚀 Starting live market data stream...\n');

    startMarketStream();
    res.send(`<script>window.close(); window.opener && (window.opener.location.reload());</script>
              <p style="font-family:sans-serif;text-align:center;margin-top:40px">✅ Logged in! You can close this tab.<br>Go back to <a href="http://localhost:3000">BullBear Trader</a></p>`);
  } catch (err) {
    console.error('Token error:', err.response?.data || err.message);
    res.send('Login failed. Please try again.');
  }
});

app.get('/check-token', (req, res) => {
  res.json({ ready: !!ACCESS_TOKEN });
});

// ─── STEP 3: SERVE APP HTML ──────────────────────────────────────────────────
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'BullBearTrader.html'));
});

// ─── STEP 4: API ENDPOINT — SEND LATEST MARKET DATA TO APP ──────────────────
app.get('/market-data', (req, res) => {
  res.json(marketData);
});

// ─── STEP 5: WEBSOCKET — PUSH LIVE DATA TO BROWSER ──────────────────────────
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`📱 App connected (${clients.size} active)`);

  // Send current data immediately on connect
  if (Object.keys(marketData).length > 0) {
    ws.send(JSON.stringify({ type: 'market_data', data: marketData }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`📱 App disconnected (${clients.size} active)`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ─── STEP 6: UPSTOX MARKET WEBSOCKET STREAM ─────────────────────────────────
function startMarketStream() {
  if (!ACCESS_TOKEN) return;

  console.log('📡 Connecting to Upstox market feed...');

  upstoxWS = new WebSocket('wss://api.upstox.com/v2/feed/market-data-feed', {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
  });

  upstoxWS.on('open', () => {
    console.log('✅ Connected to Upstox live feed!');

    // Subscribe to market depth for all Nifty 50 stocks
    const subscribeMsg = {
      guid:        'bullbear-' + Date.now(),
      method:      'sub',
      data: {
        mode:             'full', // full = market depth + OHLC
        instrumentKeys:   NIFTY50_INSTRUMENTS,
      }
    };

    upstoxWS.send(JSON.stringify(subscribeMsg));
    console.log(`📊 Subscribed to ${NIFTY50_INSTRUMENTS.length} Nifty 50 stocks`);
  });

  upstoxWS.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData);

      if (data.feeds) {
        Object.entries(data.feeds).forEach(([instrumentKey, feed]) => {
          const sym = getSymbol(instrumentKey);
          if (!sym) return;

          const d = feed.ff?.marketFF || feed.ff?.indexFF;
          if (!d) return;

          // Extract market depth (bid/ask levels)
          const depth = d.marketOHLC || {};
          const ltpc  = d.ltpc || {};
          const bids  = d.marketDepth?.bid || [];
          const asks  = d.marketDepth?.ask || [];

          // Calculate totals
          const totalBid = bids.reduce((a, b) => a + (b.quantity || 0), 0);
          const totalAsk = asks.reduce((a, b) => a + (b.quantity || 0), 0);
          const diff     = totalBid - totalAsk;
          const diffPct  = totalBid + totalAsk > 0
            ? ((diff / (totalBid + totalAsk)) * 100).toFixed(1)
            : '0.0';

          marketData[sym] = {
            sym,
            price:    ltpc.ltp    || 0,
            open:     ltpc.cp     || 0,  // prev close used as reference
            chg:      ltpc.cp > 0 ? (((ltpc.ltp - ltpc.cp) / ltpc.cp) * 100).toFixed(2) : '0.00',
            high:     depth['1d']?.high || 0,
            low:      depth['1d']?.low  || 0,
            pclose:   ltpc.cp     || 0,
            bids:     bids.slice(0, 5).map(b => ({ price: b.price, qty: b.quantity, orders: b.orders })),
            asks:     asks.slice(0, 5).map(a => ({ price: a.price, qty: a.quantity, orders: a.orders })),
            totalBid,
            totalAsk,
            diff,
            diffPct,
            ts: Date.now(),
          };
        });

        // Push update to all connected browsers
        broadcast({ type: 'market_data', data: marketData });
      }
    } catch (e) {
      // Binary protobuf frame — skip silently
    }
  });

  upstoxWS.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
    setTimeout(startMarketStream, 5000); // retry in 5s
  });

  upstoxWS.on('close', () => {
    console.log('🔄 Upstox feed closed — reconnecting in 5s...');
    setTimeout(startMarketStream, 5000);
  });
}

// Map instrument key → stock symbol
const instrumentMap = {
  'NSE_EQ|INE002A01018': 'RELIANCE',
  'NSE_EQ|INE040A01034': 'HDFCBANK',
  'NSE_EQ|INE467B01029': 'TCS',
  'NSE_EQ|INE090A01021': 'ICICIBANK',
  'NSE_EQ|INE009A01021': 'INFY',
  'NSE_EQ|INE062A01020': 'SBIN',
  'NSE_EQ|INE397D01024': 'BHARTIARTL',
  'NSE_EQ|INE860A01027': 'HCLTECH',
  'NSE_EQ|INE237A01028': 'KOTAKBANK',
  'NSE_EQ|INE075A01022': 'WIPRO',
  'NSE_EQ|INE238A01034': 'AXISBANK',
  'NSE_EQ|INE296A01024': 'BAJFINANCE',
  'NSE_EQ|INE423A01024': 'ADANIENT',
  'NSE_EQ|INE585B01010': 'MARUTI',
  'NSE_EQ|INE044A01036': 'SUNPHARMA',
  'NSE_EQ|INE018A01030': 'LT',
  'NSE_EQ|INE101A01026': 'M&M',
  'NSE_EQ|INE280A01028': 'TITAN',
  'NSE_EQ|INE047A01021': 'GRASIM',
  'NSE_EQ|INE918I01026': 'BAJAJFINSV',
  'NSE_EQ|INE733E01010': 'NTPC',
  'NSE_EQ|INE752E01010': 'POWERGRID',
  'NSE_EQ|INE213A01029': 'ONGC',
  'NSE_EQ|INE522F01014': 'COALINDIA',
  'NSE_EQ|INE019A01038': 'JSWSTEEL',
  'NSE_EQ|INE038A01020': 'HINDALCO',
  'NSE_EQ|INE081A01012': 'TATASTEEL',
  'NSE_EQ|INE155A01022': 'TATAMOTORS',
  'NSE_EQ|INE917I01010': 'BAJAJ-AUTO',
  'NSE_EQ|INE030A01027': 'HINDUNILVR',
  'NSE_EQ|INE239A01016': 'NESTLEIND',
  'NSE_EQ|INE669C01036': 'TECHM',
  'NSE_EQ|INE481G01011': 'ULTRACEMCO',
  'NSE_EQ|INE089A01023': 'DRREDDY',
  'NSE_EQ|INE361B01024': 'DIVISLAB',
  'NSE_EQ|INE059A01026': 'CIPLA',
  'NSE_EQ|INE437A01024': 'APOLLOHOSP',
  'NSE_EQ|INE066A01021': 'EICHERMOT',
  'NSE_EQ|INE029A01011': 'BPCL',
  'NSE_EQ|INE795G01014': 'HDFCLIFE',
  'NSE_EQ|INE123W01016': 'SBILIFE',
  'NSE_EQ|INE095A01012': 'INDUSINDBK',
  'NSE_EQ|INE742F01042': 'ADANIPORTS',
  'NSE_EQ|INE192A01025': 'TATACONSUM',
  'NSE_EQ|INE628A01036': 'UPL',
  'NSE_EQ|INE154A01025': 'ITC',
  'NSE_EQ|INE263A01024': 'BEL',
  'NSE_EQ|INE158A01026': 'HEROMOTOCO',
  'NSE_EQ|INE021A01026': 'ASIANPAINT',
  'NSE_EQ|INE075I01017': 'INDIGO',
};

function getSymbol(key) {
  return instrumentMap[key] || null;
}

// ─── START SERVER ────────────────────────────────────────────────────────────
const PORT = 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   📊 BullBear Trader Server Started!     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n🌐 Open in browser: http://localhost:${PORT}`);
  console.log('🔐 Login with Upstox to start live data\n');

  // Auto-open browser
  setTimeout(() => open(`http://localhost:${PORT}`), 1000);
});
