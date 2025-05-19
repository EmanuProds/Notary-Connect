// backend/services/sqliteService.js
const sqlite3 = require("sqlite3").verbose()
const bcrypt = require("bcrypt") 
const path = require("path")
const fs = require("fs")

let db = null
let logger = console

function setLogger(loggerFunction) {
  logger = loggerFunction
}

function globalSendLog(message, level = "info") {
  if (logger && typeof logger === "function") {
    logger(message, level)
  } else if (logger && typeof logger[level] === "function") {
    logger[level](message)
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`)
  }
}

async function connect(dbPath) {
  return new Promise((resolve, reject) => {
    if (db && db.open) { 
        globalSendLog('[SQLite] Usando conexão existente com o banco de dados.', 'debug');
        resolve(db);
        return;
    }
    const dbDir = path.dirname(dbPath)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        globalSendLog(`[SQLite] Erro ao conectar ao banco de dados: ${err.message}`, "error")
        reject(err)
        return
      }
      globalSendLog(`[SQLite] Conectado ao banco de dados em ${dbPath}`, "info")
      db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
        if (pragmaErr) {
            globalSendLog(`[SQLite] Erro ao habilitar PRAGMA foreign_keys: ${pragmaErr.message}`, 'error');
        } else {
            globalSendLog('[SQLite] PRAGMA foreign_keys habilitado.', 'debug');
        }
      });
      resolve(db)
    })
  })
}

async function close() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve()
      return
    }
    db.close((err) => {
      if (err) {
        globalSendLog(`[SQLite] Erro ao fechar conexão com o banco de dados: ${err.message}`, "error")
        reject(err)
        return
      }
      globalSendLog("[SQLite] Conexão com o banco de dados fechada", "info")
      db = null
      resolve()
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err)
        return
      }
      resolve(row)
    })
  })
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
        return
      }
      resolve(rows)
    })
  })
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.run(sql, params, function (err) {
      if (err) {
        reject(err)
        return
      }
      resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

async function executeTransaction(callback) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("Database not connected"));
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (beginErr) => {
        if (beginErr) return reject(beginErr);
        callback(db) 
          .then((result) => {
            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                db.run("ROLLBACK", (rollbackErr) => reject(rollbackErr || commitErr));
                return reject(commitErr);
              }
              resolve(result);
            });
          })
          .catch((err) => {
            db.run("ROLLBACK", (rollbackErr) => reject(rollbackErr || err));
            reject(err);
          });
      });
    });
  });
}

async function columnExists(tableName, columnName) {
    const columns = await all(`PRAGMA table_info(${tableName})`);
    return columns.some(col => col.name === columnName);
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
        try {
            await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
            globalSendLog(`[SQLite] Coluna '${columnName}' adicionada à tabela '${tableName}'.`, 'info');
        } catch (error) {
            if (!error.message.includes("duplicate column name")) {
                 globalSendLog(`[SQLite] Erro ao adicionar coluna '${columnName}' à tabela '${tableName}': ${error.message}`, 'error');
                 throw error; 
            } else {
                 globalSendLog(`[SQLite] Aviso: Tentativa de adicionar coluna duplicada '${columnName}' à tabela '${tableName}'. Ignorando.`, 'warn');
            }
        }
    } else {
        globalSendLog(`[SQLite] Coluna '${columnName}' já existe na tabela '${tableName}'.`, 'debug');
    }
}


async function createTablesIfNotExists() {
  const createAttendantsTable = `
    CREATE TABLE IF NOT EXISTS ATTENDANTS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      USERNAME TEXT NOT NULL UNIQUE,
      NAME TEXT NOT NULL,
      PASSWORD_HASH TEXT NOT NULL,
      IS_ADMIN INTEGER DEFAULT 0 NOT NULL,
      SECTOR TEXT,
      DIRECT_CONTACT_NUMBER TEXT,
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS CLIENTS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      WHATSAPP_ID TEXT NOT NULL UNIQUE,
      NAME TEXT,
      PHONE TEXT,
      PROFILE_PIC TEXT,
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createConversationsTable = `
    CREATE TABLE IF NOT EXISTS CONVERSATIONS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      CLIENT_ID INTEGER NOT NULL, 
      CLIENT_JID TEXT, 
      ATTENDANT_ID INTEGER,
      ATTENDANT_USERNAME TEXT,
      STATUS TEXT DEFAULT 'pending' NOT NULL,
      SECTOR TEXT,
      TRANSFER_HISTORY TEXT,
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      CLOSED_AT DATETIME,
      LAST_MESSAGE_TIMESTAMP DATETIME, 
      UNREAD_MESSAGES INTEGER DEFAULT 0, 
      FOREIGN KEY (CLIENT_ID) REFERENCES CLIENTS(ID) ON DELETE CASCADE,
      FOREIGN KEY (ATTENDANT_ID) REFERENCES ATTENDANTS(ID) ON DELETE SET NULL
    );
  `;
  const createMessagesTable = `
    CREATE TABLE IF NOT EXISTS MESSAGES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      CONVERSATION_ID INTEGER NOT NULL,
      BAILEYS_MSG_ID TEXT UNIQUE, 
      SENDER_TYPE TEXT NOT NULL, 
      SENDER_ID TEXT NOT NULL, 
      MESSAGE_TYPE TEXT NOT NULL, 
      CONTENT TEXT NOT NULL,
      MEDIA_URL TEXT,
      TIMESTAMP DATETIME DEFAULT CURRENT_TIMESTAMP,
      READ_BY_CLIENT INTEGER DEFAULT 0 NOT NULL,
      READ_BY_AGENT INTEGER DEFAULT 0 NOT NULL,
      FOREIGN KEY (CONVERSATION_ID) REFERENCES CONVERSATIONS(ID) ON DELETE CASCADE
    );
  `;
  const createWhatsappSessionsTable = `
    CREATE TABLE IF NOT EXISTS WHATSAPP_SESSIONS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      SESSION_NAME TEXT NOT NULL UNIQUE, 
      STATUS TEXT NOT NULL, 
      JID TEXT, -- Adicionada coluna JID
      LAST_QR_CODE TEXT, -- Adicionada coluna LAST_QR_CODE
      DATA TEXT, 
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createAutoResponsesTable = `
    CREATE TABLE IF NOT EXISTS AUTO_RESPONSES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      RESPONSE_KEY TEXT NOT NULL UNIQUE,
      RESPONSE_NAME TEXT NOT NULL,
      PATTERN TEXT NOT NULL,
      RESPONSE_TEXT TEXT NOT NULL,
      ACTIVE INTEGER DEFAULT 1 NOT NULL,
      PRIORITY INTEGER DEFAULT 0 NOT NULL,
      START_TIME TEXT DEFAULT '00:00',
      END_TIME TEXT DEFAULT '23:59',
      ALLOWED_DAYS TEXT DEFAULT '1,2,3,4,5,6,0', 
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createConfigTable = `
    CREATE TABLE IF NOT EXISTS SYSTEM_CONFIG (
      CONFIG_KEY TEXT PRIMARY KEY,
      CONFIG_VALUE TEXT NOT NULL,
      CONFIG_TYPE TEXT NOT NULL, 
      CONFIG_DESCRIPTION TEXT,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const createSectorsTable = `
    CREATE TABLE IF NOT EXISTS SECTORS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      SECTOR_KEY TEXT NOT NULL UNIQUE,
      SECTOR_NAME TEXT NOT NULL,
      DESCRIPTION TEXT,
      ACTIVE INTEGER DEFAULT 1 NOT NULL
    );
  `;
  const createServicesTable = `
    CREATE TABLE IF NOT EXISTS SERVICES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      SERVICE_KEY TEXT NOT NULL UNIQUE,
      SERVICE_NAME TEXT NOT NULL,
      DESCRIPTION TEXT,
      PRICE REAL,
      SECTOR_ID INTEGER,
      ACTIVE INTEGER DEFAULT 1 NOT NULL,
      FOREIGN KEY (SECTOR_ID) REFERENCES SECTORS(ID) ON DELETE SET NULL
    );
  `;

  try {
    await run(createAttendantsTable); globalSendLog("[SQLite] Tabela ATTENDANTS verificada/criada.", "info");
    
    await run(createClientsTable); globalSendLog("[SQLite] Tabela CLIENTS verificada/criada.", "info");
    await addColumnIfNotExists('CLIENTS', 'PHONE', 'TEXT');
    await addColumnIfNotExists('CLIENTS', 'PROFILE_PIC', 'TEXT');

    await run(createConversationsTable); globalSendLog("[SQLite] Tabela CONVERSATIONS verificada/criada.", "info");
    await addColumnIfNotExists('CONVERSATIONS', 'CLIENT_ID', 'INTEGER NOT NULL REFERENCES CLIENTS(ID) ON DELETE CASCADE'); // Garantir CLIENT_ID
    await addColumnIfNotExists('CONVERSATIONS', 'CLIENT_JID', 'TEXT');
    await addColumnIfNotExists('CONVERSATIONS', 'LAST_MESSAGE_TIMESTAMP', 'DATETIME');
    await addColumnIfNotExists('CONVERSATIONS', 'UNREAD_MESSAGES', 'INTEGER DEFAULT 0');

    await run(createMessagesTable); globalSendLog("[SQLite] Tabela MESSAGES verificada/criada.", "info");
    await addColumnIfNotExists('MESSAGES', 'BAILEYS_MSG_ID', 'TEXT UNIQUE');

    await run(createWhatsappSessionsTable); globalSendLog("[SQLite] Tabela WHATSAPP_SESSIONS verificada/criada.", "info");
    await addColumnIfNotExists('WHATSAPP_SESSIONS', 'JID', 'TEXT');
    await addColumnIfNotExists('WHATSAPP_SESSIONS', 'LAST_QR_CODE', 'TEXT');


    await run(createAutoResponsesTable); globalSendLog("[SQLite] Tabela AUTO_RESPONSES verificada/criada.", "info");
    await run(createConfigTable); globalSendLog("[SQLite] Tabela SYSTEM_CONFIG verificada/criada.", "info");
    await run(createSectorsTable); globalSendLog("[SQLite] Tabela SECTORS verificada/criada.", "info");
    await run(createServicesTable); globalSendLog("[SQLite] Tabela SERVICES verificada/criada.", "info");

    globalSendLog("[SQLite] Verificação/criação de todas as tabelas e colunas concluída.", "info");
  } catch (error) {
    globalSendLog(`[SQLite] Erro durante a criação/atualização de tabelas: ${error.message}`, "error");
    throw error;
  }
}

async function getAttendantByUsername(username) {
  const sql = "SELECT * FROM ATTENDANTS WHERE UPPER(USERNAME) = UPPER(?)"; 
  try {
    const attendant = await get(sql, [username]);
    if (attendant) {
      attendant.IS_ADMIN = attendant.IS_ADMIN === 1;
      attendant.SECTOR = attendant.SECTOR ? attendant.SECTOR.split(",").map((s) => s.trim()) : [];
    }
    return attendant;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar atendente por username '${username}': ${error.message}`, "error");
    throw error;
  }
}

