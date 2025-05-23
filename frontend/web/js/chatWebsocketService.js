// frontend/web/js/chatWebsocketService.js
const ChatWebsocketService = {
  socket: null,
  agentId: null, // This will be the username (e.g., "JOENIS")
  agentName: null, // This will be the full name (e.g., "Joenis A. de Souza")
  reconnectAttempts: 0,
  maxReconnectAttempts: 5, // Max number of reconnection attempts
  reconnectDelay: 3000, // Initial delay in ms, will increase
  callbacks: {}, // To store callbacks for different message types
  isConnected: false,
  pendingMessages: [], // Queue for messages to send once connected

  initialize(agentId, agentName) {
    console.log("[ChatWebsocketService] initialize: Initializing with agentId (username):", agentId, "agentName (full name):", agentName);
    this.agentId = agentId; // Store the username as agentId
    this.agentName = agentName; // Store the full name
    this.connect();
    return this; // Allow chaining
  },

  connect() {
    // Determine WebSocket protocol (ws or wss)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Construct WebSocket URL with agentId (username) and agentName (full name)
    const wsUrl = `${protocol}//${window.location.host}/chat?agentId=${this.agentId}&agentName=${encodeURIComponent(this.agentName)}`;

    console.log("[ChatWebsocketService] connect: Connecting to WebSocket:", wsUrl);
    this.socket = new WebSocket(wsUrl);

    // Assign event handlers
    this.socket.onopen = this.handleOpen.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onerror = this.handleError.bind(this);
  },

  handleOpen() {
    console.log("[ChatWebsocketService] handleOpen: Connection established.");
    this.isConnected = true;
    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection

    // Send any pending messages
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      console.log("[ChatWebsocketService] handleOpen: Sending pending message:", message);
      this.sendMessageInternal(message);
    }
    
    // Request initial conversation list once connected
    if (window.ChatActions && typeof window.ChatActions.loadConversations === 'function') {
        console.log("[ChatWebsocketService] handleOpen: Requesting list of active conversations.");
        // Adding a small delay to ensure other initializations might complete
        setTimeout(() => { 
            window.ChatActions.loadConversations("active"); // Default to active tab
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

    // Play notification sounds based on message type
    if (data.type === "new_message" && data.payload && data.payload.message && 
        (data.payload.message.senderType === "CLIENT" || data.payload.message.SENDER_TYPE === "CLIENT")) {
      if (window.NotificationService) window.NotificationService.playMessageSound();
    }
    if (data.type === "pending_conversation") { // A new conversation is pending for any agent in the sector
      if (window.NotificationService) window.NotificationService.playNewChatSound();
    }

    // Map server event type to a callback name and invoke if registered
    const callbackName = this.mapEventTypeToCallbackName(data.type);
    if (data.type && this.callbacks[callbackName]) {
      console.log(`[ChatWebsocketService] handleMessage: Calling callback '${callbackName}'.`);
      
      // Specific handling for responses that include extra parameters alongside payload
      if (data.type === 'chat_history_response') {
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - payload: (array of messages), conversationId: ${data.conversationId}`);
        this.callbacks[callbackName](data.payload, data.conversationId); 
      } else if (data.type === 'chat_list_response') {
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - payload: (array of conversations), tabType: ${data.tabType}`);
        this.callbacks[callbackName](data.payload, data.tabType);
      } 
      // For other events, the main data is expected in data.payload
      else {
        console.log(`[ChatWebsocketService] handleMessage: Passing to ${callbackName} - WebSocket message payload:`, data.payload);
        this.callbacks[callbackName](data.payload); 
      }
    } else {
      console.warn(`[ChatWebsocketService] handleMessage: No callback registered for message type: ${data.type}`);
    }
  },

  mapEventTypeToCallbackName(eventType) {
    // Maps server-side event types to client-side callback function names
    const map = {
        'chat_list_response': 'onChatListReceived',
        'chat_history_response': 'onChatHistoryReceived',
        'new_message': 'onNewMessage',
        'message_sent_ack': 'onMessageSentAck',
        'take_chat_response': 'onTakeChatResponse',
        'end_chat_response': 'onEndChatResponse',
        'chat_taken_update': 'onChatTakenUpdate', // When another agent takes a chat
        'chat_closed_update': 'onChatClosedUpdate', // When a chat is closed by system/another agent
        'pending_conversation': 'onPendingConversation', // A new unassigned conversation
        'client_typing': 'onClientTyping' // Client is typing
        // Add more mappings as needed
    };
    return map[eventType] || eventType; // Fallback to eventType itself if no mapping
  },

  handleClose(event) {
    console.log(`[ChatWebsocketService] handleClose: Connection closed. Clean: ${event.wasClean}, Code: ${event.code}, Reason: ${event.reason}`);
    this.isConnected = false;
    if (!event.wasClean) { // Attempt to reconnect if the closure was not clean (e.g., server crash, network issue)
      console.warn("[ChatWebsocketService] handleClose: Connection was not clean. Attempting to reconnect...");
      this.attemptReconnect();
    }
  },

  handleError(error) {
    console.error("[ChatWebsocketService] handleError: WebSocket error:", error);
    // Reconnection is typically handled by onclose, but you could add logic here if needed
  },

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts -1) ; // Exponential backoff
      console.log(`[ChatWebsocketService] attemptReconnect: Attempting to reconnect in ${delay/1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error("[ChatWebsocketService] attemptReconnect: Maximum reconnection attempts reached.");
      if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert("Não foi possível reconectar ao servidor. Por favor, recarregue a página.", "error");
      } else {
        alert("Não foi possível reconectar ao servidor. Por favor, recarregue a página."); // Fallback
      }
    }
  },

  sendMessageInternal(messageObject) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(messageObject);
      console.log("[ChatWebsocketService] sendMessageInternal: Sending message:", messageString.substring(0,150)+"..."); // Log truncated message
      this.socket.send(messageString);
      return true;
    } else {
      console.warn("[ChatWebsocketService] sendMessageInternal: Connection not open. Adding to pending queue. Message:", messageObject);
      this.pendingMessages.push(messageObject);
      // If socket is closed or closing, attempt to reconnect
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
          console.log("[ChatWebsocketService] sendMessageInternal: Socket is closed or closing. Attempting to reconnect.");
          this.attemptReconnect();
      }
      return false;
    }
  },

  registerCallbacks(callbacksObject) {
    console.log("[ChatWebsocketService] registerCallbacks: Registering callbacks:", Object.keys(callbacksObject));
    this.callbacks = callbacksObject;
  },

  // --- Public methods to send messages to the server ---

  requestConversations(tabType = "active") {
    console.log(`[ChatWebsocketService] requestConversations: Requesting conversation list for tab '${tabType}'.`);
    this.sendMessageInternal({
      type: "request_chat_list",
      tabType: tabType, // e.g., "active", "pending", "closed"
    });
  },

  requestChatHistory(conversationId, limit = 50, offset = 0) {
    console.log(`[ChatWebsocketService] requestChatHistory: Requesting history for ConvID ${conversationId}.`);
    this.sendMessageInternal({
      type: "request_chat_history",
      conversationId: String(conversationId), // Ensure it's a string
      limit: limit,
      offset: offset
    });
  },

  sendTextMessage(conversationId, recipientJid, text, localMessageId) { 
    console.log(`[ChatWebsocketService] sendTextMessage: Sending to ConvID ${conversationId}, JID ${recipientJid}, LocalID ${localMessageId}. Text: "${text.substring(0,30)}..."`);
    this.sendMessageInternal({
      type: "send_chat_message", // Generic type for sending any chat message
      payload: {
        conversationId: String(conversationId),
        to: recipientJid, // WhatsApp JID of the recipient
        text: text,
        id: localMessageId, // Frontend generated ID for tracking ACK
        // messageType: "text" // Could be added if backend needs explicit type
      },
    });
    return localMessageId; // Return for local tracking
  },

  sendFileMessage(conversationId, recipientJid, fileData, localMessageId) { 
    // fileData is expected to be an object like { url: "server_url_of_file", type: "image/png", name: "image.png", caption: "Optional" }
    console.log(`[ChatWebsocketService] sendFileMessage: Sending file to ConvID ${conversationId}, JID ${recipientJid}, LocalID ${localMessageId}. File data:`, fileData);
    this.sendMessageInternal({
        type: "send_chat_message", // Using the same generic type
        payload: {
            conversationId: String(conversationId),
            to: recipientJid,
            media: { // Media object as expected by whatsapp-web.js or your backend handler
                url: fileData.url, // URL where the file is hosted (after upload)
                mimetype: fileData.type, // Mimetype of the file
                filename: fileData.name, // Original filename
            },
            text: fileData.caption || "", // Caption for the media
            id: localMessageId, // Frontend generated ID
            // messageType: fileData.type.split('/')[0] // e.g., "image", "document", "video", "audio"
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
    // console.log(`[ChatWebsocketService] sendTypingStatus: ConvID ${conversationId}, Typing: ${isTyping}`); // Can be too verbose
    this.sendMessageInternal({
      type: "agent_typing", // Agent is typing
      conversationId: String(conversationId),
      isTyping: isTyping,
    });
  },

  transferChatToSector(conversationId, sectorId, message = null) {
    console.log(`[ChatWebsocketService] transferChatToSector: Transferring ConvID ${conversationId} to sector ${sectorId}.`);
    this.sendMessageInternal({
      type: "transfer_chat",
      conversationId: String(conversationId),
      targetType: "sector", // "sector" or "attendant"
      targetId: sectorId,    // ID of the sector or attendant
      message: message,      // Optional message to send to the client about the transfer
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
  // Add more methods as needed for other actions
};

// Expose to window if in a browser environment
if (typeof window !== 'undefined') {
    window.ChatWebsocketService = ChatWebsocketService;
}
