// backend/services/whatsappService.js
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const path = require("path")

let client
const sessionId = "whatsapp-bot-session"
let globalSendLog
let globalWebsocketService
let globalSqliteService
let currentQR = null
let connectionStatus = "DISCONNECTED"
let isBotPaused = false
let authPath

async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, sqliteServiceInstance, appUserDataPath) {
  globalSendLog = sendLogFunction
  globalWebsocketService = websocketServiceInstance
  globalSqliteService = sqliteServiceInstance

  // Define the path for authentication data
  if (!appUserDataPath) {
    const errorMessage = "[WhatsApp] CRITICAL Error: User data path (appUserDataPath) not provided."
    globalSendLog(errorMessage, "error")
    if (globalWebsocketService) {
      globalWebsocketService.broadcastToAdmins({
        type: "status_update",
        clientId: sessionId,
        payload: { status: "FATAL_ERROR", reason: errorMessage },
      })
    }
    return null
  }

  // Create Auth directory inside appUserDataPath
  authPath = path.join(appUserDataPath, "Auth", sessionId)

  globalSendLog(`[WhatsApp] User data path received: ${appUserDataPath}`, "debug")
  globalSendLog(`[WhatsApp] Auth path set to: ${authPath}`, "info")

  // Ensure the auth directory exists
  if (!fs.existsSync(authPath)) {
    try {
      fs.mkdirSync(authPath, { recursive: true })
      globalSendLog(`[WhatsApp] Auth directory created at: ${authPath}`, "info")
    } catch (mkdirErr) {
      globalSendLog(`[WhatsApp] CRITICAL Error creating auth directory ${authPath}: ${mkdirErr.message}`, "error")
      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: sessionId,
          payload: { status: "FATAL_ERROR", reason: `Error creating auth directory: ${mkdirErr.message}` },
        })
      }
      return null
    }
  }

  globalSendLog(`[WhatsApp] Starting WhatsApp connection. Using auth path: ${authPath}`, "info")
  isBotPaused = false

  try {
    // Initialize the WhatsApp client
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: authPath,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    })

    // QR code event
    client.on("qr", (qr) => {
      currentQR = qr
      connectionStatus = "QR_CODE"

      // Display QR in terminal for debugging
      qrcode.generate(qr, { small: true })

      globalSendLog("[WhatsApp] QR Code received. Sending to admin via WebSocket.", "info")

      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "qr_code",
          clientId: sessionId,
          payload: { qr: qr },
        })
      }

      if (globalSqliteService) {
        globalSqliteService.updateWhatsappSessionStatus(sessionId, "QR_REQUESTED", null, qr)
      }
    })

    // Authentication successful
    client.on("authenticated", () => {
      globalSendLog("[WhatsApp] Authentication successful!", "info")
      currentQR = null

      if (globalSqliteService) {
        globalSqliteService.updateWhatsappSessionStatus(sessionId, "AUTHENTICATED", null)
      }
    })

    // Authentication failure
    client.on("auth_failure", (error) => {
      connectionStatus = "AUTH_FAILURE"
      globalSendLog(`[WhatsApp] Authentication failed: ${error}`, "error")

      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: sessionId,
          payload: { status: "AUTH_FAILURE", reason: error.toString() },
        })
      }

      if (globalSqliteService) {
        globalSqliteService.updateWhatsappSessionStatus(sessionId, "AUTH_FAILURE", null)
      }
    })

    // Ready event
    client.on("ready", () => {
      connectionStatus = "CONNECTED"
      currentQR = null
      isBotPaused = false

      const phoneNumber = client.info ? client.info.wid._serialized : "unknown"
      globalSendLog(`[WhatsApp] Client is ready! Connected as ${phoneNumber}`, "info")

      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: sessionId,
          payload: { status: "READY", jid: phoneNumber, isPaused: isBotPaused },
        })
      }

      if (globalSqliteService) {
        globalSqliteService.updateWhatsappSessionStatus(sessionId, "CONNECTED", phoneNumber)
      }
    })

    // Disconnected event
    client.on("disconnected", (reason) => {
      connectionStatus = "DISCONNECTED"
      globalSendLog(`[WhatsApp] Client was disconnected: ${reason}`, "warn")

      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: sessionId,
          payload: { status: "DISCONNECTED", reason: reason },
        })
      }

      if (globalSqliteService) {
        globalSqliteService.updateWhatsappSessionStatus(sessionId, "DISCONNECTED", null)
      }

      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (connectionStatus === "DISCONNECTED") {
          globalSendLog("[WhatsApp] Attempting to reconnect...", "info")
          client.initialize().catch((err) => {
            globalSendLog(`[WhatsApp] Reconnection attempt failed: ${err}`, "error")
          })
        }
      }, 5000)
    })

    // Message received event
    client.on("message", async (msg) => {
      if (isBotPaused) {
        globalSendLog(`[WhatsApp] Bot is paused. Ignoring incoming message from ${msg.from}`, "debug")
        return
      }

      try {
        const chat = await msg.getChat()
        const contact = await msg.getContact()
        const senderName = contact.name || contact.pushname || msg.from

        globalSendLog(`[WhatsApp] Message received from ${senderName} (${msg.from}): ${msg.body}`, "info")

        // Process the message
        if (globalSqliteService) {
          // Find or create a conversation for this contact
          const conversation = await globalSqliteService.findOrCreateConversation(msg.from)

          if (conversation) {
            // Save the message to the database
            const messageData = {
              conversation_id: conversation.ID,
              baileys_msg_id: msg.id._serialized,
              sender_type: "CLIENT",
              sender_jid: msg.from,
              message_content: msg.body,
              message_type: "text",
              timestamp: new Date().toISOString(),
              is_read_by_agent: false,
            }

            await globalSqliteService.saveMessage(messageData)

            // Notify attendants about the new message
            if (globalWebsocketService) {
              // If the conversation has an assigned attendant, send the message to them
              if (conversation.ATTENDANT_ID) {
                globalWebsocketService.sendMessageToAttendant(conversation.ATTENDANT_USERNAME, {
                  type: "new_message",
                  payload: {
                    conversationId: conversation.ID,
                    message: {
                      ...messageData,
                      SENDER_NAME: senderName,
                    },
                  },
                })
              } else {
                // Otherwise, broadcast to all attendants that there's a pending conversation
                globalWebsocketService.broadcastToAttendants({
                  type: "pending_conversation",
                  payload: {
                    conversationId: conversation.ID,
                    clientJid: msg.from,
                    clientName: senderName,
                    lastMessage: msg.body,
                    timestamp: new Date().toISOString(),
                  },
                })
              }
            }
          }
        }
      } catch (error) {
        globalSendLog(`[WhatsApp] Error processing message: ${error.message}`, "error")
      }
    })

    // Initialize the client
    await client.initialize()
    globalSendLog("[WhatsApp] Client initialization started", "info")

    return client
  } catch (error) {
    globalSendLog(`[WhatsApp] CRITICAL Error connecting to WhatsApp: ${error.message}`, "error")
    globalSendLog(error.stack, "error")

    if (globalWebsocketService) {
      globalWebsocketService.broadcastToAdmins({
        type: "status_update",
        clientId: sessionId,
        payload: { status: "FATAL_ERROR", reason: error.message },
      })
    }

    return null
  }
}

