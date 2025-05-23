// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Para navegação entre janelas
    navigate: (targetPage, data = {}) => ipcRenderer.send('navigate', { targetPage, ...data }),

    // Para o menu.html solicitar a abertura da tela de login com um destino específico
    openLoginForTarget: (targetPage) => ipcRenderer.send('open-login-for-target', { targetPage }),
    
    // Para obter informações da aplicação (versão, nome)
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),

    // Para receber atualizações de tema do sistema operacional
    onSystemThemeUpdate: (callback) => {
        const subscription = (_event, theme) => callback(theme); // theme será 'dark' ou 'light'
        ipcRenderer.on('system-theme-update', subscription);
        return () => {
            ipcRenderer.removeListener('system-theme-update', subscription);
        };
    },

    // Para obter o tema inicial do sistema (usado por janelas que abrem antes do 'updated' do nativeTheme)
    getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),

    // Para o logsViewer.html
    onLogData: (callback) => { // Para logs em tempo real
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('log-data', subscription);
        return () => {
            ipcRenderer.removeListener('log-data', subscription);
        };
    },
    onInitialLogsData: (callback) => { // Para o buffer de histórico de logs
        const subscription = (_event, logsArray) => callback(logsArray);
        ipcRenderer.on('initial-logs-data', subscription);
        return () => {
            ipcRenderer.removeListener('initial-logs-data', subscription);
        };
    },
    requestInitialLogs: () => ipcRenderer.send('request-initial-logs'),

    // Para abrir DevTools da janela atual
    openDevTools: () => ipcRenderer.send('open-dev-tools'),

    // Para fechar a aplicação (usado pelo menu.html ou index.html)
    closeApp: () => ipcRenderer.send('close-app'),
    
    // Para fechar a janela atual (usado pelo botão de voltar no index.html para o menu)
    // No electronMain, isso pode ser tratado para fechar a loginWindow e reabrir/focar a mainWindow (menu)
    // Ou, se for o menu, pode chamar closeApp.
    // Para simplificar, o botão "Voltar" no index.html agora usa navigate('menu', { fromLoginWindow: true })
    // E o botão "Fechar" no menu usa closeApp.

    // Função para enviar mensagens IPC genéricas (mantida para flexibilidade)
    sendIpcMessage: (channel, data) => ipcRenderer.send(channel, data),
});
