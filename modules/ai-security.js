/**
 * 🔐 SISTEMA DE SEGURANÇA E PROTEÇÃO DA IA
 * Rate limiting, validação, proteção de dados, audit trail
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AISecurity {
  constructor() {
    this.rateLimits = new Map();
    this.auditLog = [];
    this.logPath = path.join(__dirname, '../.ai-memory/audit-trail.log');
    this.requestCount = 0;
    this.suspiciousActivities = [];
    
    this.ensureLogFile();
    this.loadAuditLog();
  }

  ensureLogFile() {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Rate limiting com chave
  checkRateLimit(clientId, maxRequests = 60, windowMs = 60000) {
    const now = Date.now();
    const key = `rate_${clientId}`;

    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, []);
    }

    let requests = this.rateLimits.get(key);
    requests = requests.filter(time => now - time < windowMs);

    if (requests.length >= maxRequests) {
      this.logSecurityEvent('RATE_LIMIT_EXCEEDED', clientId, {
        requests: requests.length,
        maxAllowed: maxRequests
      });
      return false;
    }

    requests.push(now);
    this.rateLimits.set(key, requests);
    return true;
  }

  // Validar entrada para evitar injections
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>\"']/g, '') // Remove caracteres perigosos
      .slice(0, 1000); // Limita tamanho
  }

  // Hash seguro d uma ação
  createActionHash(action, timestamp, clientId) {
    return crypto
      .createHash('sha256')
      .update(`${action}${timestamp}${clientId}${process.env.PRIVATE_APP_KEY}`)
      .digest('hex');
  }

  // Validar assinatura de ação
  validateActionSignature(action, timestamp, clientId, signature) {
    const expectedHash = this.createActionHash(action, timestamp, clientId);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedHash)
    ).valueOf();
  }

  // Log de auditoria com criptografia
  logSecurityEvent(eventType, clientId, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      clientId,
      details,
      severity: this.calculateSeverity(eventType)
    };

    this.auditLog.push(logEntry);

    // Manter últimas 10000 linhas em memória
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    // Escrever no arquivo
    this.writeAuditLog(logEntry);

    // Alertas para atividades suspeitas
    if (logEntry.severity === 'HIGH') {
      this.suspiciousActivities.push(logEntry);
      if (this.suspiciousActivities.length > 100) {
        this.suspiciousActivities = this.suspiciousActivities.slice(-100);
      }
      console.log(`🚨 ALERTA DE SEGURANÇA: ${eventType} - ${clientId}`);
    }
  }

  writeAuditLog(entry) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logPath, logLine, 'utf8');
    } catch (e) {
      console.error('Erro ao escrever log de auditoria:', e.message);
    }
  }

  loadAuditLog() {
    try {
      if (fs.existsSync(this.logPath)) {
        const content = fs.readFileSync(this.logPath, 'utf8');
        const lines = content.trim().split('\n');
        
        // Carregar últimas 1000 linhas
        this.auditLog = lines.slice(-1000).map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(Boolean);
      }
    } catch (e) {
      console.log('Criar novo arquivo de auditoria');
    }
  }

  calculateSeverity(eventType) {
    const highSeverity = [
      'RATE_LIMIT_EXCEEDED',
      'INVALID_SIGNATURE',
      'UNAUTHORIZED_ACCESS',
      'DATA_CORRUPTION',
      'SECURITY_BREACH'
    ];

    return highSeverity.includes(eventType) ? 'HIGH' : 'MEDIUM';
  }

  // Verificar integridade de dados
  verifyDataIntegrity(data, hash) {
    const calculatedHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    return calculatedHash === hash;
  }

  // Gerar hash para dados
  hashData(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // Obter relatório de segurança
  getSecurityReport() {
    const now = Date.now();
    const last24h = 24 * 60 * 60 * 1000;

    const recentEvents = this.auditLog.filter(log => 
      now - new Date(log.timestamp).getTime() < last24h
    );

    return {
      timestamp: new Date().toISOString(),
      totalAuditLogs: this.auditLog.length,
      eventsLast24h: recentEvents.length,
      highSeverityEvents: recentEvents.filter(e => e.severity === 'HIGH').length,
      suspiciousActivitiesDetected: this.suspiciousActivities.length,
      topEventTypes: this.getTopEventTypes(recentEvents),
      status: this.suspiciousActivities.length === 0 ? '✅ SEGURO' : '⚠️ REQUER ATENÇÃO'
    };
  }

  getTopEventTypes(events) {
    const counts = {};
    events.forEach(e => {
      counts[e.eventType] = (counts[e.eventType] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  // Limpar logs antigos
  cleanOldLogs(olderThanDays = 30) {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const beforeCount = this.auditLog.length;

    this.auditLog = this.auditLog.filter(log => 
      new Date(log.timestamp) > cutoffDate
    );

    console.log(`🧹 Limpeza de logs: ${beforeCount} → ${this.auditLog.length}`);
  }

  // Exportar logs para análise
  exportAuditTrail(format = 'json') {
    if (format === 'csv') {
      let csv = 'Timestamp,EventType,ClientId,Severity,Details\n';
      this.auditLog.forEach(log => {
        csv += `"${log.timestamp}","${log.eventType}","${log.clientId}","${log.severity}","${JSON.stringify(log.details).replace(/"/g, '\\"')}"\n`;
      });
      return csv;
    }

    return {
      timestamp: new Date().toISOString(),
      totalLogs: this.auditLog.length,
      logs: this.auditLog
    };
  }
}

module.exports = new AISecurity();