async function sendWhatsAppMessage(toJid, messageContent, agentUsername, conversationId, sqliteServiceInstancePassed) {
  const serviceToUse = sqliteServiceInstancePassed || globalSqliteService

  if (isBotPaused) {
    globalSendLog(`[WhatsApp] Bot is paused. Cannot send message to ${toJid}.`, "warn")
    return null
  }

  if (!client || connectionStatus !== "CONNECTED") {
    globalSendLog(`[WhatsApp] Cannot send message. Client not connected. Status: ${connectionStatus}`, "warn")
    return null
  }

  try {
    globalSendLog(
      `[WhatsApp] Sending message to ${toJid} from agent ${agentUsername}: ${JSON.stringify(messageContent)}`,
      "info",
    )

    let sentMessage

    // Check if we're sending text or media
    if (typeof messageContent === "string" || messageContent.text) {
      const textToSend = typeof messageContent === "string" ? messageContent : messageContent.text
      sentMessage = await client.sendMessage(toJid, textToSend)
    } else if (messageContent.image) {
      // Handle image messages
      const media = await MessageMedia.fromUrl(messageContent.image.url)
      sentMessage = await client.sendMessage(toJid, media, { caption: messageContent.caption })
    } else if (messageContent.document) {
      // Handle document messages
      const media = await MessageMedia.fromUrl(messageContent.document.url)
      sentMessage = await client.sendMessage(toJid, media)
    } else {
      throw new Error("Unsupported message type")
    }

    globalSendLog(`[WhatsApp] Message sent with ID: ${sentMessage.id._serialized}`, "info")

    if (serviceToUse && typeof serviceToUse.saveMessage === "function") {
      const messageText =
        typeof messageContent === "string"
          ? messageContent
          : messageContent.text || messageContent.caption || JSON.stringify(messageContent)

      const savedMessage = await serviceToUse.saveMessage({
        conversation_id: conversationId,
        baileys_msg_id: sentMessage.id._serialized,
        sender_type: "AGENT",
        sender_jid: client.info.wid._serialized,
        message_content: messageText,
        message_type:
          typeof messageContent === "string"
            ? "text"
            : messageContent.image
              ? "image"
              : messageContent.document
                ? "document"
                : "text",
        timestamp: new Date().toISOString(),
        is_read_by_agent: true,
      })

      return savedMessage
    } else {
      globalSendLog("[WhatsApp] sqliteService not available to save sent message to DB history.", "warn")
      return {
        baileys_msg_id: sentMessage.id._serialized,
        timestamp: new Date().toISOString(),
      }
    }
  } catch (error) {
    globalSendLog(`[WhatsApp] Error sending message to ${toJid}: ${error.message}`, "error")
    return null
  }
}

