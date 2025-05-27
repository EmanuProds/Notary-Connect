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

// Helper function to check if today is a holiday
function isTodayHoliday(holidays) {
    if (!holidays || holidays.length === 0) return false;
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return holidays.some(h => h.HOLIDAY_DATE === todayFormatted);
}

// Helper function to handle forwarding logic
async function handleForwarding(chat, conversation, autoResp, clientJid, clientName, originalMessage) {
    globalSendLog(`[BotLogic_Forward] Iniciando encaminhamento para ConvID ${conversation.ID} baseado na AutoResp ID ${autoResp.ID}`, 'info');
    const { sqliteChat, websocketService } = globalDbServices; // Assuming globalDbServices contains chat and websocket services

    let targetUserId = autoResp.FORWARD_TO_USER_ID || null;
    let targetSectorId = autoResp.FORWARD_TO_SECTOR_ID || null;
    let targetSectorName = null; // Will be fetched if targetSectorId is present

    const updateData = {
        USER_ID: targetUserId,
        USER_USERNAME: null, // Will be set if targetUserId is present and user is found
        SECTOR_ID: targetSectorId, // Store sector ID
        SECTOR: null, // Store sector name
        STATUS: 'pending_human',
        LAST_FORWARDED_AT: new Date().toISOString()
    };

    if (targetUserId) {
        const user = await globalDbServices.admin.getUserById(targetUserId);
        if (user) {
            updateData.USER_USERNAME = user.USERNAME; // Store username for direct assignment
            // If user has a primary sector, it might be useful to store it too, or ensure SECTOR field is consistent
            if (user.SECTOR && user.SECTOR.length > 0) {
                 const primarySectorKey = user.SECTOR[0];
                 const sectorDetails = await globalDbServices.admin.getSectorByKey(primarySectorKey);
                 if (sectorDetails) updateData.SECTOR = sectorDetails.SECTOR_NAME;
            }
             globalSendLog(`[BotLogic_Forward] Encaminhando para Usuário: ${user.USERNAME} (ID: ${targetUserId})`, 'debug');
        } else {
            globalSendLog(`[BotLogic_Forward] Usuário de encaminhamento ID ${targetUserId} não encontrado. Encaminhamento falhou.`, 'error');
            // Optionally, send a message to client or log an admin notification
            return false; // Indicate forwarding failed
        }
    } else if (targetSectorId) {
        const sector = await globalDbServices.admin.getSectorById(targetSectorId); // Assumes getSectorById exists
        if (sector) {
            updateData.SECTOR = sector.SECTOR_NAME; // Store sector name
            targetSectorName = sector.SECTOR_NAME;
            globalSendLog(`[BotLogic_Forward] Encaminhando para Setor: ${sector.SECTOR_NAME} (ID: ${targetSectorId})`, 'debug');
        } else {
            globalSendLog(`[BotLogic_Forward] Setor de encaminhamento ID ${targetSectorId} não encontrado. Encaminhamento falhou.`, 'error');
            return false; // Indicate forwarding failed
        }
    } else {
        globalSendLog(`[BotLogic_Forward] Nem FORWARD_TO_USER_ID nem FORWARD_TO_SECTOR_ID definidos para AutoResp ID ${autoResp.ID}. Não é um encaminhamento.`, 'debug');
        return false; // Not a forwarding scenario based on these fields
    }
    
    try {
        await sqliteChat.runQuery( // Directly use runQuery for targeted update
            `UPDATE CONVERSATIONS SET USER_ID = ?, USER_USERNAME = ?, SECTOR = ?, STATUS = ?, LAST_FORWARDED_AT = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?`,
            [updateData.USER_ID, updateData.USER_USERNAME, updateData.SECTOR, updateData.STATUS, updateData.LAST_FORWARDED_AT, conversation.ID]
        );
        globalSendLog(`[BotLogic_Forward] Conversa ${conversation.ID} atualizada no DB para encaminhamento.`, 'info');

        let responseText = autoResp.RESPONSE_TEXT || "Entendido. Vou te transferir para o atendimento adequado.";
        responseText = responseText.replace(/{client_name}/gi, clientName.split(" ")[0]);
        await sendTypingMessageWithDelay(chat, responseText, autoResp.TYPING_DELAY_MS || 1000, autoResp.RESPONSE_DELAY_MS || 500, conversation.ID, clientJid);
        
        const updatedConversation = await sqliteChat.getConversationById(conversation.ID);
        if (websocketService && updatedConversation) {
            if (targetUserId && updateData.USER_USERNAME) { // Forward to specific user
                 websocketService.notifySpecificUser(updateData.USER_USERNAME, {
                    type: 'conversation_assigned',
                    payload: updatedConversation
                });
                globalSendLog(`[BotLogic_Forward] Notificação WebSocket enviada para atendente específico ${updateData.USER_USERNAME}.`, 'info');
            } else if (targetSectorId && targetSectorName) { // Forward to sector (pending for attendants in that sector)
                 websocketService.broadcastToAttendants({ // Or a more targeted broadcast if possible
                    type: 'pending_conversation',
                    payload: updatedConversation 
                });
                globalSendLog(`[BotLogic_Forward] Notificação WebSocket (pending_conversation) enviada para atendentes do setor ${targetSectorName}.`, 'info');
            }
        }
        return true; // Forwarding handled
    } catch (error) {
        globalSendLog(`[BotLogic_Forward] Erro ao atualizar conversa ou notificar para encaminhamento (ConvID ${conversation.ID}): ${error.message}`, 'error');
        return false; // Forwarding failed
    }
}


