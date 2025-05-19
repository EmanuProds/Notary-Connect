// frontend/web/js/chatEventHandlers.js
window.ChatEventHandlers = {
  initialize() {
    console.log("[ChatEventHandlers] Inicializando manipuladores de eventos.");

    if (!window.ChatWebsocketService) {
      console.error("[ChatEventHandlers] ChatWebsocketService não está disponível.");
      return;
    }

    window.ChatWebsocketService.registerCallbacks({
      onChatListReceived: (payload, tabType) => {
        console.log(`[ChatEventHandlers] CALLBACK onChatListReceived para aba '${tabType}'. Payload:`, payload);
        
        // Log crucial para depurar o problema:
        console.log(`[ChatEventHandlers] DENTRO DE onChatListReceived - Verificando ChatUiUpdater:`, window.ChatUiUpdater);
        if (window.ChatUiUpdater) {
            console.log(`[ChatEventHandlers] DENTRO DE onChatListReceived - typeof window.ChatUiUpdater.updateConversations:`, typeof window.ChatUiUpdater.updateConversations);
        } else {
            console.error("[ChatEventHandlers] DENTRO DE onChatListReceived - window.ChatUiUpdater está INDEFINIDO!");
        }

        if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.updateConversations !== 'function') {
            console.error("[ChatEventHandlers] ERRO CRÍTICO em onChatListReceived: window.ChatUiUpdater.updateConversations NÃO é uma função. ChatUiUpdater atual:", window.ChatUiUpdater);
            if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
                window.ChatDomElements.showAlert("Erro crítico ao processar lista de chats (UI Updater). Contacte o suporte.", "error");
            }
            return;
        }

        if (payload && payload.error) { 
            console.error("[ChatEventHandlers] Erro recebido do backend ao buscar lista de conversas:", payload.error);
            window.ChatUiUpdater.updateConversations([], tabType, `Erro ao carregar: ${payload.error}`);
            return;
        }

        const conversations = payload; 
        
        if (Array.isArray(conversations)) {
          console.log(`[ChatEventHandlers] Atualizando UI com ${conversations.length} conversas para aba ${tabType}.`);
          window.ChatUiUpdater.updateConversations(conversations, tabType);
        } else {
          console.warn("[ChatEventHandlers] Payload da lista de conversas não é um array válido:", conversations);
          window.ChatUiUpdater.updateConversations([], tabType, "Formato de dados de conversas inválido do servidor.");
        }
      },

      onChatHistoryReceived: (messages, conversationId) => {
        console.log("[ChatEventHandlers] Histórico de chat recebido:", conversationId, messages ? messages.length : 'payload indefinido');
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.renderChatHistory === 'function') {
          if (Array.isArray(messages)) {
            window.ChatUiUpdater.renderChatHistory(messages, conversationId);
          } else {
            console.warn("[ChatEventHandlers] Payload do histórico de chat não é um array:", messages);
            window.ChatUiUpdater.renderChatHistory([], conversationId, "Erro ao carregar histórico.");
          }
        } else {
            console.error("[ChatEventHandlers] ChatUiUpdater.renderChatHistory não é uma função.");
        }
      },

      onNewMessage: (data) => { 
        console.log("[ChatEventHandlers] Nova mensagem recebida:", data);
        if (data && data.payload && data.payload.message) {
            const { conversationId, message } = data.payload;
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function' && typeof window.ChatUiUpdater.updateConversationInList === 'function') {
                window.ChatUiUpdater.addNewMessage(conversationId, message);

                if (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") { 
                    window.ChatUiUpdater.updateConversationInList(conversationId, {
                        LAST_MESSAGE: message.CONTENT || message.content || message.MESSAGE_CONTENT, 
                        LAST_MESSAGE_TIME: message.TIMESTAMP || message.timestamp,
                        UNREAD_MESSAGES: (currentConv) => {
                            if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId) && document.hasFocus()) { 
                                if (window.ChatActions) {
                                    window.ChatActions.markMessagesAsRead(conversationId); 
                                }
                                return 0; 
                            }
                            if (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") {
                                const convInList = window.ChatUiUpdater.getConversationFromListById(conversationId);
                                return convInList ? (convInList.UNREAD_MESSAGES || 0) + 1 : 1;
                            }
                            return currentConv ? currentConv.UNREAD_MESSAGES : 0; 
                        }
                    });
                }
            } else {
                 console.error("[ChatEventHandlers] Funções do ChatUiUpdater para nova mensagem não encontradas.");
            }
        } else {
            console.warn("[ChatEventHandlers] Nova mensagem recebida com payload inválido:", data);
        }
      },

      onMessageSentAck: (data) => {
        console.log("[ChatEventHandlers] Confirmação de mensagem enviada:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateLocalMessageStatus === 'function' && data && data.originalMessageId) {
          window.ChatUiUpdater.updateLocalMessageStatus(data.originalMessageId, data.success, data.sentMessageId, data.timestamp);
        }
      },

      onTakeChatResponse: (data) => {
        console.log("[ChatEventHandlers] Resposta de assumir chat:", data);
        if (data && data.success && data.conversation) {
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function') {
            window.ChatUiUpdater.updateConversationInList(data.conversationId, {
              ATTENDANT_ID: data.agentId,
              ATTENDANT_USERNAME: data.agentName, 
              ATTENDANT_NAME_ASSIGNED: data.agentName, 
              STATUS: 'active', 
              UNREAD_MESSAGES: 0 
            }, true); 

            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat assumido com sucesso!", "success");
            }
          }
        } else {
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao assumir chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onEndChatResponse: (data) => {
        console.log("[ChatEventHandlers] Resposta de encerrar chat:", data);
        if (data && data.success) {
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function') {
            window.ChatUiUpdater.moveConversationToClosed(data.conversationId);
            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat encerrado com sucesso!", "success");
            }
            if (String(window.ChatUiUpdater.activeConversationId) === String(data.conversationId)) {
                if(typeof window.ChatUiUpdater.clearChatArea === 'function') window.ChatUiUpdater.clearChatArea();
            }
          }
        } else {
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao encerrar chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onChatTakenUpdate: (data) => {
        console.log("[ChatEventHandlers] Chat assumido por outro atendente:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function' && data && data.payload) {
          const { conversationId, agentId, agentName } = data.payload;
          window.ChatUiUpdater.updateConversationInList(conversationId, {
            ATTENDANT_ID: agentId,
            ATTENDANT_USERNAME: agentName, 
            ATTENDANT_NAME_ASSIGNED: agentName,
            STATUS: 'active'
          });
          if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId)) {
              if(typeof window.ChatUiUpdater.addSystemMessage === 'function') window.ChatUiUpdater.addSystemMessage(`Atendimento assumido por ${agentName || 'outro atendente'}.`, conversationId);
          }
        }
      },

      onChatClosedUpdate: (data) => {
        console.log("[ChatEventHandlers] Chat encerrado (update):", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function' && data && data.payload) {
          const { conversationId } = data.payload;
          window.ChatUiUpdater.moveConversationToClosed(conversationId);
          if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId)) {
              if(typeof window.ChatUiUpdater.clearChatArea === 'function') window.ChatUiUpdater.clearChatArea();
          }
        }
      },

      onPendingConversation: (data) => { 
        console.log("[ChatEventHandlers] Nova conversa pendente recebida:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function' && data && data.payload) {
          window.ChatUiUpdater.addOrUpdateConversationInList(data.payload, 'active'); 
          if (window.NotificationService && typeof window.NotificationService.playNewChatSound === 'function') {
            window.NotificationService.playNewChatSound();
          }
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
    console.log("[ChatEventHandlers] Manipuladores de eventos inicializados.");
  },

  setupUIEventListeners() {
    console.log("[ChatEventHandlers] Configurando listeners de eventos da UI.");
    if (!window.ChatDomElements) {
      console.error("[ChatEventHandlers] ChatDomElements não está disponível.");
      return;
    }
    
    const tabButtons = document.querySelectorAll(".sidebar .tabs .tab-button"); 
    
    if (tabButtons && tabButtons.length > 0) { 
        console.log(`[ChatEventHandlers] ${tabButtons.length} botões de aba encontrados.`);
        // Armazena a NodeList em ChatDomElements para referência, se ChatUiUpdater precisar
        if(window.ChatDomElements) window.ChatDomElements.tabButtonsNodeList = tabButtons;

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabType = button.dataset.tab;
                this.switchTab(tabType);
            });
        });
    } else {
        console.warn("[ChatEventHandlers] Botões de aba (tabButtons) não encontrados com seletor '.sidebar .tabs .tab-button'.");
    }
    
    const {
        searchInput, sendButton, messageInput, attachmentButton, fileInput,
        endChatButton, transferChatButton, logoutButton, closeModalButton, transferModal
    } = window.ChatDomElements;

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        if (window.ChatUiUpdater) window.ChatUiUpdater.filterConversations(e.target.value);
      });
    } else { console.warn("[ChatEventHandlers] searchInput não encontrado."); }

    if (sendButton) {
      sendButton.addEventListener("click", () => this.sendMessage());
    } else { console.warn("[ChatEventHandlers] sendButton não encontrado."); }

    if (messageInput) {
      messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
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
    } else { console.warn("[ChatEventHandlers] messageInput não encontrado."); }
    
    if (attachmentButton && fileInput) {
        attachmentButton.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
            if (e.target.files.length > 0) {
                this.sendFile(e.target.files[0]);
                e.target.value = null; 
            }
        });
    } else { console.warn("[ChatEventHandlers] attachmentButton ou fileInput não encontrado."); }

    if (endChatButton) {
        endChatButton.addEventListener("click", () => this.closeCurrentConversation());
    } else { console.warn("[ChatEventHandlers] endChatButton não encontrado."); }

    if (transferChatButton) {
        transferChatButton.addEventListener("click", () => this.openTransferModal());
    } else { console.warn("[ChatEventHandlers] transferChatButton não encontrado."); }
    
    if (logoutButton) {
        logoutButton.addEventListener("click", () => this.logout());
    } else { console.warn("[ChatEventHandlers] logoutButton não encontrado."); }

    if (closeModalButton && transferModal) {
        closeModalButton.addEventListener("click", () => transferModal.style.display = "none");
    } else { console.warn("[ChatEventHandlers] closeModalButton ou transferModal não encontrado."); }
    
    console.log("[ChatEventHandlers] Listeners de eventos da UI configurados (ou tentativa).");
  },

  switchTab(tabType) {
    console.log("[ChatEventHandlers] Alternando para aba:", tabType);
    if (window.ChatUiUpdater && typeof window.ChatUiUpdater.setActiveTab === 'function') {
        window.ChatUiUpdater.setActiveTab(tabType); 
    } else {
        console.error("[ChatEventHandlers] ChatUiUpdater.setActiveTab não é uma função.");
    }
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        window.ChatActions.loadConversations(tabType); 
    } else {
        console.error("[ChatEventHandlers] ChatActions.loadConversations não é uma função.");
    }
  },

  sendMessage() {
    if (window.ChatDomElements && window.ChatDomElements.messageInput && window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId) {
      const text = window.ChatDomElements.messageInput.value.trim();
      if (text && window.ChatActions) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails(); 
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID) ) { 
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            window.ChatActions.sendTextMessage(window.ChatUiUpdater.activeConversationId, recipientJid, text);
            window.ChatDomElements.messageInput.value = "";
            if (window.ChatWebsocketService) {
                window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, false);
            }
        } else {
            console.warn("[ChatEventHandlers] Não foi possível enviar mensagem: Detalhes da conversa ativa ou JID do cliente não encontrados. Conversa ativa:", activeConv);
            if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar mensagem: dados do cliente ausentes.", "error");
        }
      }
    }
  },

  sendFile(file) {
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID)) {
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            window.ChatActions.sendFileMessage(window.ChatUiUpdater.activeConversationId, recipientJid, file);
        } else {
             console.warn("[ChatEventHandlers] Não foi possível enviar arquivo: Detalhes da conversa ativa ou JID do cliente não encontrados.");
             if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar arquivo: dados do cliente ausentes.", "error");
        }
    }
  },
  
  closeCurrentConversation() {
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions) {
      if (confirm("Tem certeza que deseja encerrar esta conversa?")) {
        window.ChatActions.endChat(window.ChatUiUpdater.activeConversationId);
      }
    } else {
        console.warn("[ChatEventHandlers] Nenhuma conversa ativa para encerrar.");
    }
  },

  openTransferModal() {
    if (window.ChatDomElements && window.ChatDomElements.transferModal && window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId) {
        console.log("[ChatEventHandlers] Abrindo modal de transferência para conversa:", window.ChatUiUpdater.activeConversationId);
        window.ChatDomElements.transferModal.style.display = "block";
    } else {
        console.warn("[ChatEventHandlers] Não é possível abrir modal: Elementos não encontrados ou nenhuma conversa ativa.");
    }
  },

  logout() {
    if (confirm("Tem certeza que deseja sair?")) {
        console.log("[ChatEventHandlers] Logout solicitado.");
        if (window.electronAPI && window.electronAPI.navigate) {
            window.electronAPI.navigate('login'); 
        } else {
            window.location.href = "/index.html"; 
        }
    }
  },
};
