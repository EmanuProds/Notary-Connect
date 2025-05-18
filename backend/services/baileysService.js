// backend/services/baileysService.js
const {
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
} = require("baileys")
const Pino = require("pino")
const path = require("path")
const fs = require("fs")

let sock
const exportedSessionId = "whatsapp-bot-session"
let globalSendLog
let globalWebsocketService
let globalSqliteService
let currentQR = null
let connectionStatus = "DISCONNECTED"
let isBotPaused = false

// O caminho completo para a pasta de autenticação será construído em connectToWhatsApp
let authInfoPath // Ex: /home/emanuel/.config/notary-connect-electron/Auth/whatsapp-bot-session

// Função auxiliar para logar tipos de chaves (mantida para depuração, se necessário)
function logKeyTypes(obj, prefix = "") {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key]
      const currentPath = prefix ? `${prefix}.${key}` : key
      if (Buffer.isBuffer(value)) {
        globalSendLog(`[Baileys KeyType] ${currentPath}: Buffer (length ${value.length})`, "debug")
      } else if (value instanceof Uint8Array) {
        globalSendLog(`[Baileys KeyType] ${currentPath}: Uint8Array (length ${value.length})`, "debug")
      } else if (typeof value === "object" && value !== null) {
        if (value.type === "Buffer" && Array.isArray(value.data)) {
          globalSendLog(
            `[Baileys KeyType] ${currentPath}: Serialized Buffer Object (length ${value.data.length})`,
            "debug",
          )
        } else {
          logKeyTypes(value, currentPath)
        }
      }
    }
  }
}

