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

  // Nova função para atualizar a UI do status da conexão
  _updateConnectionStatusUI(status, message) {
    const statusElement = window.ChatDomElements && window.ChatDomElements.connectionStatus 
                          ? window.ChatDomElements.connectionStatus 
                          : document.getElementById('connectionStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = 'connection-status fixed bottom-4 right-4 px-4 py-2 rounded-md text-sm font-medium shadow-md z-50'; // Reset classes
      switch (status) {
        case 'connected':
          statusElement.classList.add('connected'); // Adiciona classe para fundo verde
          break;
        case 'disconnected':
          statusElement.classList.add('disconnected'); // Adiciona classe para fundo vermelho
          break;
        case 'connecting':
        default:
          statusElement.classList.add('connecting'); // Adiciona classe para fundo amarelo/padrão
          break;
      }
      console.log(`[ChatWebsocketService] UI Connection Status Updated: ${status} - ${message}`);
    } else {
      console.warn("[ChatWebsocketService] _updateConnectionStatusUI: connectionStatus element not found in DOM.");
    }
  },

  initialize(agentId, agentName) {
    console.log("[ChatWebsocketService] initialize: Initializing with agentId (username):", agentId, "agentName (full name):", agentName);
    this.agentId = agentId;
    this.agentName = agentName;
    this._updateConnectionStatusUI('connecting', 'Conectando...'); // Estado inicial
    this.connect();
    return this;
  },

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/chat?agentId=${this.agentId}&agentName=${encodeURIComponent(this.agentName)}`;

    console.log("[ChatWebsocketService] connect: Connecting to WebSocket:", wsUrl);
    this._updateConnectionStatusUI('connecting', 'Conectando...'); // Atualiza UI ao tentar conectar

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = this.handleOpen.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onerror = this.handleError.bind(this);
  },

  handleOpen() {
    console.log("[ChatWebsocketService] handleOpen: Connection established.");
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this._updateConnectionStatusUI('connected', 'Conectado'); // Atualiza UI para conectado

    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      console.log("[ChatWebsocketService] handleOpen: Sending pending message:", message);
      this.sendMessageInternal(message);
    }
    
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        console.log("[ChatWebsocketService] handleOpen: Requesting list of active conversations.");
        setTimeout(() => { 
            window.ChatActions.loadConversations("active");
        }, 200);
    }
  },

  handleMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
      console.log("[ChatWebsocketService] handleMessage: Message received from server:", data);
    } catch (error) {
      console.error("[ChatWebsocketService] handleMessage: Error parsing JSON message:", error, "Received data:", event.data);
      return;
    }

    if (data.type === "new_message" && data.payload && data.payload.message && 
        (data.payload.message.senderType === "CLIENT" || data.payload.message.SENDER_TYPE === "CLIENT")) {
      if (window.NotificationService && typeof window.NotificationService.playMessageSound === 'function') {
        window.NotificationService.playMessageSound();
      }
    }
    if (data.type === "pending_conversation") {
      if (window.NotificationService && typeof window.NotificationService.playNewChatSound === 'function') {
        window.NotificationService.playNewChatSound();
      }
    }

    const callbackName = this.mapEventTypeToCallbackName(data.type);
    if (data.type && this.callbacks[callbackName]) {
      console.log(`[ChatWebsocketService] handleMessage: Calling callback '${callbackName}'.`);
      
      if (data.type === 'chat_history_response') {
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - payload: (array of messages), conversationId: ${data.conversationId}`);
        this.callbacks[callbackName](data.payload, data.conversationId); 
      } else if (data.type === 'chat_list_response') {
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - payload: (array of conversations), tabType: ${data.tabType}`);
        this.callbacks[callbackName](data.payload, data.tabType);
      } 
      else {
        // Para os eventos como new_message, onChatTakenUpdate, etc., o 'data' já é o payload.
        // A correção no chatEventHandlers já espera 'data' como o payload direto.
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - WebSocket message data:`, data);
        this.callbacks[callbackName](data); // Passa 'data' diretamente
      }
    } else {
      console.warn(`[ChatWebsocketService] handleMessage: No callback registered for message type: ${data.type}`);
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
    console.log(`[ChatWebsocketService] handleClose: Connection closed. Clean: ${event.wasClean}, Code: ${event.code}, Reason: ${event.reason}`);
    this.isConnected = false;
    this._updateConnectionStatusUI('disconnected', 'Desconectado'); // Atualiza UI para desconectado

    if (!event.wasClean && event.code !== 1000) { // Código 1000 é fechamento normal
      console.warn("[ChatWebsocketService] handleClose: Connection was not clean or was unexpected. Attempting to reconnect...");
      this.attemptReconnect();
    } else if (event.code === 1000 && this.reconnectAttempts > 0) {
        // Se foi um fechamento limpo APÓS tentativas de reconexão, pode indicar que o usuário está offline
        // ou o servidor está intencionalmente a fechar. Parar de tentar reconectar.
        console.log("[ChatWebsocketService] handleClose: Clean close after reconnect attempts. Stopping further attempts.");
        this.reconnectAttempts = this.maxReconnectAttempts; // Para evitar mais tentativas
    }
  },

  handleError(error) {
    console.error("[ChatWebsocketService] handleError: WebSocket error:", error);
    // A UI já deve estar como 'conectando' ou 'desconectado'.
    // A reconexão é tratada pelo onclose.
    // Poderia-se forçar um estado de 'erro' aqui se desejado:
    // this._updateConnectionStatusUI('disconnected', 'Erro de conexão');
  },

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts -1) ;
      console.log(`[ChatWebsocketService] attemptReconnect: Attempting to reconnect in ${delay/1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this._updateConnectionStatusUI('connecting', `Reconectando (tentativa ${this.reconnectAttempts})...`); // Atualiza UI
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error("[ChatWebsocketService] attemptReconnect: Maximum reconnection attempts reached.");
      this._updateConnectionStatusUI('disconnected', 'Falha ao reconectar'); // Atualiza UI
      if (window.ChatUiUpdater && typeof window.ChatUiUpdater.showError === 'function') {
        window.ChatUiUpdater.showError("Não foi possível reconectar ao servidor. Por favor, recarregue a página.");
      } else {
        alert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.");
      }
    }
  },

  sendMessageInternal(messageObject) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(messageObject);
      console.log("[ChatWebsocketService] sendMessageInternal: Sending message:", messageString.substring(0,150)+"...");
      this.socket.send(messageString);
      return true;
    } else {
      console.warn("[ChatWebsocketService] sendMessageInternal: Connection not open. Adding to pending queue. Message:", messageObject);
      this.pendingMessages.push(messageObject);
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
          if (this.reconnectAttempts < this.maxReconnectAttempts && this.socket?.readyState !== WebSocket.CONNECTING) {
            console.log("[ChatWebsocketService] sendMessageInternal: Socket is closed or closing and not already connecting. Attempting to reconnect.");
            this.attemptReconnect();
          }
      }
      return false;
    }
  },

  registerCallbacks(callbacksObject) {
    console.log("[ChatWebsocketService] registerCallbacks: Registering callbacks:", Object.keys(callbacksObject));
    this.callbacks = callbacksObject;
  },

  requestConversations(tabType = "active") {
    console.log(`[ChatWebsocketService] requestConversations: Requesting conversation list for tab '${tabType}'.`);
    this.sendMessageInternal({
      type: "request_chat_list",
      tabType: tabType,
    });
  },

  requestChatHistory(conversationId, limit = 50, offset = 0) {
    console.log(`[ChatWebsocketService] requestChatHistory: Requesting history for ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "request_chat_history",
      conversationId: String(conversationId),
      limit: limit,
      offset: offset
    });
  },

  sendTextMessage(conversationId, recipientJid, text, localMessageId) { 
    console.log(`[ChatWebsocketService] sendTextMessage: Sending to ConvID ${conversationId}, JID ${recipientJid}, LocalID ${localMessageId}. Text: "${text.substring(0,30)}..."`);
    this.sendMessageInternal({
      type: "send_chat_message",
      payload: {
        conversationId: String(conversationId),
        to: recipientJid,
        text: text,
        id: localMessageId,
      },
    });
    return localMessageId;
  },

  sendFileMessage(conversationId, recipientJid, fileData, localMessageId) { 
    console.log(`[ChatWebsocketService] sendFileMessage: Sending file to ConvID ${conversationId}, JID ${recipientJid}, LocalID ${localMessageId}. File data:`, fileData);
    this.sendMessageInternal({
        type: "send_chat_message",
        payload: {
            conversationId: String(conversationId),
            to: recipientJid,
            media: {
                url: fileData.url,
                mimetype: fileData.type,
                filename: fileData.name,
            },
            text: fileData.caption || "",
            id: localMessageId,
        }
    });
    return localMessageId;
  },

  takeChat(conversationId) {
    console.log(`[ChatWebsocketService] takeChat: Taking ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "take_chat",
      conversationId: String(conversationId),
    });
  },

  endChat(conversationId) {
    console.log(`[ChatWebsocketService] endChat: Ending ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "end_chat",
      conversationId: String(conversationId),
    });
  },

  markMessagesAsRead(conversationId) {
    console.log(`[ChatWebsocketService] markMessagesAsRead: Marking messages as read for ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "mark_messages_as_read",
      conversationId: String(conversationId),
    });
  },

  sendTypingStatus(conversationId, isTyping) {
    this.sendMessageInternal({
      type: "agent_typing",
      conversationId: String(conversationId),
      isTyping: isTyping,
    });
  },

  transferChatToSector(conversationId, sectorId, message = null) {
    console.log(`[ChatWebsocketService] transferChatToSector: Transferring ConvID ${conversationId} to sector ${sectorId}.`);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: String(conversationId),
      targetType: "sector",
      targetId: sectorId,
      message: message,
    });
  },

  transferChatToAttendant(conversationId, attendantId, message = null) {
    console.log(`[ChatWebsocketService] transferChatToAttendant: Transferring ConvID ${conversationId} to attendant ${attendantId}.`);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: String(conversationId),
      targetType: "attendant",
      targetId: attendantId,
      message: message,
    });
  },
};

if (typeof window !== 'undefined') {
    window.ChatWebsocketService = ChatWebsocketService;
}
