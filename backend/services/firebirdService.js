// backend/services/firebirdService.js
const Firebird = require('node-firebird');
const path = require('path');
// O dbConfig.js deve estar na pasta config, um nível acima de services
// Ex: project_root/backend/config/dbConfig.js
const dbOptions = require('../config/dbConfig');

let globalSendLog = (msg, level) => console[level || 'log'](msg); // Fallback logger

// Pool de conexões simples (para demonstração)
// Em produção, considere usar um gerenciador de pool mais robusto se disponível para node-firebird
const MAX_POOL_SIZE = 5;
const pool = [];
let creatingConnection = false;
const connectionQueue = [];

async function getConnection() {
    if (pool.length > 0) {
        const db = pool.pop();
        globalSendLog('[Firebird] Conexão reutilizada do pool.', 'debug');
        return db;
    }

    if (creatingConnection || pool.length + connectionQueue.length >= MAX_POOL_SIZE) {
        globalSendLog('[Firebird] Aguardando conexão na fila...', 'debug');
        return new Promise((resolve, reject) => {
            connectionQueue.push({ resolve, reject });
        });
    }

    creatingConnection = true;
    globalSendLog('[Firebird] Criando nova conexão com o banco de dados...', 'info');
    return new Promise((resolve, reject) => {
        Firebird.attach(dbOptions, (err, db) => {
            creatingConnection = false;
            if (err) {
                globalSendLog(`[Firebird] Erro ao conectar ao banco: ${err.message}`, 'error');
                reject(err);
                processNextInQueue();
                return;
            }
            globalSendLog('[Firebird] Nova conexão estabelecida com sucesso.', 'info');
            resolve(db);
            processNextInQueue();
        });
    });
}

function releaseConnection(db) {
    if (db && db.detach && typeof db.detach === 'function') {
        if (pool.length < MAX_POOL_SIZE) {
            pool.push(db);
            globalSendLog('[Firebird] Conexão devolvida ao pool.', 'debug');
        } else {
            db.detach((err) => {
                if (err) globalSendLog(`[Firebird] Erro ao desanexar conexão (excesso de pool): ${err.message}`, 'error');
                else globalSendLog('[Firebird] Conexão (excesso de pool) desanexada com sucesso.', 'debug');
            });
        }
    }
    processNextInQueue();
}

function processNextInQueue() {
    if (connectionQueue.length > 0 && pool.length < MAX_POOL_SIZE && !creatingConnection) {
        const { resolve } = connectionQueue.shift();
        getConnection().then(resolve).catch(err => {
            // Se a obtenção da conexão falhar, rejeitar a promessa original da fila
            // e tentar processar o próximo, se houver.
            const waiting = connectionQueue.find(item => item.resolve === resolve);
            if(waiting) waiting.reject(err);
            processNextInQueue();
        });
    }
}


async function executeQuery(sql, params = []) {
    let db;
    try {
        db = await getConnection();
        globalSendLog(`[Firebird] Executando Query: ${sql.substring(0,100)}... Params: ${JSON.stringify(params)}`, 'debug');
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) {
                    globalSendLog(`[Firebird] Erro na query: ${sql.substring(0,100)} - ${err.message}`, 'error');
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    } finally {
        if (db) {
            releaseConnection(db);
        }
    }
}

async function executeTransaction(callback) {
    let db;
    let transaction;
    try {
        db = await getConnection();
        globalSendLog('[Firebird] Iniciando transação...', 'debug');
        return new Promise((resolve, reject) => {
            db.transaction(Firebird.ISOLATION_READ_COMMITED, async (err, tr) => {
                if (err) {
                    globalSendLog(`[Firebird] Erro ao iniciar transação: ${err.message}`, 'error');
                    return reject(err);
                }
                transaction = tr;
                try {
                    const result = await callback(transaction);
                    transaction.commit((commitErr) => {
                        if (commitErr) {
                            globalSendLog(`[Firebird] Erro ao commitar transação: ${commitErr.message}`, 'error');
                            transaction.rollback(() => reject(commitErr)); // Tenta rollback
                        } else {
                            globalSendLog('[Firebird] Transação commitada com sucesso.', 'debug');
                            resolve(result);
                        }
                    });
                } catch (callbackError) {
                    globalSendLog(`[Firebird] Erro durante a execução da transação (callback): ${callbackError.message}`, 'error');
                    if (transaction && !transaction.finished) {
                        transaction.rollback((rollbackErr) => {
                            if (rollbackErr) globalSendLog(`[Firebird] Erro ao fazer rollback da transação: ${rollbackErr.message}`, 'error');
                            else globalSendLog('[Firebird] Transação rollbackada com sucesso após erro no callback.', 'debug');
                            reject(callbackError); // Rejeita com o erro original do callback
                        });
                    } else {
                        reject(callbackError);
                    }
                }
            });
        });
    } finally {
        if (db) {
            releaseConnection(db);
        }
    }
}


