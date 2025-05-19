// frontend/web/js/mainChatScript.js
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Chat] Evento DOMContentLoaded. Inicializando interface de atendimento...");

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const agentId = urlParams.get("agentId");
    const agentName = urlParams.get("agentName");

    if (!agentId) {
      console.error("[Chat] Erro: agentId não fornecido na URL.");
      throw new Error("ID do atendente não fornecido.");
    }
    console.log(`[Chat] Agent ID: ${agentId}, Agent Name: ${agentName}`);

    // 1. Inicializar ChatDomElements
    if (!window.ChatDomElements || typeof window.ChatDomElements.init !== 'function') {
      console.error("[Chat] Erro: ChatDomElements ou ChatDomElements.init não disponível.");
      throw new Error("ChatDomElements não disponível/inicializável.");
    }
    window.ChatDomElements.init();
    console.log("[Chat] ChatDomElements inicializado.");

    // Atualizar nome do usuário na UI (requer ChatDomElements.userNameElement)
    if (window.ChatDomElements.userNameElement) {
      window.ChatDomElements.userNameElement.textContent = agentName || agentId;
    } else {
      console.warn("[Chat] userNameElement não encontrado no DOM após ChatDomElements.init().");
    }

    // 2. Inicializar NotificationService
    if (!window.NotificationService || typeof window.NotificationService.init !== 'function') {
      console.error("[Chat] Erro: NotificationService ou NotificationService.init não disponível.");
      // Não lançar erro fatal, pode continuar sem notificações sonoras
    } else {
      await window.NotificationService.init();
      console.log("[Chat] NotificationService inicializado.");
    }

    // 3. Verificar ChatUiUpdater ANTES de inicializar
    console.log(`[Chat] ANTES de ChatUiUpdater.initialize: typeof window.ChatUiUpdater: ${typeof window.ChatUiUpdater}`);
    if (window.ChatUiUpdater) {
      console.log(`[Chat] ANTES de ChatUiUpdater.initialize: typeof window.ChatUiUpdater.updateConversations: ${typeof window.ChatUiUpdater.updateConversations}`);
    }

    if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.initialize !== 'function') {
      console.error("[Chat] Erro: ChatUiUpdater ou ChatUiUpdater.initialize não disponível.");
      throw new Error("ChatUiUpdater não disponível/inicializável.");
    }
    window.ChatUiUpdater.initialize(); // Chamada única aqui
    console.log("[Chat] ChatUiUpdater inicializado.");

    // Verificar ChatUiUpdater DEPOIS de inicializar
    console.log(`[Chat] APÓS ChatUiUpdater.initialize: typeof window.ChatUiUpdater.updateConversations: ${typeof window.ChatUiUpdater.updateConversations}`);
    if (typeof window.ChatUiUpdater.updateConversations !== 'function') {
        console.error("[Chat] ERRO APÓS INICIALIZAÇÃO: window.ChatUiUpdater.updateConversations AINDA não é uma função!");
    }


    // 4. Inicializar ChatActions
    if (!window.ChatActions || typeof window.ChatActions.initialize !== 'function') {
      console.error("[Chat] Erro: ChatActions ou ChatActions.initialize não disponível.");
      throw new Error("ChatActions não disponível/inicializável.");
    }
    window.ChatActions.initialize();
    console.log("[Chat] ChatActions inicializado.");

    // 5. Inicializar ChatWebsocketService
    if (!window.ChatWebsocketService || typeof window.ChatWebsocketService.initialize !== 'function') {
      console.error("[Chat] Erro: ChatWebsocketService ou ChatWebsocketService.initialize não disponível.");
      throw new Error("ChatWebsocketService não disponível/inicializável.");
    }
    window.ChatWebsocketService.initialize(agentId, agentName || agentId);
    console.log("[Chat] ChatWebsocketService inicializado e conectando...");

    // 6. Inicializar ChatEventHandlers (DEPOIS de ChatWebsocketService e ChatUiUpdater)
    console.log(`[Chat] ANTES de ChatEventHandlers.initialize: typeof window.ChatUiUpdater: ${typeof window.ChatUiUpdater}`);
    if(window.ChatUiUpdater) {
        console.log(`[Chat] ANTES de ChatEventHandlers.initialize: typeof window.ChatUiUpdater.updateConversations: ${typeof window.ChatUiUpdater.updateConversations}`);
    }

    if (!window.ChatEventHandlers || typeof window.ChatEventHandlers.initialize !== 'function') {
      console.error("[Chat] Erro: ChatEventHandlers ou ChatEventHandlers.initialize não disponível.");
      throw new Error("ChatEventHandlers não disponível/inicializável.");
    }
    window.ChatEventHandlers.initialize();
    console.log("[Chat] ChatEventHandlers inicializado.");

    // 7. Carregar conversas iniciais
    // O WebSocket pode levar um momento para conectar.
    // ChatWebsocketService.handleOpen agora solicita a lista de conversas.
    // Se preferir controlar aqui, adicione um pequeno timeout ou um listener para o evento 'open' do WebSocket.
    // Por ora, vamos confiar que o handleOpen no ChatWebsocketService fará a solicitação inicial.
    // setTimeout(() => {
    //   if (window.ChatActions && typeof window.ChatActions.loadConversations === "function") {
    //     console.log("[Chat] Solicitando conversas iniciais via mainChatScript (após timeout)...");
    //     window.ChatActions.loadConversations("active");
    //   }
    // }, 1000); // Aumentado para dar mais tempo para a conexão WS, se necessário.

    console.log("[Chat] Interface de atendimento inicializada com sucesso.");

  } catch (error) {
    console.error("[Chat] ERRO FATAL DURANTE A INICIALIZAÇÃO DA INTERFACE:", error);
    // Tenta mostrar um alerta mais visível para o usuário
    const bodyElement = document.querySelector('body');
    if (bodyElement) {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '0';
        errorDiv.style.left = '0';
        errorDiv.style.width = '100%';
        errorDiv.style.padding = '20px';
        errorDiv.style.backgroundColor = 'red';
        errorDiv.style.color = 'white';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.zIndex = '9999';
        errorDiv.innerHTML = `<h1>Erro Crítico na Interface</h1><p>Não foi possível carregar a interface de chat.</p><p>Detalhes: ${error.message}</p><p>Verifique o console (Ctrl+Shift+I ou Cmd+Option+I) para mais informações.</p>`;
        bodyElement.prepend(errorDiv);
    } else {
        alert(`ERRO FATAL durante a inicialização: ${error.message}. Verifique o console.`);
    }
  }
});
