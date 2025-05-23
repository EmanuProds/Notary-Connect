// electronMain.js
const { app, BrowserWindow, ipcMain, dialog, Menu, session, shell, nativeTheme } = require("electron");
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
let mainWindow; // Janela principal (menu.html)
let splashWindow; // Janela do ecrã de splash
let loginWindow; // Janela de login (index.html)
let chatWindows = {}; // Objeto para armazenar janelas de chat, indexadas por agentId
let adminWindow; // Janela de administração
let logsWindow; // Janela de visualização de logs

let currentAdminInfo = null; // Informações do administrador logado
let pendingLoginTarget = null; // 'admin' ou 'chat' - destino após login

const MAX_LOG_BUFFER_SIZE = 500;
const logBuffer = [];

/**
 * Registra uma mensagem de log.
 * @param {string} logString - A mensagem de log.
 * @param {string} [level="info"] - O nível do log.
 * @param {boolean} [isClosingLog=false] - Se o log é sobre o fechamento de uma janela.
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

  if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
    try {
      logsWindow.webContents.send("log-data", formattedLog);
    } catch (e) {
      console.error(`[sendLogToViewer] Falha ao enviar log para logsWindow: ${e.message}`);
    }
  }

  if (!isClosingLog && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    try {
      if (mainWindow.webContents.getURL().includes("menu.html")) {
        mainWindow.webContents.send('log-update', formattedLog);
      }
    } catch (e) {
      console.error(`[sendLogToViewer] Falha ao enviar log para mainWindow (menu): ${e.message}`);
    }
  }
}

// Carregamento inicial de módulos críticos
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
  if (!sqliteMainService || !sqliteAdminService || !sqliteChatService || !whatsappService || !websocketService ||
    typeof authRoutesModule !== 'function' || typeof adminRoutesModule !== 'function' || typeof chatRoutesModule !== 'function') {
    throw new Error("Um ou mais módulos de backend ou suas exportações essenciais não foram encontrados ou não são funções.");
  }
  sendLogToViewer("[ElectronMain] Verificação de exportações dos módulos de backend OK.", "debug");
} catch (e) {
  sendLogToViewer(`Erro CRÍTICO ao carregar módulos de backend: ${e.message}\n${e.stack}`, "error");
  if (app.isReady()) dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos. Detalhes: ${e.message}`);
  if (app && typeof app.quit === 'function') app.quit(); else process.exit(1);
}

/**
 * Cria a janela do Ecrã de Splash.
 */
function createSplashWindow() {
  sendLogToViewer("[createSplashWindow] Tentando criar a janela de splash.", "debug");
  splashWindow = new BrowserWindow({
    width: 480, height: 320, transparent: false, frame: false, alwaysOnTop: true, resizable: false, center: true,
    webPreferences: { preload: path.join(__dirname, 'preloadSplash.js'), contextIsolation: true, nodeIntegration: false }
  });
  const splashHtmlPath = path.join(__dirname, 'frontend', 'web', 'splash.html');
  splashWindow.loadFile(splashHtmlPath);
  splashWindow.webContents.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('app-info', { version: pjson.version, name: pjson.name });
      splashWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });
  nativeTheme.on('updated', () => {
    if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents && !splashWindow.webContents.isDestroyed()) {
      try { splashWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
      catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para splash: ${e.message}`, "warn"); }
    }
  });
  splashWindow.on('closed', () => { 
    sendLogToViewer("[createSplashWindow] Janela de splash fechada.", "debug", true);
    splashWindow = null; 
  });
}

/**
 * Cria a janela de login (index.html).
 */
function createLoginWindow() {
  sendLogToViewer("[createLoginWindow] Tentando criar ou focar a janela de login.", "debug");
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 450, height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged,
    },
    icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"),
    show: false, transparent: true, frame: false, resizable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#00000000' : '#00000000', 
    hasShadow: false, 
  });

  loginWindow.webContents.on("did-finish-load", () => {
    if (loginWindow && !loginWindow.isDestroyed() && loginWindow.webContents && !loginWindow.webContents.isDestroyed()) {
      try {
        loginWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        loginWindow.webContents.send('app-info', { version: pjson.version, name: pjson.name });
      } catch (e) {
        sendLogToViewer(`[createLoginWindow] Falha ao enviar tema/info para loginWindow: ${e.message}`, "warn");
      }
    }
  });

  nativeTheme.on('updated', () => {
    if (loginWindow && !loginWindow.isDestroyed() && loginWindow.webContents && !loginWindow.webContents.isDestroyed()) {
      try {
        loginWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      } catch (e) {
        sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para loginWindow: ${e.message}`, "warn");
      }
    }
  });
  
  const loginUrl = `http://localhost:${PORT}/index.html`;
  loginWindow.loadURL(loginUrl);
  loginWindow.once('ready-to-show', () => { 
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.show(); 
  });
  loginWindow.on("closed", () => { 
    sendLogToViewer("[createLoginWindow] Janela de login fechada.", "debug", true);
    loginWindow = null; 
  });
  sendLogToViewer("[createLoginWindow] Janela de login (index.html) criada.", "info");
}

