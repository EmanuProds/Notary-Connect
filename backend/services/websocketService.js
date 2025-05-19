// backend/services/websocketService.js
const WebSocket = require("ws")
const urlNode = require("url")

// Constantes para tipos de cliente
const ClientType = {
  UNKNOWN: "unknown",
  ADMIN_QR: "admin_qr", // Usado para clientes que se conectam para ver o QR Code do WhatsApp
  ATTENDANT_CHAT: "attendant_chat", // Usado para clientes de atendentes de chat
}

// Conjuntos para armazenar clientes conectados
const adminClients = new Set() // Clientes admin (para QR code, status do bot, etc.)
const attendantClients = new Map() // Mapeia agentId para o objeto WebSocket do atendente

// Variáveis globais para serviços e logging
let sendLog // Função de log injetada
let whatsappServiceInstance // Instância do whatsappService (Baileys ou whatsapp-web.js)
let sqliteServiceInstance // Instância do sqliteService
let wss // Instância do WebSocket Server

/**
 * Inicializa o servidor WebSocket.
 * @param {http.Server} server - A instância do servidor HTTP para anexar o WebSocket.
 * @param {Function} logFunction - Função para registrar logs.
 * @param {Object} wsAppInstance - Instância do serviço WhatsApp (Baileys/WWJS).
 * @param {Object} dbAppInstance - Instância do serviço de banco de dados (SQLite).
 */
