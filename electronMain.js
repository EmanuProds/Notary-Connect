// electronMain.js
const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require("electron")
const path = require("path")
const httpServer = require("http")
const express = require("express")
const fs = require("fs") 

// Novos serviços SQLite
let sqliteMainService;
let sqliteAdminService;
let sqliteChatService;

let whatsappService
let websocketService
let authRoutesModule // Será a função exportada por authRoutes.js
let adminRoutesModule // Será a função exportada por adminRoutes.js
let chatRoutesModule // Adicionado para chatRoutes.js

const PORT = process.env.ELECTRON_PORT || 3000

let mainWindow
let chatWindows = {}
let adminWindow
let logsWindow
let currentAdminInfo = null 

const MAX_LOG_BUFFER_SIZE = 500
const logBuffer = []

function sendLogToViewer(logString, level = "info") {
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const formattedLog = `[${timestamp}] [${level.toUpperCase()}] ${logString}`;
  logBuffer.push(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) logBuffer.shift();
  if (logsWindow && !logsWindow.isDestroyed()) logsWindow.webContents.send("log-data", formattedLog);
  
  switch (level) {
    case "error": console.error(formattedLog); break;
    case "warn": console.warn(formattedLog); break;
    case "debug": console.debug(formattedLog); break; 
    default: console.log(formattedLog);
  }
}

try {
  sendLogToViewer("[ElectronMain] Iniciando carregamento dos módulos de backend...", "debug");
  sqliteMainService = require("./backend/services/sqliteMain.js");
  sqliteAdminService = require("./backend/services/sqliteAdmin.js");
  sqliteChatService = require("./backend/services/sqliteChat.js");

  whatsappService = require("./backend/services/whatsappService")
  websocketService = require("./backend/services/websocketService")
  authRoutesModule = require("./backend/routes/authRoutes")
  adminRoutesModule = require("./backend/routes/adminRoutes")
  chatRoutesModule = require("./backend/routes/chatRoutes") // Carrega o módulo de rotas de chat
  sendLogToViewer("[ElectronMain] Módulos de backend carregados.", "debug");

  // Verifica se os módulos de serviço e os módulos de rota (como funções) foram carregados
  if (
    !sqliteMainService || !sqliteAdminService || !sqliteChatService ||
    !whatsappService || !websocketService ||
    typeof authRoutesModule !== 'function' || // Verifica se authRoutesModule é uma função
    typeof adminRoutesModule !== 'function' || // Verifica se adminRoutesModule é uma função
    typeof chatRoutesModule !== 'function'    // Verifica se chatRoutesModule é uma função
  ) {
    throw new Error("Um ou mais módulos de backend ou suas exportações essenciais não foram encontrados ou não são funções.");
  }
  sendLogToViewer("[ElectronMain] Verificação de exportações dos módulos de backend OK.", "debug");
} catch (e) {
  console.error("Erro CRÍTICO ao carregar módulos de backend:", e) 
  sendLogToViewer(`Erro CRÍTICO ao carregar módulos de backend: ${e.message}\n${e.stack}`, "error");
  if (app.isReady()) { 
    dialog.showErrorBox("Erro de Módulo Crítico", `Não foi possível carregar módulos. Detalhes: ${e.message}`);
  }
  if (app && typeof app.quit === 'function') app.quit();
  else process.exit(1); 
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  mainWindow = new BrowserWindow({
    width: 450, height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false,
      devTools: process.env.NODE_ENV === "development", 
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"), 
    transparent: true, frame: false, resizable: false, show: false, 
    backgroundColor: "#00000000", hasShadow: false, thickFrame: false, 
  })

  mainWindow.webContents.on("did-finish-load", () => {
    sendLogToViewer("[createMainWindow] Evento did-finish-load disparado para mainWindow.", "debug")
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show() 
    }
  })

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    sendLogToViewer(
      `[createMainWindow] Falha ao carregar URL: ${validatedURL}. Código: ${errorCode}. Descrição: ${errorDescription}`,
      "error",
    )
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox("Erro de Carregamento", `Não foi possível carregar a página de login: ${errorDescription}`)
    }
  })

  mainWindow.loadURL(`http://localhost:${PORT}/index.html`) 
  mainWindow.on("closed", () => {
    mainWindow = null 
  })
  sendLogToViewer("Janela de login criada. Aguardando did-finish-load.")
}

