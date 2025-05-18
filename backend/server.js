// backend/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const websocketService = require('./services/websocketService');
const baileysService = require('./services/baileysService');
const firebirdService = require('./services/firebirdService'); // Para inicializar o pool talvez

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/web')));

app.use('/api/auth', authRoutes); // Rotas de autenticação, ex: /api/auth/login

// Redirecionar /login para servir index.html se for acesso direto
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/web/index.html'));
});
app.get('/admin/qr', (req, res) => { // Exemplo de rota protegida (adicionar middleware de auth)
    res.sendFile(path.join(__dirname, '../frontend/web/admin.html'));
});
app.get('/atendente/chat', (req, res) => { // Exemplo de rota protegida
    res.sendFile(path.join(__dirname, '../frontend/web/chat.html'));
});


const PORT = process.env.PORT || 3000;

// Inicializar Firebird (ex: criar pool se o driver suportar)
// firebirdService.initialize();

// Inicializar WebSocket Server
websocketService.initializeWebSocketServer(server);

// Conectar ao WhatsApp
baileysService.connectToWhatsApp().then(() => {
    console.log("Baileys service started.");
}).catch(err => {
    console.error("Failed to start Baileys service:", err);
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Nota: adminScript.js usa wss://localhost:3000. Você precisará de HTTPS ou mudar para ws://
    // Para HTTPS, use o módulo `https` e configure certificados.
});