// electronMain.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path =require('path');
const httpServer = require('http');
const express = require('express');

// Serviços de backend
let sqliteService; // Alterado de firebirdService
let baileysService;
let websocketService;
let authRoutesModule;

const PORT = process.env.ELECTRON_PORT || 3000;

let mainWindow;
let chatWindows = {};
let adminWindow;
let logsWindow;

function sendLogToViewer(logString, level = 'info') {
    const formattedLog = `[${level.toUpperCase()}] ${new Date().toISOString()} - ${logString}`;
    if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.webContents.send('log-data', formattedLog);
    }
    if (level === 'error') console.error(formattedLog);
    else if (level === 'warn') console.warn(formattedLog);
    else console.log(formattedLog);
}

try {
    sqliteService = require('./backend/services/sqliteService'); // Alterado
    baileysService = require('./backend/services/baileysService');
    websocketService = require('./backend/services/websocketService');
    authRoutesModule = require('./backend/routes/authRoutes');

    if (!sqliteService || !baileysService || !websocketService || !authRoutesModule || !authRoutesModule.router || !authRoutesModule.setLogger) {
        throw new Error("Um ou mais módulos de backend ou suas exportações essenciais (router, setLogger) não foram encontrados.");
    }
} catch (e) {
    console.error("Erro CRÍTICO ao carregar módulos de backend:", e);
    if (app.isReady()) {
        dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos de backend. A aplicação será encerrada. Detalhes: ${e.message}`);
    }
    app.quit();
    process.exit(1);
}

// ... (funções createMainWindow, createChatWindow, etc. permanecem as mesmas que em electronMain_js_v4) ...
function createMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return;
    }
    mainWindow = new BrowserWindow({
        width: 450,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: process.env.NODE_ENV === 'development' 
        },
        icon: path.join(__dirname, 'frontend/web/img/icons/logo.png'),
        transparent: true,
        frame: false,
        resizable: false,
        show: false, 
        backgroundColor: '#00000000', 
        hasShadow: false, 
        thickFrame: false, 
    });

    mainWindow.webContents.on('did-finish-load', () => {
        sendLogToViewer('[createMainWindow] Evento did-finish-load disparado para mainWindow.', 'debug');
        if (mainWindow && !mainWindow.isDestroyed()) { 
            mainWindow.show();
        }
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        sendLogToViewer(`[createMainWindow] Falha ao carregar URL: ${validatedURL}. Código: ${errorCode}. Descrição: ${errorDescription}`, 'error');
        if (mainWindow && !mainWindow.isDestroyed()) {
            dialog.showErrorBox("Erro de Carregamento", `Não foi possível carregar a página de login: ${errorDescription}`);
        }
    });


    mainWindow.loadURL(`http://localhost:${PORT}/index.html`);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    sendLogToViewer('Janela de login transparente, sem moldura e sem sombra criada. Aguardando did-finish-load.');
}

function createChatWindow(agentInfo) {
    const agentId = agentInfo.agent; 
    const agentName = agentInfo.name || agentId; 

    if (chatWindows[agentId] && !chatWindows[agentId].isDestroyed()) {
        chatWindows[agentId].focus();
        return;
    }
    const newChatWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: `Chat - Atendente: ${agentName}`,
        icon: path.join(__dirname, 'frontend/web/img/icons/logo.png')
    });
    newChatWindow.loadURL(`http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`);
    newChatWindow.on('closed', () => {
        delete chatWindows[agentId];
        sendLogToViewer(`Janela de chat para o atendente ${agentName} (${agentId}) fechada.`);
    });
    chatWindows[agentId] = newChatWindow;
    sendLogToViewer(`Janela de chat criada para o atendente: ${agentName} (${agentId})`);
}

function createAdminWindow(adminInfo) {
    if (!adminInfo || typeof adminInfo.name === 'undefined') {
        sendLogToViewer(`[createAdminWindow] Erro: adminInfo inválido ou sem nome. adminInfo: ${JSON.stringify(adminInfo)}`, 'error');
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
        else createMainWindow();
        return;
    }

    if (adminWindow && !adminWindow.isDestroyed()) {
        adminWindow.focus();
        return;
    }
    adminWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: `Admin - ${adminInfo.name || 'Administrador'}`,
        icon: path.join(__dirname, 'frontend/web/img/icons/logo.png')
    });
    adminWindow.loadURL(`http://localhost:${PORT}/admin.html`);
    adminWindow.on('closed', () => {
        adminWindow = null;
    });
    sendLogToViewer(`Janela de administração criada para: ${adminInfo.name}`);
}