function getCurrentStatusAndQR() {
  return {
    sessionId: sessionId,
    status: connectionStatus,
    qrCode: currentQR,
    jid: client?.info?.wid?._serialized,
    isPaused: isBotPaused,
  }
}

function getClient() {
  return client
}

async function togglePauseBot() {
  isBotPaused = !isBotPaused
  globalSendLog(`[WhatsApp] Bot pause state changed to: ${isBotPaused}`, "info")

  if (globalWebsocketService) {
    globalWebsocketService.broadcastToAdmins({
      type: "bot_status_update",
      payload: { isPaused: isBotPaused, statusMessage: `Bot ${isBotPaused ? "paused" : "active"}.` },
    })
  }

  return isBotPaused
}

async function fullLogoutAndCleanup() {
  globalSendLog("[WhatsApp] Starting full logout and session cleanup...", "info")

  if (client) {
    try {
      if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
          type: "status_update",
          clientId: sessionId,
          payload: { status: "DISCONNECTING", reason: "Logout/Restart requested" },
        })
      }

      // Logout from WhatsApp
      await client.logout()
      globalSendLog("[WhatsApp] Logout successful.", "info")
    } catch (e) {
      globalSendLog(`[WhatsApp] Error during logout: ${e.message}. Attempting to destroy client.`, "warn")
      try {
        await client.destroy()
      } catch (destroyErr) {
        globalSendLog(`[WhatsApp] Error destroying client: ${destroyErr.message}`, "error")
      }
    }

    client = null
  } else {
    globalSendLog("[WhatsApp] No active client to logout.", "warn")
  }

  connectionStatus = "DISCONNECTED"
  currentQR = null
  isBotPaused = false

  // Clean the auth directory
  if (authPath && fs.existsSync(authPath)) {
    try {
      fs.rmSync(authPath, { recursive: true, force: true })
      globalSendLog(`[WhatsApp] Auth directory (${authPath}) successfully removed.`, "info")
    } catch (err) {
      globalSendLog(`[WhatsApp] Error removing auth directory (${authPath}): ${err.message}`, "error")
    }
  } else {
    globalSendLog(`[WhatsApp] Auth directory (${authPath || "N/A"}) not found or not defined for removal.`, "warn")
  }

  if (globalSqliteService && typeof globalSqliteService.updateWhatsappSessionStatus === "function") {
    try {
      await globalSqliteService.updateWhatsappSessionStatus(sessionId, "CLEARED_FOR_RESTART", null, null)
      globalSendLog(`[WhatsApp] Session ${sessionId} status updated to CLEARED_FOR_RESTART in DB.`, "info")
    } catch (dbError) {
      globalSendLog(`[WhatsApp] Error updating session status in DB during cleanup: ${dbError.message}`, "error")
    }
  }

  globalSendLog("[WhatsApp] Cleanup for restart completed.", "info")
}

module.exports = {
  connectToWhatsApp,
  sendWhatsAppMessage,
  getClient,
  getCurrentStatusAndQR,
  togglePauseBot,
  fullLogoutAndCleanup,
  sessionId: sessionId,
}
