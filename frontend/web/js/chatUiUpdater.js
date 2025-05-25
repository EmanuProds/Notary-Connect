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
    if (window.ChatDomElements && window.ChatDomElements.sidebarTabsContainer) {
        this.setActiveTab(this.currentTab); // Define a aba inicial e renderiza
    } else {
        console.warn("[ChatUiUpdater] initialize: sidebarTabsContainer não encontrado. A aba inicial pode não ser renderizada corretamente.");
        this.renderCurrentTabConversations();
    }
    return this; 
  },

  updateConversations(newConversations, tabType, errorMessage = null) {
    console.log(`[ChatUiUpdater] updateConversations: Aba: ${tabType}. Recebidas ${newConversations ? newConversations.length : 'N/A'} conversas. Filtro: '${this.currentFilter}'. Erro: ${errorMessage}`);
    
    const conversationsListElement = window.ChatDomElements && window.ChatDomElements.conversationsList;
    if (!conversationsListElement) {
      console.error("[ChatUiUpdater] updateConversations: Elemento conversationsList não encontrado em ChatDomElements.");
      return;
    }
    conversationsListElement.innerHTML = ""; 

    if (errorMessage) {
        console.warn(`[ChatUiUpdater] updateConversations: Exibindo mensagem de erro: ${errorMessage}`);
        const errorElement = document.createElement("div");
        errorElement.className = "p-4 text-center text-red-500";
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

    const conversationsToRender = this.currentFilter ? 
        this.conversations[tabType].filter(conv => conv && this.matchesFilter(conv, this.currentFilter)) : 
        this.conversations[tabType];
    
    if (conversationsToRender.length === 0) {
      const emptyMessageText = this.currentFilter ? `Nenhuma conversa encontrada para "${this.currentFilter}".` : (tabType === "active" ? "Nenhuma conversa ativa ou pendente." : "Nenhuma conversa encerrada.");
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "p-4 text-center text-gray-500";
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
    
    if (this.activeConversationId && tabType === this.currentTab && !this.getConversationFromListById(this.activeConversationId, tabType)) {
        console.log(`[ChatUiUpdater] updateConversations: Conversa ativa ${this.activeConversationId} não encontrada na aba ${tabType} após atualização. Limpando área de chat.`);
        this.clearChatArea();
    } else if (this.activeConversationId && tabType === this.currentTab) {
        this.highlightActiveConversation();
    }
  },

  createConversationItem(conversation) {
    const item = document.createElement("div");
    item.className = "chat-item p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100"; 
    item.dataset.id = String(conversation.ID); 

    if (String(conversation.ID) === String(this.activeConversationId)) {
      item.classList.add("active");
    }
    if (conversation.STATUS === "pending") {
      item.classList.add("border-l-4", "border-yellow-400"); 
    }
    if (conversation.UNREAD_MESSAGES > 0 && String(conversation.ID) !== String(this.activeConversationId)) { 
        item.classList.add("font-bold");
    }

    const clientName = conversation.CLIENT_NAME || conversation.CLIENT_WHATSAPP_ID || "Desconhecido";
    const lastMessageTime = conversation.LAST_MESSAGE_TIME ? this.formatTime(conversation.LAST_MESSAGE_TIME) : "";
    const lastMessageText = conversation.LAST_MESSAGE || conversation.content || "Sem mensagens";
    const truncatedPreview = lastMessageText.length > 35 ? lastMessageText.substring(0, 32) + "..." : lastMessageText;
    
    const loggedInAgentId = window.ChatWebsocketService && window.ChatWebsocketService.agentId ? String(window.ChatWebsocketService.agentId) : null;
    let statusText = conversation.STATUS || '';
    let statusClass = conversation.STATUS === 'active' ? 'bg-green-500 text-white' : (conversation.STATUS === 'pending' ? 'bg-yellow-400 text-yellow-800' : 'bg-gray-400 text-white');
    let statusStyle = "text-transform: uppercase;"; // default style

    if (conversation.STATUS === 'active' && conversation.USER_USERNAME && loggedInAgentId) {
        if (String(conversation.USER_USERNAME) !== loggedInAgentId) {
            statusText = `Com ${conversation.USER_NAME_ASSIGNED || conversation.USER_USERNAME}`;
            statusStyle = ""; // Not uppercase for longer names
        } else {
            statusText = "Ativo com você";
            statusStyle = ""; // Not uppercase
        }
    } else if (conversation.STATUS === 'pending') {
        statusText = "Pendente";
    } else if (conversation.STATUS === 'closed') {
        statusText = "Encerrado";
    }


    const showTakeButton = conversation.STATUS === "pending" && !conversation.USER_ID && !conversation.USER_USERNAME;

    item.innerHTML = `
      <div class="flex items-center">
        <img src="${conversation.CLIENT_PROFILE_PIC || './img/icons/profile.svg'}" alt="Avatar" class="chat-item-profile-pic w-12 h-12 rounded-full mr-3 object-cover flex-shrink-0 bg-gray-300" onerror="this.onerror=null; this.src='./img/icons/profile.svg';">
        <div class="flex-grow overflow-hidden">
          <div class="flex justify-between items-start mb-1">
            <span class="chat-item-name font-semibold text-sm text-slate-800 truncate mr-2">${clientName}</span>
            <span class="chat-status-indicator text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass}" style="${statusStyle}">${statusText}</span>
          </div>
          <div class="chat-item-id text-xs text-slate-500 truncate">${conversation.CLIENT_WHATSAPP_ID || conversation.CLIENT_JID || ''}</div>
          <div class="chat-item-preview text-xs text-slate-700 italic truncate">${truncatedPreview}</div>
        </div>
        <div class="flex flex-col items-end text-xs text-slate-600 ml-2 flex-shrink-0">
            <span class="chat-item-timestamp">${lastMessageTime}</span>
            ${conversation.UNREAD_MESSAGES > 0 && String(conversation.ID) !== String(this.activeConversationId) ? `<span class="unread-badge bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 mt-1">${conversation.UNREAD_MESSAGES}</span>` : ""}
        </div>
      </div>
      ${showTakeButton ? `<button class="take-chat-button mt-2 py-1 px-3 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-md transition duration-150 ease-in-out" data-id="${conversation.ID}">Assumir</button>` : ""}
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
      console.error(`[ChatUiUpdater] selectConversation: Conversa selecionada ID ${conversationId} NÃO ENCONTRADA nos dados internos.`);
      this.clearChatArea(); 
      return;
    }
    console.log(`[ChatUiUpdater] selectConversation: Detalhes da conversa ativa ID ${conversationId}:`, JSON.stringify(conversation));

    const { chatMessages, noChatSelectedIconPlaceholder, chatInputControls, endChatButton, messageInput, sendMessageButton, attachmentButton } = window.ChatDomElements || {};

    if (noChatSelectedIconPlaceholder && noChatSelectedIconPlaceholder.parentElement) {
        noChatSelectedIconPlaceholder.parentElement.style.display = "none";
    }
    
    const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
    const conversationAttendantUsername = conversation.USER_USERNAME ? String(conversation.USER_USERNAME).toUpperCase() : null;
    const canInteract = conversation.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn;
    
    console.log(`[ChatUiUpdater] selectConversation: Verificando interação - ConvID ${conversationId}, Status: ${conversation.STATUS}, Atendente da Conv: '${conversation.USER_USERNAME}' (Normalizado: '${conversationAttendantUsername}'), Atendente Logado: '${agentUsernameLoggedIn}', Pode Interagir: ${canInteract}`);

    if (chatInputControls) {
        chatInputControls.style.display = canInteract ? "flex" : "none";
    } else {
        console.warn("[ChatUiUpdater] selectConversation: chatInputControls não encontrado em ChatDomElements.");
    }
    if (endChatButton) {
        endChatButton.style.display = canInteract ? "flex" : "none";
    } else {
        console.warn("[ChatUiUpdater] selectConversation: endChatButton não encontrado em ChatDomElements.");
    }
    
    if (messageInput) {
        messageInput.disabled = !canInteract;
        if (canInteract) messageInput.focus();
    } else {
        console.warn("[ChatUiUpdater] selectConversation: messageInput não encontrado em ChatDomElements.");
    }
    if (sendMessageButton) {
        sendMessageButton.disabled = !canInteract;
    } else {
        console.warn("[ChatUiUpdater] selectConversation: sendMessageButton não encontrado em ChatDomElements.");
    }
    if (attachmentButton) {
        attachmentButton.disabled = !canInteract;
    } else {
        console.warn("[ChatUiUpdater] selectConversation: attachmentButton não encontrado em ChatDomElements.");
    }
    
    this.updateChatHeader(conversation);
    
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="p-4 text-center text-gray-500">Carregando mensagens...</div>';
    }

    if (window.ChatActions) {
      console.log(`[ChatUiUpdater] selectConversation: Solicitando histórico para conversa ID: ${conversationId}`);
      window.ChatActions.loadChatHistory(conversationId);
      
      const unreadMessagesCount = typeof conversation.UNREAD_MESSAGES === 'number' ? conversation.UNREAD_MESSAGES : 0;

      if (unreadMessagesCount > 0 && canInteract) {
        console.log(`[ChatUiUpdater] selectConversation: Marcando ${unreadMessagesCount} mensagens como lidas para conversa ID: ${conversationId}`);
        window.ChatActions.markMessagesAsRead(conversationId);
      }
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
    const { chatHeaderIcon, chatHeaderName, endChatButton } = window.ChatDomElements || {};

    if (conversation) {
        const name = conversation.CLIENT_NAME || conversation.CLIENT_WHATSAPP_ID || "Desconhecido";
        if (chatHeaderName) chatHeaderName.textContent = name; 
        if (chatHeaderIcon) {
            chatHeaderIcon.style.display = "block";
        }
        
        const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
        const conversationAttendantUsername = conversation.USER_USERNAME ? String(conversation.USER_USERNAME).toUpperCase() : null;
        const canInteract = conversation.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn;
        
        if (endChatButton) endChatButton.style.display = canInteract ? "flex" : "none";
    } else {
        if (chatHeaderName) chatHeaderName.textContent = "Nenhum chat selecionado";
        if (chatHeaderIcon) chatHeaderIcon.style.display = "none";
        if (endChatButton) endChatButton.style.display = "none";
    }
  },

  renderChatHistory(messages, conversationId, errorMessage = null) {
    console.log(`[ChatUiUpdater] renderChatHistory: Iniciando renderização para ConvID ${conversationId}. ${messages ? messages.length : 'N/A'} mensagens. Erro: ${errorMessage}`);
    const { chatMessages } = window.ChatDomElements || {};
    
    if (!chatMessages) {
        console.error("[ChatUiUpdater] renderChatHistory: Container de mensagens (chatMessages) não encontrado.");
        return;
    }
    
    if (String(conversationId) !== String(this.activeConversationId)) {
      console.warn(`[ChatUiUpdater] renderChatHistory: Histórico para ConvID ${conversationId}, mas ConvID ativa é ${this.activeConversationId}. IGNORANDO RENDERIZAÇÃO.`);
      return;
    }
    
    chatMessages.innerHTML = ""; 

    if (errorMessage) {
        chatMessages.innerHTML = `<div class="p-4 text-center text-red-500">${window.ChatUtils ? window.ChatUtils.escapeHtml(errorMessage) : errorMessage}</div>`;
        console.log(`[ChatUiUpdater] renderChatHistory: Erro ao carregar histórico para ConvID ${conversationId}: ${errorMessage}`);
        return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      console.log(`[ChatUiUpdater] renderChatHistory: Nenhuma mensagem para renderizar na ConvID ${conversationId}.`);
      chatMessages.innerHTML = '<div class="p-4 text-center text-gray-500">Nenhuma mensagem nesta conversa.</div>';
      return;
    }

    messages.forEach(message => {
      if (message && (typeof message.ID !== 'undefined' || typeof message.id !== 'undefined')) { 
        const messageElement = this.createMessageElement(message);
        chatMessages.appendChild(messageElement);
      } else {
        console.warn("[ChatUiUpdater] renderChatHistory: Item de mensagem inválido ou sem ID no histórico:", message);
      }
    });
    setTimeout(() => { 
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 0);
    console.log(`[ChatUiUpdater] renderChatHistory: Histórico para ConvID ${conversationId} renderizado.`);
  },

  createMessageElement(message) {
    const messageElement = document.createElement("div");
    const senderTypeActual = message.SENDER_TYPE || message.senderType || 'unknown';
    messageElement.className = `message p-2.5 rounded-lg max-w-[80%] shadow break-words ${senderTypeActual.toLowerCase() === 'agent' ? 'bg-primary text-white self-end' : 'bg-white text-gray-800 self-start border border-gray-200'}`;
    if (senderTypeActual.toLowerCase() === 'system') {
        messageElement.classList.remove('bg-primary', 'text-white', 'self-end', 'bg-white', 'text-gray-800', 'self-start', 'border', 'border-gray-200', 'shadow');
        messageElement.classList.add('bg-blue-50', 'text-blue-700', 'self-center', 'italic', 'text-sm', 'max-w-[90%]', 'text-center', 'border', 'border-dashed', 'border-blue-200', 'my-2');
    }

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
    const escapedTextContent = window.ChatUtils ? window.ChatUtils.escapeHtml(textContent) : textContent;

    if (message.MEDIA_URL) { 
        const mediaBaseClasses = "media-content block mt-2 rounded";
        if (messageTypeActual === 'image') {
            contentHTML = `<img src="${message.MEDIA_URL}" alt="Imagem" class="${mediaBaseClasses} max-h-60 object-contain" onerror="this.style.display='none'; this.parentElement.innerHTML += '<p class=\\'text-xs text-red-500\\'>Erro ao carregar imagem.</p>';">`;
            if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text mt-1 text-sm">${escapedTextContent}</div>`;
        } else if (messageTypeActual === 'audio') {
            contentHTML = `<audio controls src="${message.MEDIA_URL}" class="${mediaBaseClasses} w-full"></audio>`;
             if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text mt-1 text-sm">${escapedTextContent}</div>`;
        } else if (messageTypeActual === 'video') {
            contentHTML = `<video controls src="${message.MEDIA_URL}" class="${mediaBaseClasses} max-h-60"></video>`;
             if (textContent && textContent !== message.MEDIA_URL && textContent !== `(${messageTypeActual})`) contentHTML += `<div class="message-text mt-1 text-sm">${escapedTextContent}</div>`;
        } else { 
            contentHTML = `
                <a href="${message.MEDIA_URL}" target="_blank" rel="noopener noreferrer" class="${mediaBaseClasses} inline-flex items-center gap-2 bg-gray-200 hover:bg-gray-300 p-2 rounded text-primary hover:text-primary-darker font-medium text-sm">
                    <img src="./img/icons/document.svg" alt="Documento" class="w-5 h-5 flex-shrink-0" style="filter: invert(39%) sepia(98%) saturate(1789%) hue-rotate(195deg) brightness(100%) contrast(101%);" />
                    <span>${window.ChatUtils ? window.ChatUtils.escapeHtml(textContent || message.FILENAME || "Documento") : (textContent || message.FILENAME || "Documento")}</span>
                </a>`;
        }
    } else { 
        contentHTML = `<div class="message-text text-sm">${escapedTextContent}</div>`;
    }
    
    const senderDisplayElement = senderTypeActual.toLowerCase() !== 'system' ? `<div class="sender-name text-xs font-semibold mb-0.5 ${senderTypeActual.toLowerCase() === 'agent' ? 'text-blue-200' : 'text-gray-600'}">${window.ChatUtils ? window.ChatUtils.escapeHtml(senderNameDisplay) : senderNameDisplay}</div>` : '';

    messageElement.innerHTML = `
      ${senderDisplayElement}
      ${contentHTML}
      <div class="message-info text-xs mt-1 ${senderTypeActual.toLowerCase() === 'agent' ? 'text-blue-200 text-right' : 'text-gray-500 text-left'}">${messageTime}</div>
    `;
    return messageElement;
  },

  addNewMessage(conversationId, message) {
    console.log(`[ChatUiUpdater] addNewMessage: Adicionando nova mensagem à conversa ${conversationId}. Mensagem:`, JSON.stringify(message).substring(0,200)+"...");
    const stringConversationId = String(conversationId);
    
    // Prepara o objeto 'updates' para updateConversationInList
    // Se a nova mensagem indica que um chat fechado deve reabrir como pendente,
    // o STATUS deve ser atualizado aqui. Isso depende do que o servidor envia
    // ou da lógica em ChatEventHandlers.onNewMessage.
    const updatesForList = {
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
    };

    // Se a mensagem recebida é para um chat que estava fechado e deve reabri-lo,
    // o `message.newStatus` (ou um campo similar vindo do servidor/ChatEventHandlers)
    // indicaria isso. Por enquanto, vamos assumir que a lógica de reabertura
    // (mudança de STATUS para 'pending' e remoção de USER_ID/USER_USERNAME)
    // já aconteceu no objeto `message.conversationDetailsIfReopened` ou similar,
    // ou que o servidor envia um evento `pending_conversation` separado.
    // Se a mensagem vem com detalhes que indicam reabertura, mesclamos.
    if (message.conversationDetailsIfReopened) {
        Object.assign(updatesForList, message.conversationDetailsIfReopened);
        console.log(`[ChatUiUpdater] addNewMessage: Mensagem para ConvID ${conversationId} parece reabrir o chat. Aplicando detalhes:`, message.conversationDetailsIfReopened);
    }


    this.updateConversationInList(stringConversationId, updatesForList);

    if (String(this.activeConversationId) !== stringConversationId) {
      console.warn(`[ChatUiUpdater] addNewMessage: Nova mensagem para conversa ${conversationId} que NÃO está ativa (ativa: ${this.activeConversationId}). Lista atualizada, mas chat não.`);
      if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
        if (typeof window.NotificationService.playMessageSound === 'function') window.NotificationService.playMessageSound();
      }
      return;
    }

    const { chatMessages } = window.ChatDomElements || {};
    if (!chatMessages) {
      console.error("[ChatUiUpdater] addNewMessage: Container de mensagens (chatMessages) não encontrado.");
      return;
    }
    const placeholder = chatMessages.querySelector('.p-4.text-center.text-gray-500');
    if (placeholder) placeholder.remove();

    const messageElement = this.createMessageElement(message);
    chatMessages.appendChild(messageElement);
    setTimeout(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100); 

    if (window.NotificationService && (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") && !document.hasFocus()) {
      if (typeof window.NotificationService.playMessageSound === 'function') window.NotificationService.playMessageSound();
    }
  },
  
  updateLocalMessageStatus(originalMessageId, success, sentMessageId, timestamp) {
    console.log(`[ChatUiUpdater] updateLocalMessageStatus: Atualizando status da mensagem local ID ${originalMessageId}: sucesso=${success}, novoID=${sentMessageId}, timestamp=${timestamp}`);
    const messageElement = document.querySelector(`.message[data-id="${originalMessageId}"]`); 
    if (messageElement) {
        messageElement.classList.remove('opacity-70'); 
        if (success && sentMessageId) {
            messageElement.dataset.id = String(sentMessageId); 
            messageElement.classList.add('opacity-100'); 
            const timeElement = messageElement.querySelector('.message-info');
            if (timeElement && timestamp) {
                timeElement.textContent = this.formatTime(timestamp);
            }
        } else {
            messageElement.classList.add('border-red-500', 'border-2'); 
            const timeElement = messageElement.querySelector('.message-info');
            if (timeElement) {
                timeElement.textContent += " (Falha ao enviar)";
                timeElement.classList.add('text-red-500');
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
    const { chatMessages } = window.ChatDomElements || {};
    if (!chatMessages) {
        console.error("[ChatUiUpdater] addSystemMessage: Container de mensagens (chatMessages) não encontrado.");
        return;
    }

    const systemMessage = {
        SENDER_TYPE: 'SYSTEM',
        CONTENT: text,
        TIMESTAMP: new Date().toISOString(),
        MESSAGE_TYPE: 'system', 
        ID: `sys_${Date.now()}` 
    };
    const messageElement = this.createMessageElement(systemMessage);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  },

  // Helper function para encontrar em qual lista (active/closed) uma conversa está
  findConversationListKey(conversationId) {
    const stringConvId = String(conversationId);
    if (this.conversations.active && this.conversations.active.find(c => c && String(c.ID) === stringConvId)) {
        return 'active';
    }
    if (this.conversations.closed && this.conversations.closed.find(c => c && String(c.ID) === stringConvId)) {
        return 'closed';
    }
    return null;
  },

  updateConversationInList(conversationId, updates, selectAfterUpdate = false) {
    console.log(`[ChatUiUpdater] updateConversationInList: Atualizando conversa ID ${conversationId}. Updates:`, JSON.stringify(updates).substring(0,200)+"...", `Selecionar depois: ${selectAfterUpdate}`);
    let foundAndUpdated = false;
    const stringConversationId = String(conversationId);
    let updatedConversationObject = null; 
    let originalListKey = this.findConversationListKey(stringConversationId); // Descobre onde a conversa estava ANTES da atualização

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
                // Aplica as atualizações ao objeto da conversa
                list[index] = { 
                    ...oldConvData, 
                    ...updates, 
                    ...unreadCountUpdate,
                    // Garante que USER_ID e USER_USERNAME sejam atualizados se vierem em 'updates'
                    USER_ID: updates.USER_ID !== undefined ? updates.USER_ID : oldConvData.USER_ID,
                    USER_USERNAME: updates.USER_USERNAME !== undefined ? updates.USER_USERNAME : oldConvData.USER_USERNAME,
                 };
                updatedConversationObject = list[index]; 
                console.log(`[ChatUiUpdater] updateConversationInList: Conversation ${stringConversationId} data in this.conversations.${tabKey} AFTER direct update:`, JSON.stringify(updatedConversationObject));

                // Lógica para mover a conversa se necessário (ex: de 'closed' para 'active')
                if (originalListKey === 'closed' && tabKey === 'closed' && (updatedConversationObject.STATUS === 'active' || updatedConversationObject.STATUS === 'pending')) {
                    console.log(`[ChatUiUpdater] updateConversationInList: Moving conversation ${stringConversationId} from 'closed' to 'active' list due to status change to ${updatedConversationObject.STATUS}.`);
                    const conversationToMove = list.splice(index, 1)[0]; // Remove da lista 'closed'
                    if (conversationToMove) {
                        if (!this.conversations.active) this.conversations.active = [];
                        this.conversations.active.unshift(conversationToMove); // Adiciona ao topo da lista 'active'
                        originalListKey = 'active'; // Atualiza para onde ela foi movida
                    }
                } else if (tabKey === 'active' && index > 0) { // Se já estava em 'active', move para o topo
                    const updatedConv = list.splice(index, 1)[0];
                    list.unshift(updatedConv);
                }
            }
        }
    });

    if (foundAndUpdated) {
        // Re-renderiza a aba atual, pois a ordem ou conteúdo pode ter mudado
        this.renderCurrentTabConversations(); 
       
        if (selectAfterUpdate && String(this.activeConversationId) !== stringConversationId) {
            console.log(`[ChatUiUpdater] updateConversationInList: Conversa ${conversationId} atualizada e selectAfterUpdate é true. SELECIONANDO.`);
            this.selectConversation(stringConversationId); 
        } else if (selectAfterUpdate && String(this.activeConversationId) === stringConversationId) {
            console.log(`[ChatUiUpdater] updateConversationInList: Conversa ${conversationId} é a ativa e selectAfterUpdate é true. RE-AVALIANDO UI para chat ativo.`);
            const currentConvDetails = updatedConversationObject; // Usa o objeto que acabamos de atualizar
            
            console.log(`[ChatUiUpdater] updateConversationInList: Detalhes para re-avaliação da UI:`, JSON.stringify(currentConvDetails));

            if (currentConvDetails) {
                this.updateChatHeader(currentConvDetails);
                const agentUsernameLoggedIn = window.ChatWebsocketService ? String(window.ChatWebsocketService.agentId).toUpperCase() : null;
                const conversationAttendantUsername = currentConvDetails.USER_USERNAME ? String(currentConvDetails.USER_USERNAME).toUpperCase() : null;
                const canInteract = currentConvDetails.STATUS === 'active' && conversationAttendantUsername === agentUsernameLoggedIn;
                
                console.log(`[ChatUiUpdater] updateConversationInList (re-evaluation): ConvID ${conversationId}, Status: ${currentConvDetails.STATUS}, Attendant: ${currentConvDetails.USER_USERNAME}, LoggedIn: ${agentUsernameLoggedIn}, CanInteract: ${canInteract}`);

                const domElements = window.ChatDomElements || {};
                if (domElements.chatInputControls) {
                    const newDisplay = canInteract ? "flex" : "none";
                    domElements.chatInputControls.style.display = newDisplay;
                    console.log(`[ChatUiUpdater] updateConversationInList (re-evaluation): chatInputControls.style.display SET TO: ${newDisplay}. Visible (offsetParent): ${domElements.chatInputControls.offsetParent !== null}`);
                } else {
                    console.warn("[ChatUiUpdater] updateConversationInList (re-evaluation): chatInputControls não encontrado.");
                }
                if (domElements.endChatButton) {
                    domElements.endChatButton.style.display = canInteract ? "flex" : "none";
                } else {
                     // console.warn("[ChatUiUpdater] updateConversationInList (re-evaluation): endChatButton não encontrado.");
                }
                if (domElements.messageInput) {
                    domElements.messageInput.disabled = !canInteract;
                    if (canInteract) domElements.messageInput.focus();
                } else {
                     console.warn("[ChatUiUpdater] updateConversationInList (re-evaluation): messageInput não encontrado.");
                }
                if (domElements.sendMessageButton) {
                    domElements.sendMessageButton.disabled = !canInteract;
                } else {
                    console.warn("[ChatUiUpdater] updateConversationInList (re-evaluation): sendMessageButton não encontrado.");
                }
                if (domElements.attachmentButton) {
                    domElements.attachmentButton.disabled = !canInteract;
                } else {
                    console.warn("[ChatUiUpdater] updateConversationInList (re-evaluation): attachmentButton não encontrado.");
                }
            } else {
                console.warn(`[ChatUiUpdater] updateConversationInList: Não foi possível obter currentConvDetails para re-avaliação da UI da conversa ativa ${stringConversationId}.`);
            }
        }
    } else {
        // Se a conversa não foi encontrada para atualização, mas é um novo chat, adiciona-o
        if (updates.ID && (updates.STATUS === 'pending' || updates.STATUS === 'active')) {
            console.log(`[ChatUiUpdater] updateConversationInList: Conversa ID ${updates.ID} não encontrada. Tentando adicionar como nova na aba 'active'.`);
            this.addOrUpdateConversationInList(updates, 'active'); 
            if (selectAfterUpdate) {
                this.selectConversation(String(updates.ID));
            }
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
    console.log(`[ChatUiUpdater] addOrUpdateConversationInList: Adicionando/Atualizando conversa ID ${conversationData.ID} na aba '${tabKey}'.`);
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
    return this.getConversationFromListById(this.activeConversationId, this.currentTab) || this.getConversationFromListById(this.activeConversationId);
  },

  clearChatArea(showWelcome = true) {
    console.log("[ChatUiUpdater] clearChatArea: Limpando área de chat. Mostrar welcome:", showWelcome);
    this.activeConversationId = null;
    const { chatMessages, noChatSelectedIconPlaceholder, chatInputControls, endChatButton } = window.ChatDomElements || {};

    if (chatMessages) {
        chatMessages.innerHTML = ""; 
        if (showWelcome && noChatSelectedIconPlaceholder && noChatSelectedIconPlaceholder.parentElement) {
            const placeholderParent = noChatSelectedIconPlaceholder.parentElement;
            if (!placeholderParent.querySelector('#noChatSelectedIconPlaceholder')) { 
                 placeholderParent.style.display = "flex"; 
                 placeholderParent.innerHTML = `
                    <img src="./img/icons/chat.svg" alt="Selecione um chat" id="noChatSelectedIconPlaceholder" class="w-16 h-16 mb-4 text-gray-400" style="filter: invert(50%) sepia(10%) saturate(500%) hue-rotate(180deg) brightness(100%) contrast(90%);"/>
                    <p class="text-lg">Selecione um chat na lista ao lado para começar.</p>`;
            } else {
                placeholderParent.style.display = "flex";
            }
        } else if (noChatSelectedIconPlaceholder && noChatSelectedIconPlaceholder.parentElement) {
            noChatSelectedIconPlaceholder.parentElement.style.display = "none";
        }
    }
    
    if (chatInputControls) chatInputControls.style.display = "none"; 
    if (endChatButton) endChatButton.style.display = "none"; 
    
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
    const id = (String(conversation.CLIENT_WHATSAPP_ID) || String(conversation.CLIENT_JID) || "").toLowerCase(); 
    const sector = (conversation.SECTOR || "").toLowerCase(); 
    const convOriginalId = (String(conversation.ID) || "").toLowerCase();
    return name.includes(filter) || id.includes(filter) || sector.includes(filter) || convOriginalId.includes(filter);
  }, 
  renderCurrentTabConversations() { 
    if (this.conversations[this.currentTab]) {
        this.updateConversations(this.conversations[this.currentTab], this.currentTab);
    } else {
        this.updateConversations([], this.currentTab, `Nenhuma conversa para exibir na aba '${this.currentTab}'.`);
    }
  },
  setActiveTab(tabType) { 
    console.log(`[ChatUiUpdater] setActiveTab: Definindo aba ativa para '${tabType}'. Aba anterior: ${this.currentTab}`);
    this.currentTab = tabType;
    
    const tabsContainer = window.ChatDomElements && window.ChatDomElements.sidebarTabsContainer;
    if (tabsContainer) {
        const tabButtons = tabsContainer.querySelectorAll(".sidebar-tab"); 
        tabButtons.forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tabType);
        });
    } else {
        console.warn("[ChatUiUpdater] setActiveTab: sidebarTabsContainer não encontrado para atualizar classes das abas.");
    }

    if (this.activeConversationId) {
        console.log(`[ChatUiUpdater] setActiveTab: Limpando área de chat ao mudar para aba ${tabType} pois uma conversa estava ativa.`);
        this.clearChatArea(true); 
    }
    this.renderCurrentTabConversations(); 
  },
  updateTypingIndicator(clientName, isTyping) { 
    const { typingIndicator } = window.ChatDomElements || {};
    if (!typingIndicator) return;
    
    if (isTyping) {
        typingIndicator.textContent = `${clientName || 'Cliente'} está a digitar...`;
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

  _showAlertBase(message, typeClass, duration = 5000) {
    const { alertModal, alertModalMessage } = window.ChatDomElements || {};
    if (alertModal && alertModalMessage) {
        alertModalMessage.textContent = message;
        alertModal.className = 'alert-modal fixed top-5 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-md shadow-lg z-[100] text-sm font-medium'; 
        alertModal.classList.add(typeClass);
        alertModal.classList.add('show'); 

        if (this.alertTimeout) clearTimeout(this.alertTimeout);

        this.alertTimeout = setTimeout(() => {
            alertModal.classList.remove('show');
        }, duration);
    } else {
        console.warn("[ChatUiUpdater] Elementos do modal de alerta (alertModal, alertModalMessage) não configurados. Usando alert nativo.");
        alert(`${typeClass.toUpperCase().replace('ALERT-', '')}: ${message}`);
    }
  },
  showError(message) { 
    console.error("[ChatUiUpdater] Erro UI:", message);
    this._showAlertBase(message, 'error'); 
  },
  showNotification(message, type = "info") { 
    console.log(`[ChatUiUpdater] Notificação UI (${type}):`, message);
    this._showAlertBase(message, type); 
  },
};
