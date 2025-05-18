// frontend/web/js/adminScript.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("[AdminScript] DOMContentLoaded disparado.");

    // Elementos da UI de Navegação
    const navRoboBtn = document.getElementById('navRoboBtn');
    const navRespostasBtn = document.getElementById('navRespostasBtn');
    const navFuncionariosBtn = document.getElementById('navFuncionariosBtn');
    const navConfiguracoesBtn = document.getElementById('navConfiguracoesBtn');

    const roboSection = document.getElementById('roboSection');
    const respostasSection = document.getElementById('respostasSection');
    const funcionariosSection = document.getElementById('funcionariosSection');
    const configuracoesSection = document.getElementById('configuracoesSection');

    const navButtons = [navRoboBtn, navRespostasBtn, navFuncionariosBtn, navConfiguracoesBtn];
    const contentSections = [roboSection, respostasSection, funcionariosSection, configuracoesSection];

    // Elementos da Seção Robô
    const qrDisplay = document.getElementById('qrDisplay');
    const qrStatusText = document.getElementById('qrStatusText');
    const botActionsDiv = document.getElementById('botActions');
    const pauseBotBtn = document.getElementById('pauseBotBtn');
    const restartBotBtn = document.getElementById('restartBotBtn');
    
    const connectionStatusDiv = document.getElementById('connectionStatus');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const openDevToolsBtnAdmin = document.getElementById('openDevToolsBtnAdmin');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!navRoboBtn) console.error("[AdminScript] ERRO: navRoboBtn não encontrado!");
    if (!roboSection) console.error("[AdminScript] ERRO: roboSection não encontrado!");
    if (!qrDisplay) console.error("[AdminScript] ERRO: qrDisplay não encontrado!");
    if (!qrStatusText) console.error("[AdminScript] ERRO: qrStatusText não encontrado!");

    const sessionId = "whatsapp-bot-session"; 
    const wsUrl = `ws://localhost:3000/admin-qr`; 
    let websocket;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let reconnectTimeout = null;
    const baseReconnectDelay = 3000;

    const iconPathWarning = './img/icons/warning.svg';
    const iconPathCheckmark = './img/icons/checkmark.svg';
    const svgIconSpinner = `<svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    function escapeHTML(str) {
        if (typeof str !== 'string') return String(str === null || str === undefined ? '' : str);
        return str.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
    }

    function setActiveSection(sectionIdToShow) {
        console.log(`[AdminScript] Tentando ativar seção: ${sectionIdToShow}`);
        let foundSection = false;
        navButtons.forEach(btn => {
            if (btn) { 
                if (btn.dataset.section === sectionIdToShow) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });
        contentSections.forEach(section => {
            if (section) { 
                if (section.id === sectionIdToShow) {
                    section.classList.add('active');
                    foundSection = true;
                    console.log(`[AdminScript] Seção ${sectionIdToShow} ativada.`);
                } else {
                    section.classList.remove('active');
                }
            }
        });
        if (!foundSection) {
            console.warn(`[AdminScript] Seção ${sectionIdToShow} não encontrada no DOM ou ID não corresponde.`);
        }
    }

    navButtons.forEach(button => {
        if (button) { 
            button.addEventListener('click', (e) => {
                const sectionId = e.currentTarget.dataset.section;
                console.log(`[AdminScript] Botão de navegação clicado: ${e.currentTarget.id}, data-section: ${sectionId}`);
                if (sectionId) {
                    setActiveSection(sectionId);
                } else {
                    console.error("[AdminScript] Botão de navegação sem 'data-section' definido:", e.currentTarget);
                }
            });
        }
    });

    function updateBotStatusUI(clientData) {
        if (!qrDisplay || !qrStatusText) {
            console.error("[AdminScript] Elementos da UI do robô (qrDisplay, qrStatusText) não encontrados! Não é possível atualizar UI.");
            return;
        }
        console.log("[AdminScript] Atualizando UI do bot com dados:", clientData);
        qrStatusText.className = 'qr-status-text text-sm mb-4 text-center'; 
        qrDisplay.innerHTML = ''; 
        qrDisplay.classList.remove('svg-error', 'svg-success'); 

        if (clientData.status === 'QR_CODE') {
            if (clientData.qrCode && typeof clientData.qrCode === 'string' && clientData.qrCode.trim() !== '') {
                try {
                    new QRCode(qrDisplay, {
                        text: clientData.qrCode,
                        width: 160, 
                        height: 160,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    qrStatusText.textContent = 'Escaneie o QR Code com o WhatsApp.';
                    qrStatusText.classList.add('text-blue-600');
                    if(botActionsDiv) botActionsDiv.style.display = 'none';
                } catch (qrError) {
                    console.error("[AdminScript] Erro ao instanciar QRCode:", qrError);
                    qrDisplay.innerHTML = `<img src="${iconPathWarning}" alt="Erro ao gerar QR" class="status-icon-svg">`;
                    qrDisplay.classList.add('svg-error');
                    qrStatusText.textContent = 'Falha ao gerar QR Code.';
                    qrStatusText.classList.add('error');
                }
            } else {
                qrDisplay.innerHTML = `<img src="${iconPathWarning}" alt="QR Inválido" class="status-icon-svg">`;
                qrDisplay.classList.add('svg-error');
                qrStatusText.textContent = 'QR Code inválido.';
                qrStatusText.classList.add('error');
            }
        } else if (clientData.status === 'READY') {
            qrDisplay.innerHTML = `<img src="${iconPathCheckmark}" alt="Conectado" class="status-icon-svg">`;
            qrDisplay.classList.add('svg-success');
            qrStatusText.textContent = `Robô Conectado! (JID: ${clientData.jid || 'N/A'})`;
            qrStatusText.classList.add('ready');
            if(botActionsDiv) botActionsDiv.style.display = 'flex'; 
        } else if (clientData.status === 'DISCONNECTED' || clientData.status === 'AUTH_FAILURE' || clientData.status === 'FATAL_ERROR' || clientData.status === 'RESTARTING') {
            qrDisplay.innerHTML = `<img src="${iconPathWarning}" alt="Desconectado/Erro" class="status-icon-svg">`;
            qrDisplay.classList.add('svg-error');
            let statusMessage = `Robô ${clientData.status === 'RESTARTING' ? 'Reiniciando' : 'Desconectado'}.`;
            let reasonText = clientData.error ? ` Razão: ${escapeHTML(String(clientData.error))}` : (clientData.reason ? ` Razão: ${escapeHTML(String(clientData.reason))}` : '');
            if (clientData.status === 'AUTH_FAILURE') reasonText = ' Falha na autenticação. Verifique o WhatsApp.';
            qrStatusText.textContent = statusMessage + reasonText;
            qrStatusText.classList.add('error');
            if(botActionsDiv) botActionsDiv.style.display = 'none';
        } else if (clientData.status) { 
            qrDisplay.innerHTML = `<div class="qr-code-placeholder">${svgIconSpinner}</div>`;
            qrStatusText.textContent = escapeHTML(clientData.status);
            qrStatusText.classList.add('text-gray-600');
            if(botActionsDiv) botActionsDiv.style.display = 'none';
        } else {
            qrDisplay.innerHTML = `<div class="qr-code-placeholder">${svgIconSpinner}</div>`; 
            qrStatusText.textContent = "Aguardando status do robô...";
            qrStatusText.classList.add('text-gray-500');
            if(botActionsDiv) botActionsDiv.style.display = 'none';
        }
    }
    
    if(pauseBotBtn) {
        pauseBotBtn.addEventListener('click', () => {
            console.log("[AdminScript] Botão Pausar Robô clicado.");
            if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === 'function') { 
                window.electronAPI.sendIpcMessage('control-bot', { action: 'pause', sessionId: sessionId });
            } else {
                console.error("[AdminScript] electronAPI.sendIpcMessage não disponível.");
            }
        });
    }

    if(restartBotBtn) {
        restartBotBtn.addEventListener('click', () => {
            console.log("[AdminScript] Botão Reiniciar Robô clicado.");
            if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === 'function') {
                if (confirm("Tem certeza que deseja reiniciar o robô? Isso exigirá escanear um novo QR Code.")) {
                    window.electronAPI.sendIpcMessage('control-bot', { action: 'restart', sessionId: sessionId });
                    qrStatusText.textContent = "Solicitando reinício do robô...";
                    qrDisplay.innerHTML = `<div class="qr-code-placeholder">${svgIconSpinner}</div>`;
                    if(botActionsDiv) botActionsDiv.style.display = 'none';
                }
            } else {
                console.error("[AdminScript] electronAPI.sendIpcMessage não disponível.");
            }
        });
    }

    function updateWebSocketConnectionStatus(statusKey, message = '') {
        if (!connectionStatusDiv) return;
        connectionStatusDiv.className = 'connection-status-bar fixed bottom-0 left-0 w-full p-2 text-center text-sm font-medium z-50 transition-colors duration-300';
        let statusText = '';
        if (statusKey === 'connected') {
            statusText = 'Conectado ao Servidor WebSocket';
            connectionStatusDiv.classList.add('bg-green-500', 'text-white');
            connectionStatusDiv.classList.remove('bg-yellow-400', 'text-yellow-800', 'bg-red-400');
        } else if (statusKey === 'connecting') {
            statusText = 'Conectando ao Servidor WebSocket...';
            connectionStatusDiv.classList.add('bg-yellow-400', 'text-yellow-800');
            connectionStatusDiv.classList.remove('bg-green-500', 'text-white', 'bg-red-400');
        } else if (statusKey === 'disconnected') {
            statusText = 'Desconectado do Servidor WebSocket';
            connectionStatusDiv.classList.add('bg-red-400', 'text-white');
            connectionStatusDiv.classList.remove('bg-green-500', 'bg-yellow-400', 'text-yellow-800');
        }
        connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : '');
    }

    function connectWebSocket() {
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            console.log("[AdminScript] WebSocket já conectado ou conectando.");
            return;
        }
        updateWebSocketConnectionStatus('connecting');
        console.log(`[AdminScript] Tentando conectar WebSocket em ${wsUrl}`);
        try {
            websocket = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[AdminScript] Erro ao criar objeto WebSocket:', e);
            updateWebSocketConnectionStatus('disconnected', 'Erro ao criar WebSocket');
            reconnectWebSocket();
            return;
        }

        websocket.onopen = () => {
            console.log("[AdminScript] Conexão WebSocket (Admin QR) ABERTA.");
            updateWebSocketConnectionStatus('connected');
            reconnectAttempts = 0;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
            if (websocket.readyState === WebSocket.OPEN) {
                console.log("[AdminScript] Solicitando status inicial do servidor Baileys...");
                websocket.send(JSON.stringify({ type: 'request_initial_status', clientType: 'admin-qr', sessionId: sessionId }));
            }
        };

        websocket.onmessage = (event) => {
            console.log('[AdminScript] Mensagem WebSocket recebida:', String(event.data).substring(0, 250));
            let data;
            try {
                data = JSON.parse(event.data);
                console.log('[AdminScript] Mensagem parseada:', data);
            } catch (e) {
                console.error("[AdminScript] Erro ao parsear JSON da mensagem WebSocket:", e, "Dados brutos:", event.data);
                return;
            }

            if (data.clientId === sessionId || !data.clientId || data.type === 'bot_status_update') { 
                console.log('[AdminScript] Processando mensagem para o bot:', data.type, data.payload);
                if ((data.type === 'status_update' || data.type === 'initial_status' || data.type === 'bot_status_update') && data.payload) {
                    updateBotStatusUI(data.payload);
                    if (typeof data.payload.isPaused === 'boolean' && pauseBotBtn) {
                        const pauseIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
                        const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg>`;
                        pauseBotBtn.innerHTML = (data.payload.isPaused ? playIcon : pauseIcon) + (data.payload.isPaused ? 'Continuar Robô' : 'Pausar Robô');
                    }
                } else if (data.type === 'qr_code' && data.payload) {
                    updateBotStatusUI({ status: 'QR_CODE', qrCode: data.payload.qr || data.payload.qrCode || data.payload });
                } else if (data.type === 'pong') {
                    // console.log('[AdminScript] Pong recebido.');
                } else {
                    console.warn("[AdminScript] Formato de mensagem WebSocket desconhecido ou sem payload:", data);
                }
            } else {
                console.log(`[AdminScript] Mensagem ignorada para clientId: ${data.clientId}`);
            }
        };

        websocket.onerror = (errorEvent) => {
            console.error('[AdminScript] Erro no WebSocket (Admin QR):', errorEvent);
        };

        websocket.onclose = (event) => {
            console.log(`[AdminScript] Conexão WebSocket (Admin QR) fechada. Código=${event.code}, Limpa=${event.wasClean}, Razão=${event.reason ? event.reason.toString() : 'N/A'}`);
            updateWebSocketConnectionStatus('disconnected', `Código: ${event.code}`);
            if (!event.wasClean && !reconnectTimeout) { 
                reconnectWebSocket();
            }
        };
    }

    function reconnectWebSocket() {
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000);
            updateWebSocketConnectionStatus('connecting', `Tentativa ${reconnectAttempts}`);
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                connectWebSocket();
            }, delay);
        } else {
            updateWebSocketConnectionStatus('disconnected', 'Falha ao reconectar');
            if (qrStatusText) qrStatusText.textContent = "Não foi possível reconectar ao servidor.";
            if (qrDisplay) {
                 qrDisplay.innerHTML = `<img src="${iconPathWarning}" alt="Falha na conexão" class="status-icon-svg svg-error">`;
            }
        }
    }

    // Inicialização
    console.log("[AdminScript] Inicializando UI da página Admin...");
    if (navRoboBtn) {
        setActiveSection('roboSection'); 
    } else {
        console.error("[AdminScript] Botão de navegação 'Robô' (navRoboBtn) não encontrado na inicialização.");
        const firstAvailableSection = contentSections.find(s => s && s.id);
        if (firstAvailableSection) {
            setActiveSection(firstAvailableSection.id);
        } else {
            console.error("[AdminScript] Nenhuma seção de conteúdo válida encontrada para ativar por padrão.");
        }
    }
    connectWebSocket();

    if (viewLogsBtn && window.electronAPI && typeof window.electronAPI.navigate === 'function') {
        viewLogsBtn.addEventListener('click', () => window.electronAPI.navigate('logs'));
    }
    if (openDevToolsBtnAdmin && window.electronAPI && typeof window.electronAPI.openDevTools === 'function') {
        openDevToolsBtnAdmin.addEventListener('click', () => window.electronAPI.openDevTools());
    }
    if (logoutBtn && window.electronAPI && typeof window.electronAPI.navigate === 'function') {
        logoutBtn.addEventListener('click', () => {
            if (window.electronAPI.sendIpcMessage) {
                window.electronAPI.sendIpcMessage('admin-logout'); 
            }
            window.electronAPI.navigate('login');
        });
    }
});
