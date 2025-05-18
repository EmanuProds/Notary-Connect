// electronMain.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path =require('path');
const httpServer = require('http');
const express = require('express');

// Serviços de backend
let firebirdService;
let baileysService;
let websocketService;
let authRoutesModule;

const PORT = process.env.ELECTRON_PORT || 3000;

let mainWindow;
let chatWindows = {}; // Objeto para armazenar janelas de chat por agentId
let adminWindow;
let logsWindow;

// Função de log centralizada
function sendLogToViewer(logString, level = 'info') {
    const formattedLog = `[${level.toUpperCase()}] ${new Date().toISOString()} - ${logString}`;
    if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.webContents.send('log-data', formattedLog);
    }
    // Logar no console principal também
    if (level === 'error') console.error(formattedLog);
    else if (level === 'warn') console.warn(formattedLog);
    else console.log(formattedLog);
}

// Carregamento seguro dos módulos de backend
try {
    firebirdService = require('./backend/services/firebirdService');
    baileysService = require('./backend/services/baileysService');
    websocketService = require('./backend/services/websocketService');
    authRoutesModule = require('./backend/routes/authRoutes'); // authRoutes.router e authRoutes.setLogger

    if (!firebirdService || !baileysService || !websocketService || !authRoutesModule || !authRoutesModule.router || !authRoutesModule.setLogger) {
        throw new Error("Um ou mais módulos de backend ou suas exportações essenciais (router, setLogger) não foram encontrados.");
    }
} catch (e) {
    console.error("Erro CRÍTICO ao carregar módulos de backend:", e);
    // Tenta mostrar um diálogo de erro antes de sair, se o app estiver pronto
    if (app.isReady()) {
        dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos de backend. A aplicação será encerrada. Detalhes: ${e.message}`);
    } else {
        // Se o app não estiver pronto, o diálogo pode não funcionar, logar e sair
        console.error("App não está pronto, saindo devido a erro de módulo.");
    }
    app.quit();
    process.exit(1); // Força a saída se app.quit() não funcionar imediatamente
}


function createMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return;
    }
    mainWindow = new BrowserWindow({
        width: 450, // Mais apropriado para uma tela de login
        height: 700, // Aumentado para acomodar o botão fechar
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'frontend/web/img/icons/logo.png'), // Ou .ico para Windows
        transparent: true,
        frame: false,
        resizable: false,
        show: false // Não mostrar a janela imediatamente
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.loadURL(`http://localhost:${PORT}/index.html`);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    sendLogToViewer('Janela de login transparente e sem moldura criada e carregada.');
}

function createChatWindow(agentInfo) {
    const agentId = agentInfo.agent; // ID do atendente
    const agentName = agentInfo.name || agentId; // Nome do atendente

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
        // A barra de menu padrão aparecerá aqui, a menos que autoHideMenuBar: true ou setMenuBarVisibility(false) seja usado
    });
    // Passa agentId e agentName como query parameters
    newChatWindow.loadURL(`http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`);
    // newChatWindow.webContents.openDevTools();

    newChatWindow.on('closed', () => {
        delete chatWindows[agentId];
        sendLogToViewer(`Janela de chat para o atendente ${agentName} (${agentId}) fechada.`);
    });
    chatWindows[agentId] = newChatWindow;
    sendLogToViewer(`Janela de chat criada para o atendente: ${agentName} (${agentId})`);
}

