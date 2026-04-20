(function () {
  const capacitor = window.Capacitor;
  const plugins = capacitor?.Plugins || {};
  const isNative = Boolean(
    capacitor &&
    typeof capacitor.isNativePlatform === "function" &&
    capacitor.isNativePlatform()
  );

  // Abrir URLs externas usando o plugin Browser nativo
  window.openExternalUrl = async function openExternalUrl(url) {
    const normalized = String(url || "").trim();
    if (!normalized) return;

    if (isNative && plugins.Browser?.open) {
      await plugins.Browser.open({ url: normalized });
      return;
    }

    window.open(normalized, "_blank", "noopener,noreferrer");
  };

  // Listener para deep links (appUrlOpen)
  if (!isNative || !plugins.App?.addListener) return;

  plugins.App.addListener("appUrlOpen", async ({ url }) => {
    if (!url) return;

    try {
      if (plugins.Browser?.close) {
        await plugins.Browser.close();
      }
    } catch {
      // best-effort
    }

    try {
      const incomingUrl = new URL(url);
      const currentUrl = new URL(window.location.href);
      currentUrl.search = "";

      incomingUrl.searchParams.forEach((value, key) => {
        currentUrl.searchParams.set(key, value);
      });

      window.history.replaceState({}, "", currentUrl.toString());
      window.dispatchEvent(new CustomEvent("appUrlOpen", { detail: { url } }));
    } catch (error) {
      console.warn("Falha ao processar retorno do app:", error);
    }
  });
})();
