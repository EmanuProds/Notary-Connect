// electronMain.js
const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require("electron") // Adicionado session
const path = require("path")
const httpServer = require("http")
const express = require("express")
const fs = require("fs")

let sqliteService
let whatsappService
let websocketService
let authRoutesModule
let adminRoutesModule

const PORT = process.env.ELECTRON_PORT || 3000

let mainWindow
let chatWindows = {}
let adminWindow
let logsWindow
let currentAdminInfo = null

const MAX_LOG_BUFFER_SIZE = 500
const logBuffer = []

function sendLogToViewer(logString, level = "info") {
  const formattedLog = `[${level.toUpperCase()}] ${new Date().toISOString()} - ${logString}`

  logBuffer.push(formattedLog)
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
    logBuffer.shift()
  }

  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.webContents.send("log-data", formattedLog)
  }
  if (level === "error") console.error(formattedLog)
  else if (level === "warn") console.warn(formattedLog)
  else console.log(formattedLog)
}

try {
  sendLogToViewer("[ElectronMain] Iniciando carregamento dos módulos de backend...", "debug");
  sqliteService = require("./backend/services/sqliteService")
  whatsappService = require("./backend/services/whatsappService")
  websocketService = require("./backend/services/websocketService")
  authRoutesModule = require("./backend/routes/authRoutes")
  adminRoutesModule = require("./backend/routes/adminRoutes")
  sendLogToViewer("[ElectronMain] Módulos de backend carregados.", "debug");

  if (
    !sqliteService ||
    !whatsappService ||
    !websocketService ||
    !authRoutesModule ||
    !authRoutesModule.router ||
    !authRoutesModule.setLogger ||
    !adminRoutesModule ||
    !adminRoutesModule.router ||
    !adminRoutesModule.setLogger
  ) {
    throw new Error(
      "Um ou mais módulos de backend ou suas exportações essenciais (router, setLogger) não foram encontrados.",
    )
  }
  sendLogToViewer("[ElectronMain] Verificação de exportações dos módulos de backend OK.", "debug");
} catch (e) {
  console.error("Erro CRÍTICO ao carregar módulos de backend:", e)
  sendLogToViewer(`Erro CRÍTICO ao carregar módulos de backend: ${e.message}\n${e.stack}`, "error");
  if (app.isReady()) {
    dialog.showErrorBox(
      "Erro de Módulo Crítico",
      `Não foi possível carregar módulos de backend. A aplicação será encerrada. Detalhes: ${e.message}`,
    )
  }
  app.quit()
  process.exit(1)
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    return
  }
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: process.env.NODE_ENV === "development",
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
    transparent: true,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#00000000",
    hasShadow: false,
    thickFrame: false,
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
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: `Chat - Atendente: ${agentName}`,
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  newChatWindow.loadURL(
    `http://localhost:${PORT}/chat.html?agentId=${encodeURIComponent(agentId)}&agentName=${encodeURIComponent(agentName)}`,
  )
  newChatWindow.on("closed", () => {
    delete chatWindows[agentId]
    sendLogToViewer(`Janela de chat para o atendente ${agentName} (${agentId}) fechada.`)
  })
  chatWindows[agentId] = newChatWindow
  sendLogToViewer(`Janela de chat criada para o atendente: ${agentName} (${agentId})`)
}

function createAdminWindow(adminInfoToUse) {
  if (!adminInfoToUse || typeof adminInfoToUse.name === "undefined") {
    sendLogToViewer(
      `[createAdminWindow] Erro: adminInfo inválido ou sem nome. adminInfo: ${JSON.stringify(adminInfoToUse)}`,
      "error",
    )
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
    else createMainWindow()
    return
  }

  if (adminWindow && !adminWindow.isDestroyed()) {
    sendLogToViewer(`[createAdminWindow] Janela de admin já existe para ${adminInfoToUse.name}. Focando.`, "debug")
    adminWindow.focus()
    if (logsWindow && !logsWindow.isDestroyed()) {
      logsWindow.close()
    }
    return
  }
  adminWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: `Admin - ${adminInfoToUse.name || "Administrador"}`,
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  adminWindow.loadURL(`http://localhost:${PORT}/admin.html`)
  adminWindow.on("closed", () => {
    sendLogToViewer(
      `[createAdminWindow] Janela de admin para ${currentAdminInfo ? currentAdminInfo.name : "N/A"} fechada.`,
      "info",
    )
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
    width: 900,
    height: 650,
    title: "Logs do Sistema - Notary Connect",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "frontend/web/img/icons/logo.png"),
  })
  logsWindow.loadURL(`http://localhost:${PORT}/logsViewer.html`)

  logsWindow.webContents.once("did-finish-load", () => {
    if (logsWindow && !logsWindow.isDestroyed()) {
      logsWindow.webContents.send("initial-logs-data", logBuffer)
      sendLogToViewer(
        `[createLogsWindow] Histórico de ${logBuffer.length} logs enviado para a janela de logs via 'initial-logs-data'.`,
        "debug",
      )
    }
  })

  logsWindow.on("closed", () => {
    logsWindow = null
  })
  sendLogToViewer("Janela de logs criada.", "info")
}

function setupMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [
        { label: "Ver Logs", click: () => createLogsWindow() },
        { label: "Recarregar Janela", role: "reload" },
        { label: "Forçar Recarregamento", role: "forceReload" },
        { label: "Alternar Ferramentas de Desenvolvedor", role: "toggleDevTools" },
        { type: "separator" },
        { label: "Sair", role: "quit" },
      ],
    },
    { label: "Editar", role: "editMenu" },
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

async function initializeDatabase() {
  try {
    if (sqliteService && typeof sqliteService.connect === "function") {
      const dbConfig = require("./backend/config/dbConfigSqlite")
      await sqliteService.connect(dbConfig.databasePath)
      await sqliteService.createTablesIfNotExists()
      await sqliteService.initializeDefaultAttendants()
      await sqliteService.initializeDefaultConfigs()
      sendLogToViewer("[DB Init] Banco de dados SQLite inicializado com sucesso.", "info")
    } else {
      throw new Error("sqliteService ou sua função connect não está definida.")
    }
  } catch (dbError) {
    sendLogToViewer(`Erro CRÍTICO durante a inicialização do banco de dados SQLite: ${dbError.message}`, "error")
    dialog.showErrorBox(
      "Erro de Banco de Dados",
      `Não foi possível inicializar o banco de dados SQLite. A aplicação pode não funcionar corretamente.\n\nDetalhes: ${dbError.message}`,
    )
    app.quit()
    process.exit(1)
  }
}

