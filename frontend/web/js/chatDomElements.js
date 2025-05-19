// Elementos DOM para o chat
window.ChatDomElements = {
  // Elementos principais
  chatContainer: null,
  sidebar: null,
  chatArea: null,
  welcomeScreen: null,
  chatInterface: null,

  // Elementos da barra lateral
  searchInput: null,
  conversationsList: null,
  userNameElement: null,
  userStatusElement: null,
  logoutButton: null,

  // Elementos da área de chat
  chatHeader: null,
  contactAvatar: null,
  contactName: null,
  contactNumber: null,
  transferChatButton: null,
  endChatButton: null,
  messagesContainer: null,
  chatInputControls: null,
  attachmentButton: null,
  messageInput: null,
  sendButton: null,

  // Elementos do modal de transferência
  transferModal: null,
  closeModalButton: null,
  sectorsList: null,
  attendantsList: null,

  // Elementos do modal de alerta
  alertModal: null,
  alertMessage: null,
  closeAlertButton: null,

  // Outros elementos
  fileInput: null,

  // Inicializar elementos DOM
  init() {
    console.log("[ChatDomElements] Inicializando elementos DOM")

    // Elementos principais
    this.chatContainer = document.querySelector(".chat-container")
    this.sidebar = document.querySelector(".sidebar")
    this.chatArea = document.querySelector(".chat-area")
    this.welcomeScreen = document.getElementById("welcome-screen")
    this.chatInterface = document.getElementById("chat-interface")

    // Elementos da barra lateral
    this.searchInput = document.getElementById("search-input")
    this.conversationsList = document.getElementById("conversations-list")
    this.userNameElement = document.getElementById("user-name")
    this.userStatusElement = document.getElementById("user-status")
    this.logoutButton = document.getElementById("logout-button")

    // Elementos da área de chat
    this.chatHeader = document.querySelector(".chat-header")
    this.contactAvatar = document.getElementById("contact-avatar")
    this.contactName = document.getElementById("contact-name")
    this.contactNumber = document.getElementById("contact-number")
    this.transferChatButton = document.getElementById("transfer-button")
    this.endChatButton = document.getElementById("close-chat-button")
    this.messagesContainer = document.getElementById("messages-container")
    this.chatInputControls = document.querySelector(".input-area")
    this.attachmentButton = document.getElementById("attachment-button")
    this.messageInput = document.getElementById("message-input")
    this.sendButton = document.getElementById("send-button")

    // Elementos do modal de transferência
    this.transferModal = document.getElementById("transfer-modal")
    this.closeModalButton = document.querySelector(".close-modal")
    this.sectorsList = document.getElementById("sectors-list")
    this.attendantsList = document.getElementById("attendants-list")

    // Elementos do modal de alerta
    this.alertModal = document.getElementById("alert-modal")
    this.alertMessage = document.getElementById("alert-message")
    this.closeAlertButton = document.querySelector(".close-alert")

    // Outros elementos
    this.fileInput = document.getElementById("file-input")

    // Verificar se todos os elementos foram encontrados
    this.validateElements()

    console.log("[ChatDomElements] Elementos DOM inicializados")
    return this
  },

  // Validar se todos os elementos foram encontrados
  validateElements() {
    const missingElements = []

    // Verificar elementos principais
    if (!this.chatContainer) missingElements.push("chatContainer")
    if (!this.sidebar) missingElements.push("sidebar")
    if (!this.chatArea) missingElements.push("chatArea")
    if (!this.welcomeScreen) missingElements.push("welcomeScreen")
    if (!this.chatInterface) missingElements.push("chatInterface")

    // Verificar elementos da barra lateral
    if (!this.searchInput) missingElements.push("searchInput")
    if (!this.conversationsList) missingElements.push("conversationsList")
    if (!this.userNameElement) missingElements.push("userNameElement")
    if (!this.userStatusElement) missingElements.push("userStatusElement")
    if (!this.logoutButton) missingElements.push("logoutButton")

    // Verificar elementos da área de chat
    if (!this.chatHeader) missingElements.push("chatHeader")
    if (!this.contactAvatar) missingElements.push("contactAvatar")
    if (!this.contactName) missingElements.push("contactName")
    if (!this.contactNumber) missingElements.push("contactNumber")
    if (!this.transferChatButton) missingElements.push("transferChatButton")
    if (!this.endChatButton) missingElements.push("endChatButton")
    if (!this.messagesContainer) missingElements.push("messagesContainer")
    if (!this.chatInputControls) missingElements.push("chatInputControls")
    if (!this.attachmentButton) missingElements.push("attachmentButton")
    if (!this.messageInput) missingElements.push("messageInput")
    if (!this.sendButton) missingElements.push("sendButton")

    // Verificar elementos do modal de transferência
    if (!this.transferModal) missingElements.push("transferModal")
    if (!this.closeModalButton) missingElements.push("closeModalButton")
    if (!this.sectorsList) missingElements.push("sectorsList")
    if (!this.attendantsList) missingElements.push("attendantsList")

    // Verificar elementos do modal de alerta
    if (!this.alertModal) missingElements.push("alertModal")
    if (!this.alertMessage) missingElements.push("alertMessage")
    if (!this.closeAlertButton) missingElements.push("closeAlertButton")

    // Verificar outros elementos
    if (!this.fileInput) missingElements.push("fileInput")

    // Reportar elementos ausentes
    if (missingElements.length > 0) {
      console.warn("[ChatDomElements] Elementos não encontrados:", missingElements.join(", "))
    }
  },

  // Mostrar alerta
  showAlert(message, type = "info") {
    console.log(`[ChatDomElements] Mostrando alerta: ${message} (${type})`)

    if (this.alertModal && this.alertMessage) {
      this.alertMessage.textContent = message
      this.alertMessage.className = `alert-message ${type}`
      this.alertModal.classList.add("show")

      // Fechar automaticamente após 5 segundos
      setTimeout(() => {
        this.alertModal.classList.remove("show")
      }, 5000)
    } else {
      // Fallback para alert nativo
      alert(message)
    }
  },

  // Criar elemento de conversa
  createConversationElement(conversation) {
    const conversationElement = document.createElement("div")
    conversationElement.className = "conversation-item"
    conversationElement.dataset.id = conversation.ID

    // Adicionar classe se for a conversa atual
    if (
      window.ChatUiUpdater &&
      window.ChatUiUpdater.currentConversation &&
      window.ChatUiUpdater.currentConversation.ID === conversation.ID
    ) {
      conversationElement.classList.add("active")
    }

    // Adicionar classe se for pendente
    if (conversation.STATUS === "pending") {
      conversationElement.classList.add("pending")
    }

    // Adicionar conteúdo HTML
    conversationElement.innerHTML = `
      <div class="conversation-avatar">
        <img src="${conversation.CLIENT_PROFILE_PIC || "./img/icons/profile.svg"}" alt="Avatar">
      </div>
      <div class="conversation-details">
        <div class="conversation-header">
          <span class="conversation-name">${conversation.CLIENT_NAME || conversation.CLIENT_PHONE || "Cliente"}</span>
          <span class="conversation-time">${this.formatTime(conversation.LAST_MESSAGE_TIME || conversation.UPDATED_AT)}</span>
        </div>
        <div class="conversation-preview">
          <span class="conversation-last-message">${conversation.LAST_MESSAGE || "Sem mensagens"}</span>
          ${conversation.UNREAD_COUNT ? `<span class="unread-badge">${conversation.UNREAD_COUNT}</span>` : ""}
        </div>
        ${
          conversation.STATUS === "pending"
            ? `
          <button class="take-chat-button" data-id="${conversation.ID}">Assumir</button>
        `
            : ""
        }
      </div>
    `

    // Adicionar evento de clique
    conversationElement.addEventListener("click", (e) => {
      // Verificar se o clique foi no botão de assumir
      if (e.target.classList.contains("take-chat-button")) {
        e.stopPropagation()
        if (window.ChatActions) {
          window.ChatActions.takeChat(conversation.ID)
        }
        return
      }

      // Selecionar conversa
      if (window.ChatEventHandlers) {
        window.ChatEventHandlers.selectConversation(conversation.ID)
      }
    })

    return conversationElement
  },

  // Criar elemento de mensagem
  createMessageElement(message, isLocal = false) {
    const messageElement = document.createElement("div")
    messageElement.className = "message"
    messageElement.dataset.id = message.ID || message.id || Date.now()

    // Adicionar classes com base no tipo de remetente
    if (message.SENDER_TYPE === "CLIENT" || message.senderType === "client") {
      messageElement.classList.add("client-message")
    } else if (message.SENDER_TYPE === "AGENT" || message.senderType === "agent") {
      messageElement.classList.add("agent-message")
    } else if (message.SENDER_TYPE === "SYSTEM" || message.senderType === "system") {
      messageElement.classList.add("system-message")
    }

    // Adicionar classe se for mensagem local (ainda não confirmada)
    if (isLocal) {
      messageElement.classList.add("sending")
    }

    // Obter conteúdo da mensagem
    const content = message.MESSAGE_CONTENT || message.CONTENT || message.content || ""

    // Verificar se é mensagem de mídia
    const mediaUrl = message.MEDIA_URL || message.mediaUrl
    let mediaContent = ""

    if (mediaUrl) {
      const mediaType = message.MESSAGE_TYPE || message.messageType || "file"

      switch (mediaType) {
        case "image":
          mediaContent = `<img src="${mediaUrl}" alt="Imagem" class="message-image">`
          break
        case "audio":
          mediaContent = `
            <audio controls class="message-audio">
              <source src="${mediaUrl}" type="audio/mpeg">
              Seu navegador não suporta o elemento de áudio.
            </audio>
          `
          break
        case "video":
          mediaContent = `
            <video controls class="message-video">
              <source src="${mediaUrl}" type="video/mp4">
              Seu navegador não suporta o elemento de vídeo.
            </video>
          `
          break
        default:
          // Arquivo genérico
          mediaContent = `
            <a href="${mediaUrl}" target="_blank" class="file-attachment">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              Baixar arquivo
            </a>
          `
      }
    }

    // Adicionar conteúdo HTML
    messageElement.innerHTML = `
      <div class="message-content">
        ${
          message.SENDER_TYPE === "AGENT" || message.senderType === "agent"
            ? `
          <div class="sender-name">${message.AGENT_NAME || message.agentName || "Atendente"}</div>
        `
            : ""
        }
        ${content}
        ${mediaContent}
      </div>
      <div class="message-time">${this.formatTime(message.TIMESTAMP || message.timestamp)}</div>
    `

    return messageElement
  },

  // Formatar timestamp
  formatTime(timestamp) {
    if (!timestamp) return ""

    const date = new Date(timestamp)

    // Verificar se é uma data válida
    if (isNaN(date.getTime())) return ""

    // Verificar se é hoje
    const today = new Date()
    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()

    if (isToday) {
      // Formato de hora para hoje
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } else {
      // Formato de data para outros dias
      return date.toLocaleDateString([], { day: "2-digit", month: "2-digit" })
    }
  },
}
