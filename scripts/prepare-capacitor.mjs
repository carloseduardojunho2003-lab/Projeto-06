import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const projectDir = path.resolve(scriptsDir, "..");
const mobileWebDir = path.join(projectDir, "mobile-web");
const sourceMobilePath = path.join(projectDir, "mobile.html");

// URL do servidor VPS (hardcode para o APK nativo)
const VPS_URL = "http://91.99.107.19:5561";
const DEFAULT_APP_KEY = process.env.PRIVATE_APP_KEY || "IA_TRADER_PRIVATE_2026";
const LOCAL_FALLBACK_FILE = "app-fallback.html";
const remoteAppUrl = `${VPS_URL}/mobile?k=${encodeURIComponent(DEFAULT_APP_KEY)}`;
const remoteHealthUrl = `${VPS_URL}/api/health?k=${encodeURIComponent(DEFAULT_APP_KEY)}`;
const localFallbackUrl = `./${LOCAL_FALLBACK_FILE}?k=${encodeURIComponent(DEFAULT_APP_KEY)}`;

const htmlSource = await readFile(sourceMobilePath, "utf8");

// Fallback local: copia da interface mobile apontando para o VPS fixo.
const fallbackHtml = htmlSource
  .replace(
    "<title>📱 IA Trader</title>",
    "<title>IA Trader</title>\n  <meta name=\"theme-color\" content=\"#0a0e27\" />",
  )
  .replace(
    // Substituir a detecção dinâmica do SERVER pela URL fixa do VPS
    /const SERVER = \(\(\) => \{[\s\S]*?\}\)\(\);/,
    `const SERVER = "${VPS_URL}"; // APK nativo — conecta ao VPS`,
  )
  .replace(
    // WebSocket também precisa ser ws:// fixo
    /const WS_URL = .*?;/,
    `const WS_URL = \`ws://91.99.107.19:5561\${APP_KEY ? \`?k=\${encodeURIComponent(APP_KEY)}\` : ''}\`; // APK fallback local`,
  );

const bootstrapHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0a0e27" />
  <title>IA Trader</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09101f;
      --card: rgba(15, 20, 38, 0.96);
      --border: rgba(0, 255, 136, 0.22);
      --text: #e8edff;
      --muted: #8b93b7;
      --green: #00ff88;
      --yellow: #ffd84d;
      --red: #ff5c74;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: "Segoe UI", Tahoma, sans-serif;
      background:
        radial-gradient(circle at top, rgba(0,255,136,.12), transparent 38%),
        linear-gradient(160deg, #050914, #0a1021 60%, #09101f);
      color: var(--text);
    }

    .shell {
      width: min(100%, 420px);
      padding: 26px 22px;
      border-radius: 22px;
      border: 1px solid var(--border);
      background: var(--card);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }

    .eyebrow {
      font-size: 11px;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--green);
      margin-bottom: 10px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.1;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
      font-size: 14px;
    }

    .status {
      margin-top: 20px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.03);
    }

    .status-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .status-detail {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.45;
    }

    .pulse {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 0 rgba(0,255,136,.45);
      animation: pulse 1.8s infinite;
      margin-bottom: 16px;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(0,255,136,.45); }
      70% { box-shadow: 0 0 0 16px rgba(0,255,136,0); }
      100% { box-shadow: 0 0 0 0 rgba(0,255,136,0); }
    }

    .actions {
      display: none;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    button {
      flex: 1 1 160px;
      border: none;
      border-radius: 14px;
      padding: 13px 14px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--green);
      color: #04110b;
    }

    .btn-secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid rgba(255,255,255,.14);
    }

    .footnote {
      margin-top: 18px;
      font-size: 12px;
      color: var(--muted);
    }

    .footnote strong {
      color: var(--yellow);
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="pulse"></div>
    <div class="eyebrow">IA Trader Mobile</div>
    <h1>APK remoto com atualizacao pelo servidor</h1>
    <p>Este APK abre a versao mais recente publicada no VPS. Assim, mudancas de interface e ajustes web chegam sem recompilar o app.</p>

    <section class="status">
      <div class="status-title" id="statusTitle">Preparando conexao</div>
      <div class="status-detail" id="statusDetail">Verificando se o servidor remoto esta online.</div>
    </section>

    <div class="actions" id="actions">
      <button class="btn-primary" type="button" onclick="bootRemote()">Tentar novamente</button>
      <button class="btn-secondary" type="button" onclick="openFallback()">Abrir fallback local</button>
    </div>

    <div class="footnote"><strong>Importante:</strong> novo APK so sera necessario para mudancas nativas, como plugins, permissoes ou pacote Android.</div>
  </main>

  <script>
    const APP_KEY = ${JSON.stringify(DEFAULT_APP_KEY)};
    const REMOTE_APP_URL = ${JSON.stringify(remoteAppUrl)};
    const REMOTE_HEALTH_URL = ${JSON.stringify(remoteHealthUrl)};
    const LOCAL_FALLBACK_URL = ${JSON.stringify(localFallbackUrl)};

    const statusTitle = document.getElementById('statusTitle');
    const statusDetail = document.getElementById('statusDetail');
    const actions = document.getElementById('actions');

    function setStatus(title, detail) {
      statusTitle.textContent = title;
      statusDetail.textContent = detail;
    }

    function openFallback() {
      window.location.replace(LOCAL_FALLBACK_URL);
    }

    async function bootRemote() {
      actions.style.display = 'none';
      localStorage.setItem('app_key', APP_KEY);
      setStatus('Conectando ao servidor', 'Buscando a versao remota mais recente do app.');

      try {
        const response = await fetch(REMOTE_HEALTH_URL, {
          cache: 'no-store',
          headers: { 'X-App-Key': APP_KEY }
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        setStatus('Servidor online', 'Abrindo o app remoto atualizado...');
        window.location.replace(REMOTE_APP_URL);
      } catch (error) {
        console.warn('Falha ao abrir a versao remota:', error);
        setStatus('Servidor indisponivel', 'Nao foi possivel abrir a versao remota agora. Tente novamente ou use o fallback local temporario.');
        actions.style.display = 'flex';
      }
    }

    window.addEventListener('online', bootRemote);
    window.addEventListener('load', bootRemote);
  </script>
</body>
</html>
`;

await mkdir(mobileWebDir, { recursive: true });
await writeFile(path.join(mobileWebDir, "index.html"), bootstrapHtml, "utf8");
await writeFile(path.join(mobileWebDir, LOCAL_FALLBACK_FILE), fallbackHtml, "utf8");

// Copiar mobile-bridge.js para mobile-web/
await copyFile(
  path.join(projectDir, "mobile-bridge.js"),
  path.join(mobileWebDir, "mobile-bridge.js"),
);

await copyFile(
  path.join(projectDir, "app-photo.svg"),
  path.join(mobileWebDir, "app-photo.svg"),
);

console.log("✅ mobile-web/ preparado para o Capacitor!");
console.log(`📡 Shell remoto do APK: ${remoteAppUrl}`);
console.log(`🧰 Fallback local do APK: ${LOCAL_FALLBACK_FILE}`);