app.whenReady().then(async () => {
  sendLogToViewer("[AppReady] Evento 'whenReady' disparado.", "info");

  // Configurar CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws://localhost:${PORT}; img-src 'self' data:; object-src 'none'; frame-ancestors 'none';`
        ]
      }
    })
  });
  sendLogToViewer("[AppReady] Content Security Policy configurada via onHeadersReceived.", "info");

  if (sqliteService && typeof sqliteService.setLogger === "function") {
    sqliteService.setLogger(sendLogToViewer)
    sendLogToViewer("[AppReady] Logger injetado no sqliteService.", "debug");
  }
  if (authRoutesModule && typeof authRoutesModule.setLogger === "function") {
    authRoutesModule.setLogger(sendLogToViewer)
    sendLogToViewer("[AppReady] Logger injetado no authRoutesModule.", "debug");
  }
  if (adminRoutesModule && typeof adminRoutesModule.setLogger === "function") {
    adminRoutesModule.setLogger(sendLogToViewer)
    sendLogToViewer("[AppReady] Logger injetado no adminRoutesModule.", "debug");
  }
  setupMenu()

  await initializeDatabase()

  const expressApp = express()
  expressApp.use(express.json())
  const staticPath = path.join(__dirname, "frontend/web")
  expressApp.use(express.static(staticPath))
  expressApp.use("/api/auth", authRoutesModule.router)
  expressApp.use("/api/admin", adminRoutesModule.router)

  expressApp.get(["/", "/index.html"], (req, res) => res.sendFile(path.join(staticPath, "index.html")))
  expressApp.get("/chat.html", (req, res) => res.sendFile(path.join(staticPath, "chat.html")))
  expressApp.get("/admin.html", (req, res) => res.sendFile(path.join(staticPath, "admin.html")))
  expressApp.get("/logsViewer.html", (req, res) => res.sendFile(path.join(staticPath, "logsViewer.html")))

  const internalServer = httpServer.createServer(expressApp)

  // Logs de depuração antes de inicializar o WebSocketService
  sendLogToViewer(`[AppReady] Verificando serviços para WebSocket:`, "debug");
  sendLogToViewer(`[AppReady] typeof websocketService: ${typeof websocketService}`, "debug");
  if (websocketService) {
    sendLogToViewer(`[AppReady] typeof websocketService.initializeWebSocketServer: ${typeof websocketService.initializeWebSocketServer}`, "debug");
  }
  sendLogToViewer(`[AppReady] typeof whatsappService: ${typeof whatsappService}`, "debug");
  sendLogToViewer(`[AppReady] typeof sqliteService: ${typeof sqliteService}`, "debug");


  if (
    websocketService &&
    typeof websocketService.initializeWebSocketServer === "function" &&
    whatsappService && // Verificando se whatsappService está definido
    sqliteService     // Verificando se sqliteService está definido
  ) {
    websocketService.initializeWebSocketServer(internalServer, sendLogToViewer, whatsappService, sqliteService)
    sendLogToViewer("Servidor WebSocket inicializado com sucesso.", "info")
  } else {
    sendLogToViewer("Falha ao inicializar o servidor WebSocket: um ou mais serviços críticos ou a função initializeWebSocketServer não estão definidos.", "error")
    // Log detalhado de qual condição falhou:
    if (!websocketService) sendLogToViewer("[AppReady_WS_Error] websocketService não está definido.", "error");
    if (websocketService && typeof websocketService.initializeWebSocketServer !== "function") sendLogToViewer("[AppReady_WS_Error] websocketService.initializeWebSocketServer não é uma função.", "error");
    if (!whatsappService) sendLogToViewer("[AppReady_WS_Error] whatsappService não está definido.", "error");
    if (!sqliteService) sendLogToViewer("[AppReady_WS_Error] sqliteService não está definido.", "error");
  }

  try {
    if (
      whatsappService &&
      typeof whatsappService.connectToWhatsApp === "function" &&
      websocketService &&
      sqliteService
    ) {
      const appUserDataPath = app.getPath("userData")
      sendLogToViewer(`[electronMain] Caminho de dados do usuário para WhatsApp Service: ${appUserDataPath}`, "info")
      await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, sqliteService, appUserDataPath)
      sendLogToViewer("Serviço WhatsApp (Baileys/WWJS) iniciado e tentando conectar ao WhatsApp.")
    } else {
      sendLogToViewer("Falha ao iniciar WhatsApp Service: um ou mais serviços não estão definidos ou connectToWhatsApp não é uma função.", "error")
    }
  } catch (err) {
    sendLogToViewer(`Falha CRÍTICA ao iniciar o serviço WhatsApp (Baileys/WWJS): ${err.message}.`, "error")
  }

  internalServer
    .listen(PORT, () => {
      sendLogToViewer(`Servidor HTTP e WebSocket interno rodando em http://localhost:${PORT}`)
      createMainWindow()
    })
    .on("error", (err) => {
      sendLogToViewer(`Erro ao iniciar o servidor interno na porta ${PORT}: ${err.message}`, "error")
      dialog.showErrorBox(
        "Erro de Servidor",
        `Não foi possível iniciar o servidor na porta ${PORT}. Verifique se a porta está em uso.\n\nDetalhes: ${err.message}`,
      )
      app.quit()
      process.exit(1)
    })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on("window-all-closed", async () => {
  sendLogToViewer("Todas as janelas foram fechadas.")
  if (process.platform !== "darwin") {
    if (whatsappService && typeof whatsappService.getClient === "function") { // Ajustado para getClient
      const whatsClient = whatsappService.getClient() // Ajustado para getClient
      // A lógica de logout pode variar entre whatsapp-web.js e Baileys
      // Para whatsapp-web.js, pode ser client.logout() ou client.destroy()
      // Para Baileys, sock.logout()
      if (whatsClient && typeof whatsClient.logout === "function") {
        sendLogToViewer("Desconectando WhatsApp Service...")
        try {
          await whatsClient.logout()
          sendLogToViewer("WhatsApp Service desconectado com sucesso.")
        } catch (e) {
          sendLogToViewer(`Erro ao desconectar WhatsApp Service: ${e.message}`, "error")
          if (typeof whatsClient.destroy === 'function') {
            try {
              await whatsClient.destroy();
              sendLogToViewer("WhatsApp Service (client) destruído após falha no logout.", "warn");
            } catch (destroyErr) {
              sendLogToViewer(`Erro ao destruir WhatsApp Service (client): ${destroyErr.message}`, "error");
            }
          }
        }
      } else if (whatsClient && typeof whatsClient.destroy === 'function') {
         sendLogToViewer("Método logout não encontrado, tentando destruir o cliente WhatsApp...", "warn");
         try {
            await whatsClient.destroy();
            sendLogToViewer("Cliente WhatsApp destruído com sucesso.", "info");
         } catch (e) {
            sendLogToViewer(`Erro ao destruir cliente WhatsApp: ${e.message}`, "error");
         }
      } else {
        sendLogToViewer("Cliente WhatsApp não disponível ou método logout/destroy não é função.", "info")
      }
    }

    try {
      if (sqliteService && typeof sqliteService.close === "function") {
        await sqliteService.close()
      }
    } catch (dbCloseError) {
      sendLogToViewer(`Erro ao fechar conexão SQLite: ${dbCloseError.message}`, "error")
    }

    sendLogToViewer("Encerrando aplicação.")
    app.quit()
  }
})

ipcMain.on("control-bot", async (event, data) => {
  const { action, sessionId: targetSessionIdReceived } = data
  const currentSessionId = // whatsappService.sessionId é para Baileys, WWJS pode não ter um sessionId igual
    (whatsappService && whatsappService.sessionId) // Adapte se whatsappService tiver uma propriedade similar
      ? whatsappService.sessionId
      : targetSessionIdReceived || "whatsapp-bot-session" // Fallback

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
        await whatsappService.fullLogoutAndCleanup() // Esta função deve lidar com a limpeza da sessão
        
        sendLogToViewer("[IPC control-bot] Tentando reconectar WhatsApp Service após limpeza completa...", "info")
        const appUserDataPath = app.getPath("userData")
        await whatsappService.connectToWhatsApp(sendLogToViewer, websocketService, sqliteService, appUserDataPath)

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
      if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.close()
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
    // ignore
  }
})

process.on("unhandledRejection", (reason, promise) => {
  const errorMessage = `Rejeição de promessa não tratada no processo principal: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : "N/A"}`
  console.error(errorMessage)
  sendLogToViewer(errorMessage, "error")
})