async function getAttendantById(id) {
  const sql = "SELECT ID, USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM ATTENDANTS WHERE ID = ?";
  try {
    const attendant = await get(sql, [id]);
    if (attendant) {
      attendant.IS_ADMIN = attendant.IS_ADMIN === 1;
      attendant.SECTOR = attendant.SECTOR ? attendant.SECTOR.split(",").map((s) => s.trim()) : [];
    }
    return attendant;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar atendente por ID '${id}': ${error.message}`, "error");
    throw error;
  }
}

async function initializeDefaultAttendants() {
  const defaultAdmin = {
    USERNAME: "ADMIN",
    NAME: "Administrador",
    PASSWORD: "admin123", 
    IS_ADMIN: true,
  };

  try {
    const existingAdmin = await getAttendantByUsername(defaultAdmin.USERNAME);
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(defaultAdmin.PASSWORD, 10);
      const sql = `
        INSERT INTO ATTENDANTS (USERNAME, NAME, PASSWORD_HASH, IS_ADMIN)
        VALUES (?, ?, ?, ?)
      `;
      await run(sql, [defaultAdmin.USERNAME.toUpperCase(), defaultAdmin.NAME, passwordHash, defaultAdmin.IS_ADMIN ? 1 : 0]);
      globalSendLog("[SQLite] Atendente administrador padrão criado.", "info");
    } else {
      globalSendLog("[SQLite] Atendente administrador já existe.", "info");
    }
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao inicializar atendente padrão: ${error.message}`, "error");
    throw error;
  }
}

