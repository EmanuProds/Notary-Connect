// backend/services/websocketService.js
const WebSocket = require("ws")
const urlNode = require("url")

// --- Declaração de Variáveis Globais do Módulo ---
let sendLog; 
let whatsappServiceInstance; 
let sqliteServiceInstance; 
let wss; // Instância do WebSocket Server

const adminClients = new Set()
const attendantClients = new Map() 

const ClientType = {
  UNKNOWN: "unknown",
  ADMIN_QR: "admin_qr",
  ATTENDANT_CHAT: "attendant_chat",
};

// --- Definições de Funções Auxiliares (Definidas no Topo do Módulo) ---

function localBroadcastToAdmins(data) {
  if (!adminClients || adminClients.size === 0) {
    // if (sendLog) sendLog("[WS ADMIN] Nenhum cliente admin conectado para broadcast.", "debug");
    return;
  }
  const message = JSON.stringify(data);
  // if (sendLog) sendLog(`[WS ADMIN] >> Transmitindo para ${adminClients.size} admins: ${message.substring(0,150)}...`, 'debug');
  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err && sendLog) sendLog(`[WS ADMIN] Erro ao enviar para admin: ${err.message}. Cliente: ${client._socket?.remoteAddress}`, "error");
      });
    } else {
      if (sendLog) sendLog(`[WS ADMIN] Cliente admin não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
      adminClients.delete(client);
    }
  });
}

function localSendMessageToAttendant(agentId, data) {
  const attendantClient = attendantClients.get(agentId);
  if (attendantClient && attendantClient.readyState === WebSocket.OPEN) {
    const message = JSON.stringify(data);
    // if (sendLog) sendLog(`[WS CHAT] >> Para atendente ${attendantClient.agentName || agentId}: ${message.substring(0,150)}...`, 'debug');
    attendantClient.send(message, (err) => {
      if (err && sendLog) sendLog(`[WS CHAT] Erro ao enviar para atendente ${attendantClient.agentName || agentId}: ${err.message}`, "error");
    });
    return true;
  }
  // if (sendLog) sendLog(`[WS CHAT] Atendente ${agentId} não conectado ou WS não aberto para enviar mensagem.`, 'warn');
  return false;
}

function localBroadcastToAttendants(data, excludeAgentId = null) {
  if (!attendantClients || attendantClients.size === 0) {
    // if (sendLog) sendLog("[WS CHAT] Nenhum atendente conectado para broadcast.", "debug");
    return;
  }
  const message = JSON.stringify(data);
  // if (sendLog) sendLog(`[WS CHAT] >> Transmitindo para ${attendantClients.size} atendentes (excluindo ${excludeAgentId || 'ninguém'}): ${message.substring(0,150)}...`, 'debug');
  attendantClients.forEach((client, currentAgentId) => {
    if (currentAgentId !== excludeAgentId) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err && sendLog) sendLog(`[WS CHAT] Erro ao transmitir para atendente ${client.agentName || currentAgentId}: ${err.message}`, "error");
            });
        } else {
            if (sendLog) sendLog(`[WS CHAT] Atendente ${client.agentName || currentAgentId} não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
            attendantClients.delete(currentAgentId); 
        }
    }
  });
}

// --- Função Principal de Inicialização ---