// Helper function for contact card request
async function handleContactCardRequest(chat, conversation, autoResp, clientJid, clientName, clientMessageContent, contactCardNotFoundText) {
    globalSendLog(`[BotLogic_ContactCard] Iniciando solicitação de cartão de contato. Msg: "${clientMessageContent}"`, 'info');
    
    // Assuming TRIGGERS for contact card is a regex that captures the attendant's name.
    // Example regex: /^(?:quero falar com|falar com|contato de)\s+([a-zA-Z\sÀ-ú]+)/i
    // This regex needs to be defined in the AUTO_RESPONSE.TRIGGERS field and IS_REGEX must be true.
    let attendantNameMatch;
    try {
        // Iterate through triggers if multiple are provided, though for this specific case, one regex is typical.
        const triggers = autoResp.TRIGGERS.split(/\n|,/); // Split by newline or comma
        for (const trigger of triggers) {
            if (autoResp.IS_REGEX) {
                const regex = new RegExp(trigger.trim(), 'i');
                attendantNameMatch = regex.exec(clientMessageContent);
                if (attendantNameMatch && attendantNameMatch[1]) break; // Found a match
            }
        }
    } catch (e) {
        globalSendLog(`[BotLogic_ContactCard] Erro ao processar regex para cartão de contato: ${e.message}. Trigger: ${autoResp.TRIGGERS}`, 'error');
        await sendTypingMessageWithDelay(chat, "Desculpe, tive um problema ao processar sua solicitação.", 1000, 500, conversation.ID, clientJid);
        return true; // Handled (with an error message)
    }

    if (!attendantNameMatch || !attendantNameMatch[1]) {
        globalSendLog(`[BotLogic_ContactCard] Nome do atendente não capturado pela regex. Regex: ${autoResp.TRIGGERS}, Msg: "${clientMessageContent}"`, 'warn');
        // Send the autoResp.RESPONSE_TEXT which might be "Não entendi qual contato você deseja" or similar.
        let responseText = autoResp.RESPONSE_TEXT.replace(/{client_name}/gi, clientName.split(" ")[0]);
        await sendTypingMessageWithDelay(chat, responseText, autoResp.TYPING_DELAY_MS, autoResp.RESPONSE_DELAY_MS, conversation.ID, clientJid);
        return true;
    }
    
    const requestedName = attendantNameMatch[1].trim();
    globalSendLog(`[BotLogic_ContactCard] Nome do atendente solicitado: "${requestedName}"`, 'debug');

    try {
        // Attempt to find user by full name or username (case-insensitive partial match for name)
        const users = await globalDbServices.admin.getAllUsers();
        const foundUser = users.find(u => 
            (u.NAME && u.NAME.toLowerCase().includes(requestedName.toLowerCase())) || 
            (u.USERNAME && u.USERNAME.toLowerCase() === requestedName.toLowerCase())
        );

        if (foundUser && foundUser.DIRECT_CONTACT_NUMBER) {
            globalSendLog(`[BotLogic_ContactCard] Atendente "${foundUser.NAME}" encontrado com contato direto: ${foundUser.DIRECT_CONTACT_NUMBER}`, 'info');
            // First, send the pre-defined response text from the auto-response (e.g., "Vou te passar o contato...")
            let initialResponseText = autoResp.RESPONSE_TEXT.replace(/{client_name}/gi, clientName.split(" ")[0]);
            await sendTypingMessageWithDelay(chat, initialResponseText, autoResp.TYPING_DELAY_MS, autoResp.RESPONSE_DELAY_MS, conversation.ID, clientJid);
            
            // Then, send the contact card or contact text
            // For vCard: const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:${foundUser.NAME}\nFN:${foundUser.NAME}\nTEL;TYPE=CELL:${foundUser.DIRECT_CONTACT_NUMBER}\nEND:VCARD`;
            // await client.sendMessage(clientJid, vCard); // Requires client instance
            // Sending as text for now as per instruction if vCard is complex
            const contactMessage = `Você pode contatar ${foundUser.NAME} diretamente no número: ${foundUser.DIRECT_CONTACT_NUMBER}`;
            await sendTypingMessageWithDelay(chat, contactMessage, 500, 200, conversation.ID, clientJid); // Shorter delay for the actual contact
        } else {
            globalSendLog(`[BotLogic_ContactCard] Atendente "${requestedName}" não encontrado ou sem número direto.`, 'warn');
            await sendTypingMessageWithDelay(chat, contactCardNotFoundText.replace(/{client_name}/gi, clientName.split(" ")[0]), autoResp.TYPING_DELAY_MS, autoResp.RESPONSE_DELAY_MS, conversation.ID, clientJid);
        }
        return true; // Request handled
    } catch (error) {
        globalSendLog(`[BotLogic_ContactCard] Erro ao buscar atendente ou enviar cartão de contato: ${error.message}`, 'error');
        await sendTypingMessageWithDelay(chat, "Desculpe, ocorreu um erro ao buscar as informações de contato.", 1000, 500, conversation.ID, clientJid);
        return true; // Handled (with an error message)
    }
}


