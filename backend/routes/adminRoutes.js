// backend/routes/adminRoutes.js
const express = require("express")
const router = express.Router()
const bcrypt = require("bcryptjs") // Ou bcrypt, conforme seu package.json
const sqliteService = require("../services/sqliteService")

let globalSendLog = (msg, level) => console[level || "log"](msg) 

function setLogger(logger) {
  globalSendLog = logger
}

// Middleware para verificar se o usuário é admin (simplificado para o exemplo)
// Em um app real, isso viria de uma sessão/token JWT após o login
async function isAdmin(req, res, next) {
  // Para este exemplo, vamos assumir que o frontend envia um header ou campo
  // que identifica o usuário como admin. Em um sistema real, use autenticação robusta.
  // const userMakingRequest = req.headers['x-user-role']; // Exemplo
  // if (userMakingRequest === 'admin') {
  //   next();
  // } else {
  //   return res.status(403).json({ success: false, message: "Permissão negada." });
  // }
  next(); // Por enquanto, permite todas as ações para teste. Implemente a lógica de admin real.
}

// Rotas para Respostas Automáticas
router.get("/responses", async (req, res) => {
  try {
    const responses = await sqliteService.getAllAutoResponses()
    res.json({ success: true, data: responses })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar respostas automáticas: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar respostas automáticas." })
  }
})

router.get("/responses/:id", async (req, res) => {
  try {
    const response = await sqliteService.getAutoResponseById(req.params.id)
    if (!response) {
      return res.status(404).json({ success: false, message: "Resposta automática não encontrada." })
    }
    res.json({ success: true, data: response })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar resposta automática: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar resposta automática." })
  }
})

router.post("/responses", isAdmin, async (req, res) => {
  try {
    const { 
        response_key, response_name, pattern, response_text, 
        active, priority, start_time, end_time, allowed_days,
        typing_delay_ms, response_delay_ms // Novos campos
    } = req.body;

    // Validação básica
    if (!response_key || !response_name || !pattern || !response_text) {
        return res.status(400).json({ success: false, message: "Campos obrigatórios (chave, nome, padrão, texto) não fornecidos." });
    }
    if (typing_delay_ms === undefined || response_delay_ms === undefined) {
        return res.status(400).json({ success: false, message: "Campos de delay (typing_delay_ms, response_delay_ms) são obrigatórios." });
    }


    const result = await sqliteService.createAutoResponse({
        response_key, response_name, pattern, response_text, 
        active, priority, start_time, end_time, allowed_days,
        typing_delay_ms, response_delay_ms
    });
    res.status(201).json({ success: true, message: "Resposta automática criada com sucesso.", id: result.lastID })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao criar resposta automática: ${error.message}`, "error")
    if (error.message.includes("UNIQUE constraint failed")) {
        return res.status(409).json({ success: false, message: "Erro: A chave da resposta já existe." });
    }
    res.status(500).json({ success: false, message: "Erro ao criar resposta automática." })
  }
})

router.put("/responses/:id", isAdmin, async (req, res) => {
  try {
    const { 
        response_key, response_name, pattern, response_text, 
        active, priority, start_time, end_time, allowed_days,
        typing_delay_ms, response_delay_ms // Novos campos
    } = req.body;

    if (!response_key || !response_name || !pattern || !response_text) {
        return res.status(400).json({ success: false, message: "Campos obrigatórios não fornecidos." });
    }
    if (typing_delay_ms === undefined || response_delay_ms === undefined) {
        return res.status(400).json({ success: false, message: "Campos de delay são obrigatórios." });
    }

    await sqliteService.updateAutoResponse(req.params.id, {
        response_key, response_name, pattern, response_text, 
        active, priority, start_time, end_time, allowed_days,
        typing_delay_ms, response_delay_ms
    });
    res.json({ success: true, message: "Resposta automática atualizada com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao atualizar resposta automática: ${error.message}`, "error")
     if (error.message.includes("UNIQUE constraint failed")) {
        return res.status(409).json({ success: false, message: "Erro: A chave da resposta já existe para outra resposta." });
    }
    res.status(500).json({ success: false, message: "Erro ao atualizar resposta automática." })
  }
})

router.delete("/responses/:id", isAdmin, async (req, res) => {
  try {
    await sqliteService.deleteAutoResponse(req.params.id)
    res.json({ success: true, message: "Resposta automática excluída com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao excluir resposta automática: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao excluir resposta automática." })
  }
})

// Rotas para Funcionários (sem alterações nos campos de delay)
router.get("/attendants", async (req, res) => {
  try {
    const attendants = await sqliteService.getAllAttendants()
    res.json({ success: true, data: attendants })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar atendentes: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar atendentes." })
  }
})

