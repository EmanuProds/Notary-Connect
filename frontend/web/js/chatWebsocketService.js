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
    console.log("[ChatWebsocketService] Inicializando com agentId:", agentId, "agentName:", agentName);
    this.agentId = agentId;
    this.agentName = agentName;
    this.connect();
    return this;
  },

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Certifique-se que window.location.host está correto (ex: localhost:3000)
    const wsUrl = `${protocol}//${window.location.host}/chat?agentId=${this.agentId}&agentName=${encodeURIComponent(this.agentName)}`;

    console.log("[ChatWebsocketService] Conectando ao WebSocket:", wsUrl);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = this.handleOpen.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onerror = this.handleError.bind(this);
  },

  handleOpen() {
    console.log("[ChatWebsocketService] Conexão estabelecida");
    this.isConnected = true;
    this.reconnectAttempts = 0;

    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      this.sendMessageInternal(message); // Usar um método interno para enviar
    }
    // Solicitar lista de conversas ativas ao conectar
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        setTimeout(() => { // Pequeno delay para garantir que o handler de mensagem esteja pronto
            window.ChatActions.loadConversations("active");
        }, 200);
    }
  },

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log("[ChatWebsocketService] Mensagem recebida:", data);

      if (data.type === "new_message" && data.payload && data.payload.message && (data.payload.message.senderType === "CLIENT" || data.payload.message.SENDER_TYPE === "CLIENT")) {
        if (window.NotificationService) {
          window.NotificationService.playMessageSound();
        }
      }
      if (data.type === "pending_conversation") { // Ajustado para corresponder ao backend
        if (window.NotificationService) {
          window.NotificationService.playNewChatSound();
        }
      }

      // Encaminha para os callbacks registrados
      if (data.type && this.callbacks[this.mapEventTypeToCallbackName(data.type)]) {
        this.callbacks[this.mapEventTypeToCallbackName(data.type)](data.payload, data.tabType || (data.payload ? data.payload.conversationId : null));
      } else {
        console.warn(`[ChatWebsocketService] Nenhum callback registrado para o tipo de mensagem: ${data.type}`);
      }

    } catch (error) {
      console.error("[ChatWebsocketService] Erro ao processar mensagem:", error, "Dados recebidos:", event.data);
    }
  },

  mapEventTypeToCallbackName(eventType) {
    // Mapeia nomes de eventos para nomes de funções de callback para consistência
    const map = {
        'chat_list_response': 'onChatListReceived',
        'chat_history_response': 'onChatHistoryReceived',
        'new_message': 'onNewMessage',
        'message_sent_ack': 'onMessageSentAck',
        'take_chat_response': 'onTakeChatResponse',
        'end_chat_response': 'onEndChatResponse',
        'chat_taken_update': 'onChatTakenUpdate',
        'chat_closed_update': 'onChatClosedUpdate',
        'pending_conversation': 'onPendingConversation', // Adicionado
        'client_typing': 'onClientTyping' // Adicionado
    };
    return map[eventType] || eventType; // Retorna o nome mapeado ou o original se não mapeado
  },

  handleClose(event) {
    this.isConnected = false;
    if (event.wasClean) {
      console.log(`[ChatWebsocketService] Conexão fechada normalmente, código=${event.code} motivo=${event.reason}`);
    } else {
      console.error("[ChatWebsocketService] Conexão interrompida (wasClean: false). Código:", event.code, "Motivo:", event.reason);
      this.attemptReconnect();
    }
  },

  handleError(error) {
    console.error("[ChatWebsocketService] Erro de WebSocket:", error);
    // A reconexão é geralmente tratada pelo onclose quando um erro causa o fechamento.
  },

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `[ChatWebsocketService] Tentando reconectar (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      );
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts); // Aumenta o delay a cada tentativa
    } else {
      console.error("[ChatWebsocketService] Número máximo de tentativas de reconexão atingido.");
      if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.", "error");
      } else {
        alert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.");
      }
    }
  },

  sendMessageInternal(messageObject) { // Renomeado para evitar conflito de nome
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(messageObject));
      console.log("[ChatWebsocketService] Mensagem enviada ao servidor:", messageObject);
      return true;
    } else {
      console.warn("[ChatWebsocketService] Não foi possível enviar mensagem: conexão não está aberta. Adicionando à fila.");
      this.pendingMessages.push(messageObject);
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
          console.log("[ChatWebsocketService] Tentando reconectar devido à tentativa de envio com socket fechado.");
          this.attemptReconnect();
      }
      return false;
    }
  },

  registerCallbacks(callbacks) {
    console.log("[ChatWebsocketService] Registrando callbacks:", Object.keys(callbacks));
    this.callbacks = callbacks;
  },

  requestConversations(tabType = "active") {
    console.log("[ChatWebsocketService] Solicitando lista de conversas:", tabType);
    this.sendMessageInternal({
      type: "request_chat_list",
      tabType: tabType,
    });
  },

  requestChatHistory(conversationId, limit = 50, offset = 0) {
    console.log("[ChatWebsocketService] Solicitando histórico da conversa:", conversationId);
    this.sendMessageInternal({
      type: "request_chat_history",
      conversationId: conversationId,
      limit: limit,
      offset: offset
    });
  },

  // CORRIGIDO: Adicionado recipientJid e usado no payload.to
  sendTextMessage(conversationId, recipientJid, text) {
    console.log("[ChatWebsocketService] Enviando mensagem de texto para conversa:", conversationId, "Destinatário:", recipientJid);
    const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sendMessageInternal({
      type: "send_chat_message",
      payload: {
        conversationId: conversationId,
        to: recipientJid, // Usar o JID do destinatário aqui
        text: text,
        id: localId, 
      },
    });
    // Opcional: retornar o ID local para o ChatActions/UI poder rastrear
    return localId;
  },

  sendFileMessage(conversationId, recipientJid, file, caption = "") {
    console.log("[ChatWebsocketService] Preparando para enviar arquivo:", file.name, "para:", recipientJid);
    // A lógica de upload real do arquivo deve ocorrer antes (ex: para um S3 ou servidor local)
    // e então a URL do arquivo é enviada.
    // Se for enviar o arquivo diretamente via WebSocket (não recomendado para arquivos grandes),
    // precisaria de uma lógica de chunking ou envio como ArrayBuffer/Base64.

    // Exemplo simplificado assumindo que 'file' é um objeto com 'url' e 'type' (e opcionalmente 'fileName')
    // Esta parte precisará ser integrada com seu sistema de upload de arquivos.
    // Por agora, vamos simular o envio de um payload que o backend espera.
    const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.sendMessageInternal({
        type: "send_chat_message", // O backend pode tratar isso como uma mensagem de mídia
        payload: {
            conversationId: conversationId,
            to: recipientJid,
            media: { // Estrutura de exemplo para mídia
                url: file.url, // Supondo que 'file' tenha uma URL após upload
                type: file.type, // ex: 'image/jpeg', 'application/pdf'
                fileName: file.name,
            },
            text: caption, // Legenda para a mídia
            id: localId,
        }
    });
    return localId;
  },

  takeChat(conversationId) {
    console.log("[ChatWebsocketService] Assumindo conversa:", conversationId);
    this.sendMessageInternal({
      type: "take_chat",
      conversationId: conversationId,
    });
  },

  endChat(conversationId) {
    console.log("[ChatWebsocketService] Encerrando conversa:", conversationId);
    this.sendMessageInternal({
      type: "end_chat",
      conversationId: conversationId,
    });
  },

  markMessagesAsRead(conversationId) {
    console.log("[ChatWebsocketService] Marcando mensagens como lidas para conversa:", conversationId);
    this.sendMessageInternal({
      type: "mark_messages_as_read",
      conversationId: conversationId,
    });
  },

  sendTypingStatus(conversationId, isTyping) {
    // console.log(`[ChatWebsocketService] Enviando status de digitação: ${isTyping} para conversa ${conversationId}`);
    this.sendMessageInternal({
      type: "agent_typing",
      conversationId: conversationId,
      isTyping: isTyping,
    });
  },

  transferChatToSector(conversationId, sectorId, message = null) {
    console.log("[ChatWebsocketService] Transferindo conversa", conversationId, "para setor:", sectorId);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "sector",
      targetId: sectorId,
      message: message,
    });
  },

  transferChatToAttendant(conversationId, attendantId, message = null) {
    console.log("[ChatWebsocketService] Transferindo conversa", conversationId, "para atendente:", attendantId);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: conversationId,
      targetType: "attendant",
      targetId: attendantId,
      message: message,
    });
  },
};

// Exportar para uso global, se não estiver usando módulos ES6/CommonJS explicitamente nos scripts do navegador
if (typeof window !== 'undefined') {
    window.ChatWebsocketService = ChatWebsocketService;
}
