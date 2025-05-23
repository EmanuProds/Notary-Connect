// backend/routes/adminRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs"); 

module.exports = function(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogFunc) {
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
        const { response_key, response_name, pattern, response_text, typing_delay_ms, response_delay_ms } = req.body;
        // Validação de campos obrigatórios
        if (!response_key || !response_name || !pattern || !response_text || typing_delay_ms === undefined || response_delay_ms === undefined) {
            return res.status(400).json({ success: false, message: "Campos obrigatórios (incluindo delays) não fornecidos para resposta." });
        }
        const result = await sqliteAdminService.createAutoResponse(req.body);
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
        const { response_key, response_name, pattern, response_text, typing_delay_ms, response_delay_ms } = req.body;
        // Validação de campos obrigatórios
        if (!response_key || !response_name || !pattern || !response_text || typing_delay_ms === undefined || response_delay_ms === undefined) {
            return res.status(400).json({ success: false, message: "Campos obrigatórios (incluindo delays) não fornecidos para atualização da resposta." });
        }
        await sqliteAdminService.updateAutoResponse(req.params.id, req.body);
        res.json({ success: true, message: "Resposta atualizada." });
      } catch (error) {
        log(`Erro ao atualizar resposta ID ${req.params.id}: ${error.message}`, "error");
        if (error.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave da resposta já existe para outra resposta." });
        res.status(500).json({ success: false, message: "Erro ao atualizar resposta." });
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

    // POST para criar um novo serviço
    router.post("/services", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const { service_key, service_name } = req.body;
            if (!service_key || !service_name) {
                 return res.status(400).json({ success: false, message: "Chave e nome do serviço são obrigatórios." });
            }
            const result = await sqliteAdminService.createService(req.body);
            res.status(201).json({ success: true, message: "Serviço criado.", id: result.lastID });
        } catch (e) { 
            log(`Erro /services POST: ${e.message}`, "error"); 
            if (e.message.includes("UNIQUE constraint failed")) return res.status(409).json({ success: false, message: "Chave do serviço já existe." });
            res.status(500).json({ success: false, message: "Erro ao criar serviço."});
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
    
    return router;
};
