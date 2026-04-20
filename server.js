// IA TRADER - SERVIDOR ROBUSTO PARA PRODUÇÃO ONLINE 24/7
// Deploy em Render.com / Railway.app / AWS
// ✨ VERSÃO COM MEMÓRIA INTELIGENTE, SEGURANÇA E COMPLIANCE

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const axios = require('axios');
const http = require('http');
const crypto = require('crypto');
require('dotenv').config();

// 🧠 Importar módulos de IA avançada
const aiMemory = require('./modules/ai-memory');
const aiSecurity = require('./modules/ai-security');
const aiCompliance = require('./modules/ai-compliance');

const app = express();
const PORT = process.env.PORT || 5561;
const PRIVATE_APP_KEY = process.env.PRIVATE_APP_KEY || 'IA_TRADER_PRIVATE_2026';
const LOCK_BROWSER_ACCESS = process.env.LOCK_BROWSER_ACCESS !== 'false';
const APP_REMOTE_VERSION = process.env.APP_REMOTE_VERSION || '2026.04.20.1';
const APP_REMOTE_UPDATED_AT = process.env.APP_REMOTE_UPDATED_AT || new Date().toISOString();
const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL || 'https://api.binance.com/api/v3';
const DEFAULT_BINANCE_SYMBOL = 'BTCBRL';
const BINANCE_SYMBOL = process.env.BINANCE_SYMBOL || DEFAULT_BINANCE_SYMBOL;
const BINANCE_QUOTE_ASSET = process.env.BINANCE_QUOTE_ASSET || (BINANCE_SYMBOL.endsWith('USDT') ? 'USDT' : 'BRL');
const TRACKED_MARKETS = {
  btc: {
    key: 'btc',
    symbol: `BTC${BINANCE_QUOTE_ASSET}`,
    label: `BTC/${BINANCE_QUOTE_ASSET}`,
    baseAsset: 'BTC'
  },
  eth: {
    key: 'eth',
    symbol: `ETH${BINANCE_QUOTE_ASSET}`,
    label: `ETH/${BINANCE_QUOTE_ASSET}`,
    baseAsset: 'ETH'
  }
};
const TRACKED_MARKET_KEYS = Object.keys(TRACKED_MARKETS);
const PRIMARY_MARKET_KEY = Object.values(TRACKED_MARKETS).find((market) => market.symbol === BINANCE_SYMBOL)?.key || TRACKED_MARKET_KEYS[0];
const PRIMARY_TRACKED_MARKET = TRACKED_MARKETS[PRIMARY_MARKET_KEY];
const LOCAL_DEMO_SEED_ENABLED = !Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RENDER ||
  process.env.K_SERVICE ||
  process.env.HEROKU
) && process.env.LOCAL_DEMO_SEED !== 'false';

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

  const htmlEntryPath =
    req.path === '/' ||
    req.path === '/dashboard' ||
    req.path === '/dashboard.html' ||
    req.path === '/projeto06.html' ||
    req.path === '/mobile' ||
    req.path === '/mobile.html';

  if (htmlEntryPath && !hasPrivateAccess(req)) {
    const qp = new URLSearchParams(req.query || {});
    qp.set('k', PRIVATE_APP_KEY);
    const targetPath = req.path === '/' ? '/dashboard' : req.path;
    return res.redirect(302, `${targetPath}?${qp.toString()}`);
  }

  const protectedPath =
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
  breakEvenTrigger: 0.01,
  breakEvenOffset: 0.0015,
  trailingStopTrigger: 0.02,
  trailingStopGap: 0.009,
  minProfitForSignalExit: 0.012,
  trailingExitRetracement: 0.006,
  minExitConfidence: 0.78,
  minConfidence: 0.62,
  symbol: BINANCE_SYMBOL,
  learningRate: 0.35
};

const SYMBOL_BASE_ASSET = BINANCE_SYMBOL.endsWith(BINANCE_QUOTE_ASSET)
  ? BINANCE_SYMBOL.slice(0, BINANCE_SYMBOL.length - BINANCE_QUOTE_ASSET.length)
  : BINANCE_SYMBOL;
const REAL_ORDER_PREFIX = 'ia-bot';
const REAL_TICK_INTERVAL_MS = Number(process.env.REAL_TICK_INTERVAL_MS || 5000);
const REAL_ORDER_TIMEOUT_MS = Number(process.env.REAL_ORDER_TIMEOUT_MS || 90000);
const REAL_COOLDOWN_MS = Number(process.env.REAL_COOLDOWN_MS || 30000);
const REAL_QUOTE_RESERVE = Number(process.env.REAL_QUOTE_RESERVE || 5);
const REAL_MIN_EXIT_BUFFER = Number(process.env.REAL_MIN_EXIT_BUFFER || (CONFIG.stopLoss + 0.02));
const REAL_MARKET_SELL_QUOTE_BUFFER = Number(process.env.REAL_MARKET_SELL_QUOTE_BUFFER || 0.02);

function shouldSkipBinanceAutoConnect() {
  return LOCAL_DEMO_SEED_ENABLED && state.mode === 'simulation';
}

// ═════════════════════════════════════════════════════════
// STATE DA IA
// ═════════════════════════════════════════════════════════
let state = {
  running: false,
  mode: process.env.IA_MODE || 'simulation',
  balance: CONFIG.initialBalance,
  realBalance: 0,
  realBalanceAsset: BINANCE_QUOTE_ASSET,
  binanceConnected: false,
  binanceStatus: 'Desconectada',
  binanceLastError: '',
  wins: 0,
  losses: 0,
  totalProfit: 0,
  trades: [],
  memory: { patterns: {}, totalTrades: 0, accuracy: 0.5 },
  currentPrice: 90000,
  lastUpdate: Date.now(),
  uptime: 0,
  status: 'Parado',
  startedAt: null,
  position: null,
  positions: {},
  pendingOrder: null,
  pendingOrders: [],
  openOrders: [],
  lastSignal: {
    action: 'HOLD',
    confidence: 0,
    reason: 'Aguardando mercado',
    reasons: []
  },
  lastSignals: {},
  market: {
    ema9: null,
    ema21: null,
    rsi: null,
    macd: null,
    macdSignal: null,
    macdHistogram: null,
    volatility: null
  },
  marketByAsset: {},
  currentPrices: {},
  cooldownUntil: 0,
  cooldowns: {},
  simulationQuoteFree: CONFIG.initialBalance
};

function normalizeCredentialValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function syncStateMemory() {
  const stats = aiMemory.getStats();
  state.memory = {
    patterns: aiMemory.memory.patterns,
    strategies: aiMemory.memory.strategies,
    totalTrades: aiMemory.memory.totalDecisions,
    accuracy: aiMemory.memory.successRate,
    phase: aiMemory.memory.learningPhase,
    currentStreak: aiMemory.memory.currentStreak,
    currentStreakType: aiMemory.memory.currentStreakType,
    continuousCycles: aiMemory.memory.continuousCycles,
    adaptationScore: aiMemory.memory.adaptationScore,
    continuousLearning: aiMemory.memory.continuousLearning,
    lastLearningUpdate: aiMemory.memory.lastLearningUpdate,
    bestPattern: stats.bestPattern,
    bestStrategy: stats.bestStrategy,
    weakestDecision: stats.weakestDecision,
    dominantRegime: stats.dominantRegime,
    memoryHealth: stats.memoryHealth,
    lastMistake: stats.lastMistake,
    freshnessHours: stats.freshnessHours,
    strategiesTracked: stats.strategiesTracked,
    recentWinRate: stats.recentWinRate,
    avgProfit: Number(stats.avgProfit || 0),
    warningPatterns: stats.warningPatterns,
    regimeMemory: stats.regimeMemory,
    confidence: aiMemory.memory.confidence
  };
}

function getTrackedMarketEntries() {
  return Object.entries(TRACKED_MARKETS);
}

function getPositionForAsset(assetKey) {
  return assetKey ? (state.positions?.[assetKey] || null) : null;
}

function getOpenPositions() {
  return getTrackedMarketEntries()
    .map(([assetKey]) => getPositionForAsset(assetKey))
    .filter(Boolean);
}

function getPrimaryRuntimeAssetKey(preferredKey = PRIMARY_MARKET_KEY) {
  if (preferredKey && getPositionForAsset(preferredKey)) {
    return preferredKey;
  }

  const firstOpenPosition = getOpenPositions()[0];
  if (firstOpenPosition?.assetKey) {
    return firstOpenPosition.assetKey;
  }

  if (preferredKey && TRACKED_MARKETS[preferredKey]) {
    return preferredKey;
  }

  return PRIMARY_MARKET_KEY;
}

function setPendingOrders(orders) {
  state.pendingOrders = Array.isArray(orders) ? orders : [];
  state.pendingOrder = state.pendingOrders[0] || null;
}

function setLastSignalForAsset(assetKey, signal) {
  const market = TRACKED_MARKETS[assetKey] || PRIMARY_TRACKED_MARKET;
  if (!state.lastSignals) {
    state.lastSignals = {};
  }

  state.lastSignals[assetKey] = {
    ...(signal || {}),
    assetKey,
    symbol: market?.symbol,
    label: market?.label
  };
}

function setRuntimeMarketForAsset(assetKey, marketSnapshot) {
  if (!assetKey || !marketSnapshot) {
    return;
  }

  state.currentPrices[assetKey] = Number(marketSnapshot.currentPrice || 0);
  state.marketByAsset[assetKey] = marketSnapshot.indicators || null;
}

function syncLegacyRuntimeState(preferredKey = PRIMARY_MARKET_KEY) {
  const primaryKey = getPrimaryRuntimeAssetKey(preferredKey);
  const market = TRACKED_MARKETS[primaryKey] || PRIMARY_TRACKED_MARKET;
  state.position = getPositionForAsset(primaryKey);
  state.currentPrice = Number(state.currentPrices?.[primaryKey] || state.currentPrice || 0);
  state.market = state.marketByAsset?.[primaryKey] || state.market;
  state.lastSignal = state.lastSignals?.[primaryKey] || state.lastSignal;
  state.cooldownUntil = Number(state.cooldowns?.[primaryKey] || 0);
  state.pendingOrder = Array.isArray(state.pendingOrders) ? (state.pendingOrders[0] || null) : null;
  if (!market && !state.position) {
    state.position = null;
  }
}

function setPositionForAsset(assetKey, position, preferredKey = assetKey) {
  if (!state.positions) {
    state.positions = {};
  }

  if (position) {
    state.positions[assetKey] = position;
  } else {
    delete state.positions[assetKey];
  }

  syncLegacyRuntimeState(preferredKey);
}

function buildPositionMetrics(position = state.position, currentPrice = state.currentPrice, assetKey = position?.assetKey || PRIMARY_MARKET_KEY) {
  if (!position) {
    return null;
  }

  const market = TRACKED_MARKETS[assetKey] || PRIMARY_TRACKED_MARKET;
  const livePrice = Number(currentPrice || 0);
  const entryPrice = Number(position.entryPrice || 0);
  const quantity = Number(position.quantity || 0);
  if (!livePrice || !entryPrice || !quantity) {
    return null;
  }

  const investedValue = Number(position.quoteSpent || (quantity * entryPrice) || 0);
  const marketValue = quantity * livePrice;
  const unrealizedPnl = marketValue - investedValue;
  const unrealizedPnlPct = entryPrice > 0 ? ((livePrice - entryPrice) / entryPrice) * 100 : 0;
  const stopPrice = Number(position.stopPrice || 0);
  const takeProfitPrice = Number(position.takeProfitPrice || 0);

  return {
    assetKey,
    symbol: position.symbol || market?.symbol || CONFIG.symbol,
    label: position.label || market?.label || CONFIG.symbol,
    baseAsset: position.baseAsset || market?.baseAsset || SYMBOL_BASE_ASSET,
    direction: unrealizedPnl > 0 ? 'profit' : (unrealizedPnl < 0 ? 'loss' : 'flat'),
    entryPrice,
    currentPrice: livePrice,
    quantity,
    investedValue,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
    stopPrice,
    takeProfitPrice,
    stopDistancePct: stopPrice > 0 ? ((livePrice - stopPrice) / livePrice) * 100 : null,
    takeProfitDistancePct: takeProfitPrice > 0 ? ((takeProfitPrice - livePrice) / livePrice) * 100 : null,
    openedAt: position.openedAt || null,
    source: position.source || 'bot'
  };
}

function buildPositionMetricsMap() {
  return getTrackedMarketEntries().reduce((metricsMap, [assetKey]) => {
    const position = getPositionForAsset(assetKey);
    if (!position) {
      return metricsMap;
    }

    const metrics = buildPositionMetrics(
      position,
      state.currentPrices?.[assetKey] || position.entryPrice || state.currentPrice,
      assetKey
    );

    if (metrics) {
      metricsMap[assetKey] = metrics;
    }

    return metricsMap;
  }, {});
}

function buildAggregatePositionMetrics(positionMetricsMap) {
  const metricsList = Object.values(positionMetricsMap || {});
  if (!metricsList.length) {
    return null;
  }

  const investedValue = metricsList.reduce((sum, metrics) => sum + Number(metrics.investedValue || 0), 0);
  const marketValue = metricsList.reduce((sum, metrics) => sum + Number(metrics.marketValue || 0), 0);
  const unrealizedPnl = marketValue - investedValue;

  return {
    positionCount: metricsList.length,
    investedValue,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct: investedValue > 0 ? (unrealizedPnl / investedValue) * 100 : 0,
    direction: unrealizedPnl > 0 ? 'profit' : (unrealizedPnl < 0 ? 'loss' : 'flat'),
    assets: metricsList.map((metrics) => metrics.assetKey)
  };
}