/**
 * Cria a janela principal da aplicação (menu.html).
 */
function createMainWindow() {
  sendLogToViewer("[createMainWindow] Solicitada janela principal (menu.html).", "debug");
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendLogToViewer("[createMainWindow] Janela principal já existe. Mostrando e focando.", "debug");
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    return;
  }

  sendLogToViewer("[createMainWindow] Criando NOVA instância da janela principal (menu.html).", "debug");
  mainWindow = new BrowserWindow({
    width: 1000, height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged,
    },
    icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"),
    show: false, frame: true, resizable: true, transparent: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#242424' : '#f5f5f5',
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      } catch (e) { sendLogToViewer(`[createMainWindow] Falha ao enviar tema para mainWindow: ${e.message}`, "warn"); }
    }
  });
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      try {
        mainWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#242424' : '#f5f5f5');
      } catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para mainWindow: ${e.message}`, "warn"); }
    }
  });
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    sendLogToViewer(`[createMainWindow] Falha ao carregar URL: ${validatedURL}. Código: ${errorCode}. Descrição: ${errorDescription}`, "error", true);
    if (mainWindow && !mainWindow.isDestroyed()) dialog.showErrorBox("Erro de Carregamento", `Não foi possível carregar a página principal: ${errorDescription}`);
  });
  
  mainWindow.once('ready-to-show', () => { 
    sendLogToViewer('[createMainWindow] Nova mainWindow (menu.html) pronta para ser exibida. A exibição será controlada externamente.', 'debug');
  });

  mainWindow.on("closed", () => { 
    sendLogToViewer("[createMainWindow] Janela principal (menu.html) fechada.", "debug", true);
    mainWindow = null; 
  });

  const menuUrl = `http://localhost:${PORT}/menu.html`;
  sendLogToViewer(`[createMainWindow] Carregando URL do menu: ${menuUrl}`, "debug");
  mainWindow.loadURL(menuUrl);
}

/**
 * Cria a janela de Chat.
 * @param {object} agentInfo - Informações do agente.
 */
