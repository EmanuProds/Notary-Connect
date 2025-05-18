// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // Para hashing e comparação de senhas
const firebirdService = require('../services/firebirdService'); // Seu serviço Firebird

let globalSendLog; // Será injetado pelo electronMain.js

// Função para injetar o logger
function setLogger(logger) {
    globalSendLog = logger;
}

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!globalSendLog) {
        console.error("Logger não injetado em authRoutes.");
        // Fallback para console.log se globalSendLog não estiver disponível
        globalSendLog = (msg, level) => console[level || 'log'](msg);
    }

    globalSendLog(`[Auth] Tentativa de login para usuário: ${username}`, 'info');

    if (!username || !password) {
        globalSendLog(`[Auth] Falha no login: Usuário ou senha não fornecidos. Usuário: ${username}`, 'warn');
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    }

    try {
        const attendant = await firebirdService.getAttendantByUsername(username);

        if (!attendant) {
            globalSendLog(`[Auth] Falha no login: Usuário '${username}' não encontrado.`, 'warn');
            return res.status(401).json({ success: false, message: 'Usuário não encontrado ou senha incorreta.' });
        }

        // Log para depuração - NUNCA logar senhas em produção
        // globalSendLog(`[Auth] Usuário encontrado: ${JSON.stringify(attendant)}`, 'debug');
        // globalSendLog(`[Auth] Hash da senha do banco para ${username}: ${attendant.PASSWORD_HASH}`, 'debug');


        // Comparar a senha fornecida com o hash armazenado no banco
        // Certifique-se de que attendant.PASSWORD_HASH contém o hash bcrypt
        const isMatch = await bcrypt.compare(password, attendant.PASSWORD_HASH);

        // // Fallback para senha em texto plano APENAS PARA TESTES INICIAIS - REMOVER EM PRODUÇÃO
        // let isMatchFallback = false;
        // if (attendant.SENHA_PLAIN_TEXT && !attendant.PASSWORD_HASH) { // Se tiver senha plain e não tiver hash
        //     globalSendLog(`[Auth] Atenção: Usando comparação de senha em texto plano para ${username}. Isso é inseguro e deve ser removido.`, 'warn');
        //     isMatchFallback = (password === attendant.SENHA_PLAIN_TEXT);
        // }
        // const finalMatch = isMatch || isMatchFallback;
        // Fim do fallback


        if (isMatch) {
            globalSendLog(`[Auth] Login bem-sucedido para usuário: ${username}. Admin: ${attendant.IS_ADMIN}`, 'info');
            res.json({
                success: true,
                message: 'Login bem-sucedido!',
                admin: attendant.IS_ADMIN === 1 || attendant.IS_ADMIN === true, // Ajustar conforme o tipo no DB (1/0 ou true/false)
                attendant: attendant.USERNAME, // ID/Username do atendente
                name: attendant.NAME // Nome completo do atendente
            });
        } else {
            globalSendLog(`[Auth] Falha no login: Senha incorreta para usuário '${username}'.`, 'warn');
            return res.status(401).json({ success: false, message: 'Usuário não encontrado ou senha incorreta.' });
        }
    } catch (error) {
        globalSendLog(`[Auth] Erro no servidor durante o login para ${username}: ${error.message}`, 'error');
        globalSendLog(error.stack, 'error');
        res.status(500).json({ success: false, message: 'Erro no servidor durante o login.' });
    }
});

// Rota para criar um novo atendente (exemplo, proteger adequadamente)
router.post('/create-attendant', async (req, res) => {
    const { username, password, name, isAdmin } = req.body;
    if (!username || !password || !name) {
        return res.status(400).json({ success: false, message: 'Username, password e name são obrigatórios.' });
    }

    try {
        const existingAttendant = await firebirdService.getAttendantByUsername(username);
        if (existingAttendant) {
            return res.status(409).json({ success: false, message: 'Usuário já existe.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAttendant = {
            USERNAME: username,
            PASSWORD_HASH: hashedPassword,
            NAME: name,
            IS_ADMIN: isAdmin ? 1 : 0, //  1 para true, 0 para false no Firebird
            // SENHA_PLAIN_TEXT: password // APENAS PARA TESTE INICIAL, REMOVER
        };

        const created = await firebirdService.createAttendant(newAttendant);
        if (created) {
            globalSendLog(`[Auth] Novo atendente criado: ${username}`, 'info');
            res.status(201).json({ success: true, message: 'Atendente criado com sucesso.' });
        } else {
            throw new Error('Falha ao criar atendente no banco de dados.');
        }
    } catch (error) {
        globalSendLog(`[Auth] Erro ao criar atendente ${username}: ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Erro ao criar atendente.' });
    }
});


module.exports = { router, setLogger };
