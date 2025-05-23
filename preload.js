// preload.js
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script de pré-carregamento executado.');

if (contextBridge && ipcRenderer) {
    console.log('[Preload] contextBridge e ipcRenderer estão disponíveis.');
    try {
        contextBridge.exposeInMainWorld('electronAPI', {
            // Para navegação entre janelas (se aplicável ao seu novo fluxo web-first)
            navigate: (targetPage, data = {}) => {
                console.log(`[Preload] navigate chamada para: ${targetPage}`);
                ipcRenderer.send('navigate', { targetPage, ...data });
            },

            // Para o menu.html (agora index.html) solicitar a abertura da tela de login com um destino específico
            openLoginForTarget: (targetPage) => {
                console.log(`[Preload] openLoginForTarget chamada para: ${targetPage}`);
                ipcRenderer.send('open-login-for-target', { targetPage });
            },
            
            // Para obter informações da aplicação (versão, nome)
            getAppInfo: () => {
                console.log('[Preload] getAppInfo chamada. Invocando "get-app-info"...');
                return ipcRenderer.invoke('get-app-info');
            },

            // Para receber atualizações de tema do sistema operacional
            onSystemThemeUpdate: (callback) => {
                const subscription = (_event, theme) => callback(theme); // theme será 'dark' ou 'light'
                ipcRenderer.on('system-theme-update', subscription);
                console.log('[Preload] Listener para onSystemThemeUpdate registrado.');
                return () => {
                    ipcRenderer.removeListener('system-theme-update', subscription);
                    console.log('[Preload] Listener para onSystemThemeUpdate removido.');
                };
            },

            // Para obter o tema inicial do sistema
            getSystemTheme: () => {
                console.log('[Preload] getSystemTheme chamada. Invocando "get-system-theme"...');
                return ipcRenderer.invoke('get-system-theme');
            },

            // Para o logsViewer.html
            onLogData: (callback) => { 
                const subscription = (_event, value) => callback(value);
                ipcRenderer.on('log-data', subscription);
                return () => {
                    ipcRenderer.removeListener('log-data', subscription);
                };
            },
            onInitialLogsData: (callback) => { 
                const subscription = (_event, logsArray) => callback(logsArray);
                ipcRenderer.on('initial-logs-data', subscription);
                return () => {
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
        console.log('[Preload] electronAPI exposto com sucesso em window.');
    } catch (error) {
        console.error('[Preload] Erro ao expor electronAPI:', error);
    }
} else {
    console.error('[Preload] contextBridge ou ipcRenderer não estão disponíveis.');
}
