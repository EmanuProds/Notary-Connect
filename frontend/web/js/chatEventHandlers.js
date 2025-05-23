// frontend/web/js/chatEventHandlers.js
window.ChatEventHandlers = {
  initialize() {
    console.log("[ChatEventHandlers] initialize: Initializing event handlers.");

    if (!window.ChatWebsocketService) {
      console.error("[ChatEventHandlers] initialize: ChatWebsocketService is not available.");
      return;
    }

    // Register callbacks with the WebSocket service to handle incoming messages
    window.ChatWebsocketService.registerCallbacks({
      onChatListReceived: (payload, tabType) => {
        console.log(`[ChatEventHandlers] onChatListReceived: Tab '${tabType}'. Received ${payload ? payload.length : 'N/A'} conversations. Payload summary:`, JSON.stringify(payload).substring(0, 300) + "...");
        if (!window.ChatUiUpdater || typeof window.ChatUiUpdater.updateConversations !== 'function') {
            console.error("[ChatEventHandlers] onChatListReceived: ChatUiUpdater.updateConversations IS NOT a function.");
            return;
        }
        if (payload && payload.error) { 
            console.error("[ChatEventHandlers] onChatListReceived: Backend error:", payload.error);
            window.ChatUiUpdater.updateConversations([], tabType, `Erro ao carregar: ${payload.error}`);
            return;
        }
        const conversations = Array.isArray(payload) ? payload : [];
        if (!Array.isArray(payload)) {
            console.warn("[ChatEventHandlers] onChatListReceived: Payload was not an array, treating as empty list. Original payload:", payload);
        }
        console.log(`[ChatEventHandlers] onChatListReceived: Calling ChatUiUpdater.updateConversations with ${conversations.length} conversations for tab ${tabType}.`);
        window.ChatUiUpdater.updateConversations(conversations, tabType);
      },

      onChatHistoryReceived: (messages, conversationId) => { // The second argument is the conversationId
        console.log(`[ChatEventHandlers] onChatHistoryReceived: Received for ConvID '${conversationId}'. ${messages ? messages.length : 'N/A'} messages. History summary:`, JSON.stringify(messages).substring(0,300) + "...");
        
        if (typeof conversationId === 'undefined' || conversationId === null) {
            console.error("[ChatEventHandlers] onChatHistoryReceived: CRITICAL ERROR - conversationId is undefined or null. Cannot render history. Messages:", messages);
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
                window.ChatUiUpdater.showError("Erro ao carregar histórico: ID da conversa ausente na resposta do servidor.");
            }
            return;
        }

        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.renderChatHistory === 'function') {
          if (Array.isArray(messages)) {
            console.log(`[ChatEventHandlers] onChatHistoryReceived: Calling ChatUiUpdater.renderChatHistory for ConvID ${conversationId}.`);
            window.ChatUiUpdater.renderChatHistory(messages, String(conversationId)); 
          } else {
            console.warn(`[ChatEventHandlers] onChatHistoryReceived: History payload for ConvID ${conversationId} is not an array:`, messages);
            window.ChatUiUpdater.renderChatHistory([], String(conversationId), "Erro ao carregar histórico (dados inválidos).");
          }
        } else {
            console.error("[ChatEventHandlers] onChatHistoryReceived: ChatUiUpdater.renderChatHistory is not a function.");
        }
      },

      onNewMessage: (data) => { 
        console.log("[ChatEventHandlers] onNewMessage: New message received. Raw data:", JSON.stringify(data));
        if (data && data.payload && data.payload.message && typeof data.payload.conversationId !== 'undefined') { 
            const { conversationId, message } = data.payload;
            console.log(`[ChatEventHandlers] onNewMessage: Processing message for ConvID ${conversationId}. Message:`, message);
            if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
                console.log(`[ChatEventHandlers] onNewMessage: Calling ChatUiUpdater.addNewMessage for ConvID ${conversationId}.`);
                window.ChatUiUpdater.addNewMessage(String(conversationId), message); 
            } else {
                 console.error("[ChatEventHandlers] onNewMessage: ChatUiUpdater.addNewMessage is not a function.");
            }
        } else {
            console.warn("[ChatEventHandlers] onNewMessage: Invalid payload or missing conversationId/message fields:", data);
        }
      },

      onMessageSentAck: (data) => {
        console.log("[ChatEventHandlers] onMessageSentAck: Message sent confirmation:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateLocalMessageStatus === 'function' && data && data.originalMessageId) {
          console.log(`[ChatEventHandlers] onMessageSentAck: Calling ChatUiUpdater.updateLocalMessageStatus for original ID ${data.originalMessageId}. Success: ${data.success}`);
          window.ChatUiUpdater.updateLocalMessageStatus(data.originalMessageId, data.success, data.sentMessageId, data.timestamp);
        } else {
            console.warn("[ChatEventHandlers] onMessageSentAck: Conditions not met for updateLocalMessageStatus. Data:", data, "ChatUiUpdater.updateLocalMessageStatus:", typeof window.ChatUiUpdater.updateLocalMessageStatus);
        }
      },

      onTakeChatResponse: (data) => {
        console.log("[ChatEventHandlers] onTakeChatResponse: Take chat response:", data);
        if (data && data.success && data.conversation && typeof data.conversationId !== 'undefined') {
          console.log(`[ChatEventHandlers] onTakeChatResponse: Successfully took ConvID ${data.conversationId}. Conversation data from backend:`, JSON.stringify(data.conversation));
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function') {
            console.log(`[ChatEventHandlers] onTakeChatResponse: Calling ChatUiUpdater.updateConversationInList for ConvID ${data.conversationId} with selectAfterUpdate=true.`);
            
            const updatedConversationData = {
              ...data.conversation, 
              USER_ID: data.agentId, 
              USER_USERNAME: data.agentName, // Backend should ensure agentName is the USERNAME
              STATUS: 'active', 
              UNREAD_MESSAGES: 0 
            };
            console.log("[ChatEventHandlers] onTakeChatResponse: Conversation data to be used for UI update:", updatedConversationData);

            window.ChatUiUpdater.updateConversationInList(String(data.conversationId), updatedConversationData, true); 

            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat assumido com sucesso!", "success");
            }
          } else {
            console.error("[ChatEventHandlers] onTakeChatResponse: ChatUiUpdater.updateConversationInList is not a function.");
          }
        } else {
          console.warn(`[ChatEventHandlers] onTakeChatResponse: Failed to take chat. Error: ${data.error || "Unknown"}. Data:`, data);
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao assumir chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onEndChatResponse: (data) => {
        console.log("[ChatEventHandlers] onEndChatResponse: End chat response:", data);
        if (data && data.success && typeof data.conversationId !== 'undefined') {
          if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function') {
            console.log(`[ChatEventHandlers] onEndChatResponse: Calling ChatUiUpdater.moveConversationToClosed for ConvID ${data.conversationId}.`);
            window.ChatUiUpdater.moveConversationToClosed(String(data.conversationId)); 
            if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
              window.ChatDomElements.showAlert("Chat encerrado com sucesso!", "success");
            }
          } else {
            console.error("[ChatEventHandlers] onEndChatResponse: ChatUiUpdater.moveConversationToClosed is not a function.");
          }
        } else {
          console.warn("[ChatEventHandlers] onEndChatResponse: Failed to end chat or conversationId missing. Data:", data);
          if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
            window.ChatDomElements.showAlert(`Erro ao encerrar chat: ${data.error || "Erro desconhecido"}`, "error");
          }
        }
      },

      onChatTakenUpdate: (data) => {
        console.log("[ChatEventHandlers] onChatTakenUpdate: Chat taken by another attendant:", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateConversationInList === 'function' && data && data.payload && typeof data.payload.conversationId !== 'undefined') {
          const { conversationId, agentId, agentName } = data.payload; // agentName here is the USERNAME of the other agent
          console.log(`[ChatEventHandlers] onChatTakenUpdate: Calling ChatUiUpdater.updateConversationInList for ConvID ${conversationId}. New attendant: ${agentName} (${agentId})`);
          window.ChatUiUpdater.updateConversationInList(String(conversationId), {
            USER_ID: agentId, // Numeric ID of the other agent
            USER_USERNAME: agentName, // Username of the other agent
            STATUS: 'active'
          }, String(window.ChatUiUpdater.activeConversationId) === String(conversationId)); // Re-select if it's the active chat

          // If the currently viewed chat was taken by someone else, update the UI
          if (String(window.ChatUiUpdater.activeConversationId) === String(conversationId)) {
              if(typeof window.ChatUiUpdater.addSystemMessage === 'function') window.ChatUiUpdater.addSystemMessage(`Atendimento assumido por ${agentName || 'outro atendente'}.`, String(conversationId));
              // Disable input fields if the current user is no longer the assigned agent
              if (window.ChatDomElements && window.ChatWebsocketService && window.ChatWebsocketService.agentId !== agentName) { // Compare with the username of the other agent
                  if(window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = "none";
                  if(window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = "none";
                  if(window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = "none";
                  console.log(`[ChatEventHandlers] onChatTakenUpdate: Controls disabled for ConvID ${conversationId} as it was taken by another agent.`);
              }
          }
        } else {
            console.warn("[ChatEventHandlers] onChatTakenUpdate: Invalid payload, conversationId missing, or ChatUiUpdater.updateConversationInList is not a function.", data);
        }
      },

      onChatClosedUpdate: (data) => {
        console.log("[ChatEventHandlers] onChatClosedUpdate: Chat closed (update):", data);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.moveConversationToClosed === 'function' && data && data.payload && typeof data.payload.conversationId !== 'undefined') {
          const { conversationId } = data.payload;
          console.log(`[ChatEventHandlers] onChatClosedUpdate: Calling ChatUiUpdater.moveConversationToClosed for ConvID ${conversationId}.`);
          window.ChatUiUpdater.moveConversationToClosed(String(conversationId));
        } else {
            console.warn("[ChatEventHandlers] onChatClosedUpdate: Invalid payload, conversationId missing, or ChatUiUpdater.moveConversationToClosed is not a function.", data);
        }
      },

      onPendingConversation: (data) => { 
        console.log("[ChatEventHandlers] onPendingConversation: New pending conversation received:", JSON.stringify(data));
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addOrUpdateConversationInList === 'function' && data && data.payload && typeof data.payload.ID !== 'undefined') {
          const conversationPayload = {
            ID: data.payload.ID,
            CLIENT_ID: data.payload.CLIENT_ID, 
            CLIENT_JID: data.payload.CLIENT_JID,
            CLIENT_NAME: data.payload.CLIENT_NAME,
            CLIENT_WHATSAPP_ID: data.payload.CLIENT_WHATSAPP_ID || data.payload.CLIENT_JID, // Fallback
            CLIENT_PROFILE_PIC: data.payload.CLIENT_PROFILE_PIC,
            STATUS: data.payload.STATUS || 'pending', // Default to pending
            SECTOR: data.payload.SECTOR, 
            LAST_MESSAGE: data.payload.LAST_MESSAGE,
            LAST_MESSAGE_TIME: data.payload.LAST_MESSAGE_TIME,
            UNREAD_MESSAGES: data.payload.UNREAD_MESSAGES === undefined ? 1 : data.payload.UNREAD_MESSAGES, // Default to 1 if new
            USER_ID: data.payload.USER_ID, 
            USER_USERNAME: data.payload.USER_USERNAME, 
          };
          console.log(`[ChatEventHandlers] onPendingConversation: Calling ChatUiUpdater.addOrUpdateConversationInList for ConvID ${conversationPayload.ID}. Formatted payload:`, conversationPayload);
          window.ChatUiUpdater.addOrUpdateConversationInList(conversationPayload, 'active'); // Add to 'active' tab
          // Play notification sound for new pending conversation
          if (window.NotificationService && typeof window.NotificationService.playNewChatSound === 'function') {
            window.NotificationService.playNewChatSound();
          }
        } else {
            console.warn("[ChatEventHandlers] onPendingConversation: Invalid payload, ID missing, or ChatUiUpdater.addOrUpdateConversationInList is not a function.", data);
        }
      },

      onClientTyping: (data) => { 
        // Update typing indicator if the message is for the currently active conversation
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateTypingIndicator === 'function' && data && data.payload &&
            String(window.ChatUiUpdater.activeConversationId) === String(data.payload.conversationId)) {
          window.ChatUiUpdater.updateTypingIndicator(data.payload.clientName, data.payload.isTyping);
        }
      },
      // Add other WebSocket event handlers here as needed
    });

    this.setupUIEventListeners();
    console.log("[ChatEventHandlers] initialize: UI and WebSocket event handlers configured.");
  },

  setupUIEventListeners() {
    if (!window.ChatDomElements) {
      console.error("[ChatEventHandlers] setupUIEventListeners: ChatDomElements not available.");
      return;
    }
    
    // Tab switching for conversation list (e.g., Active, Closed)
    const tabButtons = document.querySelectorAll(".sidebar .tabs .tab-button"); // Adjust selector if needed
    if (tabButtons && tabButtons.length > 0) { 
        // Store nodelist for ChatUiUpdater if it needs to access it
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
        // Modal elements (ensure these are correctly ID'd in ChatDomElements and HTML)
        transferModal, closeModalButton, // Assuming closeModalButton is for the transfer modal
        confirmTransferButton, // Specific to transfer modal
        transferTypeSelect, // Specific to transfer modal
        // transferMessageInput // Specific to transfer modal (ensure it exists)
    } = window.ChatDomElements;

    if (searchInput) searchInput.addEventListener("input", (e) => { if (window.ChatUiUpdater) window.ChatUiUpdater.filterConversations(e.target.value); });
    if (sendButton) sendButton.addEventListener("click", () => this.sendMessage());
    if (messageInput) {
      messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }});
      // Typing indicator logic
      let typingTimeout;
      messageInput.addEventListener('input', () => {
          if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatWebsocketService) {
              clearTimeout(typingTimeout);
              window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, true);
              typingTimeout = setTimeout(() => {
                  window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, false);
              }, 1500); // Send "stopped typing" after 1.5s of inactivity
          }
      });
    }
    if (attachmentButton && fileInput) {
        attachmentButton.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => { if (e.target.files.length > 0) { this.sendFile(e.target.files[0]); e.target.value = null; /* Clear file input */ }});
    }
    if (endChatButton) endChatButton.addEventListener("click", () => this.closeCurrentConversation());
    if (transferChatButton) transferChatButton.addEventListener("click", () => this.openTransferModal());
    if (logoutButton) logoutButton.addEventListener("click", () => this.logout());

    // Event listeners for the transfer modal
    if (closeModalButton && transferModal) closeModalButton.addEventListener("click", () => { console.log("[ChatEventHandlers] Transfer modal close button clicked."); transferModal.style.display = "none";});
    if (confirmTransferButton) confirmTransferButton.addEventListener("click", () => this.handleConfirmTransfer());
    if (transferTypeSelect) transferTypeSelect.addEventListener("change", (e) => this.handleTransferTypeChange(e.target.value));
    
    // Close modal if clicked outside of it
    window.addEventListener('click', (event) => {
        if (transferModal && event.target == transferModal) { // Check if the click is on the modal backdrop
            transferModal.style.display = "none";
        }
    });
    console.log("[ChatEventHandlers] setupUIEventListeners: UI event listeners configured.");
  },

  switchTab(tabType) {
    console.log(`[ChatEventHandlers] switchTab: Switching to tab '${tabType}'.`);
    if (window.ChatUiUpdater && typeof window.ChatUiUpdater.setActiveTab === 'function') {
        window.ChatUiUpdater.setActiveTab(tabType); 
    } else {
        console.error("[ChatEventHandlers] switchTab: ChatUiUpdater.setActiveTab is not a function.");
    }
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        console.log(`[ChatEventHandlers] switchTab: Calling ChatActions.loadConversations for tab '${tabType}'.`);
        window.ChatActions.loadConversations(tabType); 
    } else {
        console.error("[ChatEventHandlers] switchTab: ChatActions.loadConversations is not a function.");
    }
  },

  sendMessage() {
    console.log("[ChatEventHandlers] sendMessage: Attempting to send message.");
    if (window.ChatDomElements && window.ChatDomElements.messageInput && 
        window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && 
        !window.ChatDomElements.messageInput.disabled) { // Check if input is not disabled
      const text = window.ChatDomElements.messageInput.value.trim();
      if (text && window.ChatActions) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails(); 
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID) ) { 
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            console.log(`[ChatEventHandlers] sendMessage: Sending to JID ${recipientJid}, ConvID ${window.ChatUiUpdater.activeConversationId}, Text: "${text.substring(0,30)}..."`);
            window.ChatActions.sendTextMessage(window.ChatUiUpdater.activeConversationId, recipientJid, text);
            window.ChatDomElements.messageInput.value = ""; // Clear input after sending
            // Stop typing indicator
            if (window.ChatWebsocketService) {
                window.ChatWebsocketService.sendTypingStatus(window.ChatUiUpdater.activeConversationId, false);
            }
        } else {
            console.warn("[ChatEventHandlers] sendMessage: Cannot send. Active conversation details or client JID not found. Conversation:", activeConv);
            if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar mensagem: dados do cliente ausentes.", "error");
        }
      } else {
        console.log("[ChatEventHandlers] sendMessage: Empty text or ChatActions not available.");
      }
    } else {
        console.warn("[ChatEventHandlers] sendMessage: Conditions to send message not met. ActiveConvID:", window.ChatUiUpdater ? window.ChatUiUpdater.activeConversationId : "N/A", "MessageInput:", window.ChatDomElements.messageInput ? `Exists, Disabled: ${window.ChatDomElements.messageInput.disabled}` : "Does Not Exist");
    }
  },

  sendFile(file) {
    console.log("[ChatEventHandlers] sendFile: Attempting to send file:", file.name);
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions &&
        window.ChatDomElements && window.ChatDomElements.attachmentButton && !window.ChatDomElements.attachmentButton.disabled) {
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if (activeConv && (activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID)) {
            const recipientJid = activeConv.CLIENT_JID || activeConv.CLIENT_WHATSAPP_ID;
            console.log(`[ChatEventHandlers] sendFile: Sending file to JID ${recipientJid}, ConvID ${window.ChatUiUpdater.activeConversationId}`);
            // Here, you'd typically upload the file to your server first, then send the URL.
            // For now, assuming ChatActions.sendFileMessage handles this (e.g., by calling an upload API).
            window.ChatActions.sendFileMessage(window.ChatUiUpdater.activeConversationId, recipientJid, file);
        } else {
             console.warn("[ChatEventHandlers] sendFile: Cannot send. Active conversation details or client JID not found.");
             if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Não é possível enviar arquivo: dados do cliente ausentes.", "error");
        }
    } else {
        console.warn("[ChatEventHandlers] sendFile: Conditions to send file not met.");
    }
  },
  
  closeCurrentConversation() {
    console.log("[ChatEventHandlers] closeCurrentConversation: Attempting to end active conversation.");
    if (window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId && window.ChatActions) {
      // Use a custom modal/confirm dialog instead of window.confirm
      if (confirm("Tem certeza que deseja encerrar esta conversa?")) { // Placeholder, replace with custom modal
        console.log(`[ChatEventHandlers] closeCurrentConversation: Confirmed. Ending ConvID ${window.ChatUiUpdater.activeConversationId}`);
        window.ChatActions.endChat(window.ChatUiUpdater.activeConversationId);
      } else {
        console.log("[ChatEventHandlers] closeCurrentConversation: Ending conversation cancelled by user.");
      }
    } else {
        console.warn("[ChatEventHandlers] closeCurrentConversation: No active conversation to end.");
    }
  },

  openTransferModal() {
    console.log("[ChatEventHandlers] openTransferModal: Opening transfer modal.");
    if (window.ChatDomElements && window.ChatDomElements.transferModal && window.ChatUiUpdater && window.ChatUiUpdater.activeConversationId) {
        console.log("[ChatEventHandlers] openTransferModal: Modal opened for ConvID:", window.ChatUiUpdater.activeConversationId);
        window.ChatDomElements.transferModal.style.display = "block"; // Or use a class to show
        // Potentially load sectors/attendants here if not already loaded
        // e.g., if (window.ChatActions.loadSectorsForTransfer) window.ChatActions.loadSectorsForTransfer();
    } else {
        console.warn("[ChatEventHandlers] openTransferModal: Cannot open modal (elements not found or no active conversation).");
    }
  },
  
  handleTransferTypeChange(type) {
    console.log(`[ChatEventHandlers] handleTransferTypeChange: Transfer type changed to '${type}'.`);
    if (window.ChatDomElements) {
        // Logic to show/hide sector or attendant selection based on 'type'
        // This assumes you have containers for these lists in your ChatDomElements
        // Example:
        // const { sectorsListContainer, attendantsListContainer } = window.ChatDomElements; // Re-reference for safety
        // if (sectorsListContainer) sectorsListContainer.style.display = type === 'sector' ? 'block' : 'none';
        // if (attendantsListContainer) attendantsListContainer.style.display = type === 'attendant' ? 'block' : 'none';
        
        // Placeholder: Log for now
        console.log(`[ChatEventHandlers] UI should update to show options for transfer type: ${type}`);
    }
  },

  handleConfirmTransfer() {
    console.log("[ChatEventHandlers] handleConfirmTransfer: Confirming transfer.");
    if (!window.ChatUiUpdater || !window.ChatUiUpdater.activeConversationId || !window.ChatDomElements || !window.ChatWebsocketService) {
        console.error("[ChatEventHandlers] handleConfirmTransfer: Dependencies not available.");
        if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Erro ao iniciar transferência.", "error");
        return;
    }
    // Ensure these IDs match your HTML for the transfer modal
    const transferTypeSelect = document.getElementById("transfer-type"); 
    const sectorsListSelect = document.getElementById("sectors-list-select"); // Example ID
    const attendantsListSelect = document.getElementById("attendants-list-select"); // Example ID
    const transferMessageInput = document.getElementById("transfer-message"); // Example ID
    const transferModal = document.getElementById("transfer-modal"); // From ChatDomElements
    
    const conversationId = window.ChatUiUpdater.activeConversationId;
    const transferType = transferTypeSelect ? transferTypeSelect.value : null;
    const targetId = transferType === 'sector' 
        ? (sectorsListSelect ? sectorsListSelect.value : null)
        : (attendantsListSelect ? attendantsListSelect.value : null);
    const message = transferMessageInput ? transferMessageInput.value.trim() : ""; 

    if (!transferType || !targetId) {
        console.warn("[ChatEventHandlers] handleConfirmTransfer: Transfer type or target ID not selected.");
        if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Selecione um tipo e um destino para a transferência.", "warning");
        return;
    }

    console.log(`[ChatEventHandlers] handleConfirmTransfer: Transferring ConvID ${conversationId} to ${transferType} ID ${targetId}. Message: "${message}"`);
    
    if (transferType === 'sector') {
        window.ChatWebsocketService.transferChatToSector(conversationId, targetId, message);
    } else if (transferType === 'attendant') {
        window.ChatWebsocketService.transferChatToAttendant(conversationId, targetId, message);
    }
    
    if (transferModal) transferModal.style.display = "none"; // Hide modal after action
    if(window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') window.ChatDomElements.showAlert("Solicitação de transferência enviada.", "info");
  },

  logout() {
    console.log("[ChatEventHandlers] logout: Requesting logout.");
    // Use a custom modal/confirm dialog instead of window.confirm
    if (confirm("Tem certeza que deseja sair?")) { // Placeholder, replace with custom modal
        if (window.electronAPI && window.electronAPI.navigate) {
            // In Electron, navigate to the login screen via main process
            window.electronAPI.navigate('login'); 
        } else {
            // In a web browser, redirect to the login page
            window.location.href = "/index.html"; // Or your specific login route
        }
    }
  },
};
