document.addEventListener('DOMContentLoaded', () => {
    const sidenavItems = document.querySelectorAll('.sidenav-item');
    const sectionTitleElement = document.getElementById('section-title');
    const contentAreaElement = document.getElementById('content-area');

    // Define active classes - these should match what you use in the HTML for the default active item
    // Using custom theme variables for a more integrated feel with Material Tailwind
    const activeBgColor = 'var(--md-sys-color-primary-container)'; // Example: 'bg-blue-100' or a custom theme variable
    const activeTextColor = 'var(--md-sys-color-on-primary-container)'; // Example: 'text-blue-600' or a custom theme variable
    const inactiveTextColor = 'var(--md-sys-color-on-surface-variant)'; // For non-active items, text color on surface

    // Define content for each section
    const sectionContents = {
        'nav-painel': {
            title: 'Painel',
            html: `
                <div class="p-0 md:p-4"> {/* Container Principal do Painel com padding responsivo */}
                    <!-- Banner de Atualizações -->
                    <div role="alert" class="relative flex w-full px-4 py-4 text-base text-white bg-blue-500 rounded-lg font-regular mb-6" style="background-color: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container);">
                        <div class="shrink-0">
                            <span class="material-icons text-xl mr-2 align-middle">campaign</span>
                        </div>
                        <div class="grow">
                            <strong>Bem-vindo ao Notary Connect!</strong> Estamos trabalhando em novas funcionalidades para melhorar sua experiência.
                        </div>
                    </div>

                    <!-- Grade de Caixas de Estatísticas -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <!-- Caixa 1: Atendentes Online -->
                        <div class="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md p-4" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                            <div class="flex items-center">
                                <span class="material-icons text-3xl p-2 rounded-full mr-3" style="color: var(--md-sys-color-primary); background-color: var(--md-sys-color-primary-container);">support_agent</span>
                                <div>
                                    <p class="text-sm font-normal text-gray-600" style="color: var(--md-sys-color-on-surface-variant);">Atendentes Online</p>
                                    <h5 id="stats-atendentes-online" class="text-2xl font-semibold">0</h5>
                                </div>
                            </div>
                        </div>
                        <!-- Caixa 2: Clientes Pendentes -->
                        <div class="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md p-4" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                            <div class="flex items-center">
                                <span class="material-icons text-3xl p-2 rounded-full mr-3" style="color: var(--md-sys-color-secondary); background-color: var(--md-sys-color-secondary-container);">pending_actions</span>
                                <div>
                                    <p class="text-sm font-normal text-gray-600" style="color: var(--md-sys-color-on-surface-variant);">Clientes Pendentes</p>
                                    <h5 id="stats-clientes-pendentes" class="text-2xl font-semibold">0</h5>
                                </div>
                            </div>
                        </div>
                        <!-- Caixa 3: Em Atendimento Humano -->
                        <div class="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md p-4" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                            <div class="flex items-center">
                                <span class="material-icons text-3xl p-2 rounded-full mr-3" style="color: var(--md-sys-color-tertiary); background-color: var(--md-sys-color-tertiary-container);">headset_mic</span>
                                <div>
                                    <p class="text-sm font-normal text-gray-600" style="color: var(--md-sys-color-on-surface-variant);">Em Atendimento Humano</p>
                                    <h5 id="stats-em-atendimento" class="text-2xl font-semibold">0</h5>
                                </div>
                            </div>
                        </div>
                        <!-- Caixa 4: Atendimentos Encerrados Hoje -->
                        <div class="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md p-4" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                            <div class="flex items-center">
                                <span class="material-icons text-3xl p-2 rounded-full mr-3" style="color: var(--md-sys-color-error); background-color: var(--md-sys-color-error-container);">task_alt</span>
                                <div>
                                    <p class="text-sm font-normal text-gray-600" style="color: var(--md-sys-color-on-surface-variant);">Encerrados Hoje</p>
                                    <h5 id="stats-encerrados-hoje" class="text-2xl font-semibold">0</h5>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Caixa de Respostas Dinâmicas (Visualização Simplificada) -->
                    <div class="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md p-4 mb-6" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                        <h6 class="text-lg font-semibold mb-2" style="color: var(--md-sys-color-on-surface);">Interações Recentes</h6>
                        <div class="text-sm" style="color: var(--md-sys-color-on-surface-variant);">
                          <p><strong>Cliente (10:30):</strong> Olá, preciso de ajuda com o serviço X.</p>
                          <p><strong>Atendente (10:31):</strong> Bom dia! Claro, como posso auxiliar?</p>
                          <p><strong>Cliente (10:32):</strong> Gostaria de saber o preço.</p>
                        </div>
                    </div>

                    <!-- Grade de Cartões de Navegação -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <!-- Cartão 1: Sistema de Atendimento -->
                        <a href="chat.html" class="block rounded-lg p-6 text-center transition-shadow hover:shadow-xl" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">
                            <span class="material-icons text-4xl mx-auto block mb-2">chat</span>
                            <h6 class="text-md font-semibold">Sistema de Atendimento</h6>
                        </a>
                        <!-- Cartão 2: Documentações -->
                        <a href="#" class="block rounded-lg p-6 text-center transition-shadow hover:shadow-xl" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">
                            <span class="material-icons text-4xl mx-auto block mb-2">description</span>
                            <h6 class="text-md font-semibold">Documentações</h6>
                        </a>
                        <!-- Cartão 3: Digitalizações -->
                        <a href="#" class="block rounded-lg p-6 text-center transition-shadow hover:shadow-xl" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">
                            <span class="material-icons text-4xl mx-auto block mb-2">qr_code_scanner</span>
                            <h6 class="text-md font-semibold">Digitalizações</h6>
                        </a>
                        <!-- Cartão 4: Buscas -->
                        <a href="#" class="block rounded-lg p-6 text-center transition-shadow hover:shadow-xl" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">
                            <span class="material-icons text-4xl mx-auto block mb-2">search</span>
                            <h6 class="text-md font-semibold">Buscas</h6>
                        </a>
                        <!-- Cartão 5: Plantões -->
                        <a href="#" class="block rounded-lg p-6 text-center transition-shadow hover:shadow-xl" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">
                            <span class="material-icons text-4xl mx-auto block mb-2">event_available</span>
                            <h6 class="text-md font-semibold">Plantões</h6>
                        </a>
                    </div>
                </div>
            `
        },
        'nav-ia': {
            title: 'IA de atendimento',
            html: '<h1>IA de atendimento</h1><p>Configurações e monitoramento da IA de atendimento.</p>'
        },
        'nav-respostas': {
            title: 'Respostas Automáticas',
            html: '<h1>Respostas Automáticas</h1><p>Gerenciamento de respostas automáticas e gatilhos.</p>'
        },
        'nav-servicos': {
            title: 'Serviços',
            html: '<h1>Serviços</h1><p>Administração de serviços oferecidos.</p>'
        },
        'nav-usuarios': {
            title: 'Usuários',
            html: '<h1>Usuários</h1><p>Gerenciamento de usuários e permissões.</p>'
        },
        'nav-setores': {
            title: 'Setores',
            html: '<h1>Setores</h1><p>Configuração de setores de atendimento.</p>'
        },
        'nav-configuracoes': {
            title: 'Configurações',
            html: '<h1>Configurações</h1><p>Configurações gerais do sistema.</p>'
        },
        'nav-ia': { // HTML for IA de Atendimento Section
            title: 'IA de Atendimento',
            html: `
                <div class="p-4 md:p-6">
                  <h2 class="text-xl font-semibold mb-4" style="color: var(--md-sys-color-on-background);">Controle e Status da IA de Atendimento</h2>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Card de Status e QR Code -->
                    <div class="rounded-xl p-6 shadow-lg" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                      <h3 class="text-lg font-medium mb-3">Status da Conexão</h3>
                      <p class="mb-1"><strong>Estado:</strong> <span id="ia-connection-status" class="font-mono text-sm p-1 rounded" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">--</span></p>
                      <p class="mb-3"><strong>JID Conectado:</strong> <span id="ia-jid-connected" class="font-mono text-sm p-1 rounded" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">--</span></p>
                      <div id="ia-qrcode-container" class="mt-4 text-center bg-white p-2 rounded-md inline-block min-w-[200px] min-h-[200px] flex items-center justify-center" style="border: 1px solid var(--md-sys-color-outline);">
                        <p style="color: var(--md-sys-color-on-surface-variant);">Aguardando QR Code...</p>
                      </div>
                    </div>

                    <!-- Card de Ações -->
                    <div class="rounded-xl p-6 shadow-lg" style="background-color: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface);">
                      <h3 class="text-lg font-medium mb-3">Ações do Bot</h3>
                      <p class="mb-1"><strong>Estado do Bot:</strong> 
                        <span id="ia-pause-status-indicator" class="font-semibold text-sm p-1 rounded" style="background-color: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);">--</span>
                      </p>
                      <div class="space-y-3 mt-4">
                        <button id="ia-toggle-pause-btn" 
                                class="w-full text-sm font-medium px-4 py-2.5 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-opacity-50" 
                                style="background-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); border: 1px solid transparent;"
                                onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-dark, #00538A)';"
                                onmouseout="this.style.backgroundColor='var(--md-sys-color-primary)';">
                          Pausar Bot
                        </button>
                        <button id="ia-restart-btn" 
                                class="w-full text-sm font-medium px-4 py-2.5 rounded-lg transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-opacity-50" 
                                style="background-color: var(--md-sys-color-error); color: var(--md-sys-color-on-error); border: 1px solid transparent;"
                                onmouseover="this.style.backgroundColor='var(--md-sys-color-error-dark, #A30000)';"
                                onmouseout="this.style.backgroundColor='var(--md-sys-color-error)';">
                          Reiniciar Conexão (Novo QR Code)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
            `
        },
        // Placeholder para quando o usuário clicar em um cartão de navegação que não tem um item de menu lateral dedicado
        'nav-card-placeholder': {
            title: 'Funcionalidade', // O título será atualizado dinamicamente
            html: '<p>Conteúdo da funcionalidade selecionada.</p>' // O conteúdo será atualizado dinamicamente
        }
    };

    // Função para buscar e atualizar dados do dashboard
    async function fetchDashboardStats() {
        try {
            const response = await fetch('/api/admin/dashboard/stats'); 
            if (!response.ok) {
                // Tenta extrair uma mensagem de erro do corpo da resposta, se houver
                let errorMsg = `Falha ao buscar estatísticas do dashboard: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.message) {
                        errorMsg += ` - ${errorData.message}`;
                    }
                } catch (e) { /* Não faz nada se não conseguir parsear o JSON do erro */ }
                throw new Error(errorMsg);
            }
            
            const result = await response.json();

            if (result.success && result.data) {
                const stats = result.data;
                const atendentesOnlineEl = document.getElementById('stats-atendentes-online');
                const clientesPendentesEl = document.getElementById('stats-clientes-pendentes');
                const emAtendimentoEl = document.getElementById('stats-em-atendimento');
                const encerradosHojeEl = document.getElementById('stats-encerrados-hoje');

                if (atendentesOnlineEl) atendentesOnlineEl.textContent = stats.atendentesOnline !== undefined ? stats.atendentesOnline : '-';
                if (clientesPendentesEl) clientesPendentesEl.textContent = stats.clientesPendentes !== undefined ? stats.clientesPendentes : '-';
                if (emAtendimentoEl) emAtendimentoEl.textContent = stats.emAtendimentoHumano !== undefined ? stats.emAtendimentoHumano : '-';
                if (encerradosHojeEl) encerradosHojeEl.textContent = stats.atendimentosEncerradosHoje !== undefined ? stats.atendimentosEncerradosHoje : '-';
                
                console.log('[Dashboard] Estatísticas atualizadas:', stats);
            } else {
                console.error('Erro nos dados recebidos das estatísticas do dashboard:', result.message || 'Formato de dados inválido.');
                const errorPlaceholder = '-';
                document.getElementById('stats-atendentes-online').textContent = errorPlaceholder;
                document.getElementById('stats-clientes-pendentes').textContent = errorPlaceholder;
                document.getElementById('stats-em-atendimento').textContent = errorPlaceholder;
                document.getElementById('stats-encerrados-hoje').textContent = errorPlaceholder;
            }
        } catch (error) {
            console.error('Erro crítico ao buscar ou processar estatísticas do dashboard:', error);
            const errorPlaceholder = 'Erro';
            document.getElementById('stats-atendentes-online').textContent = errorPlaceholder;
            document.getElementById('stats-clientes-pendentes').textContent = errorPlaceholder;
            document.getElementById('stats-em-atendimento').textContent = errorPlaceholder;
            document.getElementById('stats-encerrados-hoje').textContent = errorPlaceholder;
        }
    }

    function updateIaStatusUI(status, jid, isPaused, reason) {
        const statusEl = document.getElementById('ia-connection-status');
        const jidEl = document.getElementById('ia-jid-connected');
        const pauseStatusEl = document.getElementById('ia-pause-status-indicator');
        const togglePauseBtn = document.getElementById('ia-toggle-pause-btn');

        if (statusEl) statusEl.textContent = status || '--';
        if (jidEl) jidEl.textContent = jid || '--';
        if (pauseStatusEl) pauseStatusEl.textContent = isPaused ? 'Bot Pausado' : 'Bot Ativo';
        if (togglePauseBtn) togglePauseBtn.textContent = isPaused ? 'Reativar Bot' : 'Pausar Bot';
    }

    function displayQrCode(qrString) {
        const container = document.getElementById('ia-qrcode-container');
        if (!container) return;
        container.innerHTML = ''; // Limpa container
        try {
            const qr = qrcode(0, 'L'); // typeNumber 0 = auto, errorCorrectionLevel 'L'
            qr.addData(qrString);
            qr.make();
            container.innerHTML = qr.createImgTag(6, 8); // (cellSize, margin)
            container.firstChild.style.margin = 'auto'; // Centraliza a imagem do QR Code
        } catch (e) {
            console.error("Erro ao gerar QR Code:", e);
            container.innerHTML = '<p style="color: var(--md-sys-color-error);">Erro ao gerar QR Code.</p>';
        }
    }

    function handleIaWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('[WS-IA] Mensagem recebida do WebSocket:', message);
            if (message.clientId !== 'whatsapp-bot-session' && message.type !== 'initial_status_ack') { // Assume single WA session for now
                // console.log('[WS-IA] Mensagem não é para esta sessão de IA ou é ack, ignorando.');
                // return; // Comentado para permitir processamento de todos os status para agora
            }

            const payload = message.payload || {};

            if (message.type === 'qr_code') {
                updateIaStatusUI(payload.status || 'Aguardando QR Code', null, payload.isPaused, null);
                if (payload.qr) {
                    displayQrCode(payload.qr);
                } else {
                     const container = document.getElementById('ia-qrcode-container');
                     if(container) container.innerHTML = '<p style="color: var(--md-sys-color-on-surface-variant);">QR Code não disponível.</p>';
                }
            } else if (message.type === 'status_update' || (message.type === 'initial_status' && message.clientId === 'whatsapp-bot-session')) {
                updateIaStatusUI(payload.status, payload.jid, payload.isPaused, payload.reason);
                const qrContainer = document.getElementById('ia-qrcode-container');
                if (qrContainer) {
                    if (payload.status === 'READY' || payload.status === 'CONNECTED' || payload.status === 'AUTHENTICATED') {
                        qrContainer.innerHTML = '<p style="color: var(--md-sys-color-primary);">Conectado!</p>';
                    } else if (payload.status === 'DISCONNECTED' || payload.status === 'AUTH_FAILURE' || payload.status === 'FATAL_ERROR' || payload.status === 'CLEARED_FOR_RESTART') {
                        qrContainer.innerHTML = `<p style="color: var(--md-sys-color-error);">Desconectado. ${payload.reason || ''}</p>`;
                    } else if (payload.status !== 'QR_CODE') { // Se não for QR nem conectado, limpa.
                         qrContainer.innerHTML = '<p style="color: var(--md-sys-color-on-surface-variant);">Aguardando status...</p>';
                    }
                    // Se for QR_CODE, o handler de qr_code já trata.
                }
            }
        } catch (error) {
            console.error('[WS-IA] Erro ao processar mensagem WebSocket da IA:', error);
        }
    }
    
    let iaWebSocket = null;
    function connectIaWebSocket() {
        // Conectar ao endpoint /admin-qr do websocketService.js
        // Certifique-se que o servidor WebSocket está rodando na porta correta (ex: 3001)
        // A URL pode precisar ser ajustada dependendo da configuração do servidor (http/ws, host, porta)
        const wsUrl = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + "/admin-qr";
        console.log(`[WS-IA] Conectando ao WebSocket da IA em: ${wsUrl}`);
        
        iaWebSocket = new WebSocket(wsUrl);

        iaWebSocket.onopen = () => {
            console.log('[WS-IA] Conexão WebSocket para status da IA estabelecida.');
            // Solicitar status inicial assim que conectar
            if (iaWebSocket.readyState === WebSocket.OPEN) {
                 iaWebSocket.send(JSON.stringify({ type: 'request_initial_status' }));
            }
        };
        iaWebSocket.onmessage = handleIaWebSocketMessage;
        iaWebSocket.onerror = (error) => {
            console.error('[WS-IA] Erro na conexão WebSocket da IA:', error);
            const qrContainer = document.getElementById('ia-qrcode-container');
            if (qrContainer) qrContainer.innerHTML = '<p style="color: var(--md-sys-color-error);">Erro de conexão com o servidor WebSocket.</p>';
            updateIaStatusUI('Erro de Conexão WS', null, undefined, 'Erro WS');
        };
        iaWebSocket.onclose = () => {
            console.log('[WS-IA] Conexão WebSocket da IA fechada.');
            updateIaStatusUI('Desconectado do Servidor WS', null, undefined, 'WS Fechado');
            // Tentar reconectar após um delay? Ou apenas quando a seção for reaberta.
        };
    }
    
    function addIaSectionListeners() {
        const togglePauseBtn = document.getElementById('ia-toggle-pause-btn');
        const restartBtn = document.getElementById('ia-restart-btn');

        if (togglePauseBtn) {
            togglePauseBtn.onclick = async () => {
                try {
                    togglePauseBtn.disabled = true;
                    togglePauseBtn.style.opacity = '0.7';
                    const response = await fetch('/api/admin/ia/toggle-pause', { method: 'POST' });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || 'Falha ao alternar pausa.');
                    }
                    // UI será atualizada pelo evento WebSocket 'status_update'
                    console.log('[IA-Control] Comando toggle-pause enviado. Novo estado (local):', result.isPaused);
                } catch (error) {
                    console.error('Erro ao alternar pausa do bot:', error);
                    alert(`Erro: ${error.message}`); // Simples alerta para feedback de erro
                } finally {
                    togglePauseBtn.disabled = false;
                    togglePauseBtn.style.opacity = '1';
                }
            };
        }

        if (restartBtn) {
            restartBtn.onclick = async () => {
                if (!confirm("Tem certeza que deseja reiniciar a conexão da IA? Isso gerará um novo QR Code e desconectará a sessão atual.")) {
                    return;
                }
                try {
                    restartBtn.disabled = true;
                    restartBtn.style.opacity = '0.7';
                    const response = await fetch('/api/admin/ia/restart', { method: 'POST' });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                         throw new Error(result.message || 'Falha ao reiniciar a IA.');
                    }
                    alert(result.message || 'Comando de reinício enviado.'); // Feedback para o usuário
                    // UI será atualizada pelos eventos WebSocket 'status_update' e 'qr_code'
                } catch (error) {
                    console.error('Erro ao reiniciar a IA:', error);
                    alert(`Erro: ${error.message}`);
                } finally {
                    restartBtn.disabled = false;
                    restartBtn.style.opacity = '1';
                }
            };
        }
    }


    function updateSection(itemId, customTitle = null, customHtml = null) {
        const section = sectionContents[itemId];
        if (section) {
            if (sectionTitleElement) {
                sectionTitleElement.textContent = customTitle || section.title;
            }
            if (contentAreaElement) {
                contentAreaElement.innerHTML = customHtml || section.html;
            }
            if (itemId === 'nav-painel' && !customHtml) {
                fetchDashboardStats();
            } else if (itemId === 'nav-ia' && !customHtml) {
                // Conectar WebSocket e adicionar listeners quando a seção IA é carregada
                if (!iaWebSocket || iaWebSocket.readyState === WebSocket.CLOSED) {
                    connectIaWebSocket();
                } else if (iaWebSocket.readyState === WebSocket.OPEN) {
                    // Se já estiver conectado, solicitar status atual para garantir que a UI esteja atualizada
                    iaWebSocket.send(JSON.stringify({ type: 'request_initial_status' }));
                }
                addIaSectionListeners(); // Adiciona listeners aos botões da seção IA
            } else {
                // Se sair da seção IA, fechar o WebSocket para economizar recursos
                if (iaWebSocket && iaWebSocket.readyState === WebSocket.OPEN) {
                    // iaWebSocket.close(); // Comentado para manter a conexão ativa entre navegações
                }
            }
        } else if (customTitle && customHtml) { 
             if (sectionTitleElement) sectionTitleElement.textContent = customTitle;
             if (contentAreaElement) contentAreaElement.innerHTML = customHtml;
        }
    }
    
    // Adicionar event listeners para os cartões de navegação do painel
    // Esta função precisa ser chamada *depois* que o HTML do painel é injetado
    function addNavigationCardListeners() {
        const navCards = document.querySelectorAll('#content-area a[data-section-id]');
        navCards.forEach(card => {
            card.addEventListener('click', (event) => {
                event.preventDefault();
                const sectionId = card.dataset.sectionId;
                const sectionTitle = card.dataset.sectionTitle || "Detalhes";
                
                // Tenta encontrar um item de menu lateral correspondente para ativar
                const correspondingSidenavItem = document.getElementById(sectionId);
                if (correspondingSidenavItem) {
                    setActiveItem(correspondingSidenavItem);
                    updateSection(sectionId); // Usa a lógica normal de atualização se houver um item de menu
                } else {
                    // Se não houver item de menu lateral, apenas atualiza o título e o conteúdo
                    // e remove a seleção ativa do menu lateral (ou mantém a seleção do painel)
                    const painelSidenavItem = document.getElementById('nav-painel'); // Mantém 'Painel' ativo
                    if (painelSidenavItem) setActiveItem(painelSidenavItem);
                    
                    // Conteúdo de placeholder para seções de cartão
                    updateSection('nav-card-placeholder', sectionTitle, `<h2>${sectionTitle}</h2><p>Conteúdo para ${sectionTitle} ainda não implementado.</p>`);
                }
            });
        });
    }


    function setActiveItem(selectedItem) {
        sidenavItems.forEach(item => {
            // Reset styles for all items
            item.style.backgroundColor = '';
            const textSpan = item.querySelector('span:last-child'); // Assuming text is in the last span
            const iconSpan = item.querySelector('span.material-icons');
            if (textSpan) textSpan.style.color = inactiveTextColor;
            if (iconSpan) iconSpan.style.color = inactiveTextColor; // Or a more specific icon color
            item.classList.remove('active-sidenav-item'); // A generic active class if needed for other styling
        });

        // Apply active styles to the selected item
        selectedItem.style.backgroundColor = activeBgColor;
        const selectedTextSpan = selectedItem.querySelector('span:last-child');
        const selectedIconSpan = selectedItem.querySelector('span.material-icons');
        if (selectedTextSpan) selectedTextSpan.style.color = activeTextColor;
        if (selectedIconSpan) selectedIconSpan.style.color = activeTextColor; // Or var(--md-sys-color-primary)
        selectedItem.classList.add('active-sidenav-item');
    }

    sidenavItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const itemId = item.id;
            
            setActiveItem(item);
            updateSection(itemId);
        });
    });

    // Set initial active item and content (e.g., Painel)
    const initialActiveItem = document.getElementById('nav-painel');
    if (initialActiveItem) {
        setActiveItem(initialActiveItem);
        updateSection('nav-painel'); 
        // Adicionar listeners aos cartões DEPOIS que o HTML do painel foi carregado
        // Usar um pequeno delay ou MutationObserver para garantir que os elementos existam
        setTimeout(addNavigationCardListeners, 0); 
    }

    // Re-adicionar listeners aos cartões se o conteúdo do painel for recarregado
    // (por exemplo, se o usuário clicar no item "Painel" do menu lateral novamente)
    const painelMenuItem = document.getElementById('nav-painel');
    if (painelMenuItem) {
        painelMenuItem.addEventListener('click', () => {
            // A função updateSection já será chamada pelo evento de clique no sidenavItems
            // Precisamos garantir que addNavigationCardListeners seja chamado depois que o HTML é atualizado.
             setTimeout(addNavigationCardListeners, 0);
        });
    }
});
