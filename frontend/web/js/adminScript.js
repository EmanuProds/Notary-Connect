// frontend/web/js/adminScript.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("[AdminScript] DOMContentLoaded - Iniciando script principal de administração.");

  const THEME_STORAGE_KEY_ADMIN = 'notaryConnectTheme'; // Mesma chave do localStorage
  const activeSectionTitleElement = document.getElementById('activeSectionTitle');

  // --- INÍCIO: Lógica de Aplicação de Tema ---
  const applyThemeAdmin = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[AdminTheme] Tema aplicado: ${theme}`);

    // Redesenhar QR Code se existir e a biblioteca estiver carregada
    const qrDisplay = document.getElementById("qrDisplay");
    if (qrDisplay && typeof QRCode !== 'undefined' && window.currentQR) {
        console.log("[AdminTheme] applyTheme: Redesenhando QR Code para o novo tema.");
        qrDisplay.innerHTML = ""; 
        try {
            new QRCode(qrDisplay, {
                text: window.currentQR,
                width: 180, 
                height: 180,
                colorDark: theme === 'dark' ? "#eeeeec" : "#000000",
                colorLight: theme === 'dark' ? "#1e1e1e" : "#ffffff", 
                correctLevel: QRCode.CorrectLevel.H,
            });
        } catch (e) {
            console.error("[AdminTheme] applyTheme: Erro ao redesenhar QR Code:", e);
        }
    }
  };
  
  const initializePageThemeAdmin = () => {
    let themeToApply = 'light'; // Padrão se nada for encontrado
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY_ADMIN);
        if (savedTheme) {
            themeToApply = savedTheme;
            console.log(`[AdminTheme] Tema '${savedTheme}' carregado do localStorage.`);
        } else {
            // Se não houver tema salvo, verifica o tema do sistema como fallback inicial
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                themeToApply = 'dark';
            }
            console.log(`[AdminTheme] Nenhum tema salvo no localStorage. Aplicando tema do sistema/padrão: ${themeToApply}.`);
        }
    } catch (e) {
        console.warn("[AdminTheme] Erro ao acessar localStorage, usando tema padrão (light):", e);
        // Fallback para tema claro se localStorage falhar
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            themeToApply = 'dark';
        }
    }
    applyThemeAdmin(themeToApply);

    // Opcional: Ouvir mudanças de tema do sistema APENAS se não houver preferência salva,
    // para que a página reaja se o usuário mudar o tema do S.O. e não tiver escolhido um tema no app.
    // No entanto, como a escolha é feita no index.html, essa parte pode ser desnecessária aqui.
    // Se o usuário mudar o tema do sistema e depois voltar para o index.html, o index.html
    // detectará e salvará a nova preferência do sistema (se não houver uma escolha manual).
  };
  
  initializePageThemeAdmin();
  // --- FIM: Lógica de Aplicação de Tema ---


  const navButtons = document.querySelectorAll(".nav-item");
  const contentSections = document.querySelectorAll(".content-section");
  const qrDisplay = document.getElementById("qrDisplay");
  const qrStatusText = document.getElementById("qrStatusText");
  const botActionsDiv = document.getElementById("botActions");
  const pauseBotBtn = document.getElementById("pauseBotBtn");
  const restartBotBtn = document.getElementById("restartBotBtn");
  const systemStatus = document.getElementById("systemStatus");
  const onlineAttendants = document.getElementById("onlineAttendants");
  const activeConversations = document.getElementById("activeConversations");
  const lastUpdate = document.getElementById("lastUpdate");
  const viewLogsBtn = document.getElementById("viewLogsBtn");
  const openDevToolsBtnAdmin = document.getElementById("openDevToolsBtnAdmin");
  const logoutBtn = document.getElementById("logoutBtn");
  const connectionStatusDiv = document.getElementById("connectionStatus");

  const sessionId = "whatsapp-bot-session";
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/admin-qr`;
  let websocket;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let reconnectTimeout = null;
  const baseReconnectDelay = 3000;
  window.currentQR = null;

  const svgIconSpinner = `<svg class="spinner" viewBox="0 0 50 50" style="width: 60px; height: 60px; stroke: var(--accent-color);"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg>`;
  const svgIconSuccess = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  const svgIconError = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  const svgIconWarning = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--warning-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  function setActiveSection(sectionIdToShow) {
    navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionIdToShow);
    });
    contentSections.forEach((section) => {
      section.classList.toggle("active", section.id === sectionIdToShow);
    });
    const activeButton = document.querySelector(`.nav-item[data-section="${sectionIdToShow}"]`);
    if (activeButton && activeSectionTitleElement) {
        activeSectionTitleElement.textContent = activeButton.textContent.trim();
    } else if (activeSectionTitleElement) {
        activeSectionTitleElement.textContent = "Administração"; 
    }
  }

  function updateBotStatusUI(clientData) {
    if (!qrDisplay || !qrStatusText) {
      console.error("[AdminScript] updateBotStatusUI: Elementos qrDisplay ou qrStatusText não encontrados!");
      return;
    }
    qrStatusText.className = "status-text";
    qrDisplay.innerHTML = "";
    window.currentQR = null;

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const colorDark = currentTheme === 'dark' ? "#eeeeec" : "#000000";
    const colorLight = currentTheme === 'dark' ? "#1e1e1e" : "#ffffff"; 

    if (clientData.status === "QR_CODE") {
      const qrCodeValue = clientData.qrCode || clientData.qr;
      if (qrCodeValue && typeof qrCodeValue === "string" && qrCodeValue.trim() !== "") {
        window.currentQR = qrCodeValue;
        if (typeof QRCode !== 'undefined') {
          try {
            new QRCode(qrDisplay, {
              text: window.currentQR, width: 180, height: 180,
              colorDark: colorDark,
              colorLight: colorLight,
              correctLevel: QRCode.CorrectLevel.H,
            });
            qrStatusText.textContent = "Escaneie o QR Code com o WhatsApp";
            qrStatusText.style.color = "var(--text-secondary-color)";
            if (botActionsDiv) botActionsDiv.style.display = "none";
          } catch (qrError) {
            qrDisplay.innerHTML = svgIconError;
            qrStatusText.textContent = "Falha ao gerar QR Code.";
            qrStatusText.classList.add("error");
          }
        } else {
          qrDisplay.innerHTML = svgIconError;
          qrStatusText.textContent = "Erro: Biblioteca QRCode não carregada.";
          qrStatusText.classList.add("error");
        }
      } else {
        qrDisplay.innerHTML = svgIconWarning; 
        qrStatusText.textContent = "Aguardando QR Code do servidor..."; 
        qrStatusText.classList.add("warning-text"); 
      }
    } else if (clientData.status === "READY" || clientData.status === "CONNECTED") { 
      qrDisplay.innerHTML = svgIconSuccess;
      qrStatusText.textContent = `Robô Conectado! (Celular: ${clientData.jid ? clientData.jid.split('@')[0] : "N/A"})`;
      qrStatusText.classList.remove("error", "warning-text");
      qrStatusText.classList.add("ready");
      if (botActionsDiv) botActionsDiv.style.display = "flex";
      if (typeof clientData.isPaused === "boolean" && pauseBotBtn) {
            const pauseIconHTML = `<img src="./img/icons/pause.svg" alt="Pausar" class="btn-icon-img">`;
            const playIconHTML = `<img src="./img/icons/play.svg" alt="Continuar" class="btn-icon-img">`;
            pauseBotBtn.innerHTML = (clientData.isPaused ? playIconHTML : pauseIconHTML) + `<span>${clientData.isPaused ? "Continuar Robô" : "Pausar Robô"}</span>`;
      }
    } else if (["DISCONNECTED", "AUTH_FAILURE", "FATAL_ERROR", "RESTARTING", "CLEARED_FOR_RESTART"].includes(clientData.status)) {
      qrDisplay.innerHTML = svgIconWarning;
      let statusMessage = `Robô ${clientData.status === "RESTARTING" ? "Reiniciando" : (clientData.status === "CLEARED_FOR_RESTART" ? "Sessão Limpa" : "Desconectado")}`;
      let reasonText = clientData.error ? ` Razão: ${escapeHTML(String(clientData.error))}` : (clientData.reason ? ` Razão: ${escapeHTML(String(clientData.reason))}` : "");
      if (clientData.status === "AUTH_FAILURE") reasonText = " Falha na autenticação.";
      if (clientData.status === "CLEARED_FOR_RESTART") reasonText = " Reinicie o robô para obter novo QR.";
      
      qrStatusText.textContent = statusMessage + reasonText;
      qrStatusText.classList.remove("ready", "warning-text");
      qrStatusText.classList.add("error");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else if (clientData.status) { 
      qrDisplay.innerHTML = svgIconSpinner;
      qrStatusText.textContent = escapeHTML(clientData.status);
      qrStatusText.classList.remove("ready", "error");
      qrStatusText.classList.add("warning-text");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else {
      qrDisplay.innerHTML = svgIconSpinner;
      qrStatusText.textContent = "Aguardando status do robô...";
      qrStatusText.classList.remove("ready", "error");
      qrStatusText.classList.add("warning-text");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    }
    updateSystemInfo({
        status: clientData.status === "READY" || clientData.status === "CONNECTED" ? "Online" : (clientData.status === "QR_CODE" ? "Aguardando QR" : (clientData.status || "Offline")),
        attendants: clientData.status === "READY" || clientData.status === "CONNECTED" ? (Math.floor(Math.random() * 5) + 1) : 0,
        conversations: clientData.status === "READY" || clientData.status === "CONNECTED" ? (Math.floor(Math.random() * 10) + 1) : 0,
    });
  }

  function updateSystemInfo(data) {
    if (systemStatus) systemStatus.textContent = data.status;
    if (onlineAttendants) onlineAttendants.textContent = data.attendants;
    if (activeConversations) activeConversations.textContent = data.conversations;
    if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString();
    if (systemStatus) {
      systemStatus.classList.remove("ready", "error", "warning-text");
      if (data.status === "Online") systemStatus.classList.add("ready");
      else if (["Offline", "FATAL_ERROR", "AUTH_FAILURE"].includes(data.status)) systemStatus.classList.add("error");
      else systemStatus.classList.add("warning-text");
    }
  }

  function updateWebSocketConnectionStatus(statusKey, message = "") {
    if (!connectionStatusDiv) return;
    connectionStatusDiv.className = "connection-status";
    let statusText = "";
    if (statusKey === "connected") { statusText = "Conectado ao Servidor"; connectionStatusDiv.classList.add("connected"); }
    else if (statusKey === "connecting") { statusText = "Conectando..."; connectionStatusDiv.classList.add("connecting"); }
    else if (statusKey === "disconnected") { statusText = "Desconectado"; connectionStatusDiv.classList.add("disconnected"); }
    connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : "");
  }

  function connectWebSocket() {
    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    updateWebSocketConnectionStatus("connecting");
    try {
      websocket = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[AdminScript] connectWebSocket: Erro ao criar WebSocket:", e);
      updateWebSocketConnectionStatus("disconnected", "Erro ao criar WebSocket");
      reconnectWebSocket();
      return;
    }

    websocket.onopen = () => {
      updateWebSocketConnectionStatus("connected");
      reconnectAttempts = 0;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: "request_initial_status", clientType: "admin-qr", sessionId: sessionId }));
      }
    };

    websocket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        console.error("[AdminScript] WebSocket.onmessage: Erro ao parsear JSON:", e, "Dados RAW:", event.data);
        return;
      }
      
      if (data.clientId === sessionId || !data.clientId || data.type === "bot_status_update" || data.type === "status_update" || data.type === "initial_status" || data.type === "qr_code") {
        if ((data.type === "status_update" || data.type === "initial_status" || data.type === "bot_status_update") && data.payload) {
          updateBotStatusUI(data.payload);
        } else if (data.type === "qr_code" && data.payload) {
            const qrString = data.payload.qr || data.payload.qrCode || (typeof data.payload === 'string' ? data.payload : null);
            if (qrString) {
                updateBotStatusUI({ status: "QR_CODE", qrCode: qrString, isPaused: data.payload.isPaused || false });
            } else {
                updateBotStatusUI({ status: "QR_CODE_ERROR", reason: "QR Code não encontrado no payload.", isPaused: data.payload.isPaused || false });
            }
        }
      } 
    };

    websocket.onerror = (errorEvent) => {
      console.error("[AdminScript] WebSocket.onerror: Erro:", errorEvent);
    };

    websocket.onclose = (event) => {
      updateWebSocketConnectionStatus("disconnected", `Código: ${event.code}`);
      if (!event.wasClean && !reconnectTimeout) {
        reconnectWebSocket();
      }
    };
  }

  function reconnectWebSocket() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout); 
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000);
      updateWebSocketConnectionStatus("connecting", `Tentativa ${reconnectAttempts}`);
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null; 
        connectWebSocket();
      }, delay);
    } else {
      updateWebSocketConnectionStatus("disconnected", "Falha ao reconectar");
      if (qrStatusText) qrStatusText.textContent = "Não foi possível reconectar ao servidor.";
      if (qrDisplay) qrDisplay.innerHTML = svgIconError;
    }
  }
  
  function showAlert(message, type = "info", duration = 3500) {
    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) {
        alert(`${type.toUpperCase()}: ${message}`); 
        return;
    }
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`; 
    alertElement.textContent = message;
    
    const existingAlerts = alertContainer.querySelectorAll(`.alert-${type}`);
    existingAlerts.forEach(alert => alert.remove());
    alertContainer.appendChild(alertElement);
    requestAnimationFrame(() => { alertElement.classList.add("show"); });
    setTimeout(() => {
      alertElement.classList.remove("show");
      setTimeout(() => alertElement.remove(), 300); 
    }, duration);
  }

  function init() {
    if (typeof window.electronAPI === 'undefined') {
        console.warn("[AdminScript] init: electronAPI NÃO está disponível.");
        if(openDevToolsBtnAdmin) openDevToolsBtnAdmin.style.display = 'none';
    } else {
        if(openDevToolsBtnAdmin && typeof window.electronAPI.openDevTools === "function") {
            openDevToolsBtnAdmin.style.display = 'flex';
        } else if (openDevToolsBtnAdmin) {
            openDevToolsBtnAdmin.style.display = 'none';
        }
    }


    if (navButtons && navButtons.length > 0) {
        navButtons.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault(); 
                const sectionId = btn.dataset.section;
                if (sectionId) setActiveSection(sectionId);
            });
        });
    }

    if (pauseBotBtn) {
      pauseBotBtn.addEventListener("click", () => {
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          window.electronAPI.sendIpcMessage("control-bot", { action: "pause", sessionId: sessionId });
        } else {
          showAlert("Funcionalidade de controle do bot não disponível.", "warning");
        }
      });
    } 

    if (restartBotBtn) {
      restartBotBtn.addEventListener("click", () => {
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          if (confirm("Tem certeza que deseja reiniciar o robô? Isso exigirá escanear um novo QR code.")) {
            window.electronAPI.sendIpcMessage("control-bot", { action: "restart", sessionId: sessionId });
            if(qrStatusText) qrStatusText.textContent = "Solicitando reinício do robô...";
            if(qrDisplay) qrDisplay.innerHTML = svgIconSpinner;
            if (botActionsDiv) botActionsDiv.style.display = "none";
          }
        } else {
          showAlert("Funcionalidade de controle do bot não disponível.", "warning");
        }
      });
    } 
    
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener("click", () => {
            if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
                window.electronAPI.navigate("logs");
            } else {
                showAlert("Navegação para logs não disponível.", "info");
            }
        });
    } 

    if (openDevToolsBtnAdmin && window.electronAPI && typeof window.electronAPI.openDevTools === "function") {
        openDevToolsBtnAdmin.addEventListener("click", () => {
            window.electronAPI.openDevTools();
        });
    } 
    
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (window.electronAPI) {
                if (typeof window.electronAPI.sendIpcMessage === "function") {
                    window.electronAPI.sendIpcMessage("admin-logout");
                }
                if (typeof window.electronAPI.navigate === "function") {
                    window.electronAPI.navigate("login");
                } else {
                     window.location.href = "login.html"; // Fallback se navigate não estiver no preload
                }
            } else {
                window.location.href = "login.html";
            }
        });
    } 

    setActiveSection("roboSection"); // Define a seção inicial
    connectWebSocket();

    const scriptsToLoad = [
      { id: "adminResponsesScript", src: "./js/adminResponses.js", section: "respostasSection" },
      { id: "adminAttendantsScript", src: "./js/adminAttendants.js", section: "funcionariosSection" },
      { id: "adminConfigScript", src: "./js/adminConfig.js", section: "configuracoesSection" },
      { id: "adminSectorsScript", src: "./js/adminSectors.js", section: "setoresSection" }
    ];

    scriptsToLoad.forEach(scriptInfo => {
        if (!document.getElementById(scriptInfo.id)) { 
            const scriptElement = document.createElement("script");
            scriptElement.id = scriptInfo.id;
            scriptElement.src = scriptInfo.src;
            scriptElement.defer = true; 
            scriptElement.onload = () => console.log(`[AdminScript] init: Script ${scriptInfo.src} carregado.`);
            scriptElement.onerror = () => console.error(`[AdminScript] init: Falha ao carregar ${scriptInfo.src}.`);
            document.body.appendChild(scriptElement);
        }
    });
  }

  if (typeof QRCode === 'undefined') {
    console.warn("[AdminScript] QRCode.js não definido no DOMContentLoaded. Aguardando...");
    let attempts = 0;
    const maxAttempts = 20; 
    const intervalId = setInterval(() => {
        attempts++;
        if (typeof QRCode !== 'undefined') {
            clearInterval(intervalId);
            console.log("[AdminScript] QRCode.js definido após espera. Inicializando.");
            init();
        } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.error("[AdminScript] QRCode.js NÃO definido após espera. Funcionalidade de QR Code PODE SER AFETADA.");
            init(); 
            showAlert("Erro crítico: Biblioteca QRCode não carregada. A exibição do QR Code pode falhar.", "error", 10000);
        }
    }, 100);
  } else {
    console.log("[AdminScript] QRCode.js está definido. Inicializando imediatamente.");
    init();
  }
});
