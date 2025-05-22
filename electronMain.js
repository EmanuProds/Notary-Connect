const { app, BrowserWindow, ipcMain, dialog, Menu, session, shell, nativeTheme } = require("electron"); // Adicionado nativeTheme
const path = require("path");
const httpServer = require("http");
const express = require("express");
const fs = require("fs");
const pjson = require('./package.json'); // Para buscar nome e versão do app

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

const PORT = process.env.ELECTRON_PORT || 3000; // Porta para o servidor interno

// Variáveis para gerenciar as janelas da aplicação
let mainWindow; // Janela principal (login)
let splashWindow; // Janela do ecrã de splash
let chatWindows = {}; // Objeto para armazenar janelas de chat, indexadas por agentId
let adminWindow; // Janela de administração
let logsWindow; // Janela de visualização de logs
let currentAdminInfo = null; // Informações do administrador logado

const MAX_LOG_BUFFER_SIZE = 500; // Tamanho máximo do buffer de logs em memória
const logBuffer = []; // Buffer para armazenar logs recentes

/**
 * Regista uma mensagem de log, armazena-a num buffer e envia-a para a janela de visualização de logs, se estiver aberta.
 * Também envia a mensagem para a consola do processo principal.
 * @param {string} logString - A mensagem de log.
 * @param {string} [level="info"] - O nível do log (e.g., "info", "error", "warn", "debug").
 * @param {boolean} [isClosingLog=false] - Indica se este log é sobre uma janela a fechar, para evitar IPC para essa janela.
 */
function sendLogToViewer(logString, level = "info", isClosingLog = false) {
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const formattedLog = `[${timestamp}] [${level.toUpperCase()}] ${logString}`;

  // Sempre adiciona ao buffer e ao console
  logBuffer.push(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();

  switch (level) {
    case "error": console.error(formattedLog); break;
    case "warn": console.warn(formattedLog); break;
    case "debug": console.debug(formattedLog); break;
    default: console.log(formattedLog);
  }

  // Enviar para logsWindow se existir e não estiver destruída
  if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
    try {
      logsWindow.webContents.send("log-data", formattedLog);
    } catch (e) {
      // Logar no console se falhar (ex: logsWindow está a fechar)
      console.error(`[sendLogToViewer] Falha ao enviar log para logsWindow: ${e.message}`);
    }
  }

  // Enviar para mainWindow apenas se não for um log sobre o fecho da própria mainWindow
  // e se a mainWindow existir e estiver operacional.
  if (!isClosingLog && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    try {
      mainWindow.webContents.send('log-update', formattedLog);
    } catch (e) {
      console.error(`[sendLogToViewer] Falha ao enviar log para mainWindow: ${e.message}`);
    }
  }
}


// Bloco try-catch para carregamento inicial de módulos críticos
try {
  sendLogToViewer("[ElectronMain] Iniciando carregamento dos módulos de backend...", "debug");
  sqliteMainService = require("./backend/services/sqliteMain.js");
  sqliteAdminService = require("./backend/services/sqliteAdmin.js");
  sqliteChatService = require("./backend/services/sqliteChat.js");

  whatsappService = require("./backend/services/whatsappService");
  websocketService = require("./backend/services/websocketService");
  authRoutesModule = require("./backend/routes/authRoutes");
  adminRoutesModule = require("./backend/routes/adminRoutes");
  chatRoutesModule = require("./backend/routes/chatRoutes");
  sendLogToViewer("[ElectronMain] Módulos de backend carregados.", "debug");

  if (
    !sqliteMainService || !sqliteAdminService || !sqliteChatService ||
    !whatsappService || !websocketService ||
    typeof authRoutesModule !== 'function' ||
    typeof adminRoutesModule !== 'function' ||
    typeof chatRoutesModule !== 'function'
  ) {
    throw new Error("Um ou mais módulos de backend ou suas exportações essenciais não foram encontrados ou não são funções.");
  }
  sendLogToViewer("[ElectronMain] Verificação de exportações dos módulos de backend OK.", "debug");
} catch (e) {
  sendLogToViewer(`Erro CRÍTICO ao carregar módulos de backend: ${e.message}\n${e.stack}`, "error");
  if (app.isReady()) {
    dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos. Detalhes: ${e.message}`);
  }
  if (app && typeof app.quit === 'function') app.quit();
  else process.exit(1);
}

// Função para criar a janela do Ecrã de Splash
function createSplashWindow() {
  sendLogToViewer("[createSplashWindow] Tentando criar a janela de splash.", "debug");
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preloadSplash.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  const splashHtmlPath = path.join(__dirname, 'frontend', 'web', 'splash.html');
  sendLogToViewer(`[createSplashWindow] Carregando HTML do splash: ${splashHtmlPath}`, "debug");
  splashWindow.loadFile(splashHtmlPath);

  splashWindow.webContents.on('did-finish-load', () => {
    sendLogToViewer("[createSplashWindow] Splash window 'did-finish-load'. Enviando informações do app.", "debug");
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('app-info', { version: pjson.version, name: pjson.name });
        splashWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });

  nativeTheme.on('updated', () => {
    if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents && !splashWindow.webContents.isDestroyed()) {
        sendLogToViewer(`[NativeThemeUpdate] Tema do sistema atualizado para splash. Novo tema: ${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`, "debug");
        try {
            splashWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        } catch (e) {
            sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para splash: ${e.message}`, "warn");
        }
    }
  });

  splashWindow.on('closed', () => {
    // Apenas logar no console/arquivo, não tentar IPC para a janela que acabou de fechar.
    const closedMsg = "[createSplashWindow] Janela de splash fechada.";
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
    splashWindow = null;
  });
}


