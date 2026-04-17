// IA TRADER - SERVIDOR ROBUSTO PARA PRODUÇÃO ONLINE 24/7
// Deploy em Render.com / Railway.app / AWS

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5561;
const PRIVATE_APP_KEY = process.env.PRIVATE_APP_KEY || 'IA_TRADER_PRIVATE_2026';
const LOCK_BROWSER_ACCESS = process.env.LOCK_BROWSER_ACCESS !== 'false';
const APP_REMOTE_VERSION = process.env.APP_REMOTE_VERSION || '2026.04.17.1';
const APP_REMOTE_UPDATED_AT = process.env.APP_REMOTE_UPDATED_AT || new Date().toISOString();

const IS_CLOUD_RUNTIME = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RENDER ||
  process.env.K_SERVICE ||
  process.env.HEROKU
);

if (!IS_CLOUD_RUNTIME && process.env.ALLOW_LOCAL_MODE !== 'true') {
  console.error('\n⛔ MODO LOCAL DESATIVADO NESTE PROJETO.');
  console.error('Este servidor foi travado para rodar apenas online (Railway/Render).');
  console.error('Para manutencao local temporaria, use: ALLOW_LOCAL_MODE=true\n');
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function getRequestKey(req) {
  const headerKey = req.headers['x-app-key'];
  const queryKey = req.query?.k;
  return headerKey || queryKey || '';
}

function hasPrivateAccess(req) {
  if (!LOCK_BROWSER_ACCESS) return true;
  return getRequestKey(req) === PRIVATE_APP_KEY;
}

app.use((req, res, next) => {
  if (!LOCK_BROWSER_ACCESS) return next();

  if (req.path === '/alive') {
    return next();
  }

  const protectedPath =
    req.path === '/' ||
    req.path === '/dashboard' ||
    req.path === '/dashboard.html' ||
    req.path.startsWith('/api');

  if (!protectedPath) {
    return next();
  }

  if (!hasPrivateAccess(req)) {
    return res.status(403).json({
      ok: false,
      error: 'Acesso privado: use o app desktop autorizado.'
    });
  }

  next();
});

// ═════════════════════════════════════════════════════════
// CONFIGURAÇÃO DA IA
// ═════════════════════════════════════════════════════════
const CONFIG = {
  initialBalance: 10000,
  tradeSize: 0.12,
  stopLoss: 0.015,
  takeProfit: 0.035,
  minConfidence: 0.62,
  symbol: 'BTCBRL',
  learningRate: 0.35
};

// ═════════════════════════════════════════════════════════
// STATE DA IA
// ═════════════════════════════════════════════════════════
let state = {
  running: false,
  mode: process.env.IA_MODE || 'simulation',
  balance: CONFIG.initialBalance,
  realBalance: 0,
  wins: 0,
  losses: 0,
  totalProfit: 0,
  trades: [],
  memory: { patterns: {}, totalTrades: 0, accuracy: 0.5 },
  currentPrice: 90000,
  lastUpdate: Date.now(),
  uptime: 0,
  status: 'Parado',
  startedAt: null
};

// ═════════════════════════════════════════════════════════
// BINANCE API
// ═════════════════════════════════════════════════════════
class BinanceAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseURL = 'https://api.binance.com/api/v3';
  }

  async getBalance() {
    try {
      const response = await axios.get(`${this.baseURL}/account`, {
        headers: { 'X-MBX-APIKEY': this.apiKey }
      });
      const brlBalance = response.data.balances.find(b => b.asset === 'BRL');
      return parseFloat(brlBalance?.free || 0);
    } catch (e) {
      console.error('Erro ao buscar saldo:', e.message);
      return 0;
    }
  }

  async getCurrentPrice() {
    try {
      const response = await axios.get(`${this.baseURL}/ticker/price?symbol=BTCBRL`);
      return parseFloat(response.data.price);
    } catch (e) {
      console.error('Erro ao buscar preço:', e.message);
      return 0;
    }
  }

  async placeOrder(side, quantity, price) {
    try {
      const response = await axios.post(`${this.baseURL}/order`, {
        symbol: CONFIG.symbol,
        side: side.toUpperCase(),
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity,
        price,
        timestamp: Date.now()
      }, {
        headers: { 'X-MBX-APIKEY': this.apiKey }
      });
      return response.data;
    } catch (e) {
      console.error('Erro ao colocar ordem:', e.message);
      return null;
    }
  }
}

