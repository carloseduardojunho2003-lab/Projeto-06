# IA TRADER - GUIA COMPLETO PARA SERVIDOR ONLINE 24/7

## 🚀 OPÇÃO RECOMENDADA: Railway.app (MELHOR!)

### Por que Railway?
✅ 5 USD/mês grátis (mais que suficiente)
✅ Servidor sempre ligado
✅ Muito fácil de usar
✅ Excelente performance
✅ Suporta Node.js perfeitamente

### Passo a Passo:

#### 1. Criar Conta
- Acesse: https://railway.app
- Clique "Get Started"
- Sign up com GitHub

#### 2. Conectar GitHub
```bash
# Na sua máquina, prepare o repositório:
cd "c:\Users\carlo\Projetos\Projeto 06"
git init
git add .
git commit -m "IA Trader - Deploy inicial"
git branch -M main
```

#### 3. Criar Repo no GitHub
- https://github.com/new
- Nome: `ia-trader-bitcoin`
- Push do código:
```bash
git remote add origin https://github.com/SEU_USUARIO/ia-trader-bitcoin.git
git push -u origin main
```

#### 4. Deploy no Railway
1. Acesse: https://railway.app/dashboard
2. New Project → Import from GitHub
3. Selecione: `ia-trader-bitcoin`
4. Railway configura automaticamente (Node.js detecta)
5. Aguarde deploy (2-3 minutos)

#### 5. Variáveis de Ambiente
No Railway Dashboard:
- Variables
- Adicione:
  ```
  PORT=3000 (ou qualquer uma)
  NODE_ENV=production
  IA_MODE=simulation
  ```

#### 6. Acessar Servidor Online
- Seu domínio: `https://ia-trader-bitcoin-production.up.railway.app`
- ou qualquer outro gerado pelo Railway

#### 7. Acoplar Domínio Customizado (Opcional)
- Ver em Railway → Deployments → Domains
- Adicionar domínio seu (ex: `ia.seusite.com`)

---

## 💰 CUSTO MENSAL

**Railway:** 5 USD/mês grátis (suficiente para sempre rodar)

Cobrança apenas se ultrapassar 5 USD

---

## 📊 COMO ACESSAR DO PC/CELULAR/BROWSER

Depois que está online:

```
https://seu-dominio.up.railway.app/dashboard
```

Pronto! Acessa de qualquer lugar. IA roda 24/7 mesmo desligando o PC.

---

## 🔌 CONECTAR À BINANCE REAL

1. No Dashboard Online, preencha:
   - API Key da Binance
   - API Secret da Binance

2. Clique "💰 REAL"

3. Clique "▶ START"

4. IA começa a tradear com seu dinheiro!

---

## 📈 MONITORAMENTO

```bash
# Health check (verificar se está vivo):
https://seu-dominio.up.railway.app/alive

# Status detalhado:
https://seu-dominio.up.railway.app/api/health

# JSON do estado:
https://seu-dominio.up.railway.app/api/status
```

---

## 🔄 ATUALIZAÇÕES

Para enviar novas versões:

```bash
git add .
git commit -m "Melhorias na IA"
git push origin main
```

Railway redeploy automaticamente em 2 minutos.

---

## 🎯 RESUMO RÁPIDO

1. ✅ Git init + commit
2. ✅ Criar repo no GitHub
3. ✅ Push para GitHub
4. ✅ Conectar Railway com GitHub
5. ✅ Esperar 3 minutos
6. ✅ Acessar dashboard online
7. ✅ IA roda forever! 🚀

---

## ⚠️ IMPORTANTE

**NUNCA compartilhe:**
- API Key Binance
- API Secret Binance
- URL do servidor com estranhos

**Segurança:**
- Railway usa HTTPS automático
- Chaves armazenadas segura em variáveis de ambiente
- Não ficam no código!

---

## 🆘 SE ALGO DER ERRADO

1. Verificar logs no Railway
2. `git clone seu-repo` novo
3. Deletar app do Railway  
4. Fazer novo deploy

---

**✨ Seu IA Trader agora é um servidor 24/7!**
