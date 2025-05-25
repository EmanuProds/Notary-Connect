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
      resolve(db);
      return;
    }
    const dbPath = dbConfig.chatDbPath; 
    if (!dbPath || typeof dbPath !== 'string') { 
        const errMsg = `Caminho para chatDbPath inválido ou não definido. Recebido: ${dbPath}`;
        log(errMsg, "error");
        return reject(new Error(errMsg));
    }
    const dbDir = path.dirname(dbPath);
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    } catch (mkdirError) {
        log(`Erro ao criar diretório ${dbDir}: ${mkdirError.message}`, "error");
        return reject(mkdirError);
    }
    db = new sqlite3.Database(dbPath, async (err) => { 
      if (err) {
        log(`Erro ao conectar a ${dbPath}: ${err.message}`, "error");
        return reject(err);
      }
      log(`Conectado a ${dbPath}`, "info");
      try {
        await new Promise((res, rej) => db.run("PRAGMA journal_mode=WAL;", e => e ? rej(e) : res()));
        await new Promise((res, rej) => db.run("PRAGMA foreign_keys = ON;", e => e ? rej(e) : res()));
        await new Promise((res, rej) => db.run("PRAGMA busy_timeout = 7500;", e => e ? rej(e) : res())); 
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
      USER_ID INTEGER, USER_USERNAME TEXT, -- Este deve ser o USERNAME/ID do agente
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
  await runQuery(createConversationsTable); log("Tabela CONVERSATIONS verificada/criada.", "info");
  await runQuery(createMessagesTable); log("Tabela MESSAGES verificada/criada.", "info");
}

async function getClientByWhatsappId(whatsappId) { 
  try { return await getQuery("SELECT * FROM CLIENTS WHERE WHATSAPP_ID = ?", [whatsappId]); } 
  catch (error) { log(`Erro ao buscar cliente por WhatsApp ID '${whatsappId}': ${error.message}`, "error"); throw error; }
}

async function findOrCreateConversation(clientJid, clientName = null, clientProfilePic = null, clientPhone = null, clientCpfId = null) { 
  log(`[findOrCreateConversation] Iniciando para JID: ${clientJid}, Nome: ${clientName}`, "debug");
  try {
    let client = await getClientByWhatsappId(clientJid);
    if (!client) {
      log(`[findOrCreateConversation] Cliente não encontrado para JID ${clientJid}. Criando novo...`, "debug");
      const insertClientResult = await runQuery(
        "INSERT INTO CLIENTS (WHATSAPP_ID, NAME, PHONE, CPF_ID, PROFILE_PIC, CREATED_AT, UPDATED_AT) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        [clientJid, clientName, clientPhone, clientCpfId, clientProfilePic]
      );
      client = { ID: insertClientResult.lastID, WHATSAPP_ID: clientJid, NAME: clientName, PHONE: clientPhone, CPF_ID: clientCpfId, PROFILE_PIC: clientProfilePic };
      log(`[findOrCreateConversation] Novo cliente criado: ID ${client.ID}, Nome: ${clientName || clientJid}`, "info");
    } else {
      log(`[findOrCreateConversation] Cliente encontrado: ID ${client.ID}, Nome: ${client.NAME}`, "debug");
      if ((clientName && client.NAME !== clientName) || (clientPhone && client.PHONE !== clientPhone) || 
          (clientProfilePic && client.PROFILE_PIC !== clientProfilePic) || (clientCpfId && client.CPF_ID !== clientCpfId)) {
        await runQuery("UPDATE CLIENTS SET NAME = ?, PHONE = ?, CPF_ID = ?, PROFILE_PIC = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = ?",
          [clientName || client.NAME, clientPhone || client.PHONE, clientCpfId || client.CPF_ID, clientProfilePic || client.PROFILE_PIC, client.ID]
        );
        log(`[findOrCreateConversation] Informações do cliente ${clientJid} atualizadas.`, "debug");
      }
    }

    let conversation = await getQuery(
      "SELECT * FROM CONVERSATIONS WHERE CLIENT_ID = ? AND STATUS != 'closed' ORDER BY CREATED_AT DESC LIMIT 1",
      [client.ID]
    );

    if (conversation) {
      log(`[findOrCreateConversation] Conversa existente (não fechada) encontrada para cliente ${client.ID}. ID da Conversa: ${conversation.ID}, Status: ${conversation.STATUS}, Atendente: ${conversation.USER_USERNAME}`, "debug");
      return { client, conversation, isNew: false };
    }

    log(`[findOrCreateConversation] Nenhuma conversa ativa/pendente encontrada para cliente ${client.ID}. Criando nova conversa...`, "debug");
    const insertConversationResult = await runQuery(
      "INSERT INTO CONVERSATIONS (CLIENT_ID, CLIENT_JID, STATUS, CREATED_AT, UPDATED_AT, LAST_MESSAGE_TIMESTAMP) VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      [client.ID, clientJid]
    );
    conversation = await getQuery("SELECT * FROM CONVERSATIONS WHERE ID = ?", [insertConversationResult.lastID]);
    log(`[findOrCreateConversation] Nova conversa criada para cliente ${client.ID}. ID da Conversa: ${conversation.ID}`, "info");
    return { client, conversation, isNew: true };

  } catch (error) {
    log(`Erro em findOrCreateConversation para ${clientJid}: ${error.message}`, "error");
    throw error;
  }
}

async function saveMessage(messageData) { 
  const { conversationId, message_platform_id, senderType, senderId, messageType, content, mediaUrl = null, timestamp } = messageData;
  log(`[saveMessage] Salvando mensagem para ConvID ${conversationId}. PlatformID: ${message_platform_id}, Sender: ${senderType}/${senderId}, Tipo: ${messageType}`, "debug");
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
    log(`[saveMessage] Mensagem salva no DB. ID DB: ${result.lastID}, Platform ID: ${message_platform_id}. Atualizando conversa...`, "debug");
    
    let unreadIncrementSql = "";
    if (senderType === 'CLIENT') { 
        unreadIncrementSql = ", UNREAD_MESSAGES = UNREAD_MESSAGES + 1";
    }
    await runQuery(`UPDATE CONVERSATIONS SET LAST_MESSAGE_TIMESTAMP = ?, UPDATED_AT = CURRENT_TIMESTAMP ${unreadIncrementSql} WHERE ID = ?`, [messageTimestamp, conversationId]);
    log(`[saveMessage] Conversa ${conversationId} atualizada. Incremento não lidas (se cliente): ${unreadIncrementSql !== ""}`, "debug");

    return { id: result.lastID, ...messageData, timestamp: messageTimestamp, READ_BY_USER: readByUser, READ_BY_CLIENT: readByClient };
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
  log(`[getConversationHistory] Buscando histórico para ConvID ${conversationId}, Limite: ${limit}, Offset: ${offset}`, "debug");
  // CORREÇÃO: Removido o JOIN com USERS. O nome do agente será buscado separadamente.
  const sql = `
    SELECT m.*, 
           c.NAME as CLIENT_NAME, c.PHONE as CLIENT_PHONE, c.WHATSAPP_ID as CLIENT_WHATSAPP_ID, c.PROFILE_PIC as CLIENT_PROFILE_PIC
    FROM MESSAGES m
    JOIN CONVERSATIONS conv ON m.CONVERSATION_ID = conv.ID
    JOIN CLIENTS c ON conv.CLIENT_ID = c.ID
    WHERE m.CONVERSATION_ID = ?
    ORDER BY m.TIMESTAMP ASC
    LIMIT ? OFFSET ?
  `;
  try {
    const messages = await allQuery(sql, [conversationId, limit, offset]);
    // Adicionar AGENT_NAME se SENDER_TYPE for 'AGENT'
    if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
      for (let msg of messages) {
        if (msg.SENDER_TYPE === 'AGENT' && msg.SENDER_ID) { // SENDER_ID deve ser o USERNAME do agente
          try {
            const agent = await sqliteAdminServiceInstance.getUserByUsername(msg.SENDER_ID);
            if (agent) {
              msg.AGENT_NAME = agent.NAME; // Adiciona o nome completo do agente
            } else {
              msg.AGENT_NAME = msg.SENDER_ID; // Fallback para username se não encontrar
            }
          } catch (userError) {
            log(`[getConversationHistory] Erro ao buscar nome do agente para SENDER_ID ${msg.SENDER_ID}: ${userError.message}`, "warn");
            msg.AGENT_NAME = msg.SENDER_ID; // Fallback
          }
        }
      }
    }
    log(`[getConversationHistory] Histórico para ConvID ${conversationId} recuperado (${messages.length} mensagens).`, "debug");
    return messages;
  } catch (error) {
    log(`Erro ao buscar histórico da conversa ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function getConversationsForUser(userUsername, tabType = "active", searchTerm = null) { 
  log(`[getConversationsForUser] Buscando conversas para usuário ${userUsername}, aba: ${tabType}, busca: ${searchTerm || 'Nenhuma'}`, 'debug');
  
  let numericUserId = null;
  let userSectors = []; 
  let userDetails = null;

  if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
      userDetails = await sqliteAdminServiceInstance.getUserByUsername(userUsername); 
      if (!userDetails) {
          log(`[getConversationsForUser] Usuário ${userUsername} não encontrado. Retornando lista vazia.`, "warn");
          return [];
      }
      numericUserId = userDetails.ID;
      userSectors = userDetails.SECTOR || []; 
      log(`[getConversationsForUser] Usuário ${userUsername} (ID: ${numericUserId}) encontrado. Setores (keys): ${userSectors.join(', ')}`, "debug");
  } else {
      log(`[getConversationsForUser] sqliteAdminServiceInstance não configurado ou getUserByUsername não é função. Não é possível buscar ID/setores para ${userUsername}.`, "warn");
      return [];
  }

  let sql = `
    SELECT
      conv.ID, conv.CLIENT_ID, conv.CLIENT_JID, conv.USER_ID, conv.USER_USERNAME,
      conv.STATUS, conv.SECTOR, conv.CREATED_AT, conv.UPDATED_AT, conv.CLOSED_AT,
      conv.LAST_MESSAGE_TIMESTAMP, conv.UNREAD_MESSAGES,
      c.NAME as CLIENT_NAME, c.PHONE as CLIENT_PHONE, c.WHATSAPP_ID as CLIENT_WHATSAPP_ID,
      c.PROFILE_PIC as CLIENT_PROFILE_PIC, 
      -- USER_USERNAME já é o username/ID do agente. O nome completo (USER_NAME_ASSIGNED) será adicionado depois.
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
    let pendingConditions = " (conv.STATUS = 'pending' AND conv.USER_ID IS NULL ";
    if (userSectors.length > 0) {
        const sectorNames = [];
        if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getSectorByKey === 'function') {
            for (const sectorKey of userSectors) {
                const sectorObj = await sqliteAdminServiceInstance.getSectorByKey(sectorKey);
                if (sectorObj) sectorNames.push(sectorObj.SECTOR_NAME);
            }
        }
        if (sectorNames.length > 0) {
            pendingConditions += ` AND (conv.SECTOR IN (${sectorNames.map(() => '?').join(',')}) OR conv.SECTOR IS NULL OR conv.SECTOR = '') `;
            params.push(...sectorNames);
        } else {
            pendingConditions += ` AND (conv.SECTOR IS NULL OR conv.SECTOR = '') `;
        }
    } else {
        pendingConditions += ` AND (conv.SECTOR IS NULL OR conv.SECTOR = '') `; 
    }
    pendingConditions += ") ";
    conditions.push(`( ${pendingConditions} OR (conv.STATUS = 'active' AND conv.USER_ID = ?) )`);
    params.push(numericUserId); 
  } else if (tabType === 'closed') {
    conditions.push("conv.STATUS = 'closed' AND conv.USER_ID = ?"); 
    params.push(numericUserId); 
  } else { 
    conditions.push("1=1"); 
  }

  if (searchTerm) {
    conditions.push("(UPPER(c.NAME) LIKE UPPER(?) OR c.WHATSAPP_ID LIKE ? OR UPPER(conv.SECTOR) LIKE UPPER(?))");
    params.push(`%${searchTerm}%`); params.push(`%${searchTerm}%`); params.push(`%${searchTerm}%`);
  }

  sql += conditions.length > 0 ? conditions.join(" AND ") : " 1=0 "; 
  sql += ` ORDER BY conv.LAST_MESSAGE_TIMESTAMP DESC`;

  log(`[getConversationsForUser] SQL: ${sql}`, "debug");
  log(`[getConversationsForUser] Parâmetros: ${JSON.stringify(params)}`, "debug");

  try {
    const conversations = await allQuery(sql, params);
    if (sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
        for (let conv of conversations) {
            if (conv.USER_USERNAME) { 
                const assignedUser = await sqliteAdminServiceInstance.getUserByUsername(conv.USER_USERNAME);
                if (assignedUser) {
                    conv.USER_NAME_ASSIGNED = assignedUser.NAME; 
                } else {
                    conv.USER_NAME_ASSIGNED = conv.USER_USERNAME; 
                }
            } else {
                conv.USER_NAME_ASSIGNED = null;
            }
        }
    }
    log(`[getConversationsForUser] Encontradas ${conversations.length} conversas para ${userUsername}.`, "debug");
    return conversations.map(conv => ({
        ...conv, 
        LAST_MESSAGE_TIME: conv.LAST_MESSAGE_TIME_FORMATTED || conv.LAST_MESSAGE_TIMESTAMP, 
    }));
  } catch (error) {
    log(`Erro ao buscar conversas para ${userUsername} (ID: ${numericUserId}): ${error.message}\nQuery: ${sql}\nParams: ${JSON.stringify(params)}`, "error");
    throw error; 
  }
}

// agentUsername é o USERNAME/ID do agente (ex: "LUCIENE")
async function assignConversationToUser(conversationId, numericAgentId, agentUsername) { 
  log(`[assignConversationToUser] Tentando atribuir ConvID ${conversationId} ao AgenteID ${numericAgentId} (Username: ${agentUsername})`, 'debug');
  // CORREÇÃO: Garantir que USER_USERNAME seja atualizado com agentUsername
  const sql = `
    UPDATE CONVERSATIONS
    SET USER_ID = ?, USER_USERNAME = ?, STATUS = 'active', UPDATED_AT = CURRENT_TIMESTAMP, UNREAD_MESSAGES = 0
    WHERE ID = ? AND (STATUS = 'pending' OR USER_ID IS NULL OR (USER_ID != ? AND STATUS = 'active') ) 
  `; 
  try {
    const result = await runQuery(sql, [numericAgentId, agentUsername, conversationId, numericAgentId]);
    if (result.changes > 0) {
        log(`[assignConversationToUser] ConvID ${conversationId} atribuída ao Agente ${agentUsername} (ID: ${numericAgentId})`, "info");
        return await getConversationById(conversationId); 
    }
    
    const currentConv = await getConversationById(conversationId);
    if (currentConv && currentConv.USER_ID === numericAgentId && currentConv.STATUS === 'active') {
        log(`[assignConversationToUser] ConvID ${conversationId} já estava atribuída ao Agente ${agentUsername} e ativa. Retornando dados atuais.`, "info");
        return currentConv; 
    }
    log(`[assignConversationToUser] ConvID ${conversationId} não pôde ser atribuída ao Agente ${agentUsername}. Changes: ${result.changes}. Status: ${currentConv?.STATUS}, Agente Atual: ${currentConv?.USER_USERNAME}`, "warn");
    return null;
  } catch (error) {
    log(`Erro ao atribuir ConvID ${conversationId} ao Agente ${agentUsername}: ${error.message}`, "error");
    throw error;
  }
}

async function closeConversation(conversationId, numericUserId) { 
  log(`[closeConversation] Tentando fechar ConvID ${conversationId} pelo UserID ${numericUserId}`, 'debug');
  const sql = `
    UPDATE CONVERSATIONS
    SET STATUS = 'closed', CLOSED_AT = CURRENT_TIMESTAMP, UPDATED_AT = CURRENT_TIMESTAMP
    WHERE ID = ? AND USER_ID = ? AND STATUS = 'active'
  `;
  try {
    const result = await runQuery(sql, [conversationId, numericUserId]);
    if (result.changes > 0) {
        log(`[closeConversation] ConvID ${conversationId} encerrada pelo UserID ${numericUserId}`, "info");
        return await getConversationById(conversationId); 
    }
    log(`[closeConversation] ConvID ${conversationId} não pôde ser encerrada (não ativa ou não pertence ao UserID ${numericUserId}).`, "warn");
    return null;
  } catch (error) {
    log(`Erro ao encerrar ConvID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function markMessagesAsReadByUser(conversationId, numericUserId) { 
  log(`[markMessagesAsReadByUser] Marcando mensagens como lidas para ConvID ${conversationId} pelo UserID ${numericUserId}`, 'debug');
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
        log(`[markMessagesAsReadByUser] Contador UNREAD_MESSAGES da ConvID ${conversationId} zerado.`, "debug");
    } else if (conv) {
        log(`[markMessagesAsReadByUser] UserID ${numericUserId} marcou mensagens como lidas para ConvID ${conversationId}, mas não é o dono (Dono: ${conv.USER_ID}). Contador UNREAD_MESSAGES da conversa não foi zerado globalmente.`, "warn");
    }

    if (messageChanges.changes > 0) {
      log(`[markMessagesAsReadByUser] ${messageChanges.changes} mensagens marcadas como lidas pelo usuário na ConvID ${conversationId}.`, "debug");
    }
    return messageChanges.changes;
  } catch (error) {
    log(`Erro ao marcar mensagens como lidas (ConvID ${conversationId}): ${error.message}`, "error");
    throw error;
  }
}

async function getConversationById(conversationId) {
  log(`[getConversationById] Buscando ConvID ${conversationId}`, "debug");
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
    if (conversation) {
        log(`[getConversationById] ConvID ${conversationId} encontrada. USER_ID: ${conversation.USER_ID}, USER_USERNAME: ${conversation.USER_USERNAME}`, "debug");
        // USER_USERNAME já é o username/ID do agente. O nome completo (USER_NAME_ASSIGNED) é buscado se necessário.
        if (conversation.USER_USERNAME && sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getUserByUsername === 'function') {
            const agentDetails = await sqliteAdminServiceInstance.getUserByUsername(conversation.USER_USERNAME);
            if (agentDetails) {
                conversation.USER_NAME_ASSIGNED = agentDetails.NAME; 
            } else {
                conversation.USER_NAME_ASSIGNED = conversation.USER_USERNAME; 
            }
        } else {
            conversation.USER_NAME_ASSIGNED = null;
        }
    } else {
        log(`[getConversationById] ConvID ${conversationId} não encontrada.`, "warn");
    }
    return conversation;
  } catch (error) {
    log(`Erro ao buscar ConvID ${conversationId}: ${error.message}`, "error");
    throw error;
  }
}

async function transferConversationToSector(conversationId, sectorKey, fromUserId) { 
    log(`[transferConversationToSector] Transferindo ConvID ${conversationId} para Setor Key ${sectorKey} (de UserID ${fromUserId})`, "debug");
    try {
        if (!sqliteAdminServiceInstance || typeof sqliteAdminServiceInstance.getSectorByKey !== 'function') { 
            log(`[transferConversationToSector] sqliteAdminServiceInstance não disponível para buscar setor ${sectorKey}.`, "error");
            return { success: false, message: "Serviço admin não disponível."};
        }
        const sector = await sqliteAdminServiceInstance.getSectorByKey(sectorKey);
        if (!sector) {
          log(`[transferConversationToSector] Setor KEY ${sectorKey} não encontrado para transferência`, "error");
          return { success: false, message: `Setor ${sectorKey} não encontrado.`};
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
            TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE x'0A' END || ?,
            UPDATED_AT = CURRENT_TIMESTAMP,
            UNREAD_MESSAGES = 1 
          WHERE ID = ?
        `;
        await runQuery(sql, [sector.SECTOR_NAME, transferRecord, conversationId]);
        log(`[transferConversationToSector] ConvID ${conversationId} transferida para o setor ${sector.SECTOR_NAME}`, "info");
        return { success: true, conversation: await getConversationById(conversationId) };
    } catch (error) {
        log(`Erro ao transferir conversa para setor: ${error.message}`, "error");
        return { success: false, message: error.message };
    }
}
async function transferConversationToUser(conversationId, targetAgentUsername, fromUserId) { 
    log(`[transferConversationToUser] Transferindo ConvID ${conversationId} para Agente Username ${targetAgentUsername} (de UserID ${fromUserId})`, "debug");
    try {
        if (!sqliteAdminServiceInstance || typeof sqliteAdminServiceInstance.getUserByUsername !== 'function') {
            log(`[transferConversationToUser] sqliteAdminServiceInstance não disponível para buscar usuário ${targetAgentUsername}.`, "error");
            return { success: false, message: "Serviço admin não disponível."};
        }
        const targetUser = await sqliteAdminServiceInstance.getUserByUsername(targetAgentUsername); 
        if (!targetUser) {
          log(`[transferConversationToUser] Agente Username ${targetAgentUsername} não encontrado para transferência`, "error");
          return { success: false, message: `Atendente ${targetAgentUsername} não encontrado.`};
        }
        const transferRecord = JSON.stringify({
          timestamp: new Date().toISOString(),
          fromUserId: fromUserId,
          toUserId: targetUser.ID,
          toUserName: targetUser.USERNAME, 
        });
        const sql = `
          UPDATE CONVERSATIONS SET
            USER_ID = ?, USER_USERNAME = ?, STATUS = 'active', 
            SECTOR = ?, 
            TRANSFER_HISTORY = IFNULL(TRANSFER_HISTORY, '') || CASE WHEN TRANSFER_HISTORY = '' THEN '' ELSE x'0A' END || ?,
            UPDATED_AT = CURRENT_TIMESTAMP,
            UNREAD_MESSAGES = 1 
          WHERE ID = ?
        `;
        const targetUserPrimarySectorKey = targetUser.SECTOR && targetUser.SECTOR.length > 0 ? targetUser.SECTOR[0] : null; 
        let targetSectorName = null;
        if (targetUserPrimarySectorKey && sqliteAdminServiceInstance && typeof sqliteAdminServiceInstance.getSectorByKey === 'function') {
            const sectorObj = await sqliteAdminServiceInstance.getSectorByKey(targetUserPrimarySectorKey);
            if (sectorObj) targetSectorName = sectorObj.SECTOR_NAME;
        }

        await runQuery(sql, [targetUser.ID, targetUser.USERNAME, targetSectorName, transferRecord, conversationId]);
        log(`[transferConversationToUser] ConvID ${conversationId} transferida para o agente ${targetUser.USERNAME}`, "info");
        return { success: true, conversation: await getConversationById(conversationId) };
    } catch (error) {
        log(`Erro ao transferir conversa para agente: ${error.message}`, "error");
        return { success: false, message: error.message };
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
  reopenConversation, // Adicionando a nova função
};

async function reopenConversation(conversationId, agentUsername, agentFullName) {
  log(`[SQLite-Chat] Tentando reabrir ConvID ${conversationId} para Agente ${agentUsername} (Nome: ${agentFullName})`, "debug");
  try {
    if (!sqliteAdminServiceInstance || typeof sqliteAdminServiceInstance.getUserByUsername !== 'function') {
        log(`[reopenConversation] sqliteAdminServiceInstance não disponível para buscar atendente ${agentUsername}.`, "error");
        return { success: false, error: "Serviço de administração de usuários não configurado." };
    }

    const attendant = await sqliteAdminServiceInstance.getUserByUsername(agentUsername);
    if (!attendant || !attendant.ID) {
      log(`[reopenConversation] Atendente ${agentUsername} não encontrado no banco de dados.`, "error");
      return { success: false, error: "Atendente não encontrado." };
    }
    const numericAgentId = attendant.ID;

    const sql = `
      UPDATE CONVERSATIONS
      SET STATUS = 'active',
          USER_ID = ?,
          USER_USERNAME = ?, 
          CLOSED_AT = NULL,
          UPDATED_AT = CURRENT_TIMESTAMP,
          LAST_MESSAGE_TIMESTAMP = CURRENT_TIMESTAMP, -- Para que a conversa vá para o topo
          UNREAD_MESSAGES = 0 -- Zera mensagens não lidas, já que o atendente está assumindo
      WHERE ID = ? AND STATUS = 'closed' 
    `;
    // Adicionamos "AND STATUS = 'closed'" para garantir que só reabrimos conversas realmente fechadas.

    const result = await runQuery(sql, [numericAgentId, agentUsername, conversationId]);

    if (result.changes > 0) {
      log(`[SQLite-Chat] ConvID ${conversationId} reaberta com sucesso no DB para Agente ${agentUsername}. Buscando detalhes...`, "info");
      const updatedConversationDetails = await getConversationById(conversationId); // Reutiliza a função existente
      if (updatedConversationDetails) {
        // O campo USER_NAME_ASSIGNED já é adicionado por getConversationById
        return { success: true, conversation: updatedConversationDetails };
      } else {
        log(`[SQLite-Chat] Falha ao buscar detalhes da ConvID ${conversationId} após reabertura.`, "error");
        return { success: false, error: "Conversa reaberta, mas falha ao buscar detalhes atualizados." };
      }
    } else {
      log(`[SQLite-Chat] Nenhuma conversa foi atualizada. ConvID ${conversationId} não encontrada, não estava fechada, ou já atribuída.`, "warn");
      const currentConv = await getConversationById(conversationId);
      if (currentConv && currentConv.STATUS !== 'closed') {
        return { success: false, error: `Conversa não está fechada (status atual: ${currentConv.STATUS}).` };
      }
      return { success: false, error: "Falha ao atualizar conversa no banco de dados ou conversa não encontrada/não estava fechada." };
    }
  } catch (error) {
    log(`[SQLite-Chat] Erro de banco de dados ao tentar reabrir ConvID ${conversationId}: ${error.message}`, "error");
    return { success: false, error: "Erro de banco de dados." };
  }
}

