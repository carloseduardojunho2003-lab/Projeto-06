# 🤖 IA TRADER - DASHBOARD COMPLETO

Aplicativo profissional para monitorar e controlar sua IA trader 24/7 com acesso à carteira Binance.

## 🚀 Features

✅ **Dashboard em Tempo Real**
- Monitoramento ao vivo da IA
- Estatísticas (Vitórias, Derrotas, Taxa de Acerto)
- Saldo Demo e Saldo Real
- Log de operações em tempo real

✅ **Controle Remoto**
- Iniciar/Parar a IA
- Alternar entre Simulação e Modo Real
- Conectar à Binance com API Key
- Atualizar código remotamente

✅ **Integração Binance**
- Conexão segura via API Key
- Acesso à carteira em tempo real
- Execução de operações
- Saldo de BRL

✅ **WebSocket em Tempo Real**
- Atualizações ao vivo
- Latência mínima
- Múltiplos dashboards simultâneos

## 📋 Requisitos

- Node.js 14+
- npm ou yarn
- Conta Binance com API habilitada

## ⚙️ Instalação

### 1. Instalar Dependências

```bash
cd c:\Users\carlo\Projetos\Projeto 06
npm install
```

### 2. Configurar Variáveis de Ambiente

Edite `.env`:

```env
BINANCE_API_KEY=sua_api_key_aqui
BINANCE_API_SECRET=sua_api_secret_aqui
IA_MODE=simulation
```

### 3. Iniciar o Servidor

```bash
npm start
```

Você verá:

```
⚡ IA TRADER SERVER RODANDO!

📡 API: http://localhost:5561
🔌 WebSocket: ws://localhost:5562

🎮 Conecte o dashboard em http://localhost:5561/dashboard
```

### 4. Abrir o Dashboard

Acesse no navegador:

```
http://localhost:5561/dashboard
```

## 🎮 Como Usar

### Iniciar a IA

1. Clique em **▶ Iniciar**
2. Escolha o modo:
   - **🎮 Simulação**: Testa com R$10.000 fictícios
   - **💰 Real**: Usa sua carteira Binance realmente

### Conectar à Binance

1. Coloque sua **API Key** Binance
2. Coloque seu **API Secret**
3. Clique em **Conectar**
4. Clique em **Buscar Saldo** para verificar seu saldo real

### Monitorar Operações

- **Log em Tempo Real**: Vê cada operação conforme acontece
- **Estatísticas**: Taxa de acerto, ganhos/perdas
- **Saldo Demo**: Mostra o saldo da simulação
- **Saldo Real**: Mostra seu saldo Binance

## 🔐 Segurança

⚠️ **IMPORTANTE**:

1. Nunca compartilhe sua API Key ou Secret
2. Use IP restrito na Binance
3. Ative 2FA na Binance
4. Crie uma API Key com permissões mínimas (apenas trading)
5. Teste em modo Simulação primeiro

### Criar API Key na Binance

1. Acesse https://www.binance.com/
2. Nome de Usuário → API Management
3. Criar Nova Chave
4. Ativar Restrições:
   - ✅ Trade
   - ❌ Withdraw
   - IP Restrito (seu IP apenas)

## 📊 Endpoints da API

```
GET  /api/status          - Status atual da IA
POST /api/start           - Iniciar IA
POST /api/stop            - Parar IA
POST /api/mode            - Alterar modo (simulation/real)
POST /api/connect         - Conectar Binance
GET  /api/trades          - Histórico de trades
POST /api/update-code     - Atualizar código
```

## 🔌 WebSocket Events

```javascript
// Conectar
ws = new WebSocket('ws://localhost:5562');

// Recebe atualizações
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'UPDATE') {
    console.log(msg.data); // Estado atual
  }
};

// Enviar comandos
ws.send(JSON.stringify({
  type: 'START'  // ou STOP, SET_MODE, etc
}));
```

## 🛠️ Estrutura de Arquivos

```
Projeto 06/
├── server.js          # Servidor Node + WebSocket
├── dashboard.html     # Dashboard UI
├── package.json       # Dependências
├── .env              # Configurações
└── README.md         # Este arquivo
```

## 📈 Métricas Rastreadas

- ✅ **Vitórias**: Trades com lucro
- ❌ **Derrotas**: Trades com prejuízo
- 📊 **Taxa de Acerto**: % de trades vencedores
- 💰 **Saldo**: Capital atual (demo e real)
- 💵 **PnL**: Lucro/Prejuízo de cada trade
- ⏱️ **Uptime**: Tempo que a IA está operando

## 🐛 Troubleshooting

### Dashboard não conecta

```bash
# Verificar se o servidor está rodando
netstat -ano | findstr :5561
netstat -ano | findstr :5562

# Reiniciar
npm start
```

### Error: Cannot find module

```bash
# Reinstalar dependências
rm -r node_modules package-lock.json
npm install
```

### Binance não conecta

1. Verifique API Key e Secret no `.env`
2. Verifique se IP está autorizado
3. Verifique permissões da API Key
4. Tente conectar via API REST:

```bash
curl -X GET "https://api.binance.com/api/v3/account" \
  -H "X-MBX-APIKEY: sua_key"
```

## 🚀 Próximas Funcionalidades

- [ ] Histórico de trades com gráficos
- [ ] Alertas via Telegram/Discord
- [ ] Backtesting avançado
- [ ] Estratégias customizáveis
- [ ] Persistência em banco de dados
- [ ] Mobile app
- [ ] Sistema de permissões/usuários

## 📞 Suporte

Para problemas ou dúvidas:

1. Verifique o console (F12)
2. Verifique os logs do servidor
3. Tente modo Simulação primeiro
4. Reinicie o servidor

## 📜 Licença

MIT - Uso livre para fins pessoais e comerciais.

---

**⚡ Desenvolvido com ❤️ para traders autônomos**