/**
 * Cria a janela principal da aplicação (geralmente o ecrã de login).
 */
function createMainWindow() {
  sendLogToViewer("[createMainWindow] Tentando criar ou focar a janela principal.", "debug");
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendLogToViewer("[createMainWindow] Janela principal já existe. Focando.", "debug");
    mainWindow.focus();
    return;
  }
  sendLogToViewer("[createMainWindow] Criando nova instância da janela principal.", "debug");
  mainWindow = new BrowserWindow({
    width: 450, height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false,
      devTools: true,
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
    transparent: true, frame: false, resizable: false,
    show: false,
    backgroundColor: "#00000000", hasShadow: false, thickFrame: false,
  });

  mainWindow.webContents.on("did-finish-load", () => {
    sendLogToViewer("[createMainWindow] Evento 'did-finish-load' disparado para mainWindow.", "debug");
     if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        try {
            mainWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        } catch (e) {
            sendLogToViewer(`[createMainWindow] Falha ao enviar tema inicial para mainWindow: ${e.message}`, "warn");
        }
    }
  });

  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        sendLogToViewer(`[NativeThemeUpdate] Tema do sistema atualizado para mainWindow. Novo tema: ${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}`, "debug");
        try {
            mainWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        } catch (e) {
            sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para mainWindow: ${e.message}`, "warn");
        }
    }
  });

  mainWindow.once('ready-to-show', () => {
    sendLogToViewer('[createMainWindow] Janela principal pronta para exibir (ready-to-show).', 'debug');
  });


  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    sendLogToViewer(
      `[createMainWindow] Falha ao carregar URL: ${validatedURL}. Código: ${errorCode}. Descrição: ${errorDescription}`,
      "error", true // isClosingLog = true, embora não esteja a fechar, é um erro crítico da janela
    );
    if (mainWindow && !mainWindow.isDestroyed()) { // Esta verificação é redundante se o erro for fatal
      dialog.showErrorBox("Erro de Carregamento", `Não foi possível carregar a página de login: ${errorDescription}`);
    }
  });

  const mainUrl = `http://localhost:${PORT}/index.html`;
  sendLogToViewer(`[createMainWindow] Carregando URL: ${mainUrl}`, "debug");
  mainWindow.loadURL(mainUrl);

  mainWindow.on("closed", () => {
    // Apenas logar no console/arquivo.
    const closedMsg = "[createMainWindow] Janela principal fechada.";
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
    
    mainWindow = null;
  });
  sendLogToViewer("[createMainWindow] Janela de login criada e URL carregada. Aguardando para exibir.", "info");
}

// ... (createChatWindow, createAdminWindow, createLogsWindow, setupMenu, initializeDatabases permanecem os mesmos da versão anterior) ...
// Função createChatWindow (sem alterações significativas para este problema)
function createChatWindow(agentInfo) {
  const agentId = agentInfo.agent;
  const agentName = agentInfo.name || agentId;
  sendLogToViewer(`[createChatWindow] Tentando criar ou focar janela de chat para: ${agentName} (ID: ${agentId})`, "debug");

  if (chatWindows[agentId] && !chatWindows[agentId].isDestroyed()) {
    sendLogToViewer(`[createChatWindow] Janela de chat para ${agentName} já existe. Focando.`, "debug");
    chatWindows[agentId].focus();
    return;
  }
  sendLogToViewer(`[createChatWindow] Criando nova janela de chat para: ${agentName}`, "debug");
  const newChatWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: true,
    },
    title: `Chat - Usuário: ${agentName}`,
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  });

  newChatWindow.webContents.on('did-finish-load', () => {
    if (newChatWindow && !newChatWindow.isDestroyed() && newChatWindow.webContents && !newChatWindow.webContents.isDestroyed()) {
        try {
            newChatWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        } catch (e) {
            sendLogToViewer(`[createChatWindow] Falha ao enviar tema inicial para chatWindow ${agentName}: ${e.message}`, "warn");
        }
    }
  });
  // Não adicionei listener de 'updated' do nativeTheme aqui para simplificar, mas poderia ser feito se necessário.

  newChatWindow.webContents.on('context-menu', (event, params) => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Inspecionar Elemento', click: () => { newChatWindow.webContents.inspectElement(params.x, params.y); }, },
      { type: 'separator' },
      { label: 'Abrir DevTools', click: () => { newChatWindow.webContents.openDevTools({ mode: 'detach' }); }, },
      { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => { newChatWindow.webContents.reload(); } }
    ]);
    contextMenu.popup(newChatWindow);
  });
  sendLogToViewer(`[createChatWindow] Menu de contexto adicionado à janela de chat para ${agentName}.`, "debug");

  const chatUrl = `http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`;
  sendLogToViewer(`[createChatWindow] Carregando URL para ${agentName}: ${chatUrl}`, "debug");
  newChatWindow.loadURL(chatUrl);

  newChatWindow.on("closed", () => {
    const closedMsg = `[createChatWindow] Janela de chat para o usuário ${agentName} (ID: ${agentId}) fechada.`;
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
    delete chatWindows[agentId];
  });
  chatWindows[agentId] = newChatWindow;
  sendLogToViewer(`[createChatWindow] Janela de chat criada e URL carregada para: ${agentName} (ID: ${agentId})`, "info");
}