function initializeWebSocketServer(server, logFunction, wsAppInstance, dbAppInstance) {
  sendLog = logFunction
  whatsappServiceInstance = wsAppInstance
  sqliteServiceInstance = dbAppInstance
  wss = new WebSocket.Server({ server, clientTracking: true })

  sendLog("[WS] Servidor WebSocket sendo inicializado...", "info")

  wss.on("connection", (ws, req) => {
    const remoteAddress = req.socket.remoteAddress;
    const fullUrl = req.url;
    sendLog(`[WS] Nova tentativa de conexão de ${remoteAddress} para ${fullUrl}`, "debug");

    const parsedUrl = urlNode.parse(fullUrl, true)
    let clientType = ClientType.UNKNOWN
    let agentId = null
    let agentName = null

    // Identifica o tipo de cliente e extrai informações da URL
    if (parsedUrl.pathname === "/admin-qr") {
      clientType = ClientType.ADMIN_QR
      ws.clientType = clientType; // Atribui antes de adicionar para logs de desconexão
      adminClients.add(ws)
      sendLog(`[WS] Cliente Admin QR conectado. IP: ${remoteAddress}. Total admins: ${adminClients.size}`, "info")
    } else if (parsedUrl.pathname === "/chat") {
      agentId = parsedUrl.query.agentId
      agentName = parsedUrl.query.agentName || agentId
      if (agentId) {
        clientType = ClientType.ATTENDANT_CHAT
        ws.clientType = clientType;
        ws.agentId = agentId
        ws.agentName = agentName

        if (attendantClients.has(agentId)) {
          sendLog(`[WS] Conexão duplicada para atendente ${agentName} (${agentId}). Fechando conexão anterior.`, "warn")
          const oldWs = attendantClients.get(agentId)
          if (oldWs && oldWs.readyState === WebSocket.OPEN) {
            oldWs.close(1008, "Nova conexão estabelecida para este atendente.")
          }
        }
        attendantClients.set(agentId, ws)
        sendLog(`[WS] Atendente '${agentName}' (${agentId}) conectado. IP: ${remoteAddress}. Total atendentes: ${attendantClients.size}`, "info")
      } else {
        sendLog(`[WS] Conexão de chat SEM agentId. IP: ${remoteAddress}. URL: ${fullUrl}`, "warn")
        ws.close(1008, "agentId é obrigatório para conexão de chat.")
        return
      }
    } else {
      sendLog(`[WS] Cliente com TIPO DESCONHECIDO conectado de ${fullUrl}. IP: ${remoteAddress}`, "warn")
      ws.clientType = ClientType.UNKNOWN
      ws.close(1008, "Caminho WebSocket não suportado.")
      return
    }

    // Handler para mensagens recebidas
    ws.on("message", async (messageBuffer) => {
      const messageString = messageBuffer.toString()
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "desconhecido";
      try {
        const parsedMessage = JSON.parse(messageString)
        sendLog(`[WS] << De ${clientIdentifier}: ${messageString.substring(0, 250)}`, "debug")

        switch (parsedMessage.type) {
          case "request_initial_status":
            if (ws.clientType === ClientType.ADMIN_QR) {
              sendLog(`[WS] Processando 'request_initial_status' para ${clientIdentifier}`, "debug");
              if (!whatsappServiceInstance || typeof whatsappServiceInstance.getCurrentStatusAndQR !== "function") {
                const errorMsg = "[WS] Erro: Instância do WhatsApp Service ou getCurrentStatusAndQR não disponível.";
                sendLog(errorMsg, "error");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "error", message: "Serviço WhatsApp indisponível." }));
                }
                return;
              }
              try {
                const status = whatsappServiceInstance.getCurrentStatusAndQR();
                const response = {
                    type: "initial_status",
                    clientId: status.sessionId || "whatsapp-bot-session",
                    payload: status,
                };
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(response));
                    sendLog(`[WS] >> Para ${clientIdentifier} (initial_status): ${JSON.stringify(response).substring(0,100)}...`, "debug");
                } else {
                    sendLog(`[WS] WebSocket não estava aberto ao tentar enviar initial_status para ${clientIdentifier}`, "warn");
                }
              } catch (statusError) {
                sendLog(`[WS] Erro ao obter status do WhatsApp: ${statusError.message}`, "error");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "error", message: "Erro ao obter status do WhatsApp." }));
                }
              }
            }
            break

          case "send_chat_message":
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.payload) {
              const { conversationId, to, text, media, id: originalMessageId } = parsedMessage.payload;
              sendLog(`[WS] Processando 'send_chat_message' de ${clientIdentifier} para conversa ${conversationId}`, "debug");

              if (to && (text || media) && ws.agentId && conversationId) {
                if (!whatsappServiceInstance || typeof whatsappServiceInstance.sendWhatsAppMessage !== "function") {
                  sendLog("[WS] Erro: Instância do WhatsApp Service ou sendWhatsAppMessage não disponível.", "error");
                  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Serviço WhatsApp indisponível.", originalMessageId }));
                  return;
                }

                let messageContentForWhatsApp = {};
                if (text) messageContentForWhatsApp.text = text;
                if (media) {
                  if (media.type === 'image' && media.url) messageContentForWhatsApp.image = { url: media.url };
                  if (media.type === 'document' && media.url) messageContentForWhatsApp.document = { url: media.url };
                  if (media.caption) messageContentForWhatsApp.caption = media.caption;
                }
                
                try {
                    const sentMessageDetails = await whatsappServiceInstance.sendWhatsAppMessage(
                    to, 
                    messageContentForWhatsApp,
                    ws.agentId, 
                    conversationId,
                    sqliteServiceInstance,
                    );

                    if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ 
                        type: 'message_sent_ack', 
                        success: !!sentMessageDetails, 
                        originalMessageId: originalMessageId, 
                        sentMessageId: sentMessageDetails ? (sentMessageDetails.baileys_msg_id || sentMessageDetails.id) : null,
                        timestamp: sentMessageDetails ? sentMessageDetails.timestamp : null
                    }));
                    }
                } catch (sendError) {
                    sendLog(`[WS] Erro ao enviar mensagem via WhatsApp Service: ${sendError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Falha ao enviar mensagem.", originalMessageId }));
                }
              } else {
                sendLog(`[WS] send_chat_message inválido de ${ws.agentName}: 'to', ('text' ou 'media'), e 'conversationId' são obrigatórios. Payload: ${JSON.stringify(parsedMessage.payload)}`, "warn");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Dados da mensagem incompletos.", originalMessageId }));
              }
            }
            break
          
          case "request_chat_list":
             if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) {
                sendLog(`[WS] Processando 'request_chat_list' para atendente ${clientIdentifier}`, "debug");
                if (!sqliteServiceInstance || typeof sqliteServiceInstance.getConversationsForAttendant !== 'function') {
                    sendLog('[WS] Erro: sqliteServiceInstance.getConversationsForAttendant não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: 'Serviço de banco de dados indisponível.', tabType: parsedMessage.tabType || 'active' }));
                    return;
                }
                try {
                    const tabType = parsedMessage.tabType || 'active';
                    const chats = await sqliteServiceInstance.getConversationsForAttendant(ws.agentId, tabType);
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: chats, tabType: tabType }));
                } catch (dbError) {
                    sendLog(`[WS] Erro ao buscar lista de chats: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: `Erro ao buscar chats: ${dbError.message}`, tabType: parsedMessage.tabType || 'active' }));
                }
            }
            break;

        case 'request_chat_history':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId) {
                sendLog(`[WS] Processando 'request_chat_history' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstance || typeof sqliteServiceInstance.getConversationHistory !== 'function') {
                    sendLog('[WS] Erro: sqliteServiceInstance.getConversationHistory não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const history = await sqliteServiceInstance.getConversationHistory(parsedMessage.conversationId, parsedMessage.limit, parsedMessage.offset);
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: history, conversationId: parsedMessage.conversationId }));
                } catch (dbError) {
                    sendLog(`[WS] Erro ao buscar histórico do chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Erro ao buscar histórico.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'take_chat':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                sendLog(`[WS] Processando 'take_chat' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstance || typeof sqliteServiceInstance.assignConversationToAttendant !== 'function') {
                    sendLog('[WS] Erro: sqliteServiceInstance.assignConversationToAttendant não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const assignedConversation = await sqliteServiceInstance.assignConversationToAttendant(parsedMessage.conversationId, ws.agentId, ws.agentName);
                    const success = !!assignedConversation;
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success, conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName, conversation: assignedConversation }));
                    if (success) {
                        broadcastToAttendants({ type: 'chat_taken_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } }, ws.agentId);
                    }
                } catch (dbError) {
                    sendLog(`[WS] Erro ao assumir chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Erro ao assumir chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;

        case 'end_chat':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                sendLog(`[WS] Processando 'end_chat' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstance || typeof sqliteServiceInstance.closeConversation !== 'function') {
                    sendLog('[WS] Erro: sqliteServiceInstance.closeConversation não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const closedConversation = await sqliteServiceInstance.closeConversation(parsedMessage.conversationId, ws.agentId);
                    const success = !!closedConversation;
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success, conversationId: parsedMessage.conversationId }));
                    if (success) {
                        broadcastToAttendants({ type: 'chat_closed_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } });
                    }
                } catch (dbError) {
                    sendLog(`[WS] Erro ao encerrar chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Erro ao encerrar chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'mark_messages_as_read':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                sendLog(`[WS] Processando 'mark_messages_as_read' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstance || typeof sqliteServiceInstance.markMessagesAsReadByAgent !== 'function') {
                    sendLog('[WS] Erro: sqliteServiceInstance.markMessagesAsReadByAgent não disponível.', 'error');
                    return;
                }
                try {
                    await sqliteServiceInstance.markMessagesAsReadByAgent(parsedMessage.conversationId, ws.agentId);
                } catch (dbError) {
                    sendLog(`[WS] Erro ao marcar mensagens como lidas: ${dbError.message}`, "error");
                }
            }
            break;
        
        case 'agent_typing':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                sendLog(`[WS] Atendente ${ws.agentName} ${parsedMessage.isTyping ? 'está digitando' : 'parou de digitar'} na conversa ${parsedMessage.conversationId}`, 'debug');
                broadcastToAdmins({ 
                    type: 'agent_activity', 
                    payload: { 
                        agentId: ws.agentId, 
                        agentName: ws.agentName, 
                        conversationId: parsedMessage.conversationId,
                        isTyping: parsedMessage.isTyping 
                    }
                });
                 // Notificar o cliente que o agente está digitando, se o whatsappServiceInstance suportar
                if (whatsappServiceInstance && typeof whatsappServiceInstance.sendPresenceUpdate === 'function') {
                    const conversationDetails = await sqliteServiceInstance.getConversationById(parsedMessage.conversationId);
                    if (conversationDetails && conversationDetails.CLIENT_JID) {
                        whatsappServiceInstance.sendPresenceUpdate(conversationDetails.CLIENT_JID, parsedMessage.isTyping ? 'composing' : 'paused');
                    }
                }
            }
            break;

          default:
            sendLog(`[WS] Tipo de mensagem WS NÃO TRATADA: ${parsedMessage.type} de ${clientIdentifier}`, "warn")
        }
      } catch (e) {
        sendLog(`[WS] ERRO ao processar mensagem WS de ${clientIdentifier}: ${e.message}. Dados: ${messageString.substring(0, 250)}. Stack: ${e.stack}`, "error")
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "Erro interno ao processar sua solicitação." }))
        }
      }
    })

    ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer ? reasonBuffer.toString() : "N/A"
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      sendLog(`[WS] Cliente WS desconectado (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}). Código: ${code}, Razão: ${reason}`, "info")
      if (ws.clientType === ClientType.ADMIN_QR) {
        adminClients.delete(ws)
        sendLog(`[WS] Cliente Admin QR removido. Total admins: ${adminClients.size}`, "info");
      } else if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) {
        attendantClients.delete(ws.agentId)
        sendLog(`[WS] Atendente ${ws.agentName} (${ws.agentId}) removido. Total atendentes: ${attendantClients.size}`, "info");
      }
    })

    ws.on("error", (error) => {
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      sendLog(`[WS] ERRO no WebSocket (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}): ${error.message}`, "error")
    })
  })
  sendLog("[WS] Servidor WebSocket interno INICIALIZADO e ouvindo conexões.", "info")
}

function broadcastToAdmins(data) {
  if (!adminClients || adminClients.size === 0) {
    return;
  }
  const message = JSON.stringify(data)
  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err) sendLog(`[WS ADMIN] Erro ao enviar para admin: ${err.message}. Cliente: ${client._socket.remoteAddress}`, "error")
      })
    } else {
      sendLog(`[WS ADMIN] Cliente admin não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
      adminClients.delete(client); 
    }
  })
}

function sendMessageToAttendant(agentId, data) {
  const attendantClient = attendantClients.get(agentId)
  if (attendantClient && attendantClient.readyState === WebSocket.OPEN) {
    const message = JSON.stringify(data)
    attendantClient.send(message, (err) => {
      if (err) sendLog(`[WS CHAT] Erro ao enviar para atendente ${attendantClient.agentName || agentId}: ${err.message}`, "error")
    })
    return true
  }
  return false
}

function broadcastToAttendants(data, excludeAgentId = null) {
  if (!attendantClients || attendantClients.size === 0) {
    return;
  }
  const message = JSON.stringify(data)
  attendantClients.forEach((client, currentAgentId) => {
    if (currentAgentId !== excludeAgentId) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err) sendLog(`[WS CHAT] Erro ao transmitir para atendente ${client.agentName || currentAgentId}: ${err.message}`, "error")
            })
        } else {
            sendLog(`[WS CHAT] Atendente ${client.agentName || currentAgentId} não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
            attendantClients.delete(currentAgentId); 
        }
    }
  })
}

module.exports = {
  initializeWebSocketServer,
  broadcastToAdmins,
  sendMessageToAttendant,
  broadcastToAttendants,
  ClientType,
}
