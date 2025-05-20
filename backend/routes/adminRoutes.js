// backend/routes/adminRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs"); 

module.exports = function(sqliteAdminService, sqliteMainService, sqliteChatService, sendLogFunc) {
    const router = express.Router();
    const log = sendLogFunc || ((msg, level = 'info') => console[level](`[AdminRoutes] ${msg}`));

    async function isAdmin(req, res, next) {
        log("Middleware isAdmin chamado (ATENÇÃO: lógica de verificação de admin real necessária).", "debug");
        next(); 
    }

    // --- Rotas para Respostas Automáticas (usam sqliteAdminService) ---
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

    router.post("/responses", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { response_key, response_name, pattern, response_text, typing_delay_ms, response_delay_ms } = req.body;
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

    router.put("/responses/:id", isAdmin, async (req, res) => {
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { response_key, response_name, pattern, response_text, typing_delay_ms, response_delay_ms } = req.body;
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
    router.get("/users", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const users = await sqliteAdminService.getAllUsers();
        res.json({ success: true, data: users });
      } catch (error) { log(`Erro ao buscar usuários: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao buscar usuários." });}
    });
    router.get("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const user = await sqliteAdminService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });
        res.json({ success: true, data: user });
      } catch (error) { log(`Erro ao buscar usuário ID ${req.params.id}: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao buscar usuário." }); }
    });
    router.post("/users", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { username, password, name, is_admin, sector, direct_contact_number } = req.body;
        if (!username || !password || !name) return res.status(400).json({ success: false, message: "Usuário, senha e nome são obrigatórios." });
        
        // Verifica se o nome de usuário já existe
        const existingUser = await sqliteAdminService.getUserByUsername(username);
        if (existingUser) return res.status(409).json({ success: false, message: "Nome de usuário já existe." });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserData = { USERNAME: username, PASSWORD_HASH: hashedPassword, NAME: name, IS_ADMIN: is_admin || false, SECTOR: sector, DIRECT_CONTACT_NUMBER: direct_contact_number };
        const result = await sqliteAdminService.createUser(newUserData);
        res.status(201).json({ success: true, message: "Usuário criado.", id: result.lastID });
      } catch (error) { log(`Erro ao criar usuário: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao criar usuário." });}
    });
    router.put("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        const { username, password, name, is_admin, sector, direct_contact_number } = req.body;
        if (!username || !name) return res.status(400).json({ success: false, message: "Usuário e nome são obrigatórios." });
        
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
        
        const updateData = { USERNAME: username, NAME: name, IS_ADMIN: is_admin || false, SECTOR: sector, DIRECT_CONTACT_NUMBER: direct_contact_number };
        if (password) { const salt = await bcrypt.genSalt(10); updateData.PASSWORD_HASH = await bcrypt.hash(password, salt); }
        
        await sqliteAdminService.updateUser(req.params.id, updateData);
        res.json({ success: true, message: "Usuário atualizado." });
      } catch (error) { log(`Erro ao atualizar usuário ID ${req.params.id}: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao atualizar usuário." });}
    });
    router.delete("/users/:id", isAdmin, async (req, res) => { 
      try {
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        await sqliteAdminService.deleteUser(req.params.id);
        res.json({ success: true, message: "Usuário excluído." });
      } catch (error) { log(`Erro ao excluir usuário ID ${req.params.id}: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao excluir usuário." });}
    });

    // --- Rotas para Setores e Serviços (usam sqliteAdminService) ---
    router.get("/sectors", isAdmin, async (req, res) => {
      try { 
        if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
        res.json({ success: true, data: await sqliteAdminService.getAllSectors() }); 
      } 
      catch (e) { log(`Erro /sectors GET: ${e.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao buscar setores."});}
    });
    router.post("/sectors", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const result = await sqliteAdminService.createSector(req.body);
            res.status(201).json({ success: true, message: "Setor criado.", id: result.lastID });
        } catch (e) { log(`Erro /sectors POST: ${e.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao criar setor."});}
    });
     router.get("/services", isAdmin, async (req, res) => {
        try { 
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            res.json({ success: true, data: await sqliteAdminService.getAllServices() }); 
        }
        catch (e) { log(`Erro /services GET: ${e.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao buscar serviços."});}
    });
    router.post("/services", isAdmin, async (req, res) => {
        try {
            if (!sqliteAdminService) throw new Error("sqliteAdminService não disponível");
            const result = await sqliteAdminService.createService(req.body);
            res.status(201).json({ success: true, message: "Serviço criado.", id: result.lastID });
        } catch (e) { log(`Erro /services POST: ${e.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao criar serviço."});}
    });

    // --- Rotas para Configurações Gerais (usam sqliteMainService) ---
    router.get("/config", isAdmin, async (req, res) => {
      try {
        if (!sqliteMainService) throw new Error("sqliteMainService não disponível");
        const configs = await sqliteMainService.getAllConfigs();
        res.json({ success: true, data: configs });
      } catch (error) { log(`Erro ao buscar configs: ${error.message}`, "error"); res.status(500).json({ success: false, message: "Erro ao buscar configs." });}
    });
    
    router.post("/config", isAdmin, async (req, res) => {
      try {
        if (!sqliteMainService) throw new Error("sqliteMainService não disponível");
        
        const configsToSave = req.body; // Espera um array de configurações

        if (!Array.isArray(configsToSave)) {
            // Se não for um array, trata como uma única configuração (mantém compatibilidade)
            const { key, value, type, description } = req.body;
            if (!key || value === undefined) return res.status(400).json({ success: false, message: "Chave e valor são obrigatórios para configuração individual." });
            await sqliteMainService.setConfig(key, value, type, description);
            return res.json({ success: true, message: "Configuração salva." });
        }

        // Se for um array, usa a nova função setMultipleConfigs
        if (configsToSave.length === 0) {
            return res.status(400).json({ success: false, message: "Nenhuma configuração fornecida para salvar." });
        }
        
        // Validação básica para cada item no array
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
