# IA TRADER - DEPLOY PARA RENDER.COM (GRATUITO/24/7)

## Step 1: Preparar o Repositório Git

```bash
cd "c:\Users\carlo\Projetos\Projeto 06"
git init
git add .
git commit -m "IA Trader - Deploy inicial"
```

## Step 2: Fazer Push para GitHub

1. Criar repositório em https://github.com/new
2. Nome: `ia-trader-bitcoin`
3. Executar:
```bash
git remote add origin https://github.com/SEU_USER/ia-trader-bitcoin.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy no Render.com (GRATUITO!)

### Criar Conta
- Acesse: https://render.com
- Sign up com GitHub
- Autorizar acesso

### Criar Novo Web Service
1. Dashboard → New → Web Service
2. Conectar seu GitHub (ia-trader-bitcoin)
3. Configurar:
   - **Name:** ia-trader-bitcoin
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (gratuito!)
   - **Plano**: Vai dormir após 15min inativo, mas acordar sob demanda

### Configurar Variáveis de Ambiente
No Render, ir em → Environment:
```
PORT=10000
NODE_ENV=production
IA_MODE=simulation
```

### Ativar Always On (Pago, mas barato)
Se quiser que nunca durma:
- Plan → Upgrade para $7/mês (muy barato!)

## Step 4: Após Deployment

- Seu servidor estará em: `https://ia-trader-bitcoin.onrender.com`
- Dashboard: `https://ia-trader-bitcoin.onrender.com/dashboard`
- API: `https://ia-trader-bitcoin.onrender.com/api/status`

## Step 5: Acessar do PC/Celular

Abra no navegador:
```
https://ia-trader-bitcoin.onrender.com/dashboard
```

IA continua rodando mesmo se desligar o PC!

---

## Alternativas Gratuitas

### Railway.app (Melhor que Render)
- Acesse: https://railway.app
- 5 USD/mês grátis (o bastante!)
- Melhor performance
- Mesmo setup

### AWS Lightsail
- $3.50/mês (mini servidor 24/7)
- Mais confiável

### DigitalOcean ($4/mês)
- Droplet cheapest plan
- Excelente performance

---

## Monitoramento

Depois de deploy, acesse:
- `https://seu-dominio.onrender.com/api/health` → Status do servidor
- `https://seu-dominio.onrender.com/alive` → Verificar se está vivo

---

## Adicionar Binance (Opcional)

1. No dashboard online, cole suas chaves:
   - API Key Binance
   - API Secret

2. Mudar para Modo Real

3. IA começa a tradear com dinheiro real!

---

## Backup & Updates

Para atualizar código:
```bash
git add .
git commit -m "Melhorias na IA"
git push origin main
```

Render redeploy automaticamente! 🚀
