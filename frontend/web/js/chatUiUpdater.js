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
    console.log("[ChatUiUpdater] Método initialize() FOI CHAMADO.");
    if (this.updateConversations && typeof this.updateConversations === 'function') {
        console.log("[ChatUiUpdater] 'updateConversations' está DEFINIDA CORRETAMENTE dentro do objeto ChatUiUpdater no momento da inicialização.");
    } else {
        console.error("[ChatUiUpdater] ERRO CRÍTICO NO MÉTODO initialize(): 'updateConversations' NÃO está definida ou não é uma função AQUI.");
    }
    return this; 
  },

  updateConversations(newConversations, tabType, errorMessage = null) {
    console.log(`[ChatUiUpdater] FUNÇÃO updateConversations EXECUTADA para aba: ${tabType}. Recebidas: ${newConversations ? newConversations.length : 'N/A'}. Erro: ${errorMessage}`);

    if (!window.ChatDomElements || !window.ChatDomElements.conversationsList) {
      console.error("[ChatUiUpdater] Elemento da lista de conversas (conversationsList) não encontrado no DOM.");
      return;
    }
    const conversationsListElement = window.ChatDomElements.conversationsList;
    conversationsListElement.innerHTML = ""; 

    if (errorMessage) {
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
        console.warn(`[ChatUiUpdater] newConversations não é um array para a aba ${tabType}. Recebido:`, newConversations);
        newConversations = []; 
    }
    
    if (!this.conversations[tabType]) { 
        console.warn(`[ChatUiUpdater] Array para a aba ${tabType} não existia. Criando...`);
        this.conversations[tabType] = [];
    }
    this.conversations[tabType] = newConversations; 

    if (newConversations.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "empty-list-message";
      emptyMessage.textContent = tabType === "active" ? "Nenhuma conversa ativa ou pendente." : "Nenhuma conversa encerrada.";
      conversationsListElement.appendChild(emptyMessage);
    } else {
      const conversationsToRender = this.currentFilter ? 
          newConversations.filter(conv => conv && this.matchesFilter(conv, this.currentFilter)) : 
          newConversations;

      if (conversationsToRender.length === 0 && this.currentFilter) {
        const filterEmptyMessage = document.createElement("div");
        filterEmptyMessage.className = "empty-list-message";
        filterEmptyMessage.textContent = `Nenhuma conversa encontrada para "${this.currentFilter}".`;
        conversationsListElement.appendChild(filterEmptyMessage);
      } else {
        conversationsToRender.forEach(conversation => {
            if (conversation && typeof conversation.ID !== 'undefined') { 
                 const conversationItem = this.createConversationItem(conversation);
                 conversationsListElement.appendChild(conversationItem);
            } else {
                console.warn("[ChatUiUpdater] Item de conversa inválido ou sem ID encontrado na lista:", conversation);
            }
        });
      }
    }
    
    if (this.activeConversationId && !this.findConversationById(this.activeConversationId, tabType)) {
        if (tabType === this.currentTab) { 
            this.clearChatArea();
        }
    } else if (this.activeConversationId && this.findConversationById(this.activeConversationId, tabType)) {
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
    const lastMessagePreviewText = conversation.LAST_MESSAGE || "Sem mensagens";
    const truncatedPreview = lastMessagePreviewText.length > 35 ? lastMessagePreviewText.substring(0, 32) + "..." : lastMessagePreviewText;


    item.innerHTML = `
      <div class="chat-item-details">
        <img src="${conversation.CLIENT_PROFILE_PIC || './img/icons/profile.svg'}" alt="Avatar" class="chat-item-profile-pic" onerror="this.src='./img/icons/profile.svg';">
        <div class="chat-item-info">
          <div class="chat-item-name-status">
            <span class="chat-item-name">${clientName}</span>
            <span class="chat-status-indicator ${conversation.STATUS ? conversation.STATUS.toLowerCase() : ''}">${conversation.STATUS || ''}</span>
          </div>
          <span class="chat-item-id">${conversation.CLIENT_WHATSAPP_ID || ''}</span>
          <div class="chat-item-preview">${truncatedPreview}</div>
        </div>
        <div class="chat-item-meta">
            <span class="chat-item-timestamp">${lastMessageTime}</span>
            ${conversation.UNREAD_MESSAGES > 0 && String(conversation.ID) !== String(this.activeConversationId) ? `<span class="unread-badge">${conversation.UNREAD_MESSAGES}</span>` : ""}
        </div>
      </div>
      ${conversation.STATUS === "pending" ? `<button class="take-chat-button" data-id="${conversation.ID}">Assumir</button>` : ""}
    `;

    item.addEventListener("click", (e) => {
        if (e.target.classList.contains('take-chat-button')) {
            e.stopPropagation();
            if (window.ChatActions) window.ChatActions.takeChat(conversation.ID);
        } else {
            this.selectConversation(conversation.ID);
        }
    });
    return item;
  },

  selectConversation(conversationId) {
    console.log("[ChatUiUpdater] Selecionando conversa:", conversationId);
    const stringConversationId = String(conversationId);

    if (this.activeConversationId === stringConversationId) {
        if (window.ChatActions) window.ChatActions.loadChatHistory(conversationId); 
        return;
    }
    this.activeConversationId = stringConversationId;
    this.highlightActiveConversation();

    const conversation = this.getActiveConversationDetails();
    if (!conversation) {
      console.error("[ChatUiUpdater] Conversa selecionada não encontrada:", conversationId);
      this.clearChatArea(); 
      return;
    }

    if (window.ChatDomElements) {
        if (window.ChatDomElements.welcomeScreen) window.ChatDomElements.welcomeScreen.style.display = "none";
        if (window.ChatDomElements.chatInterface) window.ChatDomElements.chatInterface.style.display = "flex"; 
        
        // A lógica de 'canInteract' determina se os controles de chat são mostrados
        const canInteract = conversation.STATUS === 'active' && 
                            conversation.ATTENDANT_USERNAME === window.ChatWebsocketService.agentId;
        
        console.log(`[ChatUiUpdater] selectConversation: ConvID ${conversationId}, Status: ${conversation.STATUS}, Atendente da Conv: ${conversation.ATTENDANT_USERNAME}, Atendente Logado: ${window.ChatWebsocketService.agentId}, Pode Interagir: ${canInteract}`);

        if (window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = canInteract ? "flex" : "none";
        if (window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = canInteract ? "flex" : "none";
        if (window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = canInteract ? "flex" : "none";
    }
    
    this.updateChatHeader(conversation);
    
    if (window.ChatDomElements.messagesContainer) {
        window.ChatDomElements.messagesContainer.innerHTML = '<div class="loading-messages">Carregando mensagens...</div>';
    }

    if (window.ChatActions) {
      window.ChatActions.loadChatHistory(conversationId);
      // Marca como lida APENAS se o atendente logado for o dono da conversa ativa
      if (conversation.UNREAD_MESSAGES > 0 && conversation.STATUS === 'active' && conversation.ATTENDANT_USERNAME === window.ChatWebsocketService.agentId) { 
        window.ChatActions.markMessagesAsRead(conversationId);
      }
    }
  },

  highlightActiveConversation() {
    const items = document.querySelectorAll(".chat-item");
    items.forEach(item => {
      item.classList.toggle("active", item.dataset.id === String(this.activeConversationId));
    });
  },

  updateChatHeader(conversation) {
    if (!window.ChatDomElements) return;
    const { contactName, contactNumber, contactAvatar, chatHeaderName, chatHeaderIcon, endChatButton, transferChatButton } = window.ChatDomElements;

    if (conversation) {
        const name = conversation.CLIENT_NAME || conversation.CLIENT_WHATSAPP_ID || "Desconhecido";
        if (chatHeaderName) chatHeaderName.textContent = name; 
        
        // Usar contactDetailsDiv para o tooltip do JID
        if (window.ChatDomElements.contactDetailsDiv) { // Assumindo que contactDetailsDiv é o container do nome e número
            window.ChatDomElements.contactDetailsDiv.title = `JID: ${conversation.CLIENT_JID || conversation.CLIENT_WHATSAPP_ID || 'N/A'}`;
        }
        // Se contactNumber ainda for usado para exibir algo, ajuste aqui:
        // if (contactNumber) contactNumber.textContent = conversation.CLIENT_WHATSAPP_ID || ""; 
        
        if (contactAvatar) contactAvatar.src = conversation.CLIENT_PROFILE_PIC || './img/icons/profile.svg';
        if (chatHeaderIcon) chatHeaderIcon.style.display = 'inline-block'; // Ou 'block'
        
        const canInteract = conversation.STATUS === 'active' && 
                            conversation.ATTENDANT_USERNAME === window.ChatWebsocketService.agentId;
        if (endChatButton) endChatButton.style.display = canInteract ? "flex" : "none";
        if (transferChatButton) transferChatButton.style.display = canInteract ? "flex" : "none";

    } else {
        if (chatHeaderName) chatHeaderName.textContent = "Nenhum chat selecionado";
        if (window.ChatDomElements.contactDetailsDiv) window.ChatDomElements.contactDetailsDiv.title = "";
        if (contactAvatar) contactAvatar.src = './img/icons/profile.svg';
        if (chatHeaderIcon) chatHeaderIcon.style.display = 'none';
        if (endChatButton) endChatButton.style.display = "none";
        if (transferChatButton) transferChatButton.style.display = "none";
    }
  },

  renderChatHistory(messages, conversationId, errorMessage = null) {
    console.log(`[ChatUiUpdater] Renderizando histórico para conversa ${conversationId}. Mensagens: ${messages ? messages.length : 'N/A'}`);
    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) {
        console.error("[ChatUiUpdater] Container de mensagens não encontrado no DOM.");
        return;
    }
    const messagesContainer = window.ChatDomElements.messagesContainer;
    messagesContainer.innerHTML = "";

    if (String(conversationId) !== String(this.activeConversationId)) {
      console.warn("[ChatUiUpdater] Histórico recebido para conversa não ativa. Ignorando renderização.");
      return;
    }
    
    if (errorMessage) {
        messagesContainer.innerHTML = `<div class="empty-history error-message">${window.ChatUtils.escapeHtml(errorMessage)}</div>`;
        return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      messagesContainer.innerHTML = '<div class="empty-history">Nenhuma mensagem nesta conversa.</div>';
      return;
    }

    messages.forEach(message => {
      if (message && (typeof message.ID !== 'undefined' || typeof message.id !== 'undefined')) { 
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
      } else {
        console.warn("[ChatUiUpdater] Item de mensagem inválido ou sem ID no histórico:", message);
      }
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  createMessageElement(message) {
    const messageElement = document.createElement("div");
    const senderTypeActual = message.SENDER_TYPE || message.senderType || 'unknown';
    const senderTypeClass = senderTypeActual.toLowerCase();
    messageElement.className = `message ${senderTypeClass}`;
    messageElement.dataset.id = String(message.ID || message.id || `local_${Date.now()}`); 

    // Determina o nome do remetente para exibição
    let senderNameDisplay = 'Sistema'; // Padrão para mensagens do sistema/bot
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
    const messageTypeActual = message.MESSAGE_TYPE || message.messageType;

    if (messageTypeActual === 'image' && message.MEDIA_URL) {
        contentHTML = `<img src="${message.MEDIA_URL}" alt="Imagem" class="media-content image" onerror="this.style.display='none'; this.parentElement.innerHTML += '<p class=\\'media-error\\'>Erro ao carregar imagem.</p>';">`;
        if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
    } else if (messageTypeActual === 'audio' && message.MEDIA_URL) {
        contentHTML = `<audio controls src="${message.MEDIA_URL}" class="media-content audio"></audio>`;
         if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
    } else if (messageTypeActual === 'video' && message.MEDIA_URL) {
        contentHTML = `<video controls src="${message.MEDIA_URL}" class="media-content video"></video>`;
         if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text">${window.ChatUtils.escapeHtml(textContent)}</div>`;
    } else if (messageTypeActual === 'document' && message.MEDIA_URL) {
        contentHTML = `
            <a href="${message.MEDIA_URL}" target="_blank" rel="noopener noreferrer" class="media-content document">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <span>${window.ChatUtils.escapeHtml(textContent || "Documento")}</span>
            </a>`;
    } else { // text, chat, system, bot
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
    console.log("[ChatUiUpdater] Adicionando nova mensagem:", message, "para conversa:", conversationId);
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
                return convInList ? (convInList.UNREAD_MESSAGES || 0) + 1 : 1;
            }
            return currentConv ? currentConv.UNREAD_MESSAGES : 0; 
        }
    });

    if (String(this.activeConversationId) !== stringConversationId) {
      console.warn("[ChatUiUpdater] Nova mensagem para conversa não ativa. Lista atualizada.");
      if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
        window.NotificationService.playMessageSound();
      }
      return;
    }
    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) {
      console.error("[ChatUiUpdater] Container de mensagens não encontrado.");
      return;
    }
    const messagesContainer = window.ChatDomElements.messagesContainer;
    const placeholder = messagesContainer.querySelector('.empty-history, .loading-messages');
    if (placeholder) placeholder.remove();

    const messageElement = this.createMessageElement(message);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
      window.NotificationService.playMessageSound();
    }
  },
  
  updateLocalMessageStatus(originalMessageId, success, sentMessageId, timestamp) {
    console.log(`[ChatUiUpdater] Atualizando status da mensagem local ID ${originalMessageId}: sucesso=${success}, novoID=${sentMessageId}`);
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
        }
    } else {
        console.warn(`[ChatUiUpdater] Mensagem local com ID ${originalMessageId} não encontrada para atualização de status.`);
    }
  },

  addSystemMessage(text, conversationId) {
     if (String(conversationId) !== String(this.activeConversationId)) return;
    if (!window.ChatDomElements || !window.ChatDomElements.messagesContainer) return;
    const messagesContainer = window.ChatDomElements.messagesContainer;

    const systemMessage = {
        SENDER_TYPE: 'SYSTEM',
        CONTENT: text,
        TIMESTAMP: new Date().toISOString(),
        MESSAGE_TYPE: 'system', // Ou 'text' se o CSS tratar 'system' de forma especial
        ID: `sys_${Date.now()}` 
    };
    const messageElement = this.createMessageElement(systemMessage);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  updateConversationInList(conversationId, updates, selectAfterUpdate = false) {
    let foundAndUpdated = false;
    const stringConversationId = String(conversationId);

    ['active', 'closed'].forEach(tabKey => {
        if (this.conversations[tabKey]) {
            const list = this.conversations[tabKey];
            const index = list.findIndex(c => c && String(c.ID) === stringConversationId);
            if (index !== -1) {
                foundAndUpdated = true;
                let newUnreadCount = updates.UNREAD_MESSAGES;
                if (typeof updates.UNREAD_MESSAGES === 'function') {
                    newUnreadCount = updates.UNREAD_MESSAGES(list[index]);
                }
                
                const unreadUpdate = (newUnreadCount !== undefined) ? { UNREAD_MESSAGES: newUnreadCount } : {};
                
                list[index] = { ...list[index], ...updates, ...unreadUpdate };

                if (tabKey === 'active') { 
                    const updatedConv = list.splice(index, 1)[0];
                    list.unshift(updatedConv);
                }
            }
        }
    });

    if (foundAndUpdated) {
        // Re-renderiza apenas a aba que está ativa na UI
        if (this.currentTab === 'active' || this.currentTab === 'closed') { 
             this.renderCurrentTabConversations(); 
        }
       
        if (selectAfterUpdate && String(this.activeConversationId) === stringConversationId) {
            const updatedDetails = this.getActiveConversationDetails();
            if (updatedDetails) {
                this.updateChatHeader(updatedDetails);
                if (window.ChatDomElements) {
                    const canInteract = updatedDetails.STATUS === 'active' && 
                                        updatedDetails.ATTENDANT_USERNAME === window.ChatWebsocketService.agentId;
                    if (window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = canInteract ? "flex" : "none";
                    if (window.ChatDomElements.endChatButton) window.ChatDomElements.endChatButton.style.display = canInteract ? "flex" : "none";
                    if (window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = canInteract ? "flex" : "none";
                }
            }
        }
    } else {
        console.warn(`[ChatUiUpdater] Tentativa de atualizar conversa ${conversationId} que não foi encontrada em nenhuma lista.`);
    }
  },

  moveConversationToClosed(conversationId) {
    const stringConversationId = String(conversationId);
    const activeList = this.conversations.active;
    if (!activeList) {
        console.warn("[ChatUiUpdater] Lista de conversas ativas não encontrada para mover conversa.");
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
            console.log(`[ChatUiUpdater] Conversa ${conversationId} movida para encerrados.`);

            if (String(this.activeConversationId) === stringConversationId) {
                this.clearChatArea();
            }
        }
    } else {
        console.warn(`[ChatUiUpdater] Tentativa de mover conversa ${conversationId} para fechadas, mas não encontrada na lista ativa.`);
    }
  },

  addOrUpdateConversationInList(conversationData, tabKey) {
    if (!this.conversations[tabKey]) {
        this.conversations[tabKey] = [];
    }
    const list = this.conversations[tabKey];
    const stringConvId = String(conversationData.ID);
    const existingIndex = list.findIndex(c => c && String(c.ID) === stringConvId);

    const newConversationEntry = { 
        ...conversationData, 
        STATUS: conversationData.STATUS || 'pending', 
        UNREAD_MESSAGES: conversationData.UNREAD_MESSAGES === undefined ? (conversationData.STATUS === 'pending' ? 1 : 0) : conversationData.UNREAD_MESSAGES
    };

    if (existingIndex !== -1) {
        list[existingIndex] = { ...list[existingIndex], ...newConversationEntry };
        if (tabKey === 'active') {
            const updatedConv = list.splice(existingIndex, 1)[0];
            list.unshift(updatedConv);
        }
    } else {
        list.unshift(newConversationEntry);
    }
    this.renderCurrentTabConversations();
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
     if (!this.activeConversationId) return null;
    return this.getConversationFromListById(this.activeConversationId); 
  },

  clearChatArea() {
    this.activeConversationId = null;
    if (window.ChatDomElements) {
        if (window.ChatDomElements.messagesContainer) window.ChatDomElements.messagesContainer.innerHTML = 
            `<div class="no-chat-selected">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="welcome-logo">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-3.861 8.25-8.625 8.25S3.75 16.556 3.75 12s3.861-8.25 8.625-8.25S21 7.444 21 12z" />
                </svg>
                <p>Nenhum chat selecionado ou o chat anterior foi encerrado.</p>
             </div>`;
        if (window.ChatDomElements.chatInterface) window.ChatDomElements.chatInterface.style.display = "none";
        if (window.ChatDomElements.welcomeScreen) window.ChatDomElements.welcomeScreen.style.display = "flex";
         if (window.ChatDomElements.chatInputControls) window.ChatDomElements.chatInputControls.style.display = "none"; 
         if (window.ChatDomElements.transferChatButton) window.ChatDomElements.transferChatButton.style.display = "none";
    }
    this.updateChatHeader(null); 
    this.highlightActiveConversation(); 
  },

  filterConversations(searchTerm) { 
    this.currentFilter = searchTerm.toLowerCase();
    this.renderCurrentTabConversations();
  },
  matchesFilter(conversation, filter) { 
    if (!filter) return true;
    const name = (conversation.CLIENT_NAME || "").toLowerCase();
    const id = (conversation.CLIENT_WHATSAPP_ID || "").toLowerCase();
    const sector = (conversation.SECTOR || "").toLowerCase(); 
    return name.includes(filter) || id.includes(filter) || sector.includes(filter);
  }, 
  renderCurrentTabConversations() { 
    if (this.conversations[this.currentTab]) {
        this.updateConversations(this.conversations[this.currentTab], this.currentTab);
    } else {
        console.warn(`[ChatUiUpdater] Tentativa de renderizar aba desconhecida ou sem lista: ${this.currentTab}`);
        this.updateConversations([], this.currentTab, "Aba não encontrada ou vazia.");
    }
  },
  setActiveTab(tabType) { 
    this.currentTab = tabType;
    const tabButtonsToUpdate = window.ChatDomElements && window.ChatDomElements.tabButtonsNodeList 
                                ? window.ChatDomElements.tabButtonsNodeList
                                : document.querySelectorAll(".sidebar .tabs .tab-button"); 

    if (tabButtonsToUpdate && tabButtonsToUpdate.length > 0) {
        tabButtonsToUpdate.forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tabType);
        });
    } else {
        console.warn("[ChatUiUpdater] Botões de aba não encontrados para setActiveTab.");
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

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Ontem";
    } else {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }); // Alterado para ano completo
    }
  }, 
  showError(message) { 
    console.error("[ChatUiUpdater] Erro:", message);
    if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert(message, "error");
    } else {
        alert(`Erro: ${message}`);
    }
  },
  showNotification(message, type = "info") { 
    console.log(`[ChatUiUpdater] Notificação (${type}):`, message);
    if (window.ChatDomElements && typeof window.ChatDomElements.showAlert === 'function') {
        window.ChatDomElements.showAlert(message, type);
    } else {
        alert(`${type.toUpperCase()}: ${message}`);
    }
  },
};

console.log("[ChatUiUpdater] Módulo carregado e objeto window.ChatUiUpdater definido.");