function buildClientState() {
  syncStateMemory();
  const openOrders = Array.isArray(state.openOrders)
    ? state.openOrders.map((order) => ({
        ...order,
        ageMs: Math.max(0, Date.now() - Number(order.createdAt || order.time || Date.now()))
      }))
    : [];
  const pendingOrder = state.pendingOrder
    ? {
        ...state.pendingOrder,
        ageMs: Math.max(0, Date.now() - Number(state.pendingOrder.createdAt || state.pendingOrder.time || Date.now()))
      }
    : null;
  const positionMetricsMap = buildPositionMetricsMap();
  const positionMetricsList = Object.values(positionMetricsMap);
  const positions = getOpenPositions().map((position) => ({ ...position }));
  const primaryPosition = state.position || positions[0] || null;
  const primaryPositionMetrics = primaryPosition
    ? positionMetricsMap[primaryPosition.assetKey] || buildPositionMetrics(primaryPosition, state.currentPrices?.[primaryPosition.assetKey] || primaryPosition.entryPrice, primaryPosition.assetKey)
    : null;
  const aggregatePositionMetrics = buildAggregatePositionMetrics(positionMetricsMap);

  return {
    ...state,
    symbol: CONFIG.symbol,
    baseAsset: SYMBOL_BASE_ASSET,
    quoteAsset: BINANCE_QUOTE_ASSET,
    trackedMarkets: Object.values(TRACKED_MARKETS),
    openOrders,
    pendingOrders: Array.isArray(state.pendingOrders) ? state.pendingOrders : [],
    pendingOrder,
    positions,
    positionCount: positions.length,
    position: primaryPosition,
    positionMetrics: primaryPositionMetrics,
    positionMetricsMap,
    positionMetricsList,
    aggregatePositionMetrics
  };
}

syncStateMemory();

function getQuoteAssetForSymbol(symbol) {
  const knownQuoteAssets = ['USDT', 'FDUSD', 'BUSD', 'BRL'];
  return knownQuoteAssets.find((quoteAsset) => symbol.endsWith(quoteAsset)) || BINANCE_QUOTE_ASSET;
}

function getBaseAssetForSymbol(symbol) {
  const quoteAsset = getQuoteAssetForSymbol(symbol);
  return symbol.endsWith(quoteAsset)
    ? symbol.slice(0, symbol.length - quoteAsset.length)
    : symbol;
}

function resolveTrackedMarket(key) {
  return TRACKED_MARKETS[String(key || '').toLowerCase()] || null;
}

// ═════════════════════════════════════════════════════════
// BINANCE API
// ═════════════════════════════════════════════════════════
class BinanceAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = normalizeCredentialValue(apiKey);
    this.apiSecret = normalizeCredentialValue(apiSecret);
    this.baseURL = BINANCE_BASE_URL;
    this.symbolRulesBySymbol = new Map();
  }

  createSignature(params) {
    return crypto.createHmac('sha256', this.apiSecret).update(params).digest('hex');
  }

  async signedRequest(method, path, params = {}) {
    const searchParams = new URLSearchParams({
      ...params,
      timestamp: Date.now().toString()
    });
    const signature = this.createSignature(searchParams.toString());
    searchParams.append('signature', signature);

    const response = await axios({
      method,
      url: `${this.baseURL}${path}?${searchParams.toString()}`,
      headers: { 'X-MBX-APIKEY': this.apiKey },
      timeout: 12000
    });

    return response.data;
  }

  normalizeError(error) {
    const statusCode = error?.response?.status;
    const apiMessage = error?.response?.data?.msg || '';

    if (apiMessage.includes('Invalid API-key, IP, or permissions for action')) {
      return 'API Binance sem permissao de trade, IP nao autorizado para ordens, ou credencial invalida';
    }
    if (statusCode === 401) return 'API Key invalida';
    if (statusCode === 403) return 'IP nao autorizado';
    if (apiMessage.includes('Invalid API-key')) return 'API Key invalida';
    if (apiMessage.includes('Signature for this request is not valid')) return 'API Secret invalido';
    if (apiMessage.includes('Invalid IP')) return 'IP nao autorizado';
    if (apiMessage.includes('Service unavailable from a restricted location')) {
      return 'Localizacao/IP bloqueado pela Binance (restricao regulatoria)';
    }
    if (apiMessage.includes('permissions')) return 'Permissao insuficiente na API';
    if (apiMessage.includes('Invalid symbol')) return 'Simbolo invalido para esta corretora';
    if (apiMessage.includes('Timestamp')) return 'Horario do servidor fora do permitido';
    if (error?.code === 'ECONNABORTED') return 'Tempo de resposta da Binance esgotado';
    if (error?.code === 'ENOTFOUND') return 'Falha de rede ao acessar Binance';

    return apiMessage || error?.message || 'Falha na conexao';
  }

  async getAccountInfo() {
    return this.signedRequest('get', '/account');
  }

  buildAccountSnapshot(account, symbol = CONFIG.symbol, currentPrice = null) {
    const quoteBalance = account.balances.find((balance) => balance.asset === BINANCE_QUOTE_ASSET);
    const quoteFree = parseFloat(quoteBalance?.free || 0);
    const quoteLocked = parseFloat(quoteBalance?.locked || 0);
    const quoteTotal = quoteFree + quoteLocked;
    const baseAsset = getBaseAssetForSymbol(symbol);
    const baseBalance = account.balances.find((balance) => balance.asset === baseAsset);
    const baseTotal = parseFloat(baseBalance?.free || 0) + parseFloat(baseBalance?.locked || 0);
    const baseFree = parseFloat(baseBalance?.free || 0);
    const baseLocked = parseFloat(baseBalance?.locked || 0);
    const livePrice = Number(currentPrice || 0);
    const equityQuote = quoteTotal + (baseTotal * livePrice);

    return {
      quoteAsset: BINANCE_QUOTE_ASSET,
      baseAsset,
      symbol,
      quoteFree,
      quoteLocked,
      quoteTotal,
      baseFree,
      baseLocked,
      baseTotal,
      currentPrice: livePrice,
      equityQuote,
      account
    };
  }

  async getAccountSnapshot(symbol = CONFIG.symbol, currentPrice = null, account = null) {
    const accountInfo = account || await this.getAccountInfo();
    const livePrice = currentPrice || await this.getCurrentPrice(symbol);
    return this.buildAccountSnapshot(accountInfo, symbol, livePrice);
  }

  async getBalanceSnapshot(symbol = CONFIG.symbol) {
    const snapshot = await this.getAccountSnapshot(symbol);

    if (snapshot.quoteTotal > 0) {
      return { balance: snapshot.quoteTotal, asset: snapshot.quoteAsset };
    }

    if (snapshot.baseTotal > 0 && snapshot.currentPrice > 0) {
      return { balance: snapshot.baseTotal * snapshot.currentPrice, asset: snapshot.quoteAsset };
    }

    // Ultimo fallback: expor o primeiro saldo real disponivel na conta.
    const account = snapshot.account;
    const firstNonZeroBalance = account.balances.find((item) => {
      const total = parseFloat(item.free || 0) + parseFloat(item.locked || 0);
      return total > 0;
    });

    if (firstNonZeroBalance) {
      const total = parseFloat(firstNonZeroBalance.free || 0) + parseFloat(firstNonZeroBalance.locked || 0);
      return { balance: total, asset: firstNonZeroBalance.asset };
    }

    return { balance: snapshot.quoteTotal, asset: BINANCE_QUOTE_ASSET };
  }

  async getBalance(symbol = CONFIG.symbol) {
    const snapshot = await this.getBalanceSnapshot(symbol);
    return snapshot.balance;
  }

  async getCurrentPrice(symbol = CONFIG.symbol) {
    try {
      const response = await axios.get(`${this.baseURL}/ticker/price?symbol=${symbol}`);
      return parseFloat(response.data.price);
    } catch (e) {
      console.error('Erro ao buscar preço:', e.message);
      return 0;
    }
  }

  async placeOrder(side, quantity, price, symbol = CONFIG.symbol) {
    try {
      return await this.signedRequest('post', '/order', {
        symbol,
        side: side.toUpperCase(),
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity,
        price
      });
    } catch (e) {
      console.error('Erro ao colocar ordem:', e.message);
      return null;
    }
  }

  async placeMarketBuy(quoteOrderQty, clientOrderId, symbol = CONFIG.symbol) {
    return this.signedRequest('post', '/order', {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty,
      newClientOrderId: clientOrderId
    });
  }

  async testMarketBuyOrder(quoteOrderQty, symbol = CONFIG.symbol) {
    return this.signedRequest('post', '/order/test', {
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty
    });
  }

  async placeMarketSell(quantity, clientOrderId, symbol = CONFIG.symbol) {
    return this.signedRequest('post', '/order', {
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity,
      newClientOrderId: clientOrderId
    });
  }

  async placeMarketSellByQuote(quoteOrderQty, clientOrderId, symbol = CONFIG.symbol) {
    return this.signedRequest('post', '/order', {
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quoteOrderQty,
      newClientOrderId: clientOrderId
    });
  }

  async getOrder(orderId, symbol = CONFIG.symbol) {
    return this.signedRequest('get', '/order', {
      symbol,
      orderId
    });
  }

  async getSymbolRules(symbol = CONFIG.symbol) {
    if (this.symbolRulesBySymbol.has(symbol)) {
      return this.symbolRulesBySymbol.get(symbol);
    }

    const response = await axios.get(`${this.baseURL}/exchangeInfo`, {
      params: { symbol },
      timeout: 12000
    });

    const symbolInfo = response.data?.symbols?.[0];
    if (!symbolInfo) {
      throw new Error(`Simbolo ${symbol} não encontrado na Binance`);
    }

    const findFilter = (name) => symbolInfo.filters.find((filter) => filter.filterType === name) || {};
    const lotSize = findFilter('LOT_SIZE');
    const marketLotSize = findFilter('MARKET_LOT_SIZE');
    const priceFilter = findFilter('PRICE_FILTER');
    const notionalFilter = findFilter('NOTIONAL');
    const minNotionalFilter = findFilter('MIN_NOTIONAL');

    const rules = {
      baseAsset: symbolInfo.baseAsset,
      quoteAsset: symbolInfo.quoteAsset,
      baseAssetPrecision: Number(symbolInfo.baseAssetPrecision || 8),
      minQty: parseFloat(lotSize.minQty || 0),
      stepSize: parseFloat(lotSize.stepSize || 1),
      marketMinQty: parseFloat(marketLotSize.minQty || 0),
      marketStepSize: parseFloat(marketLotSize.stepSize || 0),
      tickSize: parseFloat(priceFilter.tickSize || 0.01),
      minNotional: parseFloat(notionalFilter.minNotional || minNotionalFilter.minNotional || 0)
    };

    this.symbolRulesBySymbol.set(symbol, rules);
    return rules;
  }

  async getOpenOrders(symbol = CONFIG.symbol) {
    try {
      return await this.signedRequest('get', '/openOrders', {
        symbol
      });
    } catch (e) {
      console.error('Erro ao buscar ordens abertas:', e.message);
      return [];
    }
  }

  async cancelOrder(orderId, symbol = CONFIG.symbol) {
    try {
      return await this.signedRequest('delete', '/order', {
        symbol,
        orderId
      });
    } catch (e) {
      console.error('Erro ao cancelar ordem:', e.message);
      return null;
    }
  }
}

let binanceAPI = null;
let binanceAutoReconnectInterval = null;
const MAX_RECONNECT_ATTEMPTS = 5;
let binanceReconnectAttempts = 0;
let binanceConfigWarningLogged = false;

function createBinanceClient(apiKey, apiSecret) {
  return new BinanceAPI(apiKey, apiSecret);
}

async function testBinanceCredentials(apiKey, apiSecret) {
  const previewAPI = createBinanceClient(apiKey, apiSecret);
  const snapshot = await previewAPI.getBalanceSnapshot();
  return {
    balance: snapshot.balance,
    asset: snapshot.asset
  };
}

function updateBinanceConnectionState({ connected, status, error = '', balance = 0, asset = BINANCE_QUOTE_ASSET }) {
  const changed =
    state.realBalance !== balance ||
    state.realBalanceAsset !== asset ||
    state.binanceConnected !== connected ||
    state.binanceStatus !== status ||
    state.binanceLastError !== error;

  state.realBalance = balance;
  state.realBalanceAsset = asset;
  state.binanceConnected = connected;
  state.binanceStatus = status;
  state.binanceLastError = error;

  return changed;
}

function markBinanceMissingCredentials() {
  const missing = [];
  if (!normalizeCredentialValue(process.env.BINANCE_API_KEY)) missing.push('BINANCE_API_KEY');
  if (!normalizeCredentialValue(process.env.BINANCE_API_SECRET)) missing.push('BINANCE_API_SECRET');

  if (!missing.length) {
    binanceConfigWarningLogged = false;
    return false;
  }

  binanceAPI = null;
  const errorMessage = `Servidor sem ${missing.join(' e ')} no .env`;
  const changed = updateBinanceConnectionState({
    connected: false,
    status: 'Credenciais ausentes ⚠️',
    error: errorMessage,
    balance: 0,
    asset: BINANCE_QUOTE_ASSET
  });

  if (!binanceConfigWarningLogged) {
    console.log(`⚠️ Chaves Binance não configuradas no .env (${missing.join(', ')})`);
    binanceConfigWarningLogged = true;
  }

  if (changed) {
    broadcastUpdate();
  }

  return true;
}