function createChatWindow(agentInfo) {
  const agentId = agentInfo.agent 
  const agentName = agentInfo.name || agentId

  if (chatWindows[agentId] && !chatWindows[agentId].isDestroyed()) {
    chatWindows[agentId].focus()
    return
  }
  const newChatWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: process.env.NODE_ENV === "development",
    },
    title: `Chat - Usuário: ${agentName}`, 
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  newChatWindow.loadURL(
    `http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`,
  )
  newChatWindow.on("closed", () => {
    delete chatWindows[agentId]
    sendLogToViewer(`Janela de chat para o usuário ${agentName} (${agentId}) fechada.`)
  })
  chatWindows[agentId] = newChatWindow
  sendLogToViewer(`Janela de chat criada para o usuário: ${agentName} (${agentId})`)
}

function createAdminWindow(adminInfoToUse) {
  if (!adminInfoToUse || typeof adminInfoToUse.name === "undefined") {
    sendLogToViewer(`[createAdminWindow] Erro: adminInfo inválido. adminInfo: ${JSON.stringify(adminInfoToUse)}`,"error");
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus(); else createMainWindow();
    return;
  }
  if (adminWindow && !adminWindow.isDestroyed()) {
    adminWindow.focus(); return;
  }
  adminWindow = new BrowserWindow({
    width: 1000, height: 750, minWidth: 900, minHeight: 650, 
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: process.env.NODE_ENV === "development",
    },
    title: `Admin - ${adminInfoToUse.name || "Administrador"}`,
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  adminWindow.loadURL(`http://localhost:${PORT}/admin.html`)
  adminWindow.on("closed", () => {
    sendLogToViewer(`[createAdminWindow] Janela de admin para ${currentAdminInfo ? currentAdminInfo.name : "N/A"} fechada.`, "info");
    adminWindow = null
  })
  currentAdminInfo = adminInfoToUse 
  sendLogToViewer(`Janela de administração criada para: ${adminInfoToUse.name}`)
}

function createLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus()
    return
  }
  logsWindow = new BrowserWindow({
    width: 900, height: 650, title: "Logs do Sistema - Notary Connect",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), contextIsolation: true,
      nodeIntegration: false, devTools: process.env.NODE_ENV === "development",
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  logsWindow.loadURL(`http://localhost:${PORT}/logsViewer.html`)
  logsWindow.webContents.once("did-finish-load", () => {
    if (logsWindow && !logsWindow.isDestroyed()) {
      logsWindow.webContents.send("initial-logs-data", logBuffer)
      sendLogToViewer(`[createLogsWindow] Histórico de ${logBuffer.length} logs enviado.`, "debug")
    }
  })
  logsWindow.on("closed", () => { logsWindow = null })
  sendLogToViewer("Janela de logs criada.", "info")
}
function setupMenu() {
  const template = [
    { label: "Arquivo", submenu: [
        { label: "Ver Logs", click: () => createLogsWindow() }, { role: "reload" },
        { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "quit" }
    ]}, { label: "Editar", role: "editMenu" }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}


async function initializeDatabases() {
  try {
    if (sqliteMainService && typeof sqliteMainService.connect === "function") {
      await sqliteMainService.connect();
      if(typeof sqliteMainService.createTablesIfNotExists === 'function') await sqliteMainService.createTablesIfNotExists();
      if(typeof sqliteMainService.initializeDefaultConfigs === 'function') await sqliteMainService.initializeDefaultConfigs();
    } else { throw new Error("sqliteMainService não está configurado ou não possui connect()."); }

    if (sqliteAdminService && typeof sqliteAdminService.connect === "function") {
      await sqliteAdminService.connect();
      if(typeof sqliteAdminService.createTablesIfNotExists === 'function') await sqliteAdminService.createTablesIfNotExists();
      if(typeof sqliteAdminService.initializeDefaultUsers === 'function') await sqliteAdminService.initializeDefaultUsers(); 
    } else { throw new Error("sqliteAdminService não está configurado ou não possui connect()."); }

    if (sqliteChatService && typeof sqliteChatService.connect === "function") {
      await sqliteChatService.connect();
      if(typeof sqliteChatService.createTablesIfNotExists === 'function') await sqliteChatService.createTablesIfNotExists();
      if (typeof sqliteChatService.setAdminService === 'function' && sqliteAdminService) {
        sqliteChatService.setAdminService(sqliteAdminService); // Injeta dependência
      }
    } else { throw new Error("sqliteChatService não está configurado ou não possui connect()."); }
    
    sendLogToViewer("[DB Init] Todos os bancos de dados SQLite inicializados com sucesso.", "info");
  } catch (dbError) {
    sendLogToViewer(`Erro CRÍTICO durante a inicialização dos bancos de dados SQLite: ${dbError.message}\n${dbError.stack}`, "error");
    dialog.showErrorBox("Erro de Banco de Dados", `Não foi possível inicializar. Detalhes: ${dbError.message}`);
    app.quit();
    process.exit(1);
  }
}


app.whenReady().then(async () => {
  sendLogToViewer("[AppReady] Evento 'whenReady' disparado.", "info");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' ws://localhost:${PORT} wss://localhost:${PORT}; img-src 'self' data: https://*; object-src 'none'; frame-ancestors 'none';`
        ]
      }
    })
  });
  sendLogToViewer("[AppReady] Content Security Policy configurada.", "info");

  // Injeta o logger nos serviços de banco de dados
  if (sqliteMainService && typeof sqliteMainService.setLogger === "function") sqliteMainService.setLogger(sendLogToViewer);
  if (sqliteAdminService && typeof sqliteAdminService.setLogger === "function") sqliteAdminService.setLogger(sendLogToViewer);
  if (sqliteChatService && typeof sqliteChatService.setLogger === "function") sqliteChatService.setLogger(sendLogToViewer);
  
  // Injeta o logger nos serviços de WhatsApp e WebSocket
  if (whatsappService && typeof whatsappService.setLogger === 'function') whatsappService.setLogger(sendLogToViewer); 
  if (websocketService && typeof websocketService.setLogger === 'function') websocketService.setLogger(sendLogToViewer); 

  // O logger para os módulos de rota (authRoutesModule, adminRoutesModule, chatRoutesModule)
  // será passado quando suas funções forem chamadas para obter os roteadores.

  setupMenu()
  await initializeDatabases(); 

  const expressApp = express()
  expressApp.use(express.json())
  // Serve arquivos estáticos da pasta 'uploads' para permitir acesso a mídias enviadas
  const uploadsPath = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
  expressApp.use('/uploads', express.static(uploadsPath)); // Rota para servir arquivos de uploads
  
  const staticPath = path.join(__dirname, "frontend/web")
  expressApp.use(express.static(staticPath))
  
  // Configura as rotas chamando as funções dos módulos e passando as dependências
  const authRouter = authRoutesModule(sqliteAdminService, sendLogToViewer);
  expressApp.use("/api/auth", authRouter); 
  
  const adminRouter = adminRoutesModule(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogToViewer);
  expressApp.use("/api/admin", adminRouter); 

  const chatRouter = chatRoutesModule(sendLogToViewer); // Passa o logger para chatRoutes
  expressApp.use("/api/chat", chatRouter); // Define o prefixo para as rotas de chat

  expressApp.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(staticPath, "index.html")))
  expressApp.get("/chat.html", (req, res) => res.sendFile(path.join(staticPath, "chat.html")))
  expressApp.get("/admin.html", (req, res) => res.sendFile(path.join(staticPath, "admin.html")))
  expressApp.get("/logsViewer.html", (req, res) => res.sendFile(path.join(staticPath, "logsViewer.html")))

  const internalServer = httpServer.createServer(expressApp)

  const dbServices = {
    main: sqliteMainService,
    admin: sqliteAdminService,
    chat: sqliteChatService
  };

  if (
    websocketService && typeof websocketService.initializeWebSocketServer === "function" &&
    whatsappService && dbServices.main && dbServices.admin && dbServices.chat
  ) {
    // Passa as instâncias dos serviços de DB para o websocketService
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, whatsappService, dbServices) 
    sendLogToViewer("Servidor WebSocket inicializado com sucesso.", "info")
  } else {
    sendLogToViewer("Falha ao inicializar o servidor WebSocket: um ou mais serviços críticos não estão definidos.", "error")
  }

  try {
    if (
      whatsappService && typeof whatsappService.connectToWhatsApp === "function" &&
      websocketService && dbServices.main && dbServices.admin && dbServices.chat
    ) {
      const appUserDataPath = app.getPath("userData") 
      sendLogToViewer(`[electronMain] Caminho de dados do usuário para WhatsApp Service: ${appUserDataPath}`, "info")
      // Passa as instâncias dos serviços de DB para o whatsappService
      await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServices, appUserDataPath) 
      sendLogToViewer("Serviço WhatsApp (whatsapp-web.js) iniciado e tentando conectar ao WhatsApp.")
    } else {
      sendLogToViewer("Falha ao iniciar WhatsApp Service: um ou mais serviços não estão definidos.", "error")
    }
  } catch (err) {
    sendLogToViewer(`Falha CRÍTICA ao iniciar o serviço WhatsApp: ${err.message}.`, "error")
  }

  internalServer
    .listen(PORT, () => {
      sendLogToViewer(`Servidor HTTP e WebSocket interno rodando em http://localhost:${PORT}`)
      createMainWindow()
    })
    .on("error", (err) => {
      sendLogToViewer(`Erro ao iniciar o servidor interno na porta ${PORT}: ${err.message}`, "error")
      dialog.showErrorBox("Erro de Servidor",`Não foi possível iniciar o servidor. Detalhes: ${err.message}`);
      app.quit(); process.exit(1);
    })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", async () => {
  sendLogToViewer("Todas as janelas foram fechadas.")
  if (process.platform !== "darwin") {
    if (whatsappService && typeof whatsappService.getClient === "function") { 
      const whatsClient = whatsappService.getClient() 
      if (whatsClient && typeof whatsClient.logout === "function") {
        sendLogToViewer("Desconectando WhatsApp Service...")
        try { await whatsClient.logout(); sendLogToViewer("WhatsApp Service desconectado com sucesso.") } 
        catch (e) { sendLogToViewer(`Erro ao desconectar WhatsApp Service (logout): ${e.message}`, "error");
          if (typeof whatsClient.destroy === 'function') {
            try { await whatsClient.destroy(); sendLogToViewer("WhatsApp Service (client) destruído.", "warn");} 
            catch (destroyErr) { sendLogToViewer(`Erro ao destruir WhatsApp Service (client): ${destroyErr.message}`, "error");}
          }
        }
      } else if (whatsClient && typeof whatsClient.destroy === 'function') {
         sendLogToViewer("Método logout não encontrado no cliente WhatsApp, tentando destruir...", "warn");
         try { await whatsClient.destroy(); sendLogToViewer("Cliente WhatsApp destruído.", "info"); } 
         catch (e) { sendLogToViewer(`Erro ao destruir cliente WhatsApp: ${e.message}`, "error");}
      } else { sendLogToViewer("Cliente WhatsApp não disponível ou métodos logout/destroy não são funções.", "info") }
    }

    try {
      if (sqliteMainService && typeof sqliteMainService.close === "function") await sqliteMainService.close();
      if (sqliteAdminService && typeof sqliteAdminService.close === "function") await sqliteAdminService.close();
      if (sqliteChatService && typeof sqliteChatService.close === "function") await sqliteChatService.close();
      sendLogToViewer("[ElectronMain] Todas as conexões SQLite foram fechadas.", "info");
    } catch (dbCloseError) {
      sendLogToViewer(`Erro ao fechar conexões SQLite: ${dbCloseError.message}`, "error")
    }

    sendLogToViewer("Encerrando aplicação.")
    app.quit()
  }
})

