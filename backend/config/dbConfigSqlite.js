// backend/config/dbConfigSqlite.js
const path = require('path');
const { app } = require('electron'); // Para obter o caminho de dados do usuário

// Define o caminho para o arquivo do banco de dados SQLite
// Usaremos a pasta de dados do usuário para armazenar o banco de dados em produção
// Para desenvolvimento, pode ser mais fácil ter na raiz do projeto.
const dbFileName = 'notaryconnect.sqlite';
let dbPath;

if (process.env.NODE_ENV === 'development') {
    // Em desenvolvimento, armazena na pasta 'database' na raiz do projeto
    dbPath = path.join(__dirname, '..', '..', 'database', dbFileName);
} else {
    // Em produção, armazena na pasta de dados do usuário da aplicação
    // Isso garante que o banco de dados seja persistente e específico do usuário
    dbPath = path.join(app.getPath('userData'), dbFileName);
}


module.exports = {
    databasePath: dbPath, // Caminho completo para o arquivo .sqlite
    // Outras opções específicas do SQLite podem ser adicionadas aqui se necessário
};
