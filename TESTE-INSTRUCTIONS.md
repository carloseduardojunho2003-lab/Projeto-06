# ⚠️ INSTRUÇÕES PARA ATIVAR O TESTE

A página está carregando mas o botão precisa ser ativado manualmente.

## Opção 1: Via Console (Rápido)

1. Abra o DevTools: **F12**
2. Vá para aba **Console**
3. Cole este código:

```javascript
// Reset do botão
document.getElementById('btnStart').textContent = '🚀 TESTE 24H';
document.getElementById('btnStart').onclick = startTest24h;
console.log('✅ Botão TESTE 24H ativado!');
```

4. Pressione **Enter**
5. Clique no botão "🚀 TESTE 24H" 

## Opção 2: Abra a página com query string

Na barra de endereço, mude para:
```
http://127.0.0.1:5560/Projeto%2006/projeto06.html?test=auto
```

## Opção 3: Espere o Teste Automático

Se tudo carregou certo, o teste deveria iniciar sozinho em 2 segundos.

---

**Status esperado:**
- Log: "[⏳] Carregando dados de Bitcoin..."
- Log: "[✅] Bitcoin carregado! Pronto para teste."
- Botão muda para "🚀 TESTE 24H"
- Status fica "Parado" (até você clicar)