async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, sqliteServiceInstance, appUserDataPath) {
  globalSendLog = sendLogFunction
  globalWebsocketService = websocketServiceInstance
  globalSqliteService = sqliteServiceInstance

  // Define o caminho para a pasta de autenticação da sessão DENTRO da pasta de dados do usuário
  if (!appUserDataPath) {
    const errorMessage =
      "[Baileys] Erro CRÍTICO: O caminho para a pasta de dados do usuário (appUserDataPath) não foi fornecido."
    globalSendLog(errorMessage, "error")
    if (globalWebsocketService) {
      globalWebsocketService.broadcastToAdmins({
        type: "status_update",
        clientId: exportedSessionId,
        payload: { status: "FATAL_ERROR", reason: errorMessage },
      })
    }
    return null
  }
  // Cria uma subpasta "Auth" dentro de appUserDataPath para as sessões do Baileys
  const authBaseDir = path.join(appUserDataPath, "Auth")
  authInfoPath = path.join(authBaseDir, exportedSessionId) // Subpasta para esta sessão específica

  globalSendLog(`[Baileys] Caminho da pasta de dados do usuário recebido: ${appUserDataPath}`, "debug")
  globalSendLog(`[Baileys] Caminho base para autenticação definido como: ${authBaseDir}`, "debug")
  globalSendLog(`[Baileys] Caminho completo para arquivos de autenticação da sessão: ${authInfoPath}`, "info")

  // Garante que a pasta de autenticação exista
  if (!fs.existsSync(authInfoPath)) {
    try {
      fs.mkdirSync(authInfoPath, { recursive: true })
      globalSendLog(`[Baileys] Pasta de autenticação criada em: ${authInfoPath}`, "info")
    } catch (mkdirErr) {
      globalSendLog(
        `[Baileys] Erro CRÍTICO ao criar pasta de autenticação ${authInfoPath}: ${mkdirErr.message}`,
        "error",
      )
      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: exportedSessionId,
          payload: { status: "FATAL_ERROR", reason: `Erro ao criar pasta de auth: ${mkdirErr.message}` },
        })
      }
      return null
    }
  }

  globalSendLog(`[Baileys] Iniciando conexão com WhatsApp. Usando pasta de autenticação: ${authInfoPath}`, "info")
  isBotPaused = false

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authInfoPath)
    globalSendLog(
      `[Baileys] Estado de autenticação (useMultiFileAuthState) carregado/inicializado de ${authInfoPath}.`,
      "debug",
    )

    sock = makeWASocket({
      logger: Pino({ level: "silent" }).child({ level: "silent" }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "silent" }).child({ level: "silent" })),
      },
      browser: Browsers.macOS("Desktop"),
      generateHighQualityLinkPreview: true,
      shouldIgnoreJid: (jid) => jid?.endsWith("@broadcast"),
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage)
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          }
        }
        return message
      },
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update
      currentQR = qr || null

      if (qr) {
        connectionStatus = "QR_CODE"
        globalSendLog("[Baileys] QR Code recebido. Enviando para admin via WebSocket.", "info")
        if (globalWebsocketService) {
          globalWebsocketService.broadcastToAdmins({
            type: "qr_code",
            clientId: exportedSessionId,
            payload: { qr: qr },
          })
        }
        if (globalSqliteService) {
          await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, "QR_REQUESTED", sock?.user?.id, qr)
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        // Modificado para reconectar mesmo com erro 515 (restartRequired)
        const shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.connectionClosed &&
          statusCode !== DisconnectReason.connectionReplaced &&
          statusCode !== DisconnectReason.timedOut

        // Tratamento especial para erro 515 (restartRequired)
        const isRestartRequired = statusCode === DisconnectReason.restartRequired

        connectionStatus = "DISCONNECTED"
        const errorMessage = lastDisconnect?.error?.message || lastDisconnect?.error?.toString() || "Desconhecida"
        globalSendLog(
          `[Baileys] Conexão fechada. Razão: ${errorMessage}. Status: ${statusCode}. Reconectar: ${shouldReconnect}`,
          "warn",
        )

        if (lastDisconnect?.error) {
          globalSendLog(
            `[Baileys] Detalhes completos do erro de desconexão: ${JSON.stringify(lastDisconnect.error, Object.getOwnPropertyNames(lastDisconnect.error))}`,
            "error",
          )
        }

        if (globalWebsocketService) {
          globalWebsocketService.broadcastToAdmins({
            type: "status_update",
            clientId: exportedSessionId,
            payload: { status: "DISCONNECTED", reason: statusCode, error: errorMessage },
          })
        }
        if (globalSqliteService) {
          await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, "DISCONNECTED", sock?.user?.id)
        }

        if (isRestartRequired) {
          globalSendLog(
            "[Baileys] Erro 515 (Restart Required). Tentando limpar sessão e reconectar automaticamente...",
            "warn",
          )

          // Limpar arquivos de sessão antes de reconectar
          try {
            if (fs.existsSync(authInfoPath)) {
              fs.rmSync(authInfoPath, { recursive: true, force: true })
              fs.mkdirSync(authInfoPath, { recursive: true })
              globalSendLog(`[Baileys] Pasta de autenticação limpa e recriada: ${authInfoPath}`, "info")
            }
          } catch (cleanupErr) {
            globalSendLog(`[Baileys] Erro ao limpar pasta de autenticação: ${cleanupErr.message}`, "error")
          }

          // Reconectar após limpar a sessão
          globalSendLog("[Baileys] Tentando reconectar após limpeza de sessão...", "info")
          setTimeout(
            () => connectToWhatsApp(globalSendLog, globalWebsocketService, globalSqliteService, appUserDataPath),
            3000,
          )
        } else if (shouldReconnect) {
          globalSendLog("[Baileys] Tentando reconectar em 5 segundos...", "info")
          // Passa appUserDataPath novamente para a reconexão
          setTimeout(
            () => connectToWhatsApp(globalSendLog, globalWebsocketService, globalSqliteService, appUserDataPath),
            5000,
          )
        } else {
          globalSendLog(
            `[Baileys] Deslogado, timeout ou conexão substituída. Não será reconectado automaticamente. Razão do erro: ${errorMessage}`,
            "error",
          )
        }
      } else if (connection === "open") {
        connectionStatus = "CONNECTED"
        currentQR = null
        isBotPaused = false
        globalSendLog(`[Baileys] Conexão com WhatsApp estabelecida! Usuário: ${sock.user?.id || "N/A"}`, "info")
        if (globalWebsocketService) {
          globalWebsocketService.broadcastToAdmins({
            type: "status_update",
            clientId: exportedSessionId,
            payload: { status: "READY", jid: sock.user?.id, isPaused: isBotPaused },
          })
        }
        if (globalSqliteService) {
          await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, "CONNECTED", sock.user?.id)
        }
      }
    })

    sock.ev.on("messages.upsert", async (m) => {
      // Lógica de recebimento de mensagens (mantida como antes)
    })
    return sock
  } catch (error) {
    globalSendLog(`[Baileys] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, "error")
    globalSendLog(error.stack, "error")
    if (globalWebsocketService) {
      globalWebsocketService.broadcastToAdmins({
        type: "status_update",
        clientId: exportedSessionId,
        payload: { status: "FATAL_ERROR", reason: error.message },
      })
    }
    return null
  }
}

async function sendWhatsAppMessage(
  toJid,
  messageContentBaileys,
  agentUsername,
  conversationId,
  sqliteServiceInstancePassed,
) {
  const serviceToUse = sqliteServiceInstancePassed || globalSqliteService

  if (isBotPaused) {
    globalSendLog(`[Baileys] Bot pausado. Não é possível enviar mensagem para ${toJid}.`, "warn")
    return null
  }
  if (!sock || connectionStatus !== "CONNECTED") {
    globalSendLog(`[Baileys] Não é possível enviar mensagem. Socket não conectado. Status: ${connectionStatus}`, "warn")
    return null
  }
  try {
    globalSendLog(
      `[Baileys] Enviando mensagem para ${toJid} pelo atendente ${agentUsername}: ${JSON.stringify(messageContentBaileys)}`,
      "info",
    )
    const sentMsg = await sock.sendMessage(toJid, messageContentBaileys)
    globalSendLog(`[Baileys] Mensagem enviada com ID Baileys: ${sentMsg.key.id}`, "info")

    if (serviceToUse && typeof serviceToUse.saveMessage === "function") {
      const savedMessage = await serviceToUse.saveMessage({
        conversation_id: conversationId,
        baileys_msg_id: sentMsg.key.id,
        sender_type: "AGENT",
        sender_jid: sock.user?.id,
        message_content: messageContentBaileys.text || JSON.stringify(messageContentBaileys),
        message_type: messageContentBaileys.text ? "text" : messageContentBaileys.image ? "image" : "media",
        timestamp: new Date(Number.parseInt(sentMsg.messageTimestamp) * 1000).toISOString(),
        is_read_by_agent: true,
      })
      return savedMessage
    } else {
      globalSendLog(
        "[Baileys] sqliteService não está disponível para salvar mensagem enviada no histórico do DB.",
        "warn",
      )
      return {
        baileys_msg_id: sentMsg.key.id,
        timestamp: new Date(Number.parseInt(sentMsg.messageTimestamp) * 1000).toISOString(),
      }
    }
  } catch (error) {
    globalSendLog(`[Baileys] Erro ao enviar mensagem para ${toJid}: ${error.message}`, "error")
    return null
  }
}

function getCurrentStatusAndQR() {
  return {
    sessionId: exportedSessionId,
    status: connectionStatus,
    qrCode: currentQR,
    jid: sock?.user?.id,
    isPaused: isBotPaused,
  }
}

function getSocket() {
  return sock
}

async function togglePauseBot() {
  isBotPaused = !isBotPaused
  globalSendLog(`[Baileys] Estado de pausa do bot alterado para: ${isBotPaused}`, "info")
  if (globalWebsocketService) {
    globalWebsocketService.broadcastToAdmins({
      type: "bot_status_update",
      payload: { isPaused: isBotPaused, statusMessage: `Robô ${isBotPaused ? "pausado" : "ativo"}.` },
    })
  }
  return isBotPaused
}

async function fullLogoutAndCleanup() {
  globalSendLog("[Baileys] Iniciando logout completo e limpeza da sessão em arquivos...", "info")
  if (sock) {
    try {
      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: exportedSessionId,
          payload: { status: "DISCONNECTING", reason: "Logout/Restart solicitado" },
        })
      }
      await sock.logout()
      globalSendLog("[Baileys] Logout do Baileys (socket) realizado com sucesso.", "info")
    } catch (e) {
      globalSendLog(
        `[Baileys] Erro durante o logout do socket: ${e.message}. Tentando desconexão forçada do WebSocket.`,
        "warn",
      )
      if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
        sock.ws.close()
      }
    }
    sock = null
  } else {
    globalSendLog("[Baileys] Socket não existente para logout.", "warn")
  }
  connectionStatus = "DISCONNECTED"
  currentQR = null
  isBotPaused = false

  // Limpa a pasta de autenticação (authInfoPath é definido em connectToWhatsApp)
  if (authInfoPath && fs.existsSync(authInfoPath)) {
    try {
      fs.rmSync(authInfoPath, { recursive: true, force: true })
      globalSendLog(`[Baileys] Pasta de autenticação (${authInfoPath}) removida com sucesso.`, "info")
    } catch (err) {
      globalSendLog(`[Baileys] Erro ao remover pasta de autenticação (${authInfoPath}): ${err.message}`, "error")
    }
  } else {
    globalSendLog(
      `[Baileys] Pasta de autenticação (${authInfoPath || "N/A"}) não encontrada ou não definida para remoção.`,
      "warn",
    )
  }

  if (globalSqliteService && typeof globalSqliteService.updateWhatsappSessionStatus === "function") {
    try {
      await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, "CLEARED_FOR_RESTART", null, null)
      globalSendLog(
        `[Baileys] Status da sessão ${exportedSessionId} atualizado para CLEARED_FOR_RESTART no DB.`,
        "info",
      )
    } catch (dbError) {
      globalSendLog(`[Baileys] Erro ao atualizar status da sessão no DB durante limpeza: ${dbError.message}`, "error")
    }
  }

  globalSendLog("[Baileys] Limpeza para reinício (baseada em arquivos) concluída.", "info")
}

module.exports = {
  connectToWhatsApp,
  sendWhatsAppMessage,
  getSocket,
  getCurrentStatusAndQR,
  togglePauseBot,
  fullLogoutAndCleanup,
  sessionId: exportedSessionId,
}