// --- Funções para Atendentes (ATTENDANTS) ---
async function getAttendantByUsername(username) {
    const sql = "SELECT ID, USERNAME, PASSWORD_HASH, NAME, IS_ADMIN FROM ATTENDANTS WHERE USERNAME = ?";
    // const sql = "SELECT ID, USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SENHA_PLAIN_TEXT FROM ATTENDANTS WHERE USERNAME = ?"; // Para teste com senha plain
    const result = await executeQuery(sql, [username.toUpperCase()]); // Firebird geralmente é case-insensitive para dados, mas pode depender da collation. USERNAME geralmente é guardado em maiúsculas.
    if (result && result.length > 0) {
        // Converte IS_ADMIN para booleano se for número
        const attendant = result[0];
        if (typeof attendant.IS_ADMIN === 'number') {
            attendant.IS_ADMIN = attendant.IS_ADMIN === 1;
        }
        return attendant;
    }
    return null;
}

async function createAttendant(attendantData) {
    // Os campos devem corresponder aos da sua tabela ATTENDANTS
    // Ex: ID (auto-incremento?), USERNAME, PASSWORD_HASH, NAME, IS_ADMIN
    // Se ID for auto-gerado por trigger/generator, não o inclua no INSERT
    const sql = "INSERT INTO ATTENDANTS (USERNAME, PASSWORD_HASH, NAME, IS_ADMIN) VALUES (?, ?, ?, ?)";
    try {
        // USERNAME geralmente é armazenado em maiúsculas no Firebird
        await executeQuery(sql, [
            attendantData.USERNAME.toUpperCase(),
            attendantData.PASSWORD_HASH,
            attendantData.NAME,
            attendantData.IS_ADMIN ? 1 : 0 // 1 para true, 0 para false
        ]);
        return true;
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao criar atendente ${attendantData.USERNAME}: ${error.message}`, 'error');
        return false;
    }
}


// --- Funções para Sessão Baileys (WHATSAPP_SESSIONS) ---
// (Simulando o Baileys Auth Store)

const AUTH_KEYS = [
    'creds', 'me', 'signal-key-store-key-id', 'signal-pre-key-our-id',
    'signal-pre-key-our-registration-id', 'signal-pre-key-next-pre-key-id',
    'signal-pre-key-first-unuploaded-pre-key-id', 'adv-secret-key',
    'processed-history-messages', 'signal-key-store-next-address'
    // Adicione outras chaves conforme a necessidade do Baileys e do seu store
];


// Converte Buffer para string Base64 para armazenamento
function bufferToBase64(buffer) {
    if (!buffer) return null;
    return buffer.toString('base64');
}

// Converte string Base64 de volta para Buffer
function base64ToBuffer(base64) {
    if (!base64) return null;
    return Buffer.from(base64, 'base64');
}

// Serializa os dados para JSON, convertendo Buffers para Base64
function serializeData(data) {
    if (data === undefined || data === null) return null;
    // Se for um buffer diretamente
    if (Buffer.isBuffer(data)) return JSON.stringify({ __buffer__: bufferToBase64(data) });

    // Se for um objeto ou array, percorre recursivamente
    if (typeof data === 'object') {
        const serialized = Array.isArray(data) ? [] : {};
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                if (Buffer.isBuffer(value)) {
                    serialized[key] = { __buffer__: bufferToBase64(value) };
                } else if (value instanceof Uint8Array) {
                     serialized[key] = { __buffer__: bufferToBase64(Buffer.from(value)) };
                } else if (typeof value === 'object' && value !== null) {
                    serialized[key] = serializeData(value); // Chamada recursiva
                } else {
                    serialized[key] = value;
                }
            }
        }
        return JSON.stringify(serialized);
    }
    // Para outros tipos (string, number, boolean), apenas stringify
    return JSON.stringify(data);
}

// Desserializa JSON, convertendo Base64 de volta para Buffers
function deserializeData(jsonString) {
    if (!jsonString) return null;
    const parsed = JSON.parse(jsonString);

    function revive(key, value) {
        if (typeof value === 'object' && value !== null && value.__buffer__ !== undefined) {
            return base64ToBuffer(value.__buffer__);
        }
        return value;
    }
    // Se o próprio objeto parseado for um buffer encapsulado
     if (typeof parsed === 'object' && parsed !== null && parsed.__buffer__ !== undefined) {
        return base64ToBuffer(parsed.__buffer__);
    }
    // Se for um objeto ou array, percorre usando o reviver
    return JSON.parse(jsonString, revive);
}


async function firebirdAuthStore(sessionId) {
    globalSendLog(`[FirebirdAuth] Inicializando store para sessionId: ${sessionId}`, 'info');

    const readData = async (key) => {
        const sql = "SELECT KEY_VALUE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ? AND AUTH_KEY = ?";
        try {
            const result = await executeQuery(sql, [sessionId, key]);
            if (result && result.length > 0 && result[0].KEY_VALUE) {
                globalSendLog(`[FirebirdAuth] Lendo dados para chave '${key}' (session: ${sessionId})`, 'debug');
                return deserializeData(result[0].KEY_VALUE);
            }
            globalSendLog(`[FirebirdAuth] Chave '${key}' não encontrada para session: ${sessionId}`, 'debug');
            return null;
        } catch (error) {
            globalSendLog(`[FirebirdAuth] Erro ao ler dados para chave '${key}': ${error.message}`, 'error');
            return null;
        }
    };

    const writeData = async (key, value) => {
        if (value === undefined || value === null) {
            // Baileys pode tentar escrever undefined, o que pode significar remoção
            return removeData(key);
        }
        const serializedValue = serializeData(value);
        if (serializedValue === null) {
             globalSendLog(`[FirebirdAuth] Valor serializado é nulo para a chave '${key}', não escrevendo.`, 'warn');
             return;
        }

        const upsertSql = `
            UPDATE OR INSERT INTO WHATSAPP_AUTH_STORE (SESSION_ID, AUTH_KEY, KEY_VALUE, LAST_UPDATED)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            MATCHING (SESSION_ID, AUTH_KEY)
        `;
        try {
            globalSendLog(`[FirebirdAuth] Escrevendo dados para chave '${key}' (session: ${sessionId})`, 'debug');
            await executeQuery(upsertSql, [sessionId, key, serializedValue]);
        } catch (error) {
            globalSendLog(`[FirebirdAuth] Erro ao escrever dados para chave '${key}': ${error.message}`, 'error');
        }
    };

    const removeData = async (key) => {
        const sql = "DELETE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ? AND AUTH_KEY = ?";
        try {
            globalSendLog(`[FirebirdAuth] Removendo dados para chave '${key}' (session: ${sessionId})`, 'debug');
            await executeQuery(sql, [sessionId, key]);
        } catch (error) {
            globalSendLog(`[FirebirdAuth] Erro ao remover dados para chave '${key}': ${error.message}`, 'error');
        }
    };

    const clearAllData = async () => {
        const sql = "DELETE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ?";
        try {
            globalSendLog(`[FirebirdAuth] Limpando todos os dados para session: ${sessionId}`, 'info');
            await executeQuery(sql, [sessionId]);
        } catch (error) {
            globalSendLog(`[FirebirdAuth] Erro ao limpar todos os dados para session '${sessionId}': ${error.message}`, 'error');
        }
    };
    
    // Carregar todas as chaves de autenticação conhecidas
    const creds = (await readData('creds')) || {}; // creds é o principal
    const keys = {};

    // Carregar chaves individuais (para Signal store)
    for (const key of AUTH_KEYS) {
        if (key !== 'creds') { // 'creds' já foi carregado
            const data = await readData(key);
            if (data) {
                keys[key] = data;
            }
        }
    }
    
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        const value = await readData(`${type}-${id}`);
                        if (value) {
                            if (type === 'app-state-sync-key') {
                                data[id] = value; // app-state-sync-key é um objeto, não array
                            } else {
                                data[id] = value;
                            }
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                await writeData(key, value);
                            } else {
                                await removeData(key);
                            }
                        }
                    }
                }
            }
        },
        saveCreds: async () => {
            // 'creds' é o objeto principal de autenticação do Baileys
            await writeData('creds', creds);
            globalSendLog(`[FirebirdAuth] Credenciais salvas para session: ${sessionId}`, 'info');
        },
        clearAllData // Expor para limpeza manual se necessário
    };
}


async function updateWhatsappSessionStatus(sessionId, status, jid = null, lastQrCode = null) {
    const sql = `
        UPDATE OR INSERT INTO WHATSAPP_SESSIONS (SESSION_ID, STATUS, JID, LAST_QR_CODE, LAST_UPDATED)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        MATCHING (SESSION_ID)
    `;
    try {
        await executeQuery(sql, [sessionId, status, jid, lastQrCode]);
        globalSendLog(`[Firebird] Status da sessão Baileys '${sessionId}' atualizado para: ${status}`, 'info');
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao atualizar status da sessão Baileys '${sessionId}': ${error.message}`, 'error');
    }
}