let binanceAPI = null;

// ═════════════════════════════════════════════════════════
// IA - LÓGICA DE TRADING
// ═════════════════════════════════════════════════════════
function calculateSignals() {
  const rand = Math.random();
  const confidence = 0.55 + Math.random() * 0.3;
  const signal = rand < 0.35 ? (Math.random() < 0.5 ? 'BUY' : 'SELL') : 'HOLD';
  return { signal, confidence };
}

function executeTrade(side, price, confidence) {
  const tradeSize = state.balance * CONFIG.tradeSize;
  const won = Math.random() < (0.55 + confidence * 0.1);
  const pnlPct = won ? CONFIG.takeProfit : -CONFIG.stopLoss;
  const pnl = tradeSize * pnlPct;

  const trade = {
    id: state.trades.length + 1,
    timestamp: new Date().toISOString(),
    side,
    price,
    size: tradeSize,
    pnl,
    won,
    confidence
  };

  state.trades.push(trade);
  state.balance += pnl;
  state.totalProfit += pnl;
  if (won) state.wins++; else state.losses++;

  if (state.trades.length > 1000) {
    state.trades = state.trades.slice(-1000);
  }

  broadcastUpdate();
  console.log(`[TRADE] ${side} @ ${price.toFixed(2)} | PnL: ${pnl.toFixed(2)} | Balance: ${state.balance.toFixed(2)}`);
  return trade;
}

let iaInterval = null;

function startIA() {
  if (state.running) return;
  state.running = true;
  state.status = '▶ IA Operando';
  state.lastUpdate = Date.now();
  state.startedAt = new Date().toISOString();

  console.log('🚀 IA iniciada em modo:', state.mode);

  iaInterval = setInterval(async () => {
    if (!state.running) {
      clearInterval(iaInterval);
      return;
    }

    try {
      if (state.mode === 'real' && binanceAPI) {
        try {
          const price = await binanceAPI.getCurrentPrice();
          if (price) state.currentPrice = price;
        } catch (e) {
          console.error('Erro ao buscar preço:', e.message);
        }
      } else {
        const change = (Math.random() - 0.5) * 1000;
        state.currentPrice = Math.max(80000, state.currentPrice + change);
      }

      const { signal, confidence } = calculateSignals();

      if (signal !== 'HOLD' && confidence >= CONFIG.minConfidence) {
        const trade = executeTrade(signal, state.currentPrice, confidence);
        
        if (state.mode === 'real' && binanceAPI) {
          try {
            const quantity = (trade.size / state.currentPrice).toFixed(8);
            await binanceAPI.placeOrder(signal, quantity, state.currentPrice);
          } catch (e) {
            console.error('Erro ao colocar ordem:', e.message);
          }
        }
      }

      state.uptime = Math.round((Date.now() - state.lastUpdate) / 1000);
      broadcastUpdate();
    } catch (e) {
      console.error('Erro no tick da IA:', e.message);
    }

  }, 5000);
}

function stopIA() {
  if (!state.running) return;
  state.running = false;
  state.status = 'Parado';
  if (iaInterval) clearInterval(iaInterval);
  console.log('⏹️ IA parada');
  broadcastUpdate();
}

// ═════════════════════════════════════════════════════════
// HTTP SERVER
// ═════════════════════════════════════════════════════════
const server = http.createServer(app);