const sqliteAuthStore = { /* ... implementação existente ... */ };

async function updateWhatsappSessionStatus(sessionName, status, jid = null, lastQrCode = null, data = null) {
  try {
    const existingSession = await get("SELECT ID FROM WHATSAPP_SESSIONS WHERE SESSION_NAME = ?", [sessionName]);
    if (existingSession) {
      await run(
        "UPDATE WHATSAPP_SESSIONS SET STATUS = ?, JID = ?, LAST_QR_CODE = ?, DATA = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE SESSION_NAME = ?",
        [status, jid, lastQrCode, data ? JSON.stringify(data) : null, sessionName],
      );
    } else {
      await run(
        "INSERT INTO WHATSAPP_SESSIONS (SESSION_NAME, STATUS, JID, LAST_QR_CODE, DATA) VALUES (?, ?, ?, ?, ?)",
        [sessionName, status, jid, lastQrCode, data ? JSON.stringify(data) : null],
      );
    }
    globalSendLog(`[SQLite] Status da sessão WhatsApp '${sessionName}' atualizado para '${status}'. JID: ${jid}`, "info");
    return true;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao atualizar status da sessão WhatsApp '${sessionName}': ${error.message}`, "error");
    // Não relançar o erro aqui para permitir que o fluxo continue, mas o erro é logado.
    // Se a coluna JID não existe, a operação falhará. A função createTablesIfNotExists deve corrigir isso.
    return false;
  }
}

async function getWhatsappSession(sessionName) {
  try {
    const session = await get("SELECT * FROM WHATSAPP_SESSIONS WHERE SESSION_NAME = ?", [sessionName]);
    if (session && session.DATA) {
      try {
        session.DATA = JSON.parse(session.DATA);
      } catch (e) {
        globalSendLog(`[SQLite] Erro ao analisar JSON dos dados da sessão '${sessionName}': ${e.message}`, "warn");
        session.DATA = null; 
      }
    }
    return session;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar sessão WhatsApp '${sessionName}': ${error.message}`, "error");
    return null;
  }
}

