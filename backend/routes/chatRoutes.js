// backend/routes/chatRoutes.js
const express = require("express")
const router = express.Router()
const path = require("path")
const fs = require("fs")
const multer = require("multer")
const { v4: uuidv4 } = require("uuid")

// Middleware de autenticação
const { requireAuth } = require("../middleware/authMiddleware")

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Obter o JID do cliente da requisição
    const clientJid = req.body.clientJid
    if (!clientJid) {
      return cb(new Error("JID do cliente não fornecido"), null)
    }

    // Limpar o JID para usar como nome de pasta (remover caracteres inválidos)
    const cleanJid = clientJid.replace(/[^a-zA-Z0-9]/g, "_")

    // Criar pasta para o cliente se não existir
    const clientDir = path.join(__dirname, "../../uploads/clientes", cleanJid)
    fs.mkdirSync(clientDir, { recursive: true })

    cb(null, clientDir)
  },
  filename: (req, file, cb) => {
    // Gerar nome único para o arquivo
    const uniqueFilename = `${Date.now()}_${uuidv4()}_${file.originalname}`
    cb(null, uniqueFilename)
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Verificar tipos de arquivo permitidos
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "audio/mpeg",
      "audio/mp3",
      "audio/ogg",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ]

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error("Tipo de arquivo não suportado"), false)
    }
  },
})

// Rota para upload de mídia
router.post("/upload-media", requireAuth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Nenhum arquivo enviado" })
    }

    // Construir URL para o arquivo
    const fileUrl = `/uploads/clientes/${req.body.clientJid.replace(/[^a-zA-Z0-9]/g, "_")}/${req.file.filename}`

    res.json({
      success: true,
      url: fileUrl,
      caption: req.body.caption || "",
      filename: req.file.filename,
      mimetype: req.file.mimetype,
    })
  } catch (error) {
    console.error("Erro no upload de mídia:", error)
    res.status(500).json({ success: false, message: error.message })
  }
})

module.exports = router