function createAdminWindow(adminInfo) {
    // Adiciona verificação para adminInfo e adminInfo.name
    if (!adminInfo || typeof adminInfo.name === 'undefined') {
        sendLogToViewer(`[createAdminWindow] Erro: adminInfo inválido ou sem nome. adminInfo: ${JSON.stringify(adminInfo)}`, 'error');
        // Poderia abrir a janela de login novamente ou mostrar um erro
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
    // adminWindow.webContents.openDevTools();

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
    // logsWindow.webContents.openDevTools();
    logsWindow.on('closed', () => {
        logsWindow = null;
    });
    // Não logar aqui para evitar loop, já que o próprio sendLogToViewer envia para esta janela
    console.log("Janela de logs criada.");
}

// Configuração do Menu da Aplicação
function setupMenu() {
    const template = [
        {
            label: 'Arquivo',
            submenu: [
                {
                    label: 'Ver Logs',
                    click: () => createLogsWindow()
                },
                {
                    label: 'Recarregar Janela',
                    role: 'reload' // Papel padrão do Electron
                },
                {
                    label: 'Forçar Recarregamento',
                    role: 'forceReload' // Papel padrão do Electron
                },
                {
                    label: 'Alternar Ferramentas de Desenvolvedor',
                    role: 'toggleDevTools' // Papel padrão do Electron
                },
                { type: 'separator' },
                {
                    label: 'Sair',
                    role: 'quit' // Papel padrão do Electron
                }
            ]
        },
        {
            label: 'Editar', // Menu de edição padrão
            role: 'editMenu'
        }
        // Adicionar mais menus conforme necessário (Janela, Ajuda, etc.)
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}


app.whenReady().then(async () => {
    // Injetar o logger nos módulos que precisam dele
    firebirdService.setLogger(sendLogToViewer);
    authRoutesModule.setLogger(sendLogToViewer);
    // baileysService e websocketService recebem o logger em suas funções de inicialização

    setupMenu(); // Configura o menu global da aplicação

    const expressApp = express();
    expressApp.use(express.json());
    const staticPath = path.join(__dirname, 'frontend/web');
    expressApp.use(express.static(staticPath));
    expressApp.use('/api/auth', authRoutesModule.router);

    // Rotas diretas para os HTMLs principais (para garantir que sejam servidos corretamente)
    expressApp.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
    expressApp.get('/chat.html', (req, res) => res.sendFile(path.join(staticPath, 'chat.html')));
    expressApp.get('/admin.html', (req, res) => res.sendFile(path.join(staticPath, 'admin.html')));
    expressApp.get('/logsViewer.html', (req, res) => res.sendFile(path.join(staticPath, 'logsViewer.html')));

    const internalServer = httpServer.createServer(expressApp);

    // Inicializa o websocketService, passando a função de log e as instâncias dos serviços
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, baileysService, firebirdService);
    sendLogToViewer('Servidor WebSocket inicializado.');

    try {
        // Inicializa o baileysService, passando a função de log e as instâncias dos serviços
        await baileysService.connectToWhatsApp(sendLogToViewer, websocketService, firebirdService);
        sendLogToViewer("Serviço Baileys iniciado e tentando conectar ao WhatsApp.");
    } catch (err) {
        sendLogToViewer(`Falha CRÍTICA ao iniciar o serviço Baileys: ${err.message}. Verifique a configuração e o banco de dados.`, 'error');
        // Considerar se deve fechar o app ou permitir que o admin tente resolver
    }

    internalServer.listen(PORT, () => {
        sendLogToViewer(`Servidor HTTP e WebSocket interno rodando em http://localhost:${PORT}`);
        createMainWindow(); // Cria a janela de login inicial
        // createLogsWindow(); // Opcional: abrir a janela de logs automaticamente
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

app.on('window-all-closed', () => {
    sendLogToViewer('Todas as janelas foram fechadas.');
    if (process.platform !== 'darwin') { // No macOS, é comum a aplicação continuar rodando
        const baileySock = baileysService.getSocket ? baileysService.getSocket() : null;
        if (baileySock && typeof baileySock.logout === 'function') {
            sendLogToViewer('Desconectando Baileys...');
            baileySock.logout()
                .then(() => sendLogToViewer('Baileys desconectado com sucesso.'))
                .catch(e => sendLogToViewer(`Erro ao desconectar Baileys: ${e.message}`, 'error'))
                .finally(() => {
                    sendLogToViewer('Encerrando aplicação.');
                    app.quit();
                });
        } else {
            sendLogToViewer('Baileys socket não disponível ou logout não é função. Encerrando aplicação.');
            app.quit();
        }
    }
});

ipcMain.on('navigate', (event, receivedPayload) => {
    // Log detalhado do payload recebido para depuração
    sendLogToViewer(`[IPC Navigate] Payload recebido: ${JSON.stringify(receivedPayload)}`, 'debug');

    const { targetPage, agentInfo, adminInfo } = receivedPayload;

    sendLogToViewer(`[IPC Navigate] Tentando navegar para: '${targetPage}'. AgentInfo: ${JSON.stringify(agentInfo)}. AdminInfo: ${JSON.stringify(adminInfo)}.`, 'info');

    // Fecha a janela de login se estiver aberta e não for o destino
    if (mainWindow && !mainWindow.isDestroyed() && targetPage !== 'login') {
        mainWindow.close();
        mainWindow = null;
    }
    // Fecha outras janelas se não forem o destino
    if (targetPage !== 'chat') { // Se navegando para algo que não é chat, fecha janelas de chat
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
    } else if (targetPage === 'admin' && adminInfo && typeof adminInfo === 'object' && typeof adminInfo.name !== 'undefined') { // Verifica se adminInfo é um objeto e tem a propriedade name
        createAdminWindow(adminInfo);
    } else if (targetPage === 'login') {
        // Fecha janelas de admin e chat antes de ir para login
        if (adminWindow && !adminWindow.isDestroyed()) adminWindow.close();
        Object.values(chatWindows).forEach(win => {
            if (win && !win.isDestroyed()) win.close();
        });
        chatWindows = {};
        createMainWindow();
    } else if (targetPage === 'logs') {
        createLogsWindow();
    } else {
        sendLogToViewer(`[IPC Navigate] Falha na navegação: Página '${targetPage}' desconhecida ou informações insuficientes. AdminInfo: ${JSON.stringify(adminInfo)}, AgentInfo: ${JSON.stringify(agentInfo)}`, 'warn');
         // Se a navegação falhar, e a janela de login foi fechada, reabra-a.
        if (!mainWindow || (mainWindow && mainWindow.isDestroyed())) {
            if (targetPage !== 'login') { // Evita loop se o próprio login falhar na navegação
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

// Handler para o evento 'request-initial-logs' (usado pelo logsViewer.html)
ipcMain.on('request-initial-logs', (event) => {
    sendLogToViewer('Janela de logs solicitou logs iniciais (enviando buffer se implementado).', 'debug');
    // Aqui você poderia enviar um buffer de logs recentes se os mantiver em memória.
    // Ex: event.reply('initial-logs-data', logBuffer); // Não implementado neste exemplo
});

// Handler para o evento 'close-app' vindo do renderer (ex: botão Fechar na tela de login)
ipcMain.on('close-app', () => {
    sendLogToViewer('[IPC close-app] Solicitação para fechar a aplicação recebida.', 'info');
    app.quit(); // Isso irá disparar o evento 'window-all-closed' se houver janelas abertas, ou fechar diretamente.
});

// Tratamento de exceções não capturadas no processo principal
process.on('uncaughtException', (error, origin) => {
    const errorMessage = `Exceção não capturada no processo principal: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`;
    console.error(errorMessage);
    sendLogToViewer(errorMessage, 'error');
    // Tenta mostrar um diálogo de erro, mas pode não funcionar se o app estiver muito instável
    try {
        if (app.isReady()) { // Só mostra o diálogo se o app estiver pronto
            dialog.showErrorBox("Erro Inesperado no Processo Principal", "Ocorreu um erro crítico não tratado. A aplicação pode precisar ser reiniciada.\n\nDetalhes: " + error.message);
        }
    } catch (e) {
        // ignore
    }
    // Considerar se deve fechar o app em caso de erro grave não tratado
    // app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMessage = `Rejeição de promessa não tratada no processo principal: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : 'N/A'}`;
    console.error(errorMessage);
    sendLogToViewer(errorMessage, 'error');
});
