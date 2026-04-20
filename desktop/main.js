const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const APP_ID = 'com.iatrader.desktop';
const APP_NAME = 'Privado';
const APP_LABEL = 'Privado';
const DEFAULT_APP_DASHBOARD_URL = 'http://91.99.107.19:5561/dashboard';
const APP_URL = process.env.APP_DASHBOARD_URL || DEFAULT_APP_DASHBOARD_URL;
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY || 'IA_TRADER_PRIVATE_2026';
const DEFAULT_APP_META_URL = 'http://91.99.107.19:5561/api/app-meta';
const APP_META_URL = process.env.APP_META_URL || DEFAULT_APP_META_URL;
const DESKTOP_ALLOW_LOCAL = process.env.APP_DESKTOP_ALLOW_LOCAL === '1';
const UPDATE_CHECK_INTERVAL_MS = 60000;
const DESKTOP_UPDATE_CHECK_INTERVAL_MS = Number(process.env.APP_DESKTOP_UPDATE_INTERVAL_MS || 10 * 60 * 1000);
const DESKTOP_AUTO_UPDATE_ENABLED = process.env.APP_DESKTOP_AUTO_UPDATE !== '0';
const DESKTOP_UPDATE_FEED_URL = process.env.APP_DESKTOP_UPDATE_FEED_URL || '';
const DESKTOP_UPDATE_CHANNEL = process.env.APP_DESKTOP_UPDATE_CHANNEL || 'latest';
const DESKTOP_SAFE_MODE_EXTERNAL = process.env.APP_DESKTOP_SAFE_MODE !== '0';
const ALLOWED_HTTP_HOSTS = new Set(['91.99.107.19']);
const WINDOW_ICON_PNG = path.join(__dirname, 'assets/app-icon.png');
const WINDOW_ICON_ICO = path.join(__dirname, 'assets/app-icon.ico');

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
app.setAppUserModelId(APP_ID);

let authWindow = null;
let dashboardWindow = null;
let updateInterval = null;
let desktopUpdateInterval = null;
let currentRemoteVersion = '';
let desktopUpdateBusy = false;
let isQuitting = false;

// Fecha a janela de login se ela existir
ipcMain.on('auth:close-login-window', () => {
  console.log('[MAIN] ipc auth:close-login-window');
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }
});

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

function getWindowIcon() {
  const preferredIcon = process.platform === 'win32' ? WINDOW_ICON_ICO : WINDOW_ICON_PNG;
  const fallbackIcon = process.platform === 'win32' ? WINDOW_ICON_PNG : WINDOW_ICON_ICO;

  let iconPath;

  if (fs.existsSync(preferredIcon)) {
    iconPath = preferredIcon;
  }

  if (!iconPath && fs.existsSync(fallbackIcon)) {
    iconPath = fallbackIcon;
  }

  if (!iconPath) {
    return undefined;
  }

  const icon = nativeImage.createFromPath(iconPath);
  return icon && !icon.isEmpty() ? icon : iconPath;
}

function getRendererBrandIconDataUrl() {
  const candidateIcons = [WINDOW_ICON_PNG, WINDOW_ICON_ICO];

  for (const iconPath of candidateIcons) {
    if (!fs.existsSync(iconPath)) {
      continue;
    }

    const icon = nativeImage.createFromPath(iconPath);
    if (icon && !icon.isEmpty()) {
      return icon.toDataURL();
    }
  }

  return '';
}

async function applyDashboardBrandingOverride() {
  if (!dashboardWindow || dashboardWindow.isDestroyed()) {
    return;
  }

  const currentUrl = dashboardWindow.webContents.getURL();
  if (!currentUrl || currentUrl.startsWith('file:') || currentUrl.startsWith('data:')) {
    return;
  }

  const iconDataUrl = getRendererBrandIconDataUrl();
  if (!iconDataUrl) {
    return;
  }

  const script = `(() => {
    const iconUrl = ${JSON.stringify(iconDataUrl)};
    const iconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]'
    ];
    const brandSelectors = [
      '.brand-mark',
      '.header-logo',
      '.brand img',
      'img[alt="Privado"]'
    ];

    iconSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        node.setAttribute('href', iconUrl);
      });
    });

    brandSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!(node instanceof HTMLImageElement)) {
          return;
        }
        node.src = iconUrl;
      });
    });

    document.querySelectorAll('img').forEach((node) => {
      if (!(node instanceof HTMLImageElement)) {
        return;
      }

      const src = String(node.getAttribute('src') || '');
      if (/app-photo\.svg|ic_launcher_round\.png|app-icon\.(png|ico)/i.test(src)) {
        node.src = iconUrl;
      }
    });
  })();`;

  try {
    await dashboardWindow.webContents.executeJavaScript(script, true);
  } catch (error) {
    console.warn('[MAIN] branding override failed:', error?.message || String(error));
  }
}