// ═════════════════════════════════════════════════════════
// BINANCE - CONEXÃO AUTOMÁTICA E PERMANENTE
// ═════════════════════════════════════════════════════════

function connectBinanceAuto() {
  if (markBinanceMissingCredentials()) {
    return;
  }

  const apiKey = normalizeCredentialValue(process.env.BINANCE_API_KEY);
  const apiSecret = normalizeCredentialValue(process.env.BINANCE_API_SECRET);

  if (binanceAPI && state.binanceConnected) {
    console.log('✅ Binance já conectada');
    return;
  }

  console.log(`🔄 Tentando conectar Binance (tentativa ${binanceReconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
  
  binanceAPI = createBinanceClient(apiKey, apiSecret);
  
  binanceAPI.getBalanceSnapshot().then((snapshot) => {
    updateBinanceConnectionState({
      connected: true,
      status: 'Conectada ✅',
      error: '',
      balance: snapshot.balance,
      asset: snapshot.asset
    });
    binanceReconnectAttempts = 0; // Reset contagem
    console.log(`🔌 Binance conectada com sucesso! Balance: ${snapshot.balance.toFixed(2)} ${snapshot.asset}`);
    broadcastUpdate();
  }).catch((error) => {
    binanceAPI = null;
    updateBinanceConnectionState({
      connected: false,
      status: 'Desconectada ❌',
      error: new BinanceAPI('', '').normalizeError(error),
      balance: 0,
      asset: BINANCE_QUOTE_ASSET
    });
    
    binanceReconnectAttempts++;
    console.error(`❌ Erro ao conectar Binance (${binanceReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, state.binanceLastError);
    broadcastUpdate();

    // Tentar reconectar em 5-30 segundos
    if (binanceReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('⚠️ Máximo de tentativas atingido. Reconnect será tentado a cada 2 minutos');
      binanceReconnectAttempts = 0; // Reset para tentar novamente depois
    }
  });
}

function startBinanceHealthCheck() {
  // Verificar conexão Binance a cada 30 segundos
  binanceAutoReconnectInterval = setInterval(() => {
    if (markBinanceMissingCredentials()) {
      return;
    }

    if (!state.binanceConnected || !binanceAPI) {
      connectBinanceAuto();
    } else if (binanceAPI) {
      // Verificar se está realmente conectada
      binanceAPI.getBalance().catch(() => {
        state.binanceConnected = false;
        state.binanceStatus = 'Verificando...';
        connectBinanceAuto();
      });
    }
  }, 30000); // A cada 30 segundos
}

function stopBinanceHealthCheck() {
  if (binanceAutoReconnectInterval) {
    clearInterval(binanceAutoReconnectInterval);
    binanceAutoReconnectInterval = null;
  }
}
function calculateSignals() {
  // 🧠 Usar memória para decisões mais inteligentes
  const priceFeed = state.trades.slice(-10).map(t => t.price);
  
  // Confiança baseada em histórico de aprendizado
  let confidence = 0.55 + Math.random() * 0.3;
  
  if (aiMemory.memory.totalDecisions > 50) {
    // Usar padrões aprendidos
    confidence = aiMemory.predictConfidence(priceFeed, 'BUY');
  }
  
  // Detectar padrões perigosos
  const warnings = aiMemory.getWarningPatterns();
  if (warnings.length > 0) {
    confidence *= 0.8; // Reduzir confiança se houver padrões perigosos
  }
  
  const rand = Math.random();
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

  // 🧠 Aprender do resultado da operação
  const priceFeed = state.trades.slice(-10).map(t => t.price);
  aiMemory.learnPattern(priceFeed, side, pnl);

  // ⚖️ Registrar transação para compliance
  aiCompliance.recordTransaction({
    type: side === 'BUY' ? 'BUY' : 'SELL',
    amount: tradeSize,
    currency: 'BRL',
    price,
    userId: 'ia-trader-bot'
  });

  // 🔐 Log de segurança
  aiSecurity.logSecurityEvent('TRADE_EXECUTED', 'trading-bot', {
    side,
    price: price.toFixed(2),
    size: tradeSize.toFixed(2),
    pnl: pnl.toFixed(2),
    confidence: confidence.toFixed(2)
  });

  broadcastUpdate();
  console.log(`[TRADE] ${side} @ ${price.toFixed(2)} | PnL: ${pnl.toFixed(2)} | Balance: ${state.balance.toFixed(2)}`);
  return trade;
}

function getLocalDemoBasePrice(assetKey = PRIMARY_MARKET_KEY) {
  return assetKey === 'eth' ? 18250 : 372500;
}

function getAssetQuantityPrecision(assetKey) {
  return assetKey === 'eth' ? 4 : 6;
}

function updateSimulationEquity() {
  const openMarketValue = getOpenPositions()
    .filter((position) => position.mode === 'simulation')
    .reduce((sum, position) => {
      const currentPrice = Number(state.currentPrices?.[position.assetKey] || position.entryPrice || 0);
      return sum + (Number(position.quantity || 0) * currentPrice);
    }, 0);

  state.balance = Number((state.simulationQuoteFree + openMarketValue).toFixed(2));
  return state.balance;
}

function appendDemoTrade(trade, options = {}) {
  const {
    seedMemory = false,
    seedCompliance = false,
    seedSecurity = false
  } = options;

  state.trades.push(trade);
  state.totalProfit += trade.pnl;
  if (trade.won) state.wins += 1;
  else state.losses += 1;

  const priceFeed = [
    trade.price * 0.991,
    trade.price * 0.996,
    trade.price * 1.002,
    trade.price * 0.998,
    trade.price
  ];

  if (seedMemory) {
    aiMemory.learnPattern(priceFeed, trade.side, trade.pnl);
  }

  if (seedCompliance) {
    aiCompliance.recordTransaction({
      type: trade.side,
      amount: trade.size,
      currency: BINANCE_QUOTE_ASSET,
      price: trade.price,
      userId: 'local-demo',
      verificatedId: true,
      country: 'BR'
    });
  }

  if (seedSecurity) {
    aiSecurity.logSecurityEvent('SIMULATION_DEMO_TRADE', 'local-demo', {
      side: trade.side,
      price: trade.price.toFixed(2),
      pnl: trade.pnl.toFixed(2),
      confidence: trade.confidence.toFixed(2)
    });
  }
}

function ensureLocalSimulationDemoData() {
  if (!LOCAL_DEMO_SEED_ENABLED || state.mode !== 'simulation' || state.trades.length > 0) {
    return false;
  }

  const now = Date.now();
  const seedMemory = Number(aiMemory.memory.totalDecisions || 0) < 12;
  const seedCompliance = aiCompliance.transactions.length < 8;
  const seedSecurity = aiSecurity.auditLog.length < 12;
  const rawTradeSize = CONFIG.initialBalance * CONFIG.tradeSize;

  state.balance = CONFIG.initialBalance;
  state.realBalance = 0;
  state.realBalanceAsset = BINANCE_QUOTE_ASSET;
  state.binanceConnected = false;
  state.binanceStatus = 'Simulação local';
  state.binanceLastError = '';
  state.wins = 0;
  state.losses = 0;
  state.totalProfit = 0;
  state.trades = [];
  state.positions = {};
  state.openOrders = [];
  state.pendingOrders = [];
  state.pendingOrder = null;
  state.running = false;
  state.startedAt = null;
  state.uptime = 0;
  state.currentPrices = {};
  state.marketByAsset = {};
  state.lastSignals = {};
  state.cooldowns = {};

  const demoTrades = [
    { assetKey: 'btc', minutesAgo: 7 * 60, side: 'BUY', priceFactor: 0.984, pnlFactor: 0.028, confidence: 0.73 },
    { assetKey: 'eth', minutesAgo: 6 * 60 + 20, side: 'BUY', priceFactor: 0.992, pnlFactor: -0.016, confidence: 0.61 },
    { assetKey: 'btc', minutesAgo: 5 * 60 + 35, side: 'BUY', priceFactor: 0.989, pnlFactor: 0.031, confidence: 0.77 },
    { assetKey: 'eth', minutesAgo: 4 * 60 + 10, side: 'BUY', priceFactor: 1.004, pnlFactor: 0.024, confidence: 0.69 },
    { assetKey: 'btc', minutesAgo: 3 * 60 + 25, side: 'BUY', priceFactor: 1.009, pnlFactor: -0.018, confidence: 0.58 },
    { assetKey: 'eth', minutesAgo: 2 * 60 + 40, side: 'BUY', priceFactor: 1.003, pnlFactor: 0.029, confidence: 0.74 },
    { assetKey: 'btc', minutesAgo: 95, side: 'BUY', priceFactor: 1.012, pnlFactor: 0.021, confidence: 0.67 },
    { assetKey: 'eth', minutesAgo: 38, side: 'BUY', priceFactor: 1.006, pnlFactor: 0.017, confidence: 0.72 }
  ];

  demoTrades.forEach((item, index) => {
    const market = TRACKED_MARKETS[item.assetKey] || PRIMARY_TRACKED_MARKET;
    const basePrice = getLocalDemoBasePrice(item.assetKey);
    const size = Number((rawTradeSize * (0.9 + (index * 0.03))).toFixed(2));
    const pnl = Number((size * item.pnlFactor).toFixed(2));
    appendDemoTrade({
      id: index + 1,
      assetKey: market.key,
      symbol: market.symbol,
      label: market.label,
      baseAsset: market.baseAsset,
      timestamp: new Date(now - (item.minutesAgo * 60000)).toISOString(),
      side: item.side,
      price: Number((basePrice * item.priceFactor).toFixed(2)),
      size,
      pnl,
      won: pnl > 0,
      confidence: item.confidence
    }, {
      seedMemory,
      seedCompliance,
      seedSecurity
    });
  });

  const seededPositions = [
    { assetKey: 'btc', entryFactor: 1.004, currentFactor: 1.011, confidence: 0.78 },
    { assetKey: 'eth', entryFactor: 1.002, currentFactor: 1.008, confidence: 0.74 }
  ];
  let totalOpenQuoteSpent = 0;

  seededPositions.forEach((item, index) => {
    const market = TRACKED_MARKETS[item.assetKey] || PRIMARY_TRACKED_MARKET;
    const basePrice = getLocalDemoBasePrice(item.assetKey);
    const currentPrice = Number((basePrice * item.currentFactor).toFixed(2));
    const entryPrice = Number((basePrice * item.entryFactor).toFixed(2));
    const quantity = Number((((rawTradeSize * (1.05 + (index * 0.08))) / entryPrice)).toFixed(getAssetQuantityPrecision(item.assetKey)));
    const quoteSpent = Number((quantity * entryPrice).toFixed(2));
    totalOpenQuoteSpent += quoteSpent;

    state.currentPrices[item.assetKey] = currentPrice;
    state.marketByAsset[item.assetKey] = {
      ema9: Number((currentPrice * 0.998).toFixed(2)),
      ema21: Number((currentPrice * 0.992).toFixed(2)),
      rsi: Number((55.8 + (index * 2.2)).toFixed(2)),
      macd: Number((currentPrice * 0.00042).toFixed(2)),
      macdSignal: Number((currentPrice * 0.00034).toFixed(2)),
      macdHistogram: Number((currentPrice * 0.00008).toFixed(2)),
      volatility: Number((0.0108 + (index * 0.0012)).toFixed(4))
    };
    setPositionForAsset(item.assetKey, {
      assetKey: item.assetKey,
      symbol: market.symbol,
      label: market.label,
      baseAsset: market.baseAsset,
      mode: 'simulation',
      side: 'LONG',
      quantity,
      entryPrice,
      quoteSpent,
      highestPrice: currentPrice,
      stopPrice: Number((entryPrice * (1 - CONFIG.stopLoss)).toFixed(2)),
      takeProfitPrice: Number((entryPrice * (1 + CONFIG.takeProfit)).toFixed(2)),
      openedAt: new Date(now - ((52 + (index * 11)) * 60000)).toISOString(),
      confidence: item.confidence,
      source: 'bot'
    }, item.assetKey);
    setLastSignalForAsset(item.assetKey, {
      action: 'BUY',
      confidence: item.confidence,
      reason: `${market.baseAsset} em reteste de EMA9 com confirmação de fluxo`,
      reasons: [
        'EMA9 acima da EMA21',
        'MACD em expansão positiva',
        'RSI em zona saudável para continuação'
      ]
    });
  });

  state.simulationQuoteFree = Number((CONFIG.initialBalance + state.totalProfit - totalOpenQuoteSpent).toFixed(2));
  updateSimulationEquity();
  syncLegacyRuntimeState(PRIMARY_MARKET_KEY);

  state.status = 'Parado';
  state.cooldowns = { btc: 0, eth: 0 };
  state.cooldownUntil = 0;
  updateRuntimeMetrics();

  if (seedSecurity) {
    aiSecurity.logSecurityEvent('LOCAL_DEMO_SEED', 'local-demo', {
      symbol: CONFIG.symbol,
      trades: state.trades.length,
      positionCount: getOpenPositions().length
    });
  }

  syncStateMemory();
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stepPrecision(stepSize) {
  const numeric = Number(stepSize || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalized = numeric.toFixed(12).replace(/0+$/, '');
  const decimalIndex = normalized.indexOf('.');
  return decimalIndex === -1 ? 0 : normalized.length - decimalIndex - 1;
}

function roundDownToStep(value, stepSize) {
  const numeric = Number(value || 0);
  const step = Number(stepSize || 0);

  if (!Number.isFinite(numeric) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }

  const rounded = Math.floor((numeric + Number.EPSILON) / step) * step;
  return Number(rounded.toFixed(stepPrecision(step)));
}

function formatStepValue(value, stepSize) {
  return roundDownToStep(value, stepSize).toFixed(stepPrecision(stepSize));
}

function normalizeMarketQuantity(value, rules) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  const marketStepSize = Number(rules?.marketStepSize || 0);
  if (marketStepSize > 0) {
    return roundDownToStep(numeric, marketStepSize);
  }

  const precision = Math.max(0, Math.min(8, Number(rules?.baseAssetPrecision || 8)));
  return Number(numeric.toFixed(precision));
}

function formatMarketQuantity(value, rules) {
  const normalized = normalizeMarketQuantity(value, rules);
  const marketStepSize = Number(rules?.marketStepSize || 0);
  if (marketStepSize > 0) {
    return normalized.toFixed(stepPrecision(marketStepSize));
  }

  const precision = Math.max(0, Math.min(8, Number(rules?.baseAssetPrecision || 8)));
  return normalized.toFixed(precision).replace(/\.0+$|(?<=\.\d*?)0+$/g, '');
}

function calculateMinimumProtectedQuoteBudget(minNotional) {
  const floorNotional = Math.max(10, Number(minNotional || 0));
  const buffer = Math.max(0, Math.min(0.25, Number(REAL_MIN_EXIT_BUFFER || 0)));
  const denominator = Math.max(0.5, 1 - buffer);
  const quoteDigits = BINANCE_QUOTE_ASSET === 'BRL' ? 2 : 6;
  return Number((floorNotional / denominator).toFixed(quoteDigits));
}

function calculateEma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const seed = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const multiplier = 2 / (period + 1);
  let ema = seed;

  for (let index = period; index < values.length; index++) {
    ema = (values[index] * multiplier) + (ema * (1 - multiplier));
  }

  return ema;
}

function calculateEmaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const result = new Array(values.length).fill(null);
  const seed = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  const multiplier = 2 / (period + 1);
  let ema = seed;
  result[period - 1] = ema;

  for (let index = period; index < values.length; index++) {
    ema = (values[index] * multiplier) + (ema * (1 - multiplier));
    result[index] = ema;
  }

  return result;
}

function calculateRsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return 50;

  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index++) {
    const change = values[index] - values[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMacd(values) {
  const fastSeries = calculateEmaSeries(values, 12);
  const slowSeries = calculateEmaSeries(values, 26);
  const macdValues = [];

  for (let index = 0; index < values.length; index++) {
    if (fastSeries[index] === null || slowSeries[index] === null) continue;
    macdValues.push(fastSeries[index] - slowSeries[index]);
  }

  if (!macdValues.length) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const signalSeries = calculateEmaSeries(macdValues, 9);
  const line = macdValues[macdValues.length - 1] || 0;
  const signal = signalSeries[signalSeries.length - 1] || 0;

  return {
    line,
    signal,
    histogram: line - signal
  };
}

function calculateVolatility(values, lookback = 20) {
  if (!Array.isArray(values) || values.length <= lookback) return 0;

  const slice = values.slice(-lookback);
  const returns = [];
  for (let index = 1; index < slice.length; index++) {
    const previous = slice[index - 1];
    const current = slice[index];
    if (!previous) continue;
    returns.push((current - previous) / previous);
  }

  if (!returns.length) return 0;
  const avg = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + ((item - avg) ** 2), 0) / returns.length;
  return Math.sqrt(variance);
}

async function fetchMarketSnapshot(symbol = CONFIG.symbol, limit = 120) {
  const response = await axios.get(`${BINANCE_BASE_URL}/klines`, {
    params: {
      symbol,
      interval: '1m',
      limit
    },
    timeout: 12000
  });

  const candles = response.data.map((item) => ({
    openTime: Number(item[0]),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
    closeTime: Number(item[6])
  }));

  const closes = candles.map((item) => item.close).filter((item) => Number.isFinite(item));
  const currentPrice = closes[closes.length - 1] || 0;
  const ema9 = calculateEma(closes, 9) || currentPrice;
  const ema21 = calculateEma(closes, 21) || currentPrice;
  const rsi = calculateRsi(closes, 14);
  const macd = calculateMacd(closes);
  const volatility = calculateVolatility(closes, 20);

  return {
    symbol,
    baseAsset: getBaseAssetForSymbol(symbol),
    quoteAsset: getQuoteAssetForSymbol(symbol),
    candles,
    closes,
    currentPrice,
    indicators: {
      ema9,
      ema21,
      rsi,
      macd: macd.line,
      macdSignal: macd.signal,
      macdHistogram: macd.histogram,
      volatility
    }
  };
}

async function fetchTrackedMarketSnapshots(limit = 120) {
  const entries = await Promise.all(
    Object.values(TRACKED_MARKETS).map(async (market) => ([
      market.key,
      await fetchMarketSnapshot(market.symbol, limit)
    ]))
  );

  return Object.fromEntries(entries);
}

function normalizeMarketChartInterval(interval) {
  const normalized = String(interval || '1m').trim();
  return ['1m', '5m', '15m', '1h', '4h'].includes(normalized) ? normalized : '1m';
}

function normalizeMarketChartLimit(limit, fallback = 120) {
  const numeric = Number(limit || fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(40, Math.min(240, Math.floor(numeric)));
}

async function fetchPublicMarketOverview(symbol, options = {}) {
  const chartInterval = normalizeMarketChartInterval(options.chartInterval);
  const chartLimit = normalizeMarketChartLimit(options.chartLimit, 120);
  const intradayLimit = normalizeMarketChartLimit(options.intradayLimit, 120);
  const dailyLimit = normalizeMarketChartLimit(options.dailyLimit, 120);
  const quoteAsset = getQuoteAssetForSymbol(symbol);
  const baseAsset = getBaseAssetForSymbol(symbol);
  const chartKlinesPromise = chartInterval === '1m'
    ? null
    : axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: {
        symbol,
        interval: chartInterval,
        limit: chartLimit
      },
      timeout: 12000
    });

  const [intradayKlinesResp, dailyKlinesResp, tickerResp, dayStatsResp, chartKlinesResp] = await Promise.all([
    axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: {
        symbol,
        interval: '1m',
        limit: intradayLimit
      },
      timeout: 12000
    }),
    axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: {
        symbol,
        interval: '1d',
        limit: dailyLimit
      },
      timeout: 12000
    }),
    axios.get(`${BINANCE_BASE_URL}/ticker/price`, {
      params: { symbol },
      timeout: 12000
    }),
    axios.get(`${BINANCE_BASE_URL}/ticker/24hr`, {
      params: { symbol },
      timeout: 12000
    }),
    chartKlinesPromise
  ]);

  const chartKlines = chartKlinesResp?.data || intradayKlinesResp.data;

  const intradayCloses = intradayKlinesResp.data
    .map((item) => parseFloat(item[4]))
    .filter((value) => Number.isFinite(value));
  const intradayHigh = intradayCloses.length ? Math.max(...intradayCloses) : 0;
  const intradayLow = intradayCloses.length ? Math.min(...intradayCloses) : 0;
  const lastPrice = parseFloat(tickerResp.data?.price || 0);
  const intradayStart = intradayCloses[0] || lastPrice || 1;
  const intradayChangePercent = intradayCloses.length > 1
    ? ((lastPrice - intradayStart) / intradayStart) * 100
    : 0;
  const intradayRangePercent = intradayLow > 0
    ? ((intradayHigh - intradayLow) / intradayLow) * 100
    : 0;
  const ema9 = calculateEma(intradayCloses, 9) || lastPrice;
  const ema21 = calculateEma(intradayCloses, 21) || lastPrice;
  const rsi = calculateRsi(intradayCloses, 14);
  const macd = calculateMacd(intradayCloses);
  const volatility = calculateVolatility(intradayCloses, 20);

  return {
    ok: true,
    symbol,
    baseAsset,
    asset: quoteAsset,
    chartInterval,
    klines: chartKlines,
    intradayKlines: intradayKlinesResp.data,
    dailyKlines: dailyKlinesResp.data,
    ticker: tickerResp.data,
    stats24h: dayStatsResp.data,
    summary: {
      lastPrice,
      open24h: parseFloat(dayStatsResp.data?.openPrice || 0),
      priceChangePercent24h: parseFloat(dayStatsResp.data?.priceChangePercent || 0),
      high24h: parseFloat(dayStatsResp.data?.highPrice || 0),
      low24h: parseFloat(dayStatsResp.data?.lowPrice || 0),
      weightedAvgPrice24h: parseFloat(dayStatsResp.data?.weightedAvgPrice || 0),
      quoteVolume24h: parseFloat(dayStatsResp.data?.quoteVolume || 0),
      intradayHigh,
      intradayLow,
      intradayChangePercent,
      intradayRangePercent,
      ema9,
      ema21,
      rsi,
      macd: macd.line,
      macdSignal: macd.signal,
      macdHistogram: macd.histogram,
      volatility
    }
  };
}

function getPendingOrderView(order, market) {
  if (!order) return null;
  return {
    assetKey: market?.key || null,
    symbol: market?.symbol || order.symbol || CONFIG.symbol,
    label: market?.label || order.symbol || CONFIG.symbol,
    orderId: order.orderId,
    side: order.side,
    status: order.status,
    type: order.type,
    price: parseFloat(order.price || 0),
    quantity: parseFloat(order.origQty || 0),
    executedQty: parseFloat(order.executedQty || 0),
    clientOrderId: order.clientOrderId,
    createdAt: order.time || order.transactTime || Date.now(),
    ageMs: Math.max(0, Date.now() - Number(order.time || order.transactTime || Date.now()))
  };
}

function buildTrackedPortfolioSnapshot(account, marketSnapshots = {}) {
  const quoteBalance = account.balances.find((balance) => balance.asset === BINANCE_QUOTE_ASSET);
  const quoteFree = parseFloat(quoteBalance?.free || 0);
  const quoteLocked = parseFloat(quoteBalance?.locked || 0);
  const quoteTotal = quoteFree + quoteLocked;
  const assets = getTrackedMarketEntries().reduce((assetMap, [assetKey, market]) => {
    const balance = account.balances.find((item) => item.asset === market.baseAsset);
    const baseFree = parseFloat(balance?.free || 0);
    const baseLocked = parseFloat(balance?.locked || 0);
    const baseTotal = baseFree + baseLocked;
    const currentPrice = Number(marketSnapshots?.[assetKey]?.currentPrice || state.currentPrices?.[assetKey] || 0);

    assetMap[assetKey] = {
      assetKey,
      symbol: market.symbol,
      label: market.label,
      baseAsset: market.baseAsset,
      quoteAsset: BINANCE_QUOTE_ASSET,
      currentPrice,
      baseFree,
      baseLocked,
      baseTotal,
      notional: baseTotal * currentPrice
    };
    return assetMap;
  }, {});

  const equityQuote = quoteTotal + Object.values(assets).reduce((sum, assetSnapshot) => sum + Number(assetSnapshot.notional || 0), 0);

  return {
    quoteAsset: BINANCE_QUOTE_ASSET,
    quoteFree,
    quoteLocked,
    quoteTotal,
    equityQuote,
    assets,
    account
  };
}

function syncRealPortfolioState(snapshot) {
  state.realBalance = snapshot.quoteFree;
  state.realBalanceAsset = snapshot.quoteAsset;
  if (state.mode === 'real') {
    state.balance = snapshot.equityQuote || snapshot.quoteTotal || state.balance;
  }
}

function syncDetectedPositionsFromPortfolio(snapshot) {
  for (const [assetKey, assetSnapshot] of Object.entries(snapshot.assets || {})) {
    const position = getPositionForAsset(assetKey);
    if (position && position.mode === 'real') {
      if ((assetSnapshot.notional || 0) < 10) {
        setPositionForAsset(assetKey, null, assetKey);
      } else {
        setPositionForAsset(assetKey, {
          ...position,
          quantity: assetSnapshot.baseTotal,
          highestPrice: Math.max(Number(position.highestPrice || position.entryPrice || 0), Number(assetSnapshot.currentPrice || 0))
        }, assetKey);
      }
    }
  }

  syncLegacyRuntimeState();
}

async function loadTrackedSymbolRules() {
  const entries = await Promise.all(
    Object.values(TRACKED_MARKETS).map(async (market) => ([market.key, await binanceAPI.getSymbolRules(market.symbol)]))
  );

  return Object.fromEntries(entries);
}

function calculateRealQuoteBudget(quoteFree, minNotional) {
  const tradableQuote = Math.max(0, quoteFree - REAL_QUOTE_RESERVE);
  if (tradableQuote <= 0) return 0;

  const protectedMinQuote = calculateMinimumProtectedQuoteBudget(minNotional);
  const proportionalBudget = tradableQuote * CONFIG.tradeSize;
  const desiredBudget = proportionalBudget >= protectedMinQuote
    ? proportionalBudget
    : (tradableQuote >= protectedMinQuote ? protectedMinQuote : proportionalBudget);

  return Math.max(0, Math.min(tradableQuote, desiredBudget));
}

