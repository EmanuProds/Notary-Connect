// Ações do chat
window.ChatActions = {
  // Inicializar o módulo
  initialize() {
    console.log("[ChatActions] Inicializando ações do chat")
    return this
  },

  // Carregar lista de conversas
  loadConversations(tabType = "active") {
    console.log("[ChatActions] Carregando conversas:", tabType)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.requestConversations(tabType)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Carregar histórico de uma conversa
  loadChatHistory(conversationId) {
    console.log("[ChatActions] Carregando histórico da conversa:", conversationId)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.requestChatHistory(conversationId)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Enviar mensagem de texto
  sendTextMessage(conversationId, text) {
    console.log("[ChatActions] Enviando mensagem de texto:", text)
    if (!text || text.trim() === "") {
      console.warn("[ChatActions] Tentativa de enviar mensagem vazia")
      return false
    }

    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.sendTextMessage(conversationId, text)
      return true
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
      return false
    }
  },

  // Enviar arquivo
  sendFile(conversationId, file) {
    console.log("[ChatActions] Enviando arquivo:", file.name)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.sendFileMessage(conversationId, file)
      return true
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
      return false
    }
  },

  // Assumir conversa
  takeChat(conversationId) {
    console.log("[ChatActions] Assumindo conversa:", conversationId)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.takeChat(conversationId)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Encerrar conversa
  endChat(conversationId) {
    console.log("[ChatActions] Encerrando conversa:", conversationId)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.endChat(conversationId)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Marcar mensagens como lidas
  markMessagesAsRead(conversationId) {
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.markMessagesAsRead(conversationId)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Enviar status de digitação
  sendTypingStatus(conversationId, isTyping) {
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.sendTypingStatus(conversationId, isTyping)
    }
  },

  // Transferir conversa para setor
  transferChatToSector(conversationId, sectorId, message) {
    console.log("[ChatActions] Transferindo conversa para setor:", sectorId)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.transferChatToSector(conversationId, sectorId, message)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Transferir conversa para atendente
  transferChatToAttendant(conversationId, attendantId, message) {
    console.log("[ChatActions] Transferindo conversa para atendente:", attendantId)
    if (window.ChatWebsocketService) {
      window.ChatWebsocketService.transferChatToAttendant(conversationId, attendantId, message)
    } else {
      console.error("[ChatActions] ChatWebsocketService não disponível")
    }
  },

  // Fazer logout
  logout() {
    console.log("[ChatActions] Fazendo logout")
    window.location.href = "index.html"
  },
}
