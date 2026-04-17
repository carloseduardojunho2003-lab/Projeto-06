const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const APP_URL = process.env.APP_REMOTE_URL || 'https://ia-trader-bitcoin-production-0c6b.up.railway.app/dashboard';
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY || 'IA_TRADER_PRIVATE_2026';

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.setPath('userData', path.join(app.getPath('appData'), 'IA-Trader-Privado'));

let authWindow = null;
let dashboardWindow = null;

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
    autoHideMenuBar: true,
    title: 'IA Trader Privado',
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

  const separator = APP_URL.includes('?') ? '&' : '?';
  dashboardWindow.loadURL(`${APP_URL}${separator}k=${encodeURIComponent(APP_PRIVATE_KEY)}`, {
    extraHeaders: `X-App-Key: ${APP_PRIVATE_KEY}\n`
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    if (!authWindow) {
      app.quit();
    }
  });
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
  if (authWindow) {
    authWindow.close();
  }
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