function createChatWindow(agentInfo) {
  const agentId = agentInfo.agent;
  const agentName = agentInfo.name || agentId;
  sendLogToViewer(`[createChatWindow] Tentando criar ou focar janela de chat para: ${agentName} (ID: ${agentId})`, "debug");

  if (chatWindows[agentId] && !chatWindows[agentId].isDestroyed()) {
    chatWindows[agentId].focus(); return;
  }
  const newChatWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged },
    title: `Chat - Usuário: ${agentName}`, icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"), show: false,
  });
  newChatWindow.webContents.on('did-finish-load', () => {
    if (newChatWindow && !newChatWindow.isDestroyed() && newChatWindow.webContents && !newChatWindow.webContents.isDestroyed()) {
        try { newChatWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
        catch (e) { sendLogToViewer(`[createChatWindow] Falha ao enviar tema inicial para chatWindow ${agentName}: ${e.message}`, "warn");}
    }
  });
  nativeTheme.on('updated', () => {
    if (newChatWindow && !newChatWindow.isDestroyed() && newChatWindow.webContents && !newChatWindow.webContents.isDestroyed()) {
        try { newChatWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
        catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para chatWindow ${agentName}: ${e.message}`, "warn");}
    }
  });
  newChatWindow.webContents.on('context-menu', (event, params) => { 
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Inspecionar Elemento', click: () => { newChatWindow.webContents.inspectElement(params.x, params.y); }, },
      { type: 'separator' }, { label: 'Abrir DevTools', click: () => { newChatWindow.webContents.openDevTools({ mode: 'detach' }); }, },
      { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => { newChatWindow.webContents.reload(); } }
    ]);
    contextMenu.popup(newChatWindow);
  });
  const chatUrl = `http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`;
  newChatWindow.loadURL(chatUrl);
  newChatWindow.once('ready-to-show', () => { if(newChatWindow && !newChatWindow.isDestroyed()) newChatWindow.show(); });
  newChatWindow.on("closed", () => { 
    sendLogToViewer(`[createChatWindow] Janela de chat para ${agentName} fechada.`, "debug", true);
    delete chatWindows[agentId]; 
  });
  chatWindows[agentId] = newChatWindow;
  sendLogToViewer(`[createChatWindow] Janela de chat criada para: ${agentName}`, "info");
}

/**
 * Cria a janela de Administração.
 * @param {object} adminInfoToUse - Informações do administrador.
 */
function createAdminWindow(adminInfoToUse) {
  sendLogToViewer(`[createAdminWindow] Tentando criar ou focar janela de admin. AdminInfo: ${JSON.stringify(adminInfoToUse)}`, "debug");
  if (!adminInfoToUse || typeof adminInfoToUse.name === "undefined") {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus(); else createMainWindow(); return;
  }
  if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.focus(); return; }
  adminWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged },
    title: `Admin - ${adminInfoToUse.name || "Administrador"}`, icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"), show: false,
  });
   adminWindow.webContents.on('did-finish-load', () => {
    if (adminWindow && !adminWindow.isDestroyed() && adminWindow.webContents && !adminWindow.webContents.isDestroyed()) {
        try { adminWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
        catch (e) { sendLogToViewer(`[createAdminWindow] Falha ao enviar tema inicial para adminWindow: ${e.message}`, "warn"); }
    }
  });
  nativeTheme.on('updated', () => {
    if (adminWindow && !adminWindow.isDestroyed() && adminWindow.webContents && !adminWindow.webContents.isDestroyed()) {
        try { adminWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
        catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para adminWindow: ${e.message}`, "warn"); }
    }
  });
  adminWindow.on("closed", () => { 
    sendLogToViewer(`[createAdminWindow] Janela de admin para ${currentAdminInfo ? currentAdminInfo.name : "N/A"} fechada.`, "debug", true);
    adminWindow = null; 
  });
  const adminUrl = `http://localhost:${PORT}/admin.html`;
  adminWindow.loadURL(adminUrl);
  adminWindow.once('ready-to-show', () => { if(adminWindow && !adminWindow.isDestroyed()) adminWindow.show(); });
  currentAdminInfo = adminInfoToUse;
  sendLogToViewer(`[createAdminWindow] Janela de administração criada para: ${adminInfoToUse.name}`, "info");
}

/**
 * Cria a janela de Logs.
 */
