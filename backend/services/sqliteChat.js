// backend/services/sqliteChat.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const dbConfig = require("../config/dbConfigSqlite");

let logger = console;
let db = null; 
let sqliteAdminServiceInstance = null; 

function setLogger(loggerFunction) {
  logger = loggerFunction;
}

function setAdminService(adminService) {
    sqliteAdminServiceInstance = adminService;
    log("sqliteAdminService injetado no sqliteChatService.", "debug");
}

function log(message, level = "info", service = "SQLite-Chat") {
  if (logger && typeof logger === "function") {
    logger(`[${service}] ${message}`, level);
  } else {
    console.log(`[${level.toUpperCase()}] [${service}] ${message}`);
  }
}

async function connect() { 
  return new Promise((resolve, reject) => {
    if (db && db.open) {
      log("Usando conexão existente.", "debug");
      resolve(db);
      return;
    }
    const dbPath = dbConfig.chatDbPath; 
    log(`Tentando conectar ao chatDbPath: ${dbPath}`, "debug"); 

    if (!dbPath || typeof dbPath !== 'string') { 
        const errMsg = `Caminho para chatDbPath inválido ou não definido. Recebido: ${dbPath}`;
        log(errMsg, "error");
        return reject(new Error(errMsg));
    }
    const dbDir = path.dirname(dbPath);
    try {
        if (!fs.existsSync(dbDir)) {
            log(`Criando diretório para chat DB: ${dbDir}`, "info");
            fs.mkdirSync(dbDir, { recursive: true });
        }
    } catch (mkdirError) {
        log(`Erro ao criar diretório ${dbDir}: ${mkdirError.message}`, "error");
        return reject(mkdirError);
    }

    db = new sqlite3.Database(dbPath, async (err) => { // Tornar callback async
      if (err) {
        log(`Erro ao conectar a ${dbPath}: ${err.message}`, "error");
        return reject(err);
      }
      log(`Conectado a ${dbPath}`, "info");
      try {
        await new Promise((res, rej) => db.run("PRAGMA journal_mode=WAL;", e => e ? rej(e) : res()));
        log("PRAGMA journal_mode=WAL configurado.", "debug");

        await new Promise((res, rej) => db.run("PRAGMA foreign_keys = ON;", e => e ? rej(e) : res()));
        log("PRAGMA foreign_keys habilitado.", "debug");
        
        await new Promise((res, rej) => db.run("PRAGMA busy_timeout = 7500;", e => e ? rej(e) : res())); // 7.5 segundos
        log("PRAGMA busy_timeout definido para 7500ms.", "debug");
        
        resolve(db);
      } catch (pragmaErr) {
        log(`Erro ao configurar PRAGMAs para ${dbPath}: ${pragmaErr.message}`, "error");
        reject(pragmaErr);
      }
    });
  });
}

