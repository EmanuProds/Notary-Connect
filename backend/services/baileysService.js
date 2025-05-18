// backend/services/baileysService.js
const {
    default: makeWASocket,
    // fetchLatestBaileysVersion, // Mantido comentado
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
    initAuthCreds 
} = require('baileys');
const Pino = require('pino');
const path = require('path'); 

let sock;
const exportedSessionId = 'whatsapp-bot-session'; 
let globalSendLog; 
let globalWebsocketService;
let globalSqliteService; 
let currentQR = null;
let connectionStatus = 'DISCONNECTED';
let isBotPaused = false; 

// Função auxiliar para logar tipos de chaves
function logKeyTypes(obj, prefix = '') {
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const currentPath = prefix ? `${prefix}.${key}` : key;
            if (Buffer.isBuffer(value)) {
                globalSendLog(`[Baileys KeyType] ${currentPath}: Buffer (length ${value.length})`, 'debug');
            } else if (value instanceof Uint8Array) {
                globalSendLog(`[Baileys KeyType] ${currentPath}: Uint8Array (length ${value.length})`, 'debug');
            } else if (typeof value === 'object' && value !== null) {
                if (value.type === 'Buffer' && Array.isArray(value.data)) { // Estrutura comum de Buffer serializado
                     globalSendLog(`[Baileys KeyType] ${currentPath}: Serialized Buffer Object (length ${value.data.length})`, 'debug');
                } else {
                    logKeyTypes(value, currentPath); // Recursivo
                }
            } else {
                // globalSendLog(`[Baileys KeyType] ${currentPath}: ${typeof value}`, 'debug');
            }
        }
    }
}