ipcMain.on("control-bot", async (event, data) => {
  const { action } = data;
  const currentSessionId = whatsappService?.sessionId || "whatsapp-bot-session"; 

  sendLogToViewer(`[IPC control-bot] Ação recebida: ${action} para sessão: ${currentSessionId}`, "info")

  if (!whatsappService || !websocketService) {
    sendLogToViewer("[IPC control-bot] Erro: Um ou mais serviços (WhatsApp, WebSocket) não estão disponíveis.", "error")
    return
  }

  try {
    if (action === "pause") {
      const isNowPaused = await whatsappService.togglePauseBot()
      sendLogToViewer(`[IPC control-bot] Bot ${isNowPaused ? "pausado" : "retomado"}.`, "info")
    } else if (action === "restart") {
      sendLogToViewer("[IPC control-bot] Iniciando reinício do bot...", "info")
      try {
        await whatsappService.fullLogoutAndCleanup() 
        
        sendLogToViewer("[IPC control-bot] Tentando reconectar WhatsApp Service após limpeza completa...", "info")
        const appUserDataPath = app.getPath("userData")
        const dbServices = { main: sqliteMainService, admin: sqliteAdminService, chat: sqliteChatService };
        await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, dbServices, appUserDataPath)

        websocketService.broadcastToAdmins({ 
          type: "status_update",
          clientId: currentSessionId, 
          payload: { status: "RESTARTING", reason: "Solicitado pelo administrador" },
        })
      } catch (restartError) {
        sendLogToViewer(`[IPC control-bot] Erro durante o reinício do bot: ${restartError.message}`, "error")
        websocketService.broadcastToAdmins({ 
          type: "status_update",
          clientId: currentSessionId,
          payload: { status: "FATAL_ERROR", reason: `Erro durante reinício: ${restartError.message}` },
        })
      }
    } else {
      sendLogToViewer(`[IPC control-bot] Ação desconhecida: ${action}`, "warn")
    }
  } catch (error) {
    sendLogToViewer(`[IPC control-bot] Erro ao executar ação '${action}': ${error.message}`, "error")
    console.error(error.stack)
  }
})

