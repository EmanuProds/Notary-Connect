// backend/services/websocketService.js
const WebSocket = require("ws")
const urlNode = require("url")

let sendLogGlobal; 
let whatsappServiceInstanceGlobal; 
let sqliteServiceInstanceGlobal; 
let wssInstance; 

const adminClientsSet = new Set()
const attendantClientsMap = new Map() 

const ClientTypeEnum = {
  UNKNOWN: "unknown",
  ADMIN_QR: "admin_qr",
  ATTENDANT_CHAT: "attendant_chat",
};

function helperBroadcastToAdmins(data) {
  if (!adminClientsSet || adminClientsSet.size === 0) return;
  const message = JSON.stringify(data);
  adminClientsSet.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err && sendLogGlobal) sendLogGlobal(`[WS ADMIN] Erro ao enviar para admin: ${err.message}.`, "error");
      });
    } else {
      if (sendLogGlobal) sendLogGlobal(`[WS ADMIN] Cliente admin não está OPEN. Removendo...`, "warn");
      adminClientsSet.delete(client);
    }
  });
}

function helperSendMessageToAttendant(agentId, data) {
  const attendantClient = attendantClientsMap.get(agentId);
  if (attendantClient && attendantClient.readyState === WebSocket.OPEN) {
    const message = JSON.stringify(data);
    if(sendLogGlobal) sendLogGlobal(`[WS CHAT] Enviando para atendente ${agentId} (Nome: ${attendantClient.agentName || 'N/A'}): ${message.substring(0,150)}...`, "debug");
    attendantClient.send(message, (err) => {
      if (err && sendLogGlobal) sendLogGlobal(`[WS CHAT] Erro ao enviar para atendente ${attendantClient.agentName || agentId}: ${err.message}`, "error");
    });
    return true;
  }
  if(sendLogGlobal) sendLogGlobal(`[WS CHAT] Atendente ${agentId} não encontrado ou conexão não aberta para enviar mensagem.`, "warn");
  return false;
}

function helperBroadcastToAttendants(data, excludeAgentId = null) {
  if (!attendantClientsMap || attendantClientsMap.size === 0) return;
  const message = JSON.stringify(data);
  if(sendLogGlobal) sendLogGlobal(`[WS CHAT] Transmitindo para ${attendantClientsMap.size} atendentes (exceto ${excludeAgentId || 'ninguém'}): ${message.substring(0,150)}...`, "debug");
  attendantClientsMap.forEach((client, currentAgentId) => {
    if (currentAgentId !== excludeAgentId) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err && sendLogGlobal) sendLogGlobal(`[WS CHAT] Erro ao transmitir para atendente ${client.agentName || currentAgentId}: ${err.message}`, "error");
            });
        } else {
            if (sendLogGlobal) sendLogGlobal(`[WS CHAT] Atendente ${client.agentName || currentAgentId} não está OPEN. Removendo...`, "warn");
            attendantClientsMap.delete(currentAgentId); 
        }
    }
  });
}

