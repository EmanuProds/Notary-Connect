// backend/services/baileysService.js
const {
    default: makeWASocket,
    useMultiFileAuthState, // Ou seu store Firebird
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    // Browsers // Descomente se for usar
} = require('baileys');
const Pino = require('pino');
// const FirebirdAuthStore = require('./firebirdAuthStore'); // Você precisará criar este
const path = require('path');

let sock;
const sessionId = 'whatsapp-bot-session'; // Ou configurável
let globalSendLog; // Função de log injetada
let globalWebsocketService; // Instância do websocketService injetada
let currentQR = null;
let connectionStatus = 'DISCONNECTED';
let authState; // Para armazenar o estado da autenticação

// Função para ser chamada pelo electronMain.js
async function connectToWhatsApp(sendLogFunction, websocketServiceInstance, firebirdServiceInstance) {
    globalSendLog = sendLogFunction;
    globalWebsocketService = websocketServiceInstance;

    globalSendLog(`[Baileys] Iniciando conexão com WhatsApp para session ID: ${sessionId}`, 'info');

    try {
        // TODO: Implementar e usar o FirebirdAuthStore
        // const { state, saveCreds } = await FirebirdAuthStore(firebirdServiceInstance, sessionId, globalSendLog);
        // Por agora, usando MultiFileAuthState para desenvolvimento:
        const authFolderPath = path.join(__dirname, `../../auth_info_baileys_${sessionId}`);
        globalSendLog(`[Baileys] Usando MultiFileAuthState. Pasta de autenticação: ${authFolderPath}`, 'info');
        const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);
        authState = state;


        const { version, isLatest } = await fetchLatestBaileysVersion();
        globalSendLog(`[Baileys] Usando Baileys versão: ${version.join('.')}, É a mais recente: ${isLatest}`, 'info');

        sock = makeWASocket({
            version,
            logger: Pino({ level: 'silent' }).child({ level: 'silent' }), // 'debug' para logs detalhados do Baileys
            printQRInTerminal: false, // QR será enviado via WebSocket
            auth: {
                creds: authState.creds,
                keys: makeCacheableSignalKeyStore(authState.keys, Pino({ level: 'silent' }).child({ level: 'silent' })),
            },
            // browser: Browsers.macOS('Desktop'), // Exemplo
            generateHighQualityLinkPreview: true,
            // Outras opções como proxy, etc.
        });

        // Handler para salvar credenciais (essencial para persistência)
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            currentQR = qr || null; // Atualiza o QR atual

            if (qr) {
                connectionStatus = 'QR_CODE';
                globalSendLog('[Baileys] QR Code recebido. Enviando para admin via WebSocket.', 'info');
                globalWebsocketService.broadcastToAdmins({
                    type: 'qr_code',
                    clientId: sessionId,
                    payload: { qr: qr }
                });
                // Persistir QR no Firebird se necessário (ex: para mostrar ao admin ao reconectar)
                // await firebirdServiceInstance.updateWhatsappSession(sessionId, { last_qr_code: qr, status: 'QR_REQUESTED' });
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
                // await firebirdServiceInstance.updateWhatsappSession(sessionId, { status: 'DISCONNECTED' });

                if (shouldReconnect) {
                    globalSendLog('[Baileys] Tentando reconectar...', 'info');
                    // Não chamar connectToWhatsApp() diretamente para evitar loop infinito em alguns casos.
                    // O Electron pode reiniciar o processo ou você pode ter um backoff aqui.
                    // Por simplicidade, vamos tentar reconectar após um pequeno delay.
                    setTimeout(() => connectToWhatsApp(globalSendLog, globalWebsocketService, firebirdServiceInstance), 5000);
                } else {
                    globalSendLog('[Baileys] Deslogado. Não será reconectado automaticamente. Limpe a pasta de autenticação para gerar novo QR.', 'error');
                    // Limpar sessão do banco se implementado
                    // await firebirdServiceInstance.clearWhatsappSession(sessionId);
                }
            } else if (connection === 'open') {
                connectionStatus = 'CONNECTED';
                currentQR = null; // Limpa o QR pois já está conectado
                globalSendLog(`[Baileys] Conexão com WhatsApp estabelecida! Usuário: ${sock.user?.id || 'N/A'}`, 'info');
                globalWebsocketService.broadcastToAdmins({
                    type: 'status_update',
                    clientId: sessionId,
                    payload: { status: 'READY', jid: sock.user?.id }
                });
                // await firebirdServiceInstance.updateWhatsappSession(sessionId, { status: 'CONNECTED', jid: sock.user?.id });
            }
            // Outros estados de conexão: 'connecting'
            if (update.isOnline === true) globalSendLog('[Baileys] WhatsApp está online.', 'debug');
            if (update.isOnline === false) globalSendLog('[Baileys] WhatsApp está offline.', 'debug');

        });

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.key.fromMe && m.type === 'notify') { // Ignora próprias mensagens e notificações
                globalSendLog(`[Baileys] Mensagem recebida de: ${msg.key.remoteJid}`, 'info');
                // globalSendLog(JSON.stringify(m, undefined, 2), 'debug'); // Log completo da mensagem

                // TODO: Lógica para salvar mensagem no Firebird e notificar atendente via WebSocket
                // const conversation = await firebirdServiceInstance.findOrCreateConversation(msg.key.remoteJid);
                // const savedMessage = await firebirdServiceInstance.saveMessage({ ... });
                // if (conversation.ATTENDANT_ID) {
                //     globalWebsocketService.sendMessageToAttendant(conversation.ATTENDANT_ID, { type: 'new_message', payload: savedMessage });
                // } else {
                //     globalWebsocketService.broadcastToAttendants({ type: 'pending_conversation', payload: conversation });
                // }
                globalSendLog(`[Baileys] Simulação: Mensagem de ${msg.key.remoteJid} seria processada e enviada para atendentes.`, 'debug');

                 // Exemplo de resposta automática simples para teste
                if (msg.message?.conversation?.toLowerCase() === 'ping') {
                    await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! Recebido do Notary Connect Electron.' });
                    globalSendLog(`[Baileys] Auto-resposta 'Pong!' enviada para ${msg.key.remoteJid}`, 'info');
                }
            }
        });

        // ... outros handlers de eventos Baileys ...
        // sock.ev.on('presence.update', update => globalSendLog(`[Baileys] Presença: ${JSON.stringify(update)}`, 'debug'));
        // sock.ev.on('chats.update', update => globalSendLog(`[Baileys] Chats Atualizados: ${JSON.stringify(update)}`, 'debug'));
        // sock.ev.on('contacts.upsert', contacts => globalSendLog(`[Baileys] Contatos Atualizados: ${JSON.stringify(contacts)}`, 'debug'));


        return sock;

    } catch (error) {
        globalSendLog(`[Baileys] Erro CRÍTICO ao conectar ao WhatsApp: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error');
        // Tentar reconectar ou notificar o admin de falha catastrófica
        globalWebsocketService.broadcastToAdmins({
            type: 'status_update',
            clientId: sessionId,
            payload: { status: 'FATAL_ERROR', reason: error.message }
        });
        throw error; // Re-lança para o electronMain.js tratar se necessário
    }
}

// Função para enviar mensagens (chamada pelo websocketService)
async function sendWhatsAppMessage(toJid, messageContent, agentId, conversationId) {
    if (!sock || connectionStatus !== 'CONNECTED') {
        globalSendLog(`[Baileys] Não é possível enviar mensagem. Socket não conectado. Status: ${connectionStatus}`, 'warn');
        return false;
    }
    try {
        globalSendLog(`[Baileys] Enviando mensagem para ${toJid} pelo atendente ${agentId}: ${JSON.stringify(messageContent)}`, 'info');
        const sentMsg = await sock.sendMessage(toJid, messageContent);
        globalSendLog(`[Baileys] Mensagem enviada com ID: ${sentMsg.key.id}`, 'info');

        // TODO: Salvar mensagem enviada pelo agente no Firebird
        // await firebirdServiceInstance.saveMessage({
        //     conversation_id: conversationId,
        //     baileys_msg_id: sentMsg.key.id,
        //     sender_type: 'AGENT',
        //     sender_jid: agentId, // ou o JID do bot se for o caso
        //     message_content: JSON.stringify(messageContent),
        //     message_type: messageContent.text ? 'text' : 'media', // Simplificado
        //     timestamp: new Date(sentMsg.messageTimestamp * 1000)
        // });
        return true;
    } catch (error) {
        globalSendLog(`[Baileys] Erro ao enviar mensagem para ${toJid}: ${error.message}`, 'error');
        return false;
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
