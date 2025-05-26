// mainChatScript.js
// Este script gerencia a lógica principal da interface de chat.

// --- INÍCIO: Lógica de Aplicação de Tema ---
// Esta função deve ser executada o mais cedo possível, idealmente antes do DOMContentLoaded
// para evitar flash de conteúdo com tema incorreto.
function applyChatPageTheme() {
    const THEME_STORAGE_KEY = 'theme'; // Chave usada pelo index.html
    let themeToApply = 'light'; // Padrão se nada for encontrado ou erro

    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light') {
            themeToApply = savedTheme;
        } else if (savedTheme) {
            console.warn(`[ChatTheme] Valor de tema inválido ('${savedTheme}') encontrado no localStorage. Usando padrão 'light'.`);
        }
        // Se savedTheme for null (não definido), themeToApply permanece 'light'
    } catch (e) {
        console.error("[ChatTheme] Erro ao acessar localStorage para aplicar tema. Usando padrão 'light'. Erro:", e);
        // themeToApply já é 'light'
    }
    
    document.documentElement.setAttribute('data-theme', themeToApply);
    console.log(`[ChatTheme] Tema aplicado na inicialização da página: ${themeToApply}`);
}

// Aplica o tema assim que este script for carregado.
// Não espera pelo DOMContentLoaded para esta parte específica,
// para minimizar a chance de FOUC (Flash Of Unstyled Content) ou tema incorreto.
applyChatPageTheme();
// --- FIM: Lógica de Aplicação de Tema ---


// Espera o DOM estar completamente carregado antes de executar o restante do script.
document.addEventListener('DOMContentLoaded', async () => {
    // A lógica de tema que estava aqui foi movida para fora e simplificada.
    // O restante do script de inicialização do chat continua aqui.

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
                // Updated to use new iconBar selectors
                let defaultTab = 'active'; // Default to 'active'
                if (window.ChatDomElements && window.ChatDomElements.iconBar) {
                    const activeIconItem = window.ChatDomElements.iconBar.querySelector('.icon-bar-item.active[data-tab]');
                    if (activeIconItem && activeIconItem.dataset.tab) {
                        defaultTab = activeIconItem.dataset.tab;
                    }
                }
                console.log(`[Chat] Default tab for initial load: ${defaultTab}`);
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