// Função createAdminWindow (sem alterações significativas para este problema)
function createAdminWindow(adminInfoToUse) {
  sendLogToViewer(`[createAdminWindow] Tentando criar ou focar janela de admin. AdminInfo: ${JSON.stringify(adminInfoToUse)}`, "debug");
  if (!adminInfoToUse || typeof adminInfoToUse.name === "undefined") {
    sendLogToViewer(`[createAdminWindow] Erro: adminInfo inválido. Redirecionando para login.`, "error");
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus(); else createMainWindow();
    return;
  }
  if (adminWindow && !adminWindow.isDestroyed()) {
    sendLogToViewer("[createAdminWindow] Janela de admin já existe. Focando.", "debug");
    adminWindow.focus(); return;
  }
  sendLogToViewer(`[createAdminWindow] Criando nova janela de admin para: ${adminInfoToUse.name}`, "debug");
  adminWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: true,
    },
    title: `Admin - ${adminInfoToUse.name || "Administrador"}`,
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  });
   adminWindow.webContents.on('did-finish-load', () => {
    if (adminWindow && !adminWindow.isDestroyed() && adminWindow.webContents && !adminWindow.webContents.isDestroyed()) {
        try {
            adminWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        } catch (e) {
            sendLogToViewer(`[createAdminWindow] Falha ao enviar tema inicial para adminWindow: ${e.message}`, "warn");
        }
    }
  });

  adminWindow.on("closed", () => {
    const closedMsg = `[createAdminWindow] Janela de admin para ${currentAdminInfo ? currentAdminInfo.name : "N/A"} fechada.`;
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
    adminWindow = null;
  });

  const adminUrl = `http://localhost:${PORT}/admin.html`;
  sendLogToViewer(`[createAdminWindow] Carregando URL de admin: ${adminUrl}`, "debug");
  adminWindow.loadURL(adminUrl);
  currentAdminInfo = adminInfoToUse;
  sendLogToViewer(`[createAdminWindow] Janela de administração criada e URL carregada para: ${adminInfoToUse.name}`, "info");
}

