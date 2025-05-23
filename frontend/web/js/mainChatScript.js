// frontend/web/js/mainChatScript.js
document.addEventListener("DOMContentLoaded", async () => {
  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[ChatTheme] Tema aplicado: ${theme}`);
  };

  const checkSystemTheme = () => {
    // Verifica se a API do Electron e a função getSystemTheme estão disponíveis
    if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
      window.electronAPI.getSystemTheme().then(theme => {
        applyTheme(theme); // 'theme' já será 'dark' ou 'light'
      }).catch(err => {
        console.warn("[ChatTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
        checkSystemThemeFallback();
      });
    } else {
      // Fallback para window.matchMedia se a API do Electron não estiver disponível
      checkSystemThemeFallback();
    }
  };

  const checkSystemThemeFallback = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light'); // Padrão para claro
    }
  };

  // Aplicar tema na carga inicial
  checkSystemTheme();

  // Ouvir mudanças na preferência do sistema em tempo real (via matchMedia para navegadores ou fallback)
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }

  // Ouvir atualizações de tema do processo principal do Electron, se disponível
  if (window.electronAPI && typeof window.electronAPI.onSystemThemeUpdate === 'function') {
    window.electronAPI.onSystemThemeUpdate((theme) => { // theme já é 'dark' ou 'light'
      console.log('[ChatTheme] Recebida atualização de tema do sistema via Electron API:', theme);
      applyTheme(theme);
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

    // Atualizar nome do usuário na UI (Exemplo, se o elemento existir no novo HTML)
    // No novo HTML, o nome do atendente logado não parece estar em um local fixo na sidebar principal.
    // Se precisar exibir, adicione um elemento com ID "user-name-display" ou similar.
    const userNameDisplayElement = document.getElementById("user-name-display"); // Supondo que você adicione este ID
    if (userNameDisplayElement) {
      userNameDisplayElement.textContent = agentName;
    } else {
      // console.warn("[Chat] userNameDisplayElement (user-name-display) não encontrado no DOM para exibir nome do agente.");
    }


     // Adicionar evento de clique para o botão de voltar (mobile)
     // No novo HTML, o ID é "back-to-chats-mobile" e o container principal é "app-container"
    if (window.ChatDomElements.backToChatsMobileButton && window.ChatDomElements.chatContainer) {
        window.ChatDomElements.backToChatsMobileButton.addEventListener('click', () => {
            // A lógica de mostrar/esconder sidebars no mobile pode ser mais complexa
            // dependendo do layout final.
            // Este é um exemplo simples.
            if (window.ChatDomElements.chatListSidebar) {
                window.ChatDomElements.chatListSidebar.classList.add('active-mobile');
            }
            if (window.ChatDomElements.mainChatContent) {
                 window.ChatDomElements.mainChatContent.style.display = 'none'; // Ou uma classe para esconder
            }
            if (window.ChatUiUpdater) {
                window.ChatUiUpdater.clearChatArea(false); // Não mostrar placeholder de "nenhum chat"
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

    // 7. Carregar conversas iniciais
    // O ChatWebsocketService.handleOpen agora solicita a lista de conversas.
    // Se desejar forçar aqui, pode adicionar uma verificação:
    if (window.ChatWebsocketService.isConnected) {
        if (window.ChatActions && typeof window.ChatActions.loadConversations === "function") {
            console.log("[Chat] WebSocket já conectado. Solicitando conversas iniciais...");
            // Carrega a aba padrão (ex: 'active' ou a primeira da lista de abas)
            const defaultTab = window.ChatDomElements.chatFilterTabsContainer?.querySelector('.filter-tab.active')?.dataset.tab || 'active';
            window.ChatActions.loadConversations(defaultTab); 
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
        errorDiv.style.backgroundColor = 'var(--error-color, red)'; // Use a variável CSS se definida
        errorDiv.style.color = 'var(--text-on-accent-color, white)'; // Use a variável CSS se definida
        errorDiv.style.textAlign = 'center';
        errorDiv.style.zIndex = '9999';
        errorDiv.innerHTML = `<h1>Erro Crítico na Interface</h1><p>Não foi possível carregar a interface de chat.</p><p>Detalhes: ${error.message}</p><p>Verifique o console (Ctrl+Shift+I ou Cmd+Option+I) para mais informações.</p>`;
        bodyElement.prepend(errorDiv);
    } else {
        alert(`ERRO FATAL durante a inicialização: ${error.message}. Verifique o console.`);
    }
  }
});
