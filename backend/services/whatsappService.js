// backend/services/whatsappService.js
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js")
const qrcode = require("qrcode-terminal") 
const fs = require("fs")
const path = require("path")

let client; 
const sessionId = "whatsapp-bot-session"; 

let globalSendLog;
let globalWebsocketService;
let globalSqliteService;
let currentQR = null;
let connectionStatus = 'DISCONNECTED';
let isBotPaused = false;
let authPath; 

// Função auxiliar para simular delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Simula digitação e envia a mensagem com os delays configurados.
 * @param {object} chat - O objeto chat do whatsapp-web.js.
 * @param {string} text - O texto da mensagem a ser enviada.
 * @param {number} typingDelayMs - Tempo para simular digitação.
 * @param {number} responseDelayMs - Atraso adicional antes de enviar.
 * @param {number} conversationId - ID da conversa no banco de dados.
 * @param {string} clientJid - JID do cliente.
 */
async function sendTypingMessageWithDelay(chat, text, typingDelayMs, responseDelayMs, conversationId, clientJid) {
    try {
        if (!chat) {
            globalSendLog(`[WhatsApp_WWJS] Erro: Objeto 'chat' é indefinido em sendTypingMessageWithDelay para ${clientJid}.`, 'error');
            return null;
        }
        globalSendLog(`[WhatsApp_WWJS] sendTypingMessageWithDelay: Iniciando para ${clientJid}. Typing: ${typingDelayMs}ms, Send: ${responseDelayMs}ms. Texto: "${text.substring(0,50)}..."`, 'debug');

        if (typingDelayMs > 0) {
            await chat.sendStateTyping(); // Envia status "digitando"
            await delay(typingDelayMs);
        }
        if (responseDelayMs > 0) {
            await delay(responseDelayMs);
        }
        
        const sentMsg = await chat.sendMessage(text);
        // Limpa o estado de "digitando" APÓS o envio da mensagem
        if (typingDelayMs > 0 || responseDelayMs > 0) { // Apenas limpa se algum estado foi enviado
             await chat.clearState(); 
        }
        globalSendLog(`[WhatsApp_WWJS] Mensagem do robô enviada para ${clientJid}: "${text}"`, 'info');

        // Salvar mensagem do robô no banco
        if (globalSqliteService && conversationId) {
            await globalSqliteService.saveMessage({
                conversationId: conversationId, // Correto: camelCase
                baileys_msg_id: sentMsg.id.id, // ID da mensagem do whatsapp-web.js
                senderType: 'BOT', 
                senderId: 'ROBOT_AUTO_RESPONSE', // Identificador do robô
                messageType: 'chat', // Tipo da mensagem
                content: text,
                timestamp: new Date(sentMsg.timestamp * 1000).toISOString(),
                is_read_by_agent: true, // Mensagens do bot são "lidas" pelo sistema
                is_read_by_client: false // Será marcada como lida quando o cliente ver
            });
            globalSendLog(`[WhatsApp_WWJS] Mensagem do robô salva no DB para conversa ${conversationId}.`, 'debug');
        }
        return sentMsg;
    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro ao enviar mensagem (sendTypingMessageWithDelay) para ${clientJid}: ${error.message}`, 'error');
        if (chat && typeof chat.clearState === 'function') {
            await chat.clearState().catch(e => globalSendLog(`[WhatsApp_WWJS] Erro ao limpar estado do chat: ${e.message}`, 'warn'));
        }
        return null;
    }
}


/**
 * Processa a mensagem recebida para verificar se alguma resposta automática do robô deve ser acionada.
 * @param {object} msg - O objeto da mensagem recebida do whatsapp-web.js.
 * @param {object} conversation - O objeto da conversa do banco de dados.
 * @param {string} clientMessageContent - O conteúdo da mensagem do cliente (geralmente msg.body).
 */
async function processBotResponse(msg, conversation, clientMessageContent) {
    globalSendLog(`[BotLogic] Iniciando processamento para mensagem: "${clientMessageContent}" na conversa ID ${conversation.ID}`, 'debug');
    if (!globalSqliteService || !client || connectionStatus !== 'CONNECTED') {
        globalSendLog('[BotLogic] Robô não pode processar: Serviços não disponíveis ou WhatsApp não conectado.', 'warn');
        return false;
    }

    try {
        const configBotActiveResult = await globalSqliteService.getConfigByKey('bot_active');
        // getConfigByKey agora retorna o valor booleano diretamente se CONFIG_TYPE for 'boolean'
        const isBotActive = configBotActiveResult && configBotActiveResult.CONFIG_VALUE === true; 
        globalSendLog(`[BotLogic] Status do Robô (config bot_active): ${isBotActive}. Valor bruto do DB: ${configBotActiveResult ? configBotActiveResult.CONFIG_VALUE : 'N/A'}`, 'debug');


        if (!isBotActive) {
            globalSendLog('[BotLogic] Robô está desativado nas configurações globais.', 'info');
            return false;
        }
        
        const autoResponses = await globalSqliteService.getAllAutoResponses();
        if (!autoResponses || autoResponses.length === 0) {
            globalSendLog('[BotLogic] Nenhuma resposta automática configurada no banco.', 'debug');
            return false;
        }
        globalSendLog(`[BotLogic] ${autoResponses.length} respostas automáticas carregadas do DB.`, 'debug');


        const clientJid = msg.from;
        const chat = await msg.getChat(); 
        if (!chat) {
            globalSendLog(`[BotLogic] Não foi possível obter o objeto 'chat' para ${clientJid}. Abortando resposta do robô.`, 'error');
            return false;
        }


        for (const autoResp of autoResponses) {
            globalSendLog(`[BotLogic] Verificando resposta ID ${autoResp.ID}: "${autoResp.RESPONSE_NAME}", Padrão: "${autoResp.PATTERN}", Ativa: ${autoResp.ACTIVE}`, 'debug');
            if (!autoResp.ACTIVE) {
                globalSendLog(`[BotLogic] Resposta ID ${autoResp.ID} está inativa. Pulando.`, 'debug');
                continue;
            }

            // TODO: Implementar verificação de dias e horários permitidos para esta autoResp específica.
            // Ex: const now = new Date(); const currentDay = now.getDay(); const currentTime = `${now.getHours()}:${now.getMinutes()}`;
            // if (!isTimeAndDayAllowed(currentDay, currentTime, autoResp.ALLOWED_DAYS, autoResp.START_TIME, autoResp.END_TIME)) continue;

            let matched = false;
            try {
                const patterns = autoResp.PATTERN.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
                const lowerClientMessage = clientMessageContent.toLowerCase();
                
                if (patterns.some(p => lowerClientMessage.includes(p))) {
                    matched = true;
                } else {
                    try {
                        const regex = new RegExp(autoResp.PATTERN, 'i'); // 'i' para case-insensitive
                         if (regex.test(clientMessageContent)) {
                            matched = true;
                        }
                    } catch (e) {
                        // Silencioso se não for regex válido e a string simples não bateu
                    }
                }

            } catch (e) {
                globalSendLog(`[BotLogic] Erro ao processar padrão para resposta ID ${autoResp.ID} (Padrão: ${autoResp.PATTERN}): ${e.message}`, 'error');
                continue; 
            }

            if (matched) {
                globalSendLog(`[BotLogic] MENSAGEM CORRESPONDEU! Cliente: "${clientMessageContent}", Resposta: "${autoResp.RESPONSE_NAME}", Padrão: "${autoResp.PATTERN}".`, 'info');
                
                let responseText = autoResp.RESPONSE_TEXT;
                const contact = await msg.getContact();
                const clientName = contact.pushname || contact.name || clientJid.split('@')[0];
                responseText = responseText.replace(/{client_name}/gi, clientName.split(" ")[0]); 

                const typingDelay = parseInt(autoResp.TYPING_DELAY_MS, 10); 
                const sendDelay = parseInt(autoResp.RESPONSE_DELAY_MS, 10);   
                
                globalSendLog(`[BotLogic] Enviando resposta: "${responseText.substring(0,50)}..." com typingDelay: ${typingDelay}ms, sendDelay: ${sendDelay}ms`, 'debug');
                await sendTypingMessageWithDelay(chat, responseText, typingDelay, sendDelay, conversation.ID, clientJid);
                return true; 
            }
        }
        globalSendLog(`[BotLogic] Nenhuma resposta automática acionada para: "${clientMessageContent}"`, 'debug');
        return false; 

    } catch (error) {
        globalSendLog(`[BotLogic] Erro CRÍTICO ao processar respostas do robô: ${error.message}\n${error.stack}`, 'error');
        return false;
    }
}


async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, sqliteServiceInstance, appUserDataPath) {
    globalSendLog = sendLogFunction;
    globalWebsocketService = websocketServiceInstance;
    globalSqliteService = sqliteServiceInstance;

    if (!appUserDataPath) {
        const critErrorMsg = "[WhatsApp_WWJS] CRITICAL Error: User data path (appUserDataPath) não fornecido.";
        globalSendLog(critErrorMsg, "error");
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: "status_update",
                clientId: module.exports.sessionId, 
                payload: { status: "FATAL_ERROR", reason: critErrorMsg },
            });
        }
        return null;
    }

    authPath = path.join(appUserDataPath, "Auth", "wwebjs_auth", sessionId); 
    globalSendLog(`[WhatsApp_WWJS] Caminho da pasta de autenticação definido para: ${authPath}`, "info");

    if (!fs.existsSync(path.dirname(authPath))) { 
        try {
            fs.mkdirSync(path.dirname(authPath), { recursive: true });
            globalSendLog(`[WhatsApp_WWJS] Pasta pai da autenticação criada em: ${path.dirname(authPath)}`, "info");
        } catch (mkdirErr) {
            const critErrorMsg = `[WhatsApp_WWJS] CRITICAL Error criando pasta pai da autenticação ${path.dirname(authPath)}: ${mkdirErr.message}`;
            globalSendLog(critErrorMsg, "error");
            return null;
        }
    }
    
    isBotPaused = false;

    try {
        globalSendLog('[WhatsApp_WWJS] Iniciando conexão com whatsapp-web.js...', 'info');
        
        client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionId, 
                dataPath: path.join(appUserDataPath, "Auth", "wwebjs_auth") 
            }),
            puppeteer: {
                headless: true, 
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                    '--single-process',  '--disable-gpu'
                ],
            },
            webVersionCache: { 
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        client.on('qr', (qr) => {
            currentQR = qr;
            connectionStatus = 'QR_CODE';
            // qrcode.generate(qr, { small: true });  // Comentado para não poluir o terminal principal
            globalSendLog('[WhatsApp_WWJS] QR Code recebido. Enviando para admin.', 'info');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'qr_code',
                    clientId: module.exports.sessionId,
                    payload: { qr: qr }
                });
            }
            if (globalSqliteService) {
                globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'QR_REQUESTED', null, qr);
            }
        });

        client.on('authenticated', () => {
            globalSendLog('[WhatsApp_WWJS] Autenticado com sucesso!', 'info');
            currentQR = null; 
            if (globalSqliteService) {
                globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'AUTHENTICATED', client.info?.wid?._serialized);
            }
        });

        client.on('auth_failure', async (msg) => { 
            connectionStatus = 'AUTH_FAILURE';
            globalSendLog(`[WhatsApp_WWJS] Falha na autenticação: ${msg}`, 'error');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: module.exports.sessionId,
                    payload: { status: 'AUTH_FAILURE', reason: msg }
                });
            }
            if (globalSqliteService) {
                await globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'AUTH_FAILURE');
            }
            await fullLogoutAndCleanup(true); 
        });

        client.on('ready', () => {
            connectionStatus = 'CONNECTED';
            currentQR = null;
            isBotPaused = false;
            const jid = client.info?.wid?._serialized;
            globalSendLog(`[WhatsApp_WWJS] Cliente pronto! Conectado como: ${jid || 'N/A'}`, 'info');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: module.exports.sessionId,
                    payload: { status: 'READY', jid: jid, isPaused: isBotPaused }
                });
            }
            if (globalSqliteService) {
                globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'CONNECTED', jid);
            }
        });

        client.on('disconnected', async (reason) => {
            connectionStatus = 'DISCONNECTED';
            globalSendLog(`[WhatsApp_WWJS] Cliente desconectado: ${reason}`, 'warn');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: module.exports.sessionId,
                    payload: { status: 'DISCONNECTED', reason: reason }
                });
            }
            if (globalSqliteService) {
                await globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'DISCONNECTED');
            }
            
            if (String(reason).includes('NAVIGATION') || String(reason).includes('LOGGED_OUT') || reason === 'NAVIGATION_ERROR' || reason === 'Max qrcode retries reached' || reason === ' zowel') { 
                globalSendLog(`[WhatsApp_WWJS] Desconexão indica logout ou problema crítico de sessão (${reason}). Limpando sessão...`, 'warn');
                await fullLogoutAndCleanup(true); 
            } else {
                 globalSendLog('[WhatsApp_WWJS] Tentando reinicializar o cliente em 10 segundos...', 'info');
                 setTimeout(() => {
                    if (client && typeof client.initialize === 'function') { 
                         client.initialize().catch(err => globalSendLog(`[WhatsApp_WWJS] Falha ao reinicializar após desconexão: ${err.message}`, "error"));
                    } else {
                        globalSendLog('[WhatsApp_WWJS] Cliente não disponível para reinicialização.', 'warn');
                    }
                 }, 10000);
            }
        });

        client.on('message', async (msg) => {
            if (isBotPaused || msg.fromMe || msg.from === 'status@broadcast' || msg.isStatus) { 
                return;
            }

            const senderJid = msg.from;
            let senderName = msg.author || senderJid.split('@')[0]; 
            
            try {
                const contact = await msg.getContact();
                senderName = contact.pushname || contact.name || senderName;
            } catch (contactError) {
                globalSendLog(`[WhatsApp_WWJS] Erro ao obter detalhes do contato ${senderJid}: ${contactError.message}`, 'warn');
            }

            let clientOriginalMessageContent = msg.body; 
            let displayMessageContent = msg.body; 
            let messageType = msg.type; 
            let mediaUrl = null; 

            if (msg.hasMedia) {
                try {
                    messageType = msg.type; 
                    displayMessageContent = msg.caption ? `${msg.caption} (${messageType})` : `(${messageType})`;
                } catch (mediaError) {
                    globalSendLog(`[WhatsApp_WWJS] Erro ao processar metadados de mídia de ${senderName}: ${mediaError.message}`, 'error');
                    displayMessageContent = `(Mídia não processada: ${msg.type})`;
                }
            }
            
            const messageTimestamp = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();

            globalSendLog(`[WhatsApp_WWJS] Mensagem recebida de ${senderName} (${senderJid}): "${displayMessageContent}" (Tipo: ${messageType})`, 'info');

            if (globalSqliteService) {
                try {
                    const contact = await msg.getContact(); 
                    const profilePicUrl = await contact.getProfilePicUrl().catch(() => null);

                    const { conversation, client: dbClient } = await globalSqliteService.findOrCreateConversation(
                        senderJid, senderName, profilePicUrl, senderJid.split('@')[0] 
                    );

                    if (conversation && typeof conversation.ID !== 'undefined') {
                        const messageData = {
                            conversationId: conversation.ID, // CORRETO: camelCase
                            baileys_msg_id: msg.id.id, 
                            senderType: "CLIENT",
                            senderId: senderJid,
                            messageType: messageType,
                            content: displayMessageContent, 
                            timestamp: messageTimestamp,
                            is_read_by_agent: false,
                            mediaUrl: mediaUrl 
                        };
                        
                        await globalSqliteService.saveMessage(messageData);
                        globalSendLog(`[WhatsApp_WWJS] Mensagem de ${senderName} salva na conversa ID ${conversation.ID}.`, 'debug');

                        let botReplied = false;
                        if (!conversation.ATTENDANT_ID) { 
                           botReplied = await processBotResponse(msg, conversation, clientOriginalMessageContent); 
                        }

                        if (globalWebsocketService) {
                            const conversationDetailsForUI = await globalSqliteService.getConversationById(conversation.ID);
                            if (conversationDetailsForUI) {
                                if (conversationDetailsForUI.ATTENDANT_ID && conversationDetailsForUI.ATTENDANT_USERNAME) {
                                    globalWebsocketService.sendMessageToAttendant(conversationDetailsForUI.ATTENDANT_USERNAME, {
                                        type: "new_message",
                                        payload: {
                                            conversationId: conversation.ID,
                                            message: { ...messageData, CLIENT_NAME: senderName, SENDER_TYPE: "CLIENT" } 
                                        }
                                    });
                                } else if (!botReplied) { 
                                    globalWebsocketService.broadcastToAttendants({
                                        type: "pending_conversation",
                                        payload: {
                                            ID: conversation.ID, CLIENT_JID: senderJid, CLIENT_NAME: senderName,
                                            CLIENT_PROFILE_PIC: profilePicUrl, LAST_MESSAGE: displayMessageContent,
                                            LAST_MESSAGE_TIME: messageTimestamp, UNREAD_MESSAGES: 1, STATUS: 'pending'
                                        }
                                    });
                                }
                            }
                        }
                    } else {
                        globalSendLog(`[WhatsApp_WWJS] CRÍTICO: ID da Conversa é indefinido para JID ${senderJid}. Mensagem não foi salva. Detalhes da conversa: ${JSON.stringify(conversation)}`, "error");
                    }
                } catch (dbError) {
                    globalSendLog(`[WhatsApp_WWJS] Erro de banco de dados ao processar mensagem de ${senderName}: ${dbError.message}\n${dbError.stack}`, "error");
                }
            }
        });
        
        globalSendLog('[WhatsApp_WWJS] Cliente whatsapp-web.js inicializando...', 'info');
        await client.initialize();
        globalSendLog('[WhatsApp_WWJS] Cliente whatsapp-web.js inicializado e listeners configurados.', 'info');
        return client;

    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error');
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: 'status_update',
                clientId: module.exports.sessionId,
                payload: { status: 'FATAL_ERROR', reason: error.message }
            });
        }
        return null;
    }
}

async function sendWhatsAppMessage(toJid, messageContent, agentUsername, conversationId, sqliteServiceInstancePassed) {
    const serviceToUse = sqliteServiceInstancePassed || globalSqliteService;

    if (isBotPaused) {
        globalSendLog(`[WhatsApp_WWJS] Bot pausado. Não é possível enviar mensagem para ${toJid}.`, 'warn');
        return null;
    }
    if (!client || connectionStatus !== 'CONNECTED') {
        globalSendLog(`[WhatsApp_WWJS] Não é possível enviar mensagem. Cliente não conectado. Status: ${connectionStatus}`, 'warn');
        return null;
    }
    try {
        let contentToSend = messageContent;
        let options = {};
        let messageTypeForDb = 'chat'; 

        if (typeof messageContent === 'object' && messageContent !== null) {
            if (messageContent.text) {
                contentToSend = messageContent.text;
            } else if (messageContent.image && messageContent.image.url) {
                const media = await MessageMedia.fromUrl(messageContent.image.url, { unsafeMime: true }); 
                contentToSend = media;
                if (messageContent.caption) options.caption = messageContent.caption;
                messageTypeForDb = 'image';
            } else if (messageContent.document && messageContent.document.url) {
                const media = await MessageMedia.fromUrl(messageContent.document.url, { unsafeMime: true });
                contentToSend = media;
                if (messageContent.document.fileName) options.filename = messageContent.document.fileName; 
                messageTypeForDb = 'document';
            } else {
                 globalSendLog(`[WhatsApp_WWJS] Formato de conteúdo de mensagem não suportado: ${JSON.stringify(messageContent)}`, 'warn');
                 return null;
            }
        } else if (typeof messageContent !== 'string') {
            globalSendLog(`[WhatsApp_WWJS] Conteúdo da mensagem inválido, esperado string ou objeto: ${typeof messageContent}`, 'warn');
            return null;
        }


        globalSendLog(`[WhatsApp_WWJS] Enviando mensagem para ${toJid} pelo atendente ${agentUsername}: ${typeof contentToSend === 'string' ? contentToSend.substring(0,100) : `(${messageTypeForDb})`}...`, 'info');
        
        const sentMsg = await client.sendMessage(toJid, contentToSend, options);
        const sentMsgId = sentMsg.id.id; 
        const sentMsgTimestamp = sentMsg.timestamp ? new Date(sentMsg.timestamp * 1000).toISOString() : new Date().toISOString();
        globalSendLog(`[WhatsApp_WWJS] Mensagem enviada com ID: ${sentMsgId}`, 'info');

        if (!serviceToUse) {
            globalSendLog('[WhatsApp_WWJS] sqliteService não está disponível para salvar mensagem enviada.', 'error');
            return { baileys_msg_id: sentMsgId, timestamp: sentMsgTimestamp }; 
        }

        const messageTextForDb = typeof contentToSend === 'string' ? contentToSend : 
                                 (options.caption || (options.filename || `(${messageTypeForDb})`));

        const savedMessage = await serviceToUse.saveMessage({
            conversationId: conversationId, // Correto: camelCase
            baileys_msg_id: sentMsgId, 
            senderType: 'AGENT',
            senderId: agentUsername, 
            messageType: messageTypeForDb,
            content: messageTextForDb,
            timestamp: sentMsgTimestamp,
            is_read_by_agent: true 
        });
        return savedMessage;
    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro ao enviar mensagem para ${toJid}: ${error.message}`, 'error');
        globalSendLog(error.stack, 'debug');
        return null;
    }
}