// Função createLogsWindow (sem alterações significativas para este problema)
function createLogsWindow() {
  sendLogToViewer("[createLogsWindow] Tentando criar ou focar janela de logs.", "debug");
  if (logsWindow && !logsWindow.isDestroyed()) {
    sendLogToViewer("[createLogsWindow] Janela de logs já existe. Focando.", "debug");
    logsWindow.focus(); return;
  }
  sendLogToViewer("[createLogsWindow] Criando nova janela de logs.", "debug");
  logsWindow = new BrowserWindow({
    width: 900, height: 650, title: "Logs do Sistema - Notary Connect",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: true,
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  });
  const logsUrl = `http://localhost:${PORT}/logsViewer.html`;
  sendLogToViewer(`[createLogsWindow] Carregando URL de logs: ${logsUrl}`, "debug");
  logsWindow.loadURL(logsUrl);
  logsWindow.webContents.once("did-finish-load", () => {
    sendLogToViewer("[createLogsWindow] Evento 'did-finish-load' disparado para logsWindow.", "debug");
    if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
      try {
        logsWindow.webContents.send("initial-logs-data", logBuffer);
        logsWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      } catch (e) {
        sendLogToViewer(`[createLogsWindow] Falha ao enviar dados/tema para logsWindow: ${e.message}`, "warn");
      }
      sendLogToViewer(`[createLogsWindow] Histórico de ${logBuffer.length} logs enviado para logsWindow.`, "debug");
    }
  });
  logsWindow.on("closed", () => {
    const closedMsg = "[createLogsWindow] Janela de logs fechada.";
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${closedMsg}`);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
    logsWindow = null;
  });
  sendLogToViewer("[createLogsWindow] Janela de logs criada e URL carregada.", "info");
}

// Função setupMenu (sem alterações)
function setupMenu() {
  sendLogToViewer("[setupMenu] Configurando o menu da aplicação.", "debug");
  // Menu.setApplicationMenu(null);
  sendLogToViewer("[setupMenu] Menu da aplicação mantido (padrão do Electron).", "debug");
}

// Função initializeDatabases (sem alterações)
async function initializeDatabases() {
  sendLogToViewer("[initializeDatabases] Iniciando inicialização dos bancos de dados SQLite.", "info");
  try {
    if (sqliteMainService && typeof sqliteMainService.connect === "function") {
      await sqliteMainService.connect();
      sendLogToViewer("[initializeDatabases] sqliteMainService conectado.", "debug");
      if(typeof sqliteMainService.createTablesIfNotExists === 'function') await sqliteMainService.createTablesIfNotExists();
      sendLogToViewer("[initializeDatabases] Tabelas para sqliteMainService verificadas/criadas.", "debug");
      if(typeof sqliteMainService.initializeDefaultConfigs === 'function') await sqliteMainService.initializeDefaultConfigs();
      sendLogToViewer("[initializeDatabases] Configurações padrão para sqliteMainService inicializadas.", "debug");
    } else { throw new Error("sqliteMainService não está configurado ou não possui o método connect()."); }

    if (sqliteAdminService && typeof sqliteAdminService.connect === "function") {
      await sqliteAdminService.connect();
      sendLogToViewer("[initializeDatabases] sqliteAdminService conectado.", "debug");
      if(typeof sqliteAdminService.createTablesIfNotExists === 'function') await sqliteAdminService.createTablesIfNotExists();
      sendLogToViewer("[initializeDatabases] Tabelas para sqliteAdminService verificadas/criadas.", "debug");
      if(typeof sqliteAdminService.initializeDefaultUsers === 'function') await sqliteAdminService.initializeDefaultUsers();
      sendLogToViewer("[initializeDatabases] Usuários padrão para sqliteAdminService inicializados.", "debug");
    } else { throw new Error("sqliteAdminService não está configurado ou não possui o método connect()."); }

    if (sqliteChatService && typeof sqliteChatService.connect === "function") {
      await sqliteChatService.connect();
      sendLogToViewer("[initializeDatabases] sqliteChatService conectado.", "debug");
      if(typeof sqliteChatService.createTablesIfNotExists === 'function') await sqliteChatService.createTablesIfNotExists();
      sendLogToViewer("[initializeDatabases] Tabelas para sqliteChatService verificadas/criadas.", "debug");
      if (typeof sqliteChatService.setAdminService === 'function' && sqliteAdminService) {
        sqliteChatService.setAdminService(sqliteAdminService);
        sendLogToViewer("[initializeDatabases] sqliteAdminService injetado em sqliteChatService.", "debug");
      }
    } else { throw new Error("sqliteChatService não está configurado ou não possui o método connect()."); }

    sendLogToViewer("[initializeDatabases] Todos os bancos de dados SQLite inicializados com sucesso.", "info");
  } catch (dbError) {
    sendLogToViewer(`[initializeDatabases] Erro CRÍTICO durante a inicialização dos bancos de dados SQLite: ${dbError.message}\n${dbError.stack}`, "error");
    dialog.showErrorBox("Erro de Banco de Dados", `Não foi possível inicializar os bancos de dados. Detalhes: ${dbError.message}`);
    app.quit();
    process.exit(1);
  }
}


// Evento 'whenReady' do Electron
app.whenReady().then(async () => {
  sendLogToViewer("[AppReady] Evento 'whenReady' disparado. Aplicação pronta.", "info");
  createSplashWindow();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; connect-src 'self' ws://localhost:${PORT} wss://localhost:${PORT}; img-src 'self' data: https://* https://placehold.co; object-src 'none'; frame-ancestors 'none';`
        ]
      }
    });
  });
  sendLogToViewer("[AppReady] Content Security Policy configurada para a sessão padrão.", "info");

  sendLogToViewer("[AppReady] Injetando logger nos serviços...", "debug");
  if (sqliteMainService && typeof sqliteMainService.setLogger === "function") sqliteMainService.setLogger(sendLogToViewer);
  if (sqliteAdminService && typeof sqliteAdminService.setLogger === "function") sqliteAdminService.setLogger(sendLogToViewer);
  if (sqliteChatService && typeof sqliteChatService.setLogger === "function") sqliteChatService.setLogger(sendLogToViewer);
  sendLogToViewer("[AppReady] Logger injetado nos serviços.", "debug");

  setupMenu();
  await initializeDatabases();

  const expressApp = express();
  expressApp.use(express.json());
  sendLogToViewer("[AppReady] Servidor Express inicializado e configurado para JSON.", "debug");

  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
    sendLogToViewer(`[AppReady] Pasta de uploads criada em: ${uploadsPath}`, "info");
  }
  expressApp.use('/uploads', express.static(uploadsPath));
  sendLogToViewer(`[AppReady] Pasta de uploads servida estaticamente em /uploads. Path: ${uploadsPath}`, "debug");

  const staticPath = path.join(__dirname, "frontend/web");
  expressApp.use(express.static(staticPath));
  sendLogToViewer(`[AppReady] Pasta de arquivos estáticos servida. Path: ${staticPath}`, "debug");

  sendLogToViewer("[AppReady] Configurando rotas da API...", "debug");
  const authRouter = authRoutesModule(sqliteAdminService, sendLogToViewer);
  expressApp.use("/api/auth", authRouter);
  sendLogToViewer("[AppReady] Rotas de autenticação (/api/auth) configuradas.", "debug");

  const adminRouter = adminRoutesModule(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogToViewer);
  expressApp.use("/api/admin", adminRouter);
  sendLogToViewer("[AppReady] Rotas de administração (/api/admin) configuradas.", "debug");

  const chatRouter = chatRoutesModule(sendLogToViewer);
  expressApp.use("/api/chat", chatRouter);
  sendLogToViewer("[AppReady] Rotas de chat (/api/chat) configuradas.", "debug");

  expressApp.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(staticPath, "index.html")));
  expressApp.get("/chat.html", (req, res) => res.sendFile(path.join(staticPath, "chat.html")));
  expressApp.get("/admin.html", (req, res) => res.sendFile(path.join(staticPath, "admin.html")));
  expressApp.get("/logsViewer.html", (req, res) => res.sendFile(path.join(staticPath, "logsViewer.html")));
  expressApp.get("/splash.html", (req, res) => res.sendFile(path.join(staticPath, "splash.html")));
  sendLogToViewer("[AppReady] Rotas GET para arquivos HTML configuradas.", "debug");

  const internalServer = httpServer.createServer(expressApp);
  sendLogToViewer("[AppReady] Servidor HTTP interno criado.", "debug");

  const dbServices = {
    main: sqliteMainService,
    admin: sqliteAdminService,
    chat: sqliteChatService
  };

  if (
    websocketService && typeof websocketService.initializeWebSocketServer === "function" &&
    whatsappService && dbServices.main && dbServices.admin && dbServices.chat
  ) {
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, whatsappService, dbServices);
    sendLogToViewer("[AppReady] Servidor WebSocket inicializado com sucesso.", "info");
  } else {
    sendLogToViewer("[AppReady] Falha ao inicializar o servidor WebSocket: um ou mais serviços críticos não estão definidos.", "error");
  }

  try {
    if (
      whatsappService && typeof whatsappService.connectToWhatsApp === "function" &&
      websocketService && dbServices.main && dbServices.admin && dbServices.chat
    ) {
      const appUserDataPath = app.getPath("userData");
      sendLogToViewer(`[AppReady] Caminho de dados do usuário para WhatsApp Service: ${appUserDataPath}`, "info");
      await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServices, appUserDataPath);
      sendLogToViewer("[AppReady] Serviço WhatsApp (whatsapp-web.js) iniciado e tentando conectar ao WhatsApp.", "info");
    } else {
      sendLogToViewer("[AppReady] Falha ao iniciar WhatsApp Service: um ou mais serviços não estão definidos.", "error");
    }
  } catch (err) {
    sendLogToViewer(`[AppReady] Falha CRÍTICA ao iniciar o serviço WhatsApp: ${err.message}. Stack: ${err.stack}`, "error");
  }

  internalServer
    .listen(PORT, () => {
      sendLogToViewer(`[AppReady] Servidor HTTP e WebSocket interno rodando em http://localhost:${PORT}`, "info");
      createMainWindow();

      const splashProgressBarDuration = 3000;
      const delayAfterProgressBarCompletes = 2000;
      const totalSplashDisplayTime = splashProgressBarDuration + delayAfterProgressBarCompletes;

      sendLogToViewer(`[AppReady] Ecrã de splash será exibido por ${totalSplashDisplayTime}ms. Barra de progresso: ${splashProgressBarDuration}ms, Atraso adicional: ${delayAfterProgressBarCompletes}ms.`, "info");

      setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          sendLogToViewer("[AppReady] Tempo do ecrã de splash esgotado. Fechando splash e mostrando janela principal.", "info");
          splashWindow.close(); // O evento 'closed' do splashWindow tratará de anular splashWindow
        }
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
          sendLogToViewer("[AppReady] Exibindo janela principal.", "info");
          mainWindow.show();
        } else if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()){
            sendLogToViewer("[AppReady] Janela principal já está visível.", "debug");
        } else {
            sendLogToViewer("[AppReady] Janela principal não disponível ou destruída ao tentar exibir após splash.", "warn");
        }
      }, totalSplashDisplayTime);

    })
    .on("error", (err) => {
      sendLogToViewer(`[AppReady] Erro ao iniciar o servidor interno na porta ${PORT}: ${err.message}`, "error", true);
      dialog.showErrorBox("Erro de Servidor",`Não foi possível iniciar o servidor interno. Detalhes: ${err.message}`);
      app.quit(); process.exit(1);
    });

  app.on("activate", () => {
    sendLogToViewer("[AppActivate] Evento 'activate' disparado.", "debug");
    if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) { // Adicionado app.isReady()
      sendLogToViewer("[AppActivate] Nenhuma janela aberta. Recriando splash e janela principal.", "debug");
      createSplashWindow();
      createMainWindow();
    } else if (mainWindow === null && splashWindow === null && app.isReady()) {
        sendLogToViewer("[AppActivate] Nenhuma janela principal ou splash. Recriando.", "debug");
        createSplashWindow();
        createMainWindow();
    }
  });
});