function createLogsWindow() {
  sendLogToViewer("[createLogsWindow] Tentando criar ou focar janela de logs.", "debug");
  if (logsWindow && !logsWindow.isDestroyed()) { logsWindow.focus(); return; }
  logsWindow = new BrowserWindow({
    width: 900, height: 650, title: "Logs do Sistema - Notary Connect",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, devTools: !app.isPackaged },
    icon: path.join(__dirname, "frontend/web/img/icons/app-icon.png"), show: false,
  });
  const logsUrl = `http://localhost:${PORT}/logsViewer.html`;
  logsWindow.loadURL(logsUrl);
  logsWindow.webContents.once("did-finish-load", () => {
    if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
      try {
        logsWindow.webContents.send("initial-logs-data", logBuffer);
        logsWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
      } catch (e) { sendLogToViewer(`[createLogsWindow] Falha ao enviar dados/tema para logsWindow: ${e.message}`, "warn"); }
    }
  });
  nativeTheme.on('updated', () => {
    if (logsWindow && !logsWindow.isDestroyed() && logsWindow.webContents && !logsWindow.webContents.isDestroyed()) {
        try { logsWindow.webContents.send('system-theme-update', nativeTheme.shouldUseDarkColors ? 'dark' : 'light'); }
        catch (e) { sendLogToViewer(`[NativeThemeUpdate] Falha ao enviar atualização de tema para logsWindow: ${e.message}`, "warn"); }
    }
  });
  logsWindow.once('ready-to-show', () => { if(logsWindow && !logsWindow.isDestroyed()) logsWindow.show(); });
  logsWindow.on("closed", () => { 
    sendLogToViewer("[createLogsWindow] Janela de logs fechada.", "debug", true);
    logsWindow = null; 
  });
  sendLogToViewer("[createLogsWindow] Janela de logs criada.", "info");
}

/**
 * Configura o menu da aplicação.
 */
function setupMenu() {
  sendLogToViewer("[setupMenu] Configurando o menu da aplicação.", "debug");
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Ver Logs', click: () => createLogsWindow() },
        { label: 'Reiniciar Aplicação', click: () => { app.relaunch(); app.quit(); } },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' },
        { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar Tudo' }
      ]
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload', label: 'Recarregar' }, { role: 'forceReload', label: 'Forçar Recarregamento' },
        { role: 'toggleDevTools', label: 'Alternar Ferramentas de Desenvolvedor' }, { type: 'separator' },
        { role: 'resetZoom', label: 'Restaurar Zoom' }, { role: 'zoomIn', label: 'Aumentar Zoom' }, { role: 'zoomOut', label: 'Diminuir Zoom' },
        { type: 'separator' }, { role: 'togglefullscreen', label: 'Tela Cheia' }
      ]
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom (macOS)' }, { type: 'separator' },
        { role: 'front', label: 'Trazer Tudo para Frente (macOS)' }, { type: 'separator' },
        { role: 'close', label: 'Fechar Janela' }
      ]
    },
    {
      role: 'help', label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o Notary Connect',
          click: async () => {
            dialog.showMessageBox(null, {
                type: 'info', title: 'Sobre o Notary Connect',
                message: `Notary Connect\nVersão: ${pjson.version}\n\nUma solução de atendimento e gestão.`,
                buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: `Sobre ${app.name}` }, { type: 'separator' }, { role: 'services', label: 'Serviços' },
        { type: 'separator' }, { role: 'hide', label: `Ocultar ${app.name}` }, { role: 'hideOthers', label: 'Ocultar Outros' },
        { role: 'unhide', label: 'Mostrar Todos' }, { type: 'separator' }, { role: 'quit', label: `Sair de ${app.name}` }
      ]
    });
    template[4].submenu = [ // Ajustar índice se necessário
      { role: 'close', label: 'Fechar Janela' }, { role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' },
      { type: 'separator' }, { role: 'front', label: 'Trazer Tudo para Frente' }
    ];
  }
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  sendLogToViewer("[setupMenu] Menu da aplicação configurado.", "debug");
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
    dialog.showErrorBox("Erro de Banco de Dados", `Não foi possível inicializar os bancos de dados. Detalhes: ${dbError.message}`);
    app.quit(); process.exit(1);
  }
}