function createLogsWindow() {
    if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.focus();
        return;
    }
    logsWindow = new BrowserWindow({
        width: 900,
        height: 650,
        title: "Logs do Sistema - Notary Connect",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'frontend/web/img/icons/logo.png')
    });
    logsWindow.loadURL(`http://localhost:${PORT}/logsViewer.html`);
    logsWindow.on('closed', () => {
        logsWindow = null;
    });
    console.log("Janela de logs criada.");
}

function setupMenu() {
    const template = [
        {
            label: 'Arquivo',
            submenu: [
                { label: 'Ver Logs', click: () => createLogsWindow() },
                { label: 'Recarregar Janela', role: 'reload' },
                { label: 'Forçar Recarregamento', role: 'forceReload' },
                { label: 'Alternar Ferramentas de Desenvolvedor', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: 'Sair', role: 'quit' }
            ]
        },
        { label: 'Editar', role: 'editMenu' }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}


async function initializeDatabase() {
    try {
        await sqliteService.connect(); // Conecta ou garante que a conexão está ativa
        await sqliteService.createTablesIfNotExists();
        await sqliteService.initializeDefaultAttendants();
        sendLogToViewer('[DB Init] Banco de dados SQLite inicializado com sucesso.', 'info');
    } catch (dbError) {
        sendLogToViewer(`Erro CRÍTICO durante a inicialização do banco de dados SQLite: ${dbError.message}`, 'error');
        dialog.showErrorBox("Erro de Banco de Dados", `Não foi possível inicializar o banco de dados SQLite. A aplicação pode não funcionar corretamente.\n\nDetalhes: ${dbError.message}`);
        // Decidir se o aplicativo deve fechar ou continuar com funcionalidade limitada
        app.quit(); // É mais seguro fechar se o DB não puder ser inicializado
        process.exit(1);
    }
}

app.whenReady().then(async () => {
    sqliteService.setLogger(sendLogToViewer); // Injeta o logger no sqliteService
    authRoutesModule.setLogger(sendLogToViewer);
    setupMenu();

    await initializeDatabase(); // Inicializa o banco de dados SQLite

    const expressApp = express();
    expressApp.use(express.json());
    const staticPath = path.join(__dirname, 'frontend/web');
    expressApp.use(express.static(staticPath));
    expressApp.use('/api/auth', authRoutesModule.router);

    expressApp.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
    expressApp.get('/chat.html', (req, res) => res.sendFile(path.join(staticPath, 'chat.html')));
    expressApp.get('/admin.html', (req, res) => res.sendFile(path.join(staticPath, 'admin.html')));
    expressApp.get('/logsViewer.html', (req, res) => res.sendFile(path.join(staticPath, 'logsViewer.html')));

    const internalServer = httpServer.createServer(expressApp);

    // Passa a instância do sqliteService para websocketService e baileysService
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, baileysService, sqliteService);
    sendLogToViewer('Servidor WebSocket inicializado.');

    try {
        await baileysService.connectToWhatsApp(sendLogToViewer, websocketService, sqliteService);
        sendLogToViewer("Serviço Baileys iniciado e tentando conectar ao WhatsApp.");
    } catch (err) {
        sendLogToViewer(`Falha CRÍTICA ao iniciar o serviço Baileys: ${err.message}.`, 'error');
    }

    internalServer.listen(PORT, () => {
        sendLogToViewer(`Servidor HTTP e WebSocket interno rodando em http://localhost:${PORT}`);
        createMainWindow();
    }).on('error', (err) => {
        sendLogToViewer(`Erro ao iniciar o servidor interno na porta ${PORT}: ${err.message}`, 'error');
        dialog.showErrorBox("Erro de Servidor", `Não foi possível iniciar o servidor na porta ${PORT}. Verifique se a porta está em uso.\n\nDetalhes: ${err.message}`);
        app.quit();
        process.exit(1);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('window-all-closed', async () => { // Adicionado async
    sendLogToViewer('Todas as janelas foram fechadas.');
    if (process.platform !== 'darwin') {
        const baileySock = baileysService.getSocket ? baileysService.getSocket() : null;
        if (baileySock && typeof baileySock.logout === 'function') {
            sendLogToViewer('Desconectando Baileys...');
            try {
                await baileySock.logout();
                sendLogToViewer('Baileys desconectado com sucesso.');
            } catch (e) {
                sendLogToViewer(`Erro ao desconectar Baileys: ${e.message}`, 'error');
            }
        } else {
            sendLogToViewer('Baileys socket não disponível ou logout não é função.', 'info');
        }
        
        try {
            await sqliteService.close(); // Fecha a conexão SQLite
        } catch (dbCloseError) {
            sendLogToViewer(`Erro ao fechar conexão SQLite: ${dbCloseError.message}`, 'error');
        }

        sendLogToViewer('Encerrando aplicação.');
        app.quit();
    }
});

// ... (IPC handlers e process error handlers permanecem os mesmos que em electronMain_js_v4) ...
ipcMain.on('navigate', (event, receivedPayload) => {
    sendLogToViewer(`[IPC Navigate] Payload recebido: ${JSON.stringify(receivedPayload)}`, 'debug');
    const { targetPage, agentInfo, adminInfo } = receivedPayload;
    sendLogToViewer(`[IPC Navigate] Tentando navegar para: '${targetPage}'. AgentInfo: ${JSON.stringify(agentInfo)}. AdminInfo: ${JSON.stringify(adminInfo)}.`, 'info');

    if (mainWindow && !mainWindow.isDestroyed() && targetPage !== 'login') {
        mainWindow.close();
        mainWindow = null;
    }
    if (targetPage !== 'chat') {
        Object.values(chatWindows).forEach(win => {
            if (win && !win.isDestroyed()) win.close();
        });
        chatWindows = {};
    }
    if (targetPage !== 'admin' && adminWindow && !adminWindow.isDestroyed()) {
        adminWindow.close();
        adminWindow = null;
    }

    if (targetPage === 'chat' && agentInfo && agentInfo.agent) {
        createChatWindow(agentInfo);
    } else if (targetPage === 'admin' && adminInfo && typeof adminInfo === 'object' && typeof adminInfo.name !== 'undefined') {
        createAdminWindow(adminInfo);
    } else if (targetPage === 'login') {
        createMainWindow();
    } else if (targetPage === 'logs') {
        createLogsWindow();
    } else {
        sendLogToViewer(`[IPC Navigate] Falha na navegação: Página '${targetPage}' desconhecida ou informações insuficientes. AdminInfo: ${JSON.stringify(adminInfo)}, AgentInfo: ${JSON.stringify(agentInfo)}`, 'warn');
        if (!mainWindow || (mainWindow && mainWindow.isDestroyed())) {
            if (targetPage !== 'login') {
                 sendLogToViewer(`[IPC Navigate] Nenhuma janela principal ativa após falha de navegação para '${targetPage}'. Reabrindo janela de login.`, 'warn');
                 createMainWindow();
            }
        }
    }
});

ipcMain.on('open-dev-tools', (event) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && !focusedWindow.isDestroyed()) {
        focusedWindow.webContents.openDevTools();
        sendLogToViewer(`DevTools aberto para a janela: ${focusedWindow.title}`, 'info');
    } else {
        sendLogToViewer('Nenhuma janela focada para abrir DevTools.', 'warn');
    }
});

ipcMain.on('request-initial-logs', (event) => {
    sendLogToViewer('Janela de logs solicitou logs iniciais (enviando buffer se implementado).', 'debug');
});

ipcMain.on('close-app', () => {
    sendLogToViewer('[IPC close-app] Solicitação para fechar a aplicação recebida.', 'info');
    app.quit();
});

process.on('uncaughtException', (error, origin) => {
    const errorMessage = `Exceção não capturada no processo principal: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`;
    console.error(errorMessage);
    sendLogToViewer(errorMessage, 'error');
    try {
        if (app.isReady()) {
            dialog.showErrorBox("Erro Inesperado no Processo Principal", `Ocorreu um erro crítico não tratado. Detalhes: ${error.message}`);
        }
    } catch (e) { /* ignore */ }
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMessage = `Rejeição de promessa não tratada no processo principal: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : 'N/A'}`;
    console.error(errorMessage);
    sendLogToViewer(errorMessage, 'error');
});
