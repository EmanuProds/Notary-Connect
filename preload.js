// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Para navegação após login
    navigate: (targetPage, data = {}) => ipcRenderer.send('navigate', { targetPage, ...data }),

    // Para o logsViewer.html
    onLogData: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('log-data', subscription);
        return () => ipcRenderer.removeListener('log-data', subscription);
    },
    removeAllLogDataListeners: () => ipcRenderer.removeAllListeners('log-data'), // Pode ser mantido por compatibilidade
    requestInitialLogs: () => ipcRenderer.send('request-initial-logs'),

    // Para abrir DevTools da janela atual (para debug)
    openDevTools: () => ipcRenderer.send('open-dev-tools'),

    // Nova função para fechar a aplicação
    closeApp: () => ipcRenderer.send('close-app'),

    // (Opcional) Se for usar login via IPC (alternativa ao HTTP)
    // attemptLogin: (credentials) => ipcRenderer.invoke('login-attempt', credentials),
});