async function getClientByWhatsappId(whatsappId) {
  try {
    return await get("SELECT * FROM CLIENTS WHERE WHATSAPP_ID = ?", [whatsappId]);
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar cliente por WhatsApp ID '${whatsappId}': ${error.message}`, "error");
    throw error;
  }
}

async function findOrCreateConversation(clientJid, clientName = null, clientProfilePic = null, clientPhone = null) {
  try {
    let client = await getClientByWhatsappId(clientJid);
    if (!client) {
      const insertClientResult = await run(
        "INSERT INTO CLIENTS (WHATSAPP_ID, NAME, PHONE, PROFILE_PIC, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [clientJid, clientName, clientPhone, clientProfilePic],
      );
      client = { ID: insertClientResult.lastID, WHATSAPP_ID: clientJid, NAME: clientName, PHONE: clientPhone, PROFILE_PIC: clientProfilePic };
      globalSendLog(`[SQLite] Novo cliente criado: ${clientName || clientJid}`, "info");
    } else {
      if ((clientName && client.NAME !== clientName) || (clientPhone && client.PHONE !== clientPhone) || (clientProfilePic && client.PROFILE_PIC !== clientProfilePic)) {
        await run("UPDATE CLIENTS SET NAME = ?, PHONE = ?, PROFILE_PIC = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?",
          [clientName || client.NAME, clientPhone || client.PHONE, clientProfilePic || client.PROFILE_PIC, client.ID]
        );
        globalSendLog(`[SQLite] Informações do cliente ${clientJid} atualizadas.`, "debug");
      }
    }

    let conversation = await get(
      "SELECT * FROM CONVERSATIONS WHERE CLIENT_ID = ? AND STATUS != 'closed' ORDER BY CREATED_AT DESC LIMIT 1",
      [client.ID],
    );

    if (conversation) {
      globalSendLog(`[SQLite] Conversa existente encontrada para cliente ${client.ID} (JID: ${clientJid}). ID da Conversa: ${conversation.ID}`, "debug");
      return { client, conversation, isNew: false };
    }

    const insertConversationResult = await run(
      "INSERT INTO CONVERSATIONS (CLIENT_ID, CLIENT_JID, STATUS, CREATED_AT, UPDATED_AT, LAST_MESSAGE_TIMESTAMP) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [client.ID, clientJid],
    );
    conversation = await get("SELECT * FROM CONVERSATIONS WHERE ID = ?", [insertConversationResult.lastID]);
    globalSendLog(`[SQLite] Nova conversa criada para cliente ${client.ID} (JID: ${clientJid}). ID da Conversa: ${conversation.ID}`, "info");
    return { client, conversation, isNew: true };

  } catch (error) {
    globalSendLog(`[SQLite] Erro em findOrCreateConversation para ${clientJid}: ${error.message}`, "error");
    throw error;
  }
}


async function saveMessage(messageData) {
  const {
    conversationId,
    baileys_msg_id,
    senderType,
    senderId,
    messageType,
    content,
    mediaUrl = null,
    timestamp, 
  } = messageData;

  const sql = `
    INSERT INTO MESSAGES (
      CONVERSATION_ID, BAILEYS_MSG_ID, SENDER_TYPE, SENDER_ID,
      MESSAGE_TYPE, CONTENT, MEDIA_URL, TIMESTAMP,
      READ_BY_CLIENT, READ_BY_AGENT
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const readByClient = senderType === "AGENT" || senderType === "SYSTEM" ? 0 : 1;
  const readByAgent = senderType === "CLIENT" ? 0 : 1;
  const messageTimestamp = timestamp || new Date().toISOString();

  try {
    const result = await run(sql, [
      conversationId, baileys_msg_id, senderType, senderId,
      messageType, content, mediaUrl, messageTimestamp,
      readByClient, readByAgent,
    ]);

    await run("UPDATE CONVERSATIONS SET LAST_MESSAGE_TIMESTAMP = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?", [messageTimestamp, conversationId]);
    if (senderType === 'CLIENT' && !readByAgent) {
        await run("UPDATE CONVERSATIONS SET UNREAD_MESSAGES = UNREAD_MESSAGES + 1 WHERE ID = ?", [conversationId]);
    }

    globalSendLog(`[SQLite] Mensagem salva. DB ID: ${result.lastID}, Baileys ID: ${baileys_msg_id}`, "debug");
    return { id: result.lastID, ...messageData, timestamp: messageTimestamp };
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao salvar mensagem (Baileys ID: ${baileys_msg_id}): ${error.message}`, "error");
    if (error.message.includes("UNIQUE constraint failed: MESSAGES.BAILEYS_MSG_ID")) {
        globalSendLog(`[SQLite] Tentativa de salvar mensagem duplicada (Baileys ID: ${baileys_msg_id}). Ignorando.`, "warn");
        return await get("SELECT * FROM MESSAGES WHERE BAILEYS_MSG_ID = ?", [baileys_msg_id]); 
    }
    throw error;
  }
}

async function getConversationHistory(conversationId, limit = 100, offset = 0) {
  const sql = `
    SELECT m.*, 
           c.NAME as CLIENT_NAME, 
           c.PHONE as CLIENT_PHONE, 
           c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
           a.NAME as AGENT_NAME, 
           a.USERNAME as AGENT_USERNAME
    FROM MESSAGES m
    LEFT JOIN CONVERSATIONS conv ON m.CONVERSATION_ID = conv.ID
    LEFT JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    LEFT JOIN ATTENDANTS a ON (m.SENDER_TYPE = 'AGENT' AND m.SENDER_ID = a.USERNAME) 
    WHERE m.CONVERSATION_ID = ?
    ORDER BY m.TIMESTAMP ASC
    LIMIT ? OFFSET ?
  `;
  try {
    return await all(sql, [conversationId, limit, offset]);
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar histórico da conversa ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function getConversationsForAttendant(attendantUsername, tabType = "active", searchTerm = null) {
  globalSendLog(`[SQLite] Buscando conversas para atendente ${attendantUsername}, aba: ${tabType}, busca: ${searchTerm || 'Nenhuma'}`, 'debug');
  
  const attendant = await getAttendantByUsername(attendantUsername);
  if (!attendant) {
      globalSendLog(`[SQLite] Atendente ${attendantUsername} não encontrado ao buscar conversas.`, "warn");
      return [];
  }
  const attendantId = attendant.ID;

  let sql = `
    SELECT
      conv.ID,
      conv.CLIENT_ID, -- Esta coluna deve existir na tabela CONVERSATIONS
      conv.CLIENT_JID,
      conv.ATTENDANT_ID,
      conv.ATTENDANT_USERNAME,
      conv.STATUS,
      conv.SECTOR,
      conv.CREATED_AT,
      conv.UPDATED_AT,
      conv.CLOSED_AT,
      conv.LAST_MESSAGE_TIMESTAMP,
      conv.UNREAD_MESSAGES,
      c.NAME as CLIENT_NAME,
      c.PHONE as CLIENT_PHONE,
      c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
      c.PROFILE_PIC as CLIENT_PROFILE_PIC,
      att.NAME as ATTENDANT_NAME_ASSIGNED,
      (SELECT CONTENT FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE,
      (SELECT MESSAGE_TYPE FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_TYPE,
      (SELECT STRFTIME('%Y-%m-%dT%H:%M:%fZ', m.TIMESTAMP) FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_TIME_FORMATTED
    FROM CONVERSATIONS conv
    JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    LEFT JOIN ATTENDANTS att ON conv.ATTENDANT_ID = att.ID
    WHERE
  `;

  const params = [];
  const conditions = [];

  if (tabType === 'active') {
    conditions.push("( (conv.STATUS = 'pending' AND conv.ATTENDANT_ID IS NULL) OR (conv.STATUS = 'active' AND conv.ATTENDANT_ID = ?) )");
    params.push(attendantId);
  } else if (tabType === 'closed') {
    conditions.push("conv.STATUS = 'closed' AND conv.ATTENDANT_ID = ?");
    params.push(attendantId);
  } else { 
    conditions.push("( (conv.STATUS = 'pending' AND conv.ATTENDANT_ID IS NULL) OR conv.ATTENDANT_ID = ? )");
    params.push(attendantId);
  }

  if (searchTerm) {
    conditions.push("(UPPER(c.NAME) LIKE UPPER(?) OR c.WHATSAPP_ID LIKE ? OR UPPER(conv.SECTOR) LIKE UPPER(?))");
    params.push(`%${searchTerm}%`);
    params.push(`%${searchTerm}%`);
    params.push(`%${searchTerm}%`);
  }

  if (conditions.length > 0) {
    sql += conditions.join(" AND ");
  } else {
    sql += " 1=1 "; 
  }
  sql += ` ORDER BY conv.LAST_MESSAGE_TIMESTAMP DESC`;

  try {
    const conversations = await all(sql, params);
    return conversations.map(conv => ({
        ...conv,
        LAST_MESSAGE_TIME: conv.LAST_MESSAGE_TIME_FORMATTED || conv.LAST_MESSAGE_TIMESTAMP, 
    }));
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar conversas para atendente ${attendantUsername}: ${error.message}\nQuery: ${sql}\nParams: ${JSON.stringify(params)}`, "error");
    throw error; 
  }
}


async function assignConversationToAttendant(conversationId, attendantId, attendantUsername) {
  const sql = `
    UPDATE CONVERSATIONS
    SET ATTENDANT_ID = ?, ATTENDANT_USERNAME = ?, STATUS = 'active', UPDATED_AT = CURRENT_TIMESTAMP, UNREAD_MESSAGES = 0
    WHERE ID = ? AND (STATUS = 'pending' OR (STATUS = 'active' AND (ATTENDANT_ID IS NULL OR ATTENDANT_ID != ?)))
  `; 
  try {
    const result = await run(sql, [attendantId, attendantUsername, conversationId, attendantId]);
    if (result.changes > 0) {
        globalSendLog(`[SQLite] Conversa ID ${conversationId} atribuída ao atendente ${attendantUsername} (ID: ${attendantId})`, "info");
        return await getConversationById(conversationId); 
    }
    globalSendLog(`[SQLite] Conversa ID ${conversationId} não pôde ser atribuída (talvez já atribuída ou status inválido).`, "warn");
    return null;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao atribuir conversa ID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function closeConversation(conversationId, attendantId) { 
  const sql = `
    UPDATE CONVERSATIONS
    SET STATUS = 'closed', CLOSED_AT = CURRENT_TIMESTAMP, UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID = ? AND ATTENDANT_ID = ? AND STATUS = 'active'
  `;
  try {
    const result = await run(sql, [conversationId, attendantId]);
    if (result.changes > 0) {
        globalSendLog(`[SQLite] Conversa ID ${conversationId} encerrada pelo atendente ID ${attendantId}`, "info");
        return await getConversationById(conversationId); 
    }
    globalSendLog(`[SQLite] Conversa ID ${conversationId} não pôde ser encerrada (não ativa ou não pertence ao atendente ID ${attendantId}).`, "warn");
    return null;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao encerrar conversa ID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function markMessagesAsReadByAgent(conversationId, attendantId) { 
  const updateMessagesSql = `
    UPDATE MESSAGES
    SET READ_BY_AGENT = 1
    WHERE CONVERSATION_ID = ? AND SENDER_TYPE = 'CLIENT' AND READ_BY_AGENT = 0
  `;
  const updateConversationSql = `
    UPDATE CONVERSATIONS
    SET UNREAD_MESSAGES = 0, UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID = ? AND ATTENDANT_ID = ? 
  `; 
  try {
    const messageChanges = await run(updateMessagesSql, [conversationId]);
    await run(updateConversationSql, [conversationId, attendantId]);
    if (messageChanges.changes > 0) {
      globalSendLog(`[SQLite] ${messageChanges.changes} mensagens marcadas como lidas pelo agente na conversa ${conversationId}. Contagem de não lidas zerada.`, "debug");
    }
    return messageChanges.changes;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao marcar mensagens como lidas (conv ID ${conversationId}): ${error.message}`, "error");
    throw error;
  }
}

async function getAllAutoResponses() { 
    const sql = "SELECT * FROM AUTO_RESPONSES ORDER BY PRIORITY DESC, RESPONSE_KEY ASC";
    try { return await all(sql); } catch (e) { globalSendLog(`[SQLite] Erro getAllAutoResponses: ${e.message}`, "error"); throw e; }
}
async function getAutoResponseById(id) { 
    const sql = "SELECT * FROM AUTO_RESPONSES WHERE ID = ?";
    try { return await get(sql, [id]); } catch (e) { globalSendLog(`[SQLite] Erro getAutoResponseById ${id}: ${e.message}`, "error"); throw e; }
}
async function createAutoResponse(data) { 
    const { response_key, response_name, pattern, response_text, active = 1, priority = 0, start_time = "00:00", end_time = "23:59", allowed_days = "1,2,3,4,5,6,0" } = data;
    const sql = "INSERT INTO AUTO_RESPONSES (RESPONSE_KEY, RESPONSE_NAME, PATTERN, RESPONSE_TEXT, ACTIVE, PRIORITY, START_TIME, END_TIME, ALLOWED_DAYS) VALUES (?,?,?,?,?,?,?,?,?)";
    try { return await run(sql, [response_key, response_name, pattern, response_text, active ? 1:0, priority, start_time, end_time, allowed_days]); } catch (e) { globalSendLog(`[SQLite] Erro createAutoResponse: ${e.message}`, "error"); throw e; }
}
async function updateAutoResponse(id, data) { 
    const { response_key, response_name, pattern, response_text, active, priority, start_time, end_time, allowed_days } = data;
    const sql = "UPDATE AUTO_RESPONSES SET RESPONSE_KEY=?, RESPONSE_NAME=?, PATTERN=?, RESPONSE_TEXT=?, ACTIVE=?, PRIORITY=?, START_TIME=?, END_TIME=?, ALLOWED_DAYS=?, UPDATED_AT=CURRENT_TIMESTAMP WHERE ID=?";
    try { return await run(sql, [response_key, response_name, pattern, response_text, active ? 1:0, priority, start_time, end_time, allowed_days, id]); } catch (e) { globalSendLog(`[SQLite] Erro updateAutoResponse ${id}: ${e.message}`, "error"); throw e; }
}
async function deleteAutoResponse(id) { 
    const sql = "DELETE FROM AUTO_RESPONSES WHERE ID = ?";
    try { return await run(sql, [id]); } catch (e) { globalSendLog(`[SQLite] Erro deleteAutoResponse ${id}: ${e.message}`, "error"); throw e; }
}
async function getAllAttendants() { 
    const sql = "SELECT ID, USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM ATTENDANTS ORDER BY NAME ASC";
    try { 
        const attendants = await all(sql);
        return attendants.map(att => ({...att, IS_ADMIN: att.IS_ADMIN === 1, SECTOR: att.SECTOR ? att.SECTOR.split(',').map(s=>s.trim()) : [] }));
    } catch (e) { globalSendLog(`[SQLite] Erro getAllAttendants: ${e.message}`, "error"); throw e; }
}
async function updateAttendant(id, data) { 
    const { USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER, PASSWORD_HASH } = data;
    const sectorString = Array.isArray(SECTOR) ? SECTOR.join(',') : (SECTOR || null);
    let sql, params;
    if (PASSWORD_HASH) {
        sql = "UPDATE ATTENDANTS SET USERNAME=?, NAME=?, IS_ADMIN=?, SECTOR=?, DIRECT_CONTACT_NUMBER=?, PASSWORD_HASH=? WHERE ID=?";
        params = [USERNAME.toUpperCase(), NAME, IS_ADMIN ? 1:0, sectorString, DIRECT_CONTACT_NUMBER || null, PASSWORD_HASH, id];
    } else {
        sql = "UPDATE ATTENDANTS SET USERNAME=?, NAME=?, IS_ADMIN=?, SECTOR=?, DIRECT_CONTACT_NUMBER=? WHERE ID=?";
        params = [USERNAME.toUpperCase(), NAME, IS_ADMIN ? 1:0, sectorString, DIRECT_CONTACT_NUMBER || null, id];
    }
    try { return await run(sql, params); } catch (e) { globalSendLog(`[SQLite] Erro updateAttendant ${id}: ${e.message}`, "error"); throw e; }
}
async function deleteAttendant(id) { 
    const sql = "DELETE FROM ATTENDANTS WHERE ID = ?";
    try { return await run(sql, [id]); } catch (e) { globalSendLog(`[SQLite] Erro deleteAttendant ${id}: ${e.message}`, "error"); throw e; }
}
async function getAllSectors() { 
    const sql = "SELECT * FROM SECTORS ORDER BY SECTOR_NAME ASC";
    try { return await all(sql); } catch (e) { globalSendLog(`[SQLite] Erro getAllSectors: ${e.message}`, "error"); throw e; }
}
async function createSector(data) { 
    const { sector_key, sector_name, description, active = 1 } = data;
    const sql = "INSERT INTO SECTORS (SECTOR_KEY, SECTOR_NAME, DESCRIPTION, ACTIVE) VALUES (?,?,?,?)";
    try { return await run(sql, [sector_key, sector_name, description, active ? 1:0]); } catch (e) { globalSendLog(`[SQLite] Erro createSector: ${e.message}`, "error"); throw e; }
}
async function getAllConfigs() { 
    const sql = "SELECT * FROM SYSTEM_CONFIG ORDER BY CONFIG_KEY ASC";
    try { return await all(sql); } catch (e) { globalSendLog(`[SQLite] Erro getAllConfigs: ${e.message}`, "error"); throw e; }
}
async function getConfigByKey(key) { 
    const sql = "SELECT * FROM SYSTEM_CONFIG WHERE CONFIG_KEY = ?";
    try { return await get(sql, [key]); } catch (e) { globalSendLog(`[SQLite] Erro getConfigByKey ${key}: ${e.message}`, "error"); throw e; }
}
async function setConfig(key, value, type = "string", description = null) { 
    const sql = "INSERT INTO SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, CONFIG_TYPE, CONFIG_DESCRIPTION, UPDATED_AT) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(CONFIG_KEY) DO UPDATE SET CONFIG_VALUE=excluded.CONFIG_VALUE, CONFIG_TYPE=excluded.CONFIG_TYPE, CONFIG_DESCRIPTION=excluded.CONFIG_DESCRIPTION, UPDATED_AT=CURRENT_TIMESTAMP";
    try { return await run(sql, [key, value, type, description]); } catch (e) { globalSendLog(`[SQLite] Erro setConfig ${key}: ${e.message}`, "error"); throw e; }
}
async function initializeDefaultConfigs() { 
    globalSendLog("[SQLite] Verificando e inicializando configurações padrão...", "info");
    const defaultConfigs = [
        { key: "bot_active", value: "true", type: "boolean", description: "Ativa/desativa o robô de respostas automáticas" },
        { key: "bot_response_delay", value: "1500", type: "number", description: "Delay em milissegundos antes de enviar resposta automática" },
        { key: "bot_working_days", value: "1,2,3,4,5", type: "string", description: "Dias da semana em que o robô está ativo (0=Domingo, 1=Segunda, etc)"},
        { key: "bot_working_hours_start", value: "08:00", type: "string", description: "Horário de início do funcionamento do robô" },
        { key: "bot_working_hours_end", value: "18:00", type: "string", description: "Horário de término do funcionamento do robô" },
        { key: "bot_out_of_hours_message", value: "Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Por favor, retorne durante nosso horário comercial.", type: "string", description: "Mensagem enviada fora do horário de funcionamento" },
        { key: "enable_sound_notifications", value: "true", type: "boolean", description: "Ativa/desativa notificações sonoras para novas mensagens"},
        { key: "notification_sound", value: "default", type: "string", description: "Som de notificação para novas mensagens (default, bell, chime)"},
    ];
    try {
        await executeTransaction(async (transactionDb) => {
            for (const config of defaultConfigs) {
                const existingConfig = await new Promise((resolve, reject) => {
                    transactionDb.get("SELECT CONFIG_KEY FROM SYSTEM_CONFIG WHERE CONFIG_KEY = ?", [config.key], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });
                if (!existingConfig) {
                    globalSendLog(`[SQLite] Criando configuração padrão: ${config.key}`, "info");
                    await new Promise((resolve, reject) => {
                        transactionDb.run("INSERT INTO SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, CONFIG_TYPE, CONFIG_DESCRIPTION) VALUES (?, ?, ?, ?)",
                            [config.key, config.value, config.type, config.description], function(err) {
                                if (err) return reject(err);
                                resolve({ lastID: this.lastID, changes: this.changes });
                            }
                        );
                    });
                } else {
                    globalSendLog(`[SQLite] Configuração ${config.key} já existe.`, "debug");
                }
            }
        });
        globalSendLog("[SQLite] Inicialização de configurações padrão concluída.", "info");
    } catch (error) {
        globalSendLog(`[SQLite] Erro durante a inicialização de configurações padrão: ${error.message}`, "error");
        throw error;
    }
}

async function getConversationById(conversationId) {
  const sql = `
    SELECT conv.*, 
           c.NAME as CLIENT_NAME, 
           c.PHONE as CLIENT_PHONE, 
           c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
           c.PROFILE_PIC as CLIENT_PROFILE_PIC,
           att.NAME as ATTENDANT_NAME_ASSIGNED
    FROM CONVERSATIONS conv
    JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    LEFT JOIN ATTENDANTS att ON conv.ATTENDANT_ID = att.ID
    WHERE conv.ID = ?
  `;
  try {
    return await get(sql, [conversationId]);
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao buscar conversa ID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function transferConversationToSector(conversationId, sectorKey, fromAgentId) {
  try {
    const sector = await get("SELECT * FROM SECTORS WHERE SECTOR_KEY = ?", [sectorKey]);
    if (!sector) {
      globalSendLog(`[SQLite] Setor KEY ${sectorKey} não encontrado para transferência`, "error");
      return false;
    }
    const transferRecord = JSON.stringify({
      timestamp: new Date().toISOString(),
      fromAgentId: fromAgentId,
      toSectorKey: sectorKey,
      toSectorName: sector.SECTOR_NAME,
    });
    const sql = `
      UPDATE CONVERSATIONS SET
        ATTENDANT_ID = NULL,
        ATTENDANT_USERNAME = NULL,
        STATUS = 'pending', 
        SECTOR = ?,
        TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE ',' END || ?,
        UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?
    `;
    await run(sql, [sector.SECTOR_NAME, transferRecord, conversationId]);
    globalSendLog(`[SQLite] Conversa ID ${conversationId} transferida para o setor ${sector.SECTOR_NAME}`, "info");
    return true;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao transferir conversa para setor: ${error.message}`, "error");
    return false;
  }
}

async function transferConversationToAttendant(conversationId, targetAttendantId, fromAgentId) {
  try {
    const targetAttendant = await getAttendantById(targetAttendantId);
    if (!targetAttendant) {
      globalSendLog(`[SQLite] Atendente ID ${targetAttendantId} não encontrado para transferência`, "error");
      return false;
    }
    const transferRecord = JSON.stringify({
      timestamp: new Date().toISOString(),
      fromAgentId: fromAgentId,
      toAgentId: targetAttendantId,
      toAgentName: targetAttendant.NAME,
    });
    const sql = `
      UPDATE CONVERSATIONS SET
        ATTENDANT_ID = ?,
        ATTENDANT_USERNAME = ?,
        STATUS = 'active', 
        SECTOR = ?, 
        TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE ',' END || ?,
        UPDATED_AT = CURRENT_TIMESTAMP
      WHERE ID = ?
    `;
    const targetSector = targetAttendant.SECTOR && targetAttendant.SECTOR.length > 0 ? targetAttendant.SECTOR[0] : null; 
    await run(sql, [targetAttendantId, targetAttendant.USERNAME, targetSector, transferRecord, conversationId]);
    globalSendLog(`[SQLite] Conversa ID ${conversationId} transferida para o atendente ${targetAttendant.NAME}`, "info");
    return true;
  } catch (error) {
    globalSendLog(`[SQLite] Erro ao transferir conversa para atendente: ${error.message}`, "error");
    return false;
  }
}

module.exports = {
  setLogger, connect, close, createTablesIfNotExists, get, all, run, executeTransaction,
  getAttendantByUsername, getAttendantById, initializeDefaultAttendants, sqliteAuthStore,
  updateWhatsappSessionStatus, getWhatsappSession, getClientByWhatsappId, findOrCreateConversation,
  saveMessage, getConversationHistory, getConversationsForAttendant, assignConversationToAttendant,
  closeConversation, markMessagesAsReadByAgent, getAllAutoResponses, getAutoResponseById,
  createAutoResponse, updateAutoResponse, deleteAutoResponse, getAllAttendants, updateAttendant,
  deleteAttendant, getAllSectors, createSector, getAllConfigs, getConfigByKey, setConfig,
  initializeDefaultConfigs, getConversationById, transferConversationToSector, transferConversationToAttendant,
};
