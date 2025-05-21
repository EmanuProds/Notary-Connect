// frontend/web/js/chatActions.js
window.ChatActions = {
  initialize() {
    console.log("[ChatActions] initialize: ChatActions inicializado.");
    return this;
  },

  loadConversations(tabType = "active") {
    console.log(`[ChatActions] loadConversations: Solicitando conversas para aba '${tabType}'.`);
    if (window.ChatWebsocketService) {
      console.log(`[ChatActions] loadConversations: Chamando ChatWebsocketService.requestConversations('${tabType}').`);
      window.ChatWebsocketService.requestConversations(tabType);
    } else {
      console.error("[ChatActions] loadConversations: ChatWebsocketService não disponível.");
    }
  },

  loadChatHistory(conversationId, limit = 50, offset = 0) {
    console.log(`[ChatActions] loadChatHistory: Solicitando histórico para ConvID ${conversationId}, Limite: ${limit}, Offset: ${offset}.`);
    if (window.ChatWebsocketService) {
      console.log(`[ChatActions] loadChatHistory: Chamando ChatWebsocketService.requestChatHistory para ConvID ${conversationId}.`);
      window.ChatWebsocketService.requestChatHistory(conversationId, limit, offset);
    } else {
      console.error(`[ChatActions] loadChatHistory: ChatWebsocketService não disponível para ConvID ${conversationId}.`);
    }
  },

  sendTextMessage(conversationId, recipientJid, text) {
    console.log(`[ChatActions] sendTextMessage: Iniciando. ConvID: ${conversationId}, JID: ${recipientJid}, Texto: "${text ? text.substring(0,30) : 'N/A'}..."`);
    if (!text || text.trim() === "") {
      console.warn("[ChatActions] sendTextMessage: Tentativa de enviar mensagem vazia.");
      return false;
    }
    if (!recipientJid) {
        console.error("[ChatActions] sendTextMessage: Erro - recipientJid não fornecido.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar a mensagem: destinatário não identificado.");
        return false;
    }
    if (!conversationId) {
        console.error("[ChatActions] sendTextMessage: Erro - conversationId não fornecido.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar a mensagem: ID da conversa ausente.");
        return false;
    }


    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.sendTextMessage === 'function') {
      const localMessageId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`[ChatActions] sendTextMessage: Gerado ID local ${localMessageId}. Chamando ChatWebsocketService.sendTextMessage.`);
      
      // A função no ChatWebsocketService foi ajustada para receber localMessageId
      window.ChatWebsocketService.sendTextMessage(conversationId, recipientJid, text, localMessageId); 
      
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
        const messageData = {
          id: localMessageId, 
          ID: localMessageId, 
          conversationId: conversationId,
          SENDER_TYPE: "AGENT", 
          AGENT_NAME: window.ChatWebsocketService.agentName || "Eu", 
          CONTENT: text,
          MESSAGE_TYPE: "chat", 
          TIMESTAMP: new Date().toISOString(),
        };
        const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if(activeConv) {
            messageData.CLIENT_NAME = activeConv.CLIENT_NAME;
            messageData.CLIENT_PROFILE_PIC = activeConv.CLIENT_PROFILE_PIC;
        }

        console.log(`[ChatActions] sendTextMessage: Chamando ChatUiUpdater.addNewMessage para ID local ${localMessageId} com dados:`, messageData);
        window.ChatUiUpdater.addNewMessage(String(conversationId), messageData); // Garantir que conversationId seja string
        
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) {
            msgElement.classList.add('sending');
            console.log(`[ChatActions] sendTextMessage: Classe 'sending' adicionada à mensagem local ${localMessageId}.`);
        } else {
            console.warn(`[ChatActions] sendTextMessage: Elemento da mensagem local ${localMessageId} não encontrado após adição.`);
        }
      } else {
        console.error("[ChatActions] sendTextMessage: ChatUiUpdater ou ChatUiUpdater.addNewMessage não disponível.");
      }
      return true; 
    } else {
      console.error("[ChatActions] sendTextMessage: ChatWebsocketService ou ChatWebsocketService.sendTextMessage não disponível.");
      return false;
    }
  },

  sendFileMessage(conversationId, recipientJid, file, caption = "") {
    console.log(`[ChatActions] sendFileMessage: Preparando para enviar arquivo '${file.name}' para ConvID ${conversationId}, JID ${recipientJid}. Legenda: "${caption}"`);
     if (!recipientJid) {
        console.error("[ChatActions] sendFileMessage: Erro - recipientJid não fornecido.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar o arquivo: destinatário não identificado.");
        return false;
    }
    if (!conversationId) {
        console.error("[ChatActions] sendFileMessage: Erro - conversationId não fornecido.");
        if(window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') window.ChatUiUpdater.showError("Não foi possível enviar o arquivo: ID da conversa ausente.");
        return false;
    }

    console.warn("[ChatActions] sendFileMessage: Lógica de UPLOAD REAL do arquivo para o backend precisa ser implementada aqui.");
    const placeholderMediaUrl = URL.createObjectURL(file); 
    const simulatedServerUrl = `/uploads/simulated/${file.name}`; 
    console.log(`[ChatActions] sendFileMessage: URL local para preview: ${placeholderMediaUrl}. URL simulada do servidor: ${simulatedServerUrl}`);


    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.sendFileMessage === 'function') {
      const localMessageId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`[ChatActions] sendFileMessage: Gerado ID local ${localMessageId}. Chamando ChatWebsocketService.sendFileMessage com URL: ${simulatedServerUrl}`);
      
      window.ChatWebsocketService.sendFileMessage(conversationId, recipientJid, {
          url: simulatedServerUrl, 
          type: file.type,
          name: file.name,
          caption: caption 
      }, localMessageId); 

      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.addNewMessage === 'function') {
        const messageData = {
          id: localMessageId, ID: localMessageId, conversationId: conversationId,
          SENDER_TYPE: "AGENT", AGENT_NAME: window.ChatWebsocketService.agentName || "Eu",
          CONTENT: caption || file.name, 
          MESSAGE_TYPE: file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : (file.type.startsWith('audio/') ? 'audio' : 'document')),
          MEDIA_URL: placeholderMediaUrl, 
          FILENAME: file.name, 
          TIMESTAMP: new Date().toISOString(),
        };
         const activeConv = window.ChatUiUpdater.getActiveConversationDetails();
        if(activeConv) {
            messageData.CLIENT_NAME = activeConv.CLIENT_NAME;
            messageData.CLIENT_PROFILE_PIC = activeConv.CLIENT_PROFILE_PIC;
        }
        console.log(`[ChatActions] sendFileMessage: Chamando ChatUiUpdater.addNewMessage para ID local ${localMessageId} com dados:`, messageData);
        window.ChatUiUpdater.addNewMessage(String(conversationId), messageData); // Garantir que conversationId seja string
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) msgElement.classList.add('sending');
      } else {
        console.error("[ChatActions] sendFileMessage: ChatUiUpdater ou ChatUiUpdater.addNewMessage não disponível.");
      }
      return true;
    } else {
      console.error("[ChatActions] sendFileMessage: ChatWebsocketService ou ChatWebsocketService.sendFileMessage não disponível.");
      return false;
    }
  },

  takeChat(conversationId) {
    console.log(`[ChatActions] takeChat: Solicitando assumir ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.takeChat === 'function') {
      window.ChatWebsocketService.takeChat(conversationId);
    } else {
      console.error(`[ChatActions] takeChat: ChatWebsocketService ou ChatWebsocketService.takeChat não disponível para ConvID ${conversationId}.`);
    }
  },

  endChat(conversationId) {
    console.log(`[ChatActions] endChat: Solicitando encerrar ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.endChat === 'function') {
      window.ChatWebsocketService.endChat(conversationId);
    } else {
      console.error(`[ChatActions] endChat: ChatWebsocketService ou ChatWebsocketService.endChat não disponível para ConvID ${conversationId}.`);
    }
  },

  markMessagesAsRead(conversationId) {
    console.log(`[ChatActions] markMessagesAsRead: Marcando mensagens como lidas para ConvID ${conversationId}.`);
    if (window.ChatWebsocketService && typeof window.ChatWebsocketService.markMessagesAsRead === 'function') {
      window.ChatWebsocketService.markMessagesAsRead(conversationId);
    } else {
      console.error(`[ChatActions] markMessagesAsRead: ChatWebsocketService ou ChatWebsocketService.markMessagesAsRead não disponível para ConvID ${conversationId}.`);
    }
  },
};
