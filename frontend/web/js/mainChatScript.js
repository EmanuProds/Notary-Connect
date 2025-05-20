// frontend/web/js/mainChatScript.js
document.addEventListener("DOMContentLoaded", async () => {
  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[ChatTheme] Tema aplicado: ${theme}`);
  };

  const checkSystemTheme = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  };

  // Aplicar tema na carga inicial
  checkSystemTheme();

  // Ouvir mudanças na preferência do sistema em tempo real
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  console.log("[Chat] Evento DOMContentLoaded. Inicializando interface de atendimento...");

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const agentIdParam = urlParams.get("agentId");
    const agentNameParam = urlParams.get("agentName");

    // Tenta obter do localStorage se não estiver na URL (útil para persistência simples)
    const agentId = agentIdParam || localStorage.getItem('chatAgentId');
    let agentName = agentNameParam || localStorage.getItem('chatAgentName');


    if (!agentId) {
      console.error("[Chat] Erro: agentId não fornecido na URL ou localStorage.");
      document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>Erro: ID do atendente não fornecido. Faça login novamente.</p>";
      return;
    }
     if (!agentName) {
        agentName = agentId; // Fallback para agentId se nome não estiver disponível
    }

    // Salva no localStorage para persistência se vieram da URL
    if (agentIdParam) localStorage.setItem('chatAgentId', agentIdParam);
    if (agentNameParam) localStorage.setItem('chatAgentName', agentNameParam);

    console.log(`[Chat] Agent ID: ${agentId}, Agent Name: ${agentName}`);

    // 1. Inicializar ChatDomElements
    if (!window.ChatDomElements || typeof window.ChatDomElements.init !== 'function') {
      console.error("[Chat] Erro: ChatDomElements ou ChatDomElements.init não disponível.");
      throw new Error("ChatDomElements não disponível/inicializável.");
    }
    window.ChatDomElements.init();
    console.log("[Chat] ChatDomElements inicializado.");

    // Atualizar nome do usuário na UI
    if (window.ChatDomElements.userNameElement) {
      window.ChatDomElements.userNameElement.textContent = agentName;
    } else {
      console.warn("[Chat] userNameElement não encontrado no DOM.");
    }

     // Adicionar evento de clique para o botão de voltar (mobile)
    if (window.ChatDomElements.backToSidebarButton && window.ChatDomElements.chatContainer) {
        window.ChatDomElements.backToSidebarButton.addEventListener('click', () => {
            window.ChatDomElements.chatContainer.classList.remove('chat-active');
            if (window.ChatUiUpdater) {
                window.ChatUiUpdater.clearChatArea(false);
            }
        });
    }

    // 2. Inicializar NotificationService
    if (window.NotificationService && typeof window.NotificationService.init === 'function') {
      await window.NotificationService.init();
      console.log("[Chat] NotificationService inicializado.");
    } else {
      console.warn("[Chat] NotificationService não disponível. Notificações sonoras desabilitadas.");
    }

    // 3. Inicializar ChatUiUpdater
    if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.initialize !== 'function') {
      console.error("[Chat] Erro: ChatUiUpdater ou ChatUiUpdater.initialize não disponível.");
      throw new Error("ChatUiUpdater não disponível/inicializável.");
    }
    window.ChatUiUpdater.initialize();
    console.log("[Chat] ChatUiUpdater inicializado.");

    // 4. Inicializar ChatActions
    if (!window.ChatActions || typeof window.ChatActions.initialize !== 'function') {
      console.error("[Chat] Erro: ChatActions ou ChatActions.initialize não disponível.");
      throw new Error("ChatActions não disponível/inicializável.");
    }
    window.ChatActions.initialize();
    console.log("[Chat] ChatActions inicializado.");

    // 5. Inicializar ChatWebsocketService (passando agentId e agentName)
    if (!window.ChatWebsocketService || typeof window.ChatWebsocketService.initialize !== 'function') {
      console.error("[Chat] Erro: ChatWebsocketService ou ChatWebsocketService.initialize não disponível.");
      throw new Error("ChatWebsocketService não disponível/inicializável.");
    }
    // Passa agentId e agentName para o WebSocketService
    window.ChatWebsocketService.initialize(agentId, agentName);
    console.log("[Chat] ChatWebsocketService inicializado e conectando...");

    // 6. Inicializar ChatEventHandlers (DEPOIS de ChatWebsocketService e ChatUiUpdater)
    if (!window.ChatEventHandlers || typeof window.ChatEventHandlers.initialize !== 'function') {
      console.error("[Chat] Erro: ChatEventHandlers ou ChatEventHandlers.initialize não disponível.");
      throw new Error("ChatEventHandlers não disponível/inicializável.");
    }
    window.ChatEventHandlers.initialize();
    console.log("[Chat] ChatEventHandlers inicializado.");

    // 7. Carregar conversas iniciais (agora é feito no onopen do WebSocket ou pode ser chamado aqui se necessário)
    // O ChatWebsocketService.handleOpen agora solicita a lista de conversas.
    // Se desejar forçar aqui, pode adicionar uma verificação:
    if (window.ChatWebsocketService.isConnected) {
        if (window.ChatActions && typeof window.ChatActions.loadConversations === "function") {
            console.log("[Chat] WebSocket já conectado. Solicitando conversas iniciais...");
            window.ChatActions.loadConversations("active"); // Ou a aba padrão
        }
    } else {
        console.log("[Chat] Aguardando conexão WebSocket para carregar conversas...");
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
        errorDiv.style.backgroundColor = 'var(--error-color, red)';
        errorDiv.style.color = 'var(--text-on-accent-color, white)';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.zIndex = '9999';
        errorDiv.innerHTML = `<h1>Erro Crítico na Interface</h1><p>Não foi possível carregar a interface de chat.</p><p>Detalhes: ${error.message}</p><p>Verifique o console (Ctrl+Shift+I ou Cmd+Option+I) para mais informações.</p>`;
        bodyElement.prepend(errorDiv);
    } else {
        alert(`ERRO FATAL durante a inicialização: ${error.message}. Verifique o console.`);
    }
  }
});
