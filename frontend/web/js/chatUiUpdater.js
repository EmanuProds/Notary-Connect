// frontend/web/js/chatUiUpdater.js
window.ChatUiUpdater = {
  activeConversationId: null,
  conversations: {
    active: [],
    closed: []
  },
  currentFilter: "",
  currentTab: "active", 

  initialize() {
    console.log("[ChatUiUpdater] initialize: ChatUiUpdater inicializado.");
    this.setActiveTab(this.currentTab); 
    return this; 
  },

  updateConversations(newConversations, tabType, errorMessage = null) {
    console.log(`[ChatUiUpdater] updateConversations: Aba: ${tabType}. Recebidas ${newConversations ? newConversations.length : 'N/A'} conversas. Filtro: '${this.currentFilter}'. Erro: ${errorMessage}`);
    
    if (!window.ChatDomElements || !window.ChatDomElements.conversationsList) {
      console.error("[ChatUiUpdater] updateConversations: Elemento conversationsList não encontrado.");
      return;
    }
    const conversationsListElement = window.ChatDomElements.conversationsList;
    conversationsListElement.innerHTML = ""; 

    if (errorMessage) {
        console.warn(`[ChatUiUpdater] updateConversations: Exibindo mensagem de erro: ${errorMessage}`);
        const errorElement = document.createElement("div");
        errorElement.className = "empty-list-message error-message"; 
        errorElement.textContent = errorMessage;
        conversationsListElement.appendChild(errorElement);
        if (this.conversations[tabType]) { 
            this.conversations[tabType] = []; 
        }
        return;
    }

    if (!Array.isArray(newConversations)) {
        console.warn(`[ChatUiUpdater] updateConversations: newConversations não é um array para aba ${tabType}. Recebido:`, newConversations);
        newConversations = []; 
    }
    
    this.conversations[tabType] = [...newConversations]; 
    // console.log(`[ChatUiUpdater] updateConversations: Array interno this.conversations['${tabType}'] atualizado com ${this.conversations[tabType].length} itens.`);

    const conversationsToRender = this.currentFilter ? 
        this.conversations[tabType].filter(conv => conv && this.matchesFilter(conv, this.currentFilter)) : 
        this.conversations[tabType];
    
    // console.log(`[ChatUiUpdater] updateConversations: ${conversationsToRender.length} conversas para renderizar após filtro na aba ${tabType}.`);

    if (conversationsToRender.length === 0) {
      const emptyMessageText = this.currentFilter ? `Nenhuma conversa encontrada para "${this.currentFilter}".` : (tabType === "active" ? "Nenhuma conversa ativa ou pendente." : "Nenhuma conversa encerrada.");
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "empty-list-message";
      emptyMessage.textContent = emptyMessageText;
      conversationsListElement.appendChild(emptyMessage);
    } else {
      conversationsToRender.forEach(conversation => {
          if (conversation && typeof conversation.ID !== 'undefined') { 
               const conversationItem = this.createConversationItem(conversation);
               conversationsListElement.appendChild(conversationItem);
          } else {
              console.warn("[ChatUiUpdater] updateConversations: Item de conversa inválido ou sem ID:", conversation);
          }
      });
    }
    
    // CORREÇÃO: Usar this.getConversationFromListById
    if (this.activeConversationId && tabType === this.currentTab && !this.getConversationFromListById(this.activeConversationId, tabType)) {
        console.log(`[ChatUiUpdater] updateConversations: Conversa ativa ${this.activeConversationId} não encontrada na aba ${tabType} após atualização. Limpando área de chat.`);
        this.clearChatArea();
    } else if (this.activeConversationId && tabType === this.currentTab) {
        this.highlightActiveConversation();
    }
  },

  createConversationItem(conversation) {
    const item = document.createElement("div");
    item.className = "chat-item"; 
    item.dataset.id = String(conversation.ID); 

    if (String(conversation.ID) === String(this.activeConversationId)) {
      item.classList.add("active");
    }
    if (conversation.STATUS === "pending") {
      item.classList.add("pending"); 
    }
    if (conversation.UNREAD_MESSAGES > 0 && String(conversation.ID) !== String(this.activeConversationId)) { 
        item.classList.add("unread"); 
    }

    const clientName = conversation.CLIENT_NAME || conversation.CLIENT_WHATSAPP_ID || "Desconhecido";
    const lastMessageTime = conversation.LAST_MESSAGE_TIME ? this.formatTime(conversation.LAST_MESSAGE_TIME) : "";
    const lastMessageText = conversation.LAST_MESSAGE || conversation.content || "Sem mensagens";
    const truncatedPreview = lastMessageText.length > 35 ? lastMessageText.substring(0, 32) + "..." : lastMessageText;
    const showTakeButton = conversation.STATUS === "pending" && !conversation.USER_USERNAME && !conversation.USER_ID;

    item.innerHTML = `
      <div class="chat-item-details">
        <img src="${conversation.CLIENT_PROFILE_PIC || './img/icons/profile.svg'}" alt="Avatar" class="chat-item-profile-pic" onerror="this.onerror=null; this.src='./img/icons/profile.svg';">
        <div class="chat-item-info">
          <div class="chat-item-name-status">
            <span class="chat-item-name">${clientName}</span>
            <span class="chat-status-indicator ${conversation.STATUS ? conversation.STATUS.toLowerCase() : ''}">${conversation.STATUS || ''}</span>
          </div>
          <span class="chat-item-id">${conversation.CLIENT_WHATSAPP_ID || conversation.CLIENT_JID || ''}</span>
          <div class="chat-item-preview">${truncatedPreview}</div>
        </div>
        <div class="chat-item-meta">
            <span class="chat-item-timestamp">${lastMessageTime}</span>
            ${conversation.UNREAD_MESSAGES > 0 && String(conversation.ID) !== String(this.activeConversationId) ? `<span class="unread-badge">${conversation.UNREAD_MESSAGES}</span>` : ""}
        </div>
      </div>
      ${showTakeButton ? `<button class="take-chat-button" data-id="${conversation.ID}">Assumir</button>` : ""}
    `;

    item.addEventListener("click", (e) => {
        if (e.target.classList.contains('take-chat-button')) {
            e.stopPropagation();
            console.log(`[ChatUiUpdater] Botão 'Assumir' clicado para conversa ID: ${conversation.ID}`);
            if (window.ChatActions) window.ChatActions.takeChat(conversation.ID);
        } else {
            this.selectConversation(conversation.ID);
        }
    });
    return item;
  },

  selectConversation(conversationId) {
    console.log(`[ChatUiUpdater] selectConversation: Selecionando conversa ID: ${conversationId}. Conversa ativa anterior: ${this.activeConversationId}`);
    const stringConversationId = String(conversationId);

    this.activeConversationId = stringConversationId; 
    this.highlightActiveConversation();

    const conversation = this.getActiveConversationDetails(); 
    if (!conversation) {
      console.error(`[ChatUiUpdater] selectConversation: Conversa selecionada ID ${conversationId} NÃO ENCONTRADA nos dados internos após highlight.`);
      this.clearChatArea(); 
      return;
    }
    console.log(`[ChatUiUpdater] selectConversation: Detalhes da conversa ativa ID ${conversationId}:`, JSON.stringify(conversation));

    if (window.ChatDomElements) {
        if (window.ChatDomElements.welcomeScreen) window.ChatDomElements.welcomeScreen.style.display = "none";
        if (window.ChatDomElements.chatInterface) window.ChatDomElements.chatInterface.style.display = "flex"; 
        
        const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
        const conversationAttendantUsername = conversation.USER_USERNAME ? String(conversation.USER_USERNAME).toUpperCase() : null;
        const canInteract = conversation.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn;
        
        console.log(`[ChatUiUpdater] selectConversation: Verificando interação - ConvID ${conversationId}, Status: ${conversation.STATUS}, Atendente da Conv (DB): '${conversation.USER_USERNAME}' (Normalizado: '${conversationAttendantUsername}'), Atendente Logado (WS): '${window.ChatWebsocketService ? window.ChatWebsocketService.agentId : 'N/A'}' (Normalizado: '${agentUsernameLoggedIn}'), Pode Interagir: ${canInteract}`);

        if (window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = canInteract ? "flex" : "none";
        if (window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = canInteract ? "flex" : "none";
        if (window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = canInteract ? "flex" : "none";
        
        if (window.ChatDomElements.messageInput) {
            window.ChatDomElements.messageInput.disabled = !canInteract;
            if (canInteract) window.ChatDomElements.messageInput.focus();
        }
         if (window.ChatDomElements.sendButton) window.ChatDomElements.sendButton.disabled = !canInteract;
         if (window.ChatDomElements.attachmentButton) window.ChatDomElements.attachmentButton.disabled = !canInteract;
    }
    
    this.updateChatHeader(conversation);
    
    if (window.ChatDomElements.messagesContainer) {
        window.ChatDomElements.messagesContainer.innerHTML = '<div class="loading-messages">Carregando mensagens...</div>';
    }

    if (window.ChatActions) {
      console.log(`[ChatUiUpdater] selectConversation: Solicitando histórico para conversa ID: ${conversationId}`);
      window.ChatActions.loadChatHistory(conversationId);
      
      const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
      const conversationAttendantUsername = conversation.USER_USERNAME ? String(conversation.USER_USERNAME).toUpperCase() : null;
      const unreadMessagesCount = typeof conversation.UNREAD_MESSAGES === 'number' ? conversation.UNREAD_MESSAGES : 0;

      if (unreadMessagesCount > 0 && conversation.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn) { 
        console.log(`[ChatUiUpdater] selectConversation: Marcando ${unreadMessagesCount} mensagens como lidas para conversa ID: ${conversationId}`);
        window.ChatActions.markMessagesAsRead(conversationId);
      }
    }
    if (window.ChatDomElements.chatContainer) {
        window.ChatDomElements.chatContainer.classList.add('chat-active');
    }
    console.log(`[ChatUiUpdater] selectConversation: Seleção da conversa ${conversationId} concluída.`);
  },

  highlightActiveConversation() {
    const items = document.querySelectorAll(".chat-item");
    items.forEach(item => {
      item.classList.toggle("active", item.dataset.id === String(this.activeConversationId));
    });
  },

  updateChatHeader(conversation) {
    if (!window.ChatDomElements) return;
    const { contactAvatar, chatHeaderName, endChatButton, transferChatButton, contactDetailsDiv } = window.ChatDomElements;

    if (conversation) {
        const name = conversation.CLIENT_NAME || conversation.CLIENT_WHATSAPP_ID || "Desconhecido";
        if (chatHeaderName) chatHeaderName.textContent = name; 
        if (contactDetailsDiv) contactDetailsDiv.title = `JID: ${conversation.CLIENT_JID || conversation.CLIENT_WHATSAPP_ID || 'N/A'}`;
        if (contactAvatar) contactAvatar.src = conversation.CLIENT_PROFILE_PIC || './img/icons/profile.svg';
        
        const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
        const conversationAttendantUsername = conversation.USER_USERNAME ? String(conversation.USER_USERNAME).toUpperCase() : null;
        const canInteract = conversation.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn;
        
        if (endChatButton) endChatButton.style.display = canInteract ? "flex" : "none";
        if (transferChatButton) transferChatButton.style.display = canInteract ? "flex" : "none";
    } else {
        if (chatHeaderName) chatHeaderName.textContent = "Nenhum chat selecionado";
        if (contactDetailsDiv) contactDetailsDiv.title = "";
        if (contactAvatar) contactAvatar.src = './img/icons/profile.svg';
        if (endChatButton) endChatButton.style.display = "none";
        if (transferChatButton) transferChatButton.style.display = "none";
    }
  },

  renderChatHistory(messages, conversationId, errorMessage = null) {
    console.log(`[ChatUiUpdater] renderChatHistory: Iniciando renderização para ConvID ${conversationId}. ${messages ? messages.length : 'N/A'} mensagens. Erro: ${errorMessage}`);
    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) {
        console.error("[ChatUiUpdater] renderChatHistory: Container de mensagens não encontrado.");
        return;
    }
    const messagesContainer = window.ChatDomElements.messagesContainer;
    
    if (String(conversationId) !== String(this.activeConversationId)) {
      console.warn(`[ChatUiUpdater] renderChatHistory: Histórico para ConvID ${conversationId}, mas ConvID ativa é ${this.activeConversationId}. IGNORANDO RENDERIZAÇÃO.`);
      return;
    }
    
    messagesContainer.innerHTML = ""; 

    if (errorMessage) {
        messagesContainer.innerHTML = `<div class="empty-history error-message">${window.ChatUtils.escapeHtml(errorMessage)}</div>`;
        console.log(`[ChatUiUpdater] renderChatHistory: Erro ao carregar histórico para ConvID ${conversationId}: ${errorMessage}`);
        return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      console.log(`[ChatUiUpdater] renderChatHistory: Nenhuma mensagem para renderizar na ConvID ${conversationId}.`);
      messagesContainer.innerHTML = '<div class="empty-history">Nenhuma mensagem nesta conversa.</div>';
      return;
    }

    console.log(`[ChatUiUpdater] renderChatHistory: Renderizando ${messages.length} mensagens para ConvID ${conversationId}.`);
    messages.forEach(message => {
      if (message && (typeof message.ID !== 'undefined' || typeof message.id !== 'undefined')) { 
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
      } else {
        console.warn("[ChatUiUpdater] renderChatHistory: Item de mensagem inválido ou sem ID no histórico:", message);
      }
    });
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 0);
    console.log(`[ChatUiUpdater] renderChatHistory: Histórico para ConvID ${conversationId} renderizado.`);
  },

  createMessageElement(message) {
    const messageElement = document.createElement("div");
    const senderTypeActual = message.SENDER_TYPE || message.senderType || 'unknown';
    const senderTypeClass = senderTypeActual.toLowerCase(); 
    messageElement.className = `message ${senderTypeClass}`;
    messageElement.dataset.id = String(message.ID || message.id || `local_${Date.now()}`); 

    let senderNameDisplay = 'Sistema';
    if (senderTypeActual === 'AGENT') {
        senderNameDisplay = message.AGENT_NAME || (window.ChatWebsocketService ? window.ChatWebsocketService.agentName : null) || 'Atendente';
    } else if (senderTypeActual === 'CLIENT') {
        senderNameDisplay = message.CLIENT_NAME || 'Cliente';
    } else if (senderTypeActual === 'BOT') {
        senderNameDisplay = 'Robô Notary Connect';
    }

    const messageTime = this.formatTime(message.TIMESTAMP || message.timestamp); 
    let contentHTML = '';
    const textContent = message.CONTENT || message.content || message.MESSAGE_CONTENT || ""; 
    const messageTypeActual = message.MESSAGE_TYPE || message.messageType || (message.MEDIA_URL ? 'document' : 'chat'); 

    if (message.MEDIA_URL) { 
        if (messageTypeActual === 'image') {
            contentHTML = `<img src="${message.MEDIA_URL}" alt="Imagem" class="media-content image" onerror="this.style.display='none'; this.parentElement.innerHTML += '<p class=\\'media-error\\'>Erro ao carregar imagem.</p>';">`;
            if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
        } else if (messageTypeActual === 'audio') {
            contentHTML = `<audio controls src="${message.MEDIA_URL}" class="media-content audio"></audio>`;
             if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
        } else if (messageTypeActual === 'video') {
            contentHTML = `<video controls src="${message.MEDIA_URL}" class="media-content video"></video>`;
             if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
        } else { 
            contentHTML = `
                <a href="${message.MEDIA_URL}" target="_blank" rel="noopener noreferrer" class="media-content document">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    <span>${window.ChatUtils.escapeHtml(textContent || message.FILENAME || "Documento")}</span>
                </a>`;
        }
    } else { 
        contentHTML = `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
    }
    
    const senderDisplayElement = senderTypeClass !== 'system' ? `<div class="sender-name">${window.ChatUtils.escapeHtml(senderNameDisplay)}</div>` : '';

    messageElement.innerHTML = `
      ${senderDisplayElement}
      ${contentHTML}
      <div class="message-info">${messageTime}</div>
    `;
    return messageElement;
  },

  addNewMessage(conversationId, message) {
    console.log(`[ChatUiUpdater] addNewMessage: Adicionando nova mensagem à conversa ${conversationId}. Mensagem:`, JSON.stringify(message).substring(0,200)+"...");
    const stringConversationId = String(conversationId);
    
    this.updateConversationInList(stringConversationId, {
        LAST_MESSAGE: message.CONTENT || message.content || message.MESSAGE_CONTENT,
        LAST_MESSAGE_TIME: message.TIMESTAMP || message.timestamp,
        UNREAD_MESSAGES: (currentConv) => { 
            if (String(this.activeConversationId) === stringConversationId && document.hasFocus()) {
                if (window.ChatActions && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client")) {
                    window.ChatActions.markMessagesAsRead(stringConversationId); 
                }
                return 0; 
            }
            if (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") {
                const convInList = this.getConversationFromListById(stringConversationId);
                const newUnread = convInList ? (convInList.UNREAD_MESSAGES || 0) + 1 : 1;
                return newUnread;
            }
            return currentConv ? currentConv.UNREAD_MESSAGES : 0; 
        }
    });

    if (String(this.activeConversationId) !== stringConversationId) {
      console.warn(`[ChatUiUpdater] addNewMessage: Nova mensagem para conversa ${conversationId} que NÃO está ativa (ativa: ${this.activeConversationId}). Lista atualizada, mas chat não.`);
      if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
        window.NotificationService.playMessageSound();
      }
      return;
    }

    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) {
      console.error("[ChatUiUpdater] addNewMessage: Container de mensagens não encontrado.");
      return;
    }
    const messagesContainer = window.ChatDomElements.messagesContainer;
    const placeholder = messagesContainer.querySelector('.empty-history, .loading-messages, .no-chat-selected');
    if (placeholder) placeholder.remove();

    const messageElement = this.createMessageElement(message);
    messagesContainer.appendChild(messageElement);
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100); 

    if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
      window.NotificationService.playMessageSound();
    }
  },
  
  updateLocalMessageStatus(originalMessageId, success, sentMessageId, timestamp) {
    console.log(`[ChatUiUpdater] updateLocalMessageStatus: Atualizando status da mensagem local ID ${originalMessageId}: sucesso=${success}, novoID=${sentMessageId}, timestamp=${timestamp}`);
    const messageElement = document.querySelector(`.message[data-id="${originalMessageId}"]`); 
    if (messageElement) {
        messageElement.classList.remove('sending'); 
        if (success && sentMessageId) {
            messageElement.dataset.id = String(sentMessageId); 
            messageElement.classList.add('sent'); 
            const timeElement = messageElement.querySelector('.message-info');
            if (timeElement && timestamp) {
                timeElement.textContent = this.formatTime(timestamp);
            }
        } else {
            messageElement.classList.add('error-sending'); 
            const timeElement = messageElement.querySelector('.message-info');
            if (timeElement) {
                timeElement.textContent += " (Falha ao enviar)";
            }
            console.warn(`[ChatUiUpdater] updateLocalMessageStatus: Falha ao enviar mensagem ${originalMessageId}.`);
        }
    } else {
        console.warn(`[ChatUiUpdater] updateLocalMessageStatus: Mensagem local com ID ${originalMessageId} não encontrada para atualização.`);
    }
  },

  addSystemMessage(text, conversationId) {
    console.log(`[ChatUiUpdater] addSystemMessage: Adicionando mensagem de sistema à conversa ${conversationId}: "${text}"`);
     if (String(conversationId) !== String(this.activeConversationId)) {
        return;
     }
    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) {
        console.error("[ChatUiUpdater] addSystemMessage: Container de mensagens não encontrado.");
        return;
    }
    const messagesContainer = window.ChatDomElements.messagesContainer;

    const systemMessage = {
        SENDER_TYPE: 'SYSTEM',
        CONTENT: text,
        TIMESTAMP: new Date().toISOString(),
        MESSAGE_TYPE: 'system', 
        ID: `sys_${Date.now()}` 
    };
    const messageElement = this.createMessageElement(systemMessage);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  updateConversationInList(conversationId, updates, selectAfterUpdate = false) {
    console.log(`[ChatUiUpdater] updateConversationInList: Atualizando conversa ID ${conversationId} com:`, JSON.stringify(updates).substring(0,200)+"...", `Selecionar depois: ${selectAfterUpdate}`);
    let foundAndUpdated = false;
    const stringConversationId = String(conversationId);

    ['active', 'closed'].forEach(tabKey => {
        if (this.conversations[tabKey]) {
            const list = this.conversations[tabKey];
            const index = list.findIndex(c => c && String(c.ID) === stringConversationId);
            if (index !== -1) {
                foundAndUpdated = true;
                
                let unreadCountUpdate = {};
                if (updates.UNREAD_MESSAGES !== undefined) {
                    if (typeof updates.UNREAD_MESSAGES === 'function') {
                        unreadCountUpdate.UNREAD_MESSAGES = updates.UNREAD_MESSAGES(list[index]);
                    } else {
                        unreadCountUpdate.UNREAD_MESSAGES = updates.UNREAD_MESSAGES;
                    }
                }
                
                const oldConvData = list[index];
                list[index] = { 
                    ...oldConvData, 
                    ...updates, 
                    ...unreadCountUpdate,
                    USER_ID: updates.USER_ID !== undefined ? updates.USER_ID : oldConvData.USER_ID,
                    USER_USERNAME: updates.USER_USERNAME !== undefined ? updates.USER_USERNAME : oldConvData.USER_USERNAME,
                 };

                if (tabKey === 'active' && index > 0) { 
                    const updatedConv = list.splice(index, 1)[0];
                    list.unshift(updatedConv);
                }
            }
        }
    });

    if (foundAndUpdated) {
        if (this.currentTab === 'active' || this.currentTab === 'closed') { 
             this.renderCurrentTabConversations(); 
        }
       
        if (selectAfterUpdate && String(this.activeConversationId) === stringConversationId) {
            console.log(`[ChatUiUpdater] updateConversationInList: Conversa ${conversationId} é a ativa e selectAfterUpdate é true. RE-SELECIONANDO para atualizar UI do chat.`);
            this.selectConversation(stringConversationId); 
        }
    } else {
        if (updates.STATUS && (updates.STATUS === 'pending' || updates.STATUS === 'active')) {
            console.log(`[ChatUiUpdater] updateConversationInList: Conversa ID ${conversationId} não encontrada. Tentando adicionar como nova na aba 'active'.`);
            this.addOrUpdateConversationInList(updates, 'active'); 
        } else {
            console.warn(`[ChatUiUpdater] updateConversationInList: Tentativa de atualizar conversa ${conversationId} que não foi encontrada e não é um novo chat ativo/pendente.`);
        }
    }
  },

  moveConversationToClosed(conversationId) {
    console.log(`[ChatUiUpdater] moveConversationToClosed: Movendo conversa ID ${conversationId} para encerrados.`);
    const stringConversationId = String(conversationId);
    const activeList = this.conversations.active;
    if (!activeList) {
        console.warn("[ChatUiUpdater] moveConversationToClosed: Lista de conversas ativas não encontrada.");
        return;
    }
    const index = activeList.findIndex(c => c && String(c.ID) === stringConversationId);

    if (index !== -1) {
        const conversation = activeList.splice(index, 1)[0];
        if (conversation) {
            conversation.STATUS = 'closed';
            conversation.UNREAD_MESSAGES = 0; 
            
            if (!this.conversations.closed) this.conversations.closed = []; 
            this.conversations.closed.unshift(conversation); 
            
            this.renderCurrentTabConversations(); 

            if (String(this.activeConversationId) === stringConversationId) {
                this.clearChatArea();
            }
        }
    } else {
        console.warn(`[ChatUiUpdater] moveConversationToClosed: Tentativa de mover conversa ${conversationId}, mas não encontrada na lista ativa.`);
    }
  },

  addOrUpdateConversationInList(conversationData, tabKey) {
    console.log(`[ChatUiUpdater] addOrUpdateConversationInList: Adicionando/Atualizando conversa ID ${conversationData.ID} na aba '${tabKey}'. Dados resumidos:`, JSON.stringify(conversationData).substring(0,200)+"...");
    if (!this.conversations[tabKey]) {
        this.conversations[tabKey] = [];
    }
    const list = this.conversations[tabKey];
    const stringConvId = String(conversationData.ID);
    const existingIndex = list.findIndex(c => c && String(c.ID) === stringConvId);

    const newConversationEntry = { 
        ...conversationData, 
        STATUS: conversationData.STATUS || 'pending', 
        UNREAD_MESSAGES: conversationData.UNREAD_MESSAGES === undefined 
            ? (conversationData.STATUS === 'pending' ? 1 : 0) 
            : conversationData.UNREAD_MESSAGES
    };

    if (existingIndex !== -1) {
        const oldConv = list[existingIndex];
        list[existingIndex] = { 
            ...oldConv, 
            ...newConversationEntry,
            USER_ID: newConversationEntry.USER_ID !== undefined ? newConversationEntry.USER_ID : oldConv.USER_ID,
            USER_USERNAME: newConversationEntry.USER_USERNAME !== undefined ? newConversationEntry.USER_USERNAME : oldConv.USER_USERNAME,
        };

        if (tabKey === 'active' && existingIndex > 0) {
            const updatedConv = list.splice(existingIndex, 1)[0];
            list.unshift(updatedConv);
        }
    } else {
        list.unshift(newConversationEntry);
    }
    if (this.currentTab === tabKey) {
        this.renderCurrentTabConversations();
    }
  },
  
  getConversationFromListById(conversationId, tab = null) {
    const stringConvId = String(conversationId);
    const tabsToSearch = tab ? [tab] : ['active', 'closed'];
    for (const tabName of tabsToSearch) {
        const list = this.conversations[tabName];
        if (list) {
            const conversation = list.find(c => c && String(c.ID) === stringConvId);
            if (conversation) return conversation;
        }
    }
    return null;
  },

  getActiveConversationDetails() {
     if (!this.activeConversationId) {
        return null;
     }
    const conversation = this.getConversationFromListById(this.activeConversationId);
    return conversation;
  },

  clearChatArea(showWelcome = true) {
    console.log("[ChatUiUpdater] clearChatArea: Limpando área de chat. Mostrar welcome:", showWelcome);
    this.activeConversationId = null;
    if (window.ChatDomElements) {
        if (window.ChatDomElements.messagesContainer) {
            window.ChatDomElements.messagesContainer.innerHTML = showWelcome ? 
                `<div class="no-chat-selected welcome-screen" id="welcome-screen-placeholder"> 
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="welcome-logo">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-3.861 8.25-8.625 8.25S3.75 16.556 3.75 12s3.861-8.25 8.625-8.25S21 7.444 21 12z" />
                    </svg>
                    <p>Nenhum chat selecionado ou o chat anterior foi encerrado.</p>
                 </div>` : "";
        }
        if (window.ChatDomElements.chatInterface) window.ChatDomElements.chatInterface.style.display = showWelcome ? "none" : "flex";
        if (window.ChatDomElements.welcomeScreen && showWelcome) window.ChatDomElements.welcomeScreen.style.display = "flex";
        else if (window.ChatDomElements.welcomeScreen) window.ChatDomElements.welcomeScreen.style.display = "none";

        if (window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = "none"; 
        if (window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = "none";
        if (window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = "none"; 
    }
    this.updateChatHeader(null); 
    this.highlightActiveConversation(); 
    if (window.ChatDomElements.chatContainer) {
        window.ChatDomElements.chatContainer.classList.remove('chat-active');
    }
  },

  filterConversations(searchTerm) { 
    this.currentFilter = searchTerm.toLowerCase();
    this.renderCurrentTabConversations();
  },
  matchesFilter(conversation, filter) { 
    if (!filter) return true;
    const name = (conversation.CLIENT_NAME || "").toLowerCase();
    const id = (conversation.CLIENT_WHATSAPP_ID || conversation.CLIENT_JID || "").toLowerCase(); 
    const sector = (conversation.SECTOR || "").toLowerCase(); 
    return name.includes(filter) || id.includes(filter) || sector.includes(filter);
  }, 
  renderCurrentTabConversations() { 
    if (this.conversations[this.currentTab]) {
        this.updateConversations(this.conversations[this.currentTab], this.currentTab);
    } else {
        this.updateConversations([], this.currentTab, "Nenhuma conversa para exibir nesta aba.");
    }
  },
  setActiveTab(tabType) { 
    console.log(`[ChatUiUpdater] setActiveTab: Definindo aba ativa para '${tabType}'. Aba anterior: ${this.currentTab}`);
    this.currentTab = tabType;
    const tabButtonsToUpdate = window.ChatDomElements && window.ChatDomElements.tabButtonsNodeList 
                                ? window.ChatDomElements.tabButtonsNodeList
                                : document.querySelectorAll(".sidebar .tabs .tab-button"); 

    if (tabButtonsToUpdate && tabButtonsToUpdate.length > 0) {
        tabButtonsToUpdate.forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tabType);
        });
    }
    if (this.activeConversationId) {
        console.log(`[ChatUiUpdater] setActiveTab: Limpando área de chat ao mudar para aba ${tabType} pois uma conversa estava ativa.`);
        this.clearChatArea(true); 
    }
    this.renderCurrentTabConversations(); 
  },
  updateTypingIndicator(clientName, isTyping) { 
    if (!window.ChatDomElements || !window.ChatDomElements.typingIndicator) return;
    const typingIndicator = window.ChatDomElements.typingIndicator;
    if (isTyping) {
        typingIndicator.textContent = `${clientName || 'Cliente'} está digitando...`;
        typingIndicator.style.display = 'block';
    } else {
        typingIndicator.style.display = 'none';
    }
  },
  formatTime(timestamp) { 
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return ""; 
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, 
  showError(message) { 
    console.error("[ChatUiUpdater] Erro UI:", message);
    if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert(message, "error");
    } else { alert(`Erro: ${message}`); }
  },
  showNotification(message, type = "info") { 
    if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert(message, type);
    } else { alert(`${type.toUpperCase()}: ${message}`); }
  },
};