async function getWhatsappSession(sessionId) {
    const sql = "SELECT SESSION_ID, STATUS, JID, LAST_QR_CODE, LAST_UPDATED FROM WHATSAPP_SESSIONS WHERE SESSION_ID = ?";
    try {
        const result = await executeQuery(sql, [sessionId]);
        return (result && result.length > 0) ? result[0] : null;
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao buscar sessão Baileys '${sessionId}': ${error.message}`, 'error');
        return null;
    }
}


// --- Funções para Conversas (CONVERSATIONS) e Mensagens (MESSAGES) ---
// Estas são placeholders e precisam ser detalhadas conforme seu schema
async function findOrCreateConversation(clientJid, attendantId = null) {
    // Tenta encontrar uma conversa ativa ou pendente para este cliente
    let sql = "SELECT ID, CLIENT_WHATSAPP_ID, ATTENDANT_ID, STATUS, LAST_MESSAGE_TIMESTAMP, UNREAD_MESSAGES FROM CONVERSATIONS WHERE CLIENT_WHATSAPP_ID = ? AND STATUS IN ('PENDING', 'ACTIVE')";
    let params = [clientJid];
    if (attendantId) {
        sql += " AND (ATTENDANT_ID = ? OR ATTENDANT_ID IS NULL)"; // Prioriza conversa do atendente ou pendente
        params.push(attendantId);
    }
    sql += " ORDER BY LAST_MESSAGE_TIMESTAMP DESC"; // Pega a mais recente se houver múltiplas (improvável com status)

    let result = await executeQuery(sql, params);
    if (result && result.length > 0) {
        globalSendLog(`[Firebird] Conversa encontrada para ${clientJid}. ID: ${result[0].ID}`, 'debug');
        return result[0];
    }

    // Se não encontrou, cria uma nova conversa pendente
    globalSendLog(`[Firebird] Nenhuma conversa ativa/pendente para ${clientJid}. Criando nova...`, 'info');
    const insertSql = "INSERT INTO CONVERSATIONS (CLIENT_WHATSAPP_ID, STATUS, CREATED_AT, LAST_MESSAGE_TIMESTAMP) VALUES (?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING ID, CLIENT_WHATSAPP_ID, ATTENDANT_ID, STATUS, LAST_MESSAGE_TIMESTAMP, UNREAD_MESSAGES";
    // Nota: Firebird < 3 não suporta RETURNING diretamente no INSERT para todos os drivers.
    // Se RETURNING não funcionar, você precisará fazer um SELECT após o INSERT usando GEN_ID ou similar.
    try {
        result = await executeQuery(insertSql, [clientJid]);
        if (result && result.length > 0) { // Supondo que RETURNING funcione e retorne o registro
             globalSendLog(`[Firebird] Nova conversa criada para ${clientJid}. ID: ${result[0].ID}`, 'info');
            return result[0];
        } else {
            // Fallback se RETURNING não funcionar: buscar pelo ID gerado (requer GEN_ID)
            // const genIdSql = "SELECT GEN_ID(YOUR_CONVERSATION_ID_GENERATOR, 0) FROM RDB$DATABASE";
            // const genIdResult = await executeQuery(genIdSql);
            // const newId = genIdResult[0]['GEN_ID'];
            // const selectNewSql = "SELECT * FROM CONVERSATIONS WHERE ID = ?";
            // result = await executeQuery(selectNewSql, [newId]);
            // if (result && result.length > 0) return result[0];
            globalSendLog(`[Firebird] Falha ao obter ID da nova conversa para ${clientJid} após INSERT. Verifique o suporte a RETURNING.`, 'error');
            throw new Error('Falha ao criar ou recuperar nova conversa.');
        }
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao criar nova conversa para ${clientJid}: ${error.message}`, 'error');
        throw error;
    }
}

