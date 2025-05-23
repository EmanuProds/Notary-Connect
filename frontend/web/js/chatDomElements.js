// web/js/chatDomElements.js
// Elementos DOM para o chat
window.ChatDomElements = {
  // --- Elementos da Navbar de Ícones (Nova) ---
  iconNavbar: null,
  navConversasButton: null,
  navEncerradosButton: null,
  navDocumentosButton: null,
  navEditarButton: null,
  navSairButton: null,

  // --- Elementos da Barra Lateral de Lista de Chats (Antiga .left-sidebar) ---
  chatListSidebar: null, // Antigo 'sidebar'
  mainMenuButton: null, // Botão de hamburguer na chat-list-sidebar
  searchInput: null, // ID: search-chats-input no HTML
  chatFilterTabsContainer: null, // ID: chat-filter-tabs no HTML
  conversationsList: null, // ID: room-list no HTML (PRINCIPAL CORREÇÃO PARA CARREGAR CHATS)
  roomListPlaceholder: null, // ID: room-list-placeholder no HTML

  // --- Elementos da Área Principal do Chat ---
  mainChatContent: null, // Nova classe para o container principal do chat
  chatAreaHeader: null, // ID: chat-area-header no HTML
  backToChatsMobileButton: null, // ID: back-to-chats-mobile no HTML
  headerContactAvatar: null, // ID: header-contact-avatar no HTML
  chatRoomTitleMain: null, // ID: chat-room-title-main no HTML (Nome do contato no header)
  contactStatus: null, // ID: contact-status no HTML
  searchInChatButton: null, // ID: search-in-chat-button no HTML
  callButton: null, // ID: call-button no HTML
  contactInfoButton: null, // ID: contact-info-button no HTML (Abre a right-sidebar)

  messagesContainer: null, // ID: chat-messages no HTML
  noChatPlaceholder: null, // ID: no-chat-placeholder no HTML
  typingIndicator: null, // ID: typing-indicator no HTML

  messageInputArea: null, // ID: message-input-area no HTML (Footer com input e botões)
  attachFileButtonMain: null, // ID: attach-file-button-main no HTML
  messageInput: null, // ID: message-input-main no HTML (PRINCIPAL CAMPO DE MENSAGEM)
  emojiButton: null, // ID: emoji-button no HTML
  sendMessageButton: null, // ID: send-message-button-main no HTML (PRINCIPAL BOTÃO DE ENVIAR)
  // recordAudioButtonMain: null, // Se for usar: document.getElementById("record-audio-button-main")

  // --- Elementos da Barra Lateral Direita (Informações do Contato) ---
  rightSidebar: null, // ID: contact-info-panel no HTML
  contactInfoHeaderTitle: null, // Dentro de .contact-info-header > h3
  closeContactInfoButton: null, // ID: close-contact-info-button no HTML
  panelContactAvatar: null, // ID: panel-contact-avatar no HTML
  panelContactName: null, // ID: panel-contact-name no HTML
  panelContactPhone: null, // ID: panel-contact-phone no HTML
  addContactButton: null, // ID: add-contact-button no HTML
  notificationToggle: null, // ID: notification-toggle no HTML
  sharedMediaGrid: null, // ID: shared-media-grid no HTML

  // --- Elementos que estavam no seu chatDomElements.txt original ---
  // Mantidos para referência, mas podem não existir no chat.html atual
  // ou precisam de IDs/classes correspondentes.
  chatContainer: null, // Classe .app-container no HTML atual
  // sidebar: null, // Agora é .icon-navbar e .chat-list-sidebar
  chatArea: null, // Agora é .main-chat-content
  welcomeScreen: null, // O noChatPlaceholder serve a um propósito similar
  chatInterface: null, // O mainChatContent é a interface principal de chat

  userNameElement: null, // Precisa ser adicionado ao HTML se necessário
  userStatusElement: null, // Precisa ser adicionado ao HTML se necessário
  logoutButton: null, // O botão de sair está na icon-navbar (nav-sair)

  // chatHeader: null, // Agora é chatAreaHeader (ID: chat-area-header)
  // contactAvatar: null, // Agora é headerContactAvatar (ID: header-contact-avatar)
  contactName: null, // Agora é chatRoomTitleMain (ID: chat-room-title-main)
  contactNumber: null, // Pode ser panelContactPhone (ID: panel-contact-phone) ou um novo

  transferChatButton: null, // Precisa ser adicionado/mapeado se a funcionalidade existir
  endChatButton: null, // Precisa ser adicionado/mapeado se a funcionalidade existir

  // chatInputControls: null, // Agora é messageInputArea (ID: message-input-area)
  // attachmentButton: null, // Agora é attachFileButtonMain (ID: attach-file-button-main)
  // sendButton: null, // Agora é sendMessageButton (ID: send-message-button-main)

  transferModal: null,
  closeModalButton: null,
  sectorsList: null, // Dentro do modal de transferência, precisa de ID
  attendantsList: null, // Dentro do modal de transferência, precisa de ID

  alertModal: null,
  alertMessage: null,
  closeAlertButton: null,

  fileInput: null, // Se houver um input type="file" específico para anexos.

  // Inicializar elementos DOM
  init() {
    console.log("[ChatDomElements] Inicializando elementos DOM");

    // --- Nova Navbar de Ícones ---
    this.iconNavbar = document.querySelector(".icon-navbar");
    this.navConversasButton = document.getElementById("nav-conversas");
    this.navEncerradosButton = document.getElementById("nav-encerrados");
    this.navDocumentosButton = document.getElementById("nav-documentos");
    this.navEditarButton = document.getElementById("nav-editar");
    this.navSairButton = document.getElementById("nav-sair"); // Corresponde ao antigo logoutButton?

    // --- Barra Lateral de Lista de Chats (Antiga .left-sidebar) ---
    this.chatListSidebar = document.querySelector(".chat-list-sidebar");
    this.mainMenuButton = document.getElementById("main-menu-button");
    this.searchInput = document.getElementById("search-chats-input"); // Atualizado do original "search-input"
    this.chatFilterTabsContainer = document.getElementById("chat-filter-tabs");
    this.conversationsList = document.getElementById("room-list"); // <<< PRINCIPAL CORREÇÃO AQUI [cite: 1]
    this.roomListPlaceholder = document.getElementById("room-list-placeholder");

    // --- Área Principal do Chat ---
    this.mainChatContent = document.querySelector(".main-chat-content");
    this.chatAreaHeader = document.getElementById("chat-area-header");
    this.backToChatsMobileButton = document.getElementById("back-to-chats-mobile");
    this.headerContactAvatar = document.getElementById("header-contact-avatar"); // Atualizado do original "contact-avatar"
    this.chatRoomTitleMain = document.getElementById("chat-room-title-main"); // Atualizado do original "contact-name"
    this.contactStatus = document.getElementById("contact-status");
    this.searchInChatButton = document.getElementById("search-in-chat-button");
    this.callButton = document.getElementById("call-button");
    this.contactInfoButton = document.getElementById("contact-info-button");

    this.messagesContainer = document.getElementById("chat-messages"); // Atualizado do original "messages-container"
    this.noChatPlaceholder = document.getElementById("no-chat-placeholder");
    this.typingIndicator = document.getElementById("typing-indicator");

    this.messageInputArea = document.querySelector(".message-input-area"); // ID: message-input-area
    this.attachFileButtonMain = document.getElementById("attach-file-button-main"); // Atualizado de "attachment-button"
    this.messageInput = document.getElementById("message-input-main"); // Atualizado de "message-input"
    this.emojiButton = document.getElementById("emoji-button");
    this.sendMessageButton = document.getElementById("send-message-button-main"); // Atualizado de "send-button"

    // --- Barra Lateral Direita (Informações do Contato) ---
    this.rightSidebar = document.getElementById("contact-info-panel");
    if (this.rightSidebar) { // Elementos dentro da rightSidebar
        const header = this.rightSidebar.querySelector(".contact-info-header h3");
        if (header) this.contactInfoHeaderTitle = header;
        this.closeContactInfoButton = document.getElementById("close-contact-info-button");
        this.panelContactAvatar = document.getElementById("panel-contact-avatar");
        this.panelContactName = document.getElementById("panel-contact-name");
        this.panelContactPhone = document.getElementById("panel-contact-phone");
        this.addContactButton = document.getElementById("add-contact-button");
        this.notificationToggle = document.getElementById("notification-toggle");
        this.sharedMediaGrid = document.getElementById("shared-media-grid");
    }

    // --- Elementos do esquema original do chatDomElements.txt (verificar se ainda são necessários e se os IDs/classes existem) ---
    this.chatContainer = document.querySelector(".app-container"); // Classe geral da aplicação
    // this.sidebar = this.chatListSidebar; // Referência para compatibilidade, se necessário
    this.chatArea = this.mainChatContent; // Referência para compatibilidade

    // Estes provavelmente não existem mais com esses IDs/classes exatas no novo HTML
    // ou foram substituídos. Se precisar deles, adicione os IDs/classes corretos ao HTML.
    this.welcomeScreen = document.getElementById("no-chat-placeholder"); // Reaproveitando o placeholder
    this.chatInterface = this.mainChatContent; // O conteúdo principal do chat

    this.userNameElement = document.getElementById("user-name"); // Precisa de ID "user-name" no HTML
    this.userStatusElement = document.getElementById("user-status"); // Precisa de ID "user-status" no HTML
    this.logoutButton = this.navSairButton; // Mapeando para o novo botão de sair

    // this.chatHeader = this.chatAreaHeader; // Mapeado acima
    this.contactName = this.chatRoomTitleMain; // Mapeado acima
    this.contactNumber = document.getElementById("contact-number"); // Precisa de ID "contact-number" no HTML
    this.transferChatButton = document.getElementById("transfer-button"); // Precisa de ID "transfer-button" no HTML
    this.endChatButton = document.getElementById("close-chat-button"); // Precisa de ID "close-chat-button" no HTML

    // this.chatInputControls = this.messageInputArea; // Mapeado acima
    this.attachmentButton = this.attachFileButtonMain; // Mapeado acima
    // this.sendButton = this.sendMessageButton; // Mapeado acima

    this.transferModal = document.getElementById("transfer-modal"); // Precisa de ID "transfer-modal" no HTML
    if (this.transferModal) {
        this.closeModalButton = this.transferModal.querySelector(".close-button"); // Assumindo uma classe comum
        this.sectorsList = document.getElementById("sectors-list-select"); // Precisa de ID "sectors-list-select"
        this.attendantsList = document.getElementById("attendants-list-select"); // Precisa de ID "attendants-list-select"
    }


    this.alertModal = document.getElementById("alert-modal"); // Precisa de ID "alert-modal" no HTML
    if (this.alertModal) {
        this.alertMessage = this.alertModal.querySelector(".alert-message-content"); // Assumindo uma classe
        this.closeAlertButton = this.alertModal.querySelector(".close-button"); // Assumindo uma classe comum
    }

    // this.fileInput // Se tiver um <input type="file"> específico, adicione um ID e selecione aqui.
                      // O attachFileButtonMain já tem um listener que clica em um input de arquivo,
                      // mas esse input não tem um ID explícito no HTML fornecido.
                      // Para agora, deixaremos nulo. Se for o mesmo que o de anexos,
                      // seu script já deve lidar com isso através do clique no botão.

    // Verificar se todos os elementos foram encontrados
    this.validateElements();

    console.log("[ChatDomElements] Elementos DOM inicializados");
    return this;
  },

  validateElements() {
    const missingElements = [];
    // Itera sobre as propriedades do objeto e verifica se são nulas
    for (const key in this) {
      if (this.hasOwnProperty(key) && typeof this[key] !== 'function' && this[key] === null) {
        // Opcional: Adicionar exceções para elementos que são sabidamente opcionais
        // if (key === 'optionalElement') continue;
        missingElements.push(key);
      }
    }

    if (missingElements.length > 0) {
      console.warn("[ChatDomElements] Elementos não encontrados (ou não presentes no HTML atual):", missingElements.join(", "));
    }
  },

  // Mostrar alerta (adaptado do seu original, mas pode ser global)
  showAlert(message, type = "info") {
    console.log(`[ChatDomElements] Mostrando alerta: ${message} (${type})`);
    // Idealmente, esta função seria movida para um utilitário de UI global
    // ou o ChatUiUpdater lidaria com isso.
    if (this.alertModal && this.alertMessage && this.closeAlertButton) {
      this.alertMessage.textContent = message;
      // Adicionar classes de tipo ao alertMessage ou alertModal para estilização
      this.alertModal.className = 'alert-modal-custom show'; // Adicione classes para estilizar
      this.alertModal.classList.add(`alert-${type}`);

      this.alertModal.style.display = "block"; // Ou flex, dependendo do seu CSS

      const closeBtn = this.closeAlertButton;
      const tempCloseHandler = () => {
          this.alertModal.style.display = "none";
          this.alertModal.classList.remove(`alert-${type}`, 'show');
          closeBtn.removeEventListener('click', tempCloseHandler);
      };
      closeBtn.addEventListener('click', tempCloseHandler);

      // Fechar automaticamente após 5 segundos (opcional)
      // setTimeout(tempCloseHandler, 5000);
    } else {
      console.warn("[ChatDomElements] Elementos do modal de alerta não configurados. Usando alert nativo.");
      alert(`${type.toUpperCase()}: ${message}`);
    }
  },

  // Funções createConversationElement e createMessageElement foram movidas para ChatUiUpdater.js
  // onde fazem mais sentido, pois são específicas da atualização da UI.

  // Formatar timestamp (pode ser movido para ChatUtils.js)
  formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const today = new Date();
    if (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    ) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
    }
  },
};