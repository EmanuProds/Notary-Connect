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
                // Em um ambiente web, você precisaria iniciar uma sessão ou gerar um token JWT aqui.
                // Por enquanto, apenas retornamos o sucesso e os dados do usuário.
                // if (req.session) { // Exemplo com express-session
                //    req.session.user = {
                //        id: user.ID,
                //        username: user.USERNAME,
                //        name: user.NAME,
                //        isAdmin: user.IS_ADMIN,
                //        agent: user.USERNAME // ou user.ID, dependendo do que o chat usa
                //    };
                //    log(`Sessão criada para usuário: ${username}`, 'info');
                // }
                res.json({
                    success: true,
                    message: 'Login bem-sucedido!',
                    admin: user.IS_ADMIN, 
                    agent: user.USERNAME, // Usado pelo chat para identificar o atendente
                    name: user.NAME
                    // token: jwtToken, // Se estiver usando JWT
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

    // Rota de logout (exemplo, se estiver usando sessões)
    // router.post('/logout', (req, res) => {
    //   if (req.session) {
    //     req.session.destroy(err => {
    //       if (err) {
    //         log(`Erro ao destruir sessão: ${err.message}`, 'error');
    //         return res.status(500).json({ success: false, message: 'Erro ao fazer logout.' });
    //       }
    //       res.clearCookie('connect.sid'); // Substitua 'connect.sid' pelo nome do seu cookie de sessão, se aplicável
    //       log('Logout bem-sucedido e sessão destruída.', 'info');
    //       res.json({ success: true, message: 'Logout bem-sucedido.' });
    //     });
    //   } else {
    //     res.json({ success: true, message: 'Nenhuma sessão para encerrar.' });
    //   }
    // });

    // Rota para verificar status da sessão (exemplo)
    // router.get('/session-status', (req, res) => {
    //   if (req.session && req.session.user) {
    //     res.json({ success: true, loggedIn: true, user: req.session.user });
    //   } else {
    //     res.json({ success: true, loggedIn: false });
    //   }
    // });


    // A criação de usuários deve ser feita através das rotas de admin.

    return router; // Retorna o router configurado
};