function getLongPositionPerformance(position, currentPrice) {
  const entryPrice = Number(position?.entryPrice || 0);
  const livePrice = Number(currentPrice || 0);
  const highestPrice = Math.max(Number(position?.highestPrice || entryPrice || 0), livePrice);
  const unrealizedReturn = entryPrice > 0 ? ((livePrice - entryPrice) / entryPrice) : 0;
  const peakReturn = entryPrice > 0 ? ((highestPrice - entryPrice) / entryPrice) : 0;
  const retracementFromPeak = highestPrice > 0 ? ((highestPrice - livePrice) / highestPrice) : 0;

  return {
    entryPrice,
    livePrice,
    highestPrice,
    unrealizedReturn,
    peakReturn,
    retracementFromPeak
  };
}

function updateLongPositionProtection(position, currentPrice) {
  if (!position || position.side !== 'LONG') {
    return position;
  }

  const { entryPrice, highestPrice, peakReturn } = getLongPositionPerformance(position, currentPrice);
  const quoteDigits = BINANCE_QUOTE_ASSET === 'BRL' ? 2 : 6;
  let nextStopPrice = Number(position.stopPrice || 0);

  position.highestPrice = highestPrice;

  if (peakReturn >= CONFIG.breakEvenTrigger) {
    nextStopPrice = Math.max(nextStopPrice, entryPrice * (1 + CONFIG.breakEvenOffset));
  }

  if (peakReturn >= CONFIG.trailingStopTrigger) {
    nextStopPrice = Math.max(nextStopPrice, highestPrice * (1 - CONFIG.trailingStopGap));
  }

  if (nextStopPrice > 0) {
    position.stopPrice = Number(nextStopPrice.toFixed(quoteDigits));
  }

  return position;
}

function buildRealSignal(market, position) {
  const reasons = [];
  const entrySignals = [];
  const exitSignals = [];
  const { ema9, ema21, rsi, macdHistogram, volatility } = market.indicators;
  const trendDeltaPct = ema21 ? (ema9 - ema21) / ema21 : 0;
  let buyScore = 0;
  let sellScore = 0;

  if (ema9 > ema21) {
    buyScore += 0.28;
    entrySignals.push('EMA9 acima da EMA21');
  } else {
    sellScore += 0.28;
    exitSignals.push('EMA9 abaixo da EMA21');
  }

  if (macdHistogram > 0) {
    buyScore += 0.22;
    entrySignals.push('MACD positivo');
  } else {
    sellScore += 0.22;
    exitSignals.push('MACD negativo');
  }

  if (rsi >= 52 && rsi <= 68) {
    buyScore += 0.18;
    entrySignals.push('RSI em zona de impulso');
  }
  if (rsi >= 72) {
    sellScore += 0.22;
    exitSignals.push('RSI sobrecomprado');
  }
  if (rsi <= 42) {
    sellScore += 0.08;
    exitSignals.push('RSI abaixo do suporte de momentum');
  }

  if (volatility <= 0.018) {
    buyScore += 0.12;
    entrySignals.push('Volatilidade controlada');
  } else {
    sellScore += 0.12;
    exitSignals.push('Volatilidade alta');
  }

  if (trendDeltaPct > 0) {
    buyScore += Math.min(0.14, trendDeltaPct * 8);
  } else {
    sellScore += Math.min(0.14, Math.abs(trendDeltaPct) * 8);
  }

  if (position) {
    const performance = getLongPositionPerformance(position, market.currentPrice);

    if (market.currentPrice <= position.stopPrice) {
      return {
        action: 'SELL',
        confidence: 0.99,
        reason: 'Stop loss acionado',
        reasons: [`Preço em ${market.currentPrice.toFixed(2)} abaixo do stop ${position.stopPrice.toFixed(2)}`]
      };
    }

    if (market.currentPrice >= position.takeProfitPrice) {
      return {
        action: 'SELL',
        confidence: 0.99,
        reason: 'Take profit acionado',
        reasons: [`Preço em ${market.currentPrice.toFixed(2)} acima do alvo ${position.takeProfitPrice.toFixed(2)}`]
      };
    }

    const exitConfidence = clamp(0.16 + sellScore, 0.05, 0.99);
    const strongReversal = sellScore >= 0.5 || (ema9 < ema21 && macdHistogram < 0 && rsi <= 48);
    reasons.push(...exitSignals);

    if (
      strongReversal &&
      performance.peakReturn >= CONFIG.minProfitForSignalExit &&
      performance.retracementFromPeak >= CONFIG.trailingExitRetracement &&
      exitConfidence >= CONFIG.minExitConfidence
    ) {
      return {
        action: 'SELL',
        confidence: exitConfidence,
        reason: 'Proteção de lucro por reversão',
        reasons: [
          ...reasons,
          `Lucro travado após pico de ${(performance.peakReturn * 100).toFixed(2)}% e retração de ${(performance.retracementFromPeak * 100).toFixed(2)}%`
        ]
      };
    }

    if (
      strongReversal &&
      performance.unrealizedReturn <= -(CONFIG.stopLoss * 0.55) &&
      exitConfidence >= CONFIG.minExitConfidence
    ) {
      return {
        action: 'SELL',
        confidence: exitConfidence,
        reason: 'Saída defensiva antes do stop',
        reasons: [
          ...reasons,
          `Estrutura perdeu força com P/L aberto em ${(performance.unrealizedReturn * 100).toFixed(2)}%`
        ]
      };
    }

    return {
      action: 'HOLD',
      confidence: exitConfidence,
      reason: 'Posição mantida',
      reasons: exitSignals.length ? exitSignals : ['Nenhum gatilho de saída']
    };
  }

  const buyConfidence = clamp(0.28 + buyScore, 0.05, 0.99);
  reasons.push(...entrySignals);

  if (buyConfidence >= CONFIG.minConfidence) {
    return {
      action: 'BUY',
      confidence: buyConfidence,
      reason: 'Setup de compra confirmado',
      reasons
    };
  }

  return {
    action: 'HOLD',
    confidence: buyConfidence,
    reason: 'Sem setup suficiente',
    reasons: entrySignals.length ? entrySignals : ['Mercado sem direção clara']
  };
}

function parseFilledOrder(order, fallbackPrice) {
  const executedQty = parseFloat(order?.executedQty || 0);
  const quoteQuantity = parseFloat(order?.cummulativeQuoteQty || 0);
  const avgPrice = executedQty > 0 ? quoteQuantity / executedQty : fallbackPrice;

  return {
    order,
    status: order?.status || 'UNKNOWN',
    executedQty,
    quoteQuantity,
    avgPrice: Number.isFinite(avgPrice) ? avgPrice : fallbackPrice,
    filled: order?.status === 'FILLED' && executedQty > 0
  };
}

async function confirmFilledOrder(order, fallbackPrice, symbol = CONFIG.symbol) {
  let latest = order;

  for (let attempt = 0; attempt < 5; attempt++) {
    const parsed = parseFilledOrder(latest, fallbackPrice);
    if (parsed.filled) {
      return parsed;
    }

    if (!latest?.orderId) {
      return parsed;
    }

    await sleep(1200);
    latest = await binanceAPI.getOrder(latest.orderId, symbol);
  }

  return parseFilledOrder(latest, fallbackPrice);
}

async function syncOpenOrders() {
  const normalizedOrders = [];

  for (const market of Object.values(TRACKED_MARKETS)) {
    let openOrders = await binanceAPI.getOpenOrders(market.symbol);
    let normalized = openOrders.map((order) => getPendingOrderView(order, market));
    const staleBotOrders = normalized.filter((order) => (
      order.clientOrderId?.startsWith(REAL_ORDER_PREFIX) && order.ageMs > REAL_ORDER_TIMEOUT_MS
    ));

    for (const order of staleBotOrders) {
      await binanceAPI.cancelOrder(order.orderId, market.symbol);
      aiSecurity.logSecurityEvent('STALE_ORDER_CANCELLED', 'trading-bot', {
        orderId: order.orderId,
        side: order.side,
        ageMs: order.ageMs,
        symbol: market.symbol
      });
    }

    if (staleBotOrders.length) {
      openOrders = await binanceAPI.getOpenOrders(market.symbol);
      normalized = openOrders.map((order) => getPendingOrderView(order, market));
    }

    normalizedOrders.push(...normalized);
  }

  state.openOrders = normalizedOrders;
  setPendingOrders(normalizedOrders);
  return normalizedOrders;
}

function registerRealTrade({ market, position, exitPrice, pnl, confidence, reason, marketSnapshot }) {
  const trade = {
    id: state.trades.length + 1,
    timestamp: new Date().toISOString(),
    assetKey: market.key,
    symbol: market.symbol,
    label: market.label,
    baseAsset: market.baseAsset,
    side: position.side === 'LONG' ? 'BUY' : 'SELL',
    price: position.entryPrice,
    exitPrice,
    size: position.quoteSpent,
    quantity: position.quantity,
    pnl,
    won: pnl > 0,
    confidence,
    reason,
    mode: 'real'
  };

  state.trades.push(trade);
  state.totalProfit += pnl;
  if (trade.won) state.wins++;
  else if (pnl < 0) state.losses++;

  if (state.trades.length > 1000) {
    state.trades = state.trades.slice(-1000);
  }

  aiMemory.learnPattern((marketSnapshot?.closes || []).slice(-10), 'BUY', pnl);
  return trade;
}

async function getRealModeReadiness() {
  if (!binanceAPI || !state.binanceConnected) {
    return { ok: false, reason: 'Binance não conectada.' };
  }

  const marketSnapshots = await fetchTrackedMarketSnapshots();
  Object.entries(marketSnapshots).forEach(([assetKey, marketSnapshot]) => {
    setRuntimeMarketForAsset(assetKey, marketSnapshot);
  });
  syncLegacyRuntimeState();

  const account = await binanceAPI.getAccountInfo();
  const portfolioSnapshot = buildTrackedPortfolioSnapshot(account, marketSnapshots);
  syncRealPortfolioState(portfolioSnapshot);
  syncDetectedPositionsFromPortfolio(portfolioSnapshot);

  const rulesByAsset = await loadTrackedSymbolRules();
  const openOrders = await syncOpenOrders();
  const liveAssets = Object.values(portfolioSnapshot.assets || {}).filter((assetSnapshot) => (
    Number(assetSnapshot.notional || 0) >= Math.max(10, Number(rulesByAsset[assetSnapshot.assetKey]?.minNotional || 0))
  ));
  const untrackedLiveAssets = liveAssets.filter((assetSnapshot) => !getPositionForAsset(assetSnapshot.assetKey));
  const minimumTradableNotional = Math.min(
    ...TRACKED_MARKET_KEYS.map((assetKey) => Math.max(10, Number(rulesByAsset[assetKey]?.minNotional || 0)))
  );
  const intendedNotional = calculateRealQuoteBudget(portfolioSnapshot.quoteFree, minimumTradableNotional);

  if (openOrders.length > 0) {
    return {
      ok: false,
      reason: 'Existem ordens abertas na Binance. Resolva/cancele antes de iniciar.',
      openOrders: openOrders.length,
      hasLivePosition: liveAssets.length > 0
    };
  }

  if (untrackedLiveAssets.length > 0) {
    return {
      ok: false,
      reason: `Existe posição real já aberta em ${untrackedLiveAssets.map((assetSnapshot) => assetSnapshot.label).join(' e ')}. O bot só inicia com a conta limpa ou com posição rastreada por ele.`,
      assets: untrackedLiveAssets
    };
  }

  if (!liveAssets.length && intendedNotional < minimumTradableNotional) {
    return {
      ok: false,
      reason: 'Saldo livre insuficiente para abrir posição com segurança.',
      quoteFree: portfolioSnapshot.quoteFree,
      minNotional: minimumTradableNotional,
      intendedNotional
    };
  }

  if (!liveAssets.length) {
    const quoteDigits = BINANCE_QUOTE_ASSET === 'BRL' ? 2 : 6;
    const testQuoteOrderQty = Number(intendedNotional.toFixed(quoteDigits));

    try {
      await binanceAPI.testMarketBuyOrder(testQuoteOrderQty.toFixed(quoteDigits), PRIMARY_TRACKED_MARKET.symbol);
    } catch (error) {
      return {
        ok: false,
        reason: 'Binance conectou para leitura, mas recusou o teste de ordem. Verifique permissao Spot Trading e whitelist de IP da chave API.',
        error: 'Binance conectou para leitura, mas recusou o teste de ordem. Verifique permissao Spot Trading e whitelist de IP da chave API.',
        details: binanceAPI.normalizeError(error)
      };
    }
  }

  return {
    ok: true,
    quoteFree: portfolioSnapshot.quoteFree,
    intendedNotional,
    hasLivePosition: liveAssets.length > 0,
    minNotional: minimumTradableNotional,
    currentPrices: Object.fromEntries(Object.entries(marketSnapshots).map(([assetKey, snapshot]) => [assetKey, snapshot.currentPrice])),
    liveAssets: liveAssets.map((assetSnapshot) => assetSnapshot.assetKey)
  };
}

