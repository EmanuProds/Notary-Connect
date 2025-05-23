// electronMain.js
const path = require("path");
const httpServer = require("http");
const express = require("express");
const fs = require("fs");
const os = require("os"); // Para obter informações de rede
const pjson = require('./package.json'); // Carrega o package.json

// Verifica se está rodando no ambiente Electron
const IS_ELECTRON_ENV = !!process.versions.electron;

// Módulos do Electron são carregados condicionalmente
let app, BrowserWindow, ipcMain, dialog, Menu, session, shell, nativeTheme, Tray, nativeImage;
if (IS_ELECTRON_ENV) {
    ({ app, BrowserWindow, ipcMain, dialog, Menu, session, shell, nativeTheme, Tray, nativeImage } = require("electron"));
}

// Serviços SQLite
let sqliteMainService;
let sqliteAdminService;
let sqliteChatService;

// Outros serviços e módulos de rota
let whatsappService;
let websocketService;
let authRoutesModule;
let adminRoutesModule;
let chatRoutesModule;

const PORT = process.env.ELECTRON_PORT || 3000;
// IS_SERVER_ONLY_MODE é true se rodando com 'node electronMain.js'
const IS_SERVER_ONLY_MODE = !IS_ELECTRON_ENV;

// Variáveis para gerenciar as janelas da aplicação (relevantes apenas no Electron)
let logsWindow;
let tray = null;

const MAX_LOG_BUFFER_SIZE = 500;
const logBuffer = [];

/**
 * Registra uma mensagem de log.
 */
