// backend/config/dbConfigSqlite.js
const path = require('path');
const { app } = require('electron'); 
const fs = require('fs'); // Importar fs

// Função para obter o caminho de dados do usuário de forma segura
function getUserDataPath() {
    try {
        if (app && typeof app.getPath === 'function') {
            const userData = app.getPath('userData');
            if (userData && typeof userData === 'string') {
                // console.log(`[dbConfigSqlite] app.getPath('userData') retornou: ${userData}`);
                return userData;
            }
            console.warn("[dbConfigSqlite] app.getPath('userData') retornou um valor inválido ou não é uma string. Usando fallback. Valor recebido:", userData);
        } else if (app) {
            console.warn("[dbConfigSqlite] 'app.getPath' não é uma função (app pode não estar totalmente pronto?). Usando fallback.");
        } else {
             console.warn("[dbConfigSqlite] 'app' module not available. Falling back to local project directory for DB path.");
        }
    } catch (e) {
        console.warn("[dbConfigSqlite] Erro ao chamar app.getPath('userData'):", e, "Usando fallback.");
    }
    
    const fallbackPath = path.join(__dirname, '..', '..', 'dev_user_data_directory_fallback'); 
    console.log(`[dbConfigSqlite] Usando caminho de fallback para userData: ${fallbackPath}`);
    return fallbackPath;
}

const userDataPath = getUserDataPath();

const baseDbDir = path.join(userDataPath, 'Databases'); 

try {
    if (!fs.existsSync(baseDbDir)) {
        fs.mkdirSync(baseDbDir, { recursive: true });
        console.log(`[dbConfigSqlite] Diretório de bancos de dados criado em: ${baseDbDir}`);
    }
} catch (error) {
    console.error(`[dbConfigSqlite] Falha ao criar diretório de bancos de dados em ${baseDbDir}: ${error.message}`);
}

const mainDbPath = path.join(baseDbDir, 'ncMain.sqlite');
const adminDbPath = path.join(baseDbDir, 'ncAdmin.sqlite');
const chatDbPath = path.join(baseDbDir, 'ncChat.sqlite');

// Log para verificar os caminhos resolvidos ao carregar o módulo
console.log(`[dbConfigSqlite] Caminho ncMain.sqlite resolvido para: ${mainDbPath}`);
console.log(`[dbConfigSqlite] Caminho ncAdmin.sqlite resolvido para: ${adminDbPath}`);
console.log(`[dbConfigSqlite] Caminho ncChat.sqlite resolvido para: ${chatDbPath}`);

module.exports = {
    mainDbPath,
    adminDbPath,
    chatDbPath,
};
