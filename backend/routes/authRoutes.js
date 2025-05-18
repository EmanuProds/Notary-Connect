// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const sqliteService = require('../services/sqliteService'); // Alterado para sqliteService

let globalSendLog = (msg, level) => console[level || 'log'](msg); // Fallback logger

function setLogger(logger) {
    globalSendLog = logger;
}

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    globalSendLog(`[Auth] Tentativa de login para usuário: ${username}`, 'info');

    if (!username || !password) {
        globalSendLog(`[Auth] Falha no login: Usuário ou senha não fornecidos. Usuário: ${username}`, 'warn');
        return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    }

    try {
        // Usa a função do sqliteService
        const attendant = await sqliteService.getAttendantByUsername(username);

        if (!attendant) {
            globalSendLog(`[Auth] Falha no login: Usuário '${username}' não encontrado.`, 'warn');
            return res.status(401).json({ success: false, message: 'Usuário não encontrado ou senha incorreta.' });
        }

        if (!attendant.PASSWORD_HASH) {
            globalSendLog(`[Auth] Falha no login: Usuário '${username}' não possui hash de senha configurado no banco.`, 'error');
            return res.status(500).json({ success: false, message: 'Erro de configuração da conta. Contacte o administrador.' });
        }
        
        const isMatch = await bcrypt.compare(password, attendant.PASSWORD_HASH);

        if (isMatch) {
            globalSendLog(`[Auth] Login bem-sucedido para usuário: ${username}. Admin: ${attendant.IS_ADMIN}`, 'info');
            res.json({
                success: true,
                message: 'Login bem-sucedido!',
                admin: attendant.IS_ADMIN, // sqliteService já deve retornar booleano
                attendant: attendant.USERNAME,
                name: attendant.NAME
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

router.post('/create-attendant-debug', async (req, res) => {
    const { username, password, name, isAdmin, sector, directContactNumber } = req.body;
    if (!username || !password || !name) {
        return res.status(400).json({ success: false, message: 'Username, password e name são obrigatórios.' });
    }

    try {
        const existingAttendant = await sqliteService.getAttendantByUsername(username);
        if (existingAttendant) {
            return res.status(409).json({ success: false, message: 'Usuário já existe.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAttendantData = {
            USERNAME: username,
            PASSWORD_HASH: hashedPassword,
            NAME: name,
            IS_ADMIN: isAdmin || false,
            SECTOR: sector, 
            DIRECT_CONTACT_NUMBER: directContactNumber
        };
        
        // Para criar um único atendente, a função initializeDefaultAttendants
        // já lida com a criação se não existir, mas ela espera uma lista.
        // Para um endpoint de criação individual, seria melhor ter uma função
        // createSingleAttendant no sqliteService que não precise de uma transação externa
        // ou que a execute internamente.
        // Por simplicidade, vamos simular chamando dentro de uma transação aqui.
        await sqliteService.executeTransaction(async (dbInstance) => {
            // A função createAttendant no sqliteService_js espera dbInstance
            // Se createAttendant for refatorada para não precisar de dbInstance aqui, melhor.
            // Por agora, assumimos que createAttendant pode ser chamada assim ou que
            // sqliteService.createAttendant lida com a conexão se dbInstance não for passado.
            // A versão atual do sqliteService_js.createAttendant espera dbInstance.
             await sqliteService.createAttendant(newAttendantData, dbInstance);
        });

        globalSendLog(`[Auth] Novo atendente criado (via API debug): ${username}`, 'info');
        res.status(201).json({ success: true, message: 'Atendente criado com sucesso (via API debug).' });
    } catch (error) {
        globalSendLog(`[Auth] Erro ao criar atendente ${username} (via API debug): ${error.message}`, 'error');
        res.status(500).json({ success: false, message: 'Erro ao criar atendente (via API debug).' });
    }
});


module.exports = { router, setLogger };
