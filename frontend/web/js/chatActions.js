// frontend/web/js/chatActions.js
window.ChatActions = {
  initialize() {
    console.log("[ChatActions] Inicializando ações do chat");
    return this;
  },

  loadConversations(tabType = "active") {
    console.log("[ChatActions] Carregando conversas:", tabType);
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.requestConversations(tabType);
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para carregar conversas.");
    }
  },

  loadChatHistory(conversationId, limit = 50, offset = 0) {
    console.log("[ChatActions] Carregando histórico da conversa:", conversationId);
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.requestChatHistory(conversationId, limit, offset);
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para carregar histórico.");
    }
  },

  // CORRIGIDO: Adicionado recipientJid como parâmetro
  sendTextMessage(conversationId, recipientJid, text) {
    console.log(`[ChatActions] Tentando enviar mensagem de texto para convID: ${conversationId}, para JID: ${recipientJid}, texto: "${text}"`);
    if (!text || text.trim() === "") {
      console.warn("[ChatActions] Tentativa de enviar mensagem vazia.");
      return false;
    }
    if (!recipientJid) {
        console.error("[ChatActions] Erro ao enviar mensagem: recipientJid (destinatário) não fornecido.");
        if(window.ChatUiUpdater) window.ChatUiUpdater.showError("Não foi possível enviar a mensagem: destinatário não identificado.");
        return false;
    }

    if (window.ChatWebsocketService) {
      const localMessageId = window.ChatWebsocketService.sendTextMessage(conversationId, recipientJid, text);
      
      // Adiciona a mensagem localmente à UI imediatamente (otimismo)
      if (window.ChatUiUpdater && localMessageId) {
        const messageData = {
          id: localMessageId, // ID local temporário
          ID: localMessageId, // Para consistência com createMessageElement
          conversationId: conversationId,
          SENDER_TYPE: "AGENT", // Ou o tipo que você usa para o agente
          AGENT_NAME: window.ChatWebsocketService.agentName || "Eu", // Nome do agente logado
          CONTENT: text,
          MESSAGE_TYPE: "chat", // ou 'text'
          TIMESTAMP: new Date().toISOString(),
          // Outros campos podem ser necessários dependendo de createMessageElement
        };
        window.ChatUiUpdater.addNewMessage(conversationId, messageData); // Passa conversationId e o objeto message
        // Adiciona a classe 'sending' para indicar que está aguardando confirmação
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) msgElement.classList.add('sending');
      }
      return true;
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para enviar mensagem.");
      return false;
    }
  },

  sendFileMessage(conversationId, recipientJid, file) {
    console.log("[ChatActions] Enviando arquivo:", file.name, "para convID:", conversationId, "JID:", recipientJid);
     if (!recipientJid) {
        console.error("[ChatActions] Erro ao enviar arquivo: recipientJid não fornecido.");
        if(window.ChatUiUpdater) window.ChatUiUpdater.showError("Não foi possível enviar o arquivo: destinatário não identificado.");
        return false;
    }
    if (window.ChatWebsocketService) {
      // Aqui, você precisaria de uma lógica para fazer upload do arquivo para um servidor
      // e obter uma URL, ou enviar o arquivo como base64/blob via WebSocket (se suportado).
      // Por enquanto, vamos simular que temos uma URL.
      // Em um cenário real, isso seria assíncrono.
      const placeholderMediaUrl = URL.createObjectURL(file); // URL local temporária para preview, NÃO para envio direto
      console.warn("[ChatActions] Simulação de envio de arquivo. URL de mídia é um placeholder:", placeholderMediaUrl);

      const localMessageId = window.ChatWebsocketService.sendFileMessage(conversationId, recipientJid, {
          url: placeholderMediaUrl, // Idealmente, esta seria uma URL do servidor após o upload
          type: file.type,
          name: file.name
      }, file.name); // Legenda pode ser o nome do arquivo

      if (window.ChatUiUpdater && localMessageId) {
        const messageData = {
          id: localMessageId, ID: localMessageId, conversationId: conversationId,
          SENDER_TYPE: "AGENT", AGENT_NAME: window.ChatWebsocketService.agentName || "Eu",
          CONTENT: file.name, // Ou uma legenda
          MESSAGE_TYPE: file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'document'),
          MEDIA_URL: placeholderMediaUrl, // Para preview local
          TIMESTAMP: new Date().toISOString(),
        };
        window.ChatUiUpdater.addNewMessage(conversationId, messageData);
        const msgElement = document.querySelector(`.message[data-id="${localMessageId}"]`);
        if (msgElement) msgElement.classList.add('sending');
      }
      return true;
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para enviar arquivo.");
      return false;
    }
  },

  takeChat(conversationId) {
    console.log("[ChatActions] Assumindo conversa:", conversationId);
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.takeChat(conversationId);
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para assumir chat.");
    }
  },

  endChat(conversationId) {
    console.log("[ChatActions] Encerrando conversa:", conversationId);
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.endChat(conversationId);
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para encerrar chat.");
    }
  },

  markMessagesAsRead(conversationId) {
    console.log("[ChatActions] Marcando mensagens como lidas para conversa:", conversationId);
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.markMessagesAsRead(conversationId);
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível para marcar mensagens como lidas.");
    }
  },

  // sendTypingStatus não é geralmente chamado de ChatActions, mas de ChatEventHandlers diretamente.
  // Se precisar, pode adicionar aqui.

  // transferChatToSector e transferChatToAttendant podem ser chamados a partir de um modal na UI
  // que seria aberto por ChatEventHandlers.
};
