const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAuth', {
  getState: () => ipcRenderer.invoke('auth:get-state'),
  setPassword: (password) => ipcRenderer.invoke('auth:set-password', password),
  verifyPassword: (password) => ipcRenderer.invoke('auth:verify-password', password),
  openDashboard: () => ipcRenderer.invoke('app:open-dashboard')
});
