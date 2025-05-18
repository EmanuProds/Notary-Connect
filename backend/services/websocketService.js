// backend/services/websocketService.js
const WebSocket = require('ws');
const urlNode = require('url'); // Módulo URL do Node.js

let wss;
const adminClients = new Set();
const attendantClients = new Map(); // Map<agentId, WebSocketClient>
let sendLog; // Função de log injetada
let baileysServiceInstance; // Instância do baileysService
let firebirdServiceInstance; // Instância do firebirdService

const ClientType = {
    ADMIN_QR: 'admin-qr',
    ATTENDANT_CHAT: 'attendant-chat',
    UNKNOWN: 'unknown'
};

// Função para inicializar o servidor WebSocket
// Adicionada a instância do firebirdService para operações de DB se necessário diretamente do WS
function initializeWebSocketServer(server, logFunction, bsInstance, fbInstance) {
    sendLog = logFunction;
    baileysServiceInstance = bsInstance;
    firebirdServiceInstance = fbInstance; // Armazena a instância do firebirdService
    wss = new WebSocket.Server({ server, clientTracking: true });

    wss.on('connection', (ws, req) => {
        const parsedUrl = urlNode.parse(req.url, true); // Parseia a URL e a query string
        let clientType = ClientType.UNKNOWN;
        let agentId = null;
        let agentName = null; // Nome do agente para logs e UI

        // Identifica o tipo de cliente e extrai informações
        if (parsedUrl.pathname === '/admin-qr') {
            clientType = ClientType.ADMIN_QR;
            adminClients.add(ws);
            sendLog(`[WS] Cliente Admin QR conectado. IP: ${req.socket.remoteAddress}`, 'info');
        } else if (parsedUrl.pathname === '/chat') {
            agentId = parsedUrl.query.agentId;
            agentName = parsedUrl.query.agentName || agentId; // Usa agentId se agentName não for fornecido
            if (agentId) {
                // Verifica se já existe uma conexão para este agentId
                if (attendantClients.has(agentId)) {
                    sendLog(`[WS] Tentativa de conexão duplicada para o atendente ${agentName} (${agentId}). Fechando conexão anterior.`, 'warn');
                    const oldWs = attendantClients.get(agentId);
                    oldWs.close(1008, 'Nova conexão estabelecida para este atendente.');
                    attendantClients.delete(agentId);
                }
                clientType = ClientType.ATTENDANT_CHAT;
                ws.agentId = agentId;
                ws.agentName = agentName;
                attendantClients.set(agentId, ws);
                sendLog(`[WS] Atendente '${agentName}' (${agentId}) conectado. IP: ${req.socket.remoteAddress}`, 'info');
                // Poderia enviar uma mensagem de boas-vindas ou status inicial para o atendente
                // ws.send(JSON.stringify({ type: 'connection_ack', message: `Bem-vindo, ${agentName}!`}));
            } else {
                sendLog(`[WS] Conexão de chat sem agentId. IP: ${req.socket.remoteAddress}`, 'warn');
                ws.close(1008, "agentId é obrigatório para conexão de chat.");
                return;
            }
        } else {
            sendLog(`[WS] Cliente com tipo desconhecido conectado de ${req.url}. IP: ${req.socket.remoteAddress}`, 'warn');
            ws.clientType = ClientType.UNKNOWN; // Atribui para referência no 'close'
            // ws.close(1000, "Caminho WebSocket não suportado"); // Opcional: fechar conexões não reconhecidas
            // return;
        }
        ws.clientType = clientType; // Armazena o tipo de cliente no objeto WebSocket

        // Handler para mensagens recebidas do cliente WebSocket
        ws.on('message', async (messageBuffer) => {
            const messageString = messageBuffer.toString(); // Converte Buffer para String
            try {
                const parsedMessage = JSON.parse(messageString);
                sendLog(`[WS] << De ${ws.agentName || ws.agentId || ws.clientType || 'desconhecido'}: ${messageString.substring(0, 200)}`, 'debug');

                switch (parsedMessage.type) {
                    case 'request_initial_status': // Enviado pelo adminScript.js
                        if (ws.clientType === ClientType.ADMIN_QR) {
                            if (!baileysServiceInstance || typeof baileysServiceInstance.getCurrentStatusAndQR !== 'function') {
                                sendLog('[WS] Erro: Instância do Baileys ou getCurrentStatusAndQR não está disponível.', 'error');
                                ws.send(JSON.stringify({ type: 'error', message: 'Serviço Baileys indisponível no momento.' }));
                                return;
                            }
                            const status = baileysServiceInstance.getCurrentStatusAndQR();
                            ws.send(JSON.stringify({
                                type: 'initial_status',
                                clientId: status.sessionId || 'whatsapp-bot-session',
                                payload: status
                            }));
                        }
                        break;

                    case 'send_chat_message': // Enviado pelo chatActions.js (atendente)
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.payload) {
                            const { to, text, conversationId, media } = parsedMessage.payload; // Adicionado 'media'
                            if (to && (text || media) && ws.agentId) {
                                if (!baileysServiceInstance || typeof baileysServiceInstance.sendWhatsAppMessage !== 'function') {
                                     sendLog('[WS] Erro: Instância do Baileys ou sendWhatsAppMessage não está disponível.', 'error');
                                     ws.send(JSON.stringify({ type: 'message_sent_ack', success: false, error: 'Serviço Baileys indisponível.', originalMessage: parsedMessage.payload }));
                                     return;
                                }
                                // Monta o conteúdo da mensagem para o Baileys
                                let messageContentBaileys = {};
                                if (text) messageContentBaileys.text = text;
                                // TODO: Lidar com diferentes tipos de mídia (image, audio, video, document)
                                // O frontend precisaria enviar a mídia como base64 ou um FormData, e o backend processaria.
                                // Por simplicidade, aqui apenas logamos se a mídia está presente.
                                if (media) {
                                    sendLog(`[WS] Envio de mídia solicitado para ${to} (ainda não implementado completamente): ${JSON.stringify(media).substring(0,100)}`, 'info');
                                    // Exemplo: messageContentBaileys.image = { url: pathToMediaOrBuffer };
                                    // messageContentBaileys.caption = text; // Legenda pode acompanhar mídia
                                }

                                const success = await baileysServiceInstance.sendWhatsAppMessage(
                                    to,
                                    messageContentBaileys,
                                    ws.agentId,
                                    conversationId,
                                    firebirdServiceInstance // Passa a instância do firebird para salvar a msg
                                );
                                ws.send(JSON.stringify({ type: 'message_sent_ack', success, originalMessageId: parsedMessage.payload.id, sentMessageId: success ? "id_do_baileys" : null }));
                            } else {
                                sendLog(`[WS] send_chat_message inválido de ${ws.agentName}: 'to' e ('text' ou 'media') são obrigatórios.`, 'warn');
                                ws.send(JSON.stringify({ type: 'message_sent_ack', success: false, error: 'Dados da mensagem incompletos.', originalMessage: parsedMessage.payload }));
                            }
                        }
                        break;
                    
                    case 'request_chat_list': // Atendente solicita lista de chats
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) {
                            if (!firebirdServiceInstance || typeof firebirdServiceInstance.getConversationsForAttendant !== 'function') {
                                sendLog('[WS] Erro: firebirdServiceInstance.getConversationsForAttendant não disponível.', 'error');
                                ws.send(JSON.stringify({ type: 'chat_list_response', error: 'Serviço de banco de dados indisponível.' }));
                                return;
                            }
                            // O segundo parâmetro 'active' ou 'closed' viria da aba selecionada no frontend
                            const tabType = parsedMessage.tabType || 'active'; // 'active' ou 'closed'
                            const chats = await firebirdServiceInstance.getConversationsForAttendant(ws.agentId, tabType);
                            ws.send(JSON.stringify({ type: 'chat_list_response', payload: chats, tabType: tabType }));
                        }
                        break;

                    case 'request_chat_history': // Atendente solicita histórico de um chat
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId) {
                             if (!firebirdServiceInstance || typeof firebirdServiceInstance.getConversationHistory !== 'function') {
                                sendLog('[WS] Erro: firebirdServiceInstance.getConversationHistory não disponível.', 'error');
                                ws.send(JSON.stringify({ type: 'chat_history_response', error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                                return;
                            }
                            const history = await firebirdServiceInstance.getConversationHistory(parsedMessage.conversationId, parsedMessage.limit, parsedMessage.offset);
                            ws.send(JSON.stringify({ type: 'chat_history_response', payload: history, conversationId: parsedMessage.conversationId }));
                        }
                        break;
                    
                    case 'take_chat': // Atendente assume um chat pendente
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId && ws.agentId) {
                            if (!firebirdServiceInstance || typeof firebirdServiceInstance.assignConversationToAttendant !== 'function') {
                                sendLog('[WS] Erro: firebirdServiceInstance.assignConversationToAttendant não disponível.', 'error');
                                ws.send(JSON.stringify({ type: 'take_chat_response', error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                                return;
                            }
                            const success = await firebirdServiceInstance.assignConversationToAttendant(parsedMessage.conversationId, ws.agentId, ws.agentName);
                            ws.send(JSON.stringify({ type: 'take_chat_response', success, conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName }));
                            if (success) {
                                broadcastToAttendants({ type: 'chat_taken_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId, agentName: ws.agentName } }, ws.agentId); // Notifica outros atendentes, exceto o que assumiu
                            }
                        }
                        break;

                    case 'end_chat': // Atendente encerra um chat
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId) {
                             if (!firebirdServiceInstance || typeof firebirdServiceInstance.closeConversation !== 'function') {
                                sendLog('[WS] Erro: firebirdServiceInstance.closeConversation não disponível.', 'error');
                                ws.send(JSON.stringify({ type: 'end_chat_response', error: 'Serviço de banco de dados indisponível.', conversationId: parsedMessage.conversationId }));
                                return;
                            }
                            const success = await firebirdServiceInstance.closeConversation(parsedMessage.conversationId, ws.agentId);
                            ws.send(JSON.stringify({ type: 'end_chat_response', success, conversationId: parsedMessage.conversationId }));
                             if (success) {
                                broadcastToAttendants({ type: 'chat_closed_update', payload: { conversationId: parsedMessage.conversationId, agentId: ws.agentId } });
                            }
                        }
                        break;
                    
                    case 'mark_messages_as_read':
                        if (ws.clientType === ClientType.ATTENDANT_CHAT && parsedMessage.conversationId) {
                            if (!firebirdServiceInstance || typeof firebirdServiceInstance.markMessagesAsReadByAgent !== 'function') {
                                sendLog('[WS] Erro: firebirdServiceInstance.markMessagesAsReadByAgent não disponível.', 'error');
                                return;
                            }
                            await firebirdServiceInstance.markMessagesAsReadByAgent(parsedMessage.conversationId, ws.agentId);
                            // Pode enviar uma confirmação de volta se necessário, ou apenas atualizar a contagem de não lidas.
                        }
                        break;

                    default:
                        sendLog(`[WS] Tipo de mensagem WS não tratada: ${parsedMessage.type} de ${ws.agentName || ws.agentId || ws.clientType}`, 'warn');
                }
            } catch (e) {
                sendLog(`[WS] Erro ao processar mensagem WS de ${ws.agentName || ws.agentId || ws.clientType}: ${e.message}. Dados: ${messageString.substring(0,200)}`, 'error');
                ws.send(JSON.stringify({ type: 'error', message: 'Erro interno ao processar sua solicitação.' }));
            }
        });

        ws.on('close', (code, reasonBuffer) => {
            const reason = reasonBuffer ? reasonBuffer.toString() : 'N/A';
            sendLog(`[WS] Cliente WS desconectado (Tipo: ${ws.clientType}, Agente: ${ws.agentName || ws.agentId || 'N/A'}). Código: ${code}, Razão: ${reason}`, 'info');
            if (ws.clientType === ClientType.ADMIN_QR) {
                adminClients.delete(ws);
            } else if (ws.clientType === ClientType.ATTENDANT_CHAT && ws.agentId) {
                attendantClients.delete(ws.agentId);
                // Notificar que o atendente está offline, se necessário
                // broadcastAttendantStatus(ws.agentId, 'offline');
            }
        });

        ws.on('error', (error) => {
            sendLog(`[WS] Erro no WebSocket (Tipo: ${ws.clientType}, Agente: ${ws.agentName || ws.agentId || 'N/A'}): ${error.message}`, 'error');
        });
    });
    sendLog('[WS] Servidor WebSocket interno inicializado e ouvindo conexões.', 'info');
}

function broadcastToAdmins(data) {
    if (!adminClients || adminClients.size === 0) return;
    const message = JSON.stringify(data);
    // sendLog(`[WS ADMIN] >> Transmitindo para ${adminClients.size} admins: ${message.substring(0,150)}...`, 'debug');
    adminClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err) sendLog(`[WS ADMIN] Erro ao enviar para admin: ${err.message}`, 'error');
            });
        }
    });
}

