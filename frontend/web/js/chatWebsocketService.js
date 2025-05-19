// Serviço de WebSocket para o chat
const ChatWebsocketService = {
  socket: null,
  agentId: null,
  agentName: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 3000,
  callbacks: {},
  isConnected: false,
  pendingMessages: [],

  // Inicializar o serviço
  initialize(agentId, agentName) {
    console.log("[ChatWebsocketService] Inicializando com agentId:", agentId, "agentName:", agentName)
    this.agentId = agentId
    this.agentName = agentName
    this.connect()
    return this
  },

  // Conectar ao WebSocket
  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/chat?agentId=${this.agentId}&agentName=${encodeURIComponent(this.agentName)}`

    console.log("[ChatWebsocketService] Conectando ao WebSocket:", wsUrl)
    this.socket = new WebSocket(wsUrl)

    this.socket.onopen = this.handleOpen.bind(this)
    this.socket.onmessage = this.handleMessage.bind(this)
    this.socket.onclose = this.handleClose.bind(this)
    this.socket.onerror = this.handleError.bind(this)
  },

  // Manipular evento de conexão aberta
  handleOpen() {
    console.log("[ChatWebsocketService] Conexão estabelecida")
    this.reconnectAttempts = 0
    this.isConnected = true

    // Enviar mensagens pendentes
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift()
      this.sendMessage(message)
    }

    // Solicitar lista de conversas após conexão estabelecida
    setTimeout(() => {
      this.requestConversations("active")
    }, 500)
  },

  // Manipular mensagens recebidas
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data)
      console.log("[ChatWebsocketService] Mensagem recebida:", data)

      // Verificar se é uma nova mensagem de chat
      if (data.type === "new_message" && data.message && data.message.senderType === "client") {
        // Reproduzir som de notificação se a mensagem for de um cliente
        if (window.NotificationService) {
          window.NotificationService.playMessageSound()
        }
      }

      // Verificar se é uma nova conversa pendente
      if (data.type === "new_conversation") {
        if (window.NotificationService) {
          window.NotificationService.playNewChatSound()
        }
      }

      // Processar diferentes tipos de mensagens
      switch (data.type) {
        case "chat_list_response":
          if (this.callbacks.onChatListReceived) {
            this.callbacks.onChatListReceived(data.payload, data.tabType)
          }
          break
        case "chat_history_response":
          if (this.callbacks.onChatHistoryReceived) {
            this.callbacks.onChatHistoryReceived(data.payload, data.conversationId)
          }
          break
        case "new_message":
          if (this.callbacks.onNewMessage) {
            this.callbacks.onNewMessage(data)
          }
          break
        case "message_sent_ack":
          if (this.callbacks.onMessageSentAck) {
            this.callbacks.onMessageSentAck(data)
          }
          break
        case "take_chat_response":
          if (this.callbacks.onTakeChatResponse) {
            this.callbacks.onTakeChatResponse(data)
          }
          break
        case "end_chat_response":
          if (this.callbacks.onEndChatResponse) {
            this.callbacks.onEndChatResponse(data)
          }
          break
        case "chat_taken_update":
          if (this.callbacks.onChatTakenUpdate) {
            this.callbacks.onChatTakenUpdate(data)
          }
          break
        case "chat_closed_update":
          if (this.callbacks.onChatClosedUpdate) {
            this.callbacks.onChatClosedUpdate(data)
          }
          break
        case "pending_conversation":
          if (this.callbacks.onPendingConversation) {
            this.callbacks.onPendingConversation(data)
          }
          break
        case "client_typing":
          if (this.callbacks.onClientTyping) {
            this.callbacks.onClientTyping(data)
          }
          break
      }
    } catch (error) {
      console.error("[ChatWebsocketService] Erro ao processar mensagem:", error)
    }
  },

  // Manipular fechamento da conexão
  handleClose(event) {
    this.isConnected = false
    if (event.wasClean) {
      console.log(`[ChatWebsocketService] Conexão fechada normalmente, código=${event.code} motivo=${event.reason}`)
    } else {
      console.error("[ChatWebsocketService] Conexão interrompida")
      this.attemptReconnect()
    }
  },

  // Manipular erros
  handleError(error) {
    console.error("[ChatWebsocketService] Erro:", error)
  },

  // Tentar reconectar
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(
        `[ChatWebsocketService] Tentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      )

      setTimeout(() => {
        this.connect()
      }, this.reconnectDelay)
    } else {
      console.error("[ChatWebsocketService] Número máximo de tentativas de reconexão atingido")
      alert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.")
    }
  },

  // Enviar mensagem
  sendMessage(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message))
      return true
    } else {
      console.warn("[ChatWebsocketService] Não foi possível enviar mensagem: conexão não está aberta")
      // Armazenar mensagem para envio posterior
      this.pendingMessages.push(message)
      return false
    }
  },

  // Registrar callbacks para mensagens
  registerCallbacks(callbacks) {
    console.log("[ChatWebsocketService] Registrando callbacks:", Object.keys(callbacks))
    this.callbacks = callbacks
  },

  // Solicitar lista de conversas
  requestConversations(tabType = "active") {
    console.log("[ChatWebsocketService] Solicitando lista de conversas:", tabType)
    this.sendMessage({
      type: "request_chat_list",
      tabType: tabType,
    })
  },

  // Solicitar histórico de conversa
  requestChatHistory(conversationId) {
    console.log("[ChatWebsocketService] Solicitando histórico da conversa:", conversationId)
    this.sendMessage({
      type: "request_chat_history",
      conversationId: conversationId,
    })
  },

  // Enviar mensagem de texto
  sendTextMessage(conversationId, text) {
    console.log("[ChatWebsocketService] Enviando mensagem de texto para conversa:", conversationId)
    this.sendMessage({
      type: "send_chat_message",
      payload: {
        conversationId: conversationId,
        to: null, // Será preenchido pelo servidor
        text: text,
        id: Date.now().toString(), // ID temporário para rastreamento
      },
    })
  },

  // Enviar mensagem de arquivo
  sendFileMessage(conversationId, file) {
    console.log("[ChatWebsocketService] Enviando arquivo para conversa:", conversationId)
    // Implementar lógica para upload de arquivo
    // ...
  },

  // Assumir conversa
  takeChat(conversationId) {
    console.log("[ChatWebsocketService] Assumindo conversa:", conversationId)
    this.sendMessage({
      type: "take_chat",
      conversationId: conversationId,
    })
  },

  // Encerrar conversa
  endChat(conversationId) {
    console.log("[ChatWebsocketService] Encerrando conversa:", conversationId)
    this.sendMessage({
      type: "end_chat",
      conversationId: conversationId,
    })
  },

  // Marcar mensagens como lidas
  markMessagesAsRead(conversationId) {
    this.sendMessage({
      type: "mark_messages_as_read",
      conversationId: conversationId,
    })
  },

  // Enviar status de digitação
  sendTypingStatus(conversationId, isTyping) {
    this.sendMessage({
      type: "agent_typing",
      conversationId: conversationId,
      isTyping: isTyping,
    })
  },

  // Transferir conversa para setor
  transferChatToSector(conversationId, sectorId, message = null) {
    console.log("[ChatWebsocketService] Transferindo conversa para setor:", sectorId)
    this.sendMessage({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "sector",
      targetId: sectorId,
      message: message,
    })
  },

  // Transferir conversa para atendente
  transferChatToAttendant(conversationId, attendantId, message = null) {
    console.log("[ChatWebsocketService] Transferindo conversa para atendente:", attendantId)
    this.sendMessage({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "attendant",
      targetId: attendantId,
      message: message,
    })
  },
}

// Exportar para uso global
window.ChatWebsocketService = ChatWebsocketService
