// backend/services/sqliteService.js
const sqlite3Node = require('sqlite3'); 
const path = require('path');
const fs = require('fs');
const dbConfig = require('../config/dbConfigSqlite'); 
const { initAuthCreds } = require('baileys'); 

const sqlite3 = sqlite3Node.verbose();

let globalSendLog = (msg, level) => console[level || 'log'](msg);
let db; 

async function connect() {
    return new Promise((resolve, reject) => {
        if (db && db.open) { 
            globalSendLog('[SQLite] Usando conexão existente.', 'debug');
            resolve(db);
            return;
        }
        const dbDir = path.dirname(dbConfig.databasePath);
        if (!fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir, { recursive: true });
                globalSendLog(`[SQLite] Diretório do banco de dados criado: ${dbDir}`, 'info');
            } catch (mkdirErr) {
                globalSendLog(`[SQLite] Erro ao criar diretório do banco de dados ${dbDir}: ${mkdirErr.message}`, 'error');
                return reject(mkdirErr);
            }
        }
        globalSendLog(`[SQLite] Conectando ao banco de dados em: ${dbConfig.databasePath}`, 'info');
        const newDb = new sqlite3.Database(dbConfig.databasePath, (err) => {
            if (err) {
                globalSendLog(`[SQLite] Erro ao conectar ao banco: ${err.message}`, 'error');
                return reject(err);
            }
            globalSendLog('[SQLite] Conectado ao banco de dados SQLite com sucesso.', 'info');
            db = newDb;
            db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
                if (pragmaErr) {
                    globalSendLog(`[SQLite] Erro ao habilitar PRAGMA foreign_keys: ${pragmaErr.message}`, 'error');
                } else {
                    globalSendLog('[SQLite] PRAGMA foreign_keys habilitado.', 'debug');
                }
            });
            resolve(db);
        });
    });
}

async function close() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    globalSendLog(`[SQLite] Erro ao fechar o banco de dados: ${err.message}`, 'error');
                    return reject(err);
                }
                globalSendLog('[SQLite] Conexão com o banco de dados SQLite fechada.', 'info');
                db = null; 
                resolve();
            });
        } else {
            resolve();
        }
    });
}

async function get(sql, params = []) {
    await connect(); 
    return new Promise((resolve, reject) => {
        globalSendLog(`[SQLite] GET: ${sql.substring(0,100)}... Params: ${JSON.stringify(params)}`, 'debug');
        db.get(sql, params, (err, row) => {
            if (err) {
                globalSendLog(`[SQLite] Erro na query GET: ${sql.substring(0,100)} - ${err.message}`, 'error');
                return reject(err);
            }
            resolve(row);
        });
    });
}

async function all(sql, params = []) {
    await connect();
    return new Promise((resolve, reject) => {
        globalSendLog(`[SQLite] ALL: ${sql.substring(0,100)}... Params: ${JSON.stringify(params)}`, 'debug');
        db.all(sql, params, (err, rows) => {
            if (err) {
                globalSendLog(`[SQLite] Erro na query ALL: ${sql.substring(0,100)} - ${err.message}`, 'error');
                return reject(err);
            }
            resolve(rows);
        });
    });
}

async function run(sql, params = []) {
    await connect();
    return new Promise((resolve, reject) => {
        globalSendLog(`[SQLite] RUN: ${sql.substring(0,100)}... Params: ${JSON.stringify(params)}`, 'debug');
        db.run(sql, params, function(err) {
            if (err) {
                globalSendLog(`[SQLite] Erro na query RUN: ${sql.substring(0,100)} - ${err.message}`, 'error');
                return reject(err);
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

async function executeTransaction(callback) {
    await connect();
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION;", async (beginErr) => {
                if (beginErr) {
                    globalSendLog(`[SQLite] Erro ao iniciar transação: ${beginErr.message}`, 'error');
                    return reject(beginErr);
                }
                globalSendLog('[SQLite] Transação iniciada.', 'debug');
                try {
                    const result = await callback(db); 
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) {
                            globalSendLog(`[SQLite] Erro ao commitar transação: ${commitErr.message}`, 'error');
                            db.run("ROLLBACK;", (rollbackErr) => {
                                if (rollbackErr) globalSendLog(`[SQLite] Erro crítico ao tentar rollback após falha no commit: ${rollbackErr.message}`, 'error');
                                reject(commitErr);
                            });
                        } else {
                            globalSendLog('[SQLite] Transação commitada com sucesso.', 'debug');
                            resolve(result);
                        }
                    });
                } catch (error) {
                    globalSendLog(`[SQLite] Erro durante a execução da transação (callback): ${error.message}`, 'error');
                    globalSendLog(error.stack, 'debug'); // Log stack do erro do callback
                    db.run("ROLLBACK;", (rollbackErr) => {
                        if (rollbackErr) globalSendLog(`[SQLite] Erro crítico ao tentar rollback após erro no callback: ${rollbackErr.message}`, 'error');
                        else globalSendLog('[SQLite] Transação rollbackada com sucesso após erro no callback.', 'debug');
                        reject(error); 
                    });
                }
            });
        });
    });
}