async function openRealPosition(marketConfig, signal, marketSnapshot, portfolioSnapshot) {
  const rules = await binanceAPI.getSymbolRules(marketConfig.symbol);
  const minNotional = Math.max(10, rules.minNotional || 0);
  const quoteBudget = calculateRealQuoteBudget(portfolioSnapshot.quoteFree, minNotional);

  if (quoteBudget < minNotional) {
    state.status = `Saldo livre insuficiente para ${marketConfig.label}`;
    return { ok: false, error: 'Saldo livre insuficiente para abrir posição.' };
  }

  const quoteDigits = BINANCE_QUOTE_ASSET === 'BRL' ? 2 : 6;
  const quoteOrderQty = Number(quoteBudget.toFixed(quoteDigits));
  const clientOrderId = `${REAL_ORDER_PREFIX}-${marketConfig.key}-${Date.now()}-buy`;
  const order = await binanceAPI.placeMarketBuy(quoteOrderQty.toFixed(quoteDigits), clientOrderId, marketConfig.symbol);
  const confirmed = await confirmFilledOrder(order, marketSnapshot.currentPrice, marketConfig.symbol);

  if (!confirmed.filled) {
    setPendingOrders([getPendingOrderView(confirmed.order || order, marketConfig)]);
    state.status = `⏳ ${marketConfig.label} compra pendente`;
    return { ok: false, error: 'Ordem de compra ainda não foi totalmente executada.' };
  }

  const entryPrice = confirmed.avgPrice || marketSnapshot.currentPrice;
  setPositionForAsset(marketConfig.key, {
    assetKey: marketConfig.key,
    symbol: marketConfig.symbol,
    label: marketConfig.label,
    baseAsset: marketConfig.baseAsset,
    mode: 'real',
    side: 'LONG',
    quantity: confirmed.executedQty,
    entryPrice,
    quoteSpent: confirmed.quoteQuantity,
    highestPrice: entryPrice,
    stopPrice: entryPrice * (1 - CONFIG.stopLoss),
    takeProfitPrice: entryPrice * (1 + CONFIG.takeProfit),
    openedAt: new Date().toISOString(),
    confidence: signal.confidence,
    source: 'bot',
    entryOrderId: confirmed.order?.orderId,
    clientOrderId
  }, marketConfig.key);
  state.cooldowns[marketConfig.key] = Date.now() + REAL_COOLDOWN_MS;
  state.openOrders = Array.isArray(state.openOrders) ? state.openOrders.filter((orderItem) => orderItem.assetKey !== marketConfig.key) : [];
  setPendingOrders(state.openOrders);
  state.status = `📈 ${marketConfig.label} LONG aberta`;
  state.binanceLastError = '';

  aiCompliance.recordTransaction({
    type: 'BUY',
    amount: confirmed.quoteQuantity,
    currency: BINANCE_QUOTE_ASSET,
    price: entryPrice,
    userId: 'ia-trader-bot'
  });
  aiSecurity.logSecurityEvent('REAL_ORDER_FILLED', 'trading-bot', {
    symbol: marketConfig.symbol,
    side: 'BUY',
    price: entryPrice.toFixed(2),
    quantity: confirmed.executedQty.toFixed(8),
    quote: confirmed.quoteQuantity.toFixed(2),
    confidence: signal.confidence.toFixed(2)
  });

  return { ok: true };
}

async function closeRealPosition(marketConfig, position, reason, marketSnapshot, signal, portfolioSnapshot) {
  if (!position) {
    return { ok: false, error: 'Sem posição aberta.' };
  }

  const rules = await binanceAPI.getSymbolRules(marketConfig.symbol);
  const assetSnapshot = portfolioSnapshot.assets?.[marketConfig.key] || {};
  const availableBaseQty = Math.min(Number(assetSnapshot.baseFree || 0), Number(position.quantity || 0));
  const sellableQty = roundDownToStep(availableBaseQty, rules.stepSize);
  const minNotional = Math.max(10, rules.minNotional || 0);
  const quoteDigits = BINANCE_QUOTE_ASSET === 'BRL' ? 2 : 6;
  const sellableQtyFormatted = formatStepValue(sellableQty, rules.stepSize);
  const sellableNotional = sellableQty * marketSnapshot.currentPrice;
  const quoteFallbackNotional = Number((availableBaseQty * marketSnapshot.currentPrice * (1 - REAL_MARKET_SELL_QUOTE_BUFFER)).toFixed(quoteDigits));

  let order;

  if (sellableQty >= rules.minQty && sellableNotional >= minNotional) {
    const clientOrderId = `${REAL_ORDER_PREFIX}-${marketConfig.key}-${Date.now()}-sell`;
    order = await binanceAPI.placeMarketSell(sellableQtyFormatted, clientOrderId, marketConfig.symbol);
  } else if (quoteFallbackNotional >= minNotional) {
    const clientOrderId = `${REAL_ORDER_PREFIX}-${marketConfig.key}-${Date.now()}-sellq`;
    order = await binanceAPI.placeMarketSellByQuote(quoteFallbackNotional.toFixed(quoteDigits), clientOrderId, marketConfig.symbol);
  } else {
    state.status = `Posição sem saldo executável em ${marketConfig.label}`;
    state.binanceLastError = `Saldo insuficiente no ativo base para encerrar a posição em ${marketConfig.label}.`;
    return { ok: false, error: state.binanceLastError };
  }
  const confirmed = await confirmFilledOrder(order, marketSnapshot.currentPrice, marketConfig.symbol);

  if (!confirmed.filled) {
    setPendingOrders([getPendingOrderView(confirmed.order || order, marketConfig)]);
    state.status = `⏳ ${marketConfig.label} venda pendente`;
    return { ok: false, error: 'Ordem de venda ainda não foi totalmente executada.' };
  }

  const exitPrice = confirmed.avgPrice || marketSnapshot.currentPrice;
  const closedQuantity = Math.min(Number(confirmed.executedQty || 0), Number(position.quantity || 0));
  const originalQuantity = Math.max(Number(position.quantity || 0), 0.00000001);
  const closedRatio = Math.max(0, Math.min(1, closedQuantity / originalQuantity));
  const realizedCostBasis = (position.quoteSpent || (position.quantity * position.entryPrice)) * closedRatio;
  const pnl = confirmed.quoteQuantity - realizedCostBasis;
  const positionSnapshot = {
    ...position,
    quantity: closedQuantity,
    quoteSpent: realizedCostBasis
  };
  const trade = registerRealTrade({
    market: marketConfig,
    position: positionSnapshot,
    exitPrice,
    pnl,
    confidence: signal?.confidence || positionSnapshot.confidence || 0,
    reason,
    marketSnapshot
  });

  aiCompliance.recordTransaction({
    type: 'SELL',
    amount: confirmed.quoteQuantity,
    currency: BINANCE_QUOTE_ASSET,
    price: exitPrice,
    userId: 'ia-trader-bot'
  });
  aiSecurity.logSecurityEvent('REAL_POSITION_CLOSED', 'trading-bot', {
    symbol: marketConfig.symbol,
    reason,
    pnl: pnl.toFixed(2),
    exitPrice: exitPrice.toFixed(2),
    quantity: confirmed.executedQty.toFixed(8)
  });

  setPositionForAsset(marketConfig.key, null, marketConfig.key);
  state.openOrders = Array.isArray(state.openOrders) ? state.openOrders.filter((orderItem) => orderItem.assetKey !== marketConfig.key) : [];
  setPendingOrders(state.openOrders);
  state.cooldowns[marketConfig.key] = Date.now() + REAL_COOLDOWN_MS;
  state.status = `✅ ${marketConfig.label} encerrada (${reason})`;
  state.binanceLastError = '';

  return { ok: true, trade };
}

async function processRealTick() {
  if (!binanceAPI || !state.binanceConnected) {
    throw new Error('Binance não conectada para operar no modo real.');
  }

  const marketSnapshots = await fetchTrackedMarketSnapshots();
  Object.entries(marketSnapshots).forEach(([assetKey, marketSnapshot]) => {
    setRuntimeMarketForAsset(assetKey, marketSnapshot);
  });

  const account = await binanceAPI.getAccountInfo();
  let portfolioSnapshot = buildTrackedPortfolioSnapshot(account, marketSnapshots);
  syncRealPortfolioState(portfolioSnapshot);
  syncDetectedPositionsFromPortfolio(portfolioSnapshot);

  const rulesByAsset = await loadTrackedSymbolRules();
  const untrackedLiveAssets = Object.values(portfolioSnapshot.assets || {}).filter((assetSnapshot) => (
    Number(assetSnapshot.notional || 0) >= Math.max(10, Number(rulesByAsset[assetSnapshot.assetKey]?.minNotional || 0)) &&
    !getPositionForAsset(assetSnapshot.assetKey)
  ));

  if (untrackedLiveAssets.length > 0) {
    state.status = '⛔ Posição externa detectada';
    state.binanceLastError = `Existe posição real não rastreada em ${untrackedLiveAssets.map((assetSnapshot) => assetSnapshot.label).join(' e ')}. Pare o bot e reconcilie a posição antes de continuar.`;
    return;
  }

  const openOrders = await syncOpenOrders();
  if (openOrders.length > 0) {
    state.status = '⏳ Aguardando ordens abertas';
    state.binanceLastError = 'Ordens abertas detectadas na Binance. Robô em espera até limpar a fila.';
    return;
  }

  state.binanceLastError = '';

  const actions = [];
  const now = Date.now();

  for (const marketConfig of Object.values(TRACKED_MARKETS)) {
    const marketSnapshot = marketSnapshots[marketConfig.key];
    if (!marketSnapshot) {
      continue;
    }

    const position = getPositionForAsset(marketConfig.key);
    if (position) {
      updateLongPositionProtection(position, marketSnapshot.currentPrice);
      setPositionForAsset(marketConfig.key, position, marketConfig.key);
    }

    const signal = buildRealSignal(marketSnapshot, position);
    setLastSignalForAsset(marketConfig.key, signal);

    if (now < Number(state.cooldowns?.[marketConfig.key] || 0)) {
      continue;
    }

    if (position) {
      if (signal.action === 'SELL' && signal.confidence >= CONFIG.minConfidence) {
        const result = await closeRealPosition(marketConfig, position, signal.reason, marketSnapshot, signal, portfolioSnapshot);
        if (!result.ok && state.pendingOrder) {
          return;
        }
        if (result.ok) {
          actions.push(`${marketConfig.baseAsset} fechado`);
          portfolioSnapshot = buildTrackedPortfolioSnapshot(await binanceAPI.getAccountInfo(), marketSnapshots);
          syncRealPortfolioState(portfolioSnapshot);
          syncDetectedPositionsFromPortfolio(portfolioSnapshot);
        }
      }
      continue;
    }

    if (signal.action === 'BUY' && signal.confidence >= CONFIG.minConfidence) {
      const result = await openRealPosition(marketConfig, signal, marketSnapshot, portfolioSnapshot);
      if (!result.ok && state.pendingOrder) {
        return;
      }
      if (result.ok) {
        actions.push(`${marketConfig.baseAsset} aberto`);
        portfolioSnapshot = buildTrackedPortfolioSnapshot(await binanceAPI.getAccountInfo(), marketSnapshots);
        syncRealPortfolioState(portfolioSnapshot);
        syncDetectedPositionsFromPortfolio(portfolioSnapshot);
      }
    }
  }

  syncLegacyRuntimeState();
  const openPositionCount = getOpenPositions().length;

  if (actions.length > 0) {
    state.status = actions.join(' • ');
  } else if (openPositionCount > 0) {
    state.status = `📈 ${openPositionCount} posição${openPositionCount > 1 ? 'es' : ''} aberta${openPositionCount > 1 ? 's' : ''} protegida${openPositionCount > 1 ? 's' : ''}`;
  } else {
    state.status = '👀 Monitorando BTC e ETH';
  }
}

let iaInterval = null;

async function validateRealModeStart() {
  if (state.mode !== 'real') {
    return { ok: true };
  }

  try {
    return await getRealModeReadiness();
  } catch (error) {
    return {
      ok: false,
      error: binanceAPI ? binanceAPI.normalizeError(error) : (error.message || 'Falha ao validar modo real.')
    };
  }
}

