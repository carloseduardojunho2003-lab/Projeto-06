/**
 * 🧠 SISTEMA INTELIGENTE DE MEMÓRIA DA IA
 * Persistência de aprendizado, padrões e histórico de decisões
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODERN_MEMORY_PREFIX = 'v2';

function deriveLegacyOpenSslKeyAndIv(password, keyLength, ivLength) {
  const passwordBuffer = Buffer.from(String(password || ''), 'utf8');
  const totalLength = keyLength + ivLength;
  const buffers = [];
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);

  while (derived.length < totalLength) {
    const hash = crypto.createHash('md5');
    hash.update(block);
    hash.update(passwordBuffer);
    block = hash.digest();
    buffers.push(block);
    derived = Buffer.concat(buffers);
  }

  return {
    key: derived.subarray(0, keyLength),
    iv: derived.subarray(keyLength, keyLength + ivLength)
  };
}

class AIMemory {
  constructor() {
    this.memoryDir = path.join(__dirname, '../.ai-memory');
    this.ensureMemoryDir();
    this.memory = this.createDefaultMemory();
    this.lastPersistedAt = 0;

    this.loadMemory();
  }

  createDefaultMemory() {
    return {
      patterns: {},        // Padrões de mercado aprendidos
      strategies: {},      // Estratégias bem-sucedidas
      mistakes: [],        // Erros para não repetir
      successRate: 0.5,
      totalDecisions: 0,
      correctDecisions: 0,
      learningPhase: 'initialization',
      lastLearningUpdate: Date.now(),
      confidence: { buy: 0.5, sell: 0.5, hold: 0.5 },
      marketMemory: [],    // Últimas 1000 decisões do mercado
      profitPatterns: {},  // Padrões que geram lucro
      lossPatterns: {},    // Padrões que geram prejuízo
      recentOutcomes: [],
      currentStreak: 0,
      currentStreakType: 'flat',
      longestWinStreak: 0,
      longestLossStreak: 0,
      adaptationScore: 50,
      continuousCycles: 0,
      continuousLearning: true,
      bestPatternKey: '',
      bestPatternWinRate: 0,
      regimeMemory: {
        bullish: 0,
        bearish: 0,
        neutral: 0
      },
      regimePerformance: {
        bullish: { seen: 0, wins: 0, totalProfit: 0, avgProfit: 0 },
        bearish: { seen: 0, wins: 0, totalProfit: 0, avgProfit: 0 },
        neutral: { seen: 0, wins: 0, totalProfit: 0, avgProfit: 0 }
      },
      memoryVersion: 2,
      lastPruneAt: 0,
      lastDecision: null
    };
  }

  mergeWithDefaults(loaded) {
    const defaults = this.createDefaultMemory();
    return {
      ...defaults,
      ...loaded,
      confidence: {
        ...defaults.confidence,
        ...(loaded?.confidence || {})
      },
      regimeMemory: {
        ...defaults.regimeMemory,
        ...(loaded?.regimeMemory || {})
      },
      regimePerformance: {
        ...defaults.regimePerformance,
        bullish: {
          ...defaults.regimePerformance.bullish,
          ...(loaded?.regimePerformance?.bullish || {})
        },
        bearish: {
          ...defaults.regimePerformance.bearish,
          ...(loaded?.regimePerformance?.bearish || {})
        },
        neutral: {
          ...defaults.regimePerformance.neutral,
          ...(loaded?.regimePerformance?.neutral || {})
        }
      }
    };
  }

  ensureMemoryDir() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  getMemoryPath(name = 'ai-brain.enc') {
    return path.join(this.memoryDir, name);
  }

  getSecret() {
    return process.env.PRIVATE_APP_KEY || 'IA_TRADER_PRIVATE_2026';
  }

  // Encriptação moderna da memória com IV e salt aleatórios.
  encrypt(data) {
    const secret = this.getSecret();
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(secret, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    return `${MODERN_MEMORY_PREFIX}:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decryptModern(encrypted) {
    try {
      const [, saltHex, ivHex, payloadHex] = String(encrypted || '').split(':');
      if (!saltHex || !ivHex || !payloadHex) {
        return null;
      }

      const secret = this.getSecret();
      const salt = Buffer.from(saltHex, 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(secret, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadHex, 'hex')),
        decipher.final()
      ]).toString('utf8');

      return JSON.parse(decrypted);
    } catch (e) {
      return null;
    }
  }

  decryptLegacy(encrypted) {
    try {
      const { key, iv } = deriveLegacyOpenSslKeyAndIv(this.getSecret(), 32, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(String(encrypted || ''), 'hex')),
        decipher.final()
      ]).toString('utf8');

      return JSON.parse(decrypted);
    } catch (e) {
      return null;
    }
  }

  decrypt(encrypted) {
    const raw = String(encrypted || '').trim();
    if (!raw) {
      return null;
    }

    if (raw.startsWith(`${MODERN_MEMORY_PREFIX}:`)) {
      return this.decryptModern(raw);
    }

    return this.decryptLegacy(raw);
  }

  loadMemory() {
    try {
      const memPath = this.getMemoryPath();
      if (fs.existsSync(memPath)) {
        const encrypted = fs.readFileSync(memPath, 'utf8');
        const usingLegacyFormat = !String(encrypted || '').trim().startsWith(`${MODERN_MEMORY_PREFIX}:`);
        const loaded = this.decrypt(encrypted);
        if (loaded) {
          this.memory = this.mergeWithDefaults(loaded);
          console.log('✅ Memória da IA carregada com sucesso');
          console.log(`📊 Histórico: ${this.memory.totalDecisions} decisões, Acurácia: ${(this.memory.successRate * 100).toFixed(2)}%`);
          if (usingLegacyFormat) {
            this.saveMemory();
            console.log('🔐 Memória migrada para criptografia atual');
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Criando nova memória da IA');
    }
  }

  saveMemory() {
    try {
      const encrypted = this.encrypt(this.memory);
      fs.writeFileSync(this.getMemoryPath(), encrypted, 'utf8');
      this.lastPersistedAt = Date.now();
    } catch (e) {
      console.error('❌ Erro ao salvar memória:', e.message);
    }
  }

  // Aprender de um padrão de preço
  learnPattern(priceFeed, decision, result) {
    const normalizedFeed = Array.isArray(priceFeed) && priceFeed.length
      ? priceFeed
      : [0, 0, 0, 0, 0];
    const patternKey = this.hashPattern(normalizedFeed.slice(0, 5));
    const regime = this.detectRegime(normalizedFeed);

    if (!this.memory.patterns[patternKey]) {
      this.memory.patterns[patternKey] = {
        seen: 0,
        wins: 0,
        losses: 0,
        avgProfit: 0,
        totalProfit: 0,
        lastSeen: Date.now(),
        confidence: 0.5,
        recentResults: []
      };
    }

    const pattern = this.memory.patterns[patternKey];
    pattern.seen++;
    pattern.totalProfit += result;
    pattern.avgProfit = pattern.totalProfit / Math.max(pattern.seen, 1);
    pattern.lastSeen = Date.now();
    pattern.lastDecision = String(decision || 'hold').toLowerCase();
    pattern.lastRegime = regime;
    this.memory.totalDecisions++;
    this.memory.continuousCycles++;

    if (result > 0) {
      pattern.wins++;
      this.memory.correctDecisions++;

      // Guardar padrão bem-sucedido
      const profitKey = `${decision}_${patternKey}`;
      if (!this.memory.profitPatterns[profitKey]) {
        this.memory.profitPatterns[profitKey] = { count: 0, totalProfit: 0 };
      }
      this.memory.profitPatterns[profitKey].count++;
      this.memory.profitPatterns[profitKey].totalProfit += result;
    } else if (result < 0) {
      pattern.losses++;
      
      // Guardar padrão de prejuízo para evitar
      const lossKey = `${decision}_${patternKey}`;
      if (!this.memory.lossPatterns[lossKey]) {
        this.memory.lossPatterns[lossKey] = { count: 0, totalLoss: 0 };
      }
      this.memory.lossPatterns[lossKey].count++;
      this.memory.lossPatterns[lossKey].totalLoss += Math.abs(result);
      this.registerMistake(patternKey, decision, regime, result);
    }

    pattern.recentResults.push(result);
    if (pattern.recentResults.length > 20) {
      pattern.recentResults = pattern.recentResults.slice(-20);
    }

    const patternWinRate = pattern.wins / Math.max(pattern.seen, 1);
    pattern.confidence = Number((pattern.confidence * 0.65 + patternWinRate * 0.35).toFixed(4));

    // Adicionar ao histórico de mercado
    this.memory.marketMemory.push({
      timestamp: Date.now(),
      pattern: patternKey,
      decision,
      result,
      prices: normalizedFeed.slice(-3),
      phase: this.memory.learningPhase
    });

    // Limitar histórico a 1000 entradas
    if (this.memory.marketMemory.length > 1000) {
      this.memory.marketMemory = this.memory.marketMemory.slice(-1000);
    }

    this.memory.recentOutcomes.push({
      timestamp: Date.now(),
      pattern: patternKey,
      decision,
      result
    });
    if (this.memory.recentOutcomes.length > 200) {
      this.memory.recentOutcomes = this.memory.recentOutcomes.slice(-200);
    }

    // Atualizar taxa de sucesso
    this.memory.successRate = this.memory.correctDecisions / Math.max(this.memory.totalDecisions, 1);

    this.updateDecisionConfidence(decision, result);
    this.updateStrategyMemory(decision, regime, result);
    this.updateStreak(result);
    this.updateRegimeMemory(normalizedFeed);
    this.updateRegimePerformance(regime, result);
    this.updateBestPattern(patternKey, patternWinRate);
    this.updateAdaptationScore();
    this.memory.lastDecision = {
      decision,
      result,
      pattern: patternKey,
      regime,
      timestamp: Date.now()
    };

    // Atualizar fase de aprendizado
    this.updateLearningPhase();

    if (this.memory.totalDecisions % 75 === 0 || Object.keys(this.memory.patterns).length > 650) {
      this.pruneWeakPatterns();
    }

    // Persistir continuamente sem esperar demais.
    if (this.memory.totalDecisions % 10 === 0 || (Date.now() - this.lastPersistedAt) > 120000) {
      this.saveMemory();
    }
  }

  hashPattern(prices) {
    const str = prices.map(p => Math.round(p / 100)).join(',');
    return crypto.createHash('sha1').update(str).digest('hex').slice(0, 8);
  }

  clampConfidence(value) {
    return Math.min(0.97, Math.max(0.05, Number(value || 0)));
  }

  getRegimeLabel(regime) {
    const labels = {
      bullish: 'Alta',
      bearish: 'Baixa',
      neutral: 'Lateral'
    };
    return labels[regime] || 'Lateral';
  }

  detectRegime(priceFeed) {
    if (!Array.isArray(priceFeed) || priceFeed.length < 2) {
      return 'neutral';
    }

    const first = Number(priceFeed[0] || 0);
    const last = Number(priceFeed[priceFeed.length - 1] || 0);
    const threshold = Math.max(Math.abs(first) * 0.002, 1);
    const delta = last - first;

    if (delta > threshold) return 'bullish';
    if (delta < -threshold) return 'bearish';
    return 'neutral';
  }

  updateLearningPhase() {
    if (this.memory.totalDecisions < 75) {
      this.memory.learningPhase = 'initialization';
    } else if (this.memory.totalDecisions < 300) {
      this.memory.learningPhase = 'calibration';
    } else if (this.memory.totalDecisions < 800) {
      this.memory.learningPhase = 'adaptive';
    } else {
      this.memory.learningPhase = 'continuous';
    }
    this.memory.lastLearningUpdate = Date.now();
  }

  updateDecisionConfidence(decision, result) {
    const confidenceKey = String(decision || '').toLowerCase();
    if (!(confidenceKey in this.memory.confidence)) {
      return;
    }

    const target = result > 0 ? 0.72 : result < 0 ? 0.28 : 0.5;
    this.memory.confidence[confidenceKey] = Number(
      (this.memory.confidence[confidenceKey] * 0.8 + target * 0.2).toFixed(4)
    );
  }

  updateStreak(result) {
    if (result > 0) {
      this.memory.currentStreak = this.memory.currentStreakType === 'win'
        ? this.memory.currentStreak + 1
        : 1;
      this.memory.currentStreakType = 'win';
      this.memory.longestWinStreak = Math.max(this.memory.longestWinStreak, this.memory.currentStreak);
      return;
    }

    if (result < 0) {
      this.memory.currentStreak = this.memory.currentStreakType === 'loss'
        ? this.memory.currentStreak + 1
        : 1;
      this.memory.currentStreakType = 'loss';
      this.memory.longestLossStreak = Math.max(this.memory.longestLossStreak, this.memory.currentStreak);
      return;
    }

    this.memory.currentStreak = 0;
    this.memory.currentStreakType = 'flat';
  }

  updateRegimeMemory(priceFeed) {
    const regime = this.detectRegime(priceFeed);
    this.memory.regimeMemory[regime] = (this.memory.regimeMemory[regime] || 0) + 1;
  }

  updateStrategyMemory(decision, regime, result) {
    const decisionKey = String(decision || 'hold').toLowerCase();
    const strategyKey = `${decisionKey}_${regime}`;

    if (!this.memory.strategies[strategyKey]) {
      this.memory.strategies[strategyKey] = {
        seen: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        avgProfit: 0,
        confidence: 0.5,
        lastSeen: Date.now()
      };
    }

    const strategy = this.memory.strategies[strategyKey];
    strategy.seen += 1;
    strategy.totalProfit += Number(result || 0);
    strategy.avgProfit = strategy.totalProfit / Math.max(strategy.seen, 1);
    strategy.lastSeen = Date.now();

    if (result > 0) {
      strategy.wins += 1;
    } else if (result < 0) {
      strategy.losses += 1;
    }

    const strategyWinRate = strategy.wins / Math.max(strategy.seen, 1);
    strategy.confidence = Number((strategy.confidence * 0.65 + strategyWinRate * 0.35).toFixed(4));
  }

  updateRegimePerformance(regime, result) {
    const bucket = this.memory.regimePerformance?.[regime];
    if (!bucket) {
      return;
    }

    bucket.seen += 1;
    bucket.totalProfit += Number(result || 0);
    bucket.avgProfit = bucket.totalProfit / Math.max(bucket.seen, 1);

    if (result > 0) {
      bucket.wins += 1;
    }
  }

  registerMistake(patternKey, decision, regime, result) {
    this.memory.mistakes.unshift({
      timestamp: Date.now(),
      pattern: patternKey,
      decision: String(decision || 'hold').toLowerCase(),
      regime,
      loss: Math.abs(Number(result || 0))
    });

    if (this.memory.mistakes.length > 60) {
      this.memory.mistakes = this.memory.mistakes.slice(0, 60);
    }
  }

  pruneWeakPatterns() {
    const entries = Object.entries(this.memory.patterns || {});
    if (!entries.length) {
      this.memory.lastPruneAt = Date.now();
      return;
    }

    const now = Date.now();
    const cutoffMs = 1000 * 60 * 60 * 24 * 45;
    const maxPatterns = 650;
    const removable = entries
      .map(([key, pattern]) => ({ key, pattern }))
      .filter(({ pattern }) => {
        const ageMs = now - Number(pattern.lastSeen || 0);
        return ageMs > cutoffMs
          && Number(pattern.seen || 0) <= 4
          && Number(pattern.avgProfit || 0) <= 0
          && Number(pattern.confidence || 0.5) < 0.45;
      })
      .sort((a, b) => Number(a.pattern.lastSeen || 0) - Number(b.pattern.lastSeen || 0));

    const overflow = Math.max(0, entries.length - maxPatterns);
    const removeCount = Math.max(overflow, Math.min(removable.length, Math.ceil(removable.length * 0.35)));

    removable.slice(0, removeCount).forEach(({ key }) => {
      delete this.memory.patterns[key];
      Object.keys(this.memory.profitPatterns || {}).forEach((profitKey) => {
        if (profitKey.endsWith(`_${key}`)) delete this.memory.profitPatterns[profitKey];
      });
      Object.keys(this.memory.lossPatterns || {}).forEach((lossKey) => {
        if (lossKey.endsWith(`_${key}`)) delete this.memory.lossPatterns[lossKey];
      });
    });

    this.memory.lastPruneAt = now;
  }

  updateBestPattern(patternKey, winRate) {
    if (!patternKey) {
      return;
    }

    if (winRate >= this.memory.bestPatternWinRate) {
      this.memory.bestPatternKey = patternKey;
      this.memory.bestPatternWinRate = winRate;
    }
  }

  updateAdaptationScore() {
    const recent = this.memory.recentOutcomes.slice(-40);
    if (!recent.length) {
      this.memory.adaptationScore = 50;
      return;
    }

    const wins = recent.filter(item => item.result > 0).length;
    const positiveRate = wins / recent.length;
    this.memory.adaptationScore = Math.round(Math.max(0, Math.min(100, 25 + positiveRate * 75)));
  }

  getRecentWinRate() {
    const recent = this.memory.recentOutcomes.slice(-25);
    if (!recent.length) {
      return 0.5;
    }

    const wins = recent.filter(item => item.result > 0).length;
    return wins / recent.length;
  }

  getBestPattern() {
    if (!this.memory.bestPatternKey) {
      return null;
    }

    const pattern = this.memory.patterns[this.memory.bestPatternKey];
    if (!pattern) {
      return null;
    }

    return {
      key: this.memory.bestPatternKey,
      seen: pattern.seen,
      winRate: `${(this.memory.bestPatternWinRate * 100).toFixed(1)}%`,
      avgProfit: pattern.avgProfit.toFixed(2)
    };
  }

  // Prever confiança para próxima decisão
  predictConfidence(priceFeed, decision) {
    const normalizedFeed = Array.isArray(priceFeed) && priceFeed.length
      ? priceFeed
      : [0, 0, 0, 0, 0];
    const patternKey = this.hashPattern(normalizedFeed.slice(0, 5));
    const pattern = this.memory.patterns[patternKey];
    const confidenceKey = String(decision || '').toLowerCase();
    const fallback = this.memory.confidence[confidenceKey] ?? 0.5;
    const regime = this.detectRegime(normalizedFeed);
    const strategy = this.memory.strategies?.[`${confidenceKey}_${regime}`];
    const strategyConfidence = strategy?.confidence ?? fallback;
    const regimePerformance = this.memory.regimePerformance?.[regime];
    const regimeWinRate = regimePerformance?.seen
      ? regimePerformance.wins / Math.max(regimePerformance.seen, 1)
      : 0.5;
    const lowConfidencePenalty = fallback < 0.42 ? (0.42 - fallback) * 0.25 : 0;

    if (!pattern || pattern.seen < 3) {
      return this.clampConfidence(
        fallback * 0.55
        + strategyConfidence * 0.25
        + regimeWinRate * 0.2
        - lowConfidencePenalty
      );
    }

    const winRate = pattern.wins / pattern.seen;
    const recent = Array.isArray(pattern.recentResults) ? pattern.recentResults : [];
    const recentWinRate = recent.length
      ? recent.filter(item => item > 0).length / recent.length
      : winRate;
    const freshness = Math.max(0.35, 1 - ((Date.now() - Number(pattern.lastSeen || Date.now())) / (1000 * 60 * 60 * 24 * 60)));
    const profitBias = Number(pattern.avgProfit || 0) > 0
      ? Math.min(Number(pattern.avgProfit || 0) / 250, 0.12)
      : Math.max(Number(pattern.avgProfit || 0) / 400, -0.12);

    const confidence = (
      fallback * 0.18
      + winRate * 0.24
      + recentWinRate * 0.18
      + strategyConfidence * 0.16
      + regimeWinRate * 0.1
      + Number(pattern.confidence || 0.5) * 0.14
    ) * (0.78 + freshness * 0.22) + profitBias - lowConfidencePenalty;

    return this.clampConfidence(confidence);
  }

  getBestStrategy() {
    const entries = Object.entries(this.memory.strategies || {})
      .map(([key, strategy]) => ({ key, ...strategy }))
      .filter((strategy) => Number(strategy.seen || 0) >= 3)
      .sort((a, b) => {
        const aScore = (a.wins / Math.max(a.seen, 1)) * 0.7 + Math.max(0, a.avgProfit) * 0.003;
        const bScore = (b.wins / Math.max(b.seen, 1)) * 0.7 + Math.max(0, b.avgProfit) * 0.003;
        return bScore - aScore;
      });

    if (!entries.length) {
      return null;
    }

    const top = entries[0];
    const [decision, regime] = top.key.split('_');
    return {
      key: top.key,
      decision,
      regime,
      label: `${decision.toUpperCase()} em ${this.getRegimeLabel(regime)}`,
      seen: top.seen,
      winRate: `${((top.wins / Math.max(top.seen, 1)) * 100).toFixed(1)}%`,
      avgProfit: top.avgProfit.toFixed(2)
    };
  }

  getWeakestDecision() {
    const entries = Object.entries(this.memory.confidence || {});
    if (!entries.length) {
      return null;
    }

    const [decision, confidence] = entries.sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))[0];
    return {
      decision,
      label: decision.toUpperCase(),
      confidence: Number(confidence || 0)
    };
  }

  getDominantRegime() {
    const entries = Object.entries(this.memory.regimeMemory || {});
    const total = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
    if (!total) {
      return null;
    }

    const [key, count] = entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
    return {
      key,
      label: this.getRegimeLabel(key),
      count: Number(count || 0),
      share: Math.round((Number(count || 0) / total) * 100)
    };
  }

  buildMemoryHealth() {
    const recentWinRate = this.getRecentWinRate();
    const adaptation = Number(this.memory.adaptationScore || 50) / 100;
    const coverage = Math.min(1, Object.keys(this.memory.patterns || {}).length / 120);
    const freshness = Math.max(0, 1 - ((Date.now() - Number(this.memory.lastLearningUpdate || 0)) / (1000 * 60 * 60 * 24 * 3)));
    const score = Math.round((recentWinRate * 0.38 + adaptation * 0.28 + coverage * 0.18 + freshness * 0.16) * 100);

    let label = 'Fraca';
    let tone = 'negative';
    if (score >= 75) {
      label = 'Alta';
      tone = 'positive';
    } else if (score >= 60) {
      label = 'Boa';
      tone = 'positive';
    } else if (score >= 45) {
      label = 'Estável';
      tone = 'neutral';
    }

    return { score, label, tone };
  }

  getLastMistake() {
    const mistake = this.memory.mistakes?.[0];
    if (!mistake) {
      return null;
    }

    return {
      ...mistake,
      label: `${String(mistake.decision || 'hold').toUpperCase()} em ${this.getRegimeLabel(mistake.regime)}`
    };
  }

  // Revisar padrões perigosos (que causam perdas)
  getWarningPatterns() {
    const warnings = [];
    
    Object.entries(this.memory.lossPatterns).forEach(([key, data]) => {
      const lossRate = data.totalLoss / Math.max(data.count, 1);
      if (lossRate > 100 && data.count > 5) { // Perdas acima de 100 por operação
        warnings.push({
          pattern: key,
          lossCount: data.count,
          avgLoss: lossRate.toFixed(2)
        });
      }
    });

    return warnings.slice(0, 5); // Top 5 padrões perigosos
  }

  // Obter estatísticas
  getStats() {
    return {
      totalDecisions: this.memory.totalDecisions,
      successRate: (this.memory.successRate * 100).toFixed(2) + '%',
      recentWinRate: (this.getRecentWinRate() * 100).toFixed(2) + '%',
      learningPhase: this.memory.learningPhase,
      patternsLearned: Object.keys(this.memory.patterns).length,
      profitablePatterns: Object.keys(this.memory.profitPatterns).length,
      dangerousPatterns: Object.keys(this.memory.lossPatterns).length,
      warningPatterns: this.getWarningPatterns(),
      avgProfit: this.calculateAvgProfit().toFixed(2),
      currentStreak: this.memory.currentStreak,
      currentStreakType: this.memory.currentStreakType,
      longestWinStreak: this.memory.longestWinStreak,
      longestLossStreak: this.memory.longestLossStreak,
      adaptationScore: this.memory.adaptationScore,
      continuousCycles: this.memory.continuousCycles,
      continuousLearning: this.memory.continuousLearning,
      bestPattern: this.getBestPattern(),
      bestStrategy: this.getBestStrategy(),
      weakestDecision: this.getWeakestDecision(),
      dominantRegime: this.getDominantRegime(),
      memoryHealth: this.buildMemoryHealth(),
      lastMistake: this.getLastMistake(),
      strategiesTracked: Object.keys(this.memory.strategies || {}).length,
      decisionConfidence: this.memory.confidence,
      freshnessHours: Number(((Date.now() - Number(this.memory.lastLearningUpdate || Date.now())) / (1000 * 60 * 60)).toFixed(1)),
      lastLearningUpdate: this.memory.lastLearningUpdate,
      regimeMemory: this.memory.regimeMemory
    };
  }

  calculateAvgProfit() {
    const patterns = Object.values(this.memory.patterns);
    if (patterns.length === 0) return 0;
    const totalProfit = patterns.reduce((sum, p) => sum + p.avgProfit, 0);
    return totalProfit / patterns.length;
  }

  // Reset seguro da memória
  resetMemory(reason = 'manual') {
    this.memory = this.createDefaultMemory();
    console.log(`🔄 Memória resetada (razão: ${reason})`);
    this.saveMemory();
  }

  exportMemory() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      memory: this.memory
    };
  }
}

module.exports = new AIMemory();
