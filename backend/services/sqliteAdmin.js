// backend/services/sqliteAdmin.js
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs"); 
const path = require("path");
const fs = require("fs");
const dbConfig = require("../config/dbConfigSqlite");

let logger = console;
let db = null; 

function setLogger(loggerFunction) {
  logger = loggerFunction;
}

function log(message, level = "info", service = "SQLite-Admin") {
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
    const dbPath = dbConfig.adminDbPath; 
    log(`Tentando conectar ao adminDbPath: ${dbPath}`, "debug");

    if (!dbPath || typeof dbPath !== 'string') {
        const errMsg = `Caminho para adminDbPath inválido ou não definido. Recebido: ${dbPath}`;
        log(errMsg, "error");
        return reject(new Error(errMsg));
    }

    const dbDir = path.dirname(dbPath);
    try {
        if (!fs.existsSync(dbDir)) {
            log(`Criando diretório para admin DB: ${dbDir}`, "info");
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
        
        await new Promise((res, rej) => db.run("PRAGMA busy_timeout = 10000;", e => e ? rej(e) : res())); // Aumentado para 10 segundos
        log("PRAGMA busy_timeout definido para 10000ms.", "debug");
        
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
    if (!db) return reject(new Error("DB não conectado (admin)"));
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (admin)"));
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB não conectado (admin)"));
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
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS USERS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, USERNAME TEXT NOT NULL UNIQUE, NAME TEXT NOT NULL,
      PASSWORD_HASH TEXT NOT NULL, IS_ADMIN INTEGER DEFAULT 0 NOT NULL, SECTOR TEXT,
      DIRECT_CONTACT_NUMBER TEXT, CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
  const createAutoResponsesTable = `
    CREATE TABLE IF NOT EXISTS AUTO_RESPONSES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, RESPONSE_KEY TEXT NOT NULL UNIQUE, RESPONSE_NAME TEXT NOT NULL,
      PATTERN TEXT NOT NULL, RESPONSE_TEXT TEXT NOT NULL, ACTIVE INTEGER DEFAULT 1 NOT NULL,
      PRIORITY INTEGER DEFAULT 0 NOT NULL, START_TIME TEXT, END_TIME TEXT, 
      ALLOWED_DAYS TEXT DEFAULT '0,1,2,3,4,5,6', 
      TYPING_DELAY_MS INTEGER DEFAULT 1000, RESPONSE_DELAY_MS INTEGER DEFAULT 500, 
      CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP, UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
  const createSectorsTable = `
    CREATE TABLE IF NOT EXISTS SECTORS (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, SECTOR_KEY TEXT NOT NULL UNIQUE, SECTOR_NAME TEXT NOT NULL,
      DESCRIPTION TEXT, ACTIVE INTEGER DEFAULT 1 NOT NULL
    );`;
  const createServicesTable = `
    CREATE TABLE IF NOT EXISTS SERVICES (
      ID INTEGER PRIMARY KEY AUTOINCREMENT, SERVICE_KEY TEXT NOT NULL UNIQUE, SERVICE_NAME TEXT NOT NULL,
      DESCRIPTION TEXT, PRICE REAL, SECTOR_ID INTEGER, ACTIVE INTEGER DEFAULT 1 NOT NULL,
      FOREIGN KEY (SECTOR_ID) REFERENCES SECTORS(ID) ON DELETE SET NULL
    );`;

  await runQuery(createUsersTable); log("Tabela USERS verificada/criada.", "info");
  
  await runQuery(createAutoResponsesTable); log("Tabela AUTO_RESPONSES verificada/criada.", "info");
  await addColumnIfNotExists('AUTO_RESPONSES', 'TYPING_DELAY_MS', 'INTEGER DEFAULT 1000');
  await addColumnIfNotExists('AUTO_RESPONSES', 'RESPONSE_DELAY_MS', 'INTEGER DEFAULT 500');
  
  await runQuery(createSectorsTable); log("Tabela SECTORS verificada/criada.", "info");
  await runQuery(createServicesTable); log("Tabela SERVICES verificada/criada.", "info");
}

// --- Funções de Usuários ---
async function getUserByUsername(username) {
  const sql = "SELECT * FROM USERS WHERE UPPER(USERNAME) = UPPER(?)";
  try {
    const user = await getQuery(sql, [username]);
    if (user) {
      user.IS_ADMIN = user.IS_ADMIN === 1;
      user.SECTOR = user.SECTOR ? user.SECTOR.split(",").map((s) => s.trim()) : [];
    }
    return user;
  } catch (error) {
    log(`Erro ao buscar usuário por username '${username}': ${error.message}`, "error");
    throw error;
  }
}
async function getUserById(id) {
  const sql = "SELECT ID, USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM USERS WHERE ID = ?";
  try {
    const user = await getQuery(sql, [id]);
    if (user) {
      user.IS_ADMIN = user.IS_ADMIN === 1;
      user.SECTOR = user.SECTOR ? user.SECTOR.split(",").map((s) => s.trim()) : [];
    }
    return user;
  } catch (error) {
    log(`Erro ao buscar usuário por ID '${id}': ${error.message}`, "error");
    throw error;
  }
}
async function initializeDefaultUsers() {
  const defaultAdmin = { USERNAME: "ADMIN", NAME: "Administrador", PASSWORD: "admin123", IS_ADMIN: true };
  try {
    const existingAdmin = await getUserByUsername(defaultAdmin.USERNAME);
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(defaultAdmin.PASSWORD, 10); 
      const sql = `INSERT INTO USERS (USERNAME, NAME, PASSWORD_HASH, IS_ADMIN) VALUES (?, ?, ?, ?)`;
      await runQuery(sql, [defaultAdmin.USERNAME.toUpperCase(), defaultAdmin.NAME, passwordHash, defaultAdmin.IS_ADMIN ? 1 : 0]);
      log("Usuário administrador padrão criado.", "info");
    }
  } catch (error) {
    log(`Erro ao inicializar usuário padrão: ${error.message}`, "error");
    throw error;
  }
}
async function getAllUsers() { 
    const sql = "SELECT ID, USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER FROM USERS ORDER BY NAME ASC";
    try { 
        const users = await allQuery(sql);
        return users.map(user => ({...user, IS_ADMIN: user.IS_ADMIN === 1, SECTOR: user.SECTOR ? user.SECTOR.split(',').map(s=>s.trim()) : [] }));
    } catch (e) { log(`Erro getAllUsers: ${e.message}`, "error"); throw e; }
}
async function createUser(userData) {
    const { USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER } = userData;
    const sectorString = Array.isArray(SECTOR) ? SECTOR.join(',') : (SECTOR || null);
    const sql = "INSERT INTO USERS (USERNAME, PASSWORD_HASH, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER) VALUES (?, ?, ?, ?, ?, ?)";
    const params = [ USERNAME.toUpperCase(), PASSWORD_HASH, NAME, IS_ADMIN ? 1 : 0, sectorString, DIRECT_CONTACT_NUMBER || null ];
    try { return await runQuery(sql, params); } 
    catch (error) { log(`Erro ao criar usuário ${USERNAME}: ${error.message}`, 'error'); throw error; }
}
async function updateUser(id, userData) { 
    const { USERNAME, NAME, IS_ADMIN, SECTOR, DIRECT_CONTACT_NUMBER, PASSWORD_HASH } = userData;
    const sectorString = Array.isArray(SECTOR) ? SECTOR.join(',') : (SECTOR || null);
    let sql, params;
    if (PASSWORD_HASH) { 
        sql = "UPDATE USERS SET USERNAME=?, NAME=?, IS_ADMIN=?, SECTOR=?, DIRECT_CONTACT_NUMBER=?, PASSWORD_HASH=? WHERE ID=?";
        params = [USERNAME.toUpperCase(), NAME, IS_ADMIN ? 1:0, sectorString, DIRECT_CONTACT_NUMBER || null, PASSWORD_HASH, id];
    } else {
        sql = "UPDATE USERS SET USERNAME=?, NAME=?, IS_ADMIN=?, SECTOR=?, DIRECT_CONTACT_NUMBER=? WHERE ID=?";
        params = [USERNAME.toUpperCase(), NAME, IS_ADMIN ? 1:0, sectorString, DIRECT_CONTACT_NUMBER || null, id];
    }
    try { 
        log(`[SQLite-Admin] Executando UPDATE para user ID ${id}. SQL: ${sql.substring(0,100)}...`, "debug");
        return await runQuery(sql, params); 
    } 
    catch (e) { log(`Erro updateUser ${id}: ${e.message}`, "error"); throw e; }
}
async function deleteUser(id) { 
    const sql = "DELETE FROM USERS WHERE ID = ?";
    try { return await runQuery(sql, [id]); } 
    catch (e) { log(`Erro deleteUser ${id}: ${e.message}`, "error"); throw e; }
}

// --- Funções de Respostas Automáticas ---
async function getAllAutoResponses() { 
    const sql = "SELECT * FROM AUTO_RESPONSES ORDER BY PRIORITY DESC, RESPONSE_KEY ASC";
    try { return await allQuery(sql); } 
    catch (e) { log(`Erro getAllAutoResponses: ${e.message}`, "error"); throw e; }
}
async function getAutoResponseById(id) { 
    const sql = "SELECT * FROM AUTO_RESPONSES WHERE ID = ?";
    try { return await getQuery(sql, [id]); } 
    catch (e) { log(`Erro getAutoResponseById ${id}: ${e.message}`, "error"); throw e; }
}
async function createAutoResponse(data) { 
    const { response_key, response_name, pattern, response_text, active = 1, priority = 0, start_time, end_time, allowed_days = "0,1,2,3,4,5,6", typing_delay_ms = 1000, response_delay_ms = 500 } = data;
    const sql = `INSERT INTO AUTO_RESPONSES (RESPONSE_KEY, RESPONSE_NAME, PATTERN, RESPONSE_TEXT, ACTIVE, PRIORITY, START_TIME, END_TIME, ALLOWED_DAYS, TYPING_DELAY_MS, RESPONSE_DELAY_MS) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    try { return await runQuery(sql, [response_key, response_name, pattern, response_text, active ? 1:0, priority, start_time || null, end_time || null, allowed_days, typing_delay_ms, response_delay_ms]); } 
    catch (e) { log(`Erro createAutoResponse: ${e.message}`, "error"); throw e; }
}
async function updateAutoResponse(id, data) { 
    const { response_key, response_name, pattern, response_text, active, priority, start_time, end_time, allowed_days, typing_delay_ms, response_delay_ms } = data;
    const sql = `UPDATE AUTO_RESPONSES SET RESPONSE_KEY=?, RESPONSE_NAME=?, PATTERN=?, RESPONSE_TEXT=?, ACTIVE=?, PRIORITY=?, START_TIME=?, END_TIME=?, ALLOWED_DAYS=?, TYPING_DELAY_MS=?, RESPONSE_DELAY_MS=?, UPDATED_AT=CURRENT_TIMESTAMP WHERE ID=?`;
    try { return await runQuery(sql, [response_key, response_name, pattern, response_text, active ? 1:0, priority, start_time || null, end_time || null, allowed_days, typing_delay_ms, response_delay_ms, id]); } 
    catch (e) { log(`Erro updateAutoResponse ${id}: ${e.message}`, "error"); throw e; }
}
async function deleteAutoResponse(id) { 
    const sql = "DELETE FROM AUTO_RESPONSES WHERE ID = ?";
    try { return await runQuery(sql, [id]); } 
    catch (e) { log(`Erro deleteAutoResponse ${id}: ${e.message}`, "error"); throw e; }
}

// --- Funções de Setores e Serviços ---
async function getAllSectors() { 
    const sql = "SELECT * FROM SECTORS ORDER BY SECTOR_NAME ASC";
    try { return await allQuery(sql); } 
    catch (e) { log(`Erro getAllSectors: ${e.message}`, "error"); throw e; }
}
async function createSector(data) { 
    const { sector_key, sector_name, description, active = 1 } = data;
    const sql = "INSERT INTO SECTORS (SECTOR_KEY, SECTOR_NAME, DESCRIPTION, ACTIVE) VALUES (?,?,?,?)";
    try { return await runQuery(sql, [sector_key, sector_name, description, active ? 1:0]); } 
    catch (e) { log(`Erro createSector: ${e.message}`, "error"); throw e; }
}
async function getSectorByKey(key) { 
    const sql = "SELECT * FROM SECTORS WHERE SECTOR_KEY = ?";
    try { return await getQuery(sql, [key]); }
    catch (e) { log(`Erro getSectorByKey ${key}: ${e.message}`, "error"); throw e; }
}
async function getAllServices() {
    const sql = "SELECT s.*, sec.SECTOR_NAME FROM SERVICES s LEFT JOIN SECTORS sec ON s.SECTOR_ID = sec.ID ORDER BY s.SERVICE_NAME ASC";
    try { return await allQuery(sql); }
    catch (e) { log(`Erro getAllServices: ${e.message}`, "error"); throw e; }
}
async function createService(data) {
    const { service_key, service_name, description, price, sector_id, active = 1 } = data;
    const sql = "INSERT INTO SERVICES (SERVICE_KEY, SERVICE_NAME, DESCRIPTION, PRICE, SECTOR_ID, ACTIVE) VALUES (?,?,?,?,?,?)";
    try { return await runQuery(sql, [service_key, service_name, description, price, sector_id, active ? 1:0]); }
    catch (e) { log(`Erro createService: ${e.message}`, "error"); throw e; }
}

module.exports = {
  setLogger,
  connect,
  close,
  createTablesIfNotExists,
  getUserByUsername, getUserById, initializeDefaultUsers, getAllUsers, createUser, updateUser, deleteUser,
  getAllAutoResponses, getAutoResponseById, createAutoResponse, updateAutoResponse, deleteAutoResponse,
  getAllSectors, createSector, getSectorByKey, getAllServices, createService,
};
