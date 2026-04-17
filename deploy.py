#!/usr/bin/env python3
"""
Deploy automático do IA Trader para Railway/Render
"""

import subprocess
import os
import sys

def run(cmd, description):
    print(f"\n📡 {description}...")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"❌ Erro: {result.stderr}")
        return False
    print(f"✅ {description} realizado!")
    print(result.stdout)
    return True

def main():
    print("""
╔══════════════════════════════════════════╗
║   🤖 Deploy IA Trader para Online      ║
║        Railway.app / Render.com        ║
╚══════════════════════════════════════════╝
    """)
    
    # Passo 1: Git init
    if not os.path.exists('.git'):
        print("\n1️⃣ Inicializando Git...")
        if not run('git init', 'Git init'):
            sys.exit(1)
    
    # Passo 2: Add all
    print("\n2️⃣ Adicionando arquivos...")
    if not run('git add .', 'Git add'):
        sys.exit(1)
    
    # Passo 3: Commit
    print("\n3️⃣ Fazendo commit...")
    if not run('git commit -m "IA Trader - Deploy online"', 'Git commit'):
        sys.exit(1)
    
    # Passo 4: Instruções finais
    print("""
╔══════════════════════════════════════════╗
║          ✅ Git Preparado!              ║
╚══════════════════════════════════════════╝

📋 PRÓXIMOS PASSOS:

1. Criar repositório no GitHub:
   https://github.com/new
   Nome: ia-trader-bitcoin

2. Executar no terminal:
   git remote add origin https://github.com/SEU_USER/ia-trader-bitcoin.git
   git branch -M main
   git push -u origin main

3. Fazer Deploy no Railway:
   - Acesse: https://railway.app/dashboard
   - New Project → Import from GitHub
   - Selecione: ia-trader-bitcoin
   - Aguade deploy (2-3 minutos)

4. Acessar seu servidor:
   - Railway fornecerá URL
   - Acesse: https://seu-dominio/dashboard

5. Conectar Binance (opcional):
   - Cole suas chaves no dashboard
   - Mude para "💰 REAL"
   - Clique "▶ START"

🚀 IA rodará 24/7 mesmo desligando o PC!

Perguntas?
- Railway docs: https://docs.railway.app
- IA Trader docs: RAILWAY_DEPLOY.md
    """)

if __name__ == '__main__':
    main()