ipcMain.on("navigate", (event, receivedPayload) => {
  sendLogToViewer(`[IPC Navigate] Payload recebido: ${JSON.stringify(receivedPayload)}`, "debug")
  const { targetPage, agentInfo, adminInfo: receivedAdminInfo } = receivedPayload
  sendLogToViewer(
    `[IPC Navigate] Tentando navegar para: '${targetPage}'. AgentInfo: ${JSON.stringify(agentInfo)}. AdminInfo Recebido: ${JSON.stringify(receivedAdminInfo)}. currentAdminInfo: ${JSON.stringify(currentAdminInfo)}`,
    "info",
  )

  if (mainWindow && !mainWindow.isDestroyed() && targetPage !== "login") {
    mainWindow.close()
    mainWindow = null
  }
  Object.values(chatWindows).forEach((win) => {
    if (win && !win.isDestroyed() && targetPage !== "chat") win.close()
  })
  if (targetPage !== "chat") chatWindows = {}

  if (adminWindow && !adminWindow.isDestroyed() && targetPage !== "admin" && targetPage !== "logs") {
    adminWindow.close()
    adminWindow = null
  }
  
  if (logsWindow && !logsWindow.isDestroyed() && targetPage !== "logs" && targetPage !== "admin") {
    logsWindow.close()
    logsWindow = null
  }

  if (targetPage === "chat" && agentInfo && agentInfo.agent) {
    createChatWindow(agentInfo)
  } else if (targetPage === "admin") {
    const adminDataToUse = receivedAdminInfo || currentAdminInfo
    if (adminDataToUse && typeof adminDataToUse.name !== "undefined") {
      if (receivedAdminInfo && (!currentAdminInfo || currentAdminInfo.name !== receivedAdminInfo.name)) {
        currentAdminInfo = receivedAdminInfo
      }
      createAdminWindow(currentAdminInfo)
    } else {
      sendLogToViewer(
        `[IPC Navigate] Informação do admin não disponível para abrir a página de admin. Redirecionando para login.`,
        "warn",
      )
      currentAdminInfo = null
      createMainWindow()
    }
  } else if (targetPage === "login") {
    currentAdminInfo = null 
    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.close()
    if (logsWindow && !logsWindow.isDestroyed()) logsWindow.close() 
    createMainWindow()
  } else if (targetPage === "logs") {
    createLogsWindow()
  } else {
    sendLogToViewer(
      `[IPC Navigate] Falha na navegação: Página '${targetPage}' desconhecida ou informações insuficientes.`,
      "warn",
    )
    if (!mainWindow || (mainWindow && mainWindow.isDestroyed())) {
      if (targetPage !== "login") {
        sendLogToViewer(
          `[IPC Navigate] Nenhuma janela principal ativa após falha de navegação para '${targetPage}'. Reabrindo janela de login.`,
          "warn",
        )
        createMainWindow()
      }
    }
  }
})