async function processBotResponse(msg, conversation, clientMessageContent) {
    globalSendLog(`[BotLogic] processBotResponse: Iniciando para mensagem: "${clientMessageContent}" na conversa ID ${conversation.ID}, Status: ${conversation.STATUS}`, 'debug');
    if (!globalDbServices || !globalDbServices.main || !globalDbServices.admin || !globalDbServices.chat || !client || connectionStatus !== 'CONNECTED') {
        globalSendLog('[BotLogic] Robô não pode processar: Serviços DB/WhatsApp não disponíveis ou WhatsApp não conectado.', 'warn');
        return false;
    }
    
    // Se a conversa não estiver 'pending' ou não tiver USER_ID, o robô não deve atuar (a menos que seja uma lógica específica de retomada)
    if (conversation.STATUS !== 'pending' && conversation.USER_ID) {
        // Adicionar verificação de tempo limite para atendimento humano aqui, se necessário.
        // Por agora, se tem atendente e não está pendente, o bot não interfere.
        globalSendLog(`[BotLogic] Conversa ${conversation.ID} já está com atendente (USER_ID: ${conversation.USER_ID}, STATUS: ${conversation.STATUS}). Robô não atuará.`, 'debug');
        return false;
    }

    try {
        // Carregar configurações e feriados
        const configBotActiveResult = await globalDbServices.main.getConfigByKey('bot_active');
        const isBotGloballyActive = configBotActiveResult && configBotActiveResult.CONFIG_VALUE === true;
        if (!isBotGloballyActive) {
            globalSendLog('[BotLogic] Robô está desativado globalmente.', 'info');
            return false;
        }

        const holidays = await globalDbServices.admin.getAllHolidays();
        const contactCardNotFoundTextConfig = await globalDbServices.main.getConfigByKey('CONTACT_CARD_NOT_FOUND_RESPONSE_TEXT');
        const contactCardNotFoundText = contactCardNotFoundTextConfig ? contactCardNotFoundTextConfig.CONFIG_VALUE : "Desculpe, não consegui encontrar o contato direto para este atendente.";
        // Outras configs como HUMAN_ATTENDANCE_TIME_LIMIT_SECONDS serão usadas em outra lógica (monitoramento de timeout)

        const autoResponses = await globalDbServices.admin.getAllAutoResponses();
        if (!autoResponses || autoResponses.length === 0) {
            globalSendLog('[BotLogic] Nenhuma resposta automática configurada.', 'debug');
            return false;
        }
        globalSendLog(`[BotLogic] ${autoResponses.length} respostas automáticas carregadas. Feriados carregados: ${holidays.length}.`, 'debug');

        const clientJid = msg.from;
        const chat = await msg.getChat();
        if (!chat) {
            globalSendLog(`[BotLogic] Não foi possível obter 'chat' para ${clientJid}. Abortando.`, 'error');
            return false;
        }
        
        const contact = await msg.getContact();
        const clientName = contact.pushname || contact.name || clientJid.split('@')[0];

        autoResponses.sort((a, b) => (b.PRIORITY || 0) - (a.PRIORITY || 0));

        for (const autoResp of autoResponses) {
            globalSendLog(`[BotLogic] Verificando Resposta ID ${autoResp.ID}: "${autoResp.RESPONSE_NAME}", Ativa: ${autoResp.ACTIVE}, Prioridade: ${autoResp.PRIORITY}, Triggers: "${autoResp.TRIGGERS}"`, 'debug');
            if (!autoResp.ACTIVE) {
                globalSendLog(`[BotLogic] Resposta ID ${autoResp.ID} inativa.`, 'debug');
                continue;
            }

            // Lógica de Feriados
            if (autoResp.RESPOND_ON_HOLIDAY === 0 || autoResp.RESPOND_ON_HOLIDAY === false) { // Explicitamente não responder
                if (isTodayHoliday(holidays)) {
                    globalSendLog(`[BotLogic] Hoje é feriado e Resposta ID ${autoResp.ID} (${autoResp.RESPONSE_NAME}) está configurada para NÃO responder em feriados. Pulando.`, 'info');
                    continue;
                }
            }

            let matched = false;
            let matchDetails = null; // Store regex match results if any

            if (!autoResp.TRIGGERS || autoResp.TRIGGERS.trim() === "") {
                globalSendLog(`[BotLogic] Resposta ID ${autoResp.ID} não possui TRIGGERS definidos. Pulando.`, 'warn');
                continue;
            }

            try {
                const triggersArray = autoResp.TRIGGERS.split(/\n|,/).map(t => t.trim()).filter(t => t); // Split by newline or comma, then trim and filter empty
                const lowerClientMessage = clientMessageContent.toLowerCase();

                for (const trigger of triggersArray) {
                    if (autoResp.IS_REGEX) {
                        const regex = new RegExp(trigger, 'i'); // 'i' for case-insensitive
                        matchDetails = regex.exec(clientMessageContent);
                        if (matchDetails) {
                            matched = true;
                            globalSendLog(`[BotLogic] Match por Regex: Padrão "${trigger}" em "${clientMessageContent}" para Resposta ID ${autoResp.ID}`, 'debug');
                            break; 
                        }
                    } else {
                        if (lowerClientMessage.includes(trigger.toLowerCase())) {
                            matched = true;
                            globalSendLog(`[BotLogic] Match por palavra-chave: Padrão "${trigger.toLowerCase()}" em "${lowerClientMessage}" para Resposta ID ${autoResp.ID}`, 'debug');
                            break;
                        }
                    }
                }
            } catch (e) {
                globalSendLog(`[BotLogic] Erro ao processar triggers para resposta ID ${autoResp.ID} ("${autoResp.TRIGGERS}"): ${e.message}`, 'error');
                continue; 
            }

            if (matched) {
                globalSendLog(`[BotLogic] MENSAGEM CORRESPONDEU! Cliente: "${clientMessageContent}", Resposta: "${autoResp.RESPONSE_NAME}" (ID: ${autoResp.ID})`, 'info');
                
                // ** Placeholder para lógica de tipo de resposta (contato, serviço, etc.) **
                // Esta é uma simplificação. Uma forma mais robusta seria ter um campo 'RESPONSE_TYPE' na tabela AUTO_RESPONSES
                // ou usar RESPONSE_KEY para determinar a ação.
                if (autoResp.RESPONSE_KEY && autoResp.RESPONSE_KEY.startsWith("REQ_CONTACT_")) { // Example convention
                    return await handleContactCardRequest(chat, conversation, autoResp, clientJid, clientName, clientMessageContent, contactCardNotFoundText);
                }
                // Adicionar lógica para REQ_SERVICE_ aqui se necessário, ou se o encaminhamento já cobre.

                // Lógica de Encaminhamento (AUTO_RESPONSE.FORWARD_TO_USER_ID ou AUTO_RESPONSE.FORWARD_TO_SECTOR_ID)
                if (autoResp.FORWARD_TO_USER_ID || autoResp.FORWARD_TO_SECTOR_ID) {
                    const forwarded = await handleForwarding(chat, conversation, autoResp, clientJid, clientName, msg);
                    if (forwarded) return true; // Encaminhamento bem-sucedido, finaliza processamento.
                    // Se encaminhamento falhou, pode ser que a auto-resposta ainda deva ser enviada (abaixo) ou não.
                    // Por ora, se o encaminhamento era a intenção e falhou, não enviamos a RESPONSE_TEXT genérica.
                    globalSendLog(`[BotLogic] Encaminhamento para AutoResp ID ${autoResp.ID} falhou ou não foi aplicável.`, 'warn');
                    return false; // Considera que a ação principal (encaminhamento) falhou
                }
                
                // Se não encaminhou e não é um tipo especial, envia RESPONSE_TEXT normal
                let responseText = autoResp.RESPONSE_TEXT;
                responseText = responseText.replace(/{client_name}/gi, clientName.split(" ")[0]); 

                const typingDelay = parseInt(autoResp.TYPING_DELAY_MS || 1000, 10);
                const sendDelay = parseInt(autoResp.RESPONSE_DELAY_MS || 500, 10);
                
                globalSendLog(`[BotLogic] Enviando resposta padrão: "${responseText.substring(0,50)}..."`, 'debug');
                await sendTypingMessageWithDelay(chat, responseText, typingDelay, sendDelay, conversation.ID, clientJid);
                
                // Lógica de encaminhamento por seleção de serviço (Ponto 7)
                // Acionada se a RESPONSE_KEY da AUTO_RESPONSE original começar com "SERVICE_"
                // Esta lógica é executada *após* a RESPONSE_TEXT da AUTO_RESPONSE original ter sido enviada.
                if (autoResp.RESPONSE_KEY && autoResp.RESPONSE_KEY.startsWith("SERVICE_")) {
                    const serviceKey = autoResp.RESPONSE_KEY; 
                    globalSendLog(`[BotLogic_ServiceFwd] Identificada AUTO_RESPONSE (${autoResp.ID}) para serviço: ${serviceKey}. Verificando detalhes do serviço...`, 'info');
                    
                    const serviceDetails = await globalDbServices.admin.getServiceByKey(serviceKey);

                    if (serviceDetails) {
                        globalSendLog(`[BotLogic_ServiceFwd] Detalhes do serviço ${serviceKey} recuperados: UserID=${serviceDetails.FORWARD_TO_USER_ID}, SectorID=${serviceDetails.SECTOR_ID}`, 'debug');
                        
                        let serviceForwardConfig = null;

                        if (serviceDetails.FORWARD_TO_USER_ID) {
                            serviceForwardConfig = {
                                ID: `SERVICE_FWD_USER-${serviceDetails.ID}`, // ID informativo
                                FORWARD_TO_USER_ID: serviceDetails.FORWARD_TO_USER_ID,
                                FORWARD_TO_SECTOR_ID: null, // Garante que não haja ambiguidade
                                RESPONSE_TEXT: `Para tratar do serviço "${serviceDetails.SERVICE_NAME}", estou te encaminhando para o especialista responsável.`,
                                TYPING_DELAY_MS: 500, 
                                RESPONSE_DELAY_MS: 200 
                            };
                            globalSendLog(`[BotLogic_ServiceFwd] Serviço ${serviceKey} será encaminhado para USUÁRIO ID: ${serviceDetails.FORWARD_TO_USER_ID}.`, 'info');
                        } else if (serviceDetails.SECTOR_ID) {
                            serviceForwardConfig = {
                                ID: `SERVICE_FWD_SECTOR-${serviceDetails.ID}`, // ID informativo
                                FORWARD_TO_USER_ID: null, // Garante que não haja ambiguidade
                                FORWARD_TO_SECTOR_ID: serviceDetails.SECTOR_ID,
                                RESPONSE_TEXT: `Para tratar do serviço "${serviceDetails.SERVICE_NAME}", estou te encaminhando para o setor responsável.`,
                                TYPING_DELAY_MS: 500, 
                                RESPONSE_DELAY_MS: 200 
                            };
                            globalSendLog(`[BotLogic_ServiceFwd] Serviço ${serviceKey} será encaminhado para SETOR ID: ${serviceDetails.SECTOR_ID}.`, 'info');
                        } else {
                            globalSendLog(`[BotLogic_ServiceFwd] Serviço ${serviceKey} (ID: ${serviceDetails.ID}) não possui FORWARD_TO_USER_ID nem SECTOR_ID configurados. Nenhum encaminhamento adicional será feito.`, 'info');
                        }

                        if (serviceForwardConfig) {
                            const forwarded = await handleForwarding(chat, conversation, serviceForwardConfig, clientJid, clientName, msg);
                            if (forwarded) {
                                globalSendLog(`[BotLogic_ServiceFwd] Encaminhamento para serviço ${serviceKey} bem-sucedido.`, 'info');
                                return true; // Finaliza o processamento desta mensagem.
                            } else {
                                globalSendLog(`[BotLogic_ServiceFwd] Falha no encaminhamento para serviço ${serviceKey}.`, 'warn');
                                // Mesmo que o encaminhamento pós-serviço falhe, a resposta original da autoResp já foi enviada.
                                // Pode-se optar por retornar true ou false aqui dependendo do comportamento desejado.
                                // Retornar true, pois a auto_response principal foi enviada.
                                return true; 
                            }
                        }
                    } else {
                        globalSendLog(`[BotLogic_ServiceFwd] Detalhes do serviço para a chave ${serviceKey} não encontrados. Nenhum encaminhamento adicional será feito.`, 'warn');
                    }
                }
                return true; // Resposta original da autoResp foi enviada, e qualquer encaminhamento de serviço subsequente foi tratado.
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
    checkHumanAttendanceTimeouts, // Added
    handleHumanAttendanceFinish,  // Added
};

async function checkHumanAttendanceTimeouts() {
    globalSendLog('[TimeoutChecker] Iniciando verificação de timeouts de atendimento humano...', 'info');
    if (!globalDbServices || !globalDbServices.main || !globalDbServices.chat || !client || connectionStatus !== 'CONNECTED') {
        globalSendLog('[TimeoutChecker] Não é possível verificar timeouts: Serviços DB/WhatsApp não disponíveis ou WhatsApp não conectado.', 'warn');
        return;
    }

    try {
        const limitConfig = await globalDbServices.main.getConfigByKey('HUMAN_ATTENDANCE_TIME_LIMIT_SECONDS');
        const timeoutSeconds = limitConfig ? parseInt(limitConfig.CONFIG_VALUE, 10) : 300; // Default 5 minutos
        if (isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
            globalSendLog(`[TimeoutChecker] HUMAN_ATTENDANCE_TIME_LIMIT_SECONDS inválido (${limitConfig?.CONFIG_VALUE}). Usando padrão de 300s.`, 'warn');
            // timeoutSeconds = 300; // Already defaulted
        }

        const timeoutMsgConfig = await globalDbServices.main.getConfigByKey('HUMAN_ATTENDANCE_TIMEOUT_RESPONSE_TEXT');
        const timeoutResponseText = timeoutMsgConfig ? timeoutMsgConfig.CONFIG_VALUE : "O atendimento anterior foi encerrado por inatividade. Nosso assistente virtual está de volta para ajudar.";

        // Buscar conversas ativas com atendente humano
        // Status 'active' e USER_ID não nulo indicam atendimento humano em progresso
        const activeHumanConversations = await globalDbServices.chat.allQuery(
            "SELECT * FROM CONVERSATIONS WHERE STATUS = 'active' AND USER_ID IS NOT NULL"
        );
        
        globalSendLog(`[TimeoutChecker] ${activeHumanConversations.length} conversas em atendimento humano encontradas.`, 'debug');

        for (const conversation of activeHumanConversations) {
            // Para cada conversa, buscar a última mensagem do AGENTE
            const lastAgentMessage = await globalDbServices.chat.getQuery(
                "SELECT TIMESTAMP FROM MESSAGES WHERE CONVERSATION_ID = ? AND SENDER_TYPE = 'AGENT' ORDER BY TIMESTAMP DESC LIMIT 1",
                [conversation.ID]
            );

            let lastMessageTimestamp;
            if (lastAgentMessage && lastAgentMessage.TIMESTAMP) {
                lastMessageTimestamp = new Date(lastAgentMessage.TIMESTAMP);
            } else {
                // Se não houver mensagem do agente, usar o LAST_FORWARDED_AT como referência,
                // ou o UPDATED_AT da conversa se LAST_FORWARDED_AT não estiver disponível.
                lastMessageTimestamp = new Date(conversation.LAST_FORWARDED_AT || conversation.UPDATED_AT);
                globalSendLog(`[TimeoutChecker] ConvID ${conversation.ID}: Nenhuma mensagem de agente encontrada. Usando LAST_FORWARDED_AT ou UPDATED_AT (${lastMessageTimestamp.toISOString()}) como referência.`, 'debug');
            }
            
            const now = new Date();
            const secondsSinceLastAction = (now.getTime() - lastMessageTimestamp.getTime()) / 1000;

            globalSendLog(`[TimeoutChecker] ConvID ${conversation.ID}: Última ação do agente: ${lastMessageTimestamp.toISOString()}. Segundos desde então: ${secondsSinceLastAction.toFixed(0)}. Limite: ${timeoutSeconds}s.`, 'debug');

            if (secondsSinceLastAction > timeoutSeconds) {
                globalSendLog(`[TimeoutChecker] TIMEOUT! ConvID ${conversation.ID} (Cliente: ${conversation.CLIENT_JID}, Atendente: ${conversation.USER_USERNAME}) excedeu o limite de ${timeoutSeconds}s.`, 'info');
                
                try {
                    const chat = await client.getChatById(conversation.CLIENT_JID);
                    if (chat) {
                        await sendTypingMessageWithDelay(chat, timeoutResponseText, 500, 200, conversation.ID, conversation.CLIENT_JID);
                        globalSendLog(`[TimeoutChecker] Mensagem de timeout enviada para cliente ${conversation.CLIENT_JID}.`, 'info');
                    } else {
                        globalSendLog(`[TimeoutChecker] Não foi possível obter o chat para ${conversation.CLIENT_JID} para enviar msg de timeout.`, 'error');
                    }

                    // Atualizar conversa no DB: remover atendente e mudar status para 'pending'
                    await globalDbServices.chat.runQuery(
                        "UPDATE CONVERSATIONS SET USER_ID = NULL, USER_USERNAME = NULL, STATUS = 'pending', UPDATED_AT = CURRENT_TIMESTAMP, LAST_FORWARDED_AT = NULL WHERE ID = ?",
                        [conversation.ID]
                    );
                    globalSendLog(`[TimeoutChecker] ConvID ${conversation.ID} atualizada no DB: atendente removido, status para 'pending'.`, 'info');

                    if (globalWebsocketService) {
                        const updatedConvDetails = await globalDbServices.chat.getConversationById(conversation.ID);
                        globalWebsocketService.broadcastToAttendants({ // Notifica todos que a conversa voltou para pendente
                            type: 'pending_conversation',
                            payload: updatedConvDetails
                        });
                        if (conversation.USER_USERNAME) { // Notifica o atendente específico que a conversa foi removida
                             globalWebsocketService.notifySpecificUser(conversation.USER_USERNAME, {
                                type: 'conversation_timeout_removed', // Novo tipo de evento para UI do atendente
                                payload: { conversationId: conversation.ID, reason: 'timeout' }
                            });
                        }
                        globalSendLog(`[TimeoutChecker] Notificações WebSocket enviadas para ConvID ${conversation.ID}.`, 'info');
                    }
                } catch (error) {
                    globalSendLog(`[TimeoutChecker] Erro ao processar timeout para ConvID ${conversation.ID}: ${error.message}`, 'error');
                }
            }
        }
    } catch (error) {
        globalSendLog(`[TimeoutChecker] Erro CRÍTICO durante a verificação de timeouts: ${error.message}`, 'error');
    } finally {
        globalSendLog('[TimeoutChecker] Verificação de timeouts de atendimento humano concluída.', 'info');
    }
}

async function handleHumanAttendanceFinish(conversationId, finishingAgentUsername) {
    globalSendLog(`[HumanFinish] Atendente ${finishingAgentUsername} está finalizando ConvID ${conversationId}.`, 'info');
    if (!globalDbServices || !globalDbServices.main || !globalDbServices.chat || !client || connectionStatus !== 'CONNECTED') {
        globalSendLog('[HumanFinish] Não é possível finalizar: Serviços DB/WhatsApp não disponíveis ou WhatsApp não conectado.', 'warn');
        return { success: false, message: "Serviços indisponíveis ou WhatsApp desconectado." };
    }

    try {
        const conversation = await globalDbServices.chat.getConversationById(conversationId);
        if (!conversation) {
            globalSendLog(`[HumanFinish] Conversa ID ${conversationId} não encontrada.`, 'error');
            return { success: false, message: "Conversa não encontrada." };
        }

        if (conversation.STATUS !== 'active' || !conversation.USER_ID) {
            globalSendLog(`[HumanFinish] ConvID ${conversationId} não está em atendimento ativo ou não tem atendente. Status: ${conversation.STATUS}, UserID: ${conversation.USER_ID}.`, 'warn');
            return { success: false, message: "Conversa não está em atendimento humano ativo." };
        }
        
        // Opcional: Verificar se finishingAgentUsername corresponde a conversation.USER_USERNAME
        if (conversation.USER_USERNAME !== finishingAgentUsername) {
            globalSendLog(`[HumanFinish] Atendente ${finishingAgentUsername} tentando finalizar ConvID ${conversationId}, mas ela pertence a ${conversation.USER_USERNAME}.`, 'warn');
            // Dependendo da política, pode-se permitir que qualquer admin finalize, ou apenas o dono.
            // Por ora, vamos permitir, mas logar.
        }

        const finishMsgConfig = await globalDbServices.main.getConfigByKey('HUMAN_ATTENDANCE_FINISHED_RESPONSE_TEXT');
        const finishResponseText = finishMsgConfig ? finishMsgConfig.CONFIG_VALUE : "O atendimento anterior foi finalizado. Nosso assistente virtual está de volta para ajudar.";
        
        const chat = await client.getChatById(conversation.CLIENT_JID);
        if (chat) {
            await sendTypingMessageWithDelay(chat, finishResponseText, 500, 200, conversation.ID, conversation.CLIENT_JID);
            globalSendLog(`[HumanFinish] Mensagem de finalização enviada para cliente ${conversation.CLIENT_JID}.`, 'info');
        } else {
            globalSendLog(`[HumanFinish] Não foi possível obter o chat para ${conversation.CLIENT_JID} para enviar msg de finalização.`, 'error');
        }

        // Atualizar conversa no DB: remover atendente e mudar status para 'pending'
        await globalDbServices.chat.runQuery(
            "UPDATE CONVERSATIONS SET USER_ID = NULL, USER_USERNAME = NULL, STATUS = 'pending', UPDATED_AT = CURRENT_TIMESTAMP, LAST_FORWARDED_AT = NULL WHERE ID = ?",
            [conversation.ID]
        );
        globalSendLog(`[HumanFinish] ConvID ${conversationId} atualizada no DB: atendente removido, status para 'pending'.`, 'info');

        if (globalWebsocketService) {
            const updatedConvDetails = await globalDbServices.chat.getConversationById(conversation.ID);
            globalWebsocketService.broadcastToAttendants({ // Notifica todos que a conversa voltou para pendente
                type: 'pending_conversation',
                payload: updatedConvDetails
            });
             if (conversation.USER_USERNAME) { // Notifica o atendente que finalizou (ou o dono original)
                 globalWebsocketService.notifySpecificUser(conversation.USER_USERNAME, {
                    type: 'conversation_finished_removed', // Novo tipo de evento para UI do atendente
                    payload: { conversationId: conversation.ID, reason: 'manual_finish' }
                });
            }
            globalSendLog(`[HumanFinish] Notificações WebSocket enviadas para ConvID ${conversation.ID}.`, 'info');
        }
        return { success: true, message: "Atendimento finalizado com sucesso." };
    } catch (error) {
        globalSendLog(`[HumanFinish] Erro ao finalizar atendimento para ConvID ${conversationId}: ${error.message}`, 'error');
        return { success: false, message: `Erro ao finalizar: ${error.message}` };
    }
}
