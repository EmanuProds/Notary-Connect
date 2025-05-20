// backend/services/sqliteMain.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const dbConfig = require("../config/dbConfigSqlite");

let logger = console;
let db = null;

function setLogger(loggerFunction) {
  logger = loggerFunction;
}

function log(message, level = "info", service = "SQLite-Main") {
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
    const dbPath = dbConfig.mainDbPath;
    if (!dbPath || typeof dbPath !== 'string') {
        const errMsg = `Caminho para mainDbPath inválido ou não definido. Recebido: ${dbPath}`;
        log(errMsg, "error");
        return reject(new Error(errMsg));
    }
    const dbDir = path.dirname(dbPath);
    try {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
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
    if (!db) return reject(new Error("DB não conectado (main)"));
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (main)"));
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (main)"));
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
  const createConfigTable = `
    CREATE TABLE IF NOT EXISTS SYSTEM_CONFIG (
      CONFIG_KEY TEXT PRIMARY KEY, CONFIG_VALUE TEXT NOT NULL, CONFIG_TYPE TEXT NOT NULL, 
      CONFIG_DESCRIPTION TEXT, UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
  const createWhatsappSessionsTable = `
    CREATE TABLE IF NOT EXISTS WHATSAPP_SESSIONS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, SESSION_NAME TEXT NOT NULL UNIQUE, STATUS TEXT NOT NULL, 
      JID TEXT, LAST_QR_CODE TEXT, DATA TEXT, 
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP, UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;

  await runQuery(createConfigTable);
  log("Tabela SYSTEM_CONFIG verificada/criada.", "info");
  
  await runQuery(createWhatsappSessionsTable);
  log("Tabela WHATSAPP_SESSIONS verificada/criada.", "info");
  await addColumnIfNotExists('WHATSAPP_SESSIONS', 'JID', 'TEXT');
  await addColumnIfNotExists('WHATSAPP_SESSIONS', 'LAST_QR_CODE', 'TEXT');
}

async function getAllConfigs() { 
    const sql = "SELECT * FROM SYSTEM_CONFIG ORDER BY CONFIG_KEY ASC";
    try { 
        const configs = await allQuery(sql);
        return configs.map(config => {
            if (config.CONFIG_TYPE === 'boolean') config.CONFIG_VALUE = config.CONFIG_VALUE === 'true';
            else if (config.CONFIG_TYPE === 'number') config.CONFIG_VALUE = parseFloat(config.CONFIG_VALUE);
            return config;
        });
    } catch (e) { log(`Erro getAllConfigs: ${e.message}`, "error"); throw e; }
}

async function getConfigByKey(key) { 
    const sql = "SELECT * FROM SYSTEM_CONFIG WHERE CONFIG_KEY = ?";
    try { 
        const config = await getQuery(sql, [key]);
        if (config) {
            if (config.CONFIG_TYPE === 'boolean') config.CONFIG_VALUE = config.CONFIG_VALUE === 'true';
            else if (config.CONFIG_TYPE === 'number') config.CONFIG_VALUE = parseFloat(config.CONFIG_VALUE);
        }
        return config; 
    } catch (e) { log(`Erro getConfigByKey ${key}: ${e.message}`, "error"); throw e; }
}

async function setConfig(key, value, type = "string", description = null) { 
    const sql = "INSERT INTO SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, CONFIG_TYPE, CONFIG_DESCRIPTION, UPDATED_AT) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(CONFIG_KEY) DO UPDATE SET CONFIG_VALUE=excluded.CONFIG_VALUE, CONFIG_TYPE=excluded.CONFIG_TYPE, CONFIG_DESCRIPTION=excluded.CONFIG_DESCRIPTION, UPDATED_AT=CURRENT_TIMESTAMP";
    try { 
        const valueToStore = typeof value === 'boolean' ? String(value) : String(value); 
        return await runQuery(sql, [key, valueToStore, type, description]); 
    } catch (e) { log(`Erro setConfig ${key}: ${e.message}`, "error"); throw e; }
}

async function setMultipleConfigs(configs) {
  if (!Array.isArray(configs) || configs.length === 0) {
    log("Nenhuma configuração fornecida para setMultipleConfigs.", "warn");
    return { success: false, message: "Nenhuma configuração fornecida." };
  }
  if (!db) {
    log("Base de dados (main) não conectada para setMultipleConfigs.", "error");
    return { success: false, message: "Base de dados não conectada." };
  }

  const stmt = db.prepare("INSERT INTO SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, CONFIG_TYPE, CONFIG_DESCRIPTION, UPDATED_AT) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(CONFIG_KEY) DO UPDATE SET CONFIG_VALUE=excluded.CONFIG_VALUE, CONFIG_TYPE=excluded.CONFIG_TYPE, CONFIG_DESCRIPTION=excluded.CONFIG_DESCRIPTION, UPDATED_AT=CURRENT_TIMESTAMP");

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION", err => {
        if (err) {
          log(`Erro ao iniciar transação para setMultipleConfigs: ${err.message}`, "error");
          return reject(err);
        }
      });

      let errorOccurred = false;
      configs.forEach(config => {
        if (errorOccurred) return;
        const valueToStore = typeof config.value === 'boolean' ? String(config.value) : String(config.value);
        stmt.run(config.key, valueToStore, config.type, config.description, function(err) {
          if (err) {
            log(`Erro ao executar stmt para config ${config.key} em setMultipleConfigs: ${err.message}`, "error");
            errorOccurred = true;
          }
        });
      });

      stmt.finalize(finalizeErr => {
        if (finalizeErr) {
            log(`Erro ao finalizar statement em setMultipleConfigs: ${finalizeErr.message}`, "error");
        }
        if (errorOccurred) {
          db.run("ROLLBACK", rbErr => {
            if (rbErr) log(`Erro no ROLLBACK para setMultipleConfigs: ${rbErr.message}`, "error");
            reject(new Error("Falha ao salvar uma ou mais configurações."));
          });
        } else {
          db.run("COMMIT", commitErr => {
            if (commitErr) {
              log(`Erro no COMMIT para setMultipleConfigs: ${commitErr.message}`, "error");
              reject(commitErr);
            } else {
              log(`${configs.length} configurações salvas com sucesso em batch.`, "info");
              resolve({ success: true, message: "Configurações salvas com sucesso." });
            }
          });
        }
      });
    });
  });
}