async function saveMessage(messageData) {
    // messageData: { conversation_id, baileys_msg_id, sender_type, sender_jid, message_content, message_type, timestamp, is_read_by_agent }
    const sql = `
        INSERT INTO MESSAGES (CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_JID, MESSAGE_CONTENT, MESSAGE_TYPE, TIMESTAMP, IS_READ_BY_AGENT)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING ID, TIMESTAMP`; // Adicionado TIMESTAMP para confirmação
     try {
        const result = await executeQuery(sql, [
            messageData.conversation_id,
            messageData.baileys_msg_id,
            messageData.sender_type, // 'CLIENT', 'AGENT', 'SYSTEM'
            messageData.sender_jid,
            typeof messageData.message_content === 'string' ? messageData.message_content : JSON.stringify(messageData.message_content), // Garante que seja string
            messageData.message_type,
            messageData.timestamp || new Date(),
            messageData.is_read_by_agent || false
        ]);
        globalSendLog(`[Firebird] Mensagem salva para conversa ${messageData.conversation_id}. ID da mensagem no DB: ${result?.[0]?.ID}`, 'info');
        
        // Atualizar LAST_MESSAGE_TIMESTAMP e UNREAD_MESSAGES na CONVERSATIONS
        const updateConvSql = "UPDATE CONVERSATIONS SET LAST_MESSAGE_TIMESTAMP = ?, UNREAD_MESSAGES = UNREAD_MESSAGES + ? WHERE ID = ?";
        const unreadIncrement = (messageData.sender_type === 'CLIENT' && !messageData.is_read_by_agent) ? 1 : 0;
        await executeQuery(updateConvSql, [messageData.timestamp || new Date(), unreadIncrement, messageData.conversation_id]);

        return (result && result.length > 0) ? { ...messageData, ID: result[0].ID, TIMESTAMP: result[0].TIMESTAMP } : null; // Retorna a mensagem com ID do DB e timestamp
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao salvar mensagem para conversa ${messageData.conversation_id}: ${error.message}`, 'error');
        if (error.message.includes('PRIMARY KEY VIOLATION') || error.message.includes('UNIQUE KEY VIOLATION')) {
            globalSendLog(`[Firebird] Mensagem com BAILEYS_MSG_ID ${messageData.baileys_msg_id} provavelmente já existe.`, 'warn');
        }
        throw error;
    }
}

async function getConversationHistory(conversationId, limit = 50, offset = 0) {
    const sql = `
        SELECT ID, CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_JID, MESSAGE_CONTENT, MESSAGE_TYPE, TIMESTAMP, IS_READ_BY_AGENT
        FROM MESSAGES
        WHERE CONVERSATION_ID = ?
        ORDER BY TIMESTAMP DESC
        ROWS ? TO ?`; // Sintaxe Firebird para paginar (ROWS X TO Y é X registros começando do Y+1)
                      // Para pegar os últimos 50: ROWS 50 (ou FIRST 50)
                      // Para paginar: ROWS offset+1 TO offset+limit
    // Correção para ROWS: ROWS <offset_plus_1> TO <offset_plus_limit>
    // Ou FIRST <limit> SKIP <offset>
    const paginatedSql = `
        SELECT ID, CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_JID, MESSAGE_CONTENT, MESSAGE_TYPE, TIMESTAMP, IS_READ_BY_AGENT
        FROM MESSAGES
        WHERE CONVERSATION_ID = ?
        ORDER BY TIMESTAMP ASC -- Geralmente o histórico é exibido do mais antigo para o mais novo na tela
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`; // Sintaxe SQL Padrão (Firebird 3+)

    try {
        // Usando OFFSET e FETCH NEXT (Firebird 3+)
        const messages = await executeQuery(paginatedSql, [conversationId, offset, limit]);
        // Desserializar MESSAGE_CONTENT se for JSON de mídia
        return messages.map(msg => ({
            ...msg,
            MESSAGE_CONTENT: msg.MESSAGE_TYPE !== 'text' ? deserializeData(msg.MESSAGE_CONTENT) : msg.MESSAGE_CONTENT
        }));
    } catch (error) {
        globalSendLog(`[Firebird] Erro ao buscar histórico da conversa ${conversationId}: ${error.message}`, 'error');
        return [];
    }
}


// Função para ser chamada pelo electronMain para injetar o logger
function setLogger(logger) {
    globalSendLog = logger;
    globalSendLog('[Firebird] Logger injetado no firebirdService.', 'info');
}

module.exports = {
    setLogger,
    executeQuery,
    executeTransaction,
    // Atendentes
    getAttendantByUsername,
    createAttendant,
    // Sessão Baileys
    firebirdAuthStore, // Para ser usado pelo baileysService
    updateWhatsappSessionStatus,
    getWhatsappSession,
    // Conversas e Mensagens
    findOrCreateConversation,
    saveMessage,
    getConversationHistory,
    // (outras funções CRUD que você precisar)
};