async function adoptExistingRealPosition(requestedAssetKey = null) {
  if (state.mode !== 'real') {
    return { ok: false, error: 'Troque para modo real antes de adotar uma posicao.' };
  }

  if (state.running) {
    return { ok: false, error: 'Pare a IA antes de adotar uma posicao existente.' };
  }

  if (!binanceAPI || !state.binanceConnected) {
    return { ok: false, error: 'Binance nao conectada.' };
  }

  const marketSnapshots = await fetchTrackedMarketSnapshots();
  Object.entries(marketSnapshots).forEach(([assetKey, marketSnapshot]) => {
    setRuntimeMarketForAsset(assetKey, marketSnapshot);
  });

  const account = await binanceAPI.getAccountInfo();
  const portfolioSnapshot = buildTrackedPortfolioSnapshot(account, marketSnapshots);
  syncRealPortfolioState(portfolioSnapshot);

  const rulesByAsset = await loadTrackedSymbolRules();
  const openOrders = await syncOpenOrders();

  if (openOrders.length > 0) {
    return { ok: false, error: 'Existem ordens abertas na Binance. Cancele antes de adotar a posicao.' };
  }

  const requestedKeys = requestedAssetKey && TRACKED_MARKETS[requestedAssetKey]
    ? [requestedAssetKey]
    : TRACKED_MARKET_KEYS;
  const adoptedPositions = [];

  for (const assetKey of requestedKeys) {
    const marketConfig = TRACKED_MARKETS[assetKey];
    const assetSnapshot = portfolioSnapshot.assets?.[assetKey];
    const minNotional = Math.max(10, Number(rulesByAsset[assetKey]?.minNotional || 0));

    if (!assetSnapshot || Number(assetSnapshot.notional || 0) < minNotional) {
      continue;
    }

    const nowIso = new Date().toISOString();
    const quoteSpent = Number(assetSnapshot.notional || 0);
    setPositionForAsset(assetKey, {
      assetKey,
      symbol: marketConfig.symbol,
      label: marketConfig.label,
      baseAsset: marketConfig.baseAsset,
      mode: 'real',
      side: 'LONG',
      quantity: assetSnapshot.baseTotal,
      entryPrice: assetSnapshot.currentPrice,
      quoteSpent,
      highestPrice: assetSnapshot.currentPrice,
      stopPrice: assetSnapshot.currentPrice * (1 - CONFIG.stopLoss),
      takeProfitPrice: assetSnapshot.currentPrice * (1 + CONFIG.takeProfit),
      openedAt: nowIso,
      confidence: 1,
      source: 'adopted',
      entryOrderId: null,
      clientOrderId: `adopted-${assetKey}-${Date.now()}`
    }, assetKey);

    state.cooldowns[assetKey] = Date.now() + REAL_COOLDOWN_MS;

    aiSecurity.logSecurityEvent('REAL_POSITION_ADOPTED', 'trading-bot', {
      symbol: marketConfig.symbol,
      quantity: assetSnapshot.baseTotal.toFixed(8),
      priceReference: assetSnapshot.currentPrice.toFixed(2),
      quoteReference: quoteSpent.toFixed(2)
    });

    adoptedPositions.push({
      assetKey,
      symbol: marketConfig.symbol,
      quantity: assetSnapshot.baseTotal,
      entryPrice: assetSnapshot.currentPrice,
      quoteReference: quoteSpent
    });
  }

  if (!adoptedPositions.length) {
    return { ok: false, error: 'Nenhuma posicao real relevante para adotar neste momento.' };
  }

  syncLegacyRuntimeState(requestedKeys[0] || PRIMARY_MARKET_KEY);
  state.binanceLastError = '';
  state.status = adoptedPositions.length > 1
    ? '⏸ Posicoes reais adotadas e prontas para gerenciamento'
    : '⏸ Posicao real adotada e pronta para gerenciamento';

  broadcastUpdate();

  return {
    ok: true,
    message: adoptedPositions.length > 1
      ? 'Posicoes existentes adotadas com sucesso. Agora o bot consegue gerenciar stop/take de BTC e ETH.'
      : 'Posicao existente adotada com sucesso. Agora o bot consegue gerenciar stop/take dessa posicao.',
    positions: adoptedPositions
  };
}

function getTickIntervalMs() {
  return state.mode === 'real' ? REAL_TICK_INTERVAL_MS : 5000;
}

function updateRuntimeMetrics() {
  state.lastUpdate = Date.now();
  state.uptime = state.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000))
    : 0;
}

function normalizeRuntimeError(error) {
  if (state.mode === 'real' && binanceAPI) {
    return binanceAPI.normalizeError(error);
  }

  return error?.message || 'Falha no processamento do tick.';
}

function clearPositionsForMode(mode) {
  for (const assetKey of TRACKED_MARKET_KEYS) {
    if (state.positions?.[assetKey] && state.positions[assetKey].mode !== mode) {
      delete state.positions[assetKey];
    }
  }

  syncLegacyRuntimeState();
}

function getOpenPositionsByMode(mode) {
  return getOpenPositions().filter((position) => position.mode === mode);
}

function openSimulationPosition(marketConfig, signal, marketSnapshot) {
  const quoteBudget = calculateRealQuoteBudget(state.simulationQuoteFree, 10);
  if (quoteBudget < 10) {
    state.status = `Simulação sem caixa para ${marketConfig.label}`;
    return { ok: false, error: 'Saldo simulado insuficiente para abrir posição.' };
  }

  const quantity = Number((quoteBudget / marketSnapshot.currentPrice).toFixed(getAssetQuantityPrecision(marketConfig.key)));
  const quoteSpent = Number((quantity * marketSnapshot.currentPrice).toFixed(2));
  if (quantity <= 0 || quoteSpent < 10) {
    return { ok: false, error: 'Quantidade simulada insuficiente.' };
  }

  state.simulationQuoteFree = Number((state.simulationQuoteFree - quoteSpent).toFixed(2));
  setPositionForAsset(marketConfig.key, {
    assetKey: marketConfig.key,
    symbol: marketConfig.symbol,
    label: marketConfig.label,
    baseAsset: marketConfig.baseAsset,
    mode: 'simulation',
    side: 'LONG',
    quantity,
    entryPrice: marketSnapshot.currentPrice,
    quoteSpent,
    highestPrice: marketSnapshot.currentPrice,
    stopPrice: Number((marketSnapshot.currentPrice * (1 - CONFIG.stopLoss)).toFixed(2)),
    takeProfitPrice: Number((marketSnapshot.currentPrice * (1 + CONFIG.takeProfit)).toFixed(2)),
    openedAt: new Date().toISOString(),
    confidence: signal.confidence,
    source: 'bot'
  }, marketConfig.key);
  state.cooldowns[marketConfig.key] = Date.now() + REAL_COOLDOWN_MS;
  updateSimulationEquity();

  aiCompliance.recordTransaction({
    type: 'BUY',
    amount: quoteSpent,
    currency: BINANCE_QUOTE_ASSET,
    price: marketSnapshot.currentPrice,
    userId: 'ia-trader-simulation'
  });
  aiSecurity.logSecurityEvent('SIMULATION_POSITION_OPENED', 'trading-bot', {
    symbol: marketConfig.symbol,
    price: marketSnapshot.currentPrice.toFixed(2),
    quantity: quantity.toFixed(8),
    quote: quoteSpent.toFixed(2),
    confidence: signal.confidence.toFixed(2)
  });

  return { ok: true };
}

function closeSimulationPosition(marketConfig, position, reason, marketSnapshot, signal) {
  const exitValue = Number((Number(position.quantity || 0) * Number(marketSnapshot.currentPrice || 0)).toFixed(2));
  const pnl = exitValue - Number(position.quoteSpent || 0);
  const trade = {
    id: state.trades.length + 1,
    timestamp: new Date().toISOString(),
    assetKey: marketConfig.key,
    symbol: marketConfig.symbol,
    label: marketConfig.label,
    baseAsset: marketConfig.baseAsset,
    side: 'BUY',
    price: position.entryPrice,
    exitPrice: marketSnapshot.currentPrice,
    size: position.quoteSpent,
    quantity: position.quantity,
    pnl,
    won: pnl > 0,
    confidence: signal?.confidence || position.confidence || 0,
    reason,
    mode: 'simulation'
  };

  state.trades.push(trade);
  state.totalProfit += pnl;
  if (trade.won) state.wins += 1;
  else if (pnl < 0) state.losses += 1;

  if (state.trades.length > 1000) {
    state.trades = state.trades.slice(-1000);
  }

  aiMemory.learnPattern((marketSnapshot?.closes || []).slice(-10), 'BUY', pnl);
  aiCompliance.recordTransaction({
    type: 'SELL',
    amount: exitValue,
    currency: BINANCE_QUOTE_ASSET,
    price: marketSnapshot.currentPrice,
    userId: 'ia-trader-simulation'
  });
  aiSecurity.logSecurityEvent('SIMULATION_POSITION_CLOSED', 'trading-bot', {
    symbol: marketConfig.symbol,
    reason,
    pnl: pnl.toFixed(2),
    exitPrice: marketSnapshot.currentPrice.toFixed(2),
    quantity: Number(position.quantity || 0).toFixed(8)
  });

  state.simulationQuoteFree = Number((state.simulationQuoteFree + exitValue).toFixed(2));
  setPositionForAsset(marketConfig.key, null, marketConfig.key);
  state.cooldowns[marketConfig.key] = Date.now() + REAL_COOLDOWN_MS;
  updateSimulationEquity();
  return { ok: true, trade };
}

async function processSimulationTick() {
  const marketSnapshots = await fetchTrackedMarketSnapshots();
  Object.entries(marketSnapshots).forEach(([assetKey, marketSnapshot]) => {
    setRuntimeMarketForAsset(assetKey, marketSnapshot);
  });

  const actions = [];
  const now = Date.now();

  for (const marketConfig of Object.values(TRACKED_MARKETS)) {
    const marketSnapshot = marketSnapshots[marketConfig.key];
    if (!marketSnapshot) {
      continue;
    }

    const position = getPositionForAsset(marketConfig.key);
    if (position && position.mode === 'simulation') {
      updateLongPositionProtection(position, marketSnapshot.currentPrice);
      setPositionForAsset(marketConfig.key, position, marketConfig.key);
    }

    const signal = buildRealSignal(marketSnapshot, position && position.mode === 'simulation' ? position : null);
    setLastSignalForAsset(marketConfig.key, signal);

    if (now < Number(state.cooldowns?.[marketConfig.key] || 0)) {
      continue;
    }

    if (position && position.mode === 'simulation') {
      if (signal.action === 'SELL' && signal.confidence >= CONFIG.minConfidence) {
        const result = closeSimulationPosition(marketConfig, position, signal.reason, marketSnapshot, signal);
        if (result.ok) {
          actions.push(`${marketConfig.baseAsset} fechado`);
        }
      }
      continue;
    }

    if (signal.action === 'BUY' && signal.confidence >= CONFIG.minConfidence) {
      const result = openSimulationPosition(marketConfig, signal, marketSnapshot);
      if (result.ok) {
        actions.push(`${marketConfig.baseAsset} aberto`);
      }
    }
  }

  state.realBalance = 0;
  state.realBalanceAsset = BINANCE_QUOTE_ASSET;
  state.binanceConnected = false;
  state.binanceStatus = 'Simulação local';
  state.binanceLastError = '';
  updateSimulationEquity();
  syncLegacyRuntimeState();

  const openSimulationPositions = getOpenPositionsByMode('simulation').length;
  if (actions.length > 0) {
    state.status = actions.join(' • ');
  } else if (openSimulationPositions > 0) {
    state.status = `📈 ${openSimulationPositions} posição${openSimulationPositions > 1 ? 'es' : ''} simulada${openSimulationPositions > 1 ? 's' : ''} em monitoramento`;
  } else {
    state.status = '👀 Simulação monitorando BTC e ETH';
  }
}

async function runIATick() {
  if (state.mode === 'real') {
    await processRealTick();
  } else {
    await processSimulationTick();
  }

  updateRuntimeMetrics();
  broadcastUpdate();
}

function handleRuntimeFailure(error) {
  const message = normalizeRuntimeError(error);
  state.status = state.mode === 'real' ? 'Erro no modo real' : 'Erro no modo simulado';
  if (state.mode === 'real') {
    state.binanceLastError = message;
  }
  updateRuntimeMetrics();
  broadcastUpdate();
  console.error('Erro no tick da IA:', message);
  return message;
}

function setMode(mode) {
  if (!['simulation', 'real'].includes(mode)) {
    return { ok: false, error: 'Modo inválido' };
  }

  if (state.running) {
    return { ok: false, error: 'Pare a IA antes de trocar o modo.' };
  }

  if (mode === 'simulation' && (getOpenPositionsByMode('real').length > 0 || state.openOrders.length > 0)) {
    return { ok: false, error: 'Existe posição ou ordem real ativa. Resolva isso antes de voltar para simulação.' };
  }

  state.mode = mode;
  clearPositionsForMode(mode);
  if (mode === 'simulation') {
    state.binanceConnected = false;
    state.binanceStatus = 'Simulação local';
    state.binanceLastError = '';
    state.realBalance = 0;
    state.realBalanceAsset = BINANCE_QUOTE_ASSET;
    if (!Number.isFinite(Number(state.simulationQuoteFree))) {
      state.simulationQuoteFree = CONFIG.initialBalance;
    }
    updateSimulationEquity();
  }
  if (!state.running) {
    state.status = 'Parado';
  }
  syncLegacyRuntimeState();
  broadcastUpdate();
  return { ok: true, mode };
}

function sendWsPayload(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error('Erro ao enviar resposta WS:', error.message);
  }
}

async function startIA() {
  if (state.running) return { ok: true, alreadyRunning: true };

  const readiness = await validateRealModeStart();
  if (!readiness?.ok) {
    state.running = false;
    state.status = state.mode === 'real' ? 'Real bloqueado' : 'Parado';
    state.binanceLastError = readiness.error || readiness.reason || 'Falha ao validar a partida.';
    console.error(`⛔ ${state.binanceLastError}`);
    broadcastUpdate();
    return { ok: false, error: state.binanceLastError, details: readiness };
  }

  state.running = true;
  state.status = state.mode === 'real' ? '▶ IA real operando' : '▶ IA operando';
  state.startedAt = new Date().toISOString();
  if (state.mode === 'real') {
    state.binanceLastError = '';
  }

  console.log('🚀 IA iniciada em modo:', state.mode);

  try {
    await runIATick();
  } catch (error) {
    state.running = false;
    state.startedAt = null;
    state.uptime = 0;
    const message = handleRuntimeFailure(error);
    return { ok: false, error: message };
  }

  iaInterval = setInterval(() => {
    if (!state.running) {
      clearInterval(iaInterval);
      iaInterval = null;
      return;
    }

    runIATick().catch(handleRuntimeFailure);
  }, getTickIntervalMs());

  return { ok: true };
}

