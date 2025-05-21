// frontend/web/js/chatEventHandlers.js
window.ChatEventHandlers = {
  initialize() {
    console.log("[ChatEventHandlers] initialize: Inicializando manipuladores de eventos.");

    if (!window.ChatWebsocketService) {
      console.error("[ChatEventHandlers] initialize: ChatWebsocketService não está disponível.");
      return;
    }

    window.ChatWebsocketService.registerCallbacks({
      onChatListReceived: (payload, tabType) => {
        console.log(`[ChatEventHandlers] onChatListReceived: Aba '${tabType}'. Recebido ${payload ? payload.length : 'N/A'} conversas. Payload resumido:`, JSON.stringify(payload).substring(0, 300) + "...");
        if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.updateConversations !== 'function') {
            console.error("[ChatEventHandlers] onChatListReceived: ChatUiUpdater.updateConversations NÃO é uma função.");
            return;
        }
        if (payload && payload.error) { 
            console.error("[ChatEventHandlers] onChatListReceived: Erro do backend:", payload.error);
            window.ChatUiUpdater.updateConversations([], tabType, `Erro ao carregar: ${payload.error}`);
            return;
        }
        const conversations = Array.isArray(payload) ? payload : [];
        if (!Array.isArray(payload)) {
            console.warn("[ChatEventHandlers] onChatListReceived: Payload não era um array, tratando como lista vazia. Payload original:", payload);
        }
        console.log(`[ChatEventHandlers] onChatListReceived: Chamando ChatUiUpdater.updateConversations com ${conversations.length} conversas para aba ${tabType}.`);
        window.ChatUiUpdater.updateConversations(conversations, tabType);
      },

      onChatHistoryReceived: (messages, conversationId) => { // O segundo argumento é o conversationId
        console.log(`[ChatEventHandlers] onChatHistoryReceived: Recebido para ConvID '${conversationId}'. ${messages ? messages.length : 'N/A'} mensagens. Histórico resumido:`, JSON.stringify(messages).substring(0,300) + "...");
        
        if (typeof conversationId === 'undefined' || conversationId === null) {
            console.error("[ChatEventHandlers] onChatHistoryReceived: ERRO CRÍTICO - conversationId é indefinido ou nulo. Não é possível renderizar histórico. Mensagens:", messages);
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                window.ChatUiUpdater.showError("Erro ao carregar histórico: ID da conversa ausente na resposta do servidor.");
            }
            return;
        }

        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.renderChatHistory === 'function') {
          if (Array.isArray(messages)) {
            console.log(`[ChatEventHandlers] onChatHistoryReceived: Chamando ChatUiUpdater.renderChatHistory para ConvID ${conversationId}.`);
            window.ChatUiUpdater.renderChatHistory(messages, String(conversationId)); 
          } else {
            console.warn(`[ChatEventHandlers] onChatHistoryReceived: Payload de histórico para ConvID ${conversationId} não é array:`, messages);
            window.ChatUiUpdater.renderChatHistory([], String(conversationId), "Erro ao carregar histórico (dados inválidos).");
          }
        } else {
            console.error("[ChatEventHandlers] onChatHistoryReceived: ChatUiUpdater.renderChatHistory não é uma função.");
        }
      },

      onNewMessage: (data) => { 
        console.log("[ChatEventHandlers] onNewMessage: Nova mensagem recebida. Dados crus:", JSON.stringify(data));
        if (data && data.payload && data.payload.message && typeof data.payload.conversationId !== 'undefined') { 
            const { conversationId, message } = data.payload;
            console.log(`[ChatEventHandlers] onNewMessage: Processando mensagem para ConvID ${conversationId}. Mensagem:`, message);
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
                console.log(`[ChatEventHandlers] onNewMessage: Chamando ChatUiUpdater.addNewMessage para ConvID ${conversationId}.`);
                window.ChatUiUpdater.addNewMessage(String(conversationId), message); 
            } else {
                 console.error("[ChatEventHandlers] onNewMessage: ChatUiUpdater.addNewMessage não é uma função.");
            }
        } else {
            console.warn("[ChatEventHandlers] onNewMessage: Payload inválido ou campos conversationId/message ausentes:", data);
        }
      },

      onMessageSentAck: (data) => {
        console.log("[ChatEventHandlers] onMessageSentAck: Confirmação de mensagem enviada:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateLocalMessageStatus === 'function' && data && data.originalMessageId) {
          console.log(`[ChatEventHandlers] onMessageSentAck: Chamando ChatUiUpdater.updateLocalMessageStatus para ID original ${data.originalMessageId}. Sucesso: ${data.success}`);
          window.ChatUiUpdater.updateLocalMessageStatus(data.originalMessageId, data.success, data.sentMessageId, data.timestamp);
        } else {
            console.warn("[ChatEventHandlers] onMessageSentAck: Condições não atendidas para updateLocalMessageStatus. Data:", data, "ChatUiUpdater.updateLocalMessageStatus:", typeof window.ChatUiUpdater.updateLocalMessageStatus);
        }
      },

      onTakeChatResponse: (data) => {
        console.log("[ChatEventHandlers] onTakeChatResponse: Resposta de assumir chat:", data);
        if (data && data.success && data.conversation && typeof data.conversationId !== 'undefined') {
          console.log(`[ChatEventHandlers] onTakeChatResponse: Sucesso ao assumir ConvID ${data.conversationId}. Dados da conversa recebidos do backend:`, JSON.stringify(data.conversation));
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function') {
            console.log(`[ChatEventHandlers] onTakeChatResponse: Chamando ChatUiUpdater.updateConversationInList para ConvID ${data.conversationId} com selectAfterUpdate=true.`);
            
            const updatedConversationData = {
              ...data.conversation, 
              USER_ID: data.agentId, 
              USER_USERNAME: data.agentName, // O backend deve garantir que agentName seja o USERNAME
              STATUS: 'active', 
              UNREAD_MESSAGES: 0 
            };
            console.log("[ChatEventHandlers] onTakeChatResponse: Dados da conversa a serem usados para atualizar UI:", updatedConversationData);

            window.ChatUiUpdater.updateConversationInList(String(data.conversationId), updatedConversationData, true); 

            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat assumido com sucesso!", "success");
            }
          } else {
            console.error("[ChatEventHandlers] onTakeChatResponse: ChatUiUpdater.updateConversationInList não é uma função.");
          }
        } else {
          console.warn(`[ChatEventHandlers] onTakeChatResponse: Falha ao assumir chat. Erro: ${data.error || "Desconhecido"}. Dados:`, data);
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao assumir chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onEndChatResponse: (data) => {
        console.log("[ChatEventHandlers] onEndChatResponse: Resposta de encerrar chat:", data);
        if (data && data.success && typeof data.conversationId !== 'undefined') {
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function') {
            console.log(`[ChatEventHandlers] onEndChatResponse: Chamando ChatUiUpdater.moveConversationToClosed para ConvID ${data.conversationId}.`);
            window.ChatUiUpdater.moveConversationToClosed(String(data.conversationId)); 
            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat encerrado com sucesso!", "success");
            }
          } else {
            console.error("[ChatEventHandlers] onEndChatResponse: ChatUiUpdater.moveConversationToClosed não é uma função.");
          }
        } else {
          console.warn("[ChatEventHandlers] onEndChatResponse: Falha ao encerrar chat ou conversationId ausente. Data:", data);
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao encerrar chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onChatTakenUpdate: (data) => {
        console.log("[ChatEventHandlers] onChatTakenUpdate: Chat assumido por outro atendente:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function' && data && data.payload && typeof data.payload.conversationId !== 'undefined') {
          const { conversationId, agentId, agentName } = data.payload; // agentName aqui é o USERNAME do outro agente
          console.log(`[ChatEventHandlers] onChatTakenUpdate: Chamando ChatUiUpdater.updateConversationInList para ConvID ${conversationId}. Novo atendente: ${agentName} (${agentId})`);
          window.ChatUiUpdater.updateConversationInList(String(conversationId), {
            USER_ID: agentId, // ID numérico do outro agente
            USER_USERNAME: agentName, // Username do outro agente
            STATUS: 'active'
          }, String(window.ChatUiUpdater.activeConversationId) === String(conversationId)); 

          if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId)) {
              if(typeof window.ChatUiUpdater.addSystemMessage === 'function') window.ChatUiUpdater.addSystemMessage(`Atendimento assumido por ${agentName || 'outro atendente'}.`, String(conversationId));
              if (window.ChatDomElements && window.ChatWebsocketService && window.ChatWebsocketService.agentId !== agentName) { // Compara com o username do outro agente
                  if(window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = "none";
                  if(window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = "none";
                  if(window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = "none";
                  console.log(`[ChatEventHandlers] onChatTakenUpdate: Controles desabilitados para ConvID ${conversationId} pois foi assumido por outro agente.`);
              }
          }
        } else {
            console.warn("[ChatEventHandlers] onChatTakenUpdate: Payload inválido, conversationId ausente ou ChatUiUpdater.updateConversationInList não é função.", data);
        }
      },

      onChatClosedUpdate: (data) => {
        console.log("[ChatEventHandlers] onChatClosedUpdate: Chat encerrado (update):", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function' && data && data.payload && typeof data.payload.conversationId !== 'undefined') {
          const { conversationId } = data.payload;
          console.log(`[ChatEventHandlers] onChatClosedUpdate: Chamando ChatUiUpdater.moveConversationToClosed para ConvID ${conversationId}.`);
          window.ChatUiUpdater.moveConversationToClosed(String(conversationId));
        } else {
            console.warn("[ChatEventHandlers] onChatClosedUpdate: Payload inválido, conversationId ausente ou ChatUiUpdater.moveConversationToClosed não é função.", data);
        }
      },

      onPendingConversation: (data) => { 
        console.log("[ChatEventHandlers] onPendingConversation: Nova conversa pendente recebida:", JSON.stringify(data));
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function' && data && data.payload && typeof data.payload.ID !== 'undefined') {
          const conversationPayload = {
            ID: data.payload.ID,
            CLIENT_ID: data.payload.CLIENT_ID, 
            CLIENT_JID: data.payload.CLIENT_JID,
            CLIENT_NAME: data.payload.CLIENT_NAME,
            CLIENT_WHATSAPP_ID: data.payload.CLIENT_WHATSAPP_ID || data.payload.CLIENT_JID,
            CLIENT_PROFILE_PIC: data.payload.CLIENT_PROFILE_PIC,
            STATUS: data.payload.STATUS || 'pending',
            SECTOR: data.payload.SECTOR, 
            LAST_MESSAGE: data.payload.LAST_MESSAGE,
            LAST_MESSAGE_TIME: data.payload.LAST_MESSAGE_TIME,
            UNREAD_MESSAGES: data.payload.UNREAD_MESSAGES === undefined ? 1 : data.payload.UNREAD_MESSAGES,
            USER_ID: data.payload.USER_ID, 
            USER_USERNAME: data.payload.USER_USERNAME, 
          };
          console.log(`[ChatEventHandlers] onPendingConversation: Chamando ChatUiUpdater.addOrUpdateConversationInList para ConvID ${conversationPayload.ID}. Payload formatado:`, conversationPayload);
          window.ChatUiUpdater.addOrUpdateConversationInList(conversationPayload, 'active'); 
          if (window.NotificationService && typeof window.NotificationService.playNewChatSound === 'function') {
            window.NotificationService.playNewChatSound();
          }
        } else {
            console.warn("[ChatEventHandlers] onPendingConversation: Payload inválido, ID ausente ou ChatUiUpdater.addOrUpdateConversationInList não é função.", data);
        }
      },

      onClientTyping: (data) => { 
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateTypingIndicator === 'function' && data && data.payload &&
            String(window.ChatUiUpdater.activeConversationId) === String(data.payload.conversationId)) {
          window.ChatUiUpdater.updateTypingIndicator(data.payload.clientName, data.payload.isTyping);
        }
      },
    });

    this.setupUIEventListeners();
    console.log("[ChatEventHandlers] initialize: Manipuladores de eventos da UI e WebSocket configurados.");
  },

  setupUIEventListeners() {
    if (!window.ChatDomElements) {
      console.error("[ChatEventHandlers] setupUIEventListeners: ChatDomElements não disponível.");
      return;
    }
    
    const tabButtons = document.querySelectorAll(".sidebar .tabs .tab-button"); 
    if (tabButtons && tabButtons.length > 0) { 
        if(window.ChatDomElements) window.ChatDomElements.tabButtonsNodeList = tabButtons;
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabType = button.dataset.tab;
                this.switchTab(tabType);
            });
        });
    }
    
    const {
        searchInput, sendButton, messageInput, attachmentButton, fileInput,
        endChatButton, transferChatButton, logoutButton, 
        transferModal, closeModalButton, 
        confirmTransferButton, transferTypeSelect, 
        transferMessageInput 
    } = window.ChatDomElements;

    if (searchInput) searchInput.addEventListener("input", (e) => { if (window.ChatUiUpdater) window.ChatUiUpdater.filterConversations(e.target.value); });
    if (sendButton) sendButton.addEventListener("click", () => this.sendMessage());
    if (messageInput) {
      messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }});
      let typingTimeout;
      messageInput.addEventListener('input', () => {
          if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatWebsocketService) {
              clearTimeout(typingTimeout);
              window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, true);
              typingTimeout = setTimeout(() => {
                  window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, false);
              }, 1500); 
          }
      });
    }
    if (attachmentButton && fileInput) {
        attachmentButton.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => { if (e.target.files.length > 0) { this.sendFile(e.target.files[0]); e.target.value = null; }});
    }
    if (endChatButton) endChatButton.addEventListener("click", () => this.closeCurrentConversation());
    if (transferChatButton) transferChatButton.addEventListener("click", () => this.openTransferModal());
    if (logoutButton) logoutButton.addEventListener("click", () => this.logout());

    if (closeModalButton && transferModal) closeModalButton.addEventListener("click", () => { console.log("[ChatEventHandlers] Botão fechar modal de transferência clicado."); transferModal.style.display = "none";});
    if (confirmTransferButton) confirmTransferButton.addEventListener("click", () => this.handleConfirmTransfer());
    if (transferTypeSelect) transferTypeSelect.addEventListener("change", (e) => this.handleTransferTypeChange(e.target.value));
    
    window.addEventListener('click', (event) => {
        if (transferModal && event.target == transferModal) {
            transferModal.style.display = "none";
        }
    });
  },

  switchTab(tabType) {
    console.log(`[ChatEventHandlers] switchTab: Alternando para aba '${tabType}'.`);
    if (window.ChatUiUpdater && typeof window.ChatUiUpdater.setActiveTab === 'function') {
        window.ChatUiUpdater.setActiveTab(tabType); 
    } else {
        console.error("[ChatEventHandlers] switchTab: ChatUiUpdater.setActiveTab não é função.");
    }
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        console.log(`[ChatEventHandlers] switchTab: Chamando ChatActions.loadConversations para aba '${tabType}'.`);
        window.ChatActions.loadConversations(tabType); 
    } else {
        console.error("[ChatEventHandlers] switchTab: ChatActions.loadConversations não é função.");
    }
  },

  sendMessage() {
    console.log("[ChatEventHandlers] sendMessage: Tentando enviar mensagem.");
    if (window.ChatDomElements && window.ChatDomElements.messageInput && 
        window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && 
        !window.ChatDomElements.messageInput.disabled) { // Verifica se o input não está desabilitado
      const text = window.ChatDomElements.messageInput.value.trim();
      if (text && window.ChatActions) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails(); 
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID) ) { 
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            console.log(`[ChatEventHandlers] sendMessage: Enviando para JID ${recipientJid}, ConvID ${window.ChatUiUpdater.activeConversationId}, Texto: "${text.substring(0,30)}..."`);
            window.ChatActions.sendTextMessage(window.ChatUiUpdater.activeConversationId, recipientJid, text);
            window.ChatDomElements.messageInput.value = "";
            if (window.ChatWebsocketService) {
                window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, false);
            }
        } else {
            console.warn("[ChatEventHandlers] sendMessage: Não foi possível enviar. Detalhes da conversa ativa ou JID do cliente não encontrados. Conversa:", activeConv);
            if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar mensagem: dados do cliente ausentes.", "error");
        }
      } else {
        console.log("[ChatEventHandlers] sendMessage: Texto vazio ou ChatActions não disponível.");
      }
    } else {
        console.warn("[ChatEventHandlers] sendMessage: Condições para enviar mensagem não atendidas. ActiveConvID:", window.ChatUiUpdater ? window.ChatUiUpdater.activeConversationId : "N/A", "MessageInput:", window.ChatDomElements.messageInput ? `Existe, Disabled: ${window.ChatDomElements.messageInput.disabled}` : "Não Existe");
    }
  },

  sendFile(file) {
    console.log("[ChatEventHandlers] sendFile: Tentando enviar arquivo:", file.name);
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions &&
        window.ChatDomElements && window.ChatDomElements.attachmentButton && !window.ChatDomElements.attachmentButton.disabled) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID)) {
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            console.log(`[ChatEventHandlers] sendFile: Enviando arquivo para JID ${recipientJid}, ConvID ${window.ChatUiUpdater.activeConversationId}`);
            window.ChatActions.sendFileMessage(window.ChatUiUpdater.activeConversationId, recipientJid, file);
        } else {
             console.warn("[ChatEventHandlers] sendFile: Não foi possível enviar. Detalhes da conversa ativa ou JID do cliente não encontrados.");
             if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar arquivo: dados do cliente ausentes.", "error");
        }
    } else {
        console.warn("[ChatEventHandlers] sendFile: Condições para enviar arquivo não atendidas.");
    }
  },
  
  closeCurrentConversation() {
    console.log("[ChatEventHandlers] closeCurrentConversation: Tentando encerrar conversa ativa.");
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions) {
      if (confirm("Tem certeza que deseja encerrar esta conversa?")) {
        console.log(`[ChatEventHandlers] closeCurrentConversation: Confirmado. Encerrando ConvID ${window.ChatUiUpdater.activeConversationId}`);
        window.ChatActions.endChat(window.ChatUiUpdater.activeConversationId);
      } else {
        console.log("[ChatEventHandlers] closeCurrentConversation: Encerramento cancelado pelo usuário.");
      }
    } else {
        console.warn("[ChatEventHandlers] closeCurrentConversation: Nenhuma conversa ativa para encerrar.");
    }
  },

  openTransferModal() {
    console.log("[ChatEventHandlers] openTransferModal: Abrindo modal de transferência.");
    if (window.ChatDomElements && window.ChatDomElements.transferModal && window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId) {
        console.log("[ChatEventHandlers] openTransferModal: Modal aberto para ConvID:", window.ChatUiUpdater.activeConversationId);
        window.ChatDomElements.transferModal.style.display = "block";
    } else {
        console.warn("[ChatEventHandlers] openTransferModal: Não foi possível abrir modal (elementos não encontrados ou nenhuma conversa ativa).");
    }
  },
  
  handleTransferTypeChange(type) {
    console.log(`[ChatEventHandlers] handleTransferTypeChange: Tipo de transferência alterado para '${type}'.`);
    if (window.ChatDomElements) {
        // A lógica de popular os selects (sectorsListSelect, attendantsListSelect) deve ser chamada aqui
        // Ex: if (type === 'sector' && window.ChatActions.loadSectorsForTransfer) window.ChatActions.loadSectorsForTransfer();
        // Ex: if (type === 'attendant' && window.ChatActions.loadAttendantsForTransfer) window.ChatActions.loadAttendantsForTransfer();
        const { sectorsListContainer, attendantsListContainer } = window.ChatDomElements; // Re-referencia por segurança
        if (sectorsListContainer) sectorsListContainer.style.display = type === 'sector' ? 'block' : 'none';
        if (attendantsListContainer) attendantsListContainer.style.display = type === 'attendant' ? 'block' : 'none';
    }
  },

  handleConfirmTransfer() {
    console.log("[ChatEventHandlers] handleConfirmTransfer: Confirmando transferência.");
    if (!window.ChatUiUpdater || !window.ChatUiUpdater.activeConversationId || !window.ChatDomElements || !window.ChatWebsocketService) {
        console.error("[ChatEventHandlers] handleConfirmTransfer: Dependências não disponíveis.");
        if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Erro ao iniciar transferência.", "error");
        return;
    }
    const transferTypeSelect = document.getElementById("transfer-type"); 
    const sectorsListSelect = document.getElementById("sectors-list-select");
    const attendantsListSelect = document.getElementById("attendants-list-select");
    const transferMessageInput = document.getElementById("transfer-message");
    const transferModal = document.getElementById("transfer-modal");
    
    const conversationId = window.ChatUiUpdater.activeConversationId;
    const transferType = transferTypeSelect ? transferTypeSelect.value : null;
    const targetId = transferType === 'sector' 
        ? (sectorsListSelect ? sectorsListSelect.value : null)
        : (attendantsListSelect ? attendantsListSelect.value : null);
    const message = transferMessageInput ? transferMessageInput.value.trim() : ""; 

    if (!transferType || !targetId) {
        console.warn("[ChatEventHandlers] handleConfirmTransfer: Tipo de transferência ou ID de destino não selecionado.");
        if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Selecione um tipo e um destino para a transferência.", "warning");
        return;
    }

    console.log(`[ChatEventHandlers] handleConfirmTransfer: Transferindo ConvID ${conversationId} para ${transferType} ID ${targetId}. Mensagem: "${message}"`);
    
    if (transferType === 'sector') {
        window.ChatWebsocketService.transferChatToSector(conversationId, targetId, message);
    } else if (transferType === 'attendant') {
        window.ChatWebsocketService.transferChatToAttendant(conversationId, targetId, message);
    }
    
    if (transferModal) transferModal.style.display = "none";
    if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Solicitação de transferência enviada.", "info");
  },

  logout() {
    console.log("[ChatEventHandlers] logout: Solicitando logout.");
    if (confirm("Tem certeza que deseja sair?")) {
        if (window.electronAPI && window.electronAPI.navigate) {
            window.electronAPI.navigate('login'); 
        } else {
            window.location.href = "/index.html"; 
        }
    }
  },
};
