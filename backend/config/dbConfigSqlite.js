// backend/config/dbConfigSqlite.js
const path = require('path');
const fs = require('fs'); // Importar fs

/**
 * Obtém o caminho para o diretório de dados do usuário.
 * Prioriza variáveis de ambiente para modo servidor, depois o caminho do Electron,
 * e por último um fallback local.
 * @returns {string} O caminho para o diretório de dados do usuário.
 */
function getUserDataPath() {
    // Log inicial para indicar qual modo está sendo considerado
    // console.log(`[dbConfigSqlite] Verificando modo de execução. SERVER_MODE: ${process.env.SERVER_MODE}, NODE_ENV: ${process.env.NODE_ENV}`);

    // Prioridade 1: Modo Servidor explícito via variável de ambiente
    if (process.env.SERVER_MODE === 'true' || process.env.NODE_ENV === 'production_server') {
        const serverDataPath = process.env.NOTARY_CONNECT_DATA_PATH || path.join(__dirname, '..', '..', 'server_data_directory');
        // console.log(`[dbConfigSqlite] Modo Servidor ATIVO. Usando caminho para dados: ${serverDataPath}`);
        try {
            if (!fs.existsSync(serverDataPath)) {
                fs.mkdirSync(serverDataPath, { recursive: true });
                // console.log(`[dbConfigSqlite] Diretório de dados do servidor criado em: ${serverDataPath}`);
            }
        } catch (error) {
            console.error(`[dbConfigSqlite] Falha ao criar diretório de dados do servidor em ${serverDataPath}: ${error.message}. Usando fallback local.`);
            // Se falhar ao criar o diretório do servidor, usa o fallback para evitar que a aplicação quebre.
            const fallbackPathForServer = path.join(__dirname, '..', '..', 'dev_user_data_directory_fallback');
            if (!fs.existsSync(fallbackPathForServer)) {
                fs.mkdirSync(fallbackPathForServer, { recursive: true });
            }
            return fallbackPathForServer;
        }
        return serverDataPath;
    }

    // Prioridade 2: Ambiente Electron
    try {
        const { app } = require('electron'); // Tenta carregar o módulo 'electron'
        if (app && typeof app.getPath === 'function') {
            const userData = app.getPath('userData');
            if (userData && typeof userData === 'string') {
                // console.log(`[dbConfigSqlite] Modo Electron. app.getPath('userData') retornou: ${userData}`);
                return userData;
            }
            // console.warn("[dbConfigSqlite] app.getPath('userData') retornou um valor inválido ou não é uma string. Usando fallback local.");
        } else if (app) {
            // console.warn("[dbConfigSqlite] 'app.getPath' não é uma função (app pode não estar totalmente pronto?). Usando fallback local.");
        } else {
            // console.warn("[dbConfigSqlite] Módulo 'app' do Electron não disponível. Assumindo modo não-Electron ou erro. Usando fallback local.");
        }
    } catch (e) {
        // Este catch é para o caso de o `require('electron')` falhar, o que é esperado em modo servidor puro.
        // console.warn("[dbConfigSqlite] Erro ao tentar carregar o módulo 'electron' (esperado em modo servidor puro). Usando fallback local. Erro:", e.message);
    }
    
    // Prioridade 3: Fallback para desenvolvimento local ou se as opções acima falharem
    const fallbackPath = path.join(__dirname, '..', '..', 'dev_user_data_directory_fallback');
    // console.log(`[dbConfigSqlite] Usando caminho de fallback para userData: ${fallbackPath}`);
    try {
        if (!fs.existsSync(fallbackPath)) {
            fs.mkdirSync(fallbackPath, { recursive: true });
            // console.log(`[dbConfigSqlite] Diretório de fallback criado em: ${fallbackPath}`);
        }
    } catch (error) {
        console.error(`[dbConfigSqlite] Falha crítica ao criar diretório de fallback em ${fallbackPath}: ${error.message}`);
        // Em um cenário real, você poderia querer lançar o erro ou ter um caminho ainda mais básico.
        // Por simplicidade, vamos apenas logar e permitir que a aplicação continue (os DBs não serão criados).
    }
    return fallbackPath;
}

const userDataPath = getUserDataPath();
// console.log(`[dbConfigSqlite] userDataPath final definido como: ${userDataPath}`);

const baseDbDir = path.join(userDataPath, 'Databases');

try {
    if (!fs.existsSync(baseDbDir)) {
        fs.mkdirSync(baseDbDir, { recursive: true });
        // console.log(`[dbConfigSqlite] Diretório base de bancos de dados ('Databases') criado em: ${baseDbDir}`);
    }
} catch (error) {
    console.error(`[dbConfigSqlite] Falha ao criar diretório base de bancos de dados em ${baseDbDir}: ${error.message}`);
    // Tratar erro conforme necessário, talvez lançar para parar a aplicação se os DBs são críticos.
}

const mainDbPath = path.join(baseDbDir, 'ncMain.sqlite');
const adminDbPath = path.join(baseDbDir, 'ncAdmin.sqlite');
const chatDbPath = path.join(baseDbDir, 'ncChat.sqlite');

// Log para verificar os caminhos resolvidos ao carregar o módulo
// console.log(`[dbConfigSqlite] Caminho ncMain.sqlite resolvido para: ${mainDbPath}`);
// console.log(`[dbConfigSqlite] Caminho ncAdmin.sqlite resolvido para: ${adminDbPath}`);
// console.log(`[dbConfigSqlite] Caminho ncChat.sqlite resolvido para: ${chatDbPath}`);

module.exports = {
    mainDbPath,
    adminDbPath,
    chatDbPath,
};