function sendLogToViewer(logString, level = "info", isClosingLog = false) {
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const formattedLog = `[${timestamp}] [${level.toUpperCase()}] ${logString}`;

  logBuffer.push(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();

  switch (level) {
    case "error": console.error(formattedLog); break;
    case "warn": console.warn(formattedLog); break;
    case "debug": console.debug(formattedLog); break;
    default: console.log(formattedLog);
  }

  if (IS_ELECTRON_ENV && logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
    try {
      logsWindow.webContents.send("log-data", formattedLog);
    } catch (e) {
      console.error(`[sendLogToViewer] Falha ao enviar log para logsWindow: ${e.message}`);
    }
  }
}

// Carregamento inicial de módulos de backend (independente do Electron)
try {
  sendLogToViewer("[MainProcess] Iniciando carregamento dos módulos de backend...", "debug");
  sqliteMainService = require("./backend/services/sqliteMain.js");
  sqliteAdminService = require("./backend/services/sqliteAdmin.js");
  sqliteChatService = require("./backend/services/sqliteChat.js");
  whatsappService = require("./backend/services/whatsappService");
  websocketService = require("./backend/services/websocketService");
  authRoutesModule = require("./backend/routes/authRoutes");
  adminRoutesModule = require("./backend/routes/adminRoutes");
  chatRoutesModule = require("./backend/routes/chatRoutes");
  sendLogToViewer("[MainProcess] Módulos de backend carregados.", "debug");
  if (!sqliteMainService || !sqliteAdminService || !sqliteChatService || !whatsappService || !websocketService ||
    typeof authRoutesModule !== 'function' || typeof adminRoutesModule !== 'function' || typeof chatRoutesModule !== 'function') {
    throw new Error("Um ou mais módulos de backend ou suas exportações essenciais não foram encontrados ou não são funções.");
  }
  sendLogToViewer("[MainProcess] Verificação de exportações dos módulos de backend OK.", "debug");
} catch (e) {
  sendLogToViewer(`Erro CRÍTICO ao carregar módulos de backend: ${e.message}\n${e.stack}`, "error");
  if (IS_ELECTRON_ENV && app && app.isReady()) { 
      dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos. Detalhes: ${e.message}`);
  } else {
      console.error(`Erro de Módulo Crítico: Não foi possível carregar módulos. Detalhes: ${e.message}`);
  }
  if (IS_ELECTRON_ENV && app) app.quit(); else process.exit(1);
}

/**
 * Cria a janela de Logs (apenas no Electron).
 */
function createLogsWindow() {
  if (!IS_ELECTRON_ENV) {
    sendLogToViewer("[createLogsWindow] Ignorando criação da janela de logs (não está no ambiente Electron).", "warn");
    return;
  }
  sendLogToViewer("[createLogsWindow] Tentando criar ou focar janela de logs.", "debug");
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.show();
    logsWindow.focus();
    return;
  }
  logsWindow = new BrowserWindow({
    width: 900, height: 650, title: "Logs do Sistema - Notary Connect",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: app ? !app.isPackaged : true 
    },
    icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"),
    show: false,
  });
  const logsUrl = `http://localhost:${PORT}/logsViewer.html`;
  logsWindow.loadURL(logsUrl);

  logsWindow.webContents.once("did-finish-load", () => {
    if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
      try {
        logsWindow.webContents.send("initial-logs-data", logBuffer);
        if (nativeTheme) logsWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      } catch (e) { sendLogToViewer(`[createLogsWindow] Falha ao enviar dados/tema para logsWindow: ${e.message}`, "warn"); }
    }
  });

  if (nativeTheme) {
      nativeTheme.on('updated', () => {
        if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
            try { logsWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
            catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para logsWindow: ${e.message}`, "warn"); }
        }
      });
  }

  logsWindow.once('ready-to-show', () => { if(logsWindow && !logsWindow.isDestroyed()) logsWindow.show(); });
  logsWindow.on("closed", () => {
    sendLogToViewer("[createLogsWindow] Janela de logs fechada.", "debug", true);
    logsWindow = null;
  });
  sendLogToViewer("[createLogsWindow] Janela de logs criada.", "info");
}

/**
 * Cria o ícone da bandeja do sistema (apenas no Electron).
 */
function createTray() {
  if (!IS_ELECTRON_ENV) {
    sendLogToViewer("[createTray] Ignorando criação do tray (não está no ambiente Electron).", "warn");
    return;
  }
  const iconName = process.platform === 'win32' ? "logo.ico" : (process.platform === 'darwin' ? "logo_tray_mac.png" : "logo_tray.png");
  const iconPath = path.join(__dirname, "frontend/web/img/icons", iconName);
  let appIcon;

  try {
    appIcon = nativeImage.createFromPath(iconPath);
    if (appIcon.isEmpty()) {
        sendLogToViewer(`[createTray] Ícone em ${iconPath} está vazio ou não pôde ser carregado. Verifique o caminho e o arquivo. Usando ícone de fallback.`, "warn");
        const fallbackIconPath = path.join(__dirname, "frontend/web/img/icons", "logo_tray.png"); 
        appIcon = nativeImage.createFromPath(fallbackIconPath);
        if (appIcon.isEmpty()) { 
            sendLogToViewer(`[createTray] Ícone de fallback também falhou. Usando ícone vazio.`, "error");
            appIcon = nativeImage.createEmpty();
        }
    }
  } catch (e) {
      sendLogToViewer(`[createTray] Erro ao criar nativeImage de ${iconPath}: ${e.message}. Usando ícone vazio.`, "error");
      appIcon = nativeImage.createEmpty();
  }

  tray = new Tray(appIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Notary Connect (Web)',
      click: () => {
        sendLogToViewer("[TrayMenu] Opção 'Abrir' clicada. Abrindo index.html (novo menu) no navegador padrão.", "info");
        shell.openExternal(`http://localhost:${PORT}/index.html`);
      }
    },
    {
      label: 'Ver Logs',
      click: () => {
        sendLogToViewer("[TrayMenu] Opção 'Logs' clicada.", "info");
        createLogsWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        sendLogToViewer("[TrayMenu] Opção 'Sair' clicada. Encerrando aplicação.", "info");
        if (app) app.quit();
      }
    }
  ]);

  tray.setToolTip('Notary Connect');
  tray.setContextMenu(contextMenu);
  sendLogToViewer("[createTray] Ícone da bandeja do sistema e menu de contexto criados.", "info");
}

/**
 * Inicializa os bancos de dados.
 */
async function initializeDatabases() {
  sendLogToViewer("[initializeDatabases] Iniciando inicialização dos bancos de dados SQLite.", "info");
  try {
    if (sqliteMainService && typeof sqliteMainService.connect === "function") {
      await sqliteMainService.connect();
      if(typeof sqliteMainService.createTablesIfNotExists === 'function') await sqliteMainService.createTablesIfNotExists();
      if(typeof sqliteMainService.initializeDefaultConfigs === 'function') await sqliteMainService.initializeDefaultConfigs();
    } else { throw new Error("sqliteMainService não configurado."); }

    if (sqliteAdminService && typeof sqliteAdminService.connect === "function") {
      await sqliteAdminService.connect();
      if(typeof sqliteAdminService.createTablesIfNotExists === 'function') await sqliteAdminService.createTablesIfNotExists();
      if(typeof sqliteAdminService.initializeDefaultUsers === 'function') await sqliteAdminService.initializeDefaultUsers();
    } else { throw new Error("sqliteAdminService não configurado."); }

    if (sqliteChatService && typeof sqliteChatService.connect === "function") {
      await sqliteChatService.connect();
      if(typeof sqliteChatService.createTablesIfNotExists === 'function') await sqliteChatService.createTablesIfNotExists();
      if (typeof sqliteChatService.setAdminService === 'function' && sqliteAdminService) {
        sqliteChatService.setAdminService(sqliteAdminService);
      }
    } else { throw new Error("sqliteChatService não configurado."); }
    sendLogToViewer("[initializeDatabases] Bancos de dados SQLite inicializados.", "info");
  } catch (dbError) {
    sendLogToViewer(`[initializeDatabases] Erro CRÍTICO ao inicializar bancos de dados: ${dbError.message}\n${dbError.stack}`, "error");
    if (IS_ELECTRON_ENV && app && dialog && app.isReady()) {
        dialog.showErrorBox("Erro de Banco de Dados", `Não foi possível inicializar os bancos de dados. Detalhes: ${dbError.message}`);
    } else {
        console.error(`Erro de Banco de Dados: Não foi possível inicializar os bancos de dados. Detalhes: ${dbError.message}`);
    }
    if (IS_ELECTRON_ENV && app) app.quit(); else process.exit(1);
  }
}

/**
 * Função principal para iniciar o backend e o servidor HTTP.
 */
async function startBackendAndServices() {
    sendLogToViewer("[startBackendAndServices] Iniciando configuração do backend e servidor HTTP...", "info");

    if (sqliteMainService) sqliteMainService.setLogger(sendLogToViewer);
    if (sqliteAdminService) sqliteAdminService.setLogger(sendLogToViewer);
    if (sqliteChatService) sqliteChatService.setLogger(sendLogToViewer);

    await initializeDatabases();

    const expressApp = express();
    expressApp.use(express.json()); 

    const uploadsPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
    expressApp.use('/uploads', express.static(uploadsPath));

    const staticPath = path.join(__dirname, "frontend/web");
    expressApp.use(express.static(staticPath));
    
    // Adiciona rota para servir o package.json se não estiver no Electron (para o fallback do frontend)
    if (IS_SERVER_ONLY_MODE) {
        const packageJsonPath = path.join(__dirname, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            expressApp.get('/package.json', (req, res) => {
                res.sendFile(packageJsonPath);
            });
            sendLogToViewer("[startBackendAndServices] Rota /package.json configurada para modo servidor.", "info");
        } else {
            sendLogToViewer("[startBackendAndServices] package.json não encontrado na raiz para servir via HTTP.", "warn");
        }
    }


    const authRouter = authRoutesModule(sqliteAdminService, sendLogToViewer);
    expressApp.use("/api/auth", authRouter);
    const adminRouter = adminRoutesModule(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogToViewer);
    expressApp.use("/api/admin", adminRouter);
    const chatRouter = chatRoutesModule(sendLogToViewer);
    expressApp.use("/api/chat", chatRouter);

    expressApp.get("/", (req, res) => res.sendFile(path.join(staticPath, "index.html"))); 
    expressApp.get("/index.html", (req, res) => res.sendFile(path.join(staticPath, "index.html"))); 
    expressApp.get("/login.html", (req, res) => res.sendFile(path.join(staticPath, "login.html"))); 
    expressApp.get("/chat.html", (req, res) => res.sendFile(path.join(staticPath, "chat.html")));
    expressApp.get("/admin.html", (req, res) => res.sendFile(path.join(staticPath, "admin.html")));
    expressApp.get("/logsViewer.html", (req, res) => res.sendFile(path.join(staticPath, "logsViewer.html")));

    const internalServer = httpServer.createServer(expressApp);
    const dbServices = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };

    if (websocketService && whatsappService && dbServices.main && dbServices.admin && dbServices.chat) {
        websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, whatsappService, dbServices);
    } else {
        sendLogToViewer("[startBackendAndServices] Falha ao inicializar WebSocket: serviços críticos não definidos.", "error");
    }

    try {
        if (whatsappService && websocketService && dbServices.main && dbServices.admin && dbServices.chat) {
            const appUserDataPath = IS_ELECTRON_ENV && app ? app.getPath("userData") : path.join(os.homedir(), '.notary-connect-server-data');
            if (!fs.existsSync(appUserDataPath)) {
                fs.mkdirSync(appUserDataPath, { recursive: true });
                sendLogToViewer(`[startBackendAndServices] Diretório de dados do usuário/servidor criado em: ${appUserDataPath}`, "info");
            }
            await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServices, appUserDataPath);
        } else {
            sendLogToViewer("[startBackendAndServices] Falha ao iniciar WhatsApp Service: serviços não definidos.", "error");
        }
    } catch (err) {
        sendLogToViewer(`[startBackendAndServices] Falha CRÍTICA ao iniciar WhatsApp Service: ${err.message}. Stack: ${err.stack}`, "error");
    }

    return new Promise((resolve, reject) => {
        internalServer.listen(PORT, '0.0.0.0', () => { 
            const networkInterfaces = os.networkInterfaces();
            let serverAddressInfo = `Servidor interno rodando em:\n`;
            for (const netInterface in networkInterfaces) {
                if (networkInterfaces[netInterface]) {
                    networkInterfaces[netInterface].forEach(details => {
                        if (details.family === 'IPv4') {
                            serverAddressInfo += `  - Interface ${netInterface}: http://${details.address}:${PORT}\n`;
                        }
                    });
                }
            }
            serverAddressInfo += `  - Acesso via localhost: http://localhost:${PORT}`;
            sendLogToViewer(`[startBackendAndServices] ${serverAddressInfo}`, "info");
            resolve(internalServer); 
        }).on("error", (err) => {
            sendLogToViewer(`[startBackendAndServices] Erro ao iniciar servidor interno: ${err.message}`, "error", true);
            if (IS_ELECTRON_ENV && dialog && app && app.isReady()) {
                dialog.showErrorBox("Erro de Servidor", `Não foi possível iniciar o servidor. Detalhes: ${err.message}`);
            } else {
                 console.error(`Erro de Servidor: Não foi possível iniciar o servidor. Detalhes: ${err.message}`);
            }
            reject(err); 
            if (IS_ELECTRON_ENV && app) app.quit(); else process.exit(1);
        });
    });
}


