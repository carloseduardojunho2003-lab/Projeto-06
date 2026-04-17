const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const APP_URL = process.env.APP_REMOTE_URL || 'https://ia-trader-bitcoin-production-0c6b.up.railway.app/dashboard';
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY || 'IA_TRADER_PRIVATE_2026';
const APP_META_URL = process.env.APP_META_URL || 'https://ia-trader-bitcoin-production-0c6b.up.railway.app/api/app-meta';
const UPDATE_CHECK_INTERVAL_MS = 60000;

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.setPath('userData', path.join(app.getPath('appData'), 'IA-Trader-Privado'));

let authWindow = null;
let dashboardWindow = null;
let updateInterval = null;
let currentRemoteVersion = '';

function getDashboardUrl() {
  const separator = APP_URL.includes('?') ? '&' : '?';
  return `${APP_URL}${separator}k=${encodeURIComponent(APP_PRIVATE_KEY)}`;
}

function loadErrorPage(errorText) {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    return;
  }

  const html = `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>IA Trader Privado</title>
    <style>
      body { margin:0; font-family: Segoe UI, sans-serif; background:#0b1022; color:#eef3ff; display:flex; align-items:center; justify-content:center; min-height:100vh; }
      .card { width:min(560px, 92vw); background:#121937; border:1px solid #2e3f82; border-radius:16px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,.35); }
      h1 { margin:0 0 10px; font-size:24px; }
      p { color:#a9b8e8; line-height:1.5; }
      pre { white-space:pre-wrap; background:#0a0f25; color:#ffb0c1; padding:14px; border-radius:10px; border:1px solid #31407f; }
      button { margin-top:12px; padding:12px 16px; border:0; border-radius:10px; background:#42d49a; color:#07151b; font-weight:700; cursor:pointer; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Falha ao abrir o painel</h1>
      <p>O app continua privado, mas o painel remoto nao respondeu corretamente. Tente novamente em alguns segundos.</p>
      <pre>${String(errorText || 'Erro desconhecido')}</pre>
      <button onclick="location.reload()">Tentar novamente</button>
    </main>
  </body>
  </html>`;

  dashboardWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
}

function navigateDashboard() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    return;
  }

  dashboardWindow.loadURL(getDashboardUrl(), {
    extraHeaders: `X-App-Key: ${APP_PRIVATE_KEY}\n`
  }).catch((error) => {
    loadErrorPage(error.message);
  });
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'secure-config.json');
}

function readConfig() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return { passwordHash: '' };
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { passwordHash: '' };
  }
}

function writeConfig(config) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return `${useSalt}:${derived}`;
}

function verifyPassword(password, encodedHash) {
  if (!encodedHash || !encodedHash.includes(':')) {
    return false;
  }
  const [salt, expected] = encodedHash.split(':');
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function createAuthWindow() {
  authWindow = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    autoHideMenuBar: true,
    title: 'IA Trader Privado - Login',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  authWindow.loadFile(path.join(__dirname, 'login.html'));
  authWindow.on('closed', () => {
    authWindow = null;
  });
}

function createDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    title: 'IA Trader Privado',
    backgroundColor: '#0b1022',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  dashboardWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  dashboardWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['X-App-Key'] = APP_PRIVATE_KEY;
    callback({ requestHeaders: details.requestHeaders });
  });

  dashboardWindow.webContents.on('did-finish-load', () => {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) {
      return;
    }

    if (!dashboardWindow.isVisible()) {
      dashboardWindow.show();
    }

    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
  });

  dashboardWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    loadErrorPage(`${errorDescription} (${errorCode})\nURL: ${validatedURL}`);
    if (!dashboardWindow.isVisible()) {
      dashboardWindow.show();
    }
  });

  dashboardWindow.loadFile(path.join(__dirname, 'loading.html'));
  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
    setTimeout(() => {
      navigateDashboard();
    }, 300);
  });

  startRemoteUpdateChecks();

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    stopRemoteUpdateChecks();
    if (!authWindow) {
      app.quit();
    }
  });
}

async function fetchRemoteMeta() {
  const response = await fetch(`${APP_META_URL}?k=${encodeURIComponent(APP_PRIVATE_KEY)}`, {
    headers: {
      'X-App-Key': APP_PRIVATE_KEY,
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar versao remota: ${response.status}`);
  }

  return response.json();
}

async function checkRemoteUpdates() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    return;
  }

  try {
    const meta = await fetchRemoteMeta();
    if (!meta?.ok || !meta?.version) {
      return;
    }

    if (!currentRemoteVersion) {
      currentRemoteVersion = meta.version;
      dashboardWindow.setTitle(`IA Trader Privado - ${meta.version}`);
      return;
    }

    if (currentRemoteVersion !== meta.version) {
      currentRemoteVersion = meta.version;
      dashboardWindow.setTitle(`IA Trader Privado - ${meta.version}`);
      dashboardWindow.webContents.reloadIgnoringCache();
    }
  } catch {
  }
}

function startRemoteUpdateChecks() {
  stopRemoteUpdateChecks();
  checkRemoteUpdates();
  updateInterval = setInterval(checkRemoteUpdates, UPDATE_CHECK_INTERVAL_MS);
}

function stopRemoteUpdateChecks() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

ipcMain.handle('auth:get-state', async () => {
  const config = readConfig();
  return {
    hasPassword: Boolean(config.passwordHash),
    appUrl: APP_URL
  };
});

ipcMain.handle('auth:set-password', async (_event, password) => {
  if (typeof password !== 'string' || password.length < 6) {
    return { ok: false, error: 'A senha precisa ter no minimo 6 caracteres.' };
  }

  const config = readConfig();
  config.passwordHash = hashPassword(password);
  writeConfig(config);

  return { ok: true };
});

ipcMain.handle('auth:verify-password', async (_event, password) => {
  const config = readConfig();
  const ok = verifyPassword(password, config.passwordHash || '');
  return { ok };
});

ipcMain.handle('app:open-dashboard', async () => {
  createDashboardWindow();
  return { ok: true };
});

app.whenReady().then(() => {
  createAuthWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAuthWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