function getCurrentStatusAndQR() {
    return {
        sessionId: module.exports.sessionId,
        status: connectionStatus,
        qrCode: currentQR,
        jid: client?.info?.wid?._serialized, 
        isPaused: isBotPaused 
    };
}

function getClient() { 
    return client;
}
function getSocket() { 
    return client;
}

async function togglePauseBot() {
    isBotPaused = !isBotPaused;
    globalSendLog(`[WhatsApp_WWJS] Estado de pausa do bot alterado para: ${isBotPaused}`, 'info');
    if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
            type: 'bot_status_update', 
            payload: { isPaused: isBotPaused, statusMessage: `Robô ${isBotPaused ? 'pausado' : 'ativo'}.` }
        });
    }
    return isBotPaused;
}

async function fullLogoutAndCleanup(isDisconnectEvent = false) {
    globalSendLog('[WhatsApp_WWJS] Iniciando logout completo e limpeza de sessão...', 'info');
    
    if (client) {
        try {
            if (!isDisconnectEvent && typeof client.logout === 'function') { 
                 globalSendLog('[WhatsApp_WWJS] Tentando logout do cliente whatsapp-web.js...', 'info');
                 await client.logout(); 
                 globalSendLog('[WhatsApp_WWJS] Logout do cliente realizado com sucesso.', 'info');
            } else if (isDisconnectEvent) {
                 globalSendLog('[WhatsApp_WWJS] Desconectado externamente ou logout já ocorreu, pulando client.logout().', 'info');
            }
            
            if (typeof client.destroy === 'function') {
                await client.destroy();
                globalSendLog('[WhatsApp_WWJS] Cliente whatsapp-web.js destruído.', 'info');
            }

        } catch (e) {
            globalSendLog(`[WhatsApp_WWJS] Erro durante o logout/destroy do cliente: ${e.message}.`, 'warn');
        } finally {
            client = null; 
        }
    } else {
        globalSendLog('[WhatsApp_WWJS] Cliente whatsapp-web.js não existente para logout.', 'warn');
    }

    connectionStatus = 'DISCONNECTED';
    currentQR = null;
    isBotPaused = false; 

    const sessionAuthPath = path.join(appUserDataPath, "Auth", "wwebjs_auth", sessionId);
    if (fs.existsSync(sessionAuthPath)) {
        try {
            fs.rmSync(sessionAuthPath, { recursive: true, force: true });
            globalSendLog(`[WhatsApp_WWJS] Pasta de autenticação da sessão (${sessionAuthPath}) removida com sucesso.`, 'info');
        } catch (err) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao remover pasta de autenticação da sessão (${sessionAuthPath}): ${err.message}`, 'error');
        }
    } else {
        globalSendLog(`[WhatsApp_WWJS] Pasta de autenticação da sessão (${sessionAuthPath}) não encontrada para remoção.`, 'warn');
    }
    
    if (globalSqliteService && typeof globalSqliteService.updateWhatsappSessionStatus === 'function') {
        try {
            await globalSqliteService.updateWhatsappSessionStatus(module.exports.sessionId, 'CLEARED_FOR_RESTART', null, null);
            globalSendLog(`[WhatsApp_WWJS] Status da sessão ${module.exports.sessionId} atualizado para CLEARED_FOR_RESTART no DB.`, 'info');
        } catch (dbError) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao atualizar status da sessão no DB durante cleanup: ${dbError.message}`, 'error');
        }
    }
    
    globalSendLog('[WhatsApp_WWJS] Limpeza de sessão para reinício concluída.', 'info');
     if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
            type: 'status_update',
            clientId: module.exports.sessionId,
            payload: { status: 'DISCONNECTED', reason: 'Sessão limpa, aguardando novo QR Code.' }
        });
    }
}

module.exports = {
    connectToWhatsApp,
    sendWhatsAppMessage,
    getClient, 
    getSocket, 
    getCurrentStatusAndQR,
    togglePauseBot, 
    fullLogoutAndCleanup,
    sessionId: "whatsapp-bot-session" 
};