// ═════════════════════════════════════════════════════════
// WEBSOCKET
// ═════════════════════════════════════════════════════════
const wss = new WebSocket.Server({ server });

function broadcastUpdate() {
  const message = JSON.stringify({
    type: 'UPDATE',
    data: state
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (e) {
        console.error('Erro ao enviar update:', e.message);
      }
    }
  });
}

wss.on('connection', (ws, req) => {
  if (LOCK_BROWSER_ACCESS) {
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const queryKey = reqUrl.searchParams.get('k') || '';
    const headerKey = req.headers['x-app-key'] || '';
    const hasAccess = queryKey === PRIVATE_APP_KEY || headerKey === PRIVATE_APP_KEY;

    if (!hasAccess) {
      ws.close(1008, 'Forbidden');
      return;
    }
  }

  console.log('✅ Cliente conectado. Total:', wss.clients.size);
  
  try {
    ws.send(JSON.stringify({
      type: 'INIT',
      data: state
    }));
  } catch (e) {
    console.error('Erro ao enviar INIT:', e.message);
  }

  ws.on('message', (message) => {
    try {
      const cmd = JSON.parse(message);
      
      if (cmd.type === 'START') {
        startIA();
      } else if (cmd.type === 'STOP') {
        stopIA();
      } else if (cmd.type === 'SET_MODE') {
        state.mode = cmd.mode;
        broadcastUpdate();
      } else if (cmd.type === 'CONNECT_BINANCE') {
        binanceAPI = new BinanceAPI(cmd.apiKey, cmd.apiSecret);
        console.log('🔌 Binance conectado');
        ws.send(JSON.stringify({ type: 'BINANCE_CONNECTED' }));
      } else if (cmd.type === 'GET_BALANCE') {
        if (binanceAPI) {
          binanceAPI.getBalance().then(bal => {
            state.realBalance = bal;
            broadcastUpdate();
          });
        }
      }
    } catch (e) {
      console.error('Erro ao processar mensagem:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('❌ Cliente desconectado');
  });

  ws.on('error', (error) => {
    console.error('Erro WebSocket:', error.message);
  });
});

// ═════════════════════════════════════════════════════════
// API REST
// ═════════════════════════════════════════════════════════
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

app.get('/api/status', (req, res) => {
  res.json(state);
});

app.post('/api/start', (req, res) => {
  startIA();
  res.json({ ok: true, message: 'IA iniciada' });
});

app.post('/api/stop', (req, res) => {
  stopIA();
  res.json({ ok: true, message: 'IA parada' });
});

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (['simulation', 'real'].includes(mode)) {
    state.mode = mode;
    broadcastUpdate();
    res.json({ ok: true, mode });
  } else {
    res.status(400).json({ ok: false, error: 'Modo inválido' });
  }
});

app.post('/api/connect', (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, error: 'API Key e Secret obrigatórios' });
  }
  
  binanceAPI = new BinanceAPI(apiKey, apiSecret);
  binanceAPI.getBalance().then(bal => {
    state.realBalance = bal;
    broadcastUpdate();
    res.json({ ok: true, balance: bal });
  });
});

app.get('/api/trades', (req, res) => {
  res.json(state.trades);
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    running: state.running,
    trades: state.trades.length,
    balance: state.balance
  });
});

app.get('/api/app-meta', (req, res) => {
  res.json({
    ok: true,
    version: APP_REMOTE_VERSION,
    updatedAt: APP_REMOTE_UPDATED_AT,
    appName: 'IA Trader Privado'
  });
});

app.get('/alive', (req, res) => {
  res.send('OK');
});

// ═════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═════════════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   🤖 IA TRADER BITCOIN - SERVIDOR   ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`📡 API:       http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`💡 Health:    http://localhost:${PORT}/alive\n`);
  console.log(`Modo: ${process.env.IA_MODE || 'simulação'}`);
  console.log(`Node: ${process.version}\n`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando gracefully...');
  stopIA();
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
