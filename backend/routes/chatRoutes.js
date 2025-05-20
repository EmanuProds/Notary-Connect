// backend/routes/chatRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Middleware de autenticação (assumindo que você tem um)
// const { requireAuth } = require("../middleware/authMiddleware"); // Descomente se usar

// A função exportada agora aceita sendLogFunc (e outros serviços, se necessário no futuro)
module.exports = function(sendLogFunc) {
    const router = express.Router();
    const log = sendLogFunc || ((msg, level = 'info') => console[level](`[ChatRoutes] ${msg}`));

    // Middleware de autenticação simulado para este exemplo
    // Substitua pela sua lógica real de autenticação para proteger esta rota
    const requireAuth = (req, res, next) => {
        log("Middleware requireAuth chamado (lógica de autenticação real necessária para /upload-media).", "debug");
        // Exemplo: if (req.user) next(); else res.status(401).send('Não autorizado');
        next(); 
    };


    // Configuração do multer para upload de arquivos
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const clientJidForPath = req.body.clientJid || req.query.clientJid || 'unknown_client'; // Tenta obter de body ou query
        if (!clientJidForPath || clientJidForPath === 'unknown_client') {
          log("JID do cliente não fornecido para upload, usando 'unknown_client'.", "warn");
          // Não retorna erro aqui, mas loga. O ideal seria validar antes.
        }

        const cleanJid = clientJidForPath.replace(/[^a-zA-Z0-9.-_]/g, "_"); // Permite . e - também
        
        // Caminho base para uploads, idealmente fora da pasta 'backend'
        const uploadsBaseDir = path.join(__dirname, "..", "..", "uploads"); 
        const clientDir = path.join(uploadsBaseDir, "clientes", cleanJid);
        
        try {
            if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir, { recursive: true });
            if (!fs.existsSync(path.join(uploadsBaseDir, "clientes"))) fs.mkdirSync(path.join(uploadsBaseDir, "clientes"), { recursive: true });
            if (!fs.existsSync(clientDir)) fs.mkdirSync(clientDir, { recursive: true });
            cb(null, clientDir);
        } catch (error) {
            log(`Erro ao criar diretório de upload ${clientDir}: ${error.message}`, "error");
            cb(new Error("Falha ao criar diretório de upload."), null);
        }
      },
      filename: (req, file, cb) => {
        const uniqueFilename = `${Date.now()}_${uuidv4()}_${file.originalname.replace(/\s+/g, '_')}`; // Remove espaços do nome original
        cb(null, uniqueFilename);
      },
    });

    const upload = multer({
      storage: storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // Aumentado para 10MB
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          "image/jpeg", "image/png", "image/gif", "image/webp",
          "video/mp4", "video/webm", "video/ogg",
          "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/aac",
          "application/pdf", "application/msword", 
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel", 
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint", 
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain", "application/zip", "application/x-rar-compressed"
        ];

        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          log(`Upload bloqueado: Tipo de arquivo não suportado - ${file.mimetype}`, "warn");
          cb(new Error("Tipo de arquivo não suportado"), false);
        }
      },
    });

    // Rota para upload de mídia
    // Adicionado requireAuth (simulado) - implemente sua autenticação real
    router.post("/upload-media", requireAuth, upload.single("file"), (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, message: "Nenhum arquivo enviado" });
        }

        const clientJidForPath = req.body.clientJid || req.query.clientJid || 'unknown_client';
        const cleanJid = clientJidForPath.replace(/[^a-zA-Z0-9.-_]/g, "_");
        
        // URL relativa para o cliente acessar o arquivo
        const fileUrl = `/uploads/clientes/${cleanJid}/${req.file.filename}`;
        log(`Arquivo enviado com sucesso: ${fileUrl}`, "info");

        res.json({
          success: true,
          url: fileUrl, // URL que o frontend usará para exibir/linkar
          fileName: req.file.filename, // Nome do arquivo no servidor
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          caption: req.body.caption || ""
        });
      } catch (error) {
        log(`Erro no upload de mídia: ${error.message}`, "error");
        console.error(error); // Log completo do erro para debug
        res.status(500).json({ success: false, message: error.message || "Erro interno no servidor durante o upload." });
      }
    });

    return router;
};