async function close() {
  return new Promise((resolve, reject) => {
    if (!db) { resolve(); return; }
    db.close(err => {
      if (err) { log(`Erro ao fechar conexão: ${err.message}`, "error"); reject(err); return; }
      log("Conexão fechada.", "info");
      db = null;
      resolve();
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (chat)"));
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (chat)"));
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (chat)"));
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
async function columnExists(tableName, columnName) {
    const columns = await allQuery(`PRAGMA table_info(${tableName})`);
    return columns.some(col => col.name === columnName);
}
async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
        try {
            await runQuery(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
            log(`Coluna '${columnName}' adicionada à tabela '${tableName}'.`, 'info');
        } catch (error) {
            if (!error.message.includes("duplicate column name")) {
                 log(`Erro ao adicionar coluna '${columnName}' à tabela '${tableName}': ${error.message}`, 'error');
                 throw error; 
            } else {
                 log(`Aviso: Tentativa de adicionar coluna duplicada '${columnName}' à tabela '${tableName}'. Ignorando.`, 'warn');
            }
        }
    }
}

async function createTablesIfNotExists() {
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS CLIENTS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, WHATSAPP_ID TEXT NOT NULL UNIQUE, NAME TEXT,
      PHONE TEXT, CPF_ID TEXT, PROFILE_PIC TEXT, CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
  const createConversationsTable = `
    CREATE TABLE IF NOT EXISTS CONVERSATIONS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, CLIENT_ID INTEGER NOT NULL, CLIENT_JID TEXT, 
      USER_ID INTEGER, USER_USERNAME TEXT, 
      STATUS TEXT DEFAULT 'pending' NOT NULL, 
      SECTOR TEXT, TRANSFER_HISTORY TEXT, CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP, CLOSED_AT DATETIME,
      LAST_MESSAGE_TIMESTAMP DATETIME, UNREAD_MESSAGES INTEGER DEFAULT 0, 
      FOREIGN KEY (CLIENT_ID) REFERENCES CLIENTS(ID) ON DELETE CASCADE
    );`;
  const createMessagesTable = `
    CREATE TABLE IF NOT EXISTS MESSAGES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, CONVERSATION_ID INTEGER NOT NULL, MESSAGE_PLATFORM_ID TEXT UNIQUE, 
      SENDER_TYPE TEXT NOT NULL, SENDER_ID TEXT NOT NULL, MESSAGE_TYPE TEXT NOT NULL, 
      CONTENT TEXT NOT NULL, MEDIA_URL TEXT, TIMESTAMP DATETIME DEFAULT CURRENT_TIMESTAMP,
      READ_BY_CLIENT INTEGER DEFAULT 0 NOT NULL, READ_BY_USER INTEGER DEFAULT 0 NOT NULL,
      FOREIGN KEY (CONVERSATION_ID) REFERENCES CONVERSATIONS(ID) ON DELETE CASCADE
    );`;

  await runQuery(createClientsTable); log("Tabela CLIENTS verificada/criada.", "info");
  await addColumnIfNotExists('CLIENTS', 'CPF_ID', 'TEXT');
  await addColumnIfNotExists('CLIENTS', 'PHONE', 'TEXT'); 
  await addColumnIfNotExists('CLIENTS', 'PROFILE_PIC', 'TEXT'); 
  
  await runQuery(createConversationsTable); log("Tabela CONVERSATIONS verificada/criada.", "info");
  await addColumnIfNotExists('CONVERSATIONS', 'CLIENT_ID', 'INTEGER NOT NULL REFERENCES CLIENTS(ID) ON DELETE CASCADE');
  await addColumnIfNotExists('CONVERSATIONS', 'CLIENT_JID', 'TEXT');
  await addColumnIfNotExists('CONVERSATIONS', 'LAST_MESSAGE_TIMESTAMP', 'DATETIME');
  await addColumnIfNotExists('CONVERSATIONS', 'UNREAD_MESSAGES', 'INTEGER DEFAULT 0');
  await addColumnIfNotExists('CONVERSATIONS', 'USER_ID', 'INTEGER'); 
  await addColumnIfNotExists('CONVERSATIONS', 'USER_USERNAME', 'TEXT'); 
  
  await runQuery(createMessagesTable); log("Tabela MESSAGES verificada/criada.", "info");
  await addColumnIfNotExists('MESSAGES', 'MESSAGE_PLATFORM_ID', 'TEXT UNIQUE');
  await addColumnIfNotExists('MESSAGES', 'READ_BY_USER', 'INTEGER DEFAULT 0 NOT NULL'); 
}

async function getClientByWhatsappId(whatsappId) { 
  try { return await getQuery("SELECT * FROM CLIENTS WHERE WHATSAPP_ID = ?", [whatsappId]); } 
  catch (error) { log(`Erro ao buscar cliente por WhatsApp ID '${whatsappId}': ${error.message}`, "error"); throw error; }
}

async function findOrCreateConversation(clientJid, clientName = null, clientProfilePic = null, clientPhone = null, clientCpfId = null) { 
  try {
    let client = await getClientByWhatsappId(clientJid);
    if (!client) {
      const insertClientResult = await runQuery(
        "INSERT INTO CLIENTS (WHATSAPP_ID, NAME, PHONE, CPF_ID, PROFILE_PIC, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [clientJid, clientName, clientPhone, clientCpfId, clientProfilePic]
      );
      client = { ID: insertClientResult.lastID, WHATSAPP_ID: clientJid, NAME: clientName, PHONE: clientPhone, CPF_ID: clientCpfId, PROFILE_PIC: clientProfilePic };
      log(`Novo cliente criado: ${clientName || clientJid}`, "info");
    } else {
      if ((clientName && client.NAME !== clientName) || (clientPhone && client.PHONE !== clientPhone) || 
          (clientProfilePic && client.PROFILE_PIC !== clientProfilePic) || (clientCpfId && client.CPF_ID !== clientCpfId)) {
        await runQuery("UPDATE CLIENTS SET NAME = ?, PHONE = ?, CPF_ID = ?, PROFILE_PIC = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?",
          [clientName || client.NAME, clientPhone || client.PHONE, clientCpfId || client.CPF_ID, clientProfilePic || client.PROFILE_PIC, client.ID]
        );
        log(`Informações do cliente ${clientJid} atualizadas.`, "debug");
      }
    }

    let conversation = await getQuery(
      "SELECT * FROM CONVERSATIONS WHERE CLIENT_ID = ? AND STATUS != 'closed' ORDER BY CREATED_AT DESC LIMIT 1",
      [client.ID]
    );

    if (conversation) {
      log(`Conversa existente encontrada para cliente ${client.ID} (JID: ${clientJid}). ID da Conversa: ${conversation.ID}`, "debug");
      return { client, conversation, isNew: false };
    }

    const insertConversationResult = await runQuery(
      "INSERT INTO CONVERSATIONS (CLIENT_ID, CLIENT_JID, STATUS, CREATED_AT, UPDATED_AT, LAST_MESSAGE_TIMESTAMP) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [client.ID, clientJid]
    );
    conversation = await getQuery("SELECT * FROM CONVERSATIONS WHERE ID = ?", [insertConversationResult.lastID]);
    log(`Nova conversa criada para cliente ${client.ID} (JID: ${clientJid}). ID da Conversa: ${conversation.ID}`, "info");
    return { client, conversation, isNew: true };

  } catch (error) {
    log(`Erro em findOrCreateConversation para ${clientJid}: ${error.message}`, "error");
    throw error;
  }
}

async function saveMessage(messageData) { 
  const { conversationId, message_platform_id, senderType, senderId, messageType, content, mediaUrl = null, timestamp } = messageData;
  if (typeof conversationId === 'undefined' || conversationId === null) {
    log(`ERRO FATAL: Tentativa de salvar mensagem sem conversationId. Dados: ${JSON.stringify(messageData)}`, "error");
    throw new Error("conversationId não pode ser nulo ao salvar mensagem.");
  }
  const sql = `INSERT INTO MESSAGES (CONVERSATION_ID, MESSAGE_PLATFORM_ID, SENDER_TYPE, SENDER_ID, MESSAGE_TYPE, CONTENT, MEDIA_URL, TIMESTAMP, READ_BY_CLIENT, READ_BY_USER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const readByClient = senderType === "AGENT" || senderType === "SYSTEM" || senderType === "BOT" ? 0 : 1;
  const readByUser = senderType === "CLIENT" ? 0 : 1;
  const messageTimestamp = timestamp || new Date().toISOString();
  try {
    const result = await runQuery(sql, [conversationId, message_platform_id, senderType, senderId, messageType, content, mediaUrl, messageTimestamp, readByClient, readByUser]);
    await runQuery("UPDATE CONVERSATIONS SET LAST_MESSAGE_TIMESTAMP = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?", [messageTimestamp, conversationId]);
    if (senderType === 'CLIENT' && !readByUser) { 
        await runQuery("UPDATE CONVERSATIONS SET UNREAD_MESSAGES = UNREAD_MESSAGES + 1 WHERE ID = ?", [conversationId]);
    }
    log(`Mensagem salva. DB ID: ${result.lastID}, Platform ID: ${message_platform_id}`, "debug");
    return { id: result.lastID, ...messageData, timestamp: messageTimestamp };
  } catch (error) {
    log(`Erro ao salvar mensagem (Platform ID: ${message_platform_id}, ConvID: ${conversationId}): ${error.message}`, "error");
    if (error.message.includes("UNIQUE constraint failed: MESSAGES.MESSAGE_PLATFORM_ID")) {
        log(`Tentativa de salvar mensagem duplicada (Platform ID: ${message_platform_id}). Ignorando.`, "warn");
        return await getQuery("SELECT * FROM MESSAGES WHERE MESSAGE_PLATFORM_ID = ?", [message_platform_id]); 
    }
    throw error;
  }
}

async function getConversationHistory(conversationId, limit = 100, offset = 0) { 
  const sql = `
    SELECT m.*, c.NAME as CLIENT_NAME, c.PHONE as CLIENT_PHONE, c.WHATSAPP_ID as CLIENT_WHATSAPP_ID
    FROM MESSAGES m
    LEFT JOIN CONVERSATIONS conv ON m.CONVERSATION_ID = conv.ID
    LEFT JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    WHERE m.CONVERSATION_ID = ?
    ORDER BY m.TIMESTAMP ASC
    LIMIT ? OFFSET ?
  `;
  try {
    const messages = await allQuery(sql, [conversationId, limit, offset]);
    if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
        for (let msg of messages) {
            if (msg.SENDER_TYPE === 'AGENT' && msg.SENDER_ID) { 
                const user = await sqliteAdminServiceInstance.getUserByUsername(msg.SENDER_ID);
                if (user) msg.USER_NAME = user.NAME; 
            }
        }
    }
    return messages;
  } catch (error) {
    log(`Erro ao buscar histórico da conversa ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function getConversationsForUser(userUsername, tabType = "active", searchTerm = null) { 
  log(`Buscando conversas para usuário ${userUsername}, aba: ${tabType}, busca: ${searchTerm || 'Nenhuma'}`, 'debug');
  
  let numericUserId = null;
  if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
      const user = await sqliteAdminServiceInstance.getUserByUsername(userUsername);
      if (!user) {
          log(`Usuário ${userUsername} não encontrado ao buscar conversas.`, "warn");
          return [];
      }
      numericUserId = user.ID;
  } else {
      log(`sqliteAdminServiceInstance não configurado ou getUserByUsername não é função. Não é possível buscar ID numérico para ${userUsername}.`, "warn");
      return [];
  }

  let sql = `
    SELECT
      conv.ID, conv.CLIENT_ID, conv.CLIENT_JID, conv.USER_ID, conv.USER_USERNAME,
      conv.STATUS, conv.SECTOR, conv.CREATED_AT, conv.UPDATED_AT, conv.CLOSED_AT,
      conv.LAST_MESSAGE_TIMESTAMP, conv.UNREAD_MESSAGES,
      c.NAME as CLIENT_NAME, c.PHONE as CLIENT_PHONE, c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
      c.PROFILE_PIC as CLIENT_PROFILE_PIC, 
      conv.USER_USERNAME as USER_NAME_ASSIGNED, 
      (SELECT CONTENT FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE,
      (SELECT MESSAGE_TYPE FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_TYPE,
      (SELECT STRFTIME('%Y-%m-%dT%H:%M:%fZ', m.TIMESTAMP) FROM MESSAGES m WHERE m.CONVERSATION_ID = conv.ID ORDER BY m.TIMESTAMP DESC LIMIT 1) as LAST_MESSAGE_TIME_FORMATTED
    FROM CONVERSATIONS conv
    JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    WHERE
  `;

  const params = [];
  const conditions = [];

  if (tabType === 'active') {
    conditions.push("( (conv.STATUS = 'pending' AND conv.USER_ID IS NULL) OR (conv.STATUS = 'active' AND conv.USER_ID = ?) )");
    params.push(numericUserId); 
  } else if (tabType === 'closed') {
    conditions.push("conv.STATUS = 'closed' AND conv.USER_ID = ?");
    params.push(numericUserId); 
  } else { 
    conditions.push("( (conv.STATUS = 'pending' AND conv.USER_ID IS NULL) OR conv.USER_ID = ? )");
    params.push(numericUserId); 
  }

  if (searchTerm) {
    conditions.push("(UPPER(c.NAME) LIKE UPPER(?) OR c.WHATSAPP_ID LIKE ? OR UPPER(conv.SECTOR) LIKE UPPER(?))");
    params.push(`%${searchTerm}%`); params.push(`%${searchTerm}%`); params.push(`%${searchTerm}%`);
  }

  sql += conditions.length > 0 ? conditions.join(" AND ") : " 1=1 ";
  sql += ` ORDER BY conv.LAST_MESSAGE_TIMESTAMP DESC`;

  try {
    const conversations = await allQuery(sql, params);
    if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserById === 'function') {
        for (let conv of conversations) {
            if (conv.USER_ID) {
                const assignedUser = await sqliteAdminServiceInstance.getUserById(conv.USER_ID);
                if (assignedUser) conv.USER_NAME_ASSIGNED = assignedUser.NAME;
            }
        }
    }
    return conversations.map(conv => ({
        ...conv, 
        LAST_MESSAGE_TIME: conv.LAST_MESSAGE_TIME_FORMATTED || conv.LAST_MESSAGE_TIMESTAMP, 
    }));
  } catch (error) {
    log(`Erro ao buscar conversas para ${userUsername} (ID: ${numericUserId}): ${error.message}\nQuery: ${sql}\nParams: ${JSON.stringify(params)}`, "error");
    throw error; 
  }
}

async function assignConversationToUser(conversationId, numericUserId, userUsername) { 
  log(`Tentando atribuir conversa ID ${conversationId} ao usuário ID ${numericUserId} (Username: ${userUsername})`, 'debug');
  const sql = `
    UPDATE CONVERSATIONS
    SET USER_ID = ?, USER_USERNAME = ?, STATUS = 'active', UPDATED_AT = CURRENT_TIMESTAMP, UNREAD_MESSAGES = 0
    WHERE ID = ? AND (STATUS = 'pending' OR USER_ID IS NULL OR (USER_ID != ? AND STATUS = 'active') )
  `; 
  try {
    const result = await runQuery(sql, [numericUserId, userUsername, conversationId, numericUserId]);
    if (result.changes > 0) {
        log(`Conversa ID ${conversationId} atribuída ao usuário ${userUsername} (ID: ${numericUserId})`, "info");
        return await getConversationById(conversationId); 
    }
    
    const currentConv = await getConversationById(conversationId);
    if (currentConv && currentConv.USER_ID === numericUserId && currentConv.STATUS === 'active') {
        log(`Conversa ID ${conversationId} já estava atribuída ao usuário ${userUsername} e ativa. Retornando dados atuais.`, "info");
        return currentConv; 
    }
    log(`Conversa ID ${conversationId} não pôde ser atribuída ao usuário ${userUsername} (ID: ${numericUserId}). Changes: ${result.changes}. Status atual: ${currentConv?.STATUS}, Usuário atual: ${currentConv?.USER_ID}`, "warn");
    return null;
  } catch (error) {
    log(`Erro ao atribuir conversa ID ${conversationId} ao usuário ${userUsername}: ${error.message}`, "error");
    throw error;
  }
}

async function closeConversation(conversationId, numericUserId) { 
  log(`Tentando fechar conversa ID ${conversationId} pelo usuário ID ${numericUserId}`, 'debug');
  const sql = `
    UPDATE CONVERSATIONS
    SET STATUS = 'closed', CLOSED_AT = CURRENT_TIMESTAMP, UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID = ? AND USER_ID = ? AND STATUS = 'active'
  `;
  try {
    const result = await runQuery(sql, [conversationId, numericUserId]);
    if (result.changes > 0) {
        log(`Conversa ID ${conversationId} encerrada pelo usuário ID ${numericUserId}`, "info");
        return await getConversationById(conversationId); 
    }
    log(`Conversa ID ${conversationId} não pôde ser encerrada (não ativa ou não pertence ao usuário ID ${numericUserId}).`, "warn");
    return null;
  } catch (error) {
    log(`Erro ao encerrar conversa ID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function markMessagesAsReadByUser(conversationId, numericUserId) { 
  log(`Marcando mensagens como lidas para conv ID ${conversationId} pelo usuário ID ${numericUserId}`, 'debug');
  const updateMessagesSql = `
    UPDATE MESSAGES
    SET READ_BY_USER = 1 
    WHERE CONVERSATION_ID = ? AND SENDER_TYPE = 'CLIENT' AND READ_BY_USER = 0
  `;
  const updateConversationSql = `
    UPDATE CONVERSATIONS
    SET UNREAD_MESSAGES = 0, UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID = ? AND USER_ID = ? 
  `; 
  try {
    const messageChanges = await runQuery(updateMessagesSql, [conversationId]);
    const conv = await getQuery("SELECT USER_ID FROM CONVERSATIONS WHERE ID = ?", [conversationId]);
    if (conv && conv.USER_ID === numericUserId) {
        await runQuery(updateConversationSql, [conversationId, numericUserId]);
    } else if (conv) {
        log(`Usuário ${numericUserId} tentou marcar mensagens como lidas para conversa ${conversationId} que pertence a ${conv.USER_ID}. Mensagens marcadas, mas contador de não lidas da conversa não foi zerado globalmente por este usuário.`, "warn");
    }

    if (messageChanges.changes > 0) {
      log(`${messageChanges.changes} mensagens marcadas como lidas pelo usuário na conversa ${conversationId}.`, "debug");
    }
    return messageChanges.changes;
  } catch (error) {
    log(`Erro ao marcar mensagens como lidas (conv ID ${conversationId}): ${error.message}`, "error");
    throw error;
  }
}

async function getConversationById(conversationId) {
  const sql = `
    SELECT conv.*, 
           c.NAME as CLIENT_NAME, c.PHONE as CLIENT_PHONE, c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
           c.PROFILE_PIC as CLIENT_PROFILE_PIC
    FROM CONVERSATIONS conv
    JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    WHERE conv.ID = ?
  `;
  try {
    const conversation = await getQuery(sql, [conversationId]);
    if (conversation && conversation.USER_ID && sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserById === 'function') {
        const user = await sqliteAdminServiceInstance.getUserById(conversation.USER_ID);
        if (user) {
            conversation.USER_NAME_ASSIGNED = user.NAME;
            if(!conversation.USER_USERNAME) conversation.USER_USERNAME = user.USERNAME;
        } else {
            log(`Usuário ID ${conversation.USER_ID} não encontrado no serviço admin para conversa ${conversationId}.`, "warn");
        }
    } else if (conversation && conversation.USER_ID) {
        log(`sqliteAdminServiceInstance não disponível para buscar nome do usuário para conversa ${conversationId}.`, "warn");
    }
    return conversation;
  } catch (error) {
    log(`Erro ao buscar conversa ID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function transferConversationToSector(conversationId, sectorKey, fromUserId) { 
    try {
        if (!sqliteAdminServiceInstance || typeof sqliteAdminServiceInstance.getSectorByKey !== 'function') { 
            log(`sqliteAdminServiceInstance não disponível para buscar setor ${sectorKey}.`, "error");
            return false;
        }
        const sector = await sqliteAdminServiceInstance.getSectorByKey(sectorKey);
        if (!sector) {
          log(`Setor KEY ${sectorKey} não encontrado para transferência`, "error");
          return false;
        }
        const transferRecord = JSON.stringify({
          timestamp: new Date().toISOString(),
          fromUserId: fromUserId, 
          toSectorKey: sectorKey,
          toSectorName: sector.SECTOR_NAME,
        });
        const sql = `
          UPDATE CONVERSATIONS SET
            USER_ID = NULL, USER_USERNAME = NULL, STATUS = 'pending', 
            SECTOR = ?,
            TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE ',' END || ?,
            UPDATED_AT = CURRENT_TIMESTAMP
          WHERE ID = ?
        `;
        await runQuery(sql, [sector.SECTOR_NAME, transferRecord, conversationId]);
        log(`Conversa ID ${conversationId} transferida para o setor ${sector.SECTOR_NAME}`, "info");
        return true;
    } catch (error) {
        log(`Erro ao transferir conversa para setor: ${error.message}`, "error");
        return false;
    }
}
async function transferConversationToUser(conversationId, targetUserId, fromUserId) { 
    try {
        if (!sqliteAdminServiceInstance || typeof sqliteAdminServiceInstance.getUserById !== 'function') {
            log(`sqliteAdminServiceInstance não disponível para buscar usuário ${targetUserId}.`, "error");
            return false;
        }
        const targetUser = await sqliteAdminServiceInstance.getUserById(targetUserId); 
        if (!targetUser) {
          log(`Usuário ID ${targetUserId} não encontrado para transferência`, "error");
          return false;
        }
        const transferRecord = JSON.stringify({
          timestamp: new Date().toISOString(),
          fromUserId: fromUserId,
          toUserId: targetUserId,
          toUserName: targetUser.NAME,
        });
        const sql = `
          UPDATE CONVERSATIONS SET
            USER_ID = ?, USER_USERNAME = ?, STATUS = 'active', 
            SECTOR = ?, 
            TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE ',' END || ?,
            UPDATED_AT = CURRENT_TIMESTAMP
          WHERE ID = ?
        `;
        const targetSector = targetUser.SECTOR && targetUser.SECTOR.length > 0 ? targetUser.SECTOR[0] : null; 
        await runQuery(sql, [targetUserId, targetUser.USERNAME, targetSector, transferRecord, conversationId]);
        log(`Conversa ID ${conversationId} transferida para o usuário ${targetUser.NAME}`, "info");
        return true;
    } catch (error) {
        log(`Erro ao transferir conversa para usuário: ${error.message}`, "error");
        return false;
    }
}


module.exports = {
  setLogger,
  setAdminService, 
  connect,
  close,
  createTablesIfNotExists,
  getClientByWhatsappId,
  findOrCreateConversation,
  saveMessage,
  getConversationHistory,
  getConversationsForUser,
  assignConversationToUser,
  closeConversation,
  markMessagesAsReadByUser,
  getConversationById,
  transferConversationToSector,
  transferConversationToUser,
};