function sendMessageToAttendant(agentId, data) {
    const attendantClient = attendantClients.get(agentId);
    if (attendantClient && attendantClient.readyState === WebSocket.OPEN) {
        const message = JSON.stringify(data);
        // sendLog(`[WS CHAT] >> Para atendente ${attendantClient.agentName || agentId}: ${message.substring(0,150)}...`, 'debug');
        attendantClient.send(message, (err) => {
            if (err) sendLog(`[WS CHAT] Erro ao enviar para atendente ${attendantClient.agentName || agentId}: ${err.message}`, 'error');
        });
        return true;
    }
    // sendLog(`[WS CHAT] Atendente ${agentId} não conectado ou WS não aberto para enviar mensagem.`, 'warn');
    return false;
}

function broadcastToAttendants(data, excludeAgentId = null) {
    if (!attendantClients || attendantClients.size === 0) return;
    const message = JSON.stringify(data);
    // sendLog(`[WS CHAT] >> Transmitindo para ${attendantClients.size} atendentes (excluindo ${excludeAgentId || 'ninguém'}): ${message.substring(0,150)}...`, 'debug');
    attendantClients.forEach((client, agentId) => {
        if (agentId !== excludeAgentId && client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err) sendLog(`[WS CHAT] Erro ao transmitir para atendente ${client.agentName || agentId}: ${err.message}`, 'error');
            });
        }
    });
}

module.exports = {
    initializeWebSocketServer,
    broadcastToAdmins,
    sendMessageToAttendant,
    broadcastToAttendants,
    ClientType
};