async function initializeDefaultConfigs() { 
    log("Verificando e inicializando configurações padrão...", "info");
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
        await runQuery("BEGIN TRANSACTION");
        for (const config of defaultConfigs) {
            const existingConfig = await getQuery("SELECT CONFIG_KEY FROM SYSTEM_CONFIG WHERE CONFIG_KEY = ?", [config.key]);
            if (!existingConfig) {
                log(`Criando configuração padrão: ${config.key}`, "info");
                await runQuery("INSERT INTO SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, CONFIG_TYPE, CONFIG_DESCRIPTION) VALUES (?, ?, ?, ?)",
                        [config.key, config.value, config.type, config.description]);
            }
        }
        await runQuery("COMMIT");
        log("Inicialização de configurações padrão concluída.", "info");
    } catch (error) {
        log(`Erro durante a inicialização de configurações padrão: ${error.message}`, "error");
        await runQuery("ROLLBACK").catch(rbErr => log(`Erro no ROLLBACK: ${rbErr.message}`, "error"));
        throw error;
    }
}

async function updateWhatsappSessionStatus(sessionName, status, jid = null, lastQrCode = null, data = null) {
  try {
    const existingSession = await getQuery("SELECT ID FROM WHATSAPP_SESSIONS WHERE SESSION_NAME = ?", [sessionName]);
    if (existingSession) {
      await runQuery(
        "UPDATE WHATSAPP_SESSIONS SET STATUS = ?, JID = ?, LAST_QR_CODE = ?, DATA = ?, UPDATED_AT = CURRENT_TIMESTAMP WHERE SESSION_NAME = ?",
        [status, jid, lastQrCode, data ? JSON.stringify(data) : null, sessionName]
      );
    } else {
      await runQuery(
        "INSERT INTO WHATSAPP_SESSIONS (SESSION_NAME, STATUS, JID, LAST_QR_CODE, DATA) VALUES (?, ?, ?, ?, ?)",
        [sessionName, status, jid, lastQrCode, data ? JSON.stringify(data) : null]
      );
    }
    log(`Status da sessão WhatsApp '${sessionName}' atualizado para '${status}'. JID: ${jid}`, "info");
    return true;
  } catch (error) {
    log(`Erro ao atualizar status da sessão WhatsApp '${sessionName}': ${error.message}`, "error");
    return false;
  }
}

async function getWhatsappSession(sessionName) { 
  try {
    const session = await getQuery("SELECT * FROM WHATSAPP_SESSIONS WHERE SESSION_NAME = ?", [sessionName]);
    if (session && session.DATA) {
      try { session.DATA = JSON.parse(session.DATA); } 
      catch (e) { log(`Erro ao analisar JSON dos dados da sessão '${sessionName}': ${e.message}`, "warn"); session.DATA = null; }
    }
    return session;
  } catch (error) {
    log(`Erro ao buscar sessão WhatsApp '${sessionName}': ${error.message}`, "error");
    return null;
  }
}

module.exports = {
  setLogger,
  connect,
  close,
  createTablesIfNotExists,
  getAllConfigs,
  getConfigByKey,
  setConfig,
  setMultipleConfigs, 
  initializeDefaultConfigs,
  updateWhatsappSessionStatus,
  getWhatsappSession,
};
