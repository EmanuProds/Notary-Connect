// backend/routes/adminRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs"); 

// Updated signature to include whatsappServiceInstance
module.exports = function(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogFunc, whatsappServiceInstance) {
    const router = express.Router();
    // Define a função de log, usando a fornecida ou um console.log como fallback.
    const log = sendLogFunc || ((msg, level = 'info') => console[level](`[AdminRoutes] ${msg}`));

    // Middleware para verificar se o usuário é administrador.
    // ATENÇÃO: Esta é uma implementação placeholder.
    // Em um ambiente de produção, substitua pela sua lógica real de autenticação e autorização.
    async function isAdmin(req, res, next) {
        log("Middleware isAdmin chamado (ATENÇÃO: lógica de verificação de admin real necessária).", "debug");
        // Exemplo de lógica real (requer implementação de sessão/token):
        // if (req.session && req.session.user && req.session.user.IS_ADMIN) {
        //   next();
        // } else {
        //   res.status(403).json({ success: false, message: "Acesso negado. Requer privilégios de administrador." });
        // }
        next(); // Por enquanto, permite todas as requisições.
    }

    // --- Rotas para Respostas Automáticas (usam sqliteAdminService) ---

    // GET todas as respostas automáticas
    router.get("/responses", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const responses = await sqliteAdminService.getAllAutoResponses();
        res.json({ success: true, data: responses });
      } catch (error) {
        log(`Erro ao buscar respostas automáticas: ${error.message}`, "error");
        res.status(500).json({ success: false, message: "Erro ao buscar respostas automáticas." });
      }
    });

    // GET uma resposta automática por ID
    router.get("/responses/:id", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const response = await sqliteAdminService.getAutoResponseById(req.params.id);
        if (!response) return res.status(404).json({ success: false, message: "Resposta não encontrada." });
        res.json({ success: true, data: response });
      } catch (error) {
        log(`Erro ao buscar resposta ID ${req.params.id}: ${error.message}`, "error");
        res.status(500).json({ success: false, message: "Erro ao buscar resposta." });
      }
    });

    // POST para criar uma nova resposta automática
    router.post("/responses", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { 
            response_key, response_name, triggers, response_text, 
            typing_delay_ms, response_delay_ms, active, priority, 
            start_time, end_time, allowed_days,
            sector_id, respond_on_holiday, forward_to_user_id, forward_to_sector_id, is_regex 
        } = req.body;
        
        // Validação de campos obrigatórios
        if (!response_key || !response_name || !triggers || !response_text || 
            typing_delay_ms === undefined || response_delay_ms === undefined) {
            return res.status(400).json({ success: false, message: "Campos obrigatórios (response_key, response_name, triggers, response_text, typing_delay_ms, response_delay_ms) não fornecidos." });
        }
        
        // Construir o objeto de dados explicitamente para garantir que apenas os campos esperados sejam passados
        const autoResponseData = {
            response_key, response_name, triggers, response_text,
            active: active !== undefined ? active : true, // Default para true se não especificado
            priority: priority !== undefined ? priority : 0, // Default para 0 se não especificado
            start_time: start_time || null,
            end_time: end_time || null,
            allowed_days: allowed_days || "0,1,2,3,4,5,6", // Default para todos os dias
            typing_delay_ms, 
            response_delay_ms,
            sector_id: sector_id || null,
            respond_on_holiday: respond_on_holiday || false, // Default para false
            forward_to_user_id: forward_to_user_id || null,
            forward_to_sector_id: forward_to_sector_id || null,
            is_regex: is_regex || false // Default para false
        };

        const result = await sqliteAdminService.createAutoResponse(autoResponseData);
        res.status(201).json({ success: true, message: "Resposta criada.", id: result.lastID });
      } catch (error) {
        log(`Erro ao criar resposta: ${error.message}`, "error");
        if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave da resposta já existe." });
        res.status(500).json({ success: false, message: "Erro ao criar resposta." });
      }
    });

    // PUT para atualizar uma resposta automática existente
    router.put("/responses/:id", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { 
            response_key, response_name, triggers, response_text, 
            typing_delay_ms, response_delay_ms, active, priority, 
            start_time, end_time, allowed_days,
            sector_id, respond_on_holiday, forward_to_user_id, forward_to_sector_id, is_regex 
        } = req.body;
        
        // Validação de campos obrigatórios
        if (!response_key || !response_name || !triggers || !response_text || 
            typing_delay_ms === undefined || response_delay_ms === undefined) {
            return res.status(400).json({ success: false, message: "Campos obrigatórios (response_key, response_name, triggers, response_text, typing_delay_ms, response_delay_ms) não fornecidos para atualização." });
        }

        // Construir o objeto de dados explicitamente
        const autoResponseData = {
            response_key, response_name, triggers, response_text,
            active, priority, start_time, end_time, allowed_days,
            typing_delay_ms, response_delay_ms,
            sector_id, respond_on_holiday, forward_to_user_id, forward_to_sector_id, is_regex
        };

        await sqliteAdminService.updateAutoResponse(req.params.id, autoResponseData);
        res.json({ success: true, message: "Resposta atualizada." });
      } catch (error) {
        log(`Erro ao atualizar resposta ID ${req.params.id}: ${error.message}`, "error");
        if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave da resposta já existe para outra resposta." });
        res.status(500).json({ success: false, message: "Erro ao atualizar resposta." });
      }
    });
    
    // Rota para importação de respostas automáticas
    router.post("/responses/import", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            if (!sqliteAdminService.importAutoResponsesBatch) throw new Error("Função importAutoResponsesBatch não disponível no sqliteAdminService.");

            const responsesArray = req.body;
            if (!Array.isArray(responsesArray)) {
                return res.status(400).json({ success: false, message: "O corpo da requisição deve ser um array de objetos de resposta automática." });
            }
            if (responsesArray.length === 0) {
                return res.status(400).json({ success: false, message: "O array de respostas automáticas não pode estar vazio." });
            }

            // Validação básica para cada item (pode ser expandida conforme necessário)
            for (const response of responsesArray) {
                if (!response.response_key || !response.triggers || !response.response_text || !response.response_name) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `Objeto de resposta inválido no array. Campos obrigatórios: response_key, triggers, response_text, response_name. Objeto problemático: ${JSON.stringify(response).substring(0,100)}...`
                    });
                }
            }
            
            const importResult = await sqliteAdminService.importAutoResponsesBatch(responsesArray);
            res.status(200).json({ success: true, message: "Importação concluída.", data: importResult });

        } catch (error) {
            log(`Erro na importação de respostas automáticas: ${error.message}`, "error");
            if (error.message.includes("importAutoResponsesBatch não disponível")) {
                 return res.status(501).json({ success: false, message: "Funcionalidade de importação não implementada no serviço." });
            }
            res.status(500).json({ success: false, message: "Erro durante a importação de respostas automáticas." });
        }
    });


    // DELETE para excluir uma resposta automática
    router.delete("/responses/:id", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        await sqliteAdminService.deleteAutoResponse(req.params.id);
        res.json({ success: true, message: "Resposta excluída." });
      } catch (error) {
        log(`Erro ao excluir resposta ID ${req.params.id}: ${error.message}`, "error");
        res.status(500).json({ success: false, message: "Erro ao excluir resposta." });
      }
    });
    
    // --- Rotas para Feriados (HOLIDAYS) ---
    // GET todos os feriados
    router.get("/holidays", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const holidays = await sqliteAdminService.getAllHolidays();
            res.json({ success: true, data: holidays });
        } catch (error) {
            log(`Erro ao buscar feriados: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao buscar feriados." });
        }
    });

    // POST para criar um novo feriado
    router.post("/holidays", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { holiday_date, description } = req.body;
            if (!holiday_date) { // Validação básica da data
                return res.status(400).json({ success: false, message: "A data do feriado (holiday_date) é obrigatória." });
            }
            // Validação do formato da data (YYYY-MM-DD) pode ser adicionada aqui
            if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
                return res.status(400).json({ success: false, message: "Formato de data inválido. Use YYYY-MM-DD." });
            }
            const result = await sqliteAdminService.createHoliday({ holiday_date, description });
            res.status(201).json({ success: true, message: "Feriado criado.", id: result.lastID });
        } catch (error) {
            log(`Erro ao criar feriado: ${error.message}`, "error");
            if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Já existe um feriado cadastrado para esta data." });
            res.status(500).json({ success: false, message: "Erro ao criar feriado." });
        }
    });
    
    // GET um feriado por ID
    // Nota: sqliteAdminService precisa ter getHolidayById. Se não, esta rota falhará ou precisará ser ajustada.
    router.get("/holidays/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            if (!sqliteAdminService.getHolidayById) { // Verifica se a função existe
                 log("Função getHolidayById não encontrada em sqliteAdminService. Esta rota GET /holidays/:id pode não funcionar como esperado.", "warn");
                 return res.status(501).json({ success: false, message: "Funcionalidade para buscar feriado por ID não implementada no serviço." });
            }
            const holiday = await sqliteAdminService.getHolidayById(req.params.id);
            if (!holiday) return res.status(404).json({ success: false, message: "Feriado não encontrado." });
            res.json({ success: true, data: holiday });
        } catch (error) {
            log(`Erro ao buscar feriado ID ${req.params.id}: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao buscar feriado." });
        }
    });

    // PUT para atualizar um feriado
    router.put("/holidays/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { holiday_date, description } = req.body;
            if (!holiday_date) { // Validação básica da data
                return res.status(400).json({ success: false, message: "A data do feriado (holiday_date) é obrigatória para atualização." });
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
                return res.status(400).json({ success: false, message: "Formato de data inválido para atualização. Use YYYY-MM-DD." });
            }
            await sqliteAdminService.updateHoliday(req.params.id, { holiday_date, description });
            res.json({ success: true, message: "Feriado atualizado." });
        } catch (error) {
            log(`Erro ao atualizar feriado ID ${req.params.id}: ${error.message}`, "error");
            if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Já existe outro feriado cadastrado para esta data." });
            res.status(500).json({ success: false, message: "Erro ao atualizar feriado." });
        }
    });

    // DELETE para excluir um feriado
    router.delete("/holidays/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            await sqliteAdminService.deleteHoliday(req.params.id);
            res.json({ success: true, message: "Feriado excluído." });
        } catch (error) {
            log(`Erro ao excluir feriado ID ${req.params.id}: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao excluir feriado." });
        }
    });
    
    // --- Rotas para Controle da IA (WhatsApp Service) ---

    // POST para alternar o estado de pausa do bot
    router.post("/ia/toggle-pause", isAdmin, async (req, res) => {
        try {
            if (!whatsappServiceInstance || typeof whatsappServiceInstance.togglePauseBot !== 'function') {
                log("Serviço WhatsApp (togglePauseBot) não está disponível.", "error");
                return res.status(500).json({ success: false, message: "Serviço WhatsApp não configurado ou função indisponível." });
            }
            const isPaused = await whatsappServiceInstance.togglePauseBot();
            log(`Estado de pausa do bot alterado para: ${isPaused}`, "info");
            // O websocketService.broadcastToAdmins com o status_update já é chamado dentro do togglePauseBot
            res.json({ success: true, message: `Bot ${isPaused ? 'pausado' : 'reativado'} com sucesso.`, isPaused: isPaused });
        } catch (error) {
            log(`Erro ao alternar pausa do bot: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao alternar estado de pausa do bot." });
        }
    });

    // POST para reiniciar a conexão do WhatsApp (novo QR Code)
    router.post("/ia/restart", isAdmin, async (req, res) => {
        try {
            if (!whatsappServiceInstance || 
                typeof whatsappServiceInstance.fullLogoutAndCleanup !== 'function' ||
                typeof whatsappServiceInstance.connectToWhatsApp !== 'function') { // connectToWhatsApp é a função original de inicialização
                log("Serviço WhatsApp (fullLogoutAndCleanup ou connectToWhatsApp) não está disponível.", "error");
                return res.status(500).json({ success: false, message: "Serviço WhatsApp não configurado ou funções indisponíveis." });
            }

            log("Iniciando processo de reinício da IA (Logout, Cleanup, Reconnect)...", "info");
            
            await whatsappServiceInstance.fullLogoutAndCleanup(false); // false = não é evento de desconexão/falha, é intencional
            log("Logout e limpeza da sessão anterior concluídos.", "info");

            // A chamada a connectToWhatsApp precisa dos parâmetros originais.
            // Esta é a parte que depende da configuração em electronMain.js ou server.js.
            // O whatsappServiceInstance precisa ter sido configurado com suas dependências (log, ws, db, appUserDataPath)
            // de forma que possam ser reutilizadas internamente, ou uma função wrapper de reinício.
            // Como não posso modificar whatsappService.js aqui, alerto sobre a dependência.

            if (typeof whatsappServiceInstance.initAndConnect === 'function') {
                 // Supõe que initAndConnect é uma função adicionada ao whatsappServiceInstance que
                 // já tem acesso aos parâmetros de inicialização (sendLogFunc, websocketServiceInstance, dbServicesInstance, appUserDataPath)
                 // e chama internamente o connectToWhatsApp.
                await whatsappServiceInstance.initAndConnect();
                log("Comando de reinício da conexão do WhatsApp (via initAndConnect) enviado.", "info");
                res.json({ success: true, message: "IA está reiniciando. Um novo QR code deve ser gerado em breve." });
            } else {
                log("Método initAndConnect não encontrado no whatsappServiceInstance. O reinício automático da conexão não pode ser feito por esta rota sem modificações adicionais no serviço WhatsApp para armazenar/reutilizar parâmetros de inicialização.", "error");
                res.status(501).json({ 
                    success: false, 
                    message: "Logout realizado. No entanto, o reinício automático da conexão requer configuração adicional no serviço WhatsApp para reutilizar os parâmetros de inicialização. Um novo QR code pode não ser gerado automaticamente até que o serviço seja reiniciado manualmente com todos os parâmetros." 
                });
            }

        } catch (error) {
            log(`Erro ao reiniciar a IA: ${error.message}`, "error");
            res.status(500).json({ success: false, message: `Erro ao reiniciar a IA: ${error.message}` });
        }
    });


    // --- Rotas para Usuários (usam sqliteAdminService) ---

    // GET todos os usuários (funcionários)
    router.get("/users", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const users = await sqliteAdminService.getAllUsers();
        res.json({ success: true, data: users });
      } catch (error) { 
        log(`Erro ao buscar usuários: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao buscar usuários." });
      }
    });

    // GET um usuário por ID
    router.get("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const user = await sqliteAdminService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        res.json({ success: true, data: user });
      } catch (error) { 
        log(`Erro ao buscar usuário ID ${req.params.id}: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao buscar usuário." }); 
      }
    });

    // POST para criar um novo usuário
    router.post("/users", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { username, password, name, is_admin, sector, direct_contact_number } = req.body;
        // Validação de campos obrigatórios
        if (!username || !password || !name) {
            return res.status(400).json({ success: false, message: "Usuário, senha e nome são obrigatórios." });
        }
        
        // Verifica se o nome de usuário já existe
        const existingUser = await sqliteAdminService.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Nome de usuário já existe." });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserData = { 
            USERNAME: username, 
            PASSWORD_HASH: hashedPassword, 
            NAME: name, 
            IS_ADMIN: is_admin || false, 
            SECTOR: sector, 
            DIRECT_CONTACT_NUMBER: direct_contact_number 
        };
        const result = await sqliteAdminService.createUser(newUserData);
        res.status(201).json({ success: true, message: "Usuário criado.", id: result.lastID });
      } catch (error) { 
        log(`Erro ao criar usuário: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao criar usuário." });
      }
    });

    // PUT para atualizar um usuário existente
    router.put("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { username, password, name, is_admin, sector, direct_contact_number } = req.body;
        // Validação de campos obrigatórios
        if (!username || !name) {
            return res.status(400).json({ success: false, message: "Usuário e nome são obrigatórios." });
        }
        
        const userToUpdate = await sqliteAdminService.getUserById(req.params.id);
        if (!userToUpdate) {
            return res.status(404).json({ success: false, message: "Usuário não encontrado para atualização." });
        }

        // Se o username foi alterado, verifica se o novo username já existe para outro usuário
        if (username.toUpperCase() !== userToUpdate.USERNAME.toUpperCase()) {
            const existingUserWithNewUsername = await sqliteAdminService.getUserByUsername(username);
            if (existingUserWithNewUsername && String(existingUserWithNewUsername.ID) !== String(req.params.id)) {
                return res.status(409).json({ success: false, message: "O novo nome de usuário já está em uso por outro usuário." });
            }
        }
        
        const updateData = { 
            USERNAME: username, 
            NAME: name, 
            IS_ADMIN: is_admin || false, 
            SECTOR: sector, 
            DIRECT_CONTACT_NUMBER: direct_contact_number 
        };
        if (password) { 
            const salt = await bcrypt.genSalt(10); 
            updateData.PASSWORD_HASH = await bcrypt.hash(password, salt); 
        }
        
        await sqliteAdminService.updateUser(req.params.id, updateData);
        res.json({ success: true, message: "Usuário atualizado." });
      } catch (error) { 
        log(`Erro ao atualizar usuário ID ${req.params.id}: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao atualizar usuário." });
      }
    });

    // DELETE para excluir um usuário
    router.delete("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        await sqliteAdminService.deleteUser(req.params.id);
        res.json({ success: true, message: "Usuário excluído." });
      } catch (error) { 
        log(`Erro ao excluir usuário ID ${req.params.id}: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao excluir usuário." });
      }
    });

    // --- Rotas para Setores (usam sqliteAdminService) ---
    // GET todos os setores
    router.get("/sectors", isAdmin, async (req, res) => {
      try { 
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const sectors = await sqliteAdminService.getAllSectors();
        res.json({ success: true, data: sectors }); 
      } 
      catch (e) { 
        log(`Erro /sectors GET: ${e.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao buscar setores."});
      }
    });

    // GET um setor por ID (adicionado para consistência, se necessário)
    router.get("/sectors/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            // Supondo que você adicione uma função getSectorById no sqliteAdminService
            const sector = await sqliteAdminService.getSectorById(req.params.id); 
            if (!sector) return res.status(404).json({ success: false, message: "Setor não encontrado." });
            res.json({ success: true, data: sector });
        } catch (error) {
            log(`Erro ao buscar setor ID ${req.params.id}: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao buscar setor." });
        }
    });
    
    // POST para criar um novo setor
    router.post("/sectors", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { sector_key, sector_name } = req.body;
            if (!sector_key || !sector_name) {
                return res.status(400).json({ success: false, message: "Chave e nome do setor são obrigatórios." });
            }
            const result = await sqliteAdminService.createSector(req.body);
            res.status(201).json({ success: true, message: "Setor criado.", id: result.lastID });
        } catch (e) { 
            log(`Erro /sectors POST: ${e.message}`, "error"); 
            if (e.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave do setor já existe." });
            res.status(500).json({ success: false, message: "Erro ao criar setor."});
        }
    });

    // PUT para atualizar um setor existente
    router.put("/sectors/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { sector_key, sector_name } = req.body;
            if (!sector_key || !sector_name) {
                return res.status(400).json({ success: false, message: "Chave e nome do setor são obrigatórios para atualização." });
            }
            // Supondo que você adicione uma função updateSector no sqliteAdminService
            await sqliteAdminService.updateSector(req.params.id, req.body); 
            res.json({ success: true, message: "Setor atualizado." });
        } catch (error) {
            log(`Erro ao atualizar setor ID ${req.params.id}: ${error.message}`, "error");
            if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave do setor já existe para outro setor." });
            res.status(500).json({ success: false, message: "Erro ao atualizar setor." });
        }
    });

    // DELETE para excluir um setor
    router.delete("/sectors/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            // Supondo que você adicione uma função deleteSector no sqliteAdminService
            await sqliteAdminService.deleteSector(req.params.id); 
            res.json({ success: true, message: "Setor excluído." });
        } catch (error) {
            log(`Erro ao excluir setor ID ${req.params.id}: ${error.message}`, "error");
            // Adicionar verificação se o setor está em uso por funcionários antes de excluir seria uma boa prática.
            res.status(500).json({ success: false, message: "Erro ao excluir setor. Verifique se não está em uso." });
        }
    });
    
    // --- Rotas para Controle da IA (WhatsApp Service) ---

    // POST para alternar o estado de pausa do bot
    router.post("/ia/toggle-pause", isAdmin, async (req, res) => {
        try {
            if (!whatsappServiceInstance || typeof whatsappServiceInstance.togglePauseBot !== 'function') {
                log("Serviço WhatsApp (togglePauseBot) não está disponível.", "error");
                return res.status(500).json({ success: false, message: "Serviço WhatsApp não configurado ou função indisponível." });
            }
            const isPaused = await whatsappServiceInstance.togglePauseBot();
            log(`Estado de pausa do bot alterado para: ${isPaused}`, "info");
            // O websocketService.broadcastToAdmins com o status_update já é chamado dentro do togglePauseBot
            res.json({ success: true, message: `Bot ${isPaused ? 'pausado' : 'reativado'} com sucesso.`, isPaused: isPaused });
        } catch (error) {
            log(`Erro ao alternar pausa do bot: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao alternar estado de pausa do bot." });
        }
    });

    // POST para reiniciar a conexão do WhatsApp (novo QR Code)
    router.post("/ia/restart", isAdmin, async (req, res) => {
        try {
            if (!whatsappServiceInstance || 
                typeof whatsappServiceInstance.fullLogoutAndCleanup !== 'function' ||
                typeof whatsappServiceInstance.connectToWhatsApp !== 'function') { // connectToWhatsApp é a função original de inicialização
                log("Serviço WhatsApp (fullLogoutAndCleanup ou connectToWhatsApp) não está disponível.", "error");
                return res.status(500).json({ success: false, message: "Serviço WhatsApp não configurado ou funções indisponíveis." });
            }

            log("Iniciando processo de reinício da IA (Logout, Cleanup, Reconnect)...", "info");
            
            await whatsappServiceInstance.fullLogoutAndCleanup(false); // false = não é evento de desconexão/falha, é intencional
            log("Logout e limpeza da sessão anterior concluídos.", "info");

            // A chamada a connectToWhatsApp precisa dos parâmetros originais.
            // Esta é a parte que depende da configuração em electronMain.js ou server.js.
            // O whatsappServiceInstance precisa ter sido configurado com suas dependências (log, ws, db, appUserDataPath)
            // de forma que possam ser reutilizadas internamente, ou uma função wrapper de reinício.
            // Como não posso modificar whatsappService.js aqui, alerto sobre a dependência.

            if (typeof whatsappServiceInstance.initAndConnect === 'function') {
                 // Supõe que initAndConnect é uma função adicionada ao whatsappServiceInstance que
                 // já tem acesso aos parâmetros de inicialização (sendLogFunc, websocketServiceInstance, dbServicesInstance, appUserDataPath)
                 // e chama internamente o connectToWhatsApp.
                await whatsappServiceInstance.initAndConnect();
                log("Comando de reinício da conexão do WhatsApp (via initAndConnect) enviado.", "info");
                res.json({ success: true, message: "IA está reiniciando. Um novo QR code deve ser gerado em breve." });
            } else {
                log("Método initAndConnect não encontrado no whatsappServiceInstance. O reinício automático da conexão não pode ser feito por esta rota sem modificações adicionais no serviço WhatsApp para armazenar/reutilizar parâmetros de inicialização.", "error");
                res.status(501).json({ 
                    success: false, 
                    message: "Logout realizado. No entanto, o reinício automático da conexão requer configuração adicional no serviço WhatsApp para reutilizar os parâmetros de inicialização. Um novo QR code pode não ser gerado automaticamente até que o serviço seja reiniciado manualmente com todos os parâmetros." 
                });
            }

        } catch (error) {
            log(`Erro ao reiniciar a IA: ${error.message}`, "error");
            res.status(500).json({ success: false, message: `Erro ao reiniciar a IA: ${error.message}` });
        }
    });


    // --- Rotas para Serviços (usam sqliteAdminService) ---
    // GET todos os serviços
     router.get("/services", isAdmin, async (req, res) => {
        try { 
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const services = await sqliteAdminService.getAllServices();
            res.json({ success: true, data: services }); 
        }
        catch (e) { 
            log(`Erro /services GET: ${e.message}`, "error"); 
            res.status(500).json({ success: false, message: "Erro ao buscar serviços."});
        }
    });

    // GET um serviço por ID
    router.get("/services/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            // Assumindo que getServiceById foi adicionado ao sqliteAdminService na etapa anterior
            const service = await sqliteAdminService.getServiceById(req.params.id); 
            if (!service) return res.status(404).json({ success: false, message: "Serviço não encontrado." });
            res.json({ success: true, data: service });
        } catch (error) {
            log(`Erro ao buscar serviço ID ${req.params.id}: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao buscar serviço." });
        }
    });

    // POST para criar um novo serviço
    router.post("/services", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { service_key, service_name, description, price, sector_id, active, forward_to_user_id } = req.body;
            if (!service_key || !service_name) {
                 return res.status(400).json({ success: false, message: "Chave e nome do serviço são obrigatórios." });
            }
            const serviceData = { 
                service_key, service_name, description, price, sector_id, 
                active: active !== undefined ? active : true, 
                forward_to_user_id: forward_to_user_id || null
            };
            const result = await sqliteAdminService.createService(serviceData);
            res.status(201).json({ success: true, message: "Serviço criado.", id: result.lastID });
        } catch (e) { 
            log(`Erro /services POST: ${e.message}`, "error"); 
            if (e.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave do serviço já existe." });
            res.status(500).json({ success: false, message: "Erro ao criar serviço."});
        }
    });

    // PUT para atualizar um serviço existente
    router.put("/services/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { service_key, service_name, description, price, sector_id, active, forward_to_user_id } = req.body;
            if (!service_key || !service_name) {
                return res.status(400).json({ success: false, message: "Chave e nome do serviço são obrigatórios para atualização." });
            }
            // Assumindo que updateService foi adicionado ao sqliteAdminService na etapa anterior
            const serviceData = { 
                service_key, service_name, description, price, sector_id, 
                active: active !== undefined ? active : true, 
                forward_to_user_id: forward_to_user_id || null
            };
            await sqliteAdminService.updateService(req.params.id, serviceData); 
            res.json({ success: true, message: "Serviço atualizado." });
        } catch (error) {
            log(`Erro ao atualizar serviço ID ${req.params.id}: ${error.message}`, "error");
            if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave do serviço já existe para outro serviço." });
            res.status(500).json({ success: false, message: "Erro ao atualizar serviço." });
        }
    });

    // DELETE para excluir um serviço
    router.delete("/services/:id", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            // Assumindo que deleteService foi adicionado ao sqliteAdminService na etapa anterior
            await sqliteAdminService.deleteService(req.params.id); 
            res.json({ success: true, message: "Serviço excluído." });
        } catch (error) {
            log(`Erro ao excluir serviço ID ${req.params.id}: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao excluir serviço. Verifique se não está em uso." });
        }
    });

    // --- Rotas para Configurações Gerais (usam sqliteMainService) ---

    // GET todas as configurações
    router.get("/config", isAdmin, async (req, res) => {
      try {
        if (!sqliteMainService) throw new Error("sqliteMainService não disponível");
        const configs = await sqliteMainService.getAllConfigs();
        res.json({ success: true, data: configs });
      } catch (error) { 
        log(`Erro ao buscar configs: ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao buscar configs." });
      }
    });
    
    // POST para salvar configurações (pode ser uma única ou múltiplas)
    router.post("/config", isAdmin, async (req, res) => {
      try {
        if (!sqliteMainService) throw new Error("sqliteMainService não disponível");
        
        const configsToSave = req.body;

        if (!Array.isArray(configsToSave)) {
            // Trata como uma única configuração
            const { key, value, type, description } = req.body;
            if (!key || value === undefined) {
                return res.status(400).json({ success: false, message: "Chave e valor são obrigatórios para configuração individual." });
            }
            await sqliteMainService.setConfig(key, value, type, description);
            return res.json({ success: true, message: "Configuração salva." });
        }

        // Trata como um array de configurações
        if (configsToSave.length === 0) {
            return res.status(400).json({ success: false, message: "Nenhuma configuração fornecida para salvar." });
        }
        
        for (const config of configsToSave) {
            if (!config.key || config.value === undefined) {
                return res.status(400).json({ success: false, message: `Configuração inválida no array: ${JSON.stringify(config)}. Chave e valor são obrigatórios.` });
            }
        }

        const result = await sqliteMainService.setMultipleConfigs(configsToSave);
        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(500).json({ success: false, message: result.message || "Erro ao salvar múltiplas configurações." });
        }

      } catch (error) { 
        log(`Erro ao salvar config(s): ${error.message}`, "error"); 
        res.status(500).json({ success: false, message: "Erro ao salvar config(s)." });
      }
    });

    // --- Rota para Estatísticas do Dashboard ---
    router.get("/dashboard/stats", isAdmin, async (req, res) => {
        try {
            if (!sqliteChatService || !sqliteAdminService) {
                throw new Error("sqliteChatService ou sqliteAdminService não disponível");
            }

            const [
                pendingCount,
                humanInProgressCount,
                closedTodayCount,
                allUsers
            ] = await Promise.all([
                sqliteChatService.countPendingConversations(),
                sqliteChatService.countHumanInProgressConversations(),
                sqliteChatService.countClosedConversationsToday(),
                sqliteAdminService.getAllUsers() // Usado para simular atendentes online
            ]);

            // Simulação de atendentes online: conta usuários que não são administradores.
            // Em um sistema real, isso seria mais complexo (status de presença via WebSocket, etc.)
            const onlineAttendantsCount = allUsers.filter(user => !user.IS_ADMIN).length; 
            // Ou se houver um campo 'ACTIVE' na tabela USERS que é mantido:
            // const onlineAttendantsCount = allUsers.filter(user => !user.IS_ADMIN && user.ACTIVE).length;
            // Por agora, a contagem de não-admins é um proxy. Se getAllUsers() já filtra por ativos, melhor ainda.
            // A função getAllUsers já retorna IS_ADMIN como booleano.

            res.json({
                success: true,
                data: {
                    atendentesOnline: onlineAttendantsCount,
                    clientesPendentes: pendingCount,
                    emAtendimentoHumano: humanInProgressCount,
                    atendimentosEncerradosHoje: closedTodayCount
                }
            });

        } catch (error) {
            log(`Erro ao buscar estatísticas do dashboard: ${error.message}`, "error");
            res.status(500).json({ success: false, message: "Erro ao buscar estatísticas do dashboard." });
        }
    });
    
    return router;
};