function stopIA() {
  if (!state.running) return { ok: true, alreadyStopped: true };
  state.running = false;
  state.status = getOpenPositions().length > 0 ? '⏸ IA parada com posição aberta' : 'Parado';
  if (iaInterval) {
    clearInterval(iaInterval);
    iaInterval = null;
  }
  state.startedAt = null;
  state.uptime = 0;
  state.lastUpdate = Date.now();
  console.log('⏹️ IA parada');
  broadcastUpdate();
  return { ok: true };
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
  const clientState = buildClientState();
  const message = JSON.stringify({
    type: 'UPDATE',
    data: clientState
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
    const clientState = buildClientState();
    ws.send(JSON.stringify({
      type: 'INIT',
      data: clientState
    }));
  } catch (e) {
    console.error('Erro ao enviar INIT:', e.message);
  }

  ws.on('message', async (message) => {
    try {
      const cmd = JSON.parse(message);
      
      if (cmd.type === 'START') {
        const result = await startIA();
        sendWsPayload(ws, { type: 'START_RESULT', ...result });
      } else if (cmd.type === 'STOP') {
        const result = stopIA();
        sendWsPayload(ws, { type: 'STOP_RESULT', ...result });
      } else if (cmd.type === 'SET_MODE') {
        const result = setMode(cmd.mode);
        sendWsPayload(ws, { type: 'MODE_RESULT', ...result });
      } else if (cmd.type === 'CONNECT_BINANCE') {
        testBinanceCredentials(cmd.apiKey, cmd.apiSecret).then((snapshot) => {
          console.log('🧪 Credenciais Binance validadas sem alterar a sessão ativa');
          sendWsPayload(ws, {
            type: 'BINANCE_CONNECTED',
            balance: snapshot.balance,
            asset: snapshot.asset,
            preview: true
          });
        }).catch((error) => {
          const message = new BinanceAPI('', '').normalizeError(error);
          console.error('Erro ao conectar Binance:', error.message);
          sendWsPayload(ws, { type: 'BINANCE_ERROR', error: message, preview: true });
        });
      } else if (cmd.type === 'GET_BALANCE') {
        if (binanceAPI) {
          binanceAPI.getBalanceSnapshot().then((snapshot) => {
            state.realBalance = snapshot.balance;
            state.realBalanceAsset = snapshot.asset;
            state.binanceConnected = true;
            state.binanceStatus = 'Conectada';
            state.binanceLastError = '';
            broadcastUpdate();
          }).catch((error) => {
            state.realBalance = 0;
            state.binanceConnected = false;
            state.binanceStatus = 'Desconectada';
            state.binanceLastError = binanceAPI.normalizeError(error);
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

// 📱 Dashboard mobile
app.get('/mobile', (req, res) => {
  res.sendFile(__dirname + '/mobile.html');
});

// 🔄 Verificar atualização disponível (git fetch + log)
app.get('/api/update/check', (req, res) => {
  const { exec } = require('child_process');
  const currentVersion = APP_REMOTE_VERSION;

  exec('git fetch origin && git log HEAD..origin/main --oneline -5 2>&1', { cwd: __dirname, timeout: 15000 }, (err, stdout, stderr) => {
    const output = (stdout || stderr || '').trim();
    const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
    const isGitRepo = !output.includes('fatal') && !output.includes('not a git');
    const hasUpdate = lines.length > 0 && isGitRepo;
    const changeLines = isGitRepo
      ? lines
          .map(line => line.replace(/^[0-9a-f]{7,40}\s+/i, '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    exec('git log -1 --format="%H %s" 2>&1', { cwd: __dirname, timeout: 5000 }, (e2, headOut) => {
      exec('git log origin/main -1 --format="%H %s" 2>&1', { cwd: __dirname, timeout: 5000 }, (e3, remoteOut) => {
        const remoteCommit = (remoteOut || '').trim().slice(0, 60);

        res.json({
          ok: true,
          current: currentVersion,
          latest: hasUpdate ? (remoteCommit.split(' ')[0] || 'nova versão').slice(0, 8) : currentVersion,
          hasUpdate: isGitRepo && hasUpdate,
          commit: (headOut || '').trim().slice(0, 8),
          remoteCommit: (remoteOut || '').trim().slice(0, 8),
          changes: output || 'Sem mudanças',
          changeLines,
          summary: hasUpdate
            ? `${changeLines.length || 1} mudança(s) pronta(s) para instalar`
            : 'Sem mudanças pendentes',
          updateTarget: 'Servidor remoto',
          checkedAt: new Date().toISOString()
        });
      });
    });
  });
});

// 🔄 Aplicar atualização (git pull + pm2 reload)
app.post('/api/update/apply', (req, res) => {
  const { exec } = require('child_process');
  const { force } = req.body || {};

  const cmd = [
    'git pull origin main',
    'npm install --production --silent',
    'pm2 reload ia-trader --update-env 2>/dev/null || true'
  ].join(' && ');

  aiSecurity.logSecurityEvent('SELF_UPDATE_TRIGGERED', 'mobile', { force: !!force });

  exec(cmd, { cwd: __dirname, timeout: 60000 }, (err, stdout, stderr) => {
    const output = (stdout || stderr || '').trim();

    if (err && !output.includes('Already up to date') && !output.includes('Reloading')) {
      console.error('[UPDATE] Erro:', err.message);
      return res.json({ ok: false, error: err.message, output });
    }

    console.log('[UPDATE] Concluído:', output.slice(0, 200));
    res.json({ ok: true, output: output.slice(0, 500), updatedAt: new Date().toISOString() });
  });
});

app.get('/api/status', (req, res) => {
  res.json(buildClientState());
});

app.get('/api/binance/open-orders', async (req, res) => {
  if (!binanceAPI || !state.binanceConnected) {
    return res.status(400).json({ ok: false, error: 'Binance não conectada' });
  }

  try {
    const orders = await binanceAPI.getOpenOrders();
    res.json({ ok: true, orders });
  } catch (error) {
    res.status(502).json({ ok: false, error: binanceAPI.normalizeError(error) });
  }
});

app.post('/api/binance/order', async (req, res) => {
  if (!binanceAPI || !state.binanceConnected) {
    return res.status(400).json({ ok: false, error: 'Binance não conectada' });
  }

  const { side, quantity, price } = req.body || {};
  if (!side || !quantity || !price) {
    return res.status(400).json({ ok: false, error: 'side, quantity e price são obrigatórios' });
  }

  try {
    const order = await binanceAPI.placeOrder(side, quantity, price);
    if (!order) {
      return res.status(502).json({ ok: false, error: 'Falha ao criar ordem' });
    }
    res.json({ ok: true, order });
  } catch (error) {
    res.status(502).json({ ok: false, error: binanceAPI.normalizeError(error) });
  }
});

app.delete('/api/binance/order', async (req, res) => {
  if (!binanceAPI || !state.binanceConnected) {
    return res.status(400).json({ ok: false, error: 'Binance não conectada' });
  }

  const { orderId } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ ok: false, error: 'orderId é obrigatório' });
  }

  try {
    const result = await binanceAPI.cancelOrder(orderId);
    if (!result) {
      return res.status(502).json({ ok: false, error: 'Falha ao cancelar ordem' });
    }
    res.json({ ok: true, result });
  } catch (error) {
    res.status(502).json({ ok: false, error: binanceAPI.normalizeError(error) });
  }
});

app.get('/api/market/:asset', async (req, res) => {
  try {
    const market = resolveTrackedMarket(req.params.asset);
    if (!market) {
      return res.status(404).json({ ok: false, error: 'Ativo de mercado nao suportado' });
    }

    const payload = await fetchPublicMarketOverview(market.symbol, {
      chartInterval: req.query.interval,
      chartLimit: req.query.limit,
      intradayLimit: 120,
      dailyLimit: 120
    });
    res.json({
      ...payload,
      key: market.key,
      label: market.label
    });
  } catch (error) {
    const message = new BinanceAPI('', '').normalizeError(error);
    res.status(502).json({ ok: false, error: message });
  }
});

app.post('/api/start', (req, res) => {
  startIA().then((result) => {
    if (!result?.ok) {
      return res.status(400).json(result);
    }

    res.json({ ok: true, message: 'IA iniciada', mode: state.mode });
  }).catch((error) => {
    res.status(500).json({ ok: false, error: error.message || 'Falha ao iniciar a IA' });
  });
});

app.post('/api/real/adopt-position', (req, res) => {
  adoptExistingRealPosition(req.body?.assetKey).then((result) => {
    if (!result?.ok) {
      return res.status(400).json(result);
    }

    res.json(result);
  }).catch((error) => {
    const message = binanceAPI ? binanceAPI.normalizeError(error) : (error.message || 'Falha ao adotar posicao real.');
    res.status(500).json({ ok: false, error: message });
  });
});

app.post('/api/stop', (req, res) => {
  const result = stopIA();
  res.json({ ...result, message: 'IA parada' });
});

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  const result = setMode(mode);
  if (!result.ok) {
    return res.status(400).json(result);
  }

  res.json(result);
});

app.post('/api/connect', (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, error: 'API Key e Secret obrigatórios' });
  }

  testBinanceCredentials(apiKey, apiSecret).then((snapshot) => {
    res.json({
      ok: true,
      balance: snapshot.balance,
      asset: snapshot.asset,
      preview: true,
      message: 'Credenciais validadas sem alterar a conexão ativa do servidor.'
    });
  }).catch((error) => {
    res.status(400).json({ ok: false, error: new BinanceAPI('', '').normalizeError(error) });
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
    appName: 'IA Trader Privado',
    environment: IS_CLOUD_RUNTIME ? 'cloud' : 'vps',
    environmentLabel: IS_CLOUD_RUNTIME ? 'Cloud' : 'VPS / PM2',
    updateTarget: 'Servidor remoto'
  });
});

app.get('/alive', (req, res) => {
  res.send('OK');
});

// ═════════════════════════════════════════════════════════
// API AVANÇADA - MEMÓRIA, SEGURANÇA E COMPLIANCE
// ═════════════════════════════════════════════════════════

// 🧠 Endpoints de Memória da IA
app.get('/api/ai-memory/stats', (req, res) => {
  // Rate limiting
  if (!aiSecurity.checkRateLimit('api-memory', 30, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  res.json({
    ok: true,
    stats: aiMemory.getStats()
  });
});

app.get('/api/ai-memory/export', (req, res) => {
  if (!aiSecurity.checkRateLimit('api-export', 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  res.json({
    ok: true,
    data: aiMemory.exportMemory()
  });
});

app.post('/api/ai-memory/reset', (req, res) => {
  const reason = req.body.reason || 'api-request';
  aiMemory.resetMemory(reason);
  syncStateMemory();
  broadcastUpdate();
  aiSecurity.logSecurityEvent('MEMORY_RESET', 'admin', { reason });
  res.json({ ok: true, message: 'Memória resetada' });
});

// 🔐 Endpoints de Segurança
app.get('/api/security/report', (req, res) => {
  if (!aiSecurity.checkRateLimit('security-report', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  res.json({
    ok: true,
    report: aiSecurity.getSecurityReport()
  });
});

app.get('/api/security/audit-trail', (req, res) => {
  if (!aiSecurity.checkRateLimit('audit-trail', 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  
  const format = req.query.format || 'json';
  const data = aiSecurity.exportAuditTrail(format);
  
  if (format === 'csv') {
    res.header('Content-Type', 'text/csv');
    res.send(data);
  } else {
    res.json({ ok: true, data });
  }
});

// ⚖️ Endpoints de Compliance
app.get('/api/compliance/report', (req, res) => {
  if (!aiSecurity.checkRateLimit('compliance-report', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  res.json({
    ok: true,
    report: aiCompliance.getComplianceReport()
  });
});

app.get('/api/compliance/transactions', (req, res) => {
  if (!aiSecurity.checkRateLimit('compliance-tx', 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'Muitas requisições' });
  }
  res.json({
    ok: true,
    transactions: aiCompliance.transactions.slice(-100)
  });
});

app.post('/api/compliance/disclosure', (req, res) => {
  const { type } = req.body;
  if (!['MONTHLY_REPORT', 'SUSPICIOUS_ACTIVITY', 'TRANSACTION_SUMMARY'].includes(type)) {
    return res.status(400).json({ ok: false, error: 'Tipo inválido' });
  }
  
  const disclosure = aiCompliance.createDisclosure(type);
  aiSecurity.logSecurityEvent('DISCLOSURE_CREATED', 'admin', { type });
  
  res.json({
    ok: true,
    disclosure
  });
});

// ═════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═════════════════════════════════════════════════════════
ensureLocalSimulationDemoData();

server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   🤖 IA TRADER BITCOIN - SERVIDOR   ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`📡 API:       http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`💡 Health:    http://localhost:${PORT}/alive\n`);
  console.log(`🟡 Binance API: ${BINANCE_BASE_URL}`);
  console.log(`Modo: ${process.env.IA_MODE || 'simulação'}`);
  console.log(`Node: ${process.version}\n`);
  
  // 🔌 Conectar Binance automaticamente
  console.log('🔄 Iniciando sistema...\n');
  setTimeout(() => {
    if (shouldSkipBinanceAutoConnect()) {
      console.log('🧪 Demo local ativa: auto-conexao Binance desativada em simulação.\n');
      state.binanceConnected = false;
      state.binanceStatus = 'Simulação local';
      state.binanceLastError = '';
      broadcastUpdate();
    } else {
      connectBinanceAuto();
      startBinanceHealthCheck(); // Verificação contínua
    }
    console.log('✅ Sistema pronto!\n');
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando gracefully...');
  stopIA();
  stopBinanceHealthCheck();
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
