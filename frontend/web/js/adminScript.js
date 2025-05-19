document.addEventListener("DOMContentLoaded", () => {
  console.log("[AdminScript] Initializing admin interface...")

  // Navigation elements
  const navButtons = document.querySelectorAll(".nav-item")
  const contentSections = document.querySelectorAll(".content-section")

  // QR code elements
  const qrDisplay = document.getElementById("qrDisplay")
  const qrStatusText = document.getElementById("qrStatusText")
  const botActionsDiv = document.getElementById("botActions")
  const pauseBotBtn = document.getElementById("pauseBotBtn")
  const restartBotBtn = document.getElementById("restartBotBtn")

  // System info elements
  const systemStatus = document.getElementById("systemStatus")
  const onlineAttendants = document.getElementById("onlineAttendants")
  const activeConversations = document.getElementById("activeConversations")
  const lastUpdate = document.getElementById("lastUpdate")

  // Footer buttons
  const viewLogsBtn = document.getElementById("viewLogsBtn")
  const openDevToolsBtnAdmin = document.getElementById("openDevToolsBtnAdmin")
  const logoutBtn = document.getElementById("logoutBtn")

  // Connection status
  const connectionStatusDiv = document.getElementById("connectionStatus")

  // Session and WebSocket variables
  const sessionId = "whatsapp-bot-session"
  const wsUrl = `ws://localhost:3000/admin-qr`
  let websocket
  let reconnectAttempts = 0
  const maxReconnectAttempts = 10
  let reconnectTimeout = null
  const baseReconnectDelay = 3000

  // Icons for QR status
  const svgIconSpinner = `
        <svg class="spinner" viewBox="0 0 50 50">
            <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
    `

  const svgIconSuccess = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="80" height="80">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
    `

  const svgIconError = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="80" height="80">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
    `

  const svgIconWarning = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f39c12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="80" height="80">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    `

  // Helper function to escape HTML
  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str)
    return str.replace(
      /[&<>"']/g,
      (match) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[match],
    )
  }

  // Set active section
  function setActiveSection(sectionIdToShow) {
    console.log(`[AdminScript] Activating section: ${sectionIdToShow}`)

    navButtons.forEach((btn) => {
      if (btn.dataset.section === sectionIdToShow) {
        btn.classList.add("active")
      } else {
        btn.classList.remove("active")
      }
    })

    contentSections.forEach((section) => {
      if (section.id === sectionIdToShow) {
        section.classList.add("active")
      } else {
        section.classList.remove("active")
      }
    })
  }

  // Update bot status UI
  function updateBotStatusUI(clientData) {
    if (!qrDisplay || !qrStatusText) {
      console.error("[AdminScript] QR display elements not found!")
      return
    }

    console.log("[AdminScript] Updating bot status UI:", clientData)
    qrStatusText.className = "qr-status"
    qrDisplay.innerHTML = ""

    if (clientData.status === "QR_CODE") {
      if (clientData.qrCode && typeof clientData.qrCode === "string" && clientData.qrCode.trim() !== "") {
        try {
          // Clear previous QR code
          qrDisplay.innerHTML = ""

          // Create new QR code
          const QRCode = window.QRCode // Declare QRCode variable
          new QRCode(qrDisplay, {
            text: clientData.qrCode,
            width: 180,
            height: 180,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H,
          })

          qrStatusText.textContent = "Escaneie o QR Code com o WhatsApp"
          qrStatusText.style.color = "var(--primary-color)"

          if (botActionsDiv) botActionsDiv.style.display = "none"

          // Update system info
          updateSystemInfo({
            status: "Aguardando QR Code",
            attendants: 0,
            conversations: 0,
          })
        } catch (qrError) {
          console.error("[AdminScript] Error generating QR code:", qrError)
          qrDisplay.innerHTML = svgIconError
          qrStatusText.textContent = "Falha ao gerar QR Code"
          qrStatusText.classList.add("error")
        }
      } else {
        qrDisplay.innerHTML = svgIconWarning
        qrStatusText.textContent = "QR Code inválido"
        qrStatusText.classList.add("error")
      }
    } else if (clientData.status === "READY") {
      qrDisplay.innerHTML = svgIconSuccess
      qrStatusText.textContent = `Robô Conectado! (JID: ${clientData.jid || "N/A"})`
      qrStatusText.classList.add("ready")

      if (botActionsDiv) botActionsDiv.style.display = "flex"

      // Update system info
      updateSystemInfo({
        status: "Online",
        attendants: Math.floor(Math.random() * 5) + 1, // Simulated data
        conversations: Math.floor(Math.random() * 10) + 1, // Simulated data
      })
    } else if (
      clientData.status === "DISCONNECTED" ||
      clientData.status === "AUTH_FAILURE" ||
      clientData.status === "FATAL_ERROR" ||
      clientData.status === "RESTARTING"
    ) {
      qrDisplay.innerHTML = svgIconWarning

      const statusMessage = `Robô ${clientData.status === "RESTARTING" ? "Reiniciando" : "Desconectado"}`
      let reasonText = clientData.error
        ? ` Razão: ${escapeHTML(String(clientData.error))}`
        : clientData.reason
          ? ` Razão: ${escapeHTML(String(clientData.reason))}`
          : ""

      if (clientData.status === "AUTH_FAILURE") {
        reasonText = " Falha na autenticação. Verifique o WhatsApp."
      }

      qrStatusText.textContent = statusMessage + reasonText
      qrStatusText.classList.add("error")

      if (botActionsDiv) botActionsDiv.style.display = "none"

      // Update system info
      updateSystemInfo({
        status: "Offline",
        attendants: 0,
        conversations: 0,
      })
    } else if (clientData.status) {
      qrDisplay.innerHTML = svgIconSpinner
      qrStatusText.textContent = escapeHTML(clientData.status)

      if (botActionsDiv) botActionsDiv.style.display = "none"
    } else {
      qrDisplay.innerHTML = svgIconSpinner
      qrStatusText.textContent = "Aguardando status do robô..."

      if (botActionsDiv) botActionsDiv.style.display = "none"
    }
  }

  // Update system info
  function updateSystemInfo(data) {
    if (systemStatus) systemStatus.textContent = data.status
    if (onlineAttendants) onlineAttendants.textContent = data.attendants
    if (activeConversations) activeConversations.textContent = data.conversations
    if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString()

    // Set status color
    if (systemStatus) {
      if (data.status === "Online") {
        systemStatus.style.color = "var(--success-color)"
      } else if (data.status === "Offline") {
        systemStatus.style.color = "var(--danger-color)"
      } else {
        systemStatus.style.color = "var(--warning-color)"
      }
    }
  }

  // Update WebSocket connection status
  function updateWebSocketConnectionStatus(statusKey, message = "") {
    if (!connectionStatusDiv) return

    connectionStatusDiv.className = "connection-status"
    let statusText = ""

    if (statusKey === "connected") {
      statusText = "Conectado ao Servidor WebSocket"
      connectionStatusDiv.classList.add("connected")
    } else if (statusKey === "connecting") {
      statusText = "Conectando ao Servidor WebSocket..."
      // Default warning color
    } else if (statusKey === "disconnected") {
      statusText = "Desconectado do Servidor WebSocket"
      connectionStatusDiv.classList.add("disconnected")
    }

    connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : "")
  }

  // Connect to WebSocket
  function connectWebSocket() {
    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      console.log("[AdminScript] WebSocket already connected or connecting")
      return
    }

    updateWebSocketConnectionStatus("connecting")
    console.log(`[AdminScript] Connecting to WebSocket at ${wsUrl}`)

    try {
      websocket = new WebSocket(wsUrl)
    } catch (e) {
      console.error("[AdminScript] Error creating WebSocket:", e)
      updateWebSocketConnectionStatus("disconnected", "Error creating WebSocket")
      reconnectWebSocket()
      return
    }

    websocket.onopen = () => {
      console.log("[AdminScript] WebSocket connection opened")
      updateWebSocketConnectionStatus("connected")
      reconnectAttempts = 0

      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = null

      if (websocket.readyState === WebSocket.OPEN) {
        console.log("[AdminScript] Requesting initial status")
        websocket.send(
          JSON.stringify({
            type: "request_initial_status",
            clientType: "admin-qr",
            sessionId: sessionId,
          }),
        )
      }
    }

    websocket.onmessage = (event) => {
      console.log("[AdminScript] WebSocket message received:", String(event.data).substring(0, 250))

      let data
      try {
        data = JSON.parse(event.data)
      } catch (e) {
        console.error("[AdminScript] Error parsing WebSocket message:", e)
        return
      }

      if (data.clientId === sessionId || !data.clientId || data.type === "bot_status_update") {
        console.log("[AdminScript] Processing message for bot:", data.type)

        if (
          (data.type === "status_update" || data.type === "initial_status" || data.type === "bot_status_update") &&
          data.payload
        ) {
          updateBotStatusUI(data.payload)

          if (typeof data.payload.isPaused === "boolean" && pauseBotBtn) {
            const pauseIcon = `
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="6" y="4" width="4" height="16"></rect>
                                <rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                        `

            const playIcon = `
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        `

            pauseBotBtn.innerHTML =
              (data.payload.isPaused ? playIcon : pauseIcon) +
              `<span>${data.payload.isPaused ? "Continuar Bot" : "Pausar Bot"}</span>`
          }
        } else if (data.type === "qr_code" && data.payload) {
          updateBotStatusUI({
            status: "QR_CODE",
            qrCode: data.payload.qr || data.payload.qrCode || data.payload,
          })
        }
      }
    }

    websocket.onerror = (errorEvent) => {
      console.error("[AdminScript] WebSocket error:", errorEvent)
    }

    websocket.onclose = (event) => {
      console.log(`[AdminScript] WebSocket connection closed. Code=${event.code}, Clean=${event.wasClean}`)
      updateWebSocketConnectionStatus("disconnected", `Code: ${event.code}`)

      if (!event.wasClean && !reconnectTimeout) {
        reconnectWebSocket()
      }
    }
  }

  // Reconnect WebSocket
  function reconnectWebSocket() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout)

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++
      const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000)

      updateWebSocketConnectionStatus("connecting", `Attempt ${reconnectAttempts}`)

      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        connectWebSocket()
      }, delay)
    } else {
      updateWebSocketConnectionStatus("disconnected", "Failed to reconnect")

      if (qrStatusText) qrStatusText.textContent = "Could not reconnect to server"
      if (qrDisplay) qrDisplay.innerHTML = svgIconError
    }
  }

  // Initialize
  function init() {
    // Set up navigation
    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const sectionId = btn.dataset.section
        if (sectionId) {
          setActiveSection(sectionId)
        }
      })
    })

    // Set up bot control buttons
    if (pauseBotBtn) {
      pauseBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] Pause/Resume button clicked")

        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          window.electronAPI.sendIpcMessage("control-bot", {
            action: "pause",
            sessionId: sessionId,
          })
        } else {
          console.error("[AdminScript] electronAPI.sendIpcMessage not available")
        }
      })
    }

    if (restartBotBtn) {
      restartBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] Restart button clicked")

        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          if (confirm("Are you sure you want to restart the bot? This will require scanning a new QR code.")) {
            window.electronAPI.sendIpcMessage("control-bot", {
              action: "restart",
              sessionId: sessionId,
            })

            qrStatusText.textContent = "Requesting bot restart..."
            qrDisplay.innerHTML = svgIconSpinner

            if (botActionsDiv) botActionsDiv.style.display = "none"
          }
        } else {
          console.error("[AdminScript] electronAPI.sendIpcMessage not available")
        }
      })
    }

    // Set up footer buttons
    if (viewLogsBtn && window.electronAPI && typeof window.electronAPI.navigate === "function") {
      viewLogsBtn.addEventListener("click", () => {
        window.electronAPI.navigate("logs")
      })
    }

    if (openDevToolsBtnAdmin && window.electronAPI && typeof window.electronAPI.openDevTools === "function") {
      openDevToolsBtnAdmin.addEventListener("click", () => {
        window.electronAPI.openDevTools()
      })
    }

    if (logoutBtn && window.electronAPI && typeof window.electronAPI.navigate === "function") {
      logoutBtn.addEventListener("click", () => {
        if (window.electronAPI.sendIpcMessage) {
          window.electronAPI.sendIpcMessage("admin-logout")
        }
        window.electronAPI.navigate("login")
      })
    }

    // Set default active section
    setActiveSection("roboSection")

    // Connect to WebSocket
    connectWebSocket()

    console.log("[AdminScript] Initialization complete")

    // Carregar scripts adicionais para as abas
    const scriptsToLoad = [
      { id: "adminResponsesScript", src: "./js/adminResponses.js" },
      { id: "adminAttendantsScript", src: "./js/adminAttendants.js" },
      { id: "adminConfigScript", src: "./js/adminConfig.js" },
    ]

    scriptsToLoad.forEach((script) => {
      if (!document.getElementById(script.id)) {
        const scriptElement = document.createElement("script")
        scriptElement.id = script.id
        scriptElement.src = script.src

        // Verifique se o arquivo existe e tem conteúdo.
        fetch(scriptElement.src, { method: "HEAD" })
          .then((response) => {
            if (response.ok) {
              document.body.appendChild(scriptElement)
            } else {
              console.warn(`Script ${script.src} not found or is empty.`)
            }
          })
          .catch((error) => {
            console.error(`Error checking script ${script.src}:`, error)
          })
      }
    })
  }

  // Start initialization
  init()
})
