#!/usr/bin/env node

/**
 * 🚀 SISTEMA DE ATUALIZAÇÃO REMOTA
 * 
 * Permite enviar atualizações de código para a IA trader
 * sem precisar parar o servidor
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = 'http://localhost:5561/api';

async function updateIA(newCode, restart = false) {
  try {
    console.log('📤 Enviando atualização...');
    
    const response = await axios.post(`${API_URL}/update-code`, {
      newCode,
      restart
    });

    if (response.data.ok) {
      console.log('✅ Atualização enviada com sucesso!');
      if (restart) {
        console.log('🔄 Servidor reiniciando...');
      }
      return true;
    } else {
      console.error('❌ Erro:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro de conexão:', error.message);
    return false;
  }
}

async function updateFromFile(filePath, restart = false) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error('❌ Arquivo não encontrado:', filePath);
      return false;
    }

    const code = fs.readFileSync(filePath, 'utf-8');
    console.log(`📂 Carregando arquivo: ${filePath}`);
    console.log(`📊 Tamanho: ${(code.length / 1024).toFixed(2)} KB`);
    
    return await updateIA(code, restart);
  } catch (error) {
    console.error('❌ Erro ao ler arquivo:', error.message);
    return false;
  }
}

// ═════════════════════════════════════════════════════════
// CLI
// ═════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🚀 ATUALIZADOR DE IA TRADER

Uso:
  node update.js <arquivo.js> [--restart]
  
Exemplos:
  node update.js indicadores.js
  node update.js estrategia.js --restart

Opções:
  --restart    Reinicia o servidor após atualização
  `);
  process.exit(0);
}

const filePath = args[0];
const restart = args.includes('--restart');

updateFromFile(filePath, restart).then(success => {
  process.exit(success ? 0 : 1);
});