router.get("/attendants/:id", async (req, res) => {
  try {
    const attendant = await sqliteService.getAttendantById(req.params.id)
    if (!attendant) {
      return res.status(404).json({ success: false, message: "Atendente não encontrado." })
    }
    res.json({ success: true, data: attendant })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar atendente: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar atendente." })
  }
})

router.post("/attendants", isAdmin, async (req, res) => {
  try {
    const { username, password, name, is_admin, sector, direct_contact_number } = req.body

    if (!username || !password || !name) {
      return res.status(400).json({ success: false, message: "Usuário, senha e nome são obrigatórios." })
    }

    const existingAttendant = await sqliteService.getAttendantByUsername(username)
    if (existingAttendant) {
      return res.status(409).json({ success: false, message: "Usuário já existe." })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newAttendantData = {
      USERNAME: username, // sqliteService espera USERNAME em maiúsculas
      PASSWORD_HASH: hashedPassword,
      NAME: name,
      IS_ADMIN: is_admin || false,
      SECTOR: Array.isArray(sector) ? sector.join(',') : sector, // Converte array para string se necessário
      DIRECT_CONTACT_NUMBER: direct_contact_number,
    }
    // A função createAttendant no sqliteService agora espera ser chamada dentro de uma transação
    // ou que ela própria gerencie a transação. Para este exemplo, assumimos que
    // o sqliteService.createAttendant pode ser chamado diretamente se não precisar de transação externa
    // ou que a transação é gerenciada internamente por ela.
    // Se createAttendant EXIGE dbInstance, a lógica aqui precisaria mudar para usar executeTransaction.
    // Com a versão atualizada do sqliteService, createAttendant não precisa mais de dbInstance.
    await sqliteService.createAttendant(newAttendantData);


    globalSendLog(`[AdminRoutes] Novo atendente criado: ${username}`, "info")
    res.status(201).json({ success: true, message: "Atendente criado com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao criar atendente: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao criar atendente." })
  }
})

router.put("/attendants/:id", isAdmin, async (req, res) => {
  try {
    const { username, password, name, is_admin, sector, direct_contact_number } = req.body

    if (!username || !name) {
      return res.status(400).json({ success: false, message: "Usuário e nome são obrigatórios." })
    }

    const attendant = await sqliteService.getAttendantById(req.params.id)
    if (!attendant) {
      return res.status(404).json({ success: false, message: "Atendente não encontrado." })
    }

    const updateData = {
      USERNAME: username,
      NAME: name,
      IS_ADMIN: is_admin || false,
      SECTOR: Array.isArray(sector) ? sector.join(',') : sector,
      DIRECT_CONTACT_NUMBER: direct_contact_number,
    }

    if (password) {
      const salt = await bcrypt.genSalt(10)
      updateData.PASSWORD_HASH = await bcrypt.hash(password, salt)
    }

    await sqliteService.updateAttendant(req.params.id, updateData)

    res.json({ success: true, message: "Atendente atualizado com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao atualizar atendente: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao atualizar atendente." })
  }
})

router.delete("/attendants/:id", isAdmin, async (req, res) => {
  try {
    await sqliteService.deleteAttendant(req.params.id)
    res.json({ success: true, message: "Atendente excluído com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao excluir atendente: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao excluir atendente." })
  }
})

// Rotas para Setores
router.get("/sectors", async (req, res) => {
  try {
    const sectors = await sqliteService.getAllSectors()
    res.json({ success: true, data: sectors })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar setores: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar setores." })
  }
})

// Rotas para Configurações
router.get("/config", async (req, res) => {
  try {
    const configs = await sqliteService.getAllConfigs()
    res.json({ success: true, data: configs })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar configurações: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar configurações." })
  }
})

router.get("/config/:key", async (req, res) => {
  try {
    const config = await sqliteService.getConfigByKey(req.params.key)
    if (!config) {
      return res.status(404).json({ success: false, message: "Configuração não encontrada." })
    }
    res.json({ success: true, data: config })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao buscar configuração: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao buscar configuração." })
  }
})

router.post("/config", isAdmin, async (req, res) => {
  try {
    const { key, value, type, description } = req.body

    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: "Chave e valor são obrigatórios." })
    }

    await sqliteService.setConfig(key, String(value), type, description) // Garante que value seja string
    res.json({ success: true, message: "Configuração salva com sucesso." })
  } catch (error) {
    globalSendLog(`[AdminRoutes] Erro ao salvar configuração: ${error.message}`, "error")
    res.status(500).json({ success: false, message: "Erro ao salvar configuração." })
  }
})

module.exports = { router, setLogger }
