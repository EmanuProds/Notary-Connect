// frontend/web/js/chatActions.js
window.ChatActions = {
  initialize() {
    console.log("[ChatActions] initialize: ChatActions initialized.");
    return this;
  },

  loadConversations(tabType = "active") {
    console.log(`[ChatActions] loadConversations: Requesting conversations for tab '${tabType}'.`);
    if (window.ChatWebsocketService) {
      console.log(`[ChatActions] loadConversations: Calling ChatWebsocketService.requestConversations('${tabType}').`);
      window.ChatWebsocketService.requestConversations(tabType);
    } else {
      console.error("[ChatActions] loadConversations: ChatWebsocketService not available.");
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Erro de conexão: Não foi possível carregar conversas.");
      }
    }
  },

  loadChatHistory(conversationId, limit = 50, offset = 0) {
    console.log(`[ChatActions] loadChatHistory: Requesting history for ConvID ${conversationId}, Limit: ${limit}, Offset: ${offset}.`);
    if (window.ChatWebsocketService) {
      console.log(`[ChatActions] loadChatHistory: Calling ChatWebsocketService.requestChatHistory for ConvID ${conversationId}.`);
      window.ChatWebsocketService.requestChatHistory(conversationId, limit, offset);
    } else {
      console.error(`[ChatActions] loadChatHistory: ChatWebsocketService not available for ConvID ${conversationId}.`);
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Erro de conexão: Não foi possível carregar histórico do chat.");
      }
    }
  },

  sendTextMessage(conversationId, recipientJid, text) {
    console.log(`[ChatActions] sendTextMessage: Initializing. ConvID: ${conversationId}, JID: ${recipientJid}, Text: "${text ? text.substring(0,30) : 'N/A'}..."`);
    if (!text || text.trim() === "") {
      console.warn("[ChatActions] sendTextMessage: Attempt to send empty message.");
      return false;
    }
    if (!recipientJid) {
        console.error("[ChatActions] sendTextMessage: Error - recipientJid not provided.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar a mensagem: destinatário não identificado.");
        return false;
    }
    if (!conversationId) {
        console.error("[ChatActions] sendTextMessage: Error - conversationId not provided.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar a mensagem: ID da conversa ausente.");
        return false;
    }

    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.sendTextMessage === 'function') {
      const localMessageId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`[ChatActions] sendTextMessage: Generated local ID ${localMessageId}. Calling ChatWebsocketService.sendTextMessage.`);
      
      window.ChatWebsocketService.sendTextMessage(conversationId, recipientJid, text, localMessageId); 
      
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
        const messageData = {
          id: localMessageId, 
          ID: localMessageId, // For consistency if UI expects ID
          conversationId: conversationId,
          SENDER_TYPE: "AGENT", 
          AGENT_NAME: (window.ChatWebsocketService && window.ChatWebsocketService.agentName) ? window.ChatWebsocketService.agentName : "Eu", 
          CONTENT: text,
          MESSAGE_TYPE: "chat", // Or determine based on content if more complex
          TIMESTAMP: new Date().toISOString(),
          // Client details for UI consistency, if available
        };
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if(activeConv) {
            messageData.CLIENT_NAME = activeConv.CLIENT_NAME;
            // messageData.CLIENT_PROFILE_PIC = activeConv.CLIENT_PROFILE_PIC; // If needed by createMessageElement
        }

        console.log(`[ChatActions] sendTextMessage: Calling ChatUiUpdater.addNewMessage for local ID ${localMessageId} with data:`, messageData);
        window.ChatUiUpdater.addNewMessage(String(conversationId), messageData);
        
        // Add 'sending' class to the newly added message element
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) {
            msgElement.classList.add('sending');
            console.log(`[ChatActions] sendTextMessage: 'sending' class added to local message ${localMessageId}.`);
        } else {
            // This might happen if addNewMessage is async or DOM update is slow.
            // Consider a slight delay or a callback if this is a persistent issue.
            console.warn(`[ChatActions] sendTextMessage: Local message element ${localMessageId} not found immediately after adding.`);
        }
      } else {
        console.error("[ChatActions] sendTextMessage: ChatUiUpdater or ChatUiUpdater.addNewMessage not available.");
      }
      return true; 
    } else {
      console.error("[ChatActions] sendTextMessage: ChatWebsocketService or ChatWebsocketService.sendTextMessage not available.");
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Erro de conexão: Não foi possível enviar mensagem.");
      }
      return false;
    }
  },

  async sendFileMessage(conversationId, recipientJid, file, caption = "") {
    console.log(`[ChatActions] sendFileMessage: Preparing to send file '${file.name}' to ConvID ${conversationId}, JID ${recipientJid}. Caption: "${caption}"`);
     if (!recipientJid) {
        console.error("[ChatActions] sendFileMessage: Error - recipientJid not provided.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar o arquivo: destinatário não identificado.");
        return false;
    }
    if (!conversationId) {
        console.error("[ChatActions] sendFileMessage: Error - conversationId not provided.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar o arquivo: ID da conversa ausente.");
        return false;
    }

    // 1. Show local message with a placeholder/loading state
    const localMessageId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const placeholderMediaUrl = URL.createObjectURL(file); // For local preview
    
    if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
        const messageData = {
            id: localMessageId, ID: localMessageId, conversationId: conversationId,
            SENDER_TYPE: "AGENT", AGENT_NAME: (window.ChatWebsocketService && window.ChatWebsocketService.agentName) ? window.ChatWebsocketService.agentName : "Eu",
            CONTENT: caption || file.name, 
            MESSAGE_TYPE: file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : (file.type.startsWith('audio/') ? 'audio' : 'document')),
            MEDIA_URL: placeholderMediaUrl, 
            FILENAME: file.name, 
            TIMESTAMP: new Date().toISOString(),
        };
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if(activeConv) {
            messageData.CLIENT_NAME = activeConv.CLIENT_NAME;
        }
        window.ChatUiUpdater.addNewMessage(String(conversationId), messageData);
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) msgElement.classList.add('sending'); // Indicate it's being processed
    }

    // 2. Upload the file to the server
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientJid', recipientJid); // Send clientJid for folder organization
    if (caption) formData.append('caption', caption);

    try {
        console.log(`[ChatActions] sendFileMessage: Uploading file '${file.name}' to /api/chat/upload-media`);
        const response = await fetch('/api/chat/upload-media', {
            method: 'POST',
            body: formData,
            // Headers are automatically set by FormData for multipart/form-data
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`Upload failed: ${errorData.message || response.statusText}`);
        }

        const result = await response.json();
        console.log(`[ChatActions] sendFileMessage: File uploaded successfully. Server URL: ${result.url}`);

        // 3. Send WebSocket message with the server URL
        if (window.ChatWebsocketService && typeof window.ChatWebsocketService.sendFileMessage === 'function') {
          console.log(`[ChatActions] sendFileMessage: Calling ChatWebsocketService.sendFileMessage with server URL: ${result.url}`);
          window.ChatWebsocketService.sendFileMessage(conversationId, recipientJid, {
              url: result.url, // URL from the server
              type: file.type,
              name: file.name, // Or result.originalName if preferred
              caption: caption 
          }, localMessageId); // Send localMessageId for ACK
          // The UI update for success/failure will be handled by onMessageSentAck
          return true;
        } else {
          throw new Error("ChatWebsocketService or sendFileMessage not available after upload.");
        }
    } catch (error) {
        console.error(`[ChatActions] sendFileMessage: Error during file send process for ${file.name}:`, error);
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.updateLocalMessageStatus === 'function') {
            // Mark the local message as failed
            window.ChatUiUpdater.updateLocalMessageStatus(localMessageId, false, null, null);
        }
        if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
            window.ChatUiUpdater.showError(`Falha ao enviar arquivo: ${error.message}`);
        }
        URL.revokeObjectURL(placeholderMediaUrl); // Clean up object URL
        return false;
    }
  },

  takeChat(conversationId) {
    console.log(`[ChatActions] takeChat: Requesting to take ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.takeChat === 'function') {
      window.ChatWebsocketService.takeChat(conversationId);
    } else {
      console.error(`[ChatActions] takeChat: ChatWebsocketService or ChatWebsocketService.takeChat not available for ConvID ${conversationId}.`);
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Erro de conexão: Não foi possível assumir o chat.");
      }
    }
  },

  endChat(conversationId) {
    console.log(`[ChatActions] endChat: Requesting to end ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.endChat === 'function') {
      window.ChatWebsocketService.endChat(conversationId);
    } else {
      console.error(`[ChatActions] endChat: ChatWebsocketService or ChatWebsocketService.endChat not available for ConvID ${conversationId}.`);
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Erro de conexão: Não foi possível encerrar o chat.");
      }
    }
  },

  markMessagesAsRead(conversationId) {
    console.log(`[ChatActions] markMessagesAsRead: Marking messages as read for ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.markMessagesAsRead === 'function') {
      window.ChatWebsocketService.markMessagesAsRead(conversationId);
    } else {
      console.error(`[ChatActions] markMessagesAsRead: ChatWebsocketService or ChatWebsocketService.markMessagesAsRead not available for ConvID ${conversationId}.`);
      // No user-facing error here, as it's a background action.
    }
  },
};