// --- Lógica de Inicialização Principal ---
if (IS_ELECTRON_ENV) {
    // Código que roda SOMENTE quando executado pelo Electron
    app.whenReady().then(async () => {
        sendLogToViewer("[AppReady] Evento 'whenReady' disparado. Ambiente Electron.", "info");

        if (app.isPackaged) {
            app.dock?.hide(); 
        }

        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; connect-src 'self' ws://localhost:${PORT} wss://localhost:${PORT}; img-src 'self' data: blob: https://* https://placehold.co; object-src 'none'; frame-ancestors 'none';`
                    ]
                }
            });
        });

        Menu.setApplicationMenu(null); 

        try {
            await startBackendAndServices(); 
            createTray(); 
            sendLogToViewer("[AppReady] Backend e Tray inicializados no ambiente Electron.", "info");
        } catch (error) {
            sendLogToViewer(`[AppReady] Erro fatal durante a inicialização no Electron: ${error.message}`, "error");
            dialog.showErrorBox("Erro de Inicialização", `Falha ao iniciar o Notary Connect: ${error.message}`);
            app.quit();
        }
    });

    app.on('before-quit', async (event) => {
      sendLogToViewer("[AppBeforeQuit] Evento 'before-quit'.", "info");
      app.isQuitting = true; 
      const cleanupPromises = [];
      try {
        if (whatsappService && typeof whatsappService.getClient === "function") {
          const whatsClient = whatsappService.getClient();
          if (whatsClient) {
            let state;
            if (typeof whatsClient.getState === 'function') {
                try { state = await whatsClient.getState(); } catch(e) { state = null; }
            }
            if (state === 'CONNECTED' && typeof whatsClient.logout === 'function') {
              cleanupPromises.push(whatsClient.logout().then(() => sendLogToViewer("[AppBeforeQuit] Logout WhatsApp OK.", "info")).catch(e => sendLogToViewer(`[AppBeforeQuit] Erro no logout do WhatsApp: ${e.message}`, "error")));
            } else if (typeof whatsClient.destroy === 'function') {
              cleanupPromises.push(whatsClient.destroy().then(() => sendLogToViewer("[AppBeforeQuit] Destroy WhatsApp OK.", "info")).catch(e => sendLogToViewer(`[AppBeforeQuit] Erro no destroy do WhatsApp: ${e.message}`, "error")));
            }
          }
        }
      } catch (e) { sendLogToViewer(`[AppBeforeQuit] Exceção no cleanup do WhatsApp: ${e.message}`, "error"); }

      try {
        if (sqliteMainService) cleanupPromises.push(sqliteMainService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Main fechado.", "info")).catch(e => sendLogToViewer(`[AppBeforeQuit] Erro ao fechar DB Main: ${e.message}`, "error")));
        if (sqliteAdminService) cleanupPromises.push(sqliteAdminService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Admin fechado.", "info")).catch(e => sendLogToViewer(`[AppBeforeQuit] Erro ao fechar DB Admin: ${e.message}`, "error")));
        if (sqliteChatService) cleanupPromises.push(sqliteChatService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Chat fechado.", "info")).catch(e => sendLogToViewer(`[AppBeforeQuit] Erro ao fechar DB Chat: ${e.message}`, "error")));
      } catch (dbCloseError) { sendLogToViewer(`[AppBeforeQuit] Exceção ao preparar fechamento dos DBs: ${dbCloseError.message}`, "error"); }

      if (cleanupPromises.length > 0) {
        event.preventDefault(); 
        sendLogToViewer("[AppBeforeQuit] Aguardando finalização de processos de cleanup...", "info");
        Promise.allSettled(cleanupPromises)
            .then(() => {
                sendLogToViewer("[AppBeforeQuit] Cleanup concluído. Encerrando aplicação.", "info");
                app.exit(); 
            })
            .catch(err => {
                sendLogToViewer(`[AppBeforeQuit] Erro durante Promise.allSettled no cleanup: ${err.message}`, "error");
                app.exit(); 
            });
      } else {
        sendLogToViewer("[AppBeforeQuit] Nenhum processo de cleanup pendente. Encerrando aplicação.", "info");
      }
    });

    app.on("window-all-closed", () => {
      if (app.isQuitting) return;
      sendLogToViewer("[WindowAllClosed] Todas as janelas Electron fechadas, mas a aplicação (servidor e tray) continua rodando.", "info");
    });

    // IPC Handlers específicos do Electron
    ipcMain.on("control-bot", async (event, data) => {
        const { action } = data;
        const currentSessionId = whatsappService?.sessionId || "whatsapp-bot-session";
        sendLogToViewer(`[IPC control-bot] Ação: '${action}' para sessão: '${currentSessionId}'`, "info");
        if (!whatsappService || !websocketService) {
            sendLogToViewer(`[IPC control-bot] Serviços não disponíveis para ação '${action}'.`, "warn");
            return;
        }
        try {
            if (action === "pause") await whatsappService.togglePauseBot();
            else if (action === "restart") {
                await whatsappService.fullLogoutAndCleanup();
                const appUserDataPath = app.getPath("userData"); 
                const dbServicesForRestart = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };
                await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServicesForRestart, appUserDataPath);
            }
        } catch (error) {
            sendLogToViewer(`[IPC control-bot] Erro ao executar ação '${action}': ${error.message}`, "error");
        }
    });

    ipcMain.on("open-dev-tools", (event) => {
        const senderWebContents = event.sender;
        if (senderWebContents && !senderWebContents.isDestroyed()) {
            const windowInstance = BrowserWindow.fromWebContents(senderWebContents);
            if (windowInstance && !windowInstance.isDestroyed()) {
                if (!windowInstance.isFocused()) windowInstance.focus();
                windowInstance.webContents.openDevTools({ mode: 'detach' });
            }
        }
    });

    ipcMain.on("request-initial-logs", (event) => {
        if (event.sender && !event.sender.isDestroyed()) {
            try { event.sender.send("initial-logs-data", logBuffer); }
            catch(e) { sendLogToViewer(`[IPC request-initial-logs] Erro ao enviar logs: ${e.message}`, "error"); }
        }
    });

    ipcMain.on("close-app", () => {
        sendLogToViewer("[IPC close-app] Solicitação de fechamento da aplicação recebida via IPC.", "info");
        app.quit();
    });

    ipcMain.on('restart-app', () => {
        sendLogToViewer("[IPC restart-app] Solicitação de reinício da aplicação recebida via IPC.", "info");
        app.relaunch();
        app.quit();
    });

    ipcMain.on('open-external-link', (event, url) => {
        sendLogToViewer(`[IPC open-external-link] Abrindo URL externa: ${url}`, "info");
        shell.openExternal(url);
    });

    ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
    ipcMain.handle('get-logs', () => logBuffer.join('\n'));
    ipcMain.handle('clear-logs', () => { logBuffer.length = 0; sendLogToViewer('Buffer de logs limpo.', "info", true); return 'Logs limpos.'; });
    
    // Manipulador IPC para obter informações do aplicativo
    ipcMain.handle('get-app-info', () => {
        sendLogToViewer("[IPC get-app-info] Informações do aplicativo solicitadas.", "debug");
        try {
            // pjson já está carregado no escopo global deste script
            if (pjson && pjson.version && pjson.name) {
                return { version: pjson.version, name: pjson.name };
            } else {
                sendLogToViewer("[IPC get-app-info] pjson.version ou pjson.name não definidos.", "warn");
                return { version: 'N/D', name: 'Notary Connect' }; // Fallback
            }
        } catch (error) {
            sendLogToViewer(`[IPC get-app-info] Erro ao ler package.json: ${error.message}`, "error");
            return { version: 'N/D', name: 'Notary Connect' }; // Fallback em caso de erro
        }
    });
    sendLogToViewer("[MainProcess] Manipulador IPC 'get-app-info' registrado.", "info");


    ipcMain.handle('get-system-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

    ipcMain.on('open-login-for-target', (event, { targetPage }) => {
      sendLogToViewer(`[IPC open-login-for-target] (Electron Env) Recebido para ${targetPage}. Fluxo de login deve ocorrer via web.`, "info");
    });

    ipcMain.on("navigate", (event, receivedPayload) => {
      const { targetPage } = receivedPayload;
      sendLogToViewer(`[IPC Navigate] (Electron Env) Recebido para ${targetPage}.`, "info");
      if (targetPage === "logs") {
        createLogsWindow();
      } else if (targetPage === "menu") { 
        shell.openExternal(`http://localhost:${PORT}/index.html`);
      }
    });

} else {
    // Código que roda quando executado com `node electronMain.js` (IS_SERVER_ONLY_MODE = true)
    sendLogToViewer("[NodeEnv] Rodando em modo Node.js puro (servidor headless).", "info");
    startBackendAndServices().catch(err => {
        sendLogToViewer(`[NodeEnv] Erro fatal ao iniciar backend em modo Node.js: ${err.message}`, "error");
        process.exit(1);
    });
}

// Handlers de processo globais (para ambos os modos)
process.on("uncaughtException", (error, origin) => {
    const msg = `Exceção NÃO CAPTURADA: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`;
    sendLogToViewer(msg, "error");
    try {
        if (IS_ELECTRON_ENV && app && dialog && app.isReady && !app.isQuitting) { 
            dialog.showErrorBox("Erro Inesperado", `Erro: ${error.message}`);
        }
    } catch(e){
        console.error("Erro ao mostrar dialog de exceção não capturada:", e);
    }
});
process.on("unhandledRejection", (reason, promise) => {
    const msg = `Rejeição de Promessa NÃO TRATADA: ${reason instanceof Error ? reason.message : String(reason)}\nStack: ${reason instanceof Error ? reason.stack : "N/A"}`;
    sendLogToViewer(msg, "error");
});
