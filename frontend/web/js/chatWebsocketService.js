// frontend/web/js/chatWebsocketService.js
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

  initialize(agentId, agentName) {
    console.log("[ChatWebsocketService] initialize: Inicializando com agentId:", agentId, "agentName:", agentName);
    this.agentId = agentId;
    this.agentName = agentName;
    this.connect();
    return this;
  },

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/chat?agentId=${this.agentId}&agentName=${encodeURIComponent(this.agentName)}`;

    console.log("[ChatWebsocketService] connect: Conectando ao WebSocket:", wsUrl);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = this.handleOpen.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onerror = this.handleError.bind(this);
  },

  handleOpen() {
    console.log("[ChatWebsocketService] handleOpen: Conexão estabelecida.");
    this.isConnected = true;
    this.reconnectAttempts = 0;

    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      console.log("[ChatWebsocketService] handleOpen: Enviando mensagem pendente:", message);
      this.sendMessageInternal(message);
    }
    
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        console.log("[ChatWebsocketService] handleOpen: Solicitando lista de conversas ativas.");
        setTimeout(() => { 
            window.ChatActions.loadConversations("active");
        }, 200);
    }
  },

  handleMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
      console.log("[ChatWebsocketService] handleMessage: Mensagem recebida do servidor:", data);
    } catch (error) {
      console.error("[ChatWebsocketService] handleMessage: Erro ao parsear mensagem JSON:", error, "Dados recebidos:", event.data);
      return;
    }

    // Notificações sonoras
    if (data.type === "new_message" && data.payload && data.payload.message && (data.payload.message.senderType === "CLIENT" || data.payload.message.SENDER_TYPE === "CLIENT")) {
      if (window.NotificationService) window.NotificationService.playMessageSound();
    }
    if (data.type === "pending_conversation") {
      if (window.NotificationService) window.NotificationService.playNewChatSound();
    }

    const callbackName = this.mapEventTypeToCallbackName(data.type);
    if (data.type && this.callbacks[callbackName]) {
      console.log(`[ChatWebsocketService] handleMessage: Chamando callback '${callbackName}'.`);
      
      // CORREÇÃO CRÍTICA AQUI:
      if (data.type === 'chat_history_response') {
        // Passa o payload (array de mensagens) e o conversationId (do nível superior)
        console.log(`[ChatWebsocketService] handleMessage: Passando para ${callbackName} - payload: (array de mensagens), conversationId: ${data.conversationId}`);
        this.callbacks[callbackName](data.payload, data.conversationId); 
      } else if (data.type === 'chat_list_response') {
        // Passa o payload (array de conversas) e o tabType
        console.log(`[ChatWebsocketService] handleMessage: Passando para ${callbackName} - payload: (array de conversas), tabType: ${data.tabType}`);
        this.callbacks[callbackName](data.payload, data.tabType);
      } 
      // Para outros eventos, o payload da mensagem WS (data.payload) é o que o handler espera
      else {
        console.log(`[ChatWebsocketService] handleMessage: Passando para ${callbackName} - payload da mensagem WS:`, data.payload);
        this.callbacks[callbackName](data.payload); 
      }
    } else {
      console.warn(`[ChatWebsocketService] handleMessage: Nenhum callback registrado para o tipo de mensagem: ${data.type}`);
    }
  },

  mapEventTypeToCallbackName(eventType) {
    const map = {
        'chat_list_response': 'onChatListReceived',
        'chat_history_response': 'onChatHistoryReceived',
        'new_message': 'onNewMessage',
        'message_sent_ack': 'onMessageSentAck',
        'take_chat_response': 'onTakeChatResponse',
        'end_chat_response': 'onEndChatResponse',
        'chat_taken_update': 'onChatTakenUpdate',
        'chat_closed_update': 'onChatClosedUpdate',
        'pending_conversation': 'onPendingConversation',
        'client_typing': 'onClientTyping'
    };
    return map[eventType] || eventType;
  },

  handleClose(event) {
    console.log(`[ChatWebsocketService] handleClose: Conexão fechada. Limpa: ${event.wasClean}, Código: ${event.code}, Motivo: ${event.reason}`);
    this.isConnected = false;
    if (!event.wasClean) {
      console.warn("[ChatWebsocketService] handleClose: Conexão não foi limpa. Tentando reconectar...");
      this.attemptReconnect();
    }
  },

  handleError(error) {
    console.error("[ChatWebsocketService] handleError: Erro de WebSocket:", error);
  },

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`[ChatWebsocketService] attemptReconnect: Tentando reconectar em ${delay/1000}s (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error("[ChatWebsocketService] attemptReconnect: Número máximo de tentativas de reconexão atingido.");
      if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.", "error");
      } else {
        alert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.");
      }
    }
  },

  sendMessageInternal(messageObject) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(messageObject);
      console.log("[ChatWebsocketService] sendMessageInternal: Enviando mensagem:", messageString.substring(0,150)+"...");
      this.socket.send(messageString);
      return true;
    } else {
      console.warn("[ChatWebsocketService] sendMessageInternal: Conexão não está aberta. Adicionando à fila. Mensagem:", messageObject);
      this.pendingMessages.push(messageObject);
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
          console.log("[ChatWebsocketService] sendMessageInternal: Socket fechado ou fechando. Tentando reconectar.");
          this.attemptReconnect();
      }
      return false;
    }
  },

  registerCallbacks(callbacks) {
    console.log("[ChatWebsocketService] registerCallbacks: Registrando callbacks:", Object.keys(callbacks));
    this.callbacks = callbacks;
  },

  requestConversations(tabType = "active") {
    console.log(`[ChatWebsocketService] requestConversations: Solicitando lista de conversas para aba '${tabType}'.`);
    this.sendMessageInternal({
      type: "request_chat_list",
      tabType: tabType,
    });
  },

  requestChatHistory(conversationId, limit = 50, offset = 0) {
    console.log(`[ChatWebsocketService] requestChatHistory: Solicitando histórico para ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "request_chat_history",
      conversationId: conversationId, 
      limit: limit,
      offset: offset
    });
  },

  sendTextMessage(conversationId, recipientJid, text, localMessageId) { 
    console.log(`[ChatWebsocketService] sendTextMessage: Enviando para ConvID ${conversationId}, JID ${recipientJid}, ID Local ${localMessageId}. Texto: "${text.substring(0,30)}..."`);
    this.sendMessageInternal({
      type: "send_chat_message",
      payload: {
        conversationId: conversationId,
        to: recipientJid,
        text: text,
        id: localMessageId, 
      },
    });
    return localMessageId; 
  },

  sendFileMessage(conversationId, recipientJid, fileData, localMessageId) { 
    console.log(`[ChatWebsocketService] sendFileMessage: Enviando arquivo para ConvID ${conversationId}, JID ${recipientJid}, ID Local ${localMessageId}. Dados do arquivo:`, fileData);
    this.sendMessageInternal({
        type: "send_chat_message",
        payload: {
            conversationId: conversationId,
            to: recipientJid,
            media: { 
                url: fileData.url, 
                type: fileData.type,
                fileName: fileData.name, 
            },
            text: fileData.caption || "", 
            id: localMessageId,
        }
    });
    return localMessageId;
  },

  takeChat(conversationId) {
    console.log(`[ChatWebsocketService] takeChat: Assumindo ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "take_chat",
      conversationId: conversationId,
    });
  },

  endChat(conversationId) {
    console.log(`[ChatWebsocketService] endChat: Encerrando ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "end_chat",
      conversationId: conversationId,
    });
  },

  markMessagesAsRead(conversationId) {
    console.log(`[ChatWebsocketService] markMessagesAsRead: Marcando mensagens como lidas para ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "mark_messages_as_read",
      conversationId: conversationId,
    });
  },

  sendTypingStatus(conversationId, isTyping) {
    this.sendMessageInternal({
      type: "agent_typing",
      conversationId: conversationId,
      isTyping: isTyping,
    });
  },

  transferChatToSector(conversationId, sectorId, message = null) {
    console.log(`[ChatWebsocketService] transferChatToSector: Transferindo ConvID ${conversationId} para setor ${sectorId}.`);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "sector",
      targetId: sectorId,
      message: message,
    });
  },

  transferChatToAttendant(conversationId, attendantId, message = null) {
    console.log(`[ChatWebsocketService] transferChatToAttendant: Transferindo ConvID ${conversationId} para atendente ${attendantId}.`);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "attendant",
      targetId: attendantId,
      message: message,
    });
  },
};

if (typeof window !== 'undefined') {
    window.ChatWebsocketService = ChatWebsocketService;
}