function initializeWebSocketServer(server, logFunction, wsAppInstance, dbAppInstance) {
  sendLog = logFunction; 
  whatsappServiceInstance = wsAppInstance;
  sqliteServiceInstance = dbAppInstance;
  wss = new WebSocket.Server({ server, clientTracking: true });

  if(sendLog) sendLog("[WS] Servidor WebSocket sendo inicializado...", "info");

  wss.on("connection", (ws, req) => {
    const remoteAddress = req.socket.remoteAddress;
    const fullUrl = req.url;
    if(sendLog) sendLog(`[WS] Nova tentativa de conexão de ${remoteAddress} para ${fullUrl}`, "debug");

    const parsedUrl = urlNode.parse(fullUrl, true)
    let clientType = ClientType.UNKNOWN
    let agentId = null 
    let agentName = null

    if (parsedUrl.pathname === "/admin-qr") {
      clientType = ClientType.ADMIN_QR
      ws.clientType = clientType; 
      adminClients.add(ws)
      if(sendLog) sendLog(`[WS] Cliente Admin QR conectado. IP: ${remoteAddress}. Total admins: ${adminClients.size}`, "info")
    } else if (parsedUrl.pathname === "/chat") {
      agentId = parsedUrl.query.agentId 
      agentName = parsedUrl.query.agentName || agentId
      if (agentId) {
        clientType = ClientType.ATTENDANT_CHAT
        ws.clientType = clientType;
        ws.agentId = agentId 
        ws.agentName = agentName

        if (attendantClients.has(agentId)) {
          if(sendLog) sendLog(`[WS] Conexão duplicada para atendente ${agentName} (${agentId}). Fechando conexão anterior.`, "warn")
          const oldWs = attendantClients.get(agentId)
          if (oldWs && oldWs.readyState === WebSocket.OPEN) {
            oldWs.close(1008, "Nova conexão estabelecida para este atendente.")
          }
        }
        attendantClients.set(agentId, ws) 
        if(sendLog) sendLog(`[WS] Atendente '${agentName}' (${agentId}) conectado. IP: ${remoteAddress}. Total atendentes: ${attendantClients.size}`, "info")
      } else {
        if(sendLog) sendLog(`[WS] Conexão de chat SEM agentId (username). IP: ${remoteAddress}. URL: ${fullUrl}`, "warn")
        ws.close(1008, "agentId (username) é obrigatório para conexão de chat.")
        return
      }
    } else {
      if(sendLog) sendLog(`[WS] Cliente com TIPO DESCONHECIDO conectado de ${fullUrl}. IP: ${remoteAddress}`, "warn")
      ws.clientType = ClientType.UNKNOWN
      ws.close(1008, "Caminho WebSocket não suportado.")
      return
    }

    ws.on("message", async (messageBuffer) => {
      const messageString = messageBuffer.toString()
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "desconhecido";
      try {
        const parsedMessage = JSON.parse(messageString)
        if(sendLog) sendLog(`[WS] << De ${clientIdentifier}: ${messageString.substring(0, 250)}`, "debug")

        switch (parsedMessage.type) {
          case "request_initial_status":
            if (ws.clientType === ClientType.ADMIN_QR) {
              if(sendLog) sendLog(`[WS] Processando 'request_initial_status' para ${clientIdentifier}`, "debug");
              if (!whatsappServiceInstance || typeof whatsappServiceInstance.getCurrentStatusAndQR !== "function") {
                const errorMsg = "[WS] Erro: Instância do WhatsApp Service ou getCurrentStatusAndQR não disponível.";
                if(sendLog) sendLog(errorMsg, "error");
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
                    if(sendLog) sendLog(`[WS] >> Para ${clientIdentifier} (initial_status): ${JSON.stringify(response).substring(0,100)}...`, "debug");
                } else {
                    if(sendLog) sendLog(`[WS] WebSocket não estava aberto ao tentar enviar initial_status para ${clientIdentifier}`, "warn");
                }
              } catch (statusError) {
                if(sendLog) sendLog(`[WS] Erro ao obter status do WhatsApp: ${statusError.message}`, "error");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "error", message: "Erro ao obter status do WhatsApp." }));
                }
              }
            }
            break

          case "send_chat_message":
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.payload) {
              const { conversationId, to, text, media, id: originalMessageId } = parsedMessage.payload;
              if(sendLog) sendLog(`[WS] Processando 'send_chat_message' de ${clientIdentifier} (Username: ${ws.agentId}) para conversa ${conversationId}, Destinatário (to): ${to}`, "debug");

              if (to && (text || media) && ws.agentId && conversationId) { 
                if (!whatsappServiceInstance || typeof whatsappServiceInstance.sendWhatsAppMessage !== "function") {
                  if(sendLog) sendLog("[WS] Erro: Instância do WhatsApp Service ou sendWhatsAppMessage não disponível.", "error");
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
                    if(sendLog) sendLog(`[WS] Erro ao enviar mensagem via WhatsApp Service: ${sendError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Falha ao enviar mensagem.", originalMessageId }));
                }
              } else {
                if(sendLog) sendLog(`[WS] send_chat_message inválido de ${ws.agentName}: 'to' (JID do cliente), ('text' ou 'media'), e 'conversationId' são obrigatórios. Payload: ${JSON.stringify(parsedMessage.payload)}`, "warn");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Dados da mensagem incompletos.", originalMessageId }));
              }
            }
            break
          
          case "request_chat_list":
             if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) { 
                if(sendLog) sendLog(`[WS] Processando 'request_chat_list' para atendente ${clientIdentifier} (Username: ${ws.agentId})`, "debug");
                if (!sqliteServiceInstance || typeof sqliteServiceInstance.getConversationsForAttendant !== 'function') {
                    if(sendLog) sendLog('[WS] Erro: sqliteServiceInstance.getConversationsForAttendant não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: 'Serviço de banco de dados indisponível.', tabType: parsedMessage.tabType || 'active' }));
                    return;
                }
                try {
                    const tabType = parsedMessage.tabType || 'active';
                    const chats = await sqliteServiceInstance.getConversationsForAttendant(ws.agentId, tabType); 
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: chats, tabType: tabType }));
                } catch (dbError) {
                    if(sendLog) sendLog(`[WS] Erro ao buscar lista de chats: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: `Erro ao buscar chats: ${dbError.message}`, tabType: parsedMessage.tabType || 'active' }));
                }
            }
            break;

        case 'request_chat_history':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId) {
                if(sendLog) sendLog(`[WS] Processando 'request_chat_history' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstance || typeof sqliteServiceInstance.getConversationHistory !== 'function') {
                    if(sendLog) sendLog('[WS] Erro: sqliteServiceInstance.getConversationHistory não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const history = await sqliteServiceInstance.getConversationHistory(parsedMessage.conversationId, parsedMessage.limit, parsedMessage.offset);
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: history, conversationId: parsedMessage.conversationId }));
                } catch (dbError) {
                    if(sendLog) sendLog(`[WS] Erro ao buscar histórico do chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Erro ao buscar histórico.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'take_chat':
             if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) { 
                if(sendLog) sendLog(`[WS] Processando 'take_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstance || 
                    typeof sqliteServiceInstance.assignConversationToAttendant !== 'function' ||
                    typeof sqliteServiceInstance.getAttendantByUsername !== 'function') {
                    if(sendLog) sendLog('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para take_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstance.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                        if(sendLog) sendLog(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado no banco para 'take_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Atendente não registrado.', conversationId: parsedMessage.conversationId }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    const assignedConversation = await sqliteServiceInstance.assignConversationToAttendant(parsedMessage.conversationId, numericAttendantId, ws.agentName);
                    const success = !!assignedConversation;
                    
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'take_chat_response', 
                            success, 
                            conversationId: parsedMessage.conversationId, 
                            agentId: ws.agentId, 
                            agentName: ws.agentName, 
                            conversation: assignedConversation 
                        }));
                    }

                    if (success) {
                        localBroadcastToAttendants({ type: 'chat_taken_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } }, ws.agentId);
                    } else {
                        if(sendLog) sendLog(`[WS] Falha ao assumir chat ${parsedMessage.conversationId} por ${ws.agentName}. 'assignedConversation' retornou null.`, "warn");
                    }
                } catch (dbError) {
                    if(sendLog) sendLog(`[WS] Erro de banco de dados ao assumir chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Erro de banco de dados ao assumir chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;

        case 'end_chat':
             if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLog) sendLog(`[WS] Processando 'end_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstance || 
                     typeof sqliteServiceInstance.closeConversation !== 'function' ||
                     typeof sqliteServiceInstance.getAttendantByUsername !== 'function') { 
                    if(sendLog) sendLog('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para end_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstance.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                        if(sendLog) sendLog(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'end_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Atendente não registrado.', conversationId: parsedMessage.conversationId }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    const closedConversation = await sqliteServiceInstance.closeConversation(parsedMessage.conversationId, numericAttendantId);
                    const success = !!closedConversation;
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success, conversationId: parsedMessage.conversationId }));
                    if (success) {
                        localBroadcastToAttendants({ type: 'chat_closed_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } });
                    }
                } catch (dbError) {
                    if(sendLog) sendLog(`[WS] Erro de banco de dados ao encerrar chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Erro de banco de dados ao encerrar chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'mark_messages_as_read':
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLog) sendLog(`[WS] Processando 'mark_messages_as_read' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstance || 
                    typeof sqliteServiceInstance.markMessagesAsReadByAgent !== 'function' ||
                    typeof sqliteServiceInstance.getAttendantByUsername !== 'function') {
                    if(sendLog) sendLog('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para mark_messages_as_read.', 'error');
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstance.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                         if(sendLog) sendLog(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'mark_messages_as_read'.`, 'error');
                         return;
                    }
                    const numericAttendantId = attendant.ID;
                    await sqliteServiceInstance.markMessagesAsReadByAgent(parsedMessage.conversationId, numericAttendantId);
                } catch (dbError) {
                    if(sendLog) sendLog(`[WS] Erro de banco de dados ao marcar mensagens como lidas: ${dbError.message}`, "error");
                }
            }
            break;
        
        case 'agent_typing': 
            if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLog) sendLog(`[WS] Atendente ${ws.agentName} ${parsedMessage.isTyping ? 'está digitando' : 'parou de digitar'} na conversa ${parsedMessage.conversationId}`, 'debug');
                localBroadcastToAdmins({ 
                    type: 'agent_activity', 
                    payload: { 
                        agentId: ws.agentId, 
                        agentName: ws.agentName, 
                        conversationId: parsedMessage.conversationId,
                        isTyping: parsedMessage.isTyping 
                    }
                });
                // A notificação de "digitando" para o cliente WhatsApp é geralmente tratada pela biblioteca do WhatsApp (whatsapp-web.js)
                // quando o cliente envia uma mensagem, não quando o agente digita na interface do atendente.
                // Se for necessário enviar um status de "digitando" para o cliente a partir daqui,
                // seria preciso uma função em whatsappServiceInstance para isso, por exemplo:
                // if (whatsappServiceInstance && typeof whatsappServiceInstance.sendChatPresence === 'function') {
                //    const conversation = await sqliteServiceInstance.getConversationById(parsedMessage.conversationId);
                //    if (conversation && conversation.CLIENT_JID) {
                //        await whatsappServiceInstance.sendChatPresence(conversation.CLIENT_JID, parsedMessage.isTyping ? 'composing' : 'paused');
                //    }
                // }
                if(sendLog) sendLog(`[WS] Atividade de digitação do agente ${ws.agentName} registrada. Notificação para cliente (via sendChatPresence) não implementada neste ponto.`, 'debug');
            }
            break;

          default:
            if(sendLog) sendLog(`[WS] Tipo de mensagem WS NÃO TRATADA: ${parsedMessage.type} de ${clientIdentifier}`, "warn")
        }
      } catch (e) {
        if(sendLog) sendLog(`[WS] ERRO ao processar mensagem WS de ${clientIdentifier}: ${e.message}. Dados: ${messageString.substring(0, 250)}. Stack: ${e.stack}`, "error")
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "Erro interno ao processar sua solicitação." }))
        }
      }
    }); 

    ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer ? reasonBuffer.toString() : "N/A"
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      if(sendLog) sendLog(`[WS] Cliente WS desconectado (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}). Código: ${code}, Razão: ${reason}`, "info")
      if (ws.clientType === ClientType.ADMIN_QR) {
        adminClients.delete(ws)
        if(sendLog) sendLog(`[WS] Cliente Admin QR removido. Total admins: ${adminClients.size}`, "info");
      } else if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) {
        attendantClients.delete(ws.agentId)
        if(sendLog) sendLog(`[WS] Atendente ${ws.agentName} (${ws.agentId}) removido. Total atendentes: ${attendantClients.size}`, "info");
      }
    });

    ws.on("error", (error) => {
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      if(sendLog) sendLog(`[WS] ERRO no WebSocket (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}): ${error.message}`, "error")
    });

  }); 
  if(sendLog) sendLog("[WS] Servidor WebSocket interno INICIALIZADO e ouvindo conexões.", "info")
} 


module.exports = {
  initializeWebSocketServer,
  broadcastToAdmins: localBroadcastToAdmins,
  sendMessageToAttendant: localSendMessageToAttendant,
  broadcastToAttendants: localBroadcastToAttendants,
  ClientType,
};
