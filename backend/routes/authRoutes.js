// backend/routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs'); 

// A module.exports agora é uma FUNÇÃO que aceita o serviço DB e o logger
module.exports = function(sqliteAdminService, sendLogFunc) {
    const router = express.Router();
    // Usa o logger injetado ou um fallback
    const log = sendLogFunc || ((msg, level = 'info') => console[level](`[AuthRoutes] ${msg}`));

    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        log(`Tentativa de login para usuário: ${username}`, 'info');

        if (!username || !password) {
            log(`Falha no login: Usuário ou senha não fornecidos. Usuário: ${username}`, 'warn');
            return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
        }

        if (!sqliteAdminService) {
            log('Falha no login: sqliteAdminService não foi fornecido para authRoutes.', 'error');
            return res.status(500).json({ success: false, message: 'Erro interno do servidor (DB Service).' });
        }

        try {
            const user = await sqliteAdminService.getUserByUsername(username);

            if (!user) {
                log(`Falha no login: Usuário '${username}' não encontrado.`, 'warn');
                return res.status(401).json({ success: false, message: 'Usuário não encontrado ou senha incorreta.' });
            }

            if (!user.PASSWORD_HASH) {
                log(`Falha no login: Usuário '${username}' não possui hash de senha configurado no banco.`, 'error');
                return res.status(500).json({ success: false, message: 'Erro de configuração da conta. Contacte o administrador.' });
            }
            
            const isMatch = await bcrypt.compare(password, user.PASSWORD_HASH);

            if (isMatch) {
                log(`Login bem-sucedido para usuário: ${username}. Admin: ${user.IS_ADMIN}`, 'info');
                res.json({
                    success: true,
                    message: 'Login bem-sucedido!',
                    admin: user.IS_ADMIN, 
                    agent: user.USERNAME, 
                    name: user.NAME
                });
            } else {
                log(`Falha no login: Senha incorreta para usuário '${username}'.`, 'warn');
                return res.status(401).json({ success: false, message: 'Usuário não encontrado ou senha incorreta.' });
            }
        } catch (error) {
            log(`Erro no servidor durante o login para ${username}: ${error.message}`, 'error');
            console.error(error.stack); 
            res.status(500).json({ success: false, message: 'Erro no servidor durante o login.' });
        }
    });

    // Rota de debug para criar atendente/usuário foi removida.
    // A criação de usuários deve ser feita através das rotas de admin.

    return router; // Retorna o router configurado
};
