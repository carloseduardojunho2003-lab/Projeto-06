/**
 * ⚖️ SISTEMA DE CONFORMIDADE LEGAL E COMPLIANCE
 * Rastreamento de transações, reportes, disclosures e regulamentações
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AICompliance {
  constructor() {
    this.complianceDir = path.join(__dirname, '../.ai-memory/compliance');
    this.ensureComplianceDir();
    
    this.transactions = [];
    this.disclosures = [];
    this.riskAssessments = [];
    this.regulations = {
      'CVM': 'Comissão de Valores Mobiliários',
      'BCE': 'Banco Central do Brasil',
      'COAF': 'Conselho de Controle de Atividades Financeiras',
      'FATF': 'Financial Action Task Force (AML/CFT)'
    };

    this.complianceStatus = {
      amlChecks: true,
      kycCompliance: true,
      transactionLimits: true,
      regulatoryReporting: true,
      riskManagement: true
    };

    this.loadComplianceData();
  }

  ensureComplianceDir() {
    if (!fs.existsSync(this.complianceDir)) {
      fs.mkdirSync(this.complianceDir, { recursive: true });
    }
  }

  // Registrar transação com compliance
  recordTransaction(txData) {
    const transaction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: txData.type, // 'BUY' | 'SELL' | 'TRANSFER'
      amount: txData.amount,
      currency: txData.currency || 'BRL',
      price: txData.price,
      status: 'COMPLETED',
      complianceChecks: {
        amlPassed: this.checkAML(txData),
        kycVerified: this.checkKYC(txData),
        limitsRespected: this.checkTransactionLimits(txData),
        sanctions: this.checkSanctionsList(txData)
      },
      riskProfile: this.assessRisk(txData),
      regulatoryNotes: []
    };

    // Adicionar notas se necessário
    if (!transaction.complianceChecks.amlPassed) {
      transaction.regulatoryNotes.push('⚠️ Verificação AML necessária');
    }
    if (transaction.riskProfile === 'HIGH') {
      transaction.regulatoryNotes.push('⚠️ Risco elevado - Requer aprovação manual');
    }

    this.transactions.push(transaction);
    this.saveComplianceData();

    return transaction;
  }

  // Anti-Money Laundering (AML) check
  checkAML(txData) {
    // Verificar:
    // 1. Padrão de comportamento fora do normal
    // 2. Múltiplas transações pequenas (structuring)
    // 3. Origem de fundos

    const recentTxs = this.transactions.slice(-10);
    const avgAmount = recentTxs.length > 0 
      ? recentTxs.reduce((sum, tx) => sum + tx.amount, 0) / recentTxs.length
      : 0;

    // Detectar estruturação (múltiplas transações pequeninhas)
    const isStructuring = txData.amount < (avgAmount * 0.1) && 
                          recentTxs.length > 5 &&
                          recentTxs.filter(tx => tx.amount < avgAmount * 0.1).length > 3;

    return !isStructuring && txData.amount < 500000; // Limite arbitrado
  }

  // Know Your Customer (KYC) verification
  checkKYC(txData) {
    // Verificar:
    // 1. Identidade verificada
    // 2. Informações PEP (Pessoa Politicamente Exposta)
    // 3. Endereço verificado

    return Boolean(txData.userId && txData.verificatedId);
  }

  // Verificar limites de transação
  checkTransactionLimits(txData) {
    const limits = {
      'BUY': 100000,      // Limite diário de compra
      'SELL': 100000,     // Limite diário de venda
      'TRANSFER': 50000   // Limite de transferência
    };

    const dailyAmountForType = this.getDailyAmountForType(txData.type);
    const limit = limits[txData.type] || 100000;

    return (dailyAmountForType + txData.amount) <= limit;
  }

  getDailyAmountForType(type) {
    const today = new Date().toDateString();
    return this.transactions
      .filter(tx => new Date(tx.timestamp).toDateString() === today && tx.type === type)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }

  // Verificar lista de sanções
  checkSanctionsList(txData) {
    // Integração com lista OFAC/UNO, embora simplificada aqui
    const sanctionedCountries = ['IR', 'KP', 'SY', 'CU']; // Simplificado
    const country = txData.country || 'BR';

    return !sanctionedCountries.includes(country);
  }

  // Avaliação de risco
  assessRisk(txData) {
    let riskScore = 0;

    // Fator 1: Tamanho da transação
    if (txData.amount > 50000) riskScore += 30;
    if (txData.amount > 100000) riskScore += 20;

    // Fator 2: Frequência
    const recentCount = this.transactions.filter(tx =>
      new Date(tx.timestamp).getTime() > Date.now() - 3600000
    ).length;
    if (recentCount > 10) riskScore += 25;

    // Fator 3: Tipo de transação
    if (txData.type === 'TRANSFER') riskScore += 15;

    // Fator 4: Hora da transação (fora do horário comercial)
    const hour = new Date().getHours();
    if (hour < 8 || hour > 18) riskScore += 10;

    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 30) return 'MEDIUM';
    return 'LOW';
  }

  // Criar disclosure para reguladores
  createDisclosure(type) {
    const disclosure = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      type, // 'MONTHLY_REPORT' | 'SUSPICIOUS_ACTIVITY' | 'TRANSACTION_SUMMARY'
      content: this.generateDisclosureContent(type),
      status: 'DRAFT',
      signatures: {
        generated: true,
        verified: false
      }
    };

    this.disclosures.push(disclosure);
    this.saveComplianceData();
    return disclosure;
  }

  generateDisclosureContent(type) {
    const content = {
      'MONTHLY_REPORT': {
        title: 'Relatório Mensal de Conformidade',
        period: new Date().toISOString().slice(0, 7),
        totalTransactions: this.transactions.length,
        totalVolume: this.getTotalVolume(),
        complianceScore: this.getComplianceScore(),
        incidents: this.getIncidents(),
        recommendations: this.getRecommendations()
      },
      'SUSPICIOUS_ACTIVITY': {
        title: 'Relatório de Atividade Suspeita',
        timestamp: new Date().toISOString(),
        suspiciousTransactions: this.getSuspiciousTransactions(),
        riskAssessment: 'MEDIUM',
        requiredActions: [
          'Verificação KYC adicional',
          'Análise aprofundada de fonte de fundos',
          'Possível relatório a COAF'
        ]
      },
      'TRANSACTION_SUMMARY': {
        title: 'Sumário de Transações',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        transactionCount: this.transactions.length,
        byType: this.getTransactionsByType(),
        totalValue: this.getTotalVolume()
      }
    };

    return content[type] || {};
  }

  // Obter relatório de conformidade
  getComplianceReport() {
    return {
      timestamp: new Date().toISOString(),
      overallStatus: this.getOverallComplianceStatus(),
      transactionStats: {
        total: this.transactions.length,
        compliant: this.transactions.filter(tx => this.isTransactionCompliant(tx)).length,
        flagged: this.transactions.filter(tx => !this.isTransactionCompliant(tx)).length
      },
      riskProfile: {
        high: this.transactions.filter(tx => tx.riskProfile === 'HIGH').length,
        medium: this.transactions.filter(tx => tx.riskProfile === 'MEDIUM').length,
        low: this.transactions.filter(tx => tx.riskProfile === 'LOW').length
      },
      regulatoryStatus: this.complianceStatus,
      nextAuditDate: this.getNextAuditDate(),
      recommendations: this.getRecommendations()
    };
  }

  isTransactionCompliant(tx) {
    const checks = tx.complianceChecks;
    return checks.amlPassed && 
           checks.kycVerified && 
           checks.limitsRespected && 
           checks.sanctions &&
           tx.regulatoryNotes.length === 0;
  }

  getOverallComplianceStatus() {
    const compliant = this.transactions.filter(tx => this.isTransactionCompliant(tx)).length;
    const percentage = (compliant / Math.max(this.transactions.length, 1)) * 100;

    if (percentage >= 95) return '✅ COMPLIANT';
    if (percentage >= 80) return '⚠️ MOSTLY COMPLIANT';
    return '❌ REQUIRES ATTENTION';
  }

  getSuspiciousTransactions() {
    return this.transactions.filter(tx => 
      tx.riskProfile === 'HIGH' || 
      !tx.complianceChecks.amlPassed
    ).slice(-10);
  }

  getTransactionsByType() {
    const types = {};
    this.transactions.forEach(tx => {
      types[tx.type] = (types[tx.type] || 0) + 1;
    });
    return types;
  }

  getTotalVolume() {
    return this.transactions.reduce((sum, tx) => sum + tx.amount, 0);
  }

  getComplianceScore() {
    const compliant = this.transactions.filter(tx => this.isTransactionCompliant(tx)).length;
    return Math.round((compliant / Math.max(this.transactions.length, 1)) * 100);
  }

  getIncidents() {
    return this.transactions
      .filter(tx => tx.regulatoryNotes.length > 0)
      .map(tx => ({
        id: tx.id,
        timestamp: tx.timestamp,
        notes: tx.regulatoryNotes
      }))
      .slice(-5);
  }

  getRecommendations() {
    const score = this.getComplianceScore();
    const recommendations = [];

    if (score < 80) {
      recommendations.push('🔴 Melhorar processos de conformidade');
    }
    if (this.getSuspiciousTransactions().length > 5) {
      recommendations.push('🟡 Atividades suspeitas detectadas - Revisar');
    }
    if (this.transactions.length > 100) {
      recommendations.push('🟢 Realizar auditoria externa');
    }

    return recommendations;
  }

  getNextAuditDate() {
    const lastTransaction = this.transactions[this.transactions.length - 1];
    if (!lastTransaction) return 'Não há transações registradas';

    const nextAudit = new Date(lastTransaction.timestamp);
    nextAudit.setMonth(nextAudit.getMonth() + 3);
    return nextAudit.toISOString();
  }

  saveComplianceData() {
    try {
      fs.writeFileSync(
        path.join(this.complianceDir, 'transactions.json'),
        JSON.stringify(this.transactions, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(this.complianceDir, 'disclosures.json'),
        JSON.stringify(this.disclosures, null, 2),
        'utf8'
      );
    } catch (e) {
      console.error('Erro ao salvar dados de compliance:', e.message);
    }
  }

  loadComplianceData() {
    try {
      const txPath = path.join(this.complianceDir, 'transactions.json');
      if (fs.existsSync(txPath)) {
        this.transactions = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      }
    } catch (e) {
      console.log('Iniciando novo arquivo de transações');
    }
  }
}

module.exports = new AICompliance();