async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, sqliteServiceInstance) {
    globalSendLog = sendLogFunction;
    globalWebsocketService = websocketServiceInstance;
    globalSqliteService = sqliteServiceInstance;

    globalSendLog(`[Baileys] Iniciando conexão com WhatsApp para session ID: ${exportedSessionId}`, 'info');
    isBotPaused = false; 

    try {
        if (!globalSqliteService || typeof globalSqliteService.sqliteAuthStore !== 'function') {
            throw new Error("[Baileys] sqliteService ou sqliteAuthStore não está disponível.");
        }
        const { state, saveCreds } = await globalSqliteService.sqliteAuthStore(exportedSessionId);

        globalSendLog(`[Baileys] Estado de autenticação carregado/inicializado. Verificando 'creds'...`, 'debug');
        if (!state || !state.creds) {
            globalSendLog(`[Baileys] ALERTA CRÍTICO: state.creds está nulo ou indefinido APÓS sqliteAuthStore.`, 'error');
            state.creds = initAuthCreds(); 
            globalSendLog(`[Baileys] state.creds foi FORÇADAMENTE reinicializado com initAuthCreds().`, 'warn');
        } else {
            globalSendLog(`[Baileys] state.creds (chaves de topo): ${JSON.stringify(Object.keys(state.creds))}`, 'debug');
            logKeyTypes(state.creds, 'state.creds'); // Log detalhado dos tipos dentro de creds
        }
        
        if (state.keys && typeof state.keys.get === 'function' && typeof state.keys.set === 'function') {
            globalSendLog('[Baileys] state.keys parece ser um objeto de store de chaves válido.', 'debug');
        } else {
            globalSendLog('[Baileys] ALERTA CRÍTICO: state.keys NÃO é um objeto de store de chaves válido ou está em falta!', 'error');
        }

        sock = makeWASocket({
            logger: Pino({ level: 'silent' }).child({ level: 'silent' }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds, 
                keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' }).child({ level: 'silent' })),
            },
            browser: Browsers.macOS('Desktop'), 
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: jid => jid?.endsWith('@broadcast'),
            patchMessageBeforeSending: (message) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );
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
                    };
                }
                return message;
            }
        });

        sock.ev.on('creds.update', saveCreds); 

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            currentQR = qr || null;

            if (qr) {
                connectionStatus = 'QR_CODE';
                globalSendLog('[Baileys] QR Code recebido. Enviando para admin via WebSocket.', 'info');
                if (globalWebsocketService) {
                    globalWebsocketService.broadcastToAdmins({
                        type: 'qr_code',
                        clientId: exportedSessionId,
                        payload: { qr: qr }
                    });
                }
                if (globalSqliteService) {
                    await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, 'QR_REQUESTED', sock?.user?.id, qr);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                      statusCode !== DisconnectReason.connectionClosed && 
                                      statusCode !== DisconnectReason.connectionReplaced &&
                                      statusCode !== DisconnectReason.restartRequired &&
                                      statusCode !== DisconnectReason.timedOut;

                connectionStatus = 'DISCONNECTED';
                const errorMessage = lastDisconnect?.error?.message || lastDisconnect?.error?.toString() || 'Desconhecida';
                globalSendLog(`[Baileys] Conexão fechada. Razão: ${errorMessage}. Status: ${statusCode}. Reconectar: ${shouldReconnect}`, 'warn');
                
                if (lastDisconnect?.error) {
                    globalSendLog(`[Baileys] Detalhes completos do erro de desconexão: ${JSON.stringify(lastDisconnect.error, Object.getOwnPropertyNames(lastDisconnect.error))}`, 'error');
                }

                if (globalWebsocketService) {
                    globalWebsocketService.broadcastToAdmins({
                        type: 'status_update',
                        clientId: exportedSessionId,
                        payload: { status: 'DISCONNECTED', reason: statusCode, error: errorMessage }
                    });
                }
                if (globalSqliteService) {
                    await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, 'DISCONNECTED', sock?.user?.id);
                }

                if (statusCode === DisconnectReason.restartRequired) {
                    globalSendLog('[Baileys] Erro 515 (Restart Required). Limpeza de sessão e reinício manual podem ser necessários se persistir.', 'error');
                } else if (shouldReconnect) {
                    globalSendLog('[Baileys] Tentando reconectar em 5 segundos...', 'info');
                    setTimeout(() => connectToWhatsApp(globalSendLog, globalWebsocketService, globalSqliteService), 5000);
                } else {
                    globalSendLog(`[Baileys] Deslogado, timeout ou conexão substituída. Não será reconectado automaticamente. Razão do erro: ${errorMessage}`, 'error');
                }
            } else if (connection === 'open') {
                connectionStatus = 'CONNECTED';
                currentQR = null;
                isBotPaused = false; 
                globalSendLog(`[Baileys] Conexão com WhatsApp estabelecida! Usuário: ${sock.user?.id || 'N/A'}`, 'info');
                if (globalWebsocketService) {
                    globalWebsocketService.broadcastToAdmins({
                        type: 'status_update',
                        clientId: exportedSessionId,
                        payload: { status: 'READY', jid: sock.user?.id, isPaused: isBotPaused }
                    });
                }
                if (globalSqliteService) {
                    await globalSqliteService.updateWhatsappSessionStatus(exportedSessionId, 'CONNECTED', sock.user?.id);
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            // ... (lógica de messages.upsert como antes)
        });
        return sock;

    } catch (error) {
        globalSendLog(`[Baileys] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error');
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: 'status_update',
                clientId: exportedSessionId,
                payload: { status: 'FATAL_ERROR', reason: error.message }
            });
        }
        return null; 
    }
}

// ... (restante das funções: sendWhatsAppMessage, getCurrentStatusAndQR, togglePauseBot, fullLogoutAndCleanup como antes) ...
async function sendWhatsAppMessage(toJid, messageContentBaileys, agentUsername, conversationId, sqliteServiceInstancePassed) {
    const serviceToUse = sqliteServiceInstancePassed || globalSqliteService;

    if (isBotPaused) {
        globalSendLog(`[Baileys] Bot pausado. Não é possível enviar mensagem para ${toJid}.`, 'warn');
        return null;
    }
    if (!sock || connectionStatus !== 'CONNECTED') {
        globalSendLog(`[Baileys] Não é possível enviar mensagem. Socket não conectado. Status: ${connectionStatus}`, 'warn');
        return null;
    }
    try {
        globalSendLog(`[Baileys] Enviando mensagem para ${toJid} pelo atendente ${agentUsername}: ${JSON.stringify(messageContentBaileys)}`, 'info');
        const sentMsg = await sock.sendMessage(toJid, messageContentBaileys);
        globalSendLog(`[Baileys] Mensagem enviada com ID Baileys: ${sentMsg.key.id}`, 'info');

        if (!serviceToUse) {
            globalSendLog('[Baileys] sqliteService não está disponível para salvar mensagem enviada.', 'error');
            return { baileys_msg_id: sentMsg.key.id, timestamp: new Date(parseInt(sentMsg.messageTimestamp) * 1000).toISOString() };
        }

        const savedMessage = await serviceToUse.saveMessage({
            conversation_id: conversationId,
            baileys_msg_id: sentMsg.key.id,
            sender_type: 'AGENT',
            sender_jid: sock.user?.id,
            message_content: messageContentBaileys.text || JSON.stringify(messageContentBaileys),
            message_type: messageContentBaileys.text ? 'text' : 'media',
            timestamp: new Date(parseInt(sentMsg.messageTimestamp) * 1000).toISOString(),
            is_read_by_agent: true 
        });
        return savedMessage;
    } catch (error) {
        globalSendLog(`[Baileys] Erro ao enviar mensagem para ${toJid}: ${error.message}`, 'error');
        return null;
    }
}

function getCurrentStatusAndQR() {
    return {
        sessionId: exportedSessionId,
        status: connectionStatus,
        qrCode: currentQR,
        jid: sock?.user?.id,
        isPaused: isBotPaused 
    };
}

function getSocket() {
    return sock;
}

async function togglePauseBot() {
    isBotPaused = !isBotPaused;
    globalSendLog(`[Baileys] Estado de pausa do bot alterado para: ${isBotPaused}`, 'info');
    if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
            type: 'bot_status_update', 
            payload: { isPaused: isBotPaused, statusMessage: `Robô ${isBotPaused ? 'pausado' : 'ativo'}.` }
        });
    }
    return isBotPaused;
}

async function fullLogoutAndCleanup() {
    globalSendLog('[Baileys] Iniciando logout completo e limpeza...', 'info');
    if (sock) {
        try {
            if (globalWebsocketService) {
                 globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: exportedSessionId,
                    payload: { status: 'DISCONNECTING', reason: 'Logout/Restart solicitado' }
                });
            }
            await sock.logout();
            globalSendLog('[Baileys] Logout do Baileys realizado com sucesso.', 'info');
        } catch (e) {
            globalSendLog(`[Baileys] Erro durante o logout: ${e.message}. Tentando desconexão forçada do WebSocket.`, 'warn');
            if (sock.ws && sock.ws.readyState === sock.ws.OPEN) { 
                sock.ws.close(); 
            }
        }
        sock = null; 
    } else {
        globalSendLog('[Baileys] Socket não existente para logout.', 'warn');
    }
    connectionStatus = 'DISCONNECTED';
    currentQR = null;
    isBotPaused = false; 

    if (globalSqliteService && typeof globalSqliteService.sqliteAuthStore === 'function') {
        try {
            const authStore = await globalSqliteService.sqliteAuthStore(exportedSessionId);
            if (authStore && typeof authStore.clearAllData === 'function') { 
                await authStore.clearAllData(); 
                globalSendLog(`[Baileys] Dados de autenticação para a sessão ${exportedSessionId} limpos do banco de dados.`, 'info');
            } else if (authStore) {
                 globalSendLog(`[Baileys] Função clearAllData não encontrada no sqliteAuthStore. Os dados de autenticação do DB não foram limpos.`, 'warn');
            }
        } catch (dbError) {
            globalSendLog(`[Baileys] Erro ao limpar dados de autenticação do DB: ${dbError.message}`, 'error');
        }
    }
    
    globalSendLog('[Baileys] Limpeza para reinício concluída.', 'info');
}

module.exports = {
    connectToWhatsApp,
    sendWhatsAppMessage,
    getSocket,
    getCurrentStatusAndQR,
    togglePauseBot, 
    fullLogoutAndCleanup,
    sessionId: exportedSessionId 
};
