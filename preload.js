// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Para navegação após login
    navigate: (targetPage, data = {}) => ipcRenderer.send('navigate', { targetPage, ...data }),

    // Para o logsViewer.html
    onLogData: (callback) => { // Para logs em tempo real
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('log-data', subscription);
        return () => {
            // console.log("[Preload] Removendo listener para 'log-data'"); 
            ipcRenderer.removeListener('log-data', subscription);
        };
    },
    onInitialLogsData: (callback) => { // Para o buffer de histórico de logs
        const subscription = (_event, logsArray) => callback(logsArray);
        ipcRenderer.on('initial-logs-data', subscription);
        return () => {
            // console.log("[Preload] Removendo listener para 'initial-logs-data'"); 
            ipcRenderer.removeListener('initial-logs-data', subscription);
        };
    },
    requestInitialLogs: () => ipcRenderer.send('request-initial-logs'),

    // Para abrir DevTools da janela atual
    openDevTools: () => ipcRenderer.send('open-dev-tools'),

    // Para fechar a aplicação
    closeApp: () => ipcRenderer.send('close-app'),

    // Função para enviar mensagens IPC genéricas
    sendIpcMessage: (channel, data) => ipcRenderer.send(channel, data),
});