function initializeWebSocketServer(server, logFunction, wsAppInstance, dbServices) {
  sendLogGlobal = logFunction; 
  whatsappServiceInstanceGlobal = wsAppInstance;
  sqliteServiceInstanceGlobal = dbServices; 
  
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
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(messageString)
        if(sendLogGlobal) sendLogGlobal(`[WS] << De ${clientIdentifier}: ${messageString.substring(0, 250)}`, "debug")

        switch (parsedMessage.type) {
          case "request_initial_status":
            if (ws.clientType === ClientTypeEnum.ADMIN_QR) {
              if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_initial_status' para ${clientIdentifier}`, "debug");
              if (!whatsappServiceInstanceGlobal || typeof whatsappServiceInstanceGlobal.getCurrentStatusAndQR !== "function") {
                if(sendLogGlobal) sendLogGlobal("[WS] Erro: WhatsApp Service ou getCurrentStatusAndQR não disponível.", "error");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "error", message: "Serviço WhatsApp indisponível." }));
                return;
              }
              try {
                const status = whatsappServiceInstanceGlobal.getCurrentStatusAndQR();
                const response = { type: "initial_status", clientId: status.sessionId || "whatsapp-bot-session", payload: status };
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(response));
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Para ${clientIdentifier} (initial_status): ${JSON.stringify(response).substring(0,100)}...`, "debug");
                }
              } catch (statusError) {
                if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao obter status do WhatsApp: ${statusError.message}`, "error");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "error", message: "Erro ao obter status do WhatsApp." }));
              }
            }
            break

          case "send_chat_message":
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.payload) {
              const { conversationId, to, text, media, id: originalMessageId } = parsedMessage.payload; 
              if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'send_chat_message' de ${clientIdentifier} (Username: ${ws.agentId}) para ConvID ${conversationId}, Destinatário: ${to}, ID Local: ${originalMessageId}`, "debug");

              if (to && (text || media) && ws.agentId && conversationId) { 
                if (!whatsappServiceInstanceGlobal || typeof whatsappServiceInstanceGlobal.sendWhatsAppMessage !== "function") {
                  if(sendLogGlobal) sendLogGlobal("[WS] Erro: WhatsApp Service ou sendWhatsAppMessage não disponível.", "error");
                  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Serviço WhatsApp indisponível.", originalMessageId }));
                  return;
                }
                
                let messageContentForWhatsApp = {};
                if (text) messageContentForWhatsApp.text = text;
                if (media) {
                  if (media.type === 'image' && media.url) messageContentForWhatsApp.image = { url: media.url, caption: media.caption };
                  else if (media.type === 'document' && media.url) messageContentForWhatsApp.document = { url: media.url, filename: media.fileName, caption: media.caption };
                  else if (media.type === 'audio' && media.url) messageContentForWhatsApp.audio = { url: media.url };
                  else if (media.type === 'video' && media.url) messageContentForWhatsApp.video = { url: media.url, caption: media.caption };
                  else {
                     if(sendLogGlobal) sendLogGlobal(`[WS] Tipo de mídia não suportado ou URL ausente: ${JSON.stringify(media)}`, "warn");
                     if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Tipo de mídia não suportado ou URL ausente.", originalMessageId }));
                     return;
                  }
                  if (media.caption && !messageContentForWhatsApp.caption) messageContentForWhatsApp.caption = media.caption;
                }
                
                try {
                    const sentMessageDetails = await whatsappServiceInstanceGlobal.sendWhatsAppMessage(
                      to, messageContentForWhatsApp, ws.agentId, conversationId, sqliteServiceInstanceGlobal.chat
                    );
                    if(sendLogGlobal) sendLogGlobal(`[WS] sendWhatsAppMessage retornou: ${JSON.stringify(sentMessageDetails)}`, "debug");

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'message_sent_ack', 
                            success: !!sentMessageDetails, 
                            originalMessageId: originalMessageId, 
                            sentMessageId: sentMessageDetails ? (sentMessageDetails.message_platform_id || sentMessageDetails.id) : null, 
                            timestamp: sentMessageDetails ? sentMessageDetails.timestamp : null,
                            dbMessageId: sentMessageDetails ? sentMessageDetails.id : null 
                        }));
                         if(sendLogGlobal) sendLogGlobal(`[WS] >> message_sent_ack enviado para ${clientIdentifier}. Sucesso: ${!!sentMessageDetails}, ID Original: ${originalMessageId}`, "debug");
                    }
                } catch (sendError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao enviar mensagem via WhatsApp Service: ${sendError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Falha ao enviar mensagem.", originalMessageId }));
                }
              } else {
                if(sendLogGlobal) sendLogGlobal(`[WS] send_chat_message inválido de ${ws.agentName}: 'to', ('text' ou 'media'), e 'conversationId' são obrigatórios. Payload: ${JSON.stringify(parsedMessage.payload)}`, "warn");
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "message_sent_ack", success: false, error: "Dados da mensagem incompletos.", originalMessageId }));
              }
            }
            break
          
          case "request_chat_list":
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && ws.agentId) { 
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_chat_list' para atendente ${clientIdentifier} (Username: ${ws.agentId}), aba: ${parsedMessage.tabType}`, "debug");
                if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat || typeof sqliteServiceInstanceGlobal.chat.getConversationsForUser !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: sqliteServiceInstanceGlobal.chat.getConversationsForUser não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: 'Serviço de banco de dados (chat) indisponível.', tabType: parsedMessage.tabType || 'active' }));
                    return;
                }
                try {
                    const tabType = parsedMessage.tabType || 'active';
                    const chats = await sqliteServiceInstanceGlobal.chat.getConversationsForUser(ws.agentId, tabType, parsedMessage.searchTerm || null); 
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: chats, tabType: tabType }));
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Lista de chats (${chats.length} itens) enviada para ${clientIdentifier} para aba ${tabType}.`, "debug");
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao buscar lista de chats para ${ws.agentId}: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_list_response', payload: [], error: `Erro ao buscar chats: ${dbError.message}`, tabType: parsedMessage.tabType || 'active' }));
                }
            }
            break;

        case 'request_chat_history':
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId) {
                const requestedConvId = String(parsedMessage.conversationId); // Garante que é string
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'request_chat_history' para ${clientIdentifier}, conversa ${requestedConvId}`, "debug");
                 if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat || typeof sqliteServiceInstanceGlobal.chat.getConversationHistory !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: sqliteServiceInstanceGlobal.chat.getConversationHistory não disponível.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Serviço de banco de dados (chat) indisponível.', conversationId: requestedConvId }));
                    return;
                }
                try {
                    const history = await sqliteServiceInstanceGlobal.chat.getConversationHistory(requestedConvId, parsedMessage.limit, parsedMessage.offset);
                    if (ws.readyState === WebSocket.OPEN) {
                        // Envia o conversationId correto na resposta
                        ws.send(JSON.stringify({ type: 'chat_history_response', payload: history, conversationId: requestedConvId }));
                    }
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Histórico do chat (${history.length} mensagens) enviado para ${clientIdentifier}, conversa ${requestedConvId}.`, "debug");
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro ao buscar histórico do chat ${requestedConvId}: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'chat_history_response', payload: [], error: 'Erro ao buscar histórico.', conversationId: requestedConvId }));
                }
            } else {
                 if(sendLogGlobal) sendLogGlobal(`[WS] 'request_chat_history' recebido sem conversationId ou de cliente não autorizado. Parsed: ${JSON.stringify(parsedMessage)}`, "warn");
            }
            break;
        
        case 'take_chat':
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) { 
                const convIdToTake = String(parsedMessage.conversationId);
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'take_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${convIdToTake}`, "debug");
                if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat ||
                    typeof sqliteServiceInstanceGlobal.chat.assignConversationToUser !== 'function' ||
                    !sqliteServiceInstanceGlobal.admin || typeof sqliteServiceInstanceGlobal.admin.getUserByUsername !== 'function') { 
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteService (chat ou admin) não disponíveis para take_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: convIdToTake }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.admin.getUserByUsername(ws.agentId); 
                    if (!attendant || !attendant.ID) {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado no banco para 'take_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Atendente não registrado.', conversationId: convIdToTake }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    // Passa o USERNAME do atendente (ws.agentId) para ser salvo em USER_USERNAME na CONVERSATIONS
                    const assignedConversation = await sqliteServiceInstanceGlobal.chat.assignConversationToUser(convIdToTake, numericAttendantId, ws.agentId); 
                    const success = !!assignedConversation;
                    
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'take_chat_response', 
                            success, 
                            conversationId: convIdToTake, 
                            agentId: ws.agentId, 
                            agentName: ws.agentName, // Nome completo do agente
                            conversation: assignedConversation // Conversa atualizada do DB (com USER_USERNAME = ws.agentId)
                        }));
                    }
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Resposta 'take_chat_response' (sucesso: ${success}) enviada para ${clientIdentifier}. Conversa retornada: ${JSON.stringify(assignedConversation).substring(0,100)}`, "debug");

                    if (success) {
                        helperBroadcastToAttendants({ type: 'chat_taken_update', payload: { conversationId: convIdToTake, agentId: ws.agentId, agentName: ws.agentName } }, ws.agentId);
                        if(sendLogGlobal) sendLogGlobal(`[WS] >> Notificação 'chat_taken_update' transmitida para outros atendentes.`, "debug");
                    } else {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Falha ao assumir chat ${convIdToTake} por ${ws.agentName}. 'assignedConversation' retornou null.`, "warn");
                    }
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao assumir chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'take_chat_response', success: false, error: 'Erro de banco de dados ao assumir chat.', conversationId: convIdToTake }));
                }
            }
            break;

        case 'end_chat':
             if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                const convIdToEnd = String(parsedMessage.conversationId);
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'end_chat' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${convIdToEnd}`, "debug");
                 if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat || 
                     typeof sqliteServiceInstanceGlobal.chat.closeConversation !== 'function' ||
                     !sqliteServiceInstanceGlobal.admin || typeof sqliteServiceInstanceGlobal.admin.getUserByUsername !== 'function') { 
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteService (chat ou admin) não disponíveis para end_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId: convIdToEnd }));
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.admin.getUserByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                        if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'end_chat'.`, 'error');
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Atendente não registrado.', conversationId: convIdToEnd }));
                        return;
                    }
                    const numericAttendantId = attendant.ID;
                    const closedConversation = await sqliteServiceInstanceGlobal.chat.closeConversation(convIdToEnd, numericAttendantId);
                    const success = !!closedConversation;
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success, conversationId: convIdToEnd }));
                    if(sendLogGlobal) sendLogGlobal(`[WS] >> Resposta 'end_chat_response' (sucesso: ${success}) enviada para ${clientIdentifier}.`, "debug");
                    if (success) {
                        helperBroadcastToAttendants({ type: 'chat_closed_update', payload: { conversationId: convIdToEnd, agentId: ws.agentId, agentName: ws.agentName } });
                        if(sendLogGlobal) sendLogGlobal(`[WS] >> Notificação 'chat_closed_update' transmitida.`, "debug");
                    }
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao encerrar chat: ${dbError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_chat_response', success: false, error: 'Erro de banco de dados ao encerrar chat.', conversationId: convIdToEnd }));
                }
            }
            break;
        
        case 'mark_messages_as_read':
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                const convIdToMark = String(parsedMessage.conversationId);
                if(sendLogGlobal) sendLogGlobal(`[WS] Processando 'mark_messages_as_read' para ${clientIdentifier} (Username: ${ws.agentId}), conversa ${convIdToMark}`, "debug");
                if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat ||
                    typeof sqliteServiceInstanceGlobal.chat.markMessagesAsReadByUser !== 'function' || 
                    !sqliteServiceInstanceGlobal.admin || typeof sqliteServiceInstanceGlobal.admin.getUserByUsername !== 'function') {
                    if(sendLogGlobal) sendLogGlobal('[WS] Erro: Funções do sqliteService (chat ou admin) não disponíveis para mark_messages_as_read.', 'error');
                    return;
                }
                try {
                    const attendant = await sqliteServiceInstanceGlobal.admin.getUserByUsername(ws.agentId);
                    if (!attendant || !attendant.ID) {
                         if(sendLogGlobal) sendLogGlobal(`[WS] Erro: Atendente com username '${ws.agentId}' não encontrado para 'mark_messages_as_read'.`, 'error');
                         return;
                    }
                    const numericAttendantId = attendant.ID;
                    await sqliteServiceInstanceGlobal.chat.markMessagesAsReadByUser(convIdToMark, numericAttendantId); 
                    if(sendLogGlobal) sendLogGlobal(`[WS] Mensagens da conversa ${convIdToMark} marcadas como lidas pelo atendente ${ws.agentId}.`, "debug");
                } catch (dbError) {
                    if(sendLogGlobal) sendLogGlobal(`[WS] Erro de banco de dados ao marcar mensagens como lidas (conv ${convIdToMark}): ${dbError.message}`, "error");
                }
            }
            break;
        
        case 'agent_typing': 
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                // Lógica para notificar cliente sobre digitação do agente (se necessário/implementado no WhatsApp Service)
            }
            break;
        
        case 'transfer_chat':
            if (ws.clientType === ClientTypeEnum.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId && parsedMessage.targetType && parsedMessage.targetId) {
                const { conversationId, targetType, targetId, message: transferMessage } = parsedMessage;
                sendLogGlobal(`[WS] Processando 'transfer_chat' de ${clientIdentifier} (Username: ${ws.agentId}) para ConvID ${conversationId}. TargetType: ${targetType}, TargetID: ${targetId}`, "debug");

                if (!sqliteServiceInstanceGlobal || !sqliteServiceInstanceGlobal.chat || !sqliteServiceInstanceGlobal.admin) {
                    sendLogGlobal('[WS] Erro: Serviços de DB (chat ou admin) não disponíveis para transfer_chat.', 'error');
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'transfer_chat_response', success: false, error: 'Serviço de banco de dados indisponível.', conversationId }));
                    return;
                }
                try {
                    const fromUser = await sqliteServiceInstanceGlobal.admin.getUserByUsername(ws.agentId);
                    if (!fromUser) {
                         sendLogGlobal(`[WS] Erro: Atendente de origem '${ws.agentId}' não encontrado para transfer_chat.`, 'error');
                         if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'transfer_chat_response', success: false, error: 'Atendente de origem não encontrado.', conversationId }));
                         return;
                    }

                    let transferResult;
                    if (targetType === 'sector') {
                        transferResult = await sqliteServiceInstanceGlobal.chat.transferConversationToSector(conversationId, targetId, fromUser.ID);
                    } else if (targetType === 'attendant') {
                        transferResult = await sqliteServiceInstanceGlobal.chat.transferConversationToUser(conversationId, targetId, fromUser.ID);
                    } else {
                        throw new Error(`Tipo de transferência '${targetType}' desconhecido.`);
                    }

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ 
                            type: 'transfer_chat_response', 
                            success: transferResult.success, 
                            conversationId: conversationId,
                            message: transferResult.message || (transferResult.success ? "Transferência iniciada." : "Falha na transferência.")
                        }));
                    }
                    
                    if (transferResult.success && transferResult.conversation) {
                        sendLogGlobal(`[WS] Transferência da ConvID ${conversationId} para ${targetType} ${targetId} bem-sucedida. Notificando...`, "info");
                        helperBroadcastToAttendants({ type: 'pending_conversation', payload: transferResult.conversation }); 
                        
                        if (transferMessage && whatsappServiceInstanceGlobal && typeof whatsappServiceInstanceGlobal.sendWhatsAppMessage === 'function') {
                            const originalConv = await sqliteServiceInstanceGlobal.chat.getConversationById(conversationId); 
                            if (originalConv && originalConv.CLIENT_JID) {
                                await whatsappServiceInstanceGlobal.sendWhatsAppMessage(
                                    originalConv.CLIENT_JID,
                                    `*Mensagem de Transferência (de ${ws.agentName})*:\n${transferMessage}`,
                                    'SYSTEM_TRANSFER', 
                                    conversationId,
                                    sqliteServiceInstanceGlobal.chat
                                );
                            }
                        }
                    } else {
                         sendLogGlobal(`[WS] Falha na transferência da ConvID ${conversationId}. Resultado: ${JSON.stringify(transferResult)}`, "warn");
                    }

                } catch (transferError) {
                    sendLogGlobal(`[WS] Erro ao processar transferência da ConvID ${conversationId}: ${transferError.message}`, "error");
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'transfer_chat_response', success: false, error: 'Erro ao processar transferência.', conversationId }));
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