// Evento 'whenReady' do Electron
app.whenReady().then(async () => {
  sendLogToViewer("[AppReady] Evento 'whenReady' disparado.", "info");
  createSplashWindow(); 

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders,
        'Content-Security-Policy': [ 
          `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; connect-src 'self' ws://localhost:${PORT} wss://localhost:${PORT}; img-src 'self' data: https://* https://placehold.co; object-src 'none'; frame-ancestors 'none';`
        ]}
    });
  });
  
  if (sqliteMainService) sqliteMainService.setLogger(sendLogToViewer);
  if (sqliteAdminService) sqliteAdminService.setLogger(sendLogToViewer);
  if (sqliteChatService) sqliteChatService.setLogger(sendLogToViewer);

  setupMenu();
  await initializeDatabases();

  const expressApp = express();
  expressApp.use(express.json());
  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
  expressApp.use('/uploads', express.static(uploadsPath));
  const staticPath = path.join(__dirname, "frontend/web");
  expressApp.use(express.static(staticPath));

  const authRouter = authRoutesModule(sqliteAdminService, sendLogToViewer);
  expressApp.use("/api/auth", authRouter);
  const adminRouter = adminRoutesModule(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogToViewer);
  expressApp.use("/api/admin", adminRouter);
  const chatRouter = chatRoutesModule(sendLogToViewer);
  expressApp.use("/api/chat", chatRouter);

  expressApp.get("/", (req, res) => res.sendFile(path.join(staticPath, "menu.html")));
  expressApp.get("/index.html", (req, res) => res.sendFile(path.join(staticPath, "index.html")));
  expressApp.get("/menu.html", (req, res) => res.sendFile(path.join(staticPath, "menu.html")));
  expressApp.get("/chat.html", (req, res) => res.sendFile(path.join(staticPath, "chat.html")));
  expressApp.get("/admin.html", (req, res) => res.sendFile(path.join(staticPath, "admin.html")));
  expressApp.get("/logsViewer.html", (req, res) => res.sendFile(path.join(staticPath, "logsViewer.html")));
  expressApp.get("/splash.html", (req, res) => res.sendFile(path.join(staticPath, "splash.html")));

  const internalServer = httpServer.createServer(expressApp);
  const dbServices = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };

  if (websocketService && whatsappService && dbServices.main && dbServices.admin && dbServices.chat) {
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, whatsappService, dbServices);
  } else { sendLogToViewer("[AppReady] Falha ao inicializar WebSocket: serviços críticos não definidos.", "error"); }

  try {
    if (whatsappService && websocketService && dbServices.main && dbServices.admin && dbServices.chat) {
      const appUserDataPath = app.getPath("userData");
      await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServices, appUserDataPath);
    } else { sendLogToViewer("[AppReady] Falha ao iniciar WhatsApp Service: serviços não definidos.", "error"); }
  } catch (err) { sendLogToViewer(`[AppReady] Falha CRÍTICA ao iniciar WhatsApp Service: ${err.message}. Stack: ${err.stack}`, "error"); }

  internalServer.listen(PORT, () => {
    sendLogToViewer(`[AppReady] Servidor interno rodando em http://localhost:${PORT}`, "info");
    
    createMainWindow(); // Cria a mainWindow (menu.html) mas ela começa com show: false
    
    const totalSplashDisplayTime = 5000; 
    sendLogToViewer(`[AppReady] Splash screen será exibido por ${totalSplashDisplayTime}ms.`, "info");

    setTimeout(() => {
      sendLogToViewer("[AppReady Timeout Splash] Tempo do splash esgotado.", "debug");
      if (splashWindow && !splashWindow.isDestroyed()) {
        sendLogToViewer("[AppReady Timeout Splash] Fechando splashWindow.", "debug");
        splashWindow.close();
      }
      
      // Garante que mainWindow seja mostrada e focada após o splash
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
           sendLogToViewer("[AppReady Timeout Splash] mainWindow não visível, chamando show().", "debug");
           mainWindow.show();
        }
        mainWindow.focus(); 
        sendLogToViewer("[AppReady Timeout Splash] mainWindow mostrada e focada.", "debug");
      } else if (!mainWindow || (mainWindow && mainWindow.isDestroyed())) {
         // Se mainWindow não foi criada ou foi destruída, tenta recriar e mostrar.
         sendLogToViewer("[AppReady Timeout Splash] mainWindow não disponível ou destruída. Tentando recriar e exibir.", "warn");
         createMainWindow(); 
         if (mainWindow && !mainWindow.isDestroyed()) { // Verifica de novo após recriar
            if(!mainWindow.isVisible()) mainWindow.show(); 
            mainWindow.focus();
         }
      }
    }, totalSplashDisplayTime);
  }).on("error", (err) => { 
    sendLogToViewer(`[AppReady] Erro ao iniciar servidor interno: ${err.message}`, "error", true);
    dialog.showErrorBox("Erro de Servidor",`Não foi possível iniciar o servidor. Detalhes: ${err.message}`);
    app.quit(); process.exit(1);
   });

  app.on("activate", () => {
    sendLogToViewer("[AppActivate] Evento 'activate' disparado.", "debug");
    // Se nenhuma janela estiver aberta (exceto splash/login que podem estar em transição)
    const allWindows = BrowserWindow.getAllWindows();
    const mainAppWindowsExist = allWindows.some(win => win === mainWindow || win === adminWindow || Object.values(chatWindows).includes(win));

    if (!mainAppWindowsExist && !loginWindow && app.isReady()) {
      sendLogToViewer("[AppActivate] Nenhuma janela principal ou de login aberta. Iniciando fluxo com splash e menu.", "debug");
      createSplashWindow(); 
      if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow(); 
        // A exibição da mainWindow será controlada pelo timeout do splash se o splash for recriado
        // ou explicitamente se o splash não for mais relevante.
        // Para garantir, se o splash não estiver ativo, mostramos o menu.
        if (!splashWindow || splashWindow.isDestroyed()) {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                mainWindow.show();
                mainWindow.focus();
            }
        }
      } else if (mainWindow && !mainWindow.isVisible()){
        mainWindow.show(); 
        mainWindow.focus();
      }
    } else if (mainWindow && !mainWindow.isDestroyed()) {
        if(!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus(); 
    } else if (loginWindow && !loginWindow.isDestroyed()) {
        if(!loginWindow.isVisible()) loginWindow.show();
        loginWindow.focus();
    } else if ((!mainWindow || mainWindow.isDestroyed()) && (!loginWindow || loginWindow.isDestroyed()) && app.isReady()){
        // Fallback final: se tudo estiver fechado, recria o menu.
        sendLogToViewer("[AppActivate] Nenhuma janela principal ou de login existe (fallback). Recriando menu.", "debug");
        createMainWindow(); 
    }
  });
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
        if (typeof whatsClient.getState === 'function') state = await whatsClient.getState();
        if (state === 'CONNECTED' && typeof whatsClient.logout === 'function') {
          cleanupPromises.push(whatsClient.logout().then(() => sendLogToViewer("[AppBeforeQuit] Logout WhatsApp OK.", "info")));
        } else if (typeof whatsClient.destroy === 'function') {
          cleanupPromises.push(whatsClient.destroy().then(() => sendLogToViewer("[AppBeforeQuit] Destroy WhatsApp OK.", "info")));
        }
      }
    }
  } catch (e) { sendLogToViewer(`[AppBeforeQuit] Erro no cleanup do WhatsApp: ${e.message}`, "error"); }
  try {
    if (sqliteMainService) cleanupPromises.push(sqliteMainService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Main fechado.", "info")));
    if (sqliteAdminService) cleanupPromises.push(sqliteAdminService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Admin fechado.", "info")));
    if (sqliteChatService) cleanupPromises.push(sqliteChatService.close().then(() => sendLogToViewer("[AppBeforeQuit] DB Chat fechado.", "info")));
  } catch (dbCloseError) { sendLogToViewer(`[AppBeforeQuit] Erro ao fechar DBs: ${dbCloseError.message}`, "error"); }
  if (cleanupPromises.length > 0) {
    event.preventDefault(); 
    Promise.allSettled(cleanupPromises).then(() => { app.exit(); }).catch(err => { app.exit(); });
  }
});