function assertRemoteUrl(url, label, options = {}) {
  const allowLocal = Boolean(options.allowLocal);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} invalida.`);
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocalHost) {
    if (allowLocal) {
      return;
    }
    throw new Error(`${label} local bloqueada.`);
  }

  const isAllowedHttp = parsed.protocol === 'http:' && ALLOWED_HTTP_HOSTS.has(host);
  if (parsed.protocol !== 'https:' && !isAllowedHttp) {
    throw new Error(`${label} deve usar HTTPS.`);
  }
}

assertRemoteUrl(APP_URL, 'APP_URL', { allowLocal: DESKTOP_ALLOW_LOCAL });
assertRemoteUrl(APP_META_URL, 'APP_META_URL', { allowLocal: DESKTOP_ALLOW_LOCAL });

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
    <title>${APP_LABEL}</title>
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
  console.log('[MAIN] createAuthWindow');

  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: 480,
    height: 620,
    show: true,
    resizable: false,
    autoHideMenuBar: true,
    title: `${APP_LABEL} - Acesso`,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  authWindow.once('ready-to-show', () => {
    console.log('[MAIN] authWindow ready-to-show');
  });

  authWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] authWindow did-finish-load');
  });

  authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[MAIN] authWindow did-fail-load: ${errorDescription} (${errorCode}) URL=${validatedURL}`);
  });

  authWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[MAIN] authWindow render-process-gone: ${details?.reason || 'desconhecido'}`);
  });

  authWindow.loadFile(path.join(__dirname, 'login.html'));
  authWindow.on('closed', () => {
    console.log('[MAIN] authWindow closed');
    authWindow = null;
    if (!isQuitting && (!dashboardWindow || dashboardWindow.isDestroyed())) {
      isQuitting = true;
      stopDesktopAutoUpdater();
      app.quit();
    }
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
    title: APP_LABEL,
    backgroundColor: '#0b1022',
    icon: getWindowIcon(),
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

    applyDashboardBrandingOverride();

    if (!dashboardWindow.isVisible()) {
      dashboardWindow.show();
    }
  });

  dashboardWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    loadErrorPage(`${errorDescription} (${errorCode})\nURL: ${validatedURL}`);
    if (!dashboardWindow.isVisible()) {
      dashboardWindow.show();
    }
  });

  dashboardWindow.webContents.on('render-process-gone', (_event, details) => {
    loadErrorPage(`Render process finalizado: ${details?.reason || 'desconhecido'}`);
  });

  dashboardWindow.loadFile(path.join(__dirname, 'loading.html'));
  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    setTimeout(() => {
      navigateDashboard();
    }, 300);
  });

  startRemoteUpdateChecks();

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    stopRemoteUpdateChecks();
    if (!isQuitting) {
      isQuitting = true;
      stopDesktopAutoUpdater();
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
      dashboardWindow.setTitle(`${APP_LABEL} - ${meta.version}`);
      return;
    }

    if (currentRemoteVersion !== meta.version) {
      currentRemoteVersion = meta.version;
      dashboardWindow.setTitle(`${APP_LABEL} - ${meta.version}`);
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

function checkDesktopBinaryUpdates() {
  if (!autoUpdater || desktopUpdateBusy) {
    return;
  }

  desktopUpdateBusy = true;
  autoUpdater.checkForUpdates().finally(() => {
    desktopUpdateBusy = false;
  });
}

function stopDesktopAutoUpdater() {
  if (desktopUpdateInterval) {
    clearInterval(desktopUpdateInterval);
    desktopUpdateInterval = null;
  }
}

function setupDesktopAutoUpdater() {
  stopDesktopAutoUpdater();

  if (!DESKTOP_AUTO_UPDATE_ENABLED) {
    return;
  }

  if (!app.isPackaged) {
    return;
  }

  if (!autoUpdater) {
    console.warn('[AUTO-UPDATE] electron-updater nao encontrado. Rode npm install para habilitar.');
    return;
  }

  if (!DESKTOP_UPDATE_FEED_URL) {
    console.warn('[AUTO-UPDATE] APP_DESKTOP_UPDATE_FEED_URL nao configurado.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = console;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: DESKTOP_UPDATE_FEED_URL,
    channel: DESKTOP_UPDATE_CHANNEL
  });

  autoUpdater.on('checking-for-update', () => {
    console.log('[AUTO-UPDATE] Verificando nova versao...');
  });

  autoUpdater.on('update-available', (info) => {
    const version = info?.version || 'nova';
    console.log(`[AUTO-UPDATE] Nova versao encontrada: ${version}`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AUTO-UPDATE] Aplicativo ja esta atualizado.');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Number(progress?.percent || 0).toFixed(1);
    console.log(`[AUTO-UPDATE] Download ${pct}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    const version = info?.version || 'nova';
    console.log(`[AUTO-UPDATE] Atualizacao ${version} baixada. Sera aplicada ao fechar o app.`);
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.setTitle(`${APP_LABEL} - Atualizacao ${version} pronta (feche e abra o app)`);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AUTO-UPDATE] Erro:', err?.message || String(err));
  });

  checkDesktopBinaryUpdates();
  desktopUpdateInterval = setInterval(checkDesktopBinaryUpdates, DESKTOP_UPDATE_CHECK_INTERVAL_MS);
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
  console.log('[MAIN] ipc app:open-dashboard');
  createDashboardWindow();
  return { ok: true, mode: 'internal' };
});

app.whenReady().then(() => {
  console.log('[MAIN] app ready');
  setupDesktopAutoUpdater();
  createAuthWindow();

  app.on('activate', () => {
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0) {
      createAuthWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopDesktopAutoUpdater();
});

app.on('window-all-closed', () => {
  console.log('[MAIN] window-all-closed');
  stopDesktopAutoUpdater();
  isQuitting = true;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('[MAIN] uncaughtException:', error?.stack || error?.message || String(error));
});

process.on('unhandledRejection', (reason) => {
  console.error('[MAIN] unhandledRejection:', reason?.stack || reason?.message || String(reason));
});
