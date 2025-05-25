// web/js/chatDomElements.js
// Elementos DOM para o chat
window.ChatDomElements = {
  // --- Elementos da Barra Lateral de Lista de Chats ---
  sidebar: null, // O contêiner da sidebar principal (classe .sidebar)
  loggedInAgentName: null, // Span para o nome do agente logado (ID: loggedInAgentName)
  sidebarTabsContainer: null, // O contêiner das abas (classe .sidebar-tabs)
  // activeTabButton: null, // Especificamente o botão da aba "Ativos/Pendentes"
  // closedTabButton: null, // Especificamente o botão da aba "Encerrados"
  chatSearchInput: null, // Input de busca (ID: chatSearchInput)
  conversationsList: null, // Lista de conversas (ID: conversationsList) - CORRIGIDO
  
  // --- Elementos da Área Principal do Chat ---
  chatArea: null, // O contêiner da área de chat (classe .chat-area)
  chatHeaderIcon: null, // Ícone no cabeçalho do chat (ID: chatHeaderIcon)
  chatHeaderName: null, // Nome no cabeçalho do chat (ID: chatHeaderName)
  endChatButton: null, // Botão de encerrar chat (ID: endChatButton)
  
  chatMessages: null, // Contêiner das mensagens (ID: chatMessages)
  noChatSelectedIconPlaceholder: null, // Placeholder quando nenhum chat está selecionado (ID: noChatSelectedIconPlaceholder)
  
  typingIndicator: null, // Indicador de "digitando..." (ID: typingIndicator)
  
  chatInputControls: null, // Contêiner dos controles de input (ID: chatInputControls)
  attachmentButton: null, // Botão de anexo (ID: attachmentButton - NOVO ID)
  mediaUploadInput: null, // Input de upload de mídia (ID: mediaUploadInput)
  messageInput: null, // Campo de input da mensagem (ID: messageInput)
  sendMessageButton: null, // Botão de enviar mensagem (ID: sendMessageButton - NOVO ID)

  // --- Elementos Globais/Outros ---
  connectionStatus: null, // Indicador de status da conexão (ID: connectionStatus)
  alertModal: null, // Modal de alerta (ID: alertModal)
  alertModalMessage: null, // Mensagem no modal de alerta (ID: alertModalMessage)

  // --- Elementos do chatDomElements.txt original que podem não existir no HTML atual ---
  // Mantidos como null e serão reportados pelo validateElements se não encontrados
  iconNavbar: null,
  navConversasButton: null,
  navEncerradosButton: null,
  navDocumentosButton: null,
  navEditarButton: null,
  navSairButton: null,
  chatListSidebar: null, 
  mainMenuButton: null,
  // chatFilterTabsContainer: null, // Substituído por sidebarTabsContainer
  roomListPlaceholder: null,
  mainChatContent: null,
  chatAreaHeader: null,
  backToChatsMobileButton: null,
  headerContactAvatar: null,
  chatRoomTitleMain: null,
  contactStatus: null,
  searchInChatButton: null,
  callButton: null,
  contactInfoButton: null,
  messagesContainer: null, // Substituído por chatMessages
  noChatPlaceholder: null, // Usar noChatSelectedIconPlaceholder ou seu pai
  messageInputArea: null, // Substituído por chatInputControls
  attachFileButtonMain: null, // Substituído por attachmentButton
  // messageInput: null, // já mapeado
  emojiButton: null,
  // sendMessageButton: null, // já mapeado
  rightSidebar: null,
  contactInfoHeaderTitle: null,
  closeContactInfoButton: null,
  panelContactAvatar: null,
  panelContactName: null,
  panelContactPhone: null,
  addContactButton: null,
  notificationToggle: null,
  sharedMediaGrid: null,
  chatContainer: null,
  welcomeScreen: null,
  chatInterface: null,
  userNameElement: null,
  userStatusElement: null,
  logoutButton: null,
  contactName: null,
  contactNumber: null,
  transferChatButton: null,
  // endChatButton: null, // já mapeado
  transferModal: null,
  closeModalButton: null, // Para o transferModal
  sectorsList: null,
  attendantsList: null,
  // alertModal: null, // já mapeado
  // alertMessage: null, // já mapeado
  closeAlertButton: null, // Para o alertModal

  init() {
    console.log("[ChatDomElements] Inicializando elementos DOM");

    // --- Elementos da Barra Lateral de Lista de Chats (Conforme chat.html do Canvas) ---
    this.sidebar = document.querySelector(".sidebar");
    this.loggedInAgentName = document.getElementById("loggedInAgentName");
    this.sidebarTabsContainer = document.querySelector(".sidebar-tabs");
    // Se precisar dos botões de aba individualmente:
    // this.activeTabButton = this.sidebarTabsContainer ? this.sidebarTabsContainer.querySelector('[data-tab="active"]') : null;
    // this.closedTabButton = this.sidebarTabsContainer ? this.sidebarTabsContainer.querySelector('[data-tab="closed"]') : null;
    this.chatSearchInput = document.getElementById("chatSearchInput");
    this.conversationsList = document.getElementById("conversationsList"); // CORRIGIDO

    // --- Elementos da Área Principal do Chat (Conforme chat.html do Canvas) ---
    this.chatArea = document.querySelector(".chat-area");
    this.chatHeaderIcon = document.getElementById("chatHeaderIcon");
    this.chatHeaderName = document.getElementById("chatHeaderName");
    this.endChatButton = document.getElementById("endChatButton"); // ID do HTML do Canvas
    
    this.chatMessages = document.getElementById("chatMessages");
    this.noChatSelectedIconPlaceholder = document.getElementById("noChatSelectedIconPlaceholder");
    
    this.typingIndicator = document.getElementById("typingIndicator");
    
    this.chatInputControls = document.getElementById("chatInputControls"); // ID do HTML do Canvas
    // O botão de anexo no HTML do Canvas tem ID "attachmentButton"
    // A imagem dentro dele não precisa ser selecionada separadamente aqui se o listener for no botão.
    this.attachmentButton = document.getElementById("attachmentButton"); 
    this.mediaUploadInput = document.getElementById("mediaUploadInput");
    this.messageInput = document.getElementById("messageInput");
    // O botão de enviar no HTML do Canvas tem ID "sendMessageButton"
    this.sendMessageButton = document.getElementById("sendMessageButton");

    // --- Elementos Globais/Outros (Conforme chat.html do Canvas) ---
    this.connectionStatus = document.getElementById("connectionStatus");
    this.alertModal = document.getElementById("alertModal");
    this.alertModalMessage = document.getElementById("alertModalMessage");

    // --- Tentativa de selecionar elementos do chatDomElements.txt original ---
    // Muitos destes provavelmente serão null se o HTML do Canvas for mais simples.
    this.iconNavbar = document.querySelector(".icon-navbar"); // Exemplo, pode não existir
    this.navConversasButton = document.getElementById("nav-conversas");
    this.navEncerradosButton = document.getElementById("nav-encerrados");
    this.navDocumentosButton = document.getElementById("nav-documentos");
    this.navEditarButton = document.getElementById("nav-editar");
    this.navSairButton = document.getElementById("nav-sair");

    this.chatListSidebar = this.sidebar; // Reutilizando a referência
    this.mainMenuButton = document.getElementById("main-menu-button");
    this.roomListPlaceholder = document.getElementById("room-list-placeholder"); // Pode não existir

    this.mainChatContent = this.chatArea; // Reutilizando a referência
    this.chatAreaHeader = document.querySelector(".chat-header"); // Selecionando pelo seletor de classe do HTML do Canvas
    this.backToChatsMobileButton = document.getElementById("back-to-chats-mobile");
    this.headerContactAvatar = document.getElementById("chatHeaderIcon"); // Reutilizando o ícone do header
    this.chatRoomTitleMain = this.chatHeaderName; // Reutilizando
    this.contactStatus = document.getElementById("contact-status"); // Pode não existir
    this.searchInChatButton = document.getElementById("search-in-chat-button");
    this.callButton = document.getElementById("call-button");
    this.contactInfoButton = document.getElementById("contact-info-button");

    this.messagesContainer = this.chatMessages; // Reutilizando
    this.noChatPlaceholder = this.noChatSelectedIconPlaceholder ? this.noChatSelectedIconPlaceholder.parentElement : null;
    
    this.messageInputArea = this.chatInputControls; // Reutilizando
    this.attachFileButtonMain = this.attachmentButton; // Reutilizando
    this.emojiButton = document.getElementById("emoji-button"); // Pode não existir

    this.rightSidebar = document.getElementById("contact-info-panel"); // Pode não existir
    if (this.rightSidebar) {
        this.contactInfoHeaderTitle = this.rightSidebar.querySelector(".contact-info-header h3");
        this.closeContactInfoButton = document.getElementById("close-contact-info-button");
        this.panelContactAvatar = document.getElementById("panel-contact-avatar");
        this.panelContactName = document.getElementById("panel-contact-name");
        this.panelContactPhone = document.getElementById("panel-contact-phone");
        this.addContactButton = document.getElementById("add-contact-button");
        this.notificationToggle = document.getElementById("notification-toggle");
        this.sharedMediaGrid = document.getElementById("shared-media-grid");
    }

    this.chatContainer = document.querySelector(".container"); // Classe geral da aplicação
    this.welcomeScreen = this.noChatPlaceholder; 
    this.chatInterface = this.chatArea; 

    this.userNameElement = document.getElementById("user-name"); 
    this.userStatusElement = document.getElementById("user-status"); 
    this.logoutButton = this.navSairButton; 

    this.contactName = this.chatHeaderName; 
    this.contactNumber = document.getElementById("contact-number"); 
    this.transferChatButton = document.getElementById("transfer-chat-button"); // ID do HTML do Canvas para o botão de transferir, se existir.

    this.transferModal = document.getElementById("transfer-modal"); 
    if (this.transferModal) {
        this.closeModalButton = this.transferModal.querySelector(".close-button"); 
        this.sectorsList = document.getElementById("sectors-list-select"); 
        this.attendantsList = document.getElementById("attendants-list-select"); 
    }
    
    if (this.alertModal) { // O botão de fechar o alertModal não está no HTML do Canvas
        this.closeAlertButton = this.alertModal.querySelector(".close-alert-button"); // Exemplo de seletor
    }

    this.validateElements();

    console.log("[ChatDomElements] Elementos DOM inicializados (alguns podem estar 'null' se não presentes no HTML).");
    return this;
  },

  validateElements() {
    const missingElements = [];
    const optionalElements = [ // Lista de elementos que são sabidamente opcionais ou não existem no HTML atual do Canvas
        "iconNavbar", "navConversasButton", "navEncerradosButton", "navDocumentosButton",
        "navEditarButton", "navSairButton", "mainMenuButton", "roomListPlaceholder",
        "backToChatsMobileButton", "contactStatus", "searchInChatButton", "callButton",
        "contactInfoButton", "emojiButton", "rightSidebar", "contactInfoHeaderTitle",
        "closeContactInfoButton", "panelContactAvatar", "panelContactName", "panelContactPhone",
        "addContactButton", "notificationToggle", "sharedMediaGrid", "userNameElement",
        "userStatusElement", "logoutButton", "contactNumber", "transferChatButton",
        "transferModal", "closeModalButton", "sectorsList", "attendantsList", "closeAlertButton"
        // Adicione outros IDs aqui que você sabe que são de funcionalidades não implementadas no HTML atual
    ];

    for (const key in this) {
      if (this.hasOwnProperty(key) && typeof this[key] !== 'function' && this[key] === null) {
        if (!optionalElements.includes(key)) { // Só reporta como "crítico" se não for opcional
            missingElements.push(key);
        } else {
            // console.log(`[ChatDomElements] Elemento opcional '${key}' não encontrado (OK).`);
        }
      }
    }

    if (missingElements.length > 0) {
      // Este aviso agora só mostrará elementos que deveriam existir com base no HTML do Canvas, mas não foram encontrados
      console.warn("[ChatDomElements] Elementos ESSENCIAIS não encontrados (verifique IDs no HTML e no chatDomElements.js):", missingElements.join(", "));
    }
  },

  // A função showAlert foi movida para ChatUiUpdater ou pode ser global.
  // Se precisar dela aqui, descomente e adapte.
  /*
  showAlert(message, type = "info") {
    console.log(`[ChatDomElements] Mostrando alerta: ${message} (${type})`);
    if (this.alertModal && this.alertModalMessage) {
      this.alertModalMessage.textContent = message;
      this.alertModal.className = 'alert-modal show'; // Reset classes
      this.alertModal.classList.add(`alert-${type}`); // Adiciona tipo específico
      this.alertModal.style.display = "block";

      // Adicionar um botão de fechar se não houver um ou lógica para fechar
      // setTimeout(() => {
      //   this.alertModal.style.display = "none";
      //   this.alertModal.classList.remove('show', `alert-${type}`);
      // }, 5000);
    } else {
      console.warn("[ChatDomElements] Elementos do modal de alerta não configurados. Usando alert nativo.");
      alert(`${type.toUpperCase()}: ${message}`);
    }
  },
  */
};
