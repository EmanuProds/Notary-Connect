// frontend/web/js/adminScript.js

// Manipulador global para erros não capturados
window.onerror = function(message, source, lineno, colno, error) {
    console.error("adminScript.js: Erro GLOBAL NÃO CAPTURADO:", message, "em", source, lineno + ":" + colno, error);
    // Enviar para o processo principal para log centralizado, se desejado
    // if (window.electronAPI && window.electronAPI.sendLog) {
    //     window.electronAPI.sendLog(`Erro não capturado em adminScript.js: ${message} em ${source}:${lineno}`, 'error');
    // }
    return true;
};

// Manipulador global para rejeições de promessas não capturadas
window.onunhandledrejection = function(event) {
    console.error("adminScript.js: Rejeição de PROMESSA NÃO CAPTURADA:", event.reason);
    // if (window.electronAPI && window.electronAPI.sendLog) {
    //     window.electronAPI.sendLog(`Rejeição de promessa não capturada em adminScript.js: ${event.reason}`, 'error');
    // }
    return true;
};

document.addEventListener('DOMContentLoaded', () => {
    /**
     * Escapa caracteres HTML para exibição segura.
     * @param {string} str - A string para escapar.
     * @returns {string} A string escapada.
     */
    function escapeHTML(str) {
        if (typeof str !== 'string') return String(str === null || str === undefined ? '' : str);
        return str.replace(/[&<>"']/g, function (match) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
        });
    }

    const qrContainer = document.getElementById('qrContainer');
    const connectionStatusDiv = document.getElementById('connectionStatus');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const openDevToolsBtnAdmin = document.getElementById('openDevToolsBtnAdmin');

    // Configuração dos setores (pode vir do backend no futuro)
    const sectorsConfig = {
        "whatsapp-bot-session": "Principal (Bot)",
    };
    const sectorIds = Object.keys(sectorsConfig);
    const sectorElements = {};

    function initializeUI() {
        if (!qrContainer) {
            console.error("adminScript.js: Elemento qrContainer não encontrado no DOM!");
            return;
        }
        qrContainer.innerHTML = '';

        if (sectorIds.length === 0) {
            qrContainer.innerHTML = '<div class="all-ready-message" style="color: #ef4444;">Nenhum cliente WhatsApp configurado para exibir QR Codes.</div>';
            return;
        }

        sectorIds.forEach(sectorId => {
            const sectorBlock = document.createElement('div');
            sectorBlock.classList.add('qr-block');
            sectorBlock.dataset.sectorId = sectorId;

            sectorBlock.innerHTML = `
                <h3 class="text-lg font-semibold text-gray-700 mb-2">${escapeHTML(sectorsConfig[sectorId])}</h3>
                <div class="qr-code" id="qr-${sectorId}" style="display: flex; align-items: center; justify-content: center; text-align: center; word-break: break-all; font-size: 10px; padding: 5px; min-height: 150px; border: 1px dashed #ccc; background-color: white; border-radius: 0.375rem;">
                    <div class="qr-code-placeholder">
                        <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                </div>
                <div class="qr-status mt-2 text-sm text-gray-600" id="status-${sectorId}">Aguardando conexão...</div>
            `;
            qrContainer.appendChild(sectorBlock);
            sectorElements[sectorId] = {
                block: sectorBlock,
                qrCodeDiv: sectorBlock.querySelector(`#qr-${sectorId}`),
                statusDiv: sectorBlock.querySelector(`#status-${sectorId}`)
            };
            console.log(`adminScript.js: UI inicializada para setor ${sectorId}`);
        });
    }

    function updateWebSocketConnectionStatus(statusKey, message = '') {
        if (!connectionStatusDiv) return;
        connectionStatusDiv.className = 'connection-status-bar fixed bottom-0 left-0 w-full p-2 text-center text-sm font-medium z-50 transition-colors duration-300'; // Tailwind classes
        let statusText = '';
        if (statusKey === 'connected') {
            statusText = 'Conectado ao Servidor WebSocket';
            connectionStatusDiv.classList.add('bg-green-500', 'text-white');
            connectionStatusDiv.classList.remove('bg-yellow-400', 'text-yellow-800', 'bg-red-500');
        } else if (statusKey === 'connecting') {
            statusText = 'Conectando ao Servidor WebSocket...';
            connectionStatusDiv.classList.add('bg-yellow-400', 'text-yellow-800');
            connectionStatusDiv.classList.remove('bg-green-500', 'text-white', 'bg-red-500');
        } else if (statusKey === 'disconnected') {
            statusText = 'Desconectado do Servidor WebSocket';
            connectionStatusDiv.classList.add('bg-red-500', 'text-white');
            connectionStatusDiv.classList.remove('bg-green-500', 'bg-yellow-400', 'text-yellow-800');
        }
        connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : '');
        console.log(`adminScript.js: Status da conexão WebSocket atualizado para ${statusKey} - ${message}`);
    }

    // A porta deve ser a mesma configurada no electronMain.js
    const wsUrl = `ws://localhost:3000`; // Alterado para ws e porta padrão
    let websocket;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let reconnectTimeout = null;
    const baseReconnectDelay = 3000;

    function handleClientData(elements, clientData) {
        const sectorIdForLog = elements?.block?.dataset?.sectorId || 'desconhecido';
        console.log(`adminScript.js: [handleClientData] Iniciando para ${sectorIdForLog}. Dados:`, JSON.stringify(clientData).substring(0, 200) + "...");
        try {
            if (!elements || !elements.qrCodeDiv || !elements.statusDiv) {
                console.error(`adminScript.js: [handleClientData] Elementos da UI ausentes para ${sectorIdForLog}.`, elements);
                return;
            }
            const qrCodeDiv = elements.qrCodeDiv;
            const statusDiv = elements.statusDiv;
            statusDiv.className = 'qr-status mt-2 text-sm'; // Reseta classes de status anteriores

            console.log(`adminScript.js: [handleClientData] Processando status '${clientData.status}' para ${sectorIdForLog}`);

            if (clientData.status === 'QR_CODE') {
                if (clientData.qrCode && typeof clientData.qrCode === 'string' && clientData.qrCode.trim() !== '') {
                    console.log(`adminScript.js: [handleClientData] Preparando para gerar QR Code para ${sectorIdForLog}.`);
                    qrCodeDiv.innerHTML = ''; // Limpa o conteúdo anterior (spinner/QR antigo)

                    if (typeof QRCode === 'undefined') {
                        console.error("adminScript.js: [handleClientData] Biblioteca QRCode não está carregada.");
                        qrCodeDiv.textContent = "Erro: QRCode lib não carregada.";
                        statusDiv.textContent = 'Erro ao exibir QR Code';
                        statusDiv.classList.add('text-red-500', 'font-semibold');
                        return;
                    }

                    console.log(`adminScript.js: [handleClientData] ANTES de new QRCode() para ${sectorIdForLog}. Dados QR (início): ${clientData.qrCode.substring(0,30)}...`);
                    try {
                        new QRCode(qrCodeDiv, {
                            text: clientData.qrCode,
                            width: 150,
                            height: 150,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
                        });
                        console.log(`adminScript.js: [handleClientData] DEPOIS de new QRCode() - QR Code gerado para ${sectorIdForLog}.`);
                        statusDiv.textContent = 'Escaneie com o WhatsApp';
                        statusDiv.classList.add('text-blue-600');
                    } catch (qrError) {
                        console.error(`adminScript.js: [handleClientData] Erro ao instanciar QRCode para ${sectorIdForLog}:`, qrError);
                        if (qrCodeDiv) qrCodeDiv.textContent = "Erro ao gerar QR.";
                        if (statusDiv) {
                            statusDiv.textContent = 'Erro na biblioteca QR';
                            statusDiv.classList.add('text-red-500', 'font-semibold');
                        }
                    }
                } else {
                    console.warn(`adminScript.js: [handleClientData] Status é QR_CODE, mas qrCode data está ausente ou inválido para ${sectorIdForLog}:`, clientData.qrCode);
                    qrCodeDiv.innerHTML = '<div class="qr-code-placeholder text-red-500">QR Inválido</div>';
                    statusDiv.textContent = 'QR Code inválido recebido.';
                    statusDiv.classList.add('text-red-500', 'font-semibold');
                }
            } else if (clientData.status === 'READY') {
                qrCodeDiv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-16 h-16 text-green-500"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.06-1.06l-3.093 3.093-1.47-1.47a.75.75 0 0 0-1.06 1.061l2.029 2.029a.75.75 0 0 0 1.06 0l3.624-3.624Z" clip-rule="evenodd" /></svg>';
                statusDiv.textContent = 'Cliente Conectado!';
                statusDiv.classList.add('text-green-600', 'font-semibold');
            } else if (clientData.status === 'AUTH_FAILURE') {
                qrCodeDiv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-16 h-16 text-red-500"><path fill-rule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.75A3 3 0 0 1 19.5 21h-15a3 3 0 0 1-2.553-4.247l7.355-12.75ZM10.5 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Zm.75 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd" /></svg>';
                statusDiv.textContent = `Falha na Autenticação. Verifique o WhatsApp.`;
                statusDiv.classList.add('text-red-600', 'font-semibold');
            } else if (clientData.status === 'DISCONNECTED') {
                qrCodeDiv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-16 h-16 text-yellow-500"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clip-rule="evenodd" /></svg>';
                statusDiv.textContent = `Cliente Desconectado.`;
                statusDiv.classList.add('text-yellow-600', 'font-semibold');
            } else if (clientData.status) {
                statusDiv.textContent = escapeHTML(clientData.status);
                statusDiv.classList.add('text-gray-700');
                if (clientData.status.toUpperCase().includes('LOADING') || clientData.status.toUpperCase().includes('INITIALIZING')) {
                    if (!qrCodeDiv.querySelector('svg.animate-spin')) {
                         qrCodeDiv.innerHTML = `<div class="qr-code-placeholder">
                            <svg class="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        </div>`;
                    }
                }
            } else {
                statusDiv.textContent = "Status desconhecido recebido.";
                statusDiv.classList.add('text-gray-500');
                console.warn(`adminScript.js: [handleClientData] Dados de status desconhecidos para ${sectorIdForLog}:`, clientData);
            }
            console.log(`adminScript.js: [handleClientData] Concluído para ${sectorIdForLog}`);
        } catch (e) {
            console.error(`adminScript.js: [handleClientData] Erro CRÍTICO para ${sectorIdForLog}:`, e, "Dados recebidos:", clientData);
            if (elements?.statusDiv) {
                elements.statusDiv.textContent = "Erro interno ao processar status.";
                elements.statusDiv.classList.add('text-red-500', 'font-semibold');
            }
        }
    }

    function connectWebSocket() {
        if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
            console.log('adminScript.js: WebSocket já conectado ou conectando.');
            return;
        }
        updateWebSocketConnectionStatus('connecting');
        console.log(`adminScript.js: Tentando conectar WebSocket em ${wsUrl}`);
        try {
            // Adicionar um identificador para o tipo de cliente na URL do WebSocket
            websocket = new WebSocket(`${wsUrl}/admin-qr`);
            console.log('adminScript.js: Objeto WebSocket criado. Estado inicial:', websocket.readyState);
        } catch (e) {
            console.error('adminScript.js: Erro ao criar objeto WebSocket:', e);
            updateWebSocketConnectionStatus('disconnected', 'Erro ao criar WebSocket');
            reconnectWebSocket();
            return;
        }

        websocket.onopen = function(event) {
            console.log('adminScript.js: Conexão WebSocket (Admin QR) ABERTA.');
            updateWebSocketConnectionStatus('connected');
            reconnectAttempts = 0;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            if (websocket.readyState === WebSocket.OPEN) {
                console.log('adminScript.js: Conexão aberta, solicitando status inicial do servidor.');
                try {
                    // O servidor agora pode saber que este é um cliente admin-qr
                    websocket.send(JSON.stringify({ type: 'request_initial_status', clientType: 'admin-qr' }));
                    console.log('adminScript.js: Mensagem "request_initial_status" enviada.');
                } catch (sendError) {
                    console.error('adminScript.js: Erro ao enviar "request_initial_status":', sendError);
                }
            }
        };

        websocket.onmessage = function(event) {
            console.log('adminScript.js: Mensagem WebSocket (Admin QR) recebida (primeiros 200 chars):', String(event.data).substring(0, 200) + (String(event.data).length > 200 ? "..." : ""));
            let data;
            try {
                data = JSON.parse(event.data);
                console.log('adminScript.js: Dados parseados com sucesso:', data);
            } catch (e) {
                console.error("adminScript.js: Erro ao parsear JSON da mensagem WebSocket:", e, "Dados brutos:", event.data);
                return;
            }

            let clientDataToProcess;
            // O clientId deve vir do servidor para identificar a sessão Baileys
            let targetClientId = data.clientId || "whatsapp-bot-session"; // Default se não especificado

            const elements = sectorElements[targetClientId];
            if (!elements) {
                console.warn(`adminScript.js: Elementos da UI não encontrados para o cliente/setor: ${targetClientId}. Dados recebidos:`, data);
                // Poderia criar dinamicamente se a config de setores for dinâmica
                return;
            }

            if (data.type === 'status_update' && data.payload) {
                clientDataToProcess = data.payload;
            } else if (data.type === 'qr_code' && data.payload) {
                clientDataToProcess = { status: 'QR_CODE', qrCode: data.payload.qr || data.payload }; // Ajuste para pegar o QR do payload
            } else if (data.type === 'initial_status' && data.payload) {
                clientDataToProcess = data.payload; // O payload já deve ter status e qrCode se aplicável
            } else if (data.type === 'pong') {
                console.log('adminScript.js: Pong recebido do servidor.', data);
                return;
            } else if (data.status) { // Fallback para formato antigo
                clientDataToProcess = data;
            } else {
                console.warn("adminScript.js: Formato de mensagem desconhecido ou sem payload/status principal:", data);
                return;
            }

            try {
                handleClientData(elements, clientDataToProcess);
            } catch (handleError) {
                console.error(`adminScript.js: Erro não capturado DURANTE a chamada a handleClientData:`, handleError);
            }
        };

        websocket.onerror = function(errorEvent) {
            console.error('adminScript.js: Erro no WebSocket (Admin QR):', errorEvent);
            // updateWebSocketConnectionStatus('disconnected', 'Erro de conexão'); // O onclose geralmente lida com isso
        };

        websocket.onclose = function(event) {
            console.log(`adminScript.js: Conexão WebSocket (Admin QR) fechada. Código=${event.code}, Limpa=${event.wasClean}, Razão=${event.reason}`);
            updateWebSocketConnectionStatus('disconnected', `Código: ${event.code}`);
            if (!event.wasClean && !reconnectTimeout) {
                reconnectWebSocket();
            } else if (event.wasClean) {
                console.log('adminScript.js: Conexão WebSocket fechada de forma limpa.');
            }
        };
        console.log('adminScript.js: Manipuladores de evento WebSocket configurados. Estado atual do WebSocket:', websocket.readyState);
    }

    function reconnectWebSocket() {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000);
            console.log(`adminScript.js: Tentativa de reconexão (Admin QR) ${reconnectAttempts}/${maxReconnectAttempts} em ${Math.round(delay / 1000)}s...`);
            updateWebSocketConnectionStatus('connecting', `Tentativa ${reconnectAttempts}`);
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                connectWebSocket();
            }, delay);
        } else {
            console.error('adminScript.js: Máximo de tentativas de reconexão (Admin QR) atingido.');
            updateWebSocketConnectionStatus('disconnected', 'Falha ao reconectar');
            if (qrContainer) {
                qrContainer.innerHTML = '<div class="all-ready-message p-4 text-red-600 font-semibold">Não foi possível reconectar ao servidor. Por favor, <a href="javascript:location.reload()" class="text-blue-500 hover:underline">recarregue a página</a> ou verifique os <button id="retryLogsBtn" class="text-blue-500 hover:underline">logs</button>.</div>';
                const retryLogsBtn = document.getElementById('retryLogsBtn');
                if (retryLogsBtn && window.electronAPI && typeof window.electronAPI.navigate === 'function') {
                    retryLogsBtn.addEventListener('click', () => window.electronAPI.navigate('logs'));
                }
            }
        }
    }

    // Inicialização
    initializeUI();
    connectWebSocket();

    // Botões de navegação Electron
    if (viewLogsBtn && window.electronAPI && typeof window.electronAPI.navigate === 'function') {
        viewLogsBtn.addEventListener('click', () => {
            window.electronAPI.navigate('logs');
        });
    }

    if (openDevToolsBtnAdmin && window.electronAPI && typeof window.electronAPI.openDevTools === 'function') {
        openDevToolsBtnAdmin.addEventListener('click', () => {
            window.electronAPI.openDevTools();
        });
    }
});