app.on("window-all-closed", () => {
  if (app.isQuitting) return;
  if (process.platform !== "darwin") app.quit();
});

// IPC Handlers
ipcMain.on("control-bot", async (event, data) => { 
    const { action } = data;
    const currentSessionId = whatsappService?.sessionId || "whatsapp-bot-session";
    sendLogToViewer(`[IPC control-bot] Ação: '${action}' para sessão: '${currentSessionId}'`, "info");
    if (!whatsappService || !websocketService) return;
    try {
        if (action === "pause") await whatsappService.togglePauseBot();
        else if (action === "restart") {
            await whatsappService.fullLogoutAndCleanup();
            const appUserDataPath = app.getPath("userData");
            const dbServicesForRestart = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };
            await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServicesForRestart, appUserDataPath);
        }
    } catch (error) { /* log error */ }
});

ipcMain.on('open-login-for-target', (event, { targetPage }) => {
  sendLogToViewer(`[IPC open-login-for-target] Destino: ${targetPage}`, "info");
  pendingLoginTarget = targetPage;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close(); 
  }
  createLoginWindow(); 
});

ipcMain.on("navigate", (event, receivedPayload) => {
  const { targetPage, agentInfo, adminInfo: receivedAdminInfo, fromLoginWindow } = receivedPayload; 
  sendLogToViewer(`[IPC Navigate] Received: Target='${targetPage}', FromLoginWindow=${!!fromLoginWindow}, PendingLoginTarget='${pendingLoginTarget}'`, "info");

  if (fromLoginWindow && loginWindow && !loginWindow.isDestroyed()) {
    sendLogToViewer("[IPC Navigate] Navegação originada da janela de login. Fechando loginWindow.", "debug");
    loginWindow.close(); 
  }

  if (targetPage === "menu") {
    sendLogToViewer("[IPC Navigate] Target é 'menu'. Fechando outras janelas e preparando para mostrar/criar menu.", "debug");
    pendingLoginTarget = null;
    currentAdminInfo = null;

    if (loginWindow && !loginWindow.isDestroyed()) { // Garante que a janela de login seja fechada se ainda existir
        sendLogToViewer("[IPC Navigate to Menu] Fechando loginWindow explicitamente.", "debug");
        loginWindow.close();
    }
    Object.values(chatWindows).forEach(win => { if (win && !win.isDestroyed()) win.close(); });
    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.close();
    if (logsWindow && !logsWindow.isDestroyed()) logsWindow.close();
    
    createMainWindow(); 
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
            sendLogToViewer("[IPC Navigate to Menu] mainWindow (menu.html) não visível, chamando show().", "debug");
            mainWindow.show();
        }
        sendLogToViewer("[IPC Navigate to Menu] Focando mainWindow (menu.html).", "debug");
        mainWindow.focus();
    } else {
        sendLogToViewer("[IPC Navigate to Menu] mainWindow (menu.html) não disponível após createMainWindow. Isso não deveria acontecer.", "error");
    }
    return; 
  }

  if (fromLoginWindow) { 
    const finalTarget = pendingLoginTarget;
    pendingLoginTarget = null; 
    sendLogToViewer(`[IPC Navigate] Post-login navigation. Final target (from pending): '${finalTarget}'`, "debug");

    if (finalTarget === 'admin') {
      if (receivedAdminInfo && receivedAdminInfo.isAdmin) {
        currentAdminInfo = receivedAdminInfo; 
        createAdminWindow(currentAdminInfo);
      } else {
        dialog.showErrorBox("Acesso Negado", "Você não tem permissão para acessar a área administrativa.");
        sendLogToViewer("[IPC Navigate] Admin access denied post-login. Fallback to menu.", "warn");
        createMainWindow(); 
      }
    } else if (finalTarget === 'chat') {
      let effectiveAgentInfo = agentInfo || (receivedAdminInfo && receivedAdminInfo.agent ? { agent: receivedAdminInfo.agent, name: receivedAdminInfo.name } : null);
      if (effectiveAgentInfo && effectiveAgentInfo.agent) {
        createChatWindow(effectiveAgentInfo);
      } else {
        sendLogToViewer("[IPC Navigate] Agent info não disponível para 'chat' post-login. Voltando ao menu.", "warn");
        createMainWindow();
      }
    } else {
      sendLogToViewer(`[IPC Navigate] Invalid final target '${finalTarget}' after login process. Voltando ao menu.`, "warn");
      createMainWindow();
    }
    return; 
  }
  
  if (targetPage === "login") { 
    sendLogToViewer("[IPC Navigate] Explicit navigation to 'login'. Closing other main windows.", "debug");
    currentAdminInfo = null; pendingLoginTarget = null; 
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    Object.values(chatWindows).forEach(win => { if (win && !win.isDestroyed()) win.close(); });
    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.close();
    if (logsWindow && !logsWindow.isDestroyed()) logsWindow.close();
    createLoginWindow();
    return; 
  }

  sendLogToViewer(`[IPC Navigate] General navigation to '${targetPage}'. Closing irrelevant windows.`, "debug");
  
  if (targetPage !== "chat") Object.keys(chatWindows).forEach(key => { if (chatWindows[key] && !chatWindows[key].isDestroyed()) chatWindows[key].close(); });
  if (targetPage !== "admin" && targetPage !== "logs" && adminWindow && !adminWindow.isDestroyed()) adminWindow.close();
  if (targetPage !== "logs" && targetPage !== "admin" && logsWindow && !logsWindow.isDestroyed()) logsWindow.close();

  if (targetPage === "chat" && agentInfo && agentInfo.agent) createChatWindow(agentInfo);
  else if (targetPage === "admin") {
    const adminDataToUse = receivedAdminInfo || currentAdminInfo;
    if (adminDataToUse && typeof adminDataToUse.name !== "undefined") { 
        currentAdminInfo = adminDataToUse; 
        createAdminWindow(currentAdminInfo); 
    } else { 
        sendLogToViewer("[IPC Navigate] Admin info não disponível para 'admin'. Indo para login.", "warn"); 
        pendingLoginTarget = 'admin'; 
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); 
        createLoginWindow(); 
    }
  } else if (targetPage === "logs") createLogsWindow();
  else { 
    sendLogToViewer(`[IPC Navigate] Unhandled targetPage '${targetPage}'. Checking if menu should be opened.`, "warn");
    const allWindows = BrowserWindow.getAllWindows();
    const mainAppWindowsOpen = allWindows.some(win => 
        win !== splashWindow && 
        win !== loginWindow && 
        ( (mainWindow && win === mainWindow) || (adminWindow && win === adminWindow) || Object.values(chatWindows).includes(win) )
    );
    if (!mainAppWindowsOpen) {
        if (!mainWindow || mainWindow.isDestroyed()) {
            createMainWindow();
        }
    }
  }
});

