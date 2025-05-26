// backend/services/whatsappService.js
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

let client;
const sessionIdExported = "whatsapp-bot-session";

let globalSendLog;
let globalWebsocketService;
let globalDbServices;
let currentQR = null;
let connectionStatus = 'DISCONNECTED';
let isBotPaused = false;
let authPathBase;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendTypingMessageWithDelay(chat, text, typingDelayMs, responseDelayMs, conversationId, clientJid) {
    try {
        if (!chat || typeof chat.sendStateTyping !== 'function' || typeof chat.sendMessage !== 'function' || typeof chat.clearState !== 'function') {
            globalSendLog(`[WhatsApp_WWJS] Erro em sendTypingMessageWithDelay: Objeto 'chat' inválido ou faltando métodos para ${clientJid}.`, 'error');
            return null;
        }
        globalSendLog(`[WhatsApp_WWJS] sendTypingMessageWithDelay: Para ${clientJid}. Typing: ${typingDelayMs}ms, Send: ${responseDelayMs}ms. Texto: "${text.substring(0,50)}..."`, 'debug');

        if (typingDelayMs > 0) {
            await chat.sendStateTyping();
            await delay(typingDelayMs);
        }
        if (responseDelayMs > 0) {
            if (typingDelayMs === 0) await delay(responseDelayMs);
            else if (responseDelayMs > typingDelayMs) await delay(responseDelayMs - typingDelayMs);
        }
        
        const sentMsg = await chat.sendMessage(text);
        if (typingDelayMs > 0) {
             await chat.clearState();
        }
        globalSendLog(`[WhatsApp_WWJS] Mensagem do robô enviada para ${clientJid}: "${text}" (ID: ${sentMsg.id.id})`, 'info');

        if (globalDbServices && globalDbServices.chat && conversationId) {
            await globalDbServices.chat.saveMessage({
                conversationId: conversationId,
                message_platform_id: sentMsg.id.id,
                senderType: 'BOT',
                senderId: 'ROBOT_AUTO_RESPONSE',
                messageType: 'chat',
                content: text,
                timestamp: new Date(sentMsg.timestamp * 1000).toISOString(),
                read_by_user: true,
                read_by_client: false
            });
            globalSendLog(`[WhatsApp_WWJS] Mensagem do robô salva no DB para conversa ${conversationId}.`, 'debug');
        }
        return sentMsg;
    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro em sendTypingMessageWithDelay para ${clientJid}: ${error.message}`, 'error');
        if (chat && typeof chat.clearState === 'function') {
            await chat.clearState().catch(e => globalSendLog(`[WhatsApp_WWJS] Erro ao limpar estado do chat após falha: ${e.message}`, 'warn'));
        }
        return null;
    }
}

async function processBotResponse(msg, conversation, clientMessageContent) {
    globalSendLog(`[BotLogic] processBotResponse: Iniciando para mensagem: "${clientMessageContent}" na conversa ID ${conversation.ID}`, 'debug');
    if (!globalDbServices || !globalDbServices.main || !globalDbServices.admin || !client || connectionStatus !== 'CONNECTED') {
        globalSendLog('[BotLogic] Robô não pode processar: Serviços DB/WhatsApp não disponíveis ou WhatsApp não conectado.', 'warn');
        return false;
    }

    try {
        const configBotActiveResult = await globalDbServices.main.getConfigByKey('bot_active');
        const isBotGloballyActive = configBotActiveResult && configBotActiveResult.CONFIG_VALUE === true;
        globalSendLog(`[BotLogic] Status global do Robô (bot_active): ${isBotGloballyActive}.`, 'debug');

        if (!isBotGloballyActive) {
            globalSendLog('[BotLogic] Robô está desativado nas configurações globais.', 'info');
            return false;
        }
        
        const autoResponses = await globalDbServices.admin.getAllAutoResponses();
        if (!autoResponses || autoResponses.length === 0) {
            globalSendLog('[BotLogic] Nenhuma resposta automática configurada no banco.', 'debug');
            return false;
        }
        globalSendLog(`[BotLogic] ${autoResponses.length} respostas automáticas carregadas. Verificando correspondências...`, 'debug');

        const clientJid = msg.from;
        const chat = await msg.getChat();
        if (!chat) {
            globalSendLog(`[BotLogic] Não foi possível obter o objeto 'chat' para ${clientJid}. Abortando.`, 'error');
            return false;
        }

        autoResponses.sort((a, b) => (b.PRIORITY || 0) - (a.PRIORITY || 0));

        for (const autoResp of autoResponses) {
            globalSendLog(`[BotLogic] Verificando Resposta ID ${autoResp.ID}: "${autoResp.RESPONSE_NAME}", Padrão: "${autoResp.PATTERN}", Ativa: ${autoResp.ACTIVE}, Prioridade: ${autoResp.PRIORITY}`, 'debug');
            if (!autoResp.ACTIVE) {
                globalSendLog(`[BotLogic] Resposta ID ${autoResp.ID} está inativa. Pulando.`, 'debug');
                continue;
            }

            let matched = false;
            try {
                const patterns = autoResp.PATTERN.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
                const lowerClientMessage = clientMessageContent.toLowerCase();
                
                if (patterns.some(p => lowerClientMessage.includes(p))) {
                    matched = true;
                    globalSendLog(`[BotLogic] Match por palavra-chave simples: Padrão "${patterns.find(p => lowerClientMessage.includes(p))}" em "${lowerClientMessage}" para Resposta ID ${autoResp.ID}`, 'debug');
                } else {
                    try {
                        const regex = new RegExp(autoResp.PATTERN, 'i');
                         if (regex.test(clientMessageContent)) {
                            matched = true;
                            globalSendLog(`[BotLogic] Match por Regex: Padrão "${autoResp.PATTERN}" em "${clientMessageContent}" para Resposta ID ${autoResp.ID}`, 'debug');
                        }
                    } catch (e) {
                        globalSendLog(`[BotLogic] Padrão "${autoResp.PATTERN}" não é Regex válido (Erro Regex: ${e.message}). Match simples não ocorreu.`, 'debug');
                    }
                }
            } catch (e) {
                globalSendLog(`[BotLogic] Erro ao processar padrão para resposta ID ${autoResp.ID} ("${autoResp.PATTERN}"): ${e.message}`, 'error');
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

async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, dbServicesInstance, appUserDataPath) {
    globalSendLog = sendLogFunction;
    globalWebsocketService = websocketServiceInstance;
    globalDbServices = dbServicesInstance;

    globalSendLog(`[WhatsApp_WWJS] connectToWhatsApp INICIADO. appUserDataPath: ${appUserDataPath}`, 'info');

    if (client) {
        globalSendLog('[WhatsApp_WWJS] Tentativa de conectar enquanto um cliente já existe. Tentando destruir cliente anterior...', 'warn');
        try {
            if (typeof client.destroy === 'function') {
                await client.destroy();
                globalSendLog('[WhatsApp_WWJS] Cliente anterior destruído com sucesso.', 'info');
            }
        } catch (destroyError) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao destruir cliente anterior: ${destroyError.message}`, 'error');
        }
        client = null;
    }

    if (!appUserDataPath) {
        const critErrorMsg = "[WhatsApp_WWJS] CRITICAL Error: User data path (appUserDataPath) não fornecido para LocalAuth.";
        globalSendLog(critErrorMsg, "error");
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: "status_update",
                clientId: sessionIdExported,
                payload: { status: "FATAL_ERROR", reason: critErrorMsg },
            });
        }
        return null;
    }

    authPathBase = path.join(appUserDataPath, "Auth", "wwebjs_auth");
    globalSendLog(`[WhatsApp_WWJS] Diretório base para autenticação LocalAuth (dataPath): ${authPathBase}`, "info");

    try {
        if (!fs.existsSync(authPathBase)) {
            fs.mkdirSync(authPathBase, { recursive: true });
            globalSendLog(`[WhatsApp_WWJS] Pasta base de autenticação criada em: ${authPathBase}`, "info");
        } else {
            globalSendLog(`[WhatsApp_WWJS] Pasta base de autenticação já existe em: ${authPathBase}`, "debug");
        }
    } catch (mkdirErr) {
        const critErrorMsg = `[WhatsApp_WWJS] CRITICAL Error criando pasta base de autenticação ${authPathBase}: ${mkdirErr.message}`;
        globalSendLog(critErrorMsg, "error");
        return null;
    }
    
    const specificSessionPath = path.join(authPathBase, `session-${sessionIdExported}`);
    globalSendLog(`[WhatsApp_WWJS] Verificando pasta de sessão específica: ${specificSessionPath}`, "debug");
    if (fs.existsSync(specificSessionPath)) {
        globalSendLog(`[WhatsApp_WWJS] Pasta de sessão específica ENCONTRADA. Tentando reutilizar sessão.`, "info");
        try {
            const files = fs.readdirSync(specificSessionPath);
            globalSendLog(`[WhatsApp_WWJS] Conteúdo da pasta de sessão: ${files.join(', ') || '(vazia)'}`, "debug");
        } catch (e) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao acessar pasta de sessão ${specificSessionPath}: ${e.message}. Pode indicar problema de permissão ou corrupção.`, "warn");
        }
    } else {
        globalSendLog(`[WhatsApp_WWJS] Pasta de sessão específica NÃO encontrada. Uma nova sessão (QR Code) será necessária.`, "warn");
    }

    isBotPaused = false;

    try {
        globalSendLog('[WhatsApp_WWJS] Iniciando nova instância do Cliente WhatsApp...', 'info');
        
        client = new Client({
            authStrategy: new LocalAuth({
                clientId: sessionIdExported,
                dataPath: authPathBase
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                    '--disable-gpu'
                ],
            },
            webVersionCache: { 
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        globalSendLog('[WhatsApp_WWJS] Handlers de evento do cliente sendo configurados...', 'debug');

        client.on('qr', (qr) => {
            currentQR = qr;
            connectionStatus = 'QR_CODE';
            globalSendLog('[WhatsApp_WWJS] Evento QR: QR Code recebido. Enviando para admin.', 'info');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'qr_code',
                    clientId: sessionIdExported,
                    payload: { qr: qr, status: 'QR_CODE', isPaused: isBotPaused }
                });
            }
            if (globalDbServices && globalDbServices.main) {
                globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'QR_REQUESTED', null, qr);
            }
        });

        client.on('authenticated', () => {
            globalSendLog('[WhatsApp_WWJS] Evento AUTHENTICATED: Autenticado com sucesso!', 'info');
            currentQR = null; 
            connectionStatus = 'AUTHENTICATED'; 
            if (globalDbServices && globalDbServices.main) {
                globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'AUTHENTICATED', client.info?.wid?._serialized);
            }
             if (globalWebsocketService) { 
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionIdExported,
                    payload: { status: 'AUTHENTICATED', jid: client.info?.wid?._serialized, isPaused: isBotPaused }
                });
            }
        });

        client.on('auth_failure', async (msg) => { 
            connectionStatus = 'AUTH_FAILURE';
            globalSendLog(`[WhatsApp_WWJS] Evento AUTH_FAILURE: Falha na autenticação: ${msg}. CHAMANDO fullLogoutAndCleanup...`, 'error'); // Log Adicionado
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionIdExported,
                    payload: { status: 'AUTH_FAILURE', reason: msg, isPaused: isBotPaused }
                });
            }
            if (globalDbServices && globalDbServices.main) {
                await globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'AUTH_FAILURE');
            }
            await fullLogoutAndCleanup(true); 
        });

        client.on('ready', () => {
            connectionStatus = 'CONNECTED'; 
            currentQR = null;
            const jid = client.info?.wid?._serialized;
            globalSendLog(`[WhatsApp_WWJS] Evento READY: Cliente pronto! Conectado como: ${jid || 'N/A'}. Bot pausado: ${isBotPaused}`, 'info');
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionIdExported,
                    payload: { status: 'READY', jid: jid, isPaused: isBotPaused }
                });
            }
            if (globalDbServices && globalDbServices.main) {
                globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'CONNECTED', jid, null, {isPaused: isBotPaused});
            }
        });

        client.on('disconnected', async (reason) => {
            const previousStatus = connectionStatus;
            connectionStatus = 'DISCONNECTED';
            globalSendLog(`[WhatsApp_WWJS] Evento DISCONNECTED: Cliente desconectado: ${reason}. Status anterior: ${previousStatus}. CHAMANDO fullLogoutAndCleanup SE CRÍTICO...`, 'warn'); // Log Adicionado
            if (globalWebsocketService) {
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionIdExported,
                    payload: { status: 'DISCONNECTED', reason: reason, isPaused: isBotPaused }
                });
            }
            if (globalDbServices && globalDbServices.main) {
                await globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'DISCONNECTED');
            }
            
            const criticalLogoutReasons = ['NAVIGATION', 'LOGGED_OUT', 'Max qrcode retries reached', 'ABNORMAL_LOGOUT', 'ACCOUNT_SYNC_ERROR', 'SYNC_TIMEOUT', 'UNPAIRED', 'UNLAUNCHED'];
            let isCriticalLogout = criticalLogoutReasons.some(r => String(reason).toUpperCase().includes(r)) || String(reason).toLowerCase().includes('zowel');

            if (previousStatus === 'AUTH_FAILURE') {
                isCriticalLogout = true;
                globalSendLog(`[WhatsApp_WWJS] Desconexão após AUTH_FAILURE. Considerado crítico. Razão: ${reason}`, 'warn');
            }
            if (String(reason).includes("Protocol error (Runtime.callFunctionOn): Session closed.")) {
                isCriticalLogout = true;
                globalSendLog(`[WhatsApp_WWJS] Desconexão por 'Session closed'. Considerado crítico. Razão: ${reason}`, 'warn');
            }

            if (isCriticalLogout) {
                globalSendLog(`[WhatsApp_WWJS] Desconexão CRÍTICA (${reason}). CHAMANDO fullLogoutAndCleanup...`, 'warn');
                await fullLogoutAndCleanup(true);
            } else {
                 globalSendLog(`[WhatsApp_WWJS] Desconexão não crítica (${reason}). Nenhuma ação de limpeza automática. Aguardando reinício manual ou próxima inicialização.`, 'info');
            }
        });

        client.on('message', async (msg) => {
            // ... (código existente do message handler, sem alterações aqui) ...
            globalSendLog(`[WhatsApp_WWJS] Evento MESSAGE: Mensagem recebida de ${msg.from}. Pausado: ${isBotPaused}, FromMe: ${msg.fromMe}, IsStatus: ${msg.isStatus}`, 'debug');
            if (isBotPaused || msg.fromMe || msg.from === 'status@broadcast' || msg.isStatus) { 
                globalSendLog(`[WhatsApp_WWJS] Mensagem de ${msg.from} ignorada (pausado, própria, ou status).`, 'debug');
                return;
            }

            const senderJid = msg.from;
            let senderName = msg.author || senderJid.split('@')[0]; 
            let senderProfilePic = null;
            
            try {
                const contact = await msg.getContact();
                senderName = contact.pushname || contact.name || senderName; 
                senderProfilePic = await contact.getProfilePicUrl().catch(() => null); 
                globalSendLog(`[WhatsApp_WWJS] Detalhes do contato obtidos: ${senderName}, Pic: ${senderProfilePic ? 'Sim' : 'Não'}`, 'debug');
            } catch (contactError) {
                globalSendLog(`[WhatsApp_WWJS] Erro ao obter detalhes do contato ${senderJid}: ${contactError.message}`, 'warn');
            }

            let clientOriginalMessageContent = msg.body; 
            let displayMessageContent = msg.body; 
            let messageType = msg.type; 
            let mediaUrl = null; 

            if (msg.hasMedia) {
                globalSendLog(`[WhatsApp_WWJS] Mensagem de ${senderName} contém mídia. Tipo: ${msg.type}`, 'debug');
                messageType = msg.type; 
                displayMessageContent = msg.caption ? `${msg.caption} (Mídia: ${messageType})` : `(Mídia: ${messageType})`;
            }
            
            const messageTimestamp = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();
            globalSendLog(`[WhatsApp_WWJS] Mensagem processada de ${senderName} (${senderJid}): "${displayMessageContent}" (Tipo: ${messageType})`, 'info');

            if (globalDbServices && globalDbServices.chat) {
                try {
                    const { conversation, client: dbClient, isNew: isNewConversation } = await globalDbServices.chat.findOrCreateConversation(
                        senderJid, senderName, senderProfilePic, senderJid.split('@')[0] 
                    );
                    globalSendLog(`[WhatsApp_WWJS] findOrCreateConversation para ${senderJid}: ConvID ${conversation.ID}, ClienteID ${dbClient.ID}, NovaConv: ${isNewConversation}`, 'debug');

                    if (conversation && typeof conversation.ID !== 'undefined') {
                        const messageDataForDb = {
                            conversationId: conversation.ID,
                            message_platform_id: msg.id.id, 
                            senderType: "CLIENT",
                            senderId: senderJid,
                            CLIENT_NAME: senderName, // <--- LINHA ADICIONADA
                            messageType: messageType,
                            content: displayMessageContent, 
                            timestamp: messageTimestamp,
                            read_by_user: false, 
                            read_by_client: true, 
                            mediaUrl: mediaUrl 
                        };
                        
                        console.log('[DEBUG_SENDER_TYPE] whatsappService - messageDataForDb ANTES de saveMessage:', JSON.stringify(messageDataForDb));
                        const savedMsgInDb = await globalDbServices.chat.saveMessage(messageDataForDb);
                        globalSendLog(`[WhatsApp_WWJS] Mensagem de ${senderName} salva no DB. ID DB: ${savedMsgInDb.id}, Conv ID ${conversation.ID}.`, 'debug');

                        let botReplied = false;
                        if (conversation.STATUS === 'pending' || !conversation.USER_ID) { 
                           globalSendLog(`[WhatsApp_WWJS] Conversa ${conversation.ID} está pendente ou sem atendente. Acionando processBotResponse.`, 'debug');
                           botReplied = await processBotResponse(msg, conversation, clientOriginalMessageContent); 
                           globalSendLog(`[WhatsApp_WWJS] processBotResponse para conversa ${conversation.ID} retornou: ${botReplied}`, 'debug');
                        } else {
                            globalSendLog(`[WhatsApp_WWJS] Conversa ${conversation.ID} já tem atendente (USER_ID: ${conversation.USER_ID}, STATUS: ${conversation.STATUS}). Robô não será acionado.`, 'debug');
                        }

                        if (globalWebsocketService) {
                            const conversationDetailsForUI = await globalDbServices.chat.getConversationById(conversation.ID);
                            if (conversationDetailsForUI) {
                                globalSendLog(`[WhatsApp_WWJS] Detalhes da conversa para UI (após msg cliente): ${JSON.stringify(conversationDetailsForUI).substring(0,150)}...`, 'debug');
                                
                                const messageForUi = { 
                                    ...savedMsgInDb, 
                                    CLIENT_NAME: senderName, 
                                    CLIENT_PROFILE_PIC: senderProfilePic, 
                                    SENDER_TYPE: "CLIENT" 
                                };

                                // Chamar a nova função centralizada handleNewClientMessage do websocketService.
                                // Ela verificará internamente se USER_USERNAME existe e se SENDER_TYPE é 'CLIENT'.
                                // Passamos conversationDetailsForUI (para USER_USERNAME, ID) e messageForUi (que contém CLIENT_NAME).
                                globalSendLog(`[WhatsApp_WWJS] Tentando notificar via handleNewClientMessage para ConvID ${conversationDetailsForUI.ID}, Atendente: ${conversationDetailsForUI.USER_USERNAME}. MessageForUI: ${JSON.stringify(messageForUi).substring(0,100)}`, 'debug');
                                globalWebsocketService.handleNewClientMessage(conversationDetailsForUI, messageForUi);

                                // Se a conversa não tiver um atendente designado (USER_USERNAME não está presente),
                                // então transmitimos como uma conversa pendente.
                                // A função handleNewClientMessage não envia nada se USER_USERNAME não estiver definido.
                                if (!conversationDetailsForUI.USER_USERNAME) {
                                    globalSendLog(`[WhatsApp_WWJS] Transmitindo pending_conversation (pois não há USER_USERNAME) para todos atendentes. Robô respondeu: ${botReplied}. ConvID: ${conversationDetailsForUI.ID}`, 'debug');
                                    
                                    // Reconstruindo o payload para pending_conversation com base nos dados disponíveis
                                    // (conversationDetailsForUI já deve ter a maioria dos dados atualizados)
                                    const pendingPayload = {
                                        ID: conversationDetailsForUI.ID,
                                        CLIENT_ID: conversationDetailsForUI.CLIENT_ID,
                                        CLIENT_JID: conversationDetailsForUI.CLIENT_JID || senderJid,
                                        CLIENT_NAME: conversationDetailsForUI.CLIENT_NAME || senderName,
                                        CLIENT_WHATSAPP_ID: conversationDetailsForUI.CLIENT_JID || senderJid,
                                        CLIENT_PROFILE_PIC: conversationDetailsForUI.CLIENT_PROFILE_PIC || senderProfilePic,
                                        USER_ID: null,
                                        USER_USERNAME: null,
                                        STATUS: conversationDetailsForUI.STATUS || 'pending', // Deve ser 'pending' aqui
                                        SECTOR: conversationDetailsForUI.SECTOR_NAME || conversationDetailsForUI.SECTOR || null, // SECTOR_NAME ou SECTOR
                                        CREATED_AT: conversationDetailsForUI.CREATED_AT,
                                        UPDATED_AT: conversationDetailsForUI.UPDATED_AT,
                                        LAST_MESSAGE_TIMESTAMP: savedMsgInDb.timestamp || messageTimestamp,
                                        UNREAD_MESSAGES: conversationDetailsForUI.UNREAD_MESSAGES || 1, // Pode ser que getConversationById já calcule isso
                                        LAST_MESSAGE: savedMsgInDb.content || displayMessageContent,
                                        LAST_MESSAGE_TYPE: savedMsgInDb.messageType || messageType,
                                        LAST_MESSAGE_TIME_FORMATTED: savedMsgInDb.timestamp // Usar o timestamp do BD que é mais preciso
                                    };
                                    globalWebsocketService.broadcastToAttendants({
                                        type: "pending_conversation", 
                                        payload: pendingPayload
                                    });
                                }
                            } else {
                                globalSendLog(`[WhatsApp_WWJS] Não foi possível obter detalhes da conversa ${conversation.ID} para UI (conversationDetailsForUI é null).`, 'warn');
                            }
                        }
                    } else {
                        globalSendLog(`[WhatsApp_WWJS] CRÍTICO: ID da Conversa é indefinido para JID ${senderJid} após findOrCreate. Mensagem não foi salva.`, "error");
                    }
                } catch (dbError) {
                    globalSendLog(`[WhatsApp_WWJS] Erro de banco de dados ao processar mensagem de ${senderName}: ${dbError.message}\n${dbError.stack}`, "error");
                }
            } else {
                 globalSendLog(`[WhatsApp_WWJS] globalDbServices.chat não está disponível. Mensagem de ${senderName} não será salva ou processada pelo robô.`, "error");
            }
        });
        
        globalSendLog('[WhatsApp_WWJS] Cliente whatsapp-web.js configurado. Iniciando cliente (initialize)...', 'info');
        await client.initialize();
        globalSendLog('[WhatsApp_WWJS] Chamada client.initialize() concluída.', 'info');
        return client;

    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error'); 
        if (globalWebsocketService) {
            globalWebsocketService.broadcastToAdmins({
                type: 'status_update',
                clientId: sessionIdExported,
                payload: { status: 'FATAL_ERROR', reason: error.message, isPaused: isBotPaused }
            });
        }
        return null;
    }
}

async function sendWhatsAppMessage(toJid, messageContent, agentUsername, conversationId, chatDbService) {
    // ... (código existente, sem alterações aqui) ...
    globalSendLog(`[WhatsApp_WWJS] sendWhatsAppMessage: Para ${toJid}, Agente: ${agentUsername}, ConvID: ${conversationId}`, 'debug');
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
        let mediaUrlForDb = null;
        let captionForDb = null;

        if (typeof messageContent === 'object' && messageContent !== null) {
            globalSendLog(`[WhatsApp_WWJS] Enviando mensagem de mídia/objeto: ${JSON.stringify(messageContent).substring(0,100)}`, 'debug');
            if (messageContent.text) { 
                contentToSend = messageContent.text;
            } else if (messageContent.image && messageContent.image.url) {
                const media = await MessageMedia.fromUrl(messageContent.image.url, { unsafeMime: true });
                contentToSend = media;
                if (messageContent.image.caption) {options.caption = messageContent.image.caption; captionForDb = options.caption;}
                messageTypeForDb = 'image';
                mediaUrlForDb = messageContent.image.url; 
            } else if (messageContent.document && messageContent.document.url) {
                const media = await MessageMedia.fromUrl(messageContent.document.url, { unsafeMime: true });
                contentToSend = media;
                if (messageContent.document.fileName) options.filename = messageContent.document.fileName; 
                if (messageContent.document.caption) {options.caption = messageContent.document.caption; captionForDb = options.caption;}
                messageTypeForDb = 'document';
                mediaUrlForDb = messageContent.document.url;
            }  else if (messageContent.audio && messageContent.audio.url) {
                const media = await MessageMedia.fromUrl(messageContent.audio.url, { unsafeMime: true });
                contentToSend = media;
                messageTypeForDb = 'audio';
                mediaUrlForDb = messageContent.audio.url;
            } else if (messageContent.video && messageContent.video.url) {
                const media = await MessageMedia.fromUrl(messageContent.video.url, { unsafeMime: true });
                contentToSend = media;
                if (messageContent.video.caption) {options.caption = messageContent.video.caption; captionForDb = options.caption;}
                messageTypeForDb = 'video';
                mediaUrlForDb = messageContent.video.url;
            }
             else {
                 globalSendLog(`[WhatsApp_WWJS] Formato de conteúdo de mensagem objeto não suportado: ${JSON.stringify(messageContent)}`, 'warn');
                 return null;
            }
        } else if (typeof messageContent !== 'string') {
            globalSendLog(`[WhatsApp_WWJS] Conteúdo da mensagem inválido, esperado string ou objeto: ${typeof messageContent}`, 'warn');
            return null;
        }
        
        const textForLog = typeof contentToSend === 'string' ? contentToSend.substring(0,100) : (options.caption || (options.filename || `(${messageTypeForDb})`));
        globalSendLog(`[WhatsApp_WWJS] Enviando para ${toJid} por ${agentUsername}: "${textForLog}"...`, 'info');
        
        const sentMsg = await client.sendMessage(toJid, contentToSend, options);
        const sentMsgId = sentMsg.id.id; 
        const sentMsgTimestamp = sentMsg.timestamp ? new Date(sentMsg.timestamp * 1000).toISOString() : new Date().toISOString();
        globalSendLog(`[WhatsApp_WWJS] Mensagem enviada com ID WhatsApp: ${sentMsgId}`, 'info');

        if (!chatDbService) { 
            globalSendLog('[WhatsApp_WWJS] chatDbService não está disponível para salvar mensagem enviada.', 'error');
            return { message_platform_id: sentMsgId, timestamp: sentMsgTimestamp, id: null }; 
        }

        const messageTextForDb = typeof contentToSend === 'string' ? contentToSend : 
                                 (captionForDb || (options.filename || `(${messageTypeForDb})`));

        const savedMessage = await chatDbService.saveMessage({
            conversationId: conversationId,
            message_platform_id: sentMsgId, 
            senderType: 'AGENT',
            senderId: agentUsername, 
            messageType: messageTypeForDb,
            content: messageTextForDb,
            mediaUrl: mediaUrlForDb, 
            timestamp: sentMsgTimestamp,
            read_by_user: true, 
            read_by_client: false 
        });
        globalSendLog(`[WhatsApp_WWJS] Mensagem do agente ${agentUsername} salva no DB. ID DB: ${savedMessage.id}`, 'debug');
        return savedMessage; 
    } catch (error) {
        globalSendLog(`[WhatsApp_WWJS] Erro ao enviar mensagem para ${toJid}: ${error.message}`, 'error');
        globalSendLog(error.stack, 'debug'); 
        return null;
    }
}

function getCurrentStatusAndQR() {
    // ... (código existente, sem alterações aqui) ...
    const statusData = {
        sessionId: sessionIdExported,
        status: connectionStatus,
        qrCode: currentQR,
        jid: client?.info?.wid?._serialized, 
        isPaused: isBotPaused 
    };
    globalSendLog(`[WhatsApp_WWJS] getCurrentStatusAndQR: Retornando ${JSON.stringify(statusData).substring(0,100)}...`, 'debug');
    return statusData;
}

function getClient() { 
    // ... (código existente, sem alterações aqui) ...
    return client;
}

async function togglePauseBot() {
    // ... (código existente, sem alterações aqui) ...
    isBotPaused = !isBotPaused;
    globalSendLog(`[WhatsApp_WWJS] togglePauseBot: Estado de pausa do bot alterado para: ${isBotPaused}`, 'info');
    if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
            type: 'status_update', 
            clientId: sessionIdExported,
            payload: { 
                status: connectionStatus, 
                jid: client?.info?.wid?._serialized,
                isPaused: isBotPaused, 
                reason: `Robô ${isBotPaused ? 'pausado' : 'reativado'} pelo administrador.` 
            }
        });
    }
    if (globalDbServices && globalDbServices.main && (connectionStatus === 'CONNECTED' || connectionStatus === 'READY')) {
        await globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, connectionStatus, client?.info?.wid?._serialized, null, {isPaused: isBotPaused});
        globalSendLog(`[WhatsApp_WWJS] togglePauseBot: Status de pausa (${isBotPaused}) salvo no DB.`, 'debug');
    }
    return isBotPaused;
}

async function fullLogoutAndCleanup(isDisconnectOrAuthFailureEvent = false) {
    globalSendLog(`[WhatsApp_WWJS] fullLogoutAndCleanup: Iniciando logout completo e limpeza. isDisconnectOrAuthFailureEvent: ${isDisconnectOrAuthFailureEvent}`, 'info');
    
    if (client) {
        try {
            if (!isDisconnectOrAuthFailureEvent && typeof client.logout === 'function') { 
                 globalSendLog('[WhatsApp_WWJS] Tentando client.logout()...', 'info');
                 await client.logout(); 
                 globalSendLog('[WhatsApp_WWJS] client.logout() realizado com sucesso.', 'info');
            } else if (isDisconnectOrAuthFailureEvent) {
                 globalSendLog('[WhatsApp_WWJS] Chamado a partir de evento de desconexão/falha, pulando client.logout() explícito.', 'info');
            }
            
            if (typeof client.destroy === 'function') {
                globalSendLog('[WhatsApp_WWJS] Tentando client.destroy()...', 'info');
                await client.destroy();
                globalSendLog('[WhatsApp_WWJS] client.destroy() realizado com sucesso.', 'info');
            }
        } catch (e) {
            globalSendLog(`[WhatsApp_WWJS] Erro durante o client.logout/destroy: ${e.message}.`, 'warn');
        } finally {
            client = null; 
            globalSendLog('[WhatsApp_WWJS] Instância do client definida como null.', 'debug');
        }
    } else {
        globalSendLog('[WhatsApp_WWJS] Nenhuma instância do client para logout/cleanup.', 'warn');
    }

    connectionStatus = 'CLEARED_FOR_RESTART';
    currentQR = null;
    isBotPaused = false; 

    const specificSessionPathForCleanup = path.join(authPathBase, `session-${sessionIdExported}`);
    globalSendLog(`[WhatsApp_WWJS] Verificando pasta de sessão para limpeza: ${specificSessionPathForCleanup}`, 'debug');
    if (fs.existsSync(specificSessionPathForCleanup)) {
        try {
            globalSendLog(`[WhatsApp_WWJS] Removendo pasta de autenticação da sessão: ${specificSessionPathForCleanup}`, 'info');
            fs.rmSync(specificSessionPathForCleanup, { recursive: true, force: true });
            globalSendLog(`[WhatsApp_WWJS] Pasta de autenticação da sessão removida.`, 'info');
        } catch (err) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao remover pasta de autenticação (${specificSessionPathForCleanup}): ${err.message}`, 'error');
        }
    } else {
        globalSendLog(`[WhatsApp_WWJS] Pasta de autenticação (${specificSessionPathForCleanup}) não encontrada para remoção. Pode já ter sido limpa.`, 'warn');
    }
    
    if (globalDbServices && globalDbServices.main && typeof globalDbServices.main.updateWhatsappSessionStatus === 'function') {
        try {
            await globalDbServices.main.updateWhatsappSessionStatus(sessionIdExported, 'CLEARED_FOR_RESTART', null, null);
            globalSendLog(`[WhatsApp_WWJS] Status da sessão ${sessionIdExported} atualizado para CLEARED_FOR_RESTART no DB.`, 'info');
        } catch (dbError) {
            globalSendLog(`[WhatsApp_WWJS] Erro ao atualizar status da sessão no DB durante cleanup: ${dbError.message}`, 'error');
        }
    }
    
    globalSendLog('[WhatsApp_WWJS] Limpeza de sessão para reinício concluída.', 'info');
     if (globalWebsocketService) {
        globalWebsocketService.broadcastToAdmins({
            type: 'status_update',
            clientId: sessionIdExported,
            payload: { status: 'CLEARED_FOR_RESTART', reason: 'Sessão limpa. Reinicie o robô para obter novo QR Code.', isPaused: isBotPaused }
        });
    }
}

module.exports = {
    connectToWhatsApp,
    sendWhatsAppMessage,
    getClient,
    getCurrentStatusAndQR,
    togglePauseBot,
    fullLogoutAndCleanup,
    sessionId: sessionIdExported,
};