async function createTablesIfNotExists() {
    // ... (definições das tabelas como antes, sem alterações)
    globalSendLog('[SQLite] Verificando e criando tabelas se não existirem...', 'info');
    const createAttendantsTable = `
        CREATE TABLE IF NOT EXISTS ATTENDANTS (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            USERNAME TEXT NOT NULL UNIQUE,
            PASSWORD_HASH TEXT NOT NULL,
            NAME TEXT NOT NULL,
            IS_ADMIN INTEGER DEFAULT 0 NOT NULL, 
            SECTOR TEXT, 
            DIRECT_CONTACT_NUMBER TEXT
        );
    `;
    const createWhatsappSessionsTable = `
        CREATE TABLE IF NOT EXISTS WHATSAPP_SESSIONS (
            SESSION_ID TEXT NOT NULL PRIMARY KEY,
            STATUS TEXT,
            JID TEXT,
            LAST_QR_CODE TEXT,
            LAST_UPDATED DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const createWhatsappAuthStoreTable = `
        CREATE TABLE IF NOT EXISTS WHATSAPP_AUTH_STORE (
            SESSION_ID TEXT NOT NULL,
            AUTH_KEY TEXT NOT NULL,
            KEY_VALUE TEXT, 
            LAST_UPDATED DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (SESSION_ID, AUTH_KEY)
        );
    `;
     const createClientsTable = `
        CREATE TABLE IF NOT EXISTS CLIENTS (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            WHATSAPP_ID TEXT NOT NULL UNIQUE,
            NAME TEXT,
            PROFILE_PIC_URL TEXT,
            CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
            LAST_INTERACTION DATETIME
        );
    `;
    const createConversationsTable = `
        CREATE TABLE IF NOT EXISTS CONVERSATIONS (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            CLIENT_WHATSAPP_ID TEXT NOT NULL,
            ATTENDANT_ID INTEGER, 
            ATTENDANT_USERNAME TEXT, 
            STATUS TEXT DEFAULT 'PENDING' NOT NULL,
            CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
            LAST_MESSAGE_TIMESTAMP DATETIME,
            UNREAD_MESSAGES INTEGER DEFAULT 0,
            FOREIGN KEY (ATTENDANT_ID) REFERENCES ATTENDANTS(ID) ON DELETE SET NULL ON UPDATE CASCADE
        );
    `;
    const createMessagesTable = `
        CREATE TABLE IF NOT EXISTS MESSAGES (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            CONVERSATION_ID INTEGER NOT NULL,
            BAILEYS_MSG_ID TEXT UNIQUE,
            SENDER_TYPE TEXT NOT NULL CHECK (SENDER_TYPE IN ('CLIENT', 'AGENT', 'SYSTEM')),
            SENDER_JID TEXT,
            MESSAGE_CONTENT TEXT, 
            MESSAGE_TYPE TEXT,
            TIMESTAMP DATETIME DEFAULT CURRENT_TIMESTAMP,
            IS_READ_BY_AGENT INTEGER DEFAULT 0, 
            FOREIGN KEY (CONVERSATION_ID) REFERENCES CONVERSATIONS(ID) ON DELETE CASCADE ON UPDATE CASCADE
        );
    `;

    try {
        await run(createAttendantsTable); globalSendLog('[SQLite] Tabela ATTENDANTS verificada/criada.', 'info');
        await run(createWhatsappSessionsTable); globalSendLog('[SQLite] Tabela WHATSAPP_SESSIONS verificada/criada.', 'info');
        await run(createWhatsappAuthStoreTable); globalSendLog('[SQLite] Tabela WHATSAPP_AUTH_STORE verificada/criada.', 'info');
        await run(createClientsTable); globalSendLog('[SQLite] Tabela CLIENTS verificada/criada.', 'info');
        await run(createConversationsTable); globalSendLog('[SQLite] Tabela CONVERSATIONS verificada/criada.', 'info');
        await run(createMessagesTable); globalSendLog('[SQLite] Tabela MESSAGES verificada/criada.', 'info');
        globalSendLog('[SQLite] Verificação/criação de todas as tabelas concluída.', 'info');
    } catch (error) {
        globalSendLog(`[SQLite] Erro durante a criação de tabelas: ${error.message}`, 'error');
        throw error;
    }
}

async function getAttendantByUsername(username) { /* ... (como antes) ... */ 
    const sql = "SELECT ID, USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM ATTENDANTS WHERE UPPER(USERNAME) = UPPER(?)";
    try {
        const attendant = await get(sql, [username]);
        if (attendant) {
            attendant.IS_ADMIN = attendant.IS_ADMIN === 1;
            if (attendant.SECTOR && typeof attendant.SECTOR === 'string') {
                attendant.SECTOR = attendant.SECTOR.split(',').map(s => s.trim());
            } else if (!attendant.SECTOR) {
                attendant.SECTOR = [];
            }
        }
        return attendant;
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao buscar atendente '${username}': ${error.message}`, 'error');
        throw error;
    }
}
async function getAttendantById(id) { /* ... (como antes) ... */ 
    const sql = "SELECT ID, USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM ATTENDANTS WHERE ID = ?";
    try {
        const attendant = await get(sql, [id]);
        if (attendant) {
            attendant.IS_ADMIN = attendant.IS_ADMIN === 1;
            if (attendant.SECTOR && typeof attendant.SECTOR === 'string') {
                attendant.SECTOR = attendant.SECTOR.split(',').map(s => s.trim());
            } else if (!attendant.SECTOR) {
                attendant.SECTOR = [];
            }
        }
        return attendant;
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao buscar atendente por ID '${id}': ${error.message}`, 'error');
        return null; 
    }
}

async function createAttendant(attendantData, dbInstance) { /* ... (como antes) ... */ 
    const { USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER } = attendantData;
    const sectorString = Array.isArray(SECTOR) ? SECTOR.join(',') : (SECTOR || null);
    const sql = "INSERT INTO ATTENDANTS (USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER) VALUES (?, ?, ?, ?, ?, ?)";
    const params = [ USERNAME.toUpperCase(), PASSWORD_HASH, NAME, IS_ADMIN ? 1 : 0, sectorString, DIRECT_CONTACT_NUMBER || null ];

    return new Promise((resolve, reject) => {
        dbInstance.run(sql, params, function(err) {
            if (err) {
                globalSendLog(`[SQLite] Erro ao criar atendente ${USERNAME} na transação: ${err.message}`, 'error');
                return reject(err);
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}
async function initializeDefaultAttendants() { /* ... (como antes) ... */ 
    globalSendLog('[SQLite] Verificando e inicializando atendentes padrão...', 'info');
    const defaultAttendants = [
        { USERNAME: "admin", NAME: "Administrador", PASSWORD_HASH: "$2b$10$lrxuqCVgRxuFs1NkkXs81ur0AIk6U6pjPfggt6gHdAbVF9PFf9vxu", IS_ADMIN: true, SECTOR: null, DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "joenis", NAME: "Joenis", PASSWORD_HASH: "$2b$10$Mw9FP48xSichgLiBbVJSsOS6UsNEr4qP9VUAO/6c7kvNyXRqyvxvu", IS_ADMIN: false, SECTOR: ["balcao_rcpn", "rcpj_rtd_protestos", "notas"], DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "luciene", NAME: "Luciene", PASSWORD_HASH: "$2b$10$lReSRjnSH19/3k/IkP281.WMERyvsIytlxl04TZ9Cg1j380eanNpq", IS_ADMIN: false, SECTOR: ["balcao_rcpn"], DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "manuelle", NAME: "Manuelle", PASSWORD_HASH: "$2b$10$zkgIY1.qleUhClDngUq17eV9TV.panx9MfBfkrKsnpe128ocogUP6", IS_ADMIN: false, SECTOR: ["rcpj_rtd_protestos"], DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "jessica", NAME: "Jéssica", PASSWORD_HASH: "$2b$10$dh2w8O8skoyekD.X/sFAgOX/7FGLEqrqbgTpN0vmDnP3IAFb0RPmS", IS_ADMIN: false, SECTOR: ["rgi"], DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "raiany", NAME: "Raiany", PASSWORD_HASH: "$2b$10$nstqua1mqKAdgXLXARfXceXMWT5gmKZwucdof4PZE1g/7fAIx9Mti", IS_ADMIN: false, SECTOR: ["notas"], DIRECT_CONTACT_NUMBER: null },
        { USERNAME: "luciano", NAME: "Luciano", PASSWORD_HASH: "$2b$10$nOdtY32AYZTiPGZf74H7O.oyrePcb0nVI6HW/VhkhJpZFtrwHfB0S", IS_ADMIN: false, SECTOR: ["notas"], DIRECT_CONTACT_NUMBER: "5522981683531" }
    ];

    try {
        await executeTransaction(async (transactionDb) => { 
            for (const attendant of defaultAttendants) {
                const existingAttendant = await new Promise((resolve, reject) => {
                    transactionDb.get("SELECT ID FROM ATTENDANTS WHERE UPPER(USERNAME) = UPPER(?)", [attendant.USERNAME], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });

                if (!existingAttendant) {
                    globalSendLog(`[SQLite] Criando atendente padrão: ${attendant.USERNAME}`, 'info');
                    await createAttendant(attendant, transactionDb);
                } else {
                    globalSendLog(`[SQLite] Atendente padrão ${attendant.USERNAME} já existe.`, 'debug');
                }
            }
        });
        globalSendLog('[SQLite] Inicialização de atendentes padrão concluída.', 'info');
    } catch (error) {
        globalSendLog(`[SQLite] Erro durante a inicialização de atendentes padrão: ${error.message}`, 'error');
        throw error;
    }
}

// --- Funções para Sessão Baileys (WHATSAPP_SESSIONS e WHATSAPP_AUTH_STORE) ---
function bufferToBase64(buffer) { 
    if (!buffer) return null;
    return Buffer.isBuffer(buffer) ? buffer.toString('base64') : buffer; // Retorna string se já for string
}
function base64ToBuffer(base64) { 
    if (!base64 || typeof base64 !== 'string') return null; // Verifica se é string
    return Buffer.from(base64, 'base64');
}

function serializeData(data) {
    if (data === undefined || data === null) return null;
    // Percorre o objeto recursivamente para encontrar Buffers
    const replacer = (key, value) => {
        if (value instanceof Uint8Array || (typeof value === 'object' && value !== null && value.type === 'Buffer' && Array.isArray(value.data))) {
            // Converte Uint8Array ou objeto Buffer do Baileys para Buffer Node.js e depois para Base64
            return { __buffer__: Buffer.from(value.data || value).toString('base64') };
        }
        if (Buffer.isBuffer(value)) {
            return { __buffer__: value.toString('base64') };
        }
        return value;
    };
    return JSON.stringify(data, replacer);
}

function deserializeData(jsonString) {
    if (!jsonString) return null;
    const reviver = (key, value) => {
        if (typeof value === 'object' && value !== null && value.__buffer__ !== undefined && typeof value.__buffer__ === 'string') {
            return Buffer.from(value.__buffer__, 'base64');
        }
        return value;
    };
    try {
        return JSON.parse(jsonString, reviver);
    } catch (e) {
        globalSendLog(`[SQLiteAuth] Erro ao desserializar JSON: ${e.message}. String: ${jsonString.substring(0,100)}...`, "error");
        return null; // Retorna null se houver erro de parse
    }
}

async function sqliteAuthStore(sessionId) {
    globalSendLog(`[SQLiteAuth] Inicializando store para sessionId: ${sessionId}`, 'info');
    await connect(); 

    const readData = async (key) => {
        const sql = "SELECT KEY_VALUE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ? AND AUTH_KEY = ?";
        try {
            const row = await get(sql, [sessionId, key]);
            if (row && row.KEY_VALUE) {
                globalSendLog(`[SQLiteAuth] Lendo dados para chave '${key}' (session: ${sessionId})`, 'debug');
                const deserialized = deserializeData(row.KEY_VALUE);
                // globalSendLog(`[SQLiteAuth] Dados desserializados para '${key}': ${JSON.stringify(deserialized, null, 2).substring(0, 300)}`, 'debug');
                return deserialized;
            }
            globalSendLog(`[SQLiteAuth] Chave '${key}' não encontrada para session: ${sessionId}`, 'debug');
            return null;
        } catch (error) {
            globalSendLog(`[SQLiteAuth] Erro ao ler dados para chave '${key}': ${error.message}`, 'error');
            return null;
        }
    };

    const writeData = async (key, value) => {
        if (value === undefined || value === null) {
            globalSendLog(`[SQLiteAuth] Valor para chave '${key}' é undefined/null. Removendo...`, 'debug');
            return removeData(key);
        }
        const serializedValue = serializeData(value);
        if (serializedValue === null) {
             globalSendLog(`[SQLiteAuth] Valor serializado é nulo para a chave '${key}', não escrevendo.`, 'warn');
             return;
        }
        // globalSendLog(`[SQLiteAuth] Escrevendo dados serializados para chave '${key}': ${serializedValue.substring(0,300)}...`, 'debug');
        const sql = `
            INSERT INTO WHATSAPP_AUTH_STORE (SESSION_ID, AUTH_KEY, KEY_VALUE, LAST_UPDATED)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(SESSION_ID, AUTH_KEY) DO UPDATE SET
            KEY_VALUE = excluded.KEY_VALUE,
            LAST_UPDATED = datetime('now');
        `;
        try {
            await run(sql, [sessionId, key, serializedValue]);
        } catch (error) {
            globalSendLog(`[SQLiteAuth] Erro ao escrever dados para chave '${key}': ${error.message}`, 'error');
        }
    };

    const removeData = async (key) => {
        const sql = "DELETE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ? AND AUTH_KEY = ?";
        try {
            globalSendLog(`[SQLiteAuth] Removendo dados para chave '${key}' (session: ${sessionId})`, 'debug');
            await run(sql, [sessionId, key]);
        } catch (error) {
            globalSendLog(`[SQLiteAuth] Erro ao remover dados para chave '${key}': ${error.message}`, 'error');
        }
    };

    const clearAllData = async () => {
        const sql = "DELETE FROM WHATSAPP_AUTH_STORE WHERE SESSION_ID = ?";
        try {
            globalSendLog(`[SQLiteAuth] Limpando todos os dados de autenticação para session: ${sessionId}`, 'info');
            await run(sql, [sessionId]);
        } catch (error) {
            globalSendLog(`[SQLiteAuth] Erro ao limpar todos os dados de autenticação para session '${sessionId}': ${error.message}`, 'error');
        }
    };
    
    let creds = await readData('creds');
    if (!creds) {
        globalSendLog(`[SQLiteAuth] Nenhuma credencial encontrada para session '${sessionId}', inicializando com initAuthCreds().`, 'info');
        creds = initAuthCreds();
    } else {
        globalSendLog(`[SQLiteAuth] Credenciais encontradas para session '${sessionId}'.`, 'info');
    }
    
    const keys = {
        get: async (type, ids) => {
            const data = {};
            for (const id of ids) {
                const value = await readData(`${type}-${id}`);
                if (value) { data[id] = value; }
            }
            // globalSendLog(`[SQLiteAuth Keys GET] type: ${type}, ids: ${ids.join(',')}, data found: ${Object.keys(data).length > 0}`, 'debug');
            return data;
        },
        set: async (data) => {
            // globalSendLog(`[SQLiteAuth Keys SET] data: ${JSON.stringify(Object.keys(data))}`, 'debug');
            for (const category in data) {
                for (const id in data[category]) {
                    const value = data[category][id];
                    const key = `${category}-${id}`;
                    if (value) { await writeData(key, value); }
                    else { await removeData(key); }
                }
            }
        }
    };
    
    return { 
        state: { creds, keys }, 
        saveCreds: async () => { 
            // globalSendLog(`[SQLiteAuth] Tentando salvar creds: ${JSON.stringify(creds, null, 2).substring(0,300)}`, 'debug');
            await writeData('creds', creds); 
            globalSendLog(`[SQLiteAuth] Credenciais salvas para session: ${sessionId}`, 'info'); 
        },
        clearAllData 
    };
}

async function updateWhatsappSessionStatus(sessionId, status, jid = null, lastQrCode = null) { /* ... (como antes) ... */ 
    const sql = `
        INSERT INTO WHATSAPP_SESSIONS (SESSION_ID, STATUS, JID, LAST_QR_CODE, LAST_UPDATED)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(SESSION_ID) DO UPDATE SET
        STATUS = excluded.STATUS,
        JID = excluded.JID,
        LAST_QR_CODE = excluded.LAST_QR_CODE,
        LAST_UPDATED = datetime('now');
    `;
    try { await run(sql, [sessionId, status, jid, lastQrCode]); globalSendLog(`[SQLite] Status da sessão Baileys '${sessionId}' atualizado para: ${status}`, 'info'); } catch (error) { globalSendLog(`[SQLite] Erro ao atualizar status da sessão Baileys '${sessionId}': ${error.message}`, 'error'); }
}
async function getWhatsappSession(sessionId) { /* ... (como antes) ... */ 
    const sql = "SELECT SESSION_ID, STATUS, JID, LAST_QR_CODE, LAST_UPDATED FROM WHATSAPP_SESSIONS WHERE SESSION_ID = ?";
    try { return await get(sql, [sessionId]); } catch (error) { globalSendLog(`[SQLite] Erro ao buscar sessão Baileys '${sessionId}': ${error.message}`, 'error'); return null; }
}
async function getClientByWhatsappId(whatsappId) { /* ... (como antes) ... */ 
    const sql = "SELECT ID, WHATSAPP_ID, NAME, PROFILE_PIC_URL FROM CLIENTS WHERE WHATSAPP_ID = ?";
    try {
        return await get(sql, [whatsappId]);
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao buscar cliente por WhatsApp ID '${whatsappId}': ${error.message}`, 'error');
        return null;
    }
}
async function findOrCreateConversation(clientJid, attendantUsername = null) { /* ... (como antes) ... */ 
    let attendantId = null;
    if (attendantUsername) {
        const attendant = await getAttendantByUsername(attendantUsername);
        if (attendant) attendantId = attendant.ID;
    }

    let sql = `
        SELECT c.ID, c.CLIENT_WHATSAPP_ID, c.ATTENDANT_ID, att.USERNAME as ATTENDANT_USERNAME, att.NAME as ATTENDANT_NAME, c.STATUS, 
               STRFTIME('%Y-%m-%dT%H:%M:%fZ', c.LAST_MESSAGE_TIMESTAMP) as LAST_MESSAGE_TIMESTAMP, 
               c.UNREAD_MESSAGES 
        FROM CONVERSATIONS c
        LEFT JOIN ATTENDANTS att ON c.ATTENDANT_ID = att.ID
        WHERE c.CLIENT_WHATSAPP_ID = ? AND c.STATUS IN ('PENDING', 'ACTIVE')
    `;
    const params = [clientJid];
    if (attendantId) { 
        sql += " AND (c.ATTENDANT_ID = ? OR c.ATTENDANT_ID IS NULL)"; 
        params.push(attendantId);
    }
    sql += " ORDER BY c.LAST_MESSAGE_TIMESTAMP DESC LIMIT 1";

    let conversation = await get(sql, params);
    if (conversation) {
        globalSendLog(`[SQLite] Conversa encontrada para ${clientJid}. ID: ${conversation.ID}`, 'debug');
        return conversation;
    }

    globalSendLog(`[SQLite] Nenhuma conversa ativa/pendente para ${clientJid}. Criando nova...`, 'info');
    const insertSql = "INSERT INTO CONVERSATIONS (CLIENT_WHATSAPP_ID, STATUS, CREATED_AT, LAST_MESSAGE_TIMESTAMP, ATTENDANT_USERNAME) VALUES (?, 'PENDING', datetime('now'), datetime('now'), ?)";
    try {
        const result = await run(insertSql, [clientJid, attendantUsername]); 
        return await get("SELECT c.*, att.NAME as ATTENDANT_NAME FROM CONVERSATIONS c LEFT JOIN ATTENDANTS att ON c.ATTENDANT_ID = att.ID WHERE c.ID = ?", [result.lastID]);
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao criar nova conversa para ${clientJid}: ${error.message}`, 'error');
        throw error;
    }
}
async function saveMessage(messageData) { /* ... (como antes) ... */ 
    const { conversation_id, baileys_msg_id, sender_type, sender_jid, message_content, message_type, timestamp, is_read_by_agent } = messageData;
    const sql = `
        INSERT INTO MESSAGES (CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_JID, MESSAGE_CONTENT, MESSAGE_TYPE, TIMESTAMP, IS_READ_BY_AGENT)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const messageTimestamp = timestamp instanceof Date ? timestamp.toISOString() : (timestamp || new Date().toISOString());
    
    try {
        const result = await run(sql, [
            conversation_id, baileys_msg_id, sender_type, sender_jid,
            typeof message_content === 'string' ? message_content : JSON.stringify(message_content),
            message_type, messageTimestamp, is_read_by_agent ? 1 : 0
        ]);
        globalSendLog(`[SQLite] Mensagem salva para conversa ${conversation_id}. ID da mensagem no DB: ${result.lastID}`, 'info');
        
        const unreadIncrement = (sender_type === 'CLIENT' && !(is_read_by_agent ? 1 : 0)) ? 1 : 0; 
        const updateConvSql = `
            UPDATE CONVERSATIONS 
            SET LAST_MESSAGE_TIMESTAMP = ?, 
                UNREAD_MESSAGES = UNREAD_MESSAGES + ? 
            WHERE ID = ?
        `; 
        await run(updateConvSql, [messageTimestamp, unreadIncrement, conversation_id]);

        return { ...messageData, ID: result.lastID, TIMESTAMP: messageTimestamp };
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao salvar mensagem para conversa ${conversation_id}: ${error.message}`, 'error');
        if (error.message.toUpperCase().includes('UNIQUE CONSTRAINT FAILED: MESSAGES.BAILEYS_MSG_ID')) {
            globalSendLog(`[SQLite] Mensagem com BAILEYS_MSG_ID ${baileys_msg_id} provavelmente já existe.`, 'warn');
        }
        throw error;
    }
}
async function getConversationHistory(conversationId, limit = 50, offset = 0) { /* ... (como antes) ... */ 
    const sql = `
        SELECT ID, CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_JID, MESSAGE_CONTENT, MESSAGE_TYPE, 
               STRFTIME('%Y-%m-%dT%H:%M:%fZ', TIMESTAMP) as TIMESTAMP, 
               IS_READ_BY_AGENT
        FROM MESSAGES
        WHERE CONVERSATION_ID = ?
        ORDER BY TIMESTAMP ASC 
        LIMIT ? OFFSET ?`;
    try {
        const messages = await all(sql, [conversationId, limit, offset]);
        return messages.map(msg => ({
            ...msg,
            MESSAGE_CONTENT: (msg.MESSAGE_TYPE !== 'text' && msg.MESSAGE_CONTENT) ? deserializeData(msg.MESSAGE_CONTENT) : msg.MESSAGE_CONTENT,
            IS_READ_BY_AGENT: msg.IS_READ_BY_AGENT === 1
        }));
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao buscar histórico da conversa ${conversationId}: ${error.message}`, 'error');
        return [];
    }
}
async function getConversationsForAttendant(agentUsername, tabType = 'active', searchTerm = null) { /* ... (como antes) ... */ 
    globalSendLog(`[SQLite] Buscando conversas para atendente ${agentUsername}, aba: ${tabType}, busca: ${searchTerm || 'Nenhuma'}`, 'info');
    let sql = `
        SELECT c.ID, c.CLIENT_WHATSAPP_ID, c.ATTENDANT_ID, att.NAME as ATTENDANT_NAME, c.STATUS, 
               STRFTIME('%Y-%m-%dT%H:%M:%fZ', c.LAST_MESSAGE_TIMESTAMP) as LAST_MESSAGE_TIMESTAMP,
               c.UNREAD_MESSAGES,
               cli.NAME as CLIENT_NAME, cli.PROFILE_PIC_URL,
               (SELECT m.MESSAGE_CONTENT FROM MESSAGES m WHERE m.CONVERSATION_ID = c.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_PREVIEW,
               (SELECT m.MESSAGE_TYPE FROM MESSAGES m WHERE m.CONVERSATION_ID = c.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_TYPE
        FROM CONVERSATIONS c
        LEFT JOIN ATTENDANTS att ON c.ATTENDANT_ID = att.ID
        LEFT JOIN CLIENTS cli ON c.CLIENT_WHATSAPP_ID = cli.WHATSAPP_ID
    `;
    const params = [];
    const conditions = [];
    let agentId = null;
    if (agentUsername) { 
        const attendant = await getAttendantByUsername(agentUsername);
        if (attendant) agentId = attendant.ID;
    }

    if (tabType === 'active') {
        if (agentId) {
            conditions.push("(c.STATUS = 'PENDING' OR (c.STATUS = 'ACTIVE' AND c.ATTENDANT_ID = ?))");
            params.push(agentId);
        } else { 
             conditions.push("c.STATUS = 'PENDING'");
        }
    } else if (tabType === 'closed') {
        if (agentId) {
            conditions.push("c.STATUS = 'CLOSED' AND c.ATTENDANT_ID = ?");
            params.push(agentId);
        } else { 
            conditions.push("c.STATUS = 'CLOSED'");
        }
    }

    if (searchTerm) {
        conditions.push("(UPPER(cli.NAME) LIKE UPPER(?) OR c.CLIENT_WHATSAPP_ID LIKE ?)");
        params.push(`%${searchTerm}%`);
        params.push(`%${searchTerm}%`);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY c.LAST_MESSAGE_TIMESTAMP DESC";

    try {
        const conversations = await all(sql, params);
        return conversations.map(conv => ({
            ...conv,
            ATTENDANT_NAME: conv.ATTENDANT_ID ? conv.ATTENDANT_NAME : 'Pendente'
        }));
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao buscar conversas para atendente ${agentUsername}: ${error.message}`, 'error');
        return [];
    }
}
async function assignConversationToAttendant(conversationId, agentUsername, agentName) { /* ... (como antes) ... */ 
    globalSendLog(`[SQLite] Atribuindo conversa ${conversationId} para atendente ${agentName} (${agentUsername})`, 'info');
    const attendant = await getAttendantByUsername(agentUsername);
    if (!attendant) {
        globalSendLog(`[SQLite] Atendente ${agentUsername} não encontrado para atribuição.`, 'error');
        return null;
    }
    const sql = `UPDATE CONVERSATIONS SET ATTENDANT_ID = ?, ATTENDANT_USERNAME = ?, STATUS = 'ACTIVE', UNREAD_MESSAGES = 0 WHERE ID = ? AND (STATUS = 'PENDING' OR STATUS = 'ACTIVE')`;
    try {
        const result = await run(sql, [attendant.ID, agentUsername, conversationId]);
        if (result.changes > 0) {
            return await get("SELECT c.*, att.NAME as ATTENDANT_NAME FROM CONVERSATIONS c LEFT JOIN ATTENDANTS att ON c.ATTENDANT_ID = att.ID WHERE c.ID = ?", [conversationId]);
        }
        globalSendLog(`[SQLite] Nenhuma conversa encontrada/atualizada para atribuição. ID: ${conversationId}, Atendente: ${agentUsername}`, 'warn');
        return null;
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao atribuir conversa ${conversationId} para ${agentUsername}: ${error.message}`, 'error');
        return null;
    }
}
async function closeConversation(conversationId, agentUsername) { /* ... (como antes) ... */ 
    globalSendLog(`[SQLite] Fechando conversa ${conversationId} pelo atendente ${agentUsername}`, 'info');
    const attendant = await getAttendantByUsername(agentUsername);
    if (!attendant) {
        globalSendLog(`[SQLite] Atendente ${agentUsername} não encontrado para fechar conversa.`, 'error');
        return null;
    }
    const sql = `UPDATE CONVERSATIONS SET STATUS = 'CLOSED' WHERE ID = ? AND ATTENDANT_ID = ? AND STATUS = 'ACTIVE'`;
    try {
        const result = await run(sql, [conversationId, attendant.ID]);
         if (result.changes > 0) {
            return await get("SELECT c.*, att.NAME as ATTENDANT_NAME FROM CONVERSATIONS c LEFT JOIN ATTENDANTS att ON c.ATTENDANT_ID = att.ID WHERE c.ID = ?", [conversationId]);
        }
        globalSendLog(`[SQLite] Nenhuma conversa ativa encontrada para fechar. ID: ${conversationId}, Atendente: ${agentUsername}`, 'warn');
        return null;
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao fechar conversa ${conversationId}: ${error.message}`, 'error');
        return null;
    }
}
async function markMessagesAsReadByAgent(conversationId, agentUsername) { /* ... (como antes) ... */ 
    globalSendLog(`[SQLite] Marcando mensagens como lidas para conversa ${conversationId} pelo atendente ${agentUsername}`, 'info');
    const attendant = await getAttendantByUsername(agentUsername);
    if (!attendant) {
        globalSendLog(`[SQLite] Atendente ${agentUsername} não encontrado para marcar mensagens como lidas.`, 'error');
        throw new Error("Atendente não encontrado.");
    }
    const sql = `UPDATE MESSAGES SET IS_READ_BY_AGENT = 1 WHERE CONVERSATION_ID = ? AND SENDER_TYPE = 'CLIENT' AND IS_READ_BY_AGENT = 0`;
    const updateUnreadSql = "UPDATE CONVERSATIONS SET UNREAD_MESSAGES = 0 WHERE ID = ? AND ATTENDANT_ID = ?";
    try {
        await run(sql, [conversationId]);
        await run(updateUnreadSql, [conversationId, attendant.ID]);
        return 0;
    } catch (error) {
        globalSendLog(`[SQLite] Erro ao marcar mensagens como lidas para conversa ${conversationId}: ${error.message}`, 'error');
        throw error;
    }
}

function setLogger(logger) {
    globalSendLog = logger;
    globalSendLog('[SQLite] Logger injetado no sqliteService.', 'info');
}

module.exports = {
    setLogger,
    connect, 
    close,   
    createTablesIfNotExists,
    get,
    all,
    run,
    executeTransaction,
    getAttendantByUsername,
    getAttendantById, 
    initializeDefaultAttendants,
    sqliteAuthStore,
    updateWhatsappSessionStatus,
    getWhatsappSession,
    getClientByWhatsappId, 
    findOrCreateConversation,
    saveMessage,
    getConversationHistory,
    getConversationsForAttendant,
    assignConversationToAttendant,
    closeConversation,
    markMessagesAsReadByAgent,
};
