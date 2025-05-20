// backend/services/websocketService.js
const WebSocket = require("ws")
const urlNode = require("url")

// --- Declaração de Variáveis Globais do Módulo ---
let sendLogGlobal; // Renomeado para evitar conflito com parâmetro de função
let whatsappServiceInstanceGlobal; 
let sqliteServiceInstanceGlobal; 
let wssInstance; // Renomeado para evitar conflito

const adminClientsSet = new Set()
const attendantClientsMap = new Map() 

const ClientTypeEnum = {
  UNKNOWN: "unknown",
  ADMIN_QR: "admin_qr",
  ATTENDANT_CHAT: "attendant_chat",
};

// --- Definições de Funções Auxiliares (Definidas no Topo do Módulo) ---
// Estas funções serão chamadas APENAS DEPOIS que sendLogGlobal estiver definido via initializeWebSocketServer

function helperBroadcastToAdmins(data) {
  if (!adminClientsSet || adminClientsSet.size === 0) {
    return;
  }
  const message = JSON.stringify(data);
  adminClientsSet.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err && sendLogGlobal) sendLogGlobal(`[WS ADMIN] Erro ao enviar para admin: ${err.message}. Cliente: ${client._socket?.remoteAddress}`, "error");
      });
    } else {
      if (sendLogGlobal) sendLogGlobal(`[WS ADMIN] Cliente admin não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
      adminClientsSet.delete(client);
    }
  });
}

function helperSendMessageToAttendant(agentId, data) {
  const attendantClient = attendantClientsMap.get(agentId);
  if (attendantClient && attendantClient.readyState === WebSocket.OPEN) {
    const message = JSON.stringify(data);
    attendantClient.send(message, (err) => {
      if (err && sendLogGlobal) sendLogGlobal(`[WS CHAT] Erro ao enviar para atendente ${attendantClient.agentName || agentId}: ${err.message}`, "error");
    });
    return true;
  }
  return false;
}

function helperBroadcastToAttendants(data, excludeAgentId = null) {
  if (!attendantClientsMap || attendantClientsMap.size === 0) {
    return;
  }
  const message = JSON.stringify(data);
  attendantClientsMap.forEach((client, currentAgentId) => {
    if (currentAgentId !== excludeAgentId) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err && sendLogGlobal) sendLogGlobal(`[WS CHAT] Erro ao transmitir para atendente ${client.agentName || currentAgentId}: ${err.message}`, "error");
            });
        } else {
            if (sendLogGlobal) sendLogGlobal(`[WS CHAT] Atendente ${client.agentName || currentAgentId} não está OPEN. Estado: ${client.readyState}. Removendo...`, "warn");
            attendantClientsMap.delete(currentAgentId); 
        }
    }
  });
}

// --- Função Principal de Inicialização ---

function initializeWebSocketServer(server, logFunction, wsAppInstance, dbAppInstance) {
  // Atribui as instâncias globais DENTRO desta função, que é chamada após o módulo ser carregado
  sendLogGlobal = logFunction; 
  whatsappServiceInstanceGlobal = wsAppInstance;
  sqliteServiceInstanceGlobal = dbAppInstance;
  
  wssInstance = new WebSocket.Server({ server, clientTracking: true });

  if(sendLogGlobal) sendLogGlobal("[WS] Servidor WebSocket sendo inicializado...", "info");

  wssInstance.on("connection", (ws, req) => {
    const remoteAddress = req.socket.remoteAddress;
    const fullUrl = req.url;
    if(sendLogGlobal) sendLogGlobal(`[WS] Nova tentativa de conexão de ${remoteAddress} para ${fullUrl}`, "debug");

    const parsedUrl = urlNode.parse(fullUrl, true)
    let clientType = ClientTypeEnum.UNKNOWN
    let agentId = null 
    let agentName = null

    if (parsedUrl.pathname === "/admin-qr") {
      clientType = ClientTypeEnum.ADMIN_QR
      ws.clientType = clientType; 
      adminClientsSet.add(ws)
      if(sendLogGlobal) sendLogGlobal(`[WS] Cliente Admin QR conectado. IP: ${remoteAddress}. Total admins: ${adminClientsSet.size}`, "info")
    } else if (parsedUrl.pathname === "/chat") {
      agentId = parsedUrl.query.agentId 
      agentName = parsedUrl.query.agentName || agentId
      if (agentId) {
        clientType = ClientTypeEnum.ATTENDANT_CHAT
        ws.clientType = clientType;
        ws.agentId = agentId 
        ws.agentName = agentName

        if (attendantClientsMap.has(agentId)) {
          if(sendLogGlobal) sendLogGlobal(`[WS] Conexão duplicada para atendente ${agentName} (${agentId}). Fechando conexão anterior.`, "warn")
          const oldWs = attendantClientsMap.get(agentId)
          if (oldWs && oldWs.readyState === WebSocket.OPEN) {
            oldWs.close(1008, "Nova conexão estabelecida para este atendente.")
          }
        }
        attendantClientsMap.set(agentId, ws) 
        if(sendLogGlobal) sendLogGlobal(`[WS] Atendente '${agentName}' (${agentId}) conectado. IP: ${remoteAddress}. Total atendentes: ${attendantClientsMap.size}`, "info")
      } else {
        if(sendLogGlobal) sendLogGlobal(`[WS] Conexão de chat SEM agentId (username). IP: ${remoteAddress}. URL: ${fullUrl}`, "warn")
        ws.close(1008, "agentId (username) é obrigatório para conexão de chat.")
        return
      }
    } else {
      if(sendLogGlobal) sendLogGlobal(`[WS] Cliente com TIPO DESCONHECIDO conectado de ${fullUrl}. IP: ${remoteAddress}`, "warn")
      ws.clientType = ClientTypeEnum.UNKNOWN
      ws.close(1008, "Caminho WebSocket não suportado.")
      return
    }

    ws.on("message", async (messageBuffer) => {
      const messageString = messageBuffer.toString()
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "desconhecido";
      try {
        const parsedMessage = JSON.parse(messageString)
        if(sendLogGlobal) sendLogGlobal(`[WS] << De ${clientIdentifier}: ${messageString.substring(0, 250)}`, "debug")

        switch (parsedMessage.type) {
          case "request_initial_status":
            if (ws.clientType === ClientTypeEnum.ADMIN_QR) {
              if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_initial_status' para ${clientIdentifier}`, "debug");
              if (!whatsappServiceInstanceGlobal || typeof whatsappServiceInstanceGlobal.getCurrentStatusAndQR !== "function") {
                const errorMsg = "[WS] Erro: Instância do WhatsApp Service ou getCurrentStatusAndQR não disponível.";
                if(sendLogGlobal) sendLogGlobal(errorMsg, "error");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "error", message: "Serviço WhatsApp indisponível." }));
                }
                return;
              }
              try {
                const status = whatsappServiceInstanceGlobal.getCurrentStatusAndQR();
                const response = {
                    type: "initial_status",
                    clientId: status.sessionId || "whatsapp-bot-session",
                    payload: status,
                };
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(response));
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Para ${clientIdentifier} (initial_status): ${JSON.stringify(response).substring(0,100)}...`, "debug");
                } else {
                    if(sendLogGlobal) sendLogGlobal(`[WS] WebSocket não estava aberto ao tentar enviar initial_status para ${clientIdentifier}`, "warn");
                }
              } catch (statusError) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao obter status do WhatsApp: ${statusError.message}`, "error");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "error", message: "Erro ao obter status do WhatsApp." }));
                }
              }
            }
            break

          case "send_chat_message":
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.payload) {
              const { conversationId, to, text, media, id: originalMessageId } = parsedMessage.payload;
              if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'send_chat_message' de ${clientIdentifier} (Username: ${ws.agentId}) para conversa ${conversationId}, Destinatário (to): ${to}`, "debug");

              if (to && (text || media) && ws.agentId && conversationId) { 
                if (!whatsappServiceInstanceGlobal || typeof whatsappServiceInstanceGlobal.sendWhatsAppMessage !== "function") {
                  if(sendLogGlobal) sendLogGlobal("[WS] Erro: Instância do WhatsApp Service ou sendWhatsAppMessage não disponível.", "error");
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
                    const sentMessageDetails = await whatsappServiceInstanceGlobal.sendWhatsAppMessage(
                      to, 
                      messageContentForWhatsApp,
                      ws.agentId, 
                      conversationId,
                      sqliteServiceInstanceGlobal, // Passa a instância global
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
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao enviar mensagem via WhatsApp Service: ${sendError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Falha ao enviar mensagem.", originalMessageId }));
                }
              } else {
                if(sendLogGlobal) sendLogGlobal(`[WS] send_chat_message inválido de ${ws.agentName}: 'to' (JID do cliente), ('text' ou 'media'), e 'conversationId' são obrigatórios. Payload: ${JSON.stringify(parsedMessage.payload)}`, "warn");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Dados da mensagem incompletos.", originalMessageId }));
              }
            }
            break
          
          case "request_chat_list":
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && ws.agentId) { 
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_chat_list' para atendente ${clientIdentifier} (Username: ${ws.agentId})`, "debug");
                if (!sqliteServiceInstanceGlobal || typeof sqliteServiceInstanceGlobal.getConversationsForAttendant !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: sqliteServiceInstance.getConversationsForAttendant não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: 'Serviço de banco de dados indisponível.', tabType: parsedMessage.tabType || 'active' }));
                    return;
                }
                try {
                    const tabType = parsedMessage.tabType || 'active';
                    const chats = await sqliteServiceInstanceGlobal.getConversationsForAttendant(ws.agentId, tabType); 
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: chats, tabType: tabType }));
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao buscar lista de chats: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: `Erro ao buscar chats: ${dbError.message}`, tabType: parsedMessage.tabType || 'active' }));
                }
            }
            break;

        case 'request_chat_history':
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_chat_history' para ${clientIdentifier}, conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstanceGlobal || typeof sqliteServiceInstanceGlobal.getConversationHistory !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: sqliteServiceInstance.getConversationHistory não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const history = await sqliteServiceInstanceGlobal.getConversationHistory(parsedMessage.conversationId, parsedMessage.limit, parsedMessage.offset);
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: history, conversationId: parsedMessage.conversationId }));
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao buscar histórico do chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Erro ao buscar histórico.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'take_chat':
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) { 
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'take_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstanceGlobal || 
                    typeof sqliteServiceInstanceGlobal.assignConversationToAttendant !== 'function' ||
                    typeof sqliteServiceInstanceGlobal.getAttendantByUsername !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para take_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado no banco para 'take_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Atendente não registrado.', conversationId: parsedMessage.conversationId }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    const assignedConversation = await sqliteServiceInstanceGlobal.assignConversationToAttendant(parsedMessage.conversationId, numericAttendantId, ws.agentName);
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
                        helperBroadcastToAttendants({ type: 'chat_taken_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } }, ws.agentId);
                    } else {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Falha ao assumir chat ${parsedMessage.conversationId} por ${ws.agentName}. 'assignedConversation' retornou null.`, "warn");
                    }
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao assumir chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Erro de banco de dados ao assumir chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;

        case 'end_chat':
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'end_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                 if (!sqliteServiceInstanceGlobal || 
                     typeof sqliteServiceInstanceGlobal.closeConversation !== 'function' ||
                     typeof sqliteServiceInstanceGlobal.getAttendantByUsername !== 'function') { 
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para end_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'end_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Atendente não registrado.', conversationId: parsedMessage.conversationId }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    const closedConversation = await sqliteServiceInstanceGlobal.closeConversation(parsedMessage.conversationId, numericAttendantId);
                    const success = !!closedConversation;
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success, conversationId: parsedMessage.conversationId }));
                    if (success) {
                        helperBroadcastToAttendants({ type: 'chat_closed_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } });
                    }
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao encerrar chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Erro de banco de dados ao encerrar chat.', conversationId: parsedMessage.conversationId }));
                }
            }
            break;
        
        case 'mark_messages_as_read':
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'mark_messages_as_read' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${parsedMessage.conversationId}`, "debug");
                if (!sqliteServiceInstanceGlobal || 
                    typeof sqliteServiceInstanceGlobal.markMessagesAsReadByAgent !== 'function' ||
                    typeof sqliteServiceInstanceGlobal.getAttendantByUsername !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteServiceInstance não disponíveis para mark_messages_as_read.', 'error');
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.getAttendantByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                         if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'mark_messages_as_read'.`, 'error');
                         return;
                    }
                    const numericAttendantId = attendant.ID;
                    await sqliteServiceInstanceGlobal.markMessagesAsReadByAgent(parsedMessage.conversationId, numericAttendantId);
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao marcar mensagens como lidas: ${dbError.message}`, "error");
                }
            }
            break;
        
        case 'agent_typing': 
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Atendente ${ws.agentName} ${parsedMessage.isTyping ? 'está digitando' : 'parou de digitar'} na conversa ${parsedMessage.conversationId}`, 'debug');
                helperBroadcastToAdmins({ 
                    type: 'agent_activity', 
                    payload: { 
                        agentId: ws.agentId, 
                        agentName: ws.agentName, 
                        conversationId: parsedMessage.conversationId,
                        isTyping: parsedMessage.isTyping 
                    }
                });
                if (whatsappServiceInstanceGlobal && typeof whatsappServiceInstanceGlobal.sendChatPresence === 'function' && sqliteServiceInstanceGlobal && typeof sqliteServiceInstanceGlobal.getConversationById === 'function') {
                    // Esta linha estava causando o erro ReferenceError: broadcastToAdmins is not defined
                    // A chamada correta é helperBroadcastToAdmins, e ela já está sendo feita acima.
                    // A lógica de notificar o cliente sobre a digitação do agente é mais complexa e geralmente
                    // não é feita diretamente aqui, mas sim através de uma função específica no whatsappService.
                    // Removendo a linha problemática:
                    // broadcastToAdmins({ type: 'agent_activity', payload: { /* ... */ } }); // LINHA REMOVIDA
                    if(sendLogGlobal) sendLogGlobal(`[WS] Atividade de digitação do agente ${ws.agentName} registrada. Notificação para cliente (via sendChatPresence) não implementada neste ponto.`, 'debug');
                }
            }
            break;

          default:
            if(sendLogGlobal) sendLogGlobal(`[WS] Tipo de mensagem WS NÃO TRATADA: ${parsedMessage.type} de ${clientIdentifier}`, "warn")
        }
      } catch (e) {
        if(sendLogGlobal) sendLogGlobal(`[WS] ERRO ao processar mensagem WS de ${clientIdentifier}: ${e.message}. Dados: ${messageString.substring(0, 250)}. Stack: ${e.stack}`, "error")
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: "Erro interno ao processar sua solicitação." }))
        }
      }
    }); 

    ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer ? reasonBuffer.toString() : "N/A"
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      if(sendLogGlobal) sendLogGlobal(`[WS] Cliente WS desconectado (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}). Código: ${code}, Razão: ${reason}`, "info")
      if (ws.clientType === ClientTypeEnum.ADMIN_QR) {
        adminClientsSet.delete(ws)
        if(sendLogGlobal) sendLogGlobal(`[WS] Cliente Admin QR removido. Total admins: ${adminClientsSet.size}`, "info");
      } else if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && ws.agentId) {
        attendantClientsMap.delete(ws.agentId)
        if(sendLogGlobal) sendLogGlobal(`[WS] Atendente ${ws.agentName} (${ws.agentId}) removido. Total atendentes: ${attendantClientsMap.size}`, "info");
      }
    });

    ws.on("error", (error) => {
      const clientIdentifier = ws.agentName || ws.agentId || ws.clientType || "N/A";
      if(sendLogGlobal) sendLogGlobal(`[WS] ERRO no WebSocket (Tipo: ${ws.clientType}, ID/Nome: ${clientIdentifier}): ${error.message}`, "error")
    });

  }); 
  if(sendLogGlobal) sendLogGlobal("[WS] Servidor WebSocket interno INICIALIZADO e ouvindo conexões.", "info")
} 


module.exports = {
  initializeWebSocketServer,
  broadcastToAdmins: helperBroadcastToAdmins, // Exporta a função local com o nome esperado
  sendMessageToAttendant: helperSendMessageToAttendant,
  broadcastToAttendants: helperBroadcastToAttendants,
  ClientType: ClientTypeEnum, // Exporta o enum com o nome esperado
};