ipcMain.on("admin-logout", () => {
  sendLogToViewer("[IPC admin-logout] Admin fez logout. Limpando currentAdminInfo.", "info")
  currentAdminInfo = null
})

ipcMain.on("open-dev-tools", (event) => {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    focusedWindow.webContents.openDevTools()
    sendLogToViewer(`DevTools aberto para a janela: ${focusedWindow.title}`, "info")
  } else {
    sendLogToViewer("Nenhuma janela focada para abrir DevTools.", "warn")
  }
})

ipcMain.on("request-initial-logs", (event) => {
  sendLogToViewer("[IPC request-initial-logs] Janela de logs solicitou histórico de logs.", "debug")
  if (event.sender && !event.sender.isDestroyed()) {
    event.sender.send("initial-logs-data", logBuffer)
  }
})

ipcMain.on("close-app", () => {
  sendLogToViewer("[IPC close-app] Solicitação para fechar a aplicação recebida.", "info")
  app.quit()
})

process.on("uncaughtException", (error, origin) => {
  const errorMessage = `Exceção não capturada no processo principal: ${error.message}\nOrigem: ${origin}\nStack: ${error.stack}`
  console.error(errorMessage)
  sendLogToViewer(errorMessage, "error")
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        "Erro Inesperado no Processo Principal",
        `Ocorreu um erro crítico não tratado. Detalhes: ${error.message}`,
      )
    }
  } catch (e) {
    /* ignore */
  }
})

process.on("unhandledRejection", (reason, promise) => {
  const errorMessage = `Rejeição de promessa não tratada no processo principal: ${reason instanceof Error ? reason.message : String(reason)}\nStack: ${reason instanceof Error ? reason.stack : "N/A"}`
  console.error(errorMessage)
  sendLogToViewer(errorMessage, "error")
})
