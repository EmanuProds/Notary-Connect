// backend/routes/chatRoutes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Middleware de autenticação (exemplo, substitua pelo seu)
// const { requireAuth } = require("../middleware/authMiddleware"); // Descomente e implemente se usar

// A função exportada agora aceita sendLogFunc
module.exports = function(sendLogFunc, /* outros serviços se necessário */) {
    const router = express.Router();
    // Define a função de log, usando a fornecida ou um console.log como fallback.
    const log = sendLogFunc || ((msg, level = 'info') => console[level](`[ChatRoutes] ${msg}`));

    // Middleware de autenticação simulado para este exemplo.
    // Em um ambiente de produção, substitua pela sua lógica real de autenticação (ex: verificar token JWT, sessão).
    const requireAuth = (req, res, next) => {
        log("Middleware requireAuth chamado (ATENÇÃO: lógica de autenticação real necessária para /upload-media).", "debug");
        // Exemplo de lógica real (requer implementação de sessão/token):
        // if (req.isAuthenticated && req.isAuthenticated()) { // Exemplo com Passport.js
        //   return next();
        // }
        // res.status(401).json({ success: false, message: "Não autorizado. Faça login para continuar." });
        next(); // Por enquanto, permite todas as requisições.
    };


    // Configuração do multer para upload de arquivos
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        // Tenta obter o JID do cliente do corpo da requisição ou da query string.
        const clientJidForPath = req.body.clientJid || req.query.clientJid || 'unknown_client';
        if (!clientJidForPath || clientJidForPath === 'unknown_client') {
          log("JID do cliente não fornecido para upload, usando 'unknown_client' como nome da pasta.", "warn");
          // Considerar retornar um erro aqui se o JID for estritamente necessário para a organização.
        }

        // Limpa o JID para criar um nome de diretório seguro.
        const cleanJid = clientJidForPath.replace(/[^a-zA-Z0-9.-_]/g, "_");
        
        // Define o caminho base para uploads, idealmente configurável e fora da pasta 'backend'.
        const uploadsBaseDir = path.join(__dirname, "..", "..", "uploads"); // Ex: RaizDoProjeto/uploads
        const clientDir = path.join(uploadsBaseDir, "clientes", cleanJid); // Ex: RaizDoProjeto/uploads/clientes/JID_Limpo
        
        try {
            // Garante que os diretórios de destino existam.
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
        // Gera um nome de arquivo único para evitar conflitos, mantendo a extensão original.
        const uniqueSuffix = `${Date.now()}_${uuidv4()}`;
        const extension = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, extension).replace(/\s+/g, '_'); // Remove espaços do nome base
        const finalFilename = `${baseName}_${uniqueSuffix}${extension}`;
        cb(null, finalFilename);
      },
    });

    const upload = multer({
      storage: storage,
      limits: {
        fileSize: 15 * 1024 * 1024, // Limite de tamanho do arquivo (ex: 15MB)
      },
      fileFilter: (req, file, cb) => {
        // Define os tipos de arquivo permitidos.
        const allowedTypes = [
          "image/jpeg", "image/png", "image/gif", "image/webp",
          "video/mp4", "video/webm", "video/ogg",
          "audio/mpeg", "audio/mp3", "audio/ogg", "audio/wav", "audio/aac", "audio/opus",
          "application/pdf", "application/msword", 
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
          "application/vnd.ms-excel", 
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
          "application/vnd.ms-powerpoint", 
          "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
          "text/plain", "application/zip", "application/x-rar-compressed"
        ];

        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true); // Aceita o arquivo
        } else {
          log(`Upload bloqueado: Tipo de arquivo não suportado - ${file.mimetype}`, "warn");
          cb(new Error("Tipo de arquivo não suportado."), false); // Rejeita o arquivo
        }
      },
    });

    // Rota para upload de mídia.
    // `requireAuth` é o middleware de autenticação (atualmente um placeholder).
    router.post("/upload-media", requireAuth, upload.single("file"), (req, res) => {
      try {
        if (!req.file) {
          log("Tentativa de upload sem arquivo.", "warn");
          return res.status(400).json({ success: false, message: "Nenhum arquivo enviado." });
        }

        // Recria o caminho relativo para a URL de acesso.
        const clientJidForPath = req.body.clientJid || req.query.clientJid || 'unknown_client';
        const cleanJid = clientJidForPath.replace(/[^a-zA-Z0-9.-_]/g, "_");
        
        // A URL deve ser relativa à pasta 'uploads' que é servida estaticamente.
        const fileUrl = `/uploads/clientes/${cleanJid}/${req.file.filename}`;
        log(`Arquivo enviado com sucesso: ${req.file.filename}. URL de acesso: ${fileUrl}`, "info");

        res.json({
          success: true,
          url: fileUrl, // URL que o frontend usará para exibir/linkar o arquivo.
          fileName: req.file.filename, // Nome do arquivo como salvo no servidor.
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          caption: req.body.caption || "" // Legenda opcional enviada com o arquivo.
        });
      } catch (error) {
        log(`Erro no upload de mídia: ${error.message}`, "error");
        console.error(error); // Log completo do erro para debug no console do servidor.
        res.status(500).json({ success: false, message: error.message || "Erro interno no servidor durante o upload." });
      }
    });

    return router;
};
