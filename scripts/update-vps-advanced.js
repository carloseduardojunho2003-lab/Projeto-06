#!/usr/bin/env node
/**
 * 🚀 SCRIPT DE ATUALIZAÇÃO DO VPS
 * Puxa código atualizado e reinicia com novos módulos
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_PASSWORD = process.env.VPS_PASSWORD || '';
const VPS_PRIVATE_KEY = (() => {
  if (process.env.VPS_PRIVATE_KEY) {
    return process.env.VPS_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (process.env.VPS_PRIVATE_KEY_PATH && fs.existsSync(process.env.VPS_PRIVATE_KEY_PATH)) {
    return fs.readFileSync(process.env.VPS_PRIVATE_KEY_PATH, 'utf8');
  }

  return null;
})();

const VPS_CONFIG = {
  host: process.env.VPS_HOST || '91.99.107.19',
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USERNAME || 'root',
  tryKeyboard: Boolean(VPS_PASSWORD),
  readyTimeout: 20000,
  ...(VPS_PASSWORD ? { password: VPS_PASSWORD } : {}),
  ...(VPS_PRIVATE_KEY ? { privateKey: VPS_PRIVATE_KEY } : {})
};

const BINANCE_BASE_URL = process.env.BINANCE_BASE_URL || 'https://api.binance.com/api/v3';
const BINANCE_SYMBOL = process.env.BINANCE_SYMBOL || 'BTCBRL';
const BINANCE_QUOTE_ASSET = process.env.BINANCE_QUOTE_ASSET || 'BRL';
const LOCAL_PROJECT_DIR = path.resolve(__dirname, '..');
const REMOTE_PROJECT_DIR = '/root/Projeto-06';
const REMOTE_BACKUP_DIR = '/root/Projeto-06-backups';
const FILES_TO_UPLOAD = [
  'app-photo.svg',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'package.json',
  'package-lock.json',
  'server.js',
  'dashboard.html',
  'mobile.html',
  'projeto06.html',
  'desktop/main.js',
  'desktop/login.html',
  'desktop/loading.html',
  'desktop/assets/app-icon.png',
  'desktop/assets/app-icon.ico',
  'modules/ai-memory.js',
  'modules/ai-security.js',
  'modules/ai-compliance.js'
];
const FILES_TO_BACKUP = [...new Set(['.env', ...FILES_TO_UPLOAD])];
const REMOTE_DIRS_TO_ENSURE = [...new Set(
  FILES_TO_UPLOAD
    .map((filePath) => path.posix.dirname(filePath))
    .filter((dirPath) => dirPath && dirPath !== '.')
)];

function buildEnsureDirsCommand() {
  if (!REMOTE_DIRS_TO_ENSURE.length) {
    return 'true';
  }

  const dirs = REMOTE_DIRS_TO_ENSURE.map((dirPath) => `${REMOTE_PROJECT_DIR}/${dirPath}`);
  return `mkdir -p ${dirs.join(' ')}`;
}

function buildBackupCommand() {
  const backupItems = FILES_TO_BACKUP.join(' ');
  return [
    'set -e',
    `mkdir -p ${REMOTE_BACKUP_DIR}`,
    `cd ${REMOTE_PROJECT_DIR}`,
    'backup_name="predeploy-$(date +%Y%m%d-%H%M%S).tar.gz"',
    `tar -czf "${REMOTE_BACKUP_DIR}/$backup_name" --ignore-failed-read ${backupItems}`,
    'printf "BACKUP_FILE=%s\\n" "$backup_name"'
  ].join(' && ');
}

function runRemoteCommand(conn, command, label = 'cmd') {
  return new Promise((resolve, reject) => {
    console.log(`\n[${label}] $ ${command}`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);

      let output = '';
      stream.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        output += text;
      });

      stream.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(text);
        output += text;
      });

      stream.on('close', (code) => {
        if (code === 0) return resolve(output);
        reject(new Error(`[${label}] comando remoto retornou código ${code}`));
      });
    });
  });
}

function uploadFiles(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);

      const queue = [...FILES_TO_UPLOAD];

      const next = () => {
        const rel = queue.shift();
        if (!rel) {
          if (sftp.end) sftp.end();
          return resolve();
        }

        const localPath = path.join(LOCAL_PROJECT_DIR, ...rel.split('/'));
        const remotePath = `${REMOTE_PROJECT_DIR}/${rel}`;

        if (!fs.existsSync(localPath)) {
          return reject(new Error(`Arquivo local não encontrado: ${localPath}`));
        }

        console.log(`[upload] ${rel}`);
        sftp.fastPut(localPath, remotePath, (putErr) => {
          if (putErr) return reject(putErr);
          next();
        });
      };

      next();
    });
  });
}

async function updateVPS() {
  if (!VPS_PASSWORD && !VPS_PRIVATE_KEY) {
    throw new Error('Defina VPS_PASSWORD, VPS_PRIVATE_KEY ou VPS_PRIVATE_KEY_PATH antes de executar o deploy.');
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('keyboard-interactive', (_name, _instructions, _instructionsLang, prompts, finish) => {
      if (!VPS_PASSWORD) {
        return finish([]);
      }

      finish(prompts.map(() => VPS_PASSWORD));
    });

    conn.on('ready', async () => {
      console.log('✅ Conectado ao VPS');

      try {
        await runRemoteCommand(conn, buildBackupCommand(), 'backup');

        await runRemoteCommand(
          conn,
          `set -e && cd ${REMOTE_PROJECT_DIR} && git pull origin main && ${buildEnsureDirsCommand()}`,
          'sync-base'
        );

        await uploadFiles(conn);

        const restartCmd = [
          'set -e',
          `cd ${REMOTE_PROJECT_DIR}`,
          'npm install --production',
          'pm2 delete ia-trader || true',
          `PORT=5561 PRIVATE_APP_KEY=IA_TRADER_PRIVATE_2026 ALLOW_LOCAL_MODE=true BINANCE_BASE_URL=${BINANCE_BASE_URL} BINANCE_SYMBOL=${BINANCE_SYMBOL} BINANCE_QUOTE_ASSET=${BINANCE_QUOTE_ASSET} pm2 start server.js --name ia-trader --update-env`,
          'pm2 save',
          'pm2 status',
          'printf "\\n--- /api/status ---\\n"',
          'curl -s "http://127.0.0.1:5561/api/status?k=IA_TRADER_PRIVATE_2026" | head -c 400 || true',
          'printf "\\n\\n--- /api/app-meta ---\\n"',
          'curl -s "http://127.0.0.1:5561/api/app-meta?k=IA_TRADER_PRIVATE_2026" | head -c 400 || true'
        ].join(' && ');

        const output = await runRemoteCommand(conn, restartCmd, 'restart');
        conn.end();
        resolve(output);
      } catch (e) {
        conn.end();
        reject(e);
      }
    });

    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
}

updateVPS()
  .then(() => {
    console.log('\n✅ VPS atualizado com sucesso!');
    console.log('\n📊 Novos endpoints disponíveis:');
    console.log('   GET /api/ai-memory/stats');
    console.log('   GET /api/security/report');
    console.log('   GET /api/compliance/report');
    console.log('   POST /api/compliance/disclosure');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro na atualização:', err.message);
    process.exit(1);
  });