// Função para ser chamada por um serviço externo (ex: WsWhatsApp.js) quando uma nova mensagem do CLIENTE é recebida e salva.
function handleNewClientMessage(conversation, savedMessageDetails) {
  if (conversation && conversation.USER_USERNAME && savedMessageDetails && savedMessageDetails.SENDER_TYPE === 'CLIENT') {
    if(sendLogGlobal) sendLogGlobal(`[WS] Distribuindo nova mensagem do cliente para atendente ${conversation.USER_USERNAME} na conversa ${conversation.ID}. Detalhes: ${JSON.stringify(savedMessageDetails).substring(0,100)}`, "debug");
    helperSendMessageToAttendant(
      conversation.USER_USERNAME, // agentId (username)
      {
        type: 'new_message',
        conversationId: conversation.ID,
        message: savedMessageDetails 
      }
    );
  } else {
    if(sendLogGlobal && conversation) {
        let reason = "Motivo desconhecido";
        if (!conversation) reason = "conversa é nula/indefinida.";
        else if (!conversation.USER_USERNAME) reason = `conversa ${conversation.ID} não tem USER_USERNAME (atendente designado).`;
        else if (!savedMessageDetails) reason = "savedMessageDetails é nulo/indefinido.";
        else if (savedMessageDetails.SENDER_TYPE !== 'CLIENT') reason = `mensagem não é do tipo CLIENT (tipo: ${savedMessageDetails.SENDER_TYPE}).`;
        
        sendLogGlobal(`[WS] Nova mensagem do cliente não será enviada diretamente para um atendente via handleNewClientMessage. ${reason}`, "debug");
    }
  }
}


module.exports = {
  initializeWebSocketServer,
  handleNewClientMessage, // Exportando a nova função
  broadcastToAdmins: helperBroadcastToAdmins,
  sendMessageToAttendant: helperSendMessageToAttendant,
  broadcastToAttendants: helperBroadcastToAttendants,
  ClientType: ClientTypeEnum,
};

