// backend/services/baileysService.js
const {
    default: makeWASocket,
    // useMultiFileAuthState, // Não usaremos mais MultiFileAuthState diretamente
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers 
} = require('baileys');
const Pino = require('pino');
const path = require('path');
// const sqliteService = require('./sqliteService'); // Será injetado

let sock;
const sessionId = 'whatsapp-bot-session'; // Ou configurável
let globalSendLog; 
let globalWebsocketService;
let globalSqliteService; // Instância do sqliteService injetada
let currentQR = null;
let connectionStatus = 'DISCONNECTED';
// let authState; // O authState será gerenciado pelo sqliteAuthStore

async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, sqliteServiceInstance) {
    globalSendLog = sendLogFunction;
    globalWebsocketService = websocketServiceInstance;
    globalSqliteService = sqliteServiceInstance; // Armazena a instância injetada

    globalSendLog(`[Baileys] Iniciando conexão com WhatsApp para session ID: ${sessionId}`, 'info');

    try {
        // Usa o sqliteAuthStore
        const { state, saveCreds } = await globalSqliteService.sqliteAuthStore(sessionId);
        // authState = state; // O 'state' retornado já tem 'creds' e 'keys'

        const { version, isLatest } = await fetchLatestBaileysVersion();
        globalSendLog(`[Baileys] Usando Baileys versão: ${version.join('.')}, É a mais recente: ${isLatest}`, 'info');

        sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }).child({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds, // Usa as credenciais do store
                keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' }).child({ level: 'silent' })),
            },
            browser: Browsers.macOS('Desktop'),
            generateHighQualityLinkPreview: true,
        });

        sock.ev.on('creds.update', saveCreds); // Chama a função saveCreds do store

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            currentQR = qr || null;

            if (qr) {
                connectionStatus = 'QR_CODE';
                globalSendLog('[Baileys] QR Code recebido. Enviando para admin via WebSocket.', 'info');
                globalWebsocketService.broadcastToAdmins({
                    type: 'qr_code',
                    clientId: sessionId,
                    payload: { qr: qr }
                });
                await globalSqliteService.updateWhatsappSessionStatus(sessionId, 'QR_REQUESTED', sock?.user?.id, qr);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                connectionStatus = 'DISCONNECTED';
                globalSendLog(`[Baileys] Conexão fechada. Razão: ${lastDisconnect?.error || 'Desconhecida'}. Status: ${statusCode}. Reconectar: ${shouldReconnect}`, 'warn');

                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionId,
                    payload: { status: 'DISCONNECTED', reason: statusCode }
                });
                await globalSqliteService.updateWhatsappSessionStatus(sessionId, 'DISCONNECTED', sock?.user?.id);

                if (shouldReconnect) {
                    globalSendLog('[Baileys] Tentando reconectar em 5 segundos...', 'info');
                    setTimeout(() => connectToWhatsApp(globalSendLog, globalWebsocketService, globalSqliteService), 5000);
                } else {
                    globalSendLog('[Baileys] Deslogado. Não será reconectado automaticamente. Limpe os dados de autenticação no DB para gerar novo QR.', 'error');
                    // A lógica de limpar o store pode ser chamada aqui se necessário
                    // await globalSqliteService.sqliteAuthStore(sessionId).clearAllData(); // Exemplo, se clearAllData existir no store
                }
            } else if (connection === 'open') {
                connectionStatus = 'CONNECTED';
                currentQR = null;
                globalSendLog(`[Baileys] Conexão com WhatsApp estabelecida! Usuário: ${sock.user?.id || 'N/A'}`, 'info');
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionId,
                    payload: { status: 'READY', jid: sock.user?.id }
                });
                await globalSqliteService.updateWhatsappSessionStatus(sessionId, 'CONNECTED', sock.user?.id);
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.key.fromMe && m.type === 'notify') {
                globalSendLog(`[Baileys] Mensagem recebida de: ${msg.key.remoteJid}`, 'info');
                
                try {
                    const conversation = await globalSqliteService.findOrCreateConversation(msg.key.remoteJid);
                    if (!conversation) {
                        globalSendLog(`[Baileys] Não foi possível encontrar ou criar conversa para ${msg.key.remoteJid}`, 'error');
                        return;
                    }

                    const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || JSON.stringify(msg.message);
                    const messageType = msg.message?.conversation ? 'text' : (msg.message?.extendedTextMessage ? 'text' : 'unknown'); // Simplificado

                    const savedMessage = await globalSqliteService.saveMessage({
                        conversation_id: conversation.ID,
                        baileys_msg_id: msg.key.id,
                        sender_type: 'CLIENT',
                        sender_jid: msg.key.remoteJid,
                        message_content: messageContent,
                        message_type: messageType,
                        timestamp: new Date(parseInt(msg.messageTimestamp) * 1000).toISOString(),
                        is_read_by_agent: false
                    });

                    if (conversation.ATTENDANT_ID) {
                        const attendant = await globalSqliteService.getAttendantByUsername(conversation.ATTENDANT_USERNAME); // Supondo que findOrCreateConversation retorne ATTENDANT_USERNAME
                        if (attendant) {
                             globalWebsocketService.sendMessageToAttendant(attendant.USERNAME, { type: 'new_message', payload: savedMessage });
                        } else {
                            // Se o atendente não for encontrado, trata como pendente
                            globalWebsocketService.broadcastToAttendants({ type: 'pending_conversation_update', payload: conversation });
                        }
                    } else {
                        globalWebsocketService.broadcastToAttendants({ type: 'pending_conversation_update', payload: conversation });
                    }

                } catch (dbError) {
                    globalSendLog(`[Baileys] Erro de banco de dados ao processar mensagem de ${msg.key.remoteJid}: ${dbError.message}`, 'error');
                }
            }
        });
        return sock;

    } catch (error) {
        globalSendLog(`[Baileys] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error');
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: 'status_update',
                clientId: sessionId,
                payload: { status: 'FATAL_ERROR', reason: error.message }
            });
        }
        throw error;
    }
}

async function sendWhatsAppMessage(toJid, messageContentBaileys, agentUsername, conversationId, sqliteServiceInstancePassed) {
    // Usa sqliteServiceInstancePassed que é o globalSqliteService
    const serviceToUse = sqliteServiceInstancePassed || globalSqliteService;

    if (!sock || connectionStatus !== 'CONNECTED') {
        globalSendLog(`[Baileys] Não é possível enviar mensagem. Socket não conectado. Status: ${connectionStatus}`, 'warn');
        return null; // Retorna null em caso de falha para indicar ao chamador
    }
    try {
        globalSendLog(`[Baileys] Enviando mensagem para ${toJid} pelo atendente ${agentUsername}: ${JSON.stringify(messageContentBaileys)}`, 'info');
        const sentMsg = await sock.sendMessage(toJid, messageContentBaileys);
        globalSendLog(`[Baileys] Mensagem enviada com ID Baileys: ${sentMsg.key.id}`, 'info');

        const savedMessage = await serviceToUse.saveMessage({
            conversation_id: conversationId,
            baileys_msg_id: sentMsg.key.id,
            sender_type: 'AGENT',
            sender_jid: sock.user?.id, // JID do bot/número conectado
            message_content: messageContentBaileys.text || JSON.stringify(messageContentBaileys), // Simplificado
            message_type: messageContentBaileys.text ? 'text' : 'media', // Simplificado
            timestamp: new Date(parseInt(sentMsg.messageTimestamp) * 1000).toISOString(),
            is_read_by_agent: true // Mensagens do agente são consideradas lidas por ele
        });
        return savedMessage; // Retorna a mensagem salva com ID do DB
    } catch (error) {
        globalSendLog(`[Baileys] Erro ao enviar mensagem para ${toJid}: ${error.message}`, 'error');
        return null;
    }
}

function getCurrentStatusAndQR() {
    return {
        sessionId: sessionId,
        status: connectionStatus,
        qrCode: currentQR,
        jid: sock?.user?.id
    };
}

function getSocket() {
    return sock;
}

module.exports = {
    connectToWhatsApp,
    sendWhatsAppMessage,
    getSocket,
    getCurrentStatusAndQR
};
