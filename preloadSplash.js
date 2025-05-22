// preloadSplash.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  // Função para receber informações da aplicação (versão, nome) do processo principal
  receiveAppInfo: (callback) => {
    ipcRenderer.on('app-info', (_event, value) => callback(value));
  }
});