app.on('before-quit', async (event) => {
  sendLogToViewer("[AppBeforeQuit] Evento 'before-quit' disparado. Tentando desligamento gracioso...", "info");
  app.isQuitting = true;
  event.preventDefault();

  try {
    if (whatsappService && typeof whatsappService.getClient === "function") {
      const whatsClient = whatsappService.getClient();
      if (whatsClient) {
        sendLogToViewer("[AppBeforeQuit] Cliente WhatsApp existe. Verificando estado...", "debug");
        let state;
        if (typeof whatsClient.getState === 'function') {
          state = await whatsClient.getState();
          sendLogToViewer(`[AppBeforeQuit] Estado do cliente WhatsApp: ${state}`, "debug");
        }

        if (state === 'CONNECTED' && typeof whatsClient.logout === 'function') {
          sendLogToViewer("[AppBeforeQuit] Cliente conectado. Tentando logout...", "info");
          await whatsClient.logout();
          sendLogToViewer("[AppBeforeQuit] Logout do cliente WhatsApp realizado.", "info");
        } else if (typeof whatsClient.destroy === 'function') {
          sendLogToViewer("[AppBeforeQuit] Cliente não conectado ou logout indisponível. Tentando destroy...", "info");
          await whatsClient.destroy();
          sendLogToViewer("[AppBeforeQuit] Cliente WhatsApp destruído.", "info");
        }
      } else {
        sendLogToViewer("[AppBeforeQuit] Instância do cliente WhatsApp não encontrada.", "warn");
      }
    }
  } catch (e) {
    sendLogToViewer(`[AppBeforeQuit] Erro durante o desligamento do WhatsApp: ${e.message}`, "error");
  }

  try {
    sendLogToViewer("[AppBeforeQuit] Fechando conexões com bancos de dados SQLite...", "info");
    if (sqliteMainService && typeof sqliteMainService.close === "function") await sqliteMainService.close();
    if (sqliteAdminService && typeof sqliteAdminService.close === "function") await sqliteAdminService.close();
    if (sqliteChatService && typeof sqliteChatService.close === "function") await sqliteChatService.close();
    sendLogToViewer("[AppBeforeQuit] Conexões SQLite fechadas.", "info");
  } catch (dbCloseError) {
    sendLogToViewer(`[AppBeforeQuit] Erro ao fechar conexões SQLite: ${dbCloseError.message}`, "error");
  }

  sendLogToViewer("[AppBeforeQuit] Desligamento gracioso concluído. Encerrando aplicação agora.", "info");
  app.exit();
});


