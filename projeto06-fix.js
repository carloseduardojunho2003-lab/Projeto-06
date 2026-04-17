// Patch para corrigir btnStart - cole isso no console do browser

// Remover onclick antigo
document.getElementById('btnStart').onclick = null;

// Adicionar novo
document.getElementById('btnStart').textContent = '🚀 TESTE 24H';
document.getElementById('btnStart').onclick = startTest24h;

console.log('✅ Botão TESTE 24H ativado!');
