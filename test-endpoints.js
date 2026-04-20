#!/usr/bin/env node
/**
 * ⚡ QUICK START - TESTANDO NOVOS ENDPOINTS
 * Execute este script para testar os novos recursos
 */

const http = require('http');

const API_KEY = 'IA_TRADER_PRIVATE_2026';
const SERVER = 'http://localhost:5561';

function makeRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SERVER);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'X-App-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testEndpoints() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🧪 TESTE DOS NOVOS ENDPOINTS v2.0                          ║
║  Testando: Memória IA | Segurança | Compliance              ║
╚══════════════════════════════════════════════════════════════╝
`);

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n🧠 TESTANDO MEMÓRIA DA IA\n');
    
    console.log('➤ GET /api/ai-memory/stats');
    const memStats = await makeRequest('/api/ai-memory/stats');
    console.log(`Status: ${memStats.status}`);
    if (memStats.data.ok) {
      const stats = memStats.data.stats;
      console.log(`  ✓ Decisões: ${stats.totalDecisions}`);
      console.log(`  ✓ Taxa Sucesso: ${stats.successRate}`);
      console.log(`  ✓ Padrões: ${stats.patternsLearned}`);
      console.log(`  ✓ Fase: ${stats.learningPhase}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n🔐 TESTANDO SEGURANÇA\n');

    console.log('➤ GET /api/security/report');
    const secReport = await makeRequest('/api/security/report');
    console.log(`Status: ${secReport.status}`);
    if (secReport.data.ok) {
      const report = secReport.data.report;
      console.log(`  ✓ Status Geral: ${report.status}`);
      console.log(`  ✓ Total Logs: ${report.totalAuditLogs}`);
      console.log(`  ✓ Eventos 24h: ${report.eventsLast24h}`);
      console.log(`  ✓ Alta Severidade: ${report.highSeverityEvents}`);
      console.log(`  ✓ Atividades Suspeitas: ${report.suspiciousActivitiesDetected}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n⚖️ TESTANDO COMPLIANCE\n');

    console.log('➤ GET /api/compliance/report');
    const compReport = await makeRequest('/api/compliance/report');
    console.log(`Status: ${compReport.status}`);
    if (compReport.data.ok) {
      const report = compReport.data.report;
      console.log(`  ✓ Status: ${report.overallStatus}`);
      console.log(`  ✓ Transações Total: ${report.transactionStats.total}`);
      console.log(`  ✓ Compliant: ${report.transactionStats.compliant}`);
      console.log(`  ✓ Sinalizadas: ${report.transactionStats.flagged}`);
      console.log(`  ✓ Próxima Auditoria: ${report.nextAuditDate.split('T')[0]}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n📋 SAMPLE RESPONSES\n');

    console.log('AI Memory Stats:');
    console.log(JSON.stringify(memStats.data, null, 2).split('\n').slice(0, 8).join('\n'));
    
    console.log('\nSecurity Report:');
    console.log(JSON.stringify(secReport.data, null, 2).split('\n').slice(0, 8).join('\n'));
    
    console.log('\nCompliance Report:');
    console.log(JSON.stringify(compReport.data, null, 2).split('\n').slice(0, 8).join('\n'));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`
\n✅ TESTES COMPLETADOS COM SUCESSO!\n

📊 RESUMO:
  • Memória da IA: ${memStats.status === 200 ? '✅' : '❌'}
  • Segurança: ${secReport.status === 200 ? '✅' : '❌'}
  • Compliance: ${compReport.status === 200 ? '✅' : '❌'}

🚀 PRÓXIMOS PASSOS:
  1. Abra o dashboard em http://localhost:5561/dashboard
  2. Veja a nova seção "⚖️ CONFORMIDADE & SEGURANÇA"
  3. Teste os endpoints com curl/-Xvindo.

�ドキュ DOCUMENTAÇÃO:
  • ATUALIZACOES_v2.0.md - Resumo completo
  • MONITORING_GUIDE.js - Guia detalhado
  • modules/ai-*.js - Código implementação

═══════════════════════════════════════════════════════════════
`);

  } catch (e) {
    console.error('❌ Erro ao testar endpoints:', e.message);
    console.log('\n⚠️ Certifique-se que o servidor está rodando:');
    console.log('   npm run desktop:start');
  }
}

testEndpoints();