app.on("window-all-closed", () => {
  const msg = "[WindowAllClosed] Evento 'window-all-closed' disparado.";
  console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${msg}`);
  logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${msg}`);

  if (app.isQuitting) {
    return;
  }
  if (process.platform !== "darwin") {
    const platformMsg = "[WindowAllClosed] Plataforma não é macOS. app.quit() será chamado.";
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${platformMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${platformMsg}`);
    app.quit();
  } else {
    const macMsg = "[WindowAllClosed] Plataforma é macOS. Aplicação não será encerrada automaticamente.";
    console.log(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${macMsg}`);
    logBuffer.push(`[${new Date().toLocaleTimeString('pt-BR', { hour12: false })}] [INFO] ${macMsg}`);
  }
});

ipcMain.on("control-bot", async (event, data) => {
  const { action } = data;
  const currentSessionId = whatsappService?.sessionId || "whatsapp-bot-session";
  sendLogToViewer(`[IPC control-bot] Ação recebida: '${action}' para sessão: '${currentSessionId}'`, "info");

  if (!whatsappService || !websocketService) {
    sendLogToViewer("[IPC control-bot] Erro: Serviços WhatsApp/WebSocket não disponíveis.", "error");
    return;
  }

  try {
    if (action === "pause") {
      const isNowPaused = await whatsappService.togglePauseBot();
      sendLogToViewer(`[IPC control-bot] Bot ${isNowPaused ? "pausado" : "retomado"}.`, "info");
    } else if (action === "restart") {
      sendLogToViewer("[IPC control-bot] Iniciando reinício do bot...", "info");
      try {
        await whatsappService.fullLogoutAndCleanup();
        sendLogToViewer("[IPC control-bot] Limpeza completa do WhatsApp Service realizada.", "info");

        sendLogToViewer("[IPC control-bot] Tentando reconectar WhatsApp Service...", "info");
        const appUserDataPath = app.getPath("userData");
        const dbServicesForRestart = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };
        await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServicesForRestart, appUserDataPath);
        sendLogToViewer("[IPC control-bot] WhatsApp Service reconectado.", "info");
      } catch (restartError) {
        sendLogToViewer(`[IPC control-bot] Erro CRÍTICO durante o reinício do bot: ${restartError.message}. Stack: ${restartError.stack}`, "error");
        if(websocketService && typeof websocketService.broadcastToAdmins === 'function') {
            websocketService.broadcastToAdmins({
              type: "status_update",
              clientId: currentSessionId,
              payload: { status: "FATAL_ERROR", reason: `Erro durante reinício: ${restartError.message}` },
            });
        } else {
            sendLogToViewer("[IPC control-bot] websocketService não disponível para notificar admins sobre erro de reinício.", "warn");
        }
      }
    } else {
      sendLogToViewer(`[IPC control-bot] Ação desconhecida: '${action}'`, "warn");
    }
  } catch (error) {
    sendLogToViewer(`[IPC control-bot] Erro ao executar ação '${action}': ${error.message}. Stack: ${error.stack}`, "error");
  }
});

