// web/js/chatEventHandlers.js

window.ChatEventHandlers = {
  initialize() {
    console.log("[ChatEventHandlers] initialize: Initializing event handlers.");

    if (!window.ChatWebsocketService) {
      console.error("[ChatEventHandlers] initialize: ChatWebsocketService is not available.");
    }
    if (!window.ChatDomElements) {
      console.error("[ChatEventHandlers] initialize: ChatDomElements is not available. UI event listeners may not be fully functional.");
    }
    if (!window.ChatUiUpdater) {
        console.error("[ChatEventHandlers] initialize: ChatUiUpdater is not available.");
    }
    if (!window.ChatActions) {
        console.error("[ChatEventHandlers] initialize: ChatActions is not available.");
    }

    if (window.ChatWebsocketService) {
        window.ChatWebsocketService.registerCallbacks({
          onChatListReceived: (payload, tabType) => { // Recebe payload diretamente
            console.log(`[ChatEventHandlers] onChatListReceived: Tab '${tabType}'. Received ${payload ? payload.length : 'N/A'} conversations.`);
            if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.updateConversations !== 'function') {
                console.error("[ChatEventHandlers] onChatListReceived: ChatUiUpdater.updateConversations IS NOT a function.");
                return;
            }
            if (payload && payload.error) {
                console.error("[ChatEventHandlers] onChatListReceived: Backend error:", payload.error);
                window.ChatUiUpdater.updateConversations([], tabType, `Erro ao carregar chats: ${payload.error}`);
                return;
            }
            const conversations = Array.isArray(payload) ? payload : [];
            if (!Array.isArray(payload)) {
                console.warn("[ChatEventHandlers] onChatListReceived: Payload was not an array, treating as empty list. Original payload:", payload);
            }
            window.ChatUiUpdater.updateConversations(conversations, tabType);
          },

          onChatHistoryReceived: (messages, conversationId) => { // Recebe messages (payload) e conversationId
            console.log(`[ChatEventHandlers] onChatHistoryReceived: Received for ConvID '${conversationId}'. ${messages ? messages.length : 'N/A'} messages.`);
            if (typeof conversationId === 'undefined' || conversationId === null) {
                console.error("[ChatEventHandlers] onChatHistoryReceived: CRITICAL ERROR - conversationId is undefined or null. Cannot render history. Messages:", messages);
                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                    window.ChatUiUpdater.showError("Erro ao carregar histórico: ID da conversa ausente na resposta do servidor.");
                }
                return;
            }
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.renderChatHistory === 'function') {
              if (Array.isArray(messages)) {
                window.ChatUiUpdater.renderChatHistory(messages, String(conversationId));
              } else {
                console.warn(`[ChatEventHandlers] onChatHistoryReceived: History payload for ConvID ${conversationId} is not an array:`, messages);
                window.ChatUiUpdater.renderChatHistory([], String(conversationId), "Erro ao carregar histórico (dados inválidos).");
              }
            } else {
                console.error("[ChatEventHandlers] onChatHistoryReceived: ChatUiUpdater.renderChatHistory is not a function.");
            }
          },

          onNewMessage: (data) => { // 'data' here is the full WebSocket message: { type: "new_message", payload: { conversationId: "...", message: {...} } }
            console.log("[ChatEventHandlers] onNewMessage: New message received. Full WS data object:", JSON.stringify(data));
            
            // Correctly access conversationId and the message object from data.payload
            if (data && data.payload && data.payload.message && typeof data.payload.conversationId !== 'undefined') {
                const { conversationId, message } = data.payload; // Destructure from data.payload
                
                console.log(`[ChatEventHandlers] onNewMessage: Processing message for ConvID ${conversationId}. Message details:`, JSON.stringify(message));
                
                // The 'message' object here should contain SENDER_TYPE, CONTENT, TIMESTAMP etc.
                // This 'message' object is passed to ChatUiUpdater.addNewMessage
                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
                    window.ChatUiUpdater.addNewMessage(String(conversationId), message);
                } else {
                     console.error("[ChatEventHandlers] onNewMessage: ChatUiUpdater.addNewMessage is not a function.");
                }
            } else {
                console.warn("[ChatEventHandlers] onNewMessage: Invalid data structure or missing conversationId/message fields in data.payload. Received data:", data);
            }
          },

          onMessageSentAck: (data) => { // 'data' é o payload
            console.log("[ChatEventHandlers] onMessageSentAck: Message sent confirmation:", data);
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateLocalMessageStatus === 'function' && data && data.originalMessageId) {
              window.ChatUiUpdater.updateLocalMessageStatus(data.originalMessageId, data.success, data.sentMessageId, data.timestamp);
            } else {
                console.warn("[ChatEventHandlers] onMessageSentAck: Conditions not met for updateLocalMessageStatus. Data:", data);
            }
          },

          onTakeChatResponse: (data) => { // 'data' é o payload
            console.log("[ChatEventHandlers] onTakeChatResponse RAW DATA (payload from WS):", JSON.stringify(data));

            if (data && data.success && data.conversation && typeof data.conversation.ID !== 'undefined') {
                const conversationFromServer = data.conversation;
                console.log(`[ChatEventHandlers] onTakeChatResponse: Conversation object from server: ID=${conversationFromServer.ID}, STATUS=${conversationFromServer.STATUS}, USER_USERNAME=${conversationFromServer.USER_USERNAME}, USER_ID=${conversationFromServer.USER_ID}. Response also has agentId: ${data.agentId}, agentName: ${data.agentName}`);

                const agentUsernameToUse = conversationFromServer.USER_USERNAME || data.agentId; // Prioriza USER_USERNAME da conversa
                const agentUserIdToUse = conversationFromServer.USER_ID || data.agentId;

                const updatedConversationData = {
                  ...conversationFromServer,
                  STATUS: 'active', 
                  USER_ID: agentUserIdToUse, 
                  USER_USERNAME: agentUsernameToUse, 
                  UNREAD_MESSAGES: 0
                };
                console.log("[ChatEventHandlers] onTakeChatResponse: Data being passed to ChatUiUpdater.updateConversationInList:", JSON.stringify(updatedConversationData));

                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function') {
                    window.ChatUiUpdater.updateConversationInList(String(conversationFromServer.ID), updatedConversationData, true);
                    if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showNotification === 'function') {
                      window.ChatUiUpdater.showNotification("Chat assumido com sucesso!", "success");
                    }
                } else {
                    console.error("[ChatEventHandlers] onTakeChatResponse: ChatUiUpdater.updateConversationInList is not a function.");
                }
            } else {
              console.warn(`[ChatEventHandlers] onTakeChatResponse: Failed to take chat or invalid data. Success: ${data ? data.success : 'N/A'}, Conversation: ${data ? JSON.stringify(data.conversation) : 'N/A'}`);
              if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                window.ChatUiUpdater.showError(`Erro ao assumir chat: ${data && data.error ? data.error : "Dados inválidos da resposta"}`);
              }
            }
          },

          onEndChatResponse: (data) => { // 'data' é o payload
            console.log("[ChatEventHandlers] onEndChatResponse: End chat response:", data);
            if (data && data.success && typeof data.conversationId !== 'undefined') {
              if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function') {
                window.ChatUiUpdater.moveConversationToClosed(String(data.conversationId));
                 if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showNotification === 'function') {
                  window.ChatUiUpdater.showNotification("Chat encerrado com sucesso!", "success");
                }
              } else {
                console.error("[ChatEventHandlers] onEndChatResponse: ChatUiUpdater.moveConversationToClosed is not a function.");
              }
            } else {
              console.warn("[ChatEventHandlers] onEndChatResponse: Failed to end chat or conversationId missing. Data:", data);
              if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                window.ChatUiUpdater.showError(`Erro ao encerrar chat: ${data && data.error ? data.error : "Erro desconhecido"}`);
              }
            }
          },

          onChatTakenUpdate: (data) => { // 'data' é o payload
            console.log("[ChatEventHandlers] onChatTakenUpdate: Chat taken by another attendant:", data);
            // Ajustado para esperar conversationId, agentId, agentName diretamente em 'data' (que é o payload)
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function' && data && typeof data.conversationId !== 'undefined') {
              const { conversationId, agentId, agentName } = data; // agentId is username, agentName is full name
              window.ChatUiUpdater.updateConversationInList(String(conversationId), {
                USER_ID: agentId, // Store username as USER_ID for consistency in some parts of UI
                USER_USERNAME: agentId, 
                USER_NAME_ASSIGNED: agentName, // Store the full name
                STATUS: 'active'
              }, String(window.ChatUiUpdater.activeConversationId) === String(conversationId)); // selectAfterUpdate if it's the current chat

              if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId)) {
                  // Use agentName for the system message, fallback to agentId
                  const displayName = agentName || agentId || 'outro atendente';
                  if(typeof window.ChatUiUpdater.addSystemMessage === 'function') window.ChatUiUpdater.addSystemMessage(`Atendimento assumido por ${displayName}.`, String(conversationId));
                  
                  // Disable controls if the current user is NOT the one who took the chat
                  if (window.ChatDomElements && window.ChatWebsocketService && String(window.ChatWebsocketService.agentId) !== String(agentId)) {
                      if(window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = "none";
                      if(window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = "none";
                      console.log(`[ChatEventHandlers] onChatTakenUpdate: Controls disabled for ConvID ${conversationId} as it was taken by another agent.`);
                  }
              }
            } else {
                console.warn("[ChatEventHandlers] onChatTakenUpdate: Invalid data, conversationId missing, or ChatUiUpdater.updateConversationInList is not a function. Received payload:", data);
            }
          },

          onChatClosedUpdate: (data) => { // 'data' é o payload
            console.log("[ChatEventHandlers] onChatClosedUpdate: Chat closed (update). Received payload:", data);
            // Ajustado para esperar conversationId diretamente em 'data' (que é o payload)
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function' && data && typeof data.conversationId !== 'undefined') {
              const { conversationId } = data;
              window.ChatUiUpdater.moveConversationToClosed(String(conversationId));
            } else {
                console.warn("[ChatEventHandlers] onChatClosedUpdate: Invalid data, conversationId missing, or ChatUiUpdater.moveConversationToClosed is not a function. Received payload:", data);
            }
          },

          onPendingConversation: (data) => { // 'data' is the full WS message: { type: "pending_conversation", payload: { /* conversation object */ } }
            console.log("[ChatEventHandlers] onPendingConversation: Full WebSocket data received:", JSON.stringify(data));
            
            const conversationObject = data.payload; // Extract the conversation object from data.payload

            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function' && 
                conversationObject && typeof conversationObject.ID !== 'undefined') {
              
              console.log("[ChatEventHandlers] onPendingConversation: Processing conversation object:", JSON.stringify(conversationObject));
              window.ChatUiUpdater.addOrUpdateConversationInList(conversationObject, 'active');
              
              // If the updated pending conversation is the currently active one, refresh its message view
              if (window.ChatUiUpdater && String(window.ChatUiUpdater.activeConversationId) === String(conversationObject.ID)) {
                console.log(`[ChatEventHandlers] onPendingConversation: Active chat ${conversationObject.ID} was updated. Reloading history to show new message.`);
                if (window.ChatActions && typeof window.ChatActions.loadChatHistory === 'function') {
                  window.ChatActions.loadChatHistory(conversationObject.ID);
                } else {
                  console.error("[ChatEventHandlers] onPendingConversation: ChatActions.loadChatHistory is not available to refresh active chat.");
                }
              }
              
              if (window.NotificationService && typeof window.NotificationService.playNewChatSound === 'function') {
                window.NotificationService.playNewChatSound();
              }
            } else {
                let errorReason = "";
                if (!conversationObject) errorReason = "conversationObject (data.payload) is null or undefined.";
                else if (typeof conversationObject.ID === 'undefined') errorReason = "conversationObject.ID is undefined.";
                else if (!(window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function')) errorReason = "ChatUiUpdater.addOrUpdateConversationInList is not a function.";
                
                console.warn(`[ChatEventHandlers] onPendingConversation: Conditions not met. Reason: ${errorReason}. Received full data:`, data);
            }
          },

          onClientTyping: (data) => { // 'data' é o payload
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateTypingIndicator === 'function' && data &&
                String(window.ChatUiUpdater.activeConversationId) === String(data.conversationId)) {
              window.ChatUiUpdater.updateTypingIndicator(data.clientName, data.isTyping);
            }
          },

          onChatReopenedResponse: (data) => { // 'data' é o payload da resposta do backend
            console.log("[ChatEventHandlers] onChatReopenedResponse: Resposta da reabertura do chat recebida:", data);
            if (data.success && data.conversation && data.conversation.ID) {
                const conversationId = String(data.conversation.ID);
                const updatedConversation = data.conversation;

                // Remover da lista de 'closed'
                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.removeConversationFromList === 'function') {
                    window.ChatUiUpdater.removeConversationFromList(conversationId, 'closed');
                } else {
                    console.error("[ChatEventHandlers] onChatReopenedResponse: ChatUiUpdater.removeConversationFromList não está disponível.");
                }

                // Adicionar/Atualizar na lista 'active'
                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function') {
                    window.ChatUiUpdater.addOrUpdateConversationInList(updatedConversation, 'active');
                } else {
                     console.error("[ChatEventHandlers] onChatReopenedResponse: ChatUiUpdater.addOrUpdateConversationInList não está disponível.");
                }
                
                // Mudar para a aba 'active' PRIMEIRO
                if (typeof window.ChatUiUpdater.setActiveTab === 'function') {
                    window.ChatUiUpdater.setActiveTab('active');
                } else {
                    console.error("[ChatEventHandlers] onChatReopenedResponse: ChatUiUpdater.setActiveTab não está disponível.");
                }

                // DEPOIS selecionar a conversa, para que ela seja selecionada na aba já visível
                if (typeof window.ChatUiUpdater.selectConversation === 'function') {
                    window.ChatUiUpdater.selectConversation(conversationId); 
                } else {
                    console.error("[ChatEventHandlers] onChatReopenedResponse: ChatUiUpdater.selectConversation não está disponível.");
                }

                if (typeof window.ChatUiUpdater.showNotification === 'function') {
                    window.ChatUiUpdater.showNotification("Chat reaberto com sucesso!", "success");
                }
                // Removido o else que logava erro sobre addOrUpdate ou selectConversation, pois agora são verificados individualmente.
            } else {
                console.error("[ChatEventHandlers] onChatReopenedResponse: Falha ao reabrir chat ou dados da conversa ausentes. Erro:", data.error);
                if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                    window.ChatUiUpdater.showError(data.error || "Falha ao reabrir o chat.");
                }
            }
          }
        });
    }

    this.setupUIEventListeners();
    console.log("[ChatEventHandlers] initialize: UI and WebSocket event handlers configured.");
  },

  setupUIEventListeners() {
    if (!window.ChatDomElements) {
      console.warn("[ChatEventHandlers] setupUIEventListeners: ChatDomElements not available. Skipping UI event listener setup.");
      return;
    }

    const {
        chatSearchInput,
        sendMessageButton,
        messageInput,
        attachmentButton,
        mediaUploadInput,
        endChatButton,
        // sidebarTabsContainer, // Replaced by iconBar
        iconBar, // New element for tab/view switching
        transferChatButton,
        transferModal,
        contactInfoButton,
    } = window.ChatDomElements;

    if (chatSearchInput) {
        chatSearchInput.addEventListener("input", (e) => {
            if (window.ChatUiUpdater) window.ChatUiUpdater.filterConversations(e.target.value);
        });
    } else {
        console.warn("[ChatEventHandlers] chatSearchInput not found in ChatDomElements.");
    }

    if (sendMessageButton) {
        sendMessageButton.addEventListener("click", () => this.sendMessage());
    } else {
        console.warn("[ChatEventHandlers] sendMessageButton not found in ChatDomElements.");
    }

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
    } else {
        console.warn("[ChatEventHandlers] messageInput not found in ChatDomElements.");
    }

    if (attachmentButton && mediaUploadInput) {
        attachmentButton.addEventListener("click", () => mediaUploadInput.click());
        mediaUploadInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.sendFile(e.target.files[0]);
                e.target.value = null;
            }
        });
    } else {
        console.warn("[ChatEventHandlers] attachmentButton or mediaUploadInput not found in ChatDomElements.");
    }

    if (endChatButton) {
        endChatButton.addEventListener("click", () => this.closeCurrentConversation());
    } else {
        console.warn("[ChatEventHandlers] endChatButton not found in ChatDomElements.");
    }
    
    // Updated tab switching logic for the new icon bar
    if (iconBar) {
        iconBar.addEventListener('click', (event) => {
            const clickedItem = event.target.closest('.icon-bar-item[data-tab]');
            if (!clickedItem || !clickedItem.dataset.tab) {
                // Could be a click on the profile icon or empty space, ignore for tab switching.
                return;
            }

            // Remove 'active' class from all icon bar items with data-tab
            if (window.ChatDomElements && window.ChatDomElements.iconBarItems) {
                window.ChatDomElements.iconBarItems.forEach(item => item.classList.remove('active'));
            }
            // Add 'active' class to the clicked item
            clickedItem.classList.add('active');

            const tabType = clickedItem.dataset.tab;
            console.log(`[ChatEventHandlers] Icon bar item selected: ${tabType}`);

            if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
                window.ChatActions.loadConversations(tabType);
            }
            // setActiveTab in ChatUiUpdater might also need to know about the visual change,
            // or its logic might be purely for data/state management.
            // For now, we assume its primary role is to ensure the correct list is displayed.
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.setActiveTab === 'function') {
                window.ChatUiUpdater.setActiveTab(tabType); // This might internally call loadConversations or similar
            }
        });
    } else {
        console.warn("[ChatEventHandlers] iconBar not found in ChatDomElements. Tab switching will not work.");
    }

    if (transferChatButton) {
        transferChatButton.addEventListener("click", () => this.openTransferModal());
    }
    if (contactInfoButton && window.ChatDomElements.contactInfoPanel && window.ChatDomElements.closeContactInfoButton) {
        contactInfoButton.addEventListener('click', () => {
            if (window.ChatDomElements.contactInfoPanel) window.ChatDomElements.contactInfoPanel.classList.add('active');
        });
        window.ChatDomElements.closeContactInfoButton.addEventListener('click', () => {
            if (window.ChatDomElements.contactInfoPanel) window.ChatDomElements.contactInfoPanel.classList.remove('active');
        });
    }
    if (transferModal && window.ChatDomElements.closeModalButton) { 
        window.ChatDomElements.closeModalButton.addEventListener("click", () => {
            transferModal.classList.remove('active');
        });
        if (window.ChatDomElements.confirmTransferButton) {
            window.ChatDomElements.confirmTransferButton.addEventListener("click", () => this.handleConfirmTransfer());
        }
         if (window.ChatDomElements.cancelTransferButton) { 
            window.ChatDomElements.cancelTransferButton.addEventListener("click", () => {
                transferModal.classList.remove('active');
            });
        }
        if (window.ChatDomElements.transferTypeSelect) {
            window.ChatDomElements.transferTypeSelect.addEventListener("change", (e) => this.handleTransferTypeChange(e.target.value));
        }
        window.addEventListener('click', (event) => { 
            if (event.target === transferModal) {
                transferModal.classList.remove('active');
            }
        });
    }

    console.log("[ChatEventHandlers] setupUIEventListeners: UI event listeners setup complete.");
  },

  sendMessage() {
    console.log("[ChatEventHandlers] sendMessage: Attempting to send message.");
    if (!window.ChatDomElements || !window.ChatDomElements.messageInput) {
        console.warn("[ChatEventHandlers] sendMessage: messageInput element not found in ChatDomElements.");
        return;
    }

    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId &&
        !window.ChatDomElements.messageInput.disabled) {
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
            console.warn("[ChatEventHandlers] sendMessage: Cannot send. Active conversation details or client JID not found. Conversation:", activeConv);
            if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não é possível enviar mensagem: dados do cliente ausentes.");
        }
      }
    } else {
        console.warn("[ChatEventHandlers] sendMessage: Conditions to send message not met.");
    }
  },

  sendFile(file) {
    console.log("[ChatEventHandlers] sendFile: Attempting to send file:", file.name);
    if (!window.ChatDomElements || !window.ChatDomElements.attachmentButton) {
        console.warn("[ChatEventHandlers] sendFile: attachmentButton element not found in ChatDomElements.");
        return;
    }

    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions &&
        !window.ChatDomElements.attachmentButton.disabled) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID)) {
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            window.ChatActions.sendFileMessage(window.ChatUiUpdater.activeConversationId, recipientJid, file);
        } else {
             console.warn("[ChatEventHandlers] sendFile: Cannot send. Active conversation details or client JID not found.");
             if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não é possível enviar arquivo: dados do cliente ausentes.");
        }
    } else {
        console.warn("[ChatEventHandlers] sendFile: Conditions to send file not met.");
    }
  },

  closeCurrentConversation() {
    console.log("[ChatEventHandlers] closeCurrentConversation: Attempting to end active conversation.");
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions) {
      const confirmEndChat = () => {
        console.log(`[ChatEventHandlers] closeCurrentConversation: Confirmed. Ending ConvID ${window.ChatUiUpdater.activeConversationId}`);
        window.ChatActions.endChat(window.ChatUiUpdater.activeConversationId);
      };

      if (window.ChatUtils && typeof window.ChatUtils.showCustomConfirm === 'function') {
        window.ChatUtils.showCustomConfirm("Tem certeza que deseja encerrar esta conversa?", confirmEndChat);
      } else if (confirm("Tem certeza que deseja encerrar esta conversa?")) { 
        confirmEndChat();
      }
    } else {
        console.warn("[ChatEventHandlers] closeCurrentConversation: No active conversation to end.");
    }
  },

  openTransferModal() {
    console.log("[ChatEventHandlers] openTransferModal: Opening transfer modal.");
    const transferModal = window.ChatDomElements?.transferModal;

    if (transferModal && window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId) {
        transferModal.classList.add('active');
        const transferTypeSelect = window.ChatDomElements?.transferTypeSelect;
        const sectorsListContainer = window.ChatDomElements?.sectorsListContainer;
        const attendantsListContainer = window.ChatDomElements?.attendantsListContainer;
        const transferMessageInput = window.ChatDomElements?.transferMessageInput;

        if(transferTypeSelect) transferTypeSelect.value = "";
        if(sectorsListContainer) sectorsListContainer.style.display = "none";
        if(attendantsListContainer) attendantsListContainer.style.display = "none";
        if(transferMessageInput) transferMessageInput.value = "";

    } else {
        console.warn("[ChatEventHandlers] openTransferModal: Cannot open modal (elements not found or no active conversation).");
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
            window.ChatUiUpdater.showError("Funcionalidade de transferência indisponível.");
        }
    }
  },

  handleTransferTypeChange(type) {
    console.log(`[ChatEventHandlers] handleTransferTypeChange: Transfer type changed to '${type}'.`);
    const sectorsListContainer = window.ChatDomElements?.sectorsListContainer;
    const attendantsListContainer = window.ChatDomElements?.attendantsListContainer;

    if (sectorsListContainer) {
        sectorsListContainer.style.display = type === 'sector' ? 'block' : 'none';
    }
    if (attendantsListContainer) {
        attendantsListContainer.style.display = type === 'attendant' ? 'block' : 'none';
    }
  },

  handleConfirmTransfer() {
    console.log("[ChatEventHandlers] handleConfirmTransfer: Confirming transfer.");
    if (!window.ChatUiUpdater || !window.ChatUiUpdater.activeConversationId || !window.ChatWebsocketService || !window.ChatDomElements) {
        console.error("[ChatEventHandlers] handleConfirmTransfer: Dependencies not available.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Erro ao iniciar transferência.");
        return;
    }

    const { transferTypeSelect, sectorsListSelect, attendantsListSelect, transferMessageInput, transferModal } = window.ChatDomElements;

    if (!transferTypeSelect || !transferModal) {
        console.warn("[ChatEventHandlers] handleConfirmTransfer: Transfer modal core elements not found.");
         if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
            window.ChatUiUpdater.showError("Erro nos componentes de transferência.");
        }
        return;
    }

    const conversationId = window.ChatUiUpdater.activeConversationId;
    const transferType = transferTypeSelect.value;
    const targetId = transferType === 'sector'
        ? (sectorsListSelect ? sectorsListSelect.value : null)
        : (attendantsListSelect ? attendantsListSelect.value : null);
    const message = transferMessageInput ? transferMessageInput.value.trim() : "";

    if (!transferType || !targetId) {
        console.warn("[ChatEventHandlers] handleConfirmTransfer: Transfer type or target ID not selected.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Selecione um tipo e um destino para a transferência.", "warning");
        return;
    }

    if (transferType === 'sector') {
        window.ChatWebsocketService.transferChatToSector(conversationId, targetId, message);
    } else if (transferType === 'attendant') {
        window.ChatWebsocketService.transferChatToAttendant(conversationId, targetId, message);
    }

    transferModal.classList.remove('active');
    if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showNotification === 'function') window.ChatUiUpdater.showNotification("Solicitação de transferência enviada.", "info");
  },
};
