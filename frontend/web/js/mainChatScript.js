// mainChatScript.js
// Este script gerencia a lógica principal da interface de chat.

// Espera o DOM estar completamente carregado antes de executar o script.
document.addEventListener('DOMContentLoaded', async () => {
    const THEME_STORAGE_KEY_CHAT = 'notaryConnectTheme'; // Mesma chave do localStorage

    // --- INÍCIO: Lógica de Aplicação de Tema (Integrada e Refinada) ---
    const applyChatTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        console.log(`[ChatTheme] Tema aplicado: ${theme}`);
    };

    const checkSystemThemeFallbackForChat = () => {
        let theme = 'light'; // Padrão
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            theme = 'dark';
        }
        console.log(`[ChatTheme] Fallback do sistema: ${theme}`);
        applyChatTheme(theme);
        // Não salva no localStorage aqui, pois é apenas um fallback se nada estiver salvo
    };

    const initializePageChatTheme = () => {
        let themeToApply = 'light'; // Padrão se nada for encontrado
        let themeOrigin = 'padrão do script';

        try {
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY_CHAT);
            if (savedTheme) {
                themeToApply = savedTheme;
                themeOrigin = 'localStorage';
            } else {
                // Se não houver tema salvo, tenta obter do Electron ou do sistema
                if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
                    console.log("[ChatTheme] Sem tema salvo. Tentando obter do Electron API...");
                    window.electronAPI.getSystemTheme().then(themeFromElectron => {
                        console.log(`[ChatTheme] Tema inicial do Electron: ${themeFromElectron}`);
                        applyChatTheme(themeFromElectron);
                        // Não salva no localStorage para permitir que o tema do Electron mude dinamicamente se não houver preferência do usuário
                    }).catch(err => {
                        console.warn("[ChatTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
                        checkSystemThemeFallbackForChat();
                    });
                    return; // Retorna para evitar aplicar o 'light' padrão desnecessariamente
                } else {
                    // Fallback para tema do sistema se Electron API não disponível
                    console.log("[ChatTheme] Sem tema salvo e Electron API indisponível. Usando fallback do S.O.");
                    checkSystemThemeFallbackForChat();
                    return; // Retorna para evitar aplicar o 'light' padrão
                }
            }
        } catch (e) {
            console.warn("[ChatTheme] Erro ao acessar localStorage. Tentando fallback do Electron/S.O.:", e);
            if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
                window.electronAPI.getSystemTheme().then(applyChatTheme).catch(() => checkSystemThemeFallbackForChat());
            } else {
                checkSystemThemeFallbackForChat();
            }
            return;
        }
        
        console.log(`[ChatTheme] Tema a ser aplicado na inicialização: ${themeToApply} (origem: ${themeOrigin})`);
        applyChatTheme(themeToApply);
    };

    initializePageChatTheme();

    // Listener para mudanças de tema do sistema operacional (via matchMedia)
    // Só aplica se não houver tema explicitamente salvo pelo usuário no localStorage
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            try {
                if (!localStorage.getItem(THEME_STORAGE_KEY_CHAT)) {
                    const newSystemTheme = event.matches ? 'dark' : 'light';
                    console.log(`[ChatTheme] Mudança de tema do S.O. detectada (sem preferência salva): ${newSystemTheme}`);
                    applyChatTheme(newSystemTheme);
                } else {
                    console.log("[ChatTheme] Mudança de tema do S.O. ignorada pois existe preferência salva no localStorage.");
                }
            } catch (e) {
                // Em caso de erro ao acessar localStorage, aplica o tema do sistema
                const newSystemTheme = event.matches ? 'dark' : 'light';
                console.warn(`[ChatTheme] Erro ao verificar localStorage na mudança de tema do S.O. Aplicando ${newSystemTheme}. Erro:`, e);
                applyChatTheme(newSystemTheme);
            }
        });
    }

    // Listener para atualizações de tema vindas do processo principal do Electron
    // Só aplica se não houver tema explicitamente salvo pelo usuário no localStorage
    if (window.electronAPI && typeof window.electronAPI.onSystemThemeUpdate === 'function') {
        window.electronAPI.onSystemThemeUpdate((themeFromElectron) => {
            try {
                if (!localStorage.getItem(THEME_STORAGE_KEY_CHAT)) {
                    console.log(`[ChatTheme] Atualização de tema do Electron recebida (sem preferência salva): ${themeFromElectron}`);
                    applyChatTheme(themeFromElectron);
                } else {
                    console.log("[ChatTheme] Atualização de tema do Electron ignorada pois existe preferência salva no localStorage.");
                }
            } catch (e) {
                 // Em caso de erro ao acessar localStorage, aplica o tema do Electron
                console.warn(`[ChatTheme] Erro ao verificar localStorage na atualização de tema do Electron. Aplicando ${themeFromElectron}. Erro:`, e);
                applyChatTheme(themeFromElectron);
            }
        });
    }
    // --- FIM: Lógica de Aplicação de Tema ---

    console.log("[Chat] Evento DOMContentLoaded. Inicializando interface de atendimento...");

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const agentIdParam = urlParams.get("agentId");
        const agentNameParam = urlParams.get("agentName");

        const agentId = agentIdParam || localStorage.getItem('chatAgentId');
        let agentName = agentNameParam || localStorage.getItem('chatAgentName');

        if (!agentId) {
            console.error("[Chat] Erro: agentId não fornecido na URL ou localStorage.");
            document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>Erro: ID do atendente não fornecido. Faça login novamente.</p><p style='text-align:center; margin-top:10px;'><a href='login.html'>Voltar para Login</a></p>";
            return;
        }
        if (!agentName) {
            agentName = agentId; // Fallback para agentName ser o próprio agentId
        }

        // Salva no localStorage se vieram da URL, para persistir F5
        if (agentIdParam) localStorage.setItem('chatAgentId', agentIdParam);
        if (agentNameParam) localStorage.setItem('chatAgentName', agentNameParam);

        console.log(`[Chat] Agent ID: ${agentId}, Agent Name: ${agentName}`);

        // Inicialização dos módulos (ChatDomElements, ChatUiUpdater, etc.)
        if (!window.ChatDomElements || typeof window.ChatDomElements.init !== 'function') {
            throw new Error("ChatDomElements não disponível/inicializável.");
        }
        window.ChatDomElements.init();
        console.log("[Chat] ChatDomElements inicializado.");

        // Botão de Sair (#nav-sair)
        if (window.ChatDomElements.logoutButton) {
            window.ChatDomElements.logoutButton.addEventListener('click', () => {
                console.log("[Chat] Botão Sair clicado.");
                localStorage.removeItem('chatAgentId');
                localStorage.removeItem('chatAgentName');
                // Não remover THEME_STORAGE_KEY_CHAT aqui, pois o usuário pode querer manter o tema entre logins

                if (window.electronAPI && typeof window.electronAPI.navigate === 'function') {
                    window.electronAPI.navigate('login');
                } else {
                    window.location.href = 'login.html';
                }
            });
        }

        // Botão Menu Principal (#main-menu-button-chat)
        if (window.ChatDomElements.mainMenuButton) {
            window.ChatDomElements.mainMenuButton.addEventListener('click', () => {
                console.log("[Chat] Botão Menu Principal clicado.");
                if (window.electronAPI && typeof window.electronAPI.navigate === 'function') {
                    window.electronAPI.navigate('menu');
                } else {
                    window.location.href = 'index.html';
                }
            });
        }

        // Botão Voltar para Chats (Mobile)
        if (window.ChatDomElements.backToChatsMobileButton && window.ChatDomElements.appContainer) {
            window.ChatDomElements.backToChatsMobileButton.addEventListener('click', () => {
                window.ChatDomElements.appContainer.classList.remove('chat-area-active-mobile');
                if (window.ChatUiUpdater) {
                    window.ChatUiUpdater.clearChatArea(false); // false para não mostrar placeholder
                }
            });
        }

        // Inicialização dos outros serviços
        if (window.NotificationService && typeof window.NotificationService.init === 'function') {
            await window.NotificationService.init();
            console.log("[Chat] NotificationService inicializado.");
        } else {
            console.warn("[Chat] NotificationService não disponível. Notificações sonoras desabilitadas.");
        }

        if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.initialize !== 'function') {
            throw new Error("ChatUiUpdater não disponível/inicializável.");
        }
        window.ChatUiUpdater.initialize();
        console.log("[Chat] ChatUiUpdater inicializado.");

        if (!window.ChatActions || typeof window.ChatActions.initialize !== 'function') {
            throw new Error("ChatActions não disponível/inicializável.");
        }
        window.ChatActions.initialize();
        console.log("[Chat] ChatActions inicializado.");

        if (!window.ChatWebsocketService || typeof window.ChatWebsocketService.initialize !== 'function') {
            throw new Error("ChatWebsocketService não disponível/inicializável.");
        }
        window.ChatWebsocketService.initialize(agentId, agentName);
        console.log("[Chat] ChatWebsocketService inicializado e conectando...");

        if (!window.ChatEventHandlers || typeof window.ChatEventHandlers.initialize !== 'function') {
            throw new Error("ChatEventHandlers não disponível/inicializável.");
        }
        window.ChatEventHandlers.initialize();
        console.log("[Chat] ChatEventHandlers inicializado.");

        // Carregar conversas após conexão WebSocket ou se já conectado
        if (window.ChatWebsocketService.isConnected) {
            if (window.ChatActions && typeof window.ChatActions.loadConversations === "function") {
                console.log("[Chat] WebSocket já conectado. Solicitando conversas iniciais...");
                const defaultTab = window.ChatDomElements.chatFilterTabsContainer?.querySelector('.filter-tab.active')?.dataset.tab || 'active';
                window.ChatActions.loadConversations(defaultTab);
            }
        } else {
            console.log("[Chat] Aguardando conexão WebSocket para carregar conversas...");
            // A lógica de carregar conversas após a conexão já deve existir no ChatWebsocketService ou ChatActions
        }

        console.log("[Chat] Interface de atendimento inicializada com sucesso.");

    } catch (error) {
        console.error("[Chat] ERRO FATAL DURANTE A INICIALIZAÇÃO DA INTERFACE:", error);
        const bodyElement = document.querySelector('body');
        if (bodyElement) {
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'fixed';
            errorDiv.style.top = '0';
            errorDiv.style.left = '0';
            errorDiv.style.width = '100%';
            errorDiv.style.padding = '20px';
            errorDiv.style.backgroundColor = 'var(--danger-color, red)'; // Usar variável CSS se definida
            errorDiv.style.color = 'var(--accent-text-color, white)'; // Usar variável CSS se definida
            errorDiv.style.textAlign = 'center';
            errorDiv.style.zIndex = '9999';
            errorDiv.innerHTML = `<h1>Erro Crítico na Interface</h1><p>Não foi possível carregar a interface de chat.</p><p>Detalhes: ${error.message}</p><p>Verifique o console (Ctrl+Shift+I ou Cmd+Option+I) para mais informações.</p><p style='margin-top:10px;'><a href='login.html' style='color: inherit;'>Voltar para Login</a></p>`;
            bodyElement.prepend(errorDiv);
        } else {
            // Fallback extremo se nem o body for acessível (improvável)
            alert(`ERRO FATAL durante a inicialização: ${error.message}. Verifique o console.`);
        }
    }
});