ipcMain.on("navigate", (event, receivedPayload) => {
  sendLogToViewer(`[IPC Navigate] Mensagem 'navigate' recebida. Payload: ${JSON.stringify(receivedPayload)}`, "debug");
  const { targetPage, agentInfo, adminInfo: receivedAdminInfo } = receivedPayload;
  sendLogToViewer(
    `[IPC Navigate] Tentando navegar para: '${targetPage}'. AgentInfo: ${JSON.stringify(agentInfo)}. AdminInfo Recebido: ${JSON.stringify(receivedAdminInfo)}. currentAdminInfo: ${JSON.stringify(currentAdminInfo)}`,
    "info"
  );

  if (mainWindow && !mainWindow.isDestroyed() && targetPage !== "login") {
    sendLogToViewer(`[IPC Navigate] Fechando mainWindow para navegação para '${targetPage}'.`, "debug");
    mainWindow.close(); // O evento 'closed' tratará mainWindow = null;
  }
  Object.keys(chatWindows).forEach((key) => {
    const win = chatWindows[key];
    if (win && !win.isDestroyed() && targetPage !== "chat") {
      sendLogToViewer(`[IPC Navigate] Fechando janela de chat para ${key} para navegação para '${targetPage}'.`, "debug");
      win.close(); // O evento 'closed' tratará delete chatWindows[key];
    }
  });
  if (targetPage !== "chat" && Object.keys(chatWindows).length > 0) {
    sendLogToViewer(`[IPC Navigate] Limpando objeto chatWindows pois targetPage não é 'chat'.`, "debug");
    // A limpeza individual no loop acima já deve ter feito isso.
    // chatWindows = {}; // Pode ser redundante ou causar problemas se o close for assíncrono.
  }

  if (adminWindow && !adminWindow.isDestroyed() && targetPage !== "admin" && targetPage !== "logs") {
    sendLogToViewer(`[IPC Navigate] Fechando adminWindow para navegação para '${targetPage}'.`, "debug");
    adminWindow.close(); // O evento 'closed' tratará adminWindow = null;
  }

  if (logsWindow && !logsWindow.isDestroyed() && targetPage !== "logs" && targetPage !== "admin") {
    sendLogToViewer(`[IPC Navigate] Fechando logsWindow para navegação para '${targetPage}'.`, "debug");
    logsWindow.close(); // O evento 'closed' tratará logsWindow = null;
  }

  if (targetPage === "chat" && agentInfo && agentInfo.agent) {
    sendLogToViewer(`[IPC Navigate] Navegando para 'chat' com agentInfo: ${JSON.stringify(agentInfo)}`, "debug");
    createChatWindow(agentInfo);
  } else if (targetPage === "admin") {
    const adminDataToUse = receivedAdminInfo || currentAdminInfo;
    sendLogToViewer(`[IPC Navigate] Navegando para 'admin'. adminDataToUse: ${JSON.stringify(adminDataToUse)}`, "debug");
    if (adminDataToUse && typeof adminDataToUse.name !== "undefined") {
      if (receivedAdminInfo && (!currentAdminInfo || currentAdminInfo.agent !== receivedAdminInfo.agent)) {
        currentAdminInfo = receivedAdminInfo;
        sendLogToViewer(`[IPC Navigate] currentAdminInfo atualizado para: ${JSON.stringify(currentAdminInfo)}`, "debug");
      }
      createAdminWindow(currentAdminInfo);
    } else {
      sendLogToViewer(`[IPC Navigate] Informação do admin não disponível para 'admin'. Redirecionando para 'login'.`, "warn");
      currentAdminInfo = null;
      createMainWindow();
    }
  } else if (targetPage === "login") {
    sendLogToViewer("[IPC Navigate] Navegando para 'login'.", "debug");
    currentAdminInfo = null;
    if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.close(); }
    if (logsWindow && !logsWindow.isDestroyed()) { logsWindow.close(); }
    Object.keys(chatWindows).forEach(key => { if(chatWindows[key] && !chatWindows[key].isDestroyed()) chatWindows[key].close(); });
    // chatWindows = {}; // A limpeza é feita nos eventos 'closed' individuais
    createMainWindow();
  } else if (targetPage === "logs") {
    sendLogToViewer("[IPC Navigate] Navegando para 'logs'.", "debug");
    createLogsWindow();
  } else {
    sendLogToViewer(`[IPC Navigate] Falha: Página '${targetPage}' desconhecida. Redirecionando para login se não houver janela principal.`, "warn");
    if (!mainWindow || (mainWindow && mainWindow.isDestroyed())) {
      if (targetPage !== "login") createMainWindow(); // Evita criar mainWindow se o target já for login
    }
  }
});

ipcMain.on("admin-logout", () => {
  sendLogToViewer("[IPC admin-logout] Mensagem 'admin-logout' recebida.", "info");
  currentAdminInfo = null;
});

ipcMain.on("open-dev-tools", (event) => {
  sendLogToViewer("[IPC open-dev-tools] Mensagem 'open-dev-tools' recebida.", "debug");
  const senderWebContents = event.sender;
  if (senderWebContents && !senderWebContents.isDestroyed()) {
    const windowInstance = BrowserWindow.fromWebContents(senderWebContents);
    if (windowInstance && !windowInstance.isDestroyed()) {
      sendLogToViewer(`[IPC open-dev-tools] Abrindo DevTools para: '${windowInstance.title}'`, "debug");
      if (!windowInstance.isFocused()) windowInstance.focus();
      windowInstance.webContents.openDevTools({ mode: 'detach' });
      windowInstance.webContents.once('devtools-opened', () => {
          sendLogToViewer(`[IPC open-dev-tools] DevTools aberto para: '${windowInstance.title}'.`, "info");
      });
    } else {
      sendLogToViewer("[IPC open-dev-tools] Janela remetente não encontrada/destruída (BrowserWindow.fromWebContents).", "warn");
    }
  } else {
     sendLogToViewer("[IPC open-dev-tools] WebContents do remetente destruído.", "warn");
  }
});

ipcMain.on("request-initial-logs", (event) => {
  if (event.sender && !event.sender.isDestroyed()) {
    try {
        event.sender.send("initial-logs-data", logBuffer);
    } catch (e) {
        sendLogToViewer(`[IPC request-initial-logs] Falha ao enviar logs iniciais: ${e.message}`, "warn");
    }
  }
});

ipcMain.on("close-app", () => {
  sendLogToViewer("[IPC close-app] Solicitação para fechar a aplicação.", "info");
  app.quit();
});

ipcMain.on('restart-app', () => {
  sendLogToViewer('Reiniciando a aplicação...', "info");
  app.relaunch();
  app.quit();
});

ipcMain.on('open-external-link', (event, url) => {
  sendLogToViewer(`Abrindo link externo: ${url}`, "info");
  shell.openExternal(url);
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-logs', () => {
  return logBuffer.join('\n');
});

ipcMain.handle('clear-logs', () => {
  logBuffer.length = 0;
  sendLogToViewer('Buffer de logs em memória limpo.', "info", true); // isClosingLog = true para não tentar IPC
  return 'Logs em memória limpos com sucesso.';
});

ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});


process.on("uncaughtException", (error, origin) => {
  const errorMessage = `Exceção NÃO CAPTURADA: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`;
  // Logar diretamente no console, pois sendLogToViewer pode falhar se o erro for no próprio Electron
  console.error(errorMessage);
  // Tentar logar no buffer também, mas com cuidado
  try {
    logBuffer.push(errorMessage);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
  } catch (logError) {
    console.error("Falha ao adicionar uncaughtException ao logBuffer:", logError);
  }

  try {
    if (app.isReady() && !app.isQuitting) { // Evitar mostrar erro se o app já estiver a fechar
        dialog.showErrorBox("Erro Inesperado da Aplicação", `Ocorreu um erro crítico não capturado. Detalhes: ${error.message}`);
    }
  } catch (e) {
    console.error("Falha ao mostrar showErrorBox para uncaughtException:", e);
  }
  // Considerar app.quit() ou app.exit() dependendo da gravidade, mas pode levar a perda de dados.
  // Se o erro for muito grave, pode ser melhor deixar o processo terminar.
});

process.on("unhandledRejection", (reason, promise) => {
  const reasonMessage = reason instanceof Error ? reason.message : String(reason);
  const reasonStack = reason instanceof Error ? reason.stack : "N/A";
  const errorMessage = `Rejeição de Promessa NÃO TRATADA: ${reasonMessage}\nStack: ${reasonStack}`;
  console.error(errorMessage);
  try {
    logBuffer.push(errorMessage);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
  } catch (logError) {
    console.error("Falha ao adicionar unhandledRejection ao logBuffer:", logError);
  }
});