ipcMain.on("admin-logout", () => {
  currentAdminInfo = null; pendingLoginTarget = null; 
  if (adminWindow && !adminWindow.isDestroyed()) adminWindow.close();
  if (logsWindow && !logsWindow.isDestroyed()) logsWindow.close();
  createLoginWindow(); 
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
        catch(e) { /* log error */ }
    }
});
ipcMain.on("close-app", () => { app.quit(); });
ipcMain.on('restart-app', () => { app.relaunch(); app.quit(); });
ipcMain.on('open-external-link', (event, url) => { shell.openExternal(url); });
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));
ipcMain.handle('get-logs', () => logBuffer.join('\n'));
ipcMain.handle('clear-logs', () => { logBuffer.length = 0; sendLogToViewer('Buffer de logs limpo.', "info", true); return 'Logs limpos.'; });
ipcMain.handle('get-app-info', () => ({ version: pjson.version, name: pjson.name }));
ipcMain.handle('get-system-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');

process.on("uncaughtException", (error, origin) => { 
    const msg = `Exceção NÃO CAPTURADA: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`; console.error(msg);
    try { logBuffer.push(msg); if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift(); } catch(e){}
    try { if (app.isReady() && !app.isQuitting) dialog.showErrorBox("Erro Inesperado", `Erro: ${error.message}`); } catch(e){}
});
process.on("unhandledRejection", (reason, promise) => {
    const msg = `Rejeição de Promessa NÃO TRATADA: ${reason instanceof Error ? reason.message : String(reason)}\nStack: ${reason instanceof Error ? reason.stack : "N/A"}`; console.error(msg);
    try { logBuffer.push(msg); if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift(); } catch(e){}
});
