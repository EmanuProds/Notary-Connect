// backend/config/dbConfig.js
module.exports = {
    host: 'localhost', // Ou IP do servidor Firebird
    port: 3050,        // Porta padrão do Firebird
    database: 'C:/ProgramFiles/Notary Connect/Firebird/database.fdb', // Caminho completo para o arquivo .fdb
    user: 'SYSDBA',    // Usuário do Firebird
    password: '041011212527', // Senha do Firebird
    lowercase_keys: false, // Opcional
    role: null,        // Opcional
    pageSize: 4096,    // Opcional
    retryConnectionInterval: 1000, // Opcional
    encoding: 'UTF8' // Ou NONE, WIN1252, etc.
};