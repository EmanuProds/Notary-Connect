// frontend/web/js/adminScript.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("[AdminScript] DOMContentLoaded - Iniciando script principal de administração.");

  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => {
    console.log(`[AdminTheme] applyTheme: Aplicando tema '${theme}'.`);
    document.documentElement.setAttribute('data-theme', theme);
    const qrDisplay = document.getElementById("qrDisplay");
    if (qrDisplay && qrDisplay.querySelector('canvas') && typeof QRCode !== 'undefined') {
        if (window.currentQR) {
            console.log("[AdminTheme] applyTheme: Redesenhando QR Code para o novo tema.");
            qrDisplay.innerHTML = ""; 
            try {
                new QRCode(qrDisplay, {
                    text: window.currentQR,
                    width: 180,
                    height: 180,
                    colorDark: theme === 'dark' ? "#eeeeec" : "#000000",
                    colorLight: theme === 'dark' ? "#2c2c2c" : "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H,
                });
                console.log("[AdminTheme] applyTheme: QR Code redesenhado com sucesso.");
            } catch (e) {
                console.error("[AdminTheme] applyTheme: Erro ao redesenhar QR Code:", e);
            }
        } else {
            // console.log("[AdminTheme] applyTheme: window.currentQR não definido, não redesenhando QR Code.");
        }
    } else if (qrDisplay && typeof QRCode === 'undefined') {
        console.warn("[AdminTheme] applyTheme: Biblioteca QRCode não definida.");
    }
  };

  const checkSystemTheme = () => {
    // console.log("[AdminTheme] checkSystemTheme: Verificando tema do sistema.");
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  };

  checkSystemTheme();

  if (window.matchMedia) {
    // console.log("[AdminTheme] Adicionando listener para mudanças de tema do sistema.");
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      console.log("[AdminTheme] Preferência de tema do sistema alterada.");
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  // console.log("[AdminScript] Referenciando elementos do DOM...");
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

  // console.log("[AdminScript] Elementos do DOM referenciados.");

  const sessionId = "whatsapp-bot-session";
  const wsUrl = `ws://${window.location.host}/admin-qr`;
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
    // console.log(`[AdminScript] setActiveSection: Ativando seção '${sectionIdToShow}'.`);
    navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionIdToShow);
    });
    contentSections.forEach((section) => {
      section.classList.toggle("active", section.id === sectionIdToShow);
    });
    // console.log(`[AdminScript] setActiveSection: Seção '${sectionIdToShow}' ativada.`);
  }

  function updateBotStatusUI(clientData) {
    console.log("[AdminScript] updateBotStatusUI: Chamada com clientData:", JSON.stringify(clientData).substring(0, 200) + "...");
    if (!qrDisplay || !qrStatusText) {
      console.error("[AdminScript] updateBotStatusUI: Elementos qrDisplay ou qrStatusText não encontrados!");
      return;
    }
    qrStatusText.className = "status-text";
    qrDisplay.innerHTML = "";
    window.currentQR = null;

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const colorDark = currentTheme === 'dark' ? "#eeeeec" : "#000000";
    const colorLight = currentTheme === 'dark' ? "#2c2c2c" : "#ffffff";

    if (clientData.status === "QR_CODE") {
      const qrCodeValue = clientData.qrCode || clientData.qr;
      console.log("[AdminScript] updateBotStatusUI: Status é QR_CODE. Valor:", qrCodeValue ? "Recebido" : "NULO/VAZIO");
      if (qrCodeValue && typeof qrCodeValue === "string" && qrCodeValue.trim() !== "") {
        window.currentQR = qrCodeValue;
        if (typeof QRCode !== 'undefined') {
          try {
            console.log("[AdminScript] updateBotStatusUI: Gerando novo QR Code...");
            new QRCode(qrDisplay, {
              text: window.currentQR, width: 180, height: 180,
              colorDark: colorDark,
              colorLight: colorLight,
              correctLevel: QRCode.CorrectLevel.H,
            });
            qrStatusText.textContent = "Escaneie o QR Code com o WhatsApp";
            qrStatusText.style.color = "var(--text-secondary-color)";
            if (botActionsDiv) botActionsDiv.style.display = "none";
            console.log("[AdminScript] updateBotStatusUI: QR Code gerado.");
          } catch (qrError) {
            console.error("[AdminScript] updateBotStatusUI: Erro ao gerar QR code:", qrError);
            qrDisplay.innerHTML = svgIconError;
            qrStatusText.textContent = "Falha ao gerar QR Code.";
            qrStatusText.classList.add("error");
          }
        } else {
          console.error("[AdminScript] updateBotStatusUI: Biblioteca QRCode não definida!");
          qrDisplay.innerHTML = svgIconError;
          qrStatusText.textContent = "Erro: Biblioteca QRCode não carregada.";
          qrStatusText.classList.add("error");
        }
      } else {
        console.warn("[AdminScript] updateBotStatusUI: QR Code string inválida ou não fornecida. Payload:", clientData);
        qrDisplay.innerHTML = svgIconWarning; // Ícone de aviso
        qrStatusText.textContent = "Aguardando QR Code do servidor..."; // Mensagem mais informativa
        qrStatusText.classList.add("warning-text"); // Classe para estilização
      }
    } else if (clientData.status === "READY" || clientData.status === "CONNECTED") { // Tratar ambos os status como conectado
      console.log("[AdminScript] updateBotStatusUI: Status é READY/CONNECTED. JID:", clientData.jid);
      qrDisplay.innerHTML = svgIconSuccess;
      qrStatusText.textContent = `Robô Conectado! (Celular: ${clientData.jid ? clientData.jid.split('@')[0] : "N/A"})`;
      qrStatusText.classList.remove("error", "warning-text");
      qrStatusText.classList.add("ready");
      if (botActionsDiv) botActionsDiv.style.display = "flex";
      // Atualizar botão de pausa
      if (typeof clientData.isPaused === "boolean" && pauseBotBtn) {
            const pauseIconHTML = `<img src="./img/icons/pause.svg" alt="Pausar" class="btn-icon-img" onerror="this.parentElement.querySelector('.fa-icon.fa-pause').style.display='inline-block'; this.style.display='none';"><i class="fas fa-pause fa-icon" style="display:none;"></i>`;
            const playIconHTML = `<img src="./img/icons/play.svg" alt="Continuar" class="btn-icon-img" onerror="this.parentElement.querySelector('.fa-icon.fa-play').style.display='inline-block'; this.style.display='none';"><i class="fas fa-play fa-icon" style="display:none;"></i>`;
            pauseBotBtn.innerHTML = (clientData.isPaused ? playIconHTML : pauseIconHTML) + `<span>${clientData.isPaused ? "Continuar Robô" : "Pausar Robô"}</span>`;
            console.log("[AdminScript] updateBotStatusUI: Botão de pausa atualizado. isPaused:", clientData.isPaused);
      }
    } else if (["DISCONNECTED", "AUTH_FAILURE", "FATAL_ERROR", "RESTARTING", "CLEARED_FOR_RESTART"].includes(clientData.status)) {
      console.warn(`[AdminScript] updateBotStatusUI: Status do bot: ${clientData.status}. Razão: ${clientData.reason || clientData.error || 'N/A'}`);
      qrDisplay.innerHTML = svgIconWarning;
      let statusMessage = `Robô ${clientData.status === "RESTARTING" ? "Reiniciando" : (clientData.status === "CLEARED_FOR_RESTART" ? "Sessão Limpa" : "Desconectado")}`;
      let reasonText = clientData.error ? ` Razão: ${escapeHTML(String(clientData.error))}` : (clientData.reason ? ` Razão: ${escapeHTML(String(clientData.reason))}` : "");
      if (clientData.status === "AUTH_FAILURE") reasonText = " Falha na autenticação.";
      if (clientData.status === "CLEARED_FOR_RESTART") reasonText = " Reinicie o robô para obter novo QR.";
      
      qrStatusText.textContent = statusMessage + reasonText;
      qrStatusText.classList.remove("ready", "warning-text");
      qrStatusText.classList.add("error");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else if (clientData.status) { // Outros status (AUTHENTICATED, LOADING_SCREEN, etc.)
      console.log(`[AdminScript] updateBotStatusUI: Status intermediário do bot: ${clientData.status}`);
      qrDisplay.innerHTML = svgIconSpinner;
      qrStatusText.textContent = escapeHTML(clientData.status);
      qrStatusText.classList.remove("ready", "error");
      qrStatusText.classList.add("warning-text");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else {
      console.log("[AdminScript] updateBotStatusUI: Status do bot desconhecido ou não fornecido. Payload:", clientData);
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
    console.log("[AdminScript] updateBotStatusUI: UI do status do bot atualizada.");
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
    // console.log(`[AdminScript] updateWebSocketConnectionStatus: Status: ${statusKey}, Mensagem: ${message}`);
    if (!connectionStatusDiv) return;
    connectionStatusDiv.className = "connection-status";
    let statusText = "";
    if (statusKey === "connected") { statusText = "Conectado ao Servidor"; connectionStatusDiv.classList.add("connected"); }
    else if (statusKey === "connecting") { statusText = "Conectando..."; connectionStatusDiv.classList.add("connecting"); }
    else if (statusKey === "disconnected") { statusText = "Desconectado"; connectionStatusDiv.classList.add("disconnected"); }
    connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : "");
    // console.log(`[AdminScript] updateWebSocketConnectionStatus: Status da conexão WebSocket atualizado para '${statusText}'.`);
  }

  function connectWebSocket() {
    console.log("[AdminScript] connectWebSocket: Tentando conectar WebSocket.");
    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      console.log("[AdminScript] connectWebSocket: WebSocket já conectado ou conectando.");
      return;
    }
    updateWebSocketConnectionStatus("connecting");
    console.log(`[AdminScript] connectWebSocket: Conectando a ${wsUrl}`);
    try {
      websocket = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[AdminScript] connectWebSocket: Erro ao criar WebSocket:", e);
      updateWebSocketConnectionStatus("disconnected", "Erro ao criar WebSocket");
      reconnectWebSocket();
      return;
    }

    websocket.onopen = () => {
      console.log("[AdminScript] WebSocket.onopen: Conexão aberta.");
      updateWebSocketConnectionStatus("connected");
      reconnectAttempts = 0;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
      if (websocket.readyState === WebSocket.OPEN) {
        console.log("[AdminScript] WebSocket.onopen: Solicitando status inicial para o bot:", sessionId);
        websocket.send(JSON.stringify({ type: "request_initial_status", clientType: "admin-qr", sessionId: sessionId }));
      }
    };

    websocket.onmessage = (event) => {
      const rawData = event.data;
      console.log("[AdminScript] WebSocket.onmessage: MENSAGEM BRUTA RECEBIDA DO SERVIDOR:", rawData ? rawData.substring(0,300) + "..." : "N/A");

      let data;
      try {
        data = JSON.parse(rawData);
        console.log("[AdminScript] WebSocket.onmessage: Mensagem parseada:", data);
      } catch (e) {
        console.error("[AdminScript] WebSocket.onmessage: Erro ao parsear JSON:", e, "Dados RAW:", rawData);
        return;
      }
      
      console.log(`[AdminScript] WebSocket.onmessage: Verificando condição de processamento - data.clientId: ${data.clientId}, sessionId: ${sessionId}, data.type: ${data.type}`);

      if (data.clientId === sessionId || !data.clientId || data.type === "bot_status_update" || data.type === "status_update" || data.type === "initial_status" || data.type === "qr_code") {
        console.log("[AdminScript] WebSocket.onmessage: Processando mensagem para o bot. Tipo:", data.type, "Payload:", data.payload);
        
        if ((data.type === "status_update" || data.type === "initial_status" || data.type === "bot_status_update") && data.payload) {
          console.log("[AdminScript] WebSocket.onmessage: Chamando updateBotStatusUI para status_update/initial_status/bot_status_update.");
          updateBotStatusUI(data.payload); // Já lida com isPaused internamente
        } else if (data.type === "qr_code" && data.payload) {
            console.log("[AdminScript] WebSocket.onmessage: Chamando updateBotStatusUI para qr_code.");
            const qrString = data.payload.qr || data.payload.qrCode || (typeof data.payload === 'string' ? data.payload : null);
            if (qrString) {
                updateBotStatusUI({ status: "QR_CODE", qrCode: qrString, isPaused: data.payload.isPaused || false });
            } else {
                updateBotStatusUI({ status: "QR_CODE_ERROR", reason: "QR Code não encontrado no payload.", isPaused: data.payload.isPaused || false });
            }
        } else {
            console.warn("[AdminScript] WebSocket.onmessage: Tipo de mensagem ou payload não reconhecido para UI:", data);
        }
      } else {
        console.log("[AdminScript] WebSocket.onmessage: Mensagem recebida para um clientId diferente ou tipo não relevante para este admin. Ignorando. Dados:", data);
      }
    };

    websocket.onerror = (errorEvent) => {
      console.error("[AdminScript] WebSocket.onerror: Erro:", errorEvent);
    };

    websocket.onclose = (event) => {
      console.log(`[AdminScript] WebSocket.onclose: Conexão fechada. Código=${event.code}, Limpa=${event.wasClean}, Razão: ${event.reason}`);
      updateWebSocketConnectionStatus("disconnected", `Código: ${event.code}`);
      if (!event.wasClean && !reconnectTimeout) {
        reconnectWebSocket();
      }
    };
    // console.log("[AdminScript] connectWebSocket: Handlers do WebSocket configurados.");
  }

  function reconnectWebSocket() {
    // console.log("[AdminScript] reconnectWebSocket: Iniciando tentativa de reconexão.");
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000);
      updateWebSocketConnectionStatus("connecting", `Tentativa ${reconnectAttempts}`);
      console.log(`[AdminScript] reconnectWebSocket: Tentando em ${delay / 1000}s (Tentativa ${reconnectAttempts}/${maxReconnectAttempts})`);
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectWebSocket();
      }, delay);
    } else {
      console.error("[AdminScript] reconnectWebSocket: Máximo de tentativas atingido.");
      updateWebSocketConnectionStatus("disconnected", "Falha ao reconectar");
      if (qrStatusText) qrStatusText.textContent = "Não foi possível reconectar ao servidor.";
      if (qrDisplay) qrDisplay.innerHTML = svgIconError;
    }
  }
  
  function showAlert(message, type = "info", duration = 3500) {
    console.log(`[AdminScript] showAlert: Tipo: ${type}, Mensagem: ${message}`);
    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) {
        console.warn("[AdminScript] showAlert: Elemento alertContainer não encontrado.");
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
    console.log("[AdminScript] init: Iniciando UI de administração.");
    if (typeof window.electronAPI !== 'undefined') {
        // console.log("[AdminScript] init: electronAPI está disponível. Métodos:", Object.keys(window.electronAPI));
    } else {
        console.warn("[AdminScript] init: electronAPI NÃO está disponível.");
    }

    if (!navButtons || navButtons.length === 0) {
        console.error("[AdminScript] init: Botões de navegação (.nav-item) não encontrados.");
    } else {
        navButtons.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const sectionId = btn.dataset.section;
                // console.log(`[AdminScript] init: Botão de navegação '${sectionId}' clicado.`);
                if (sectionId) setActiveSection(sectionId);
            });
        });
        // console.log("[AdminScript] init: Listeners de navegação configurados.");
    }

    if (pauseBotBtn) {
      pauseBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] init: Botão Pausar/Continuar clicado.");
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          console.log("[AdminScript] init: Enviando 'control-bot' action: 'pause'");
          window.electronAPI.sendIpcMessage("control-bot", { action: "pause", sessionId: sessionId });
        } else {
          showAlert("Funcionalidade de controle do bot não disponível.", "warning");
          console.error("[AdminScript] init: electronAPI.sendIpcMessage não disponível (pauseBotBtn).");
        }
      });
    } else { console.warn("[AdminScript] init: Botão 'pauseBotBtn' não encontrado."); }

    if (restartBotBtn) {
      restartBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] init: Botão Reiniciar clicado.");
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          if (confirm("Tem certeza que deseja reiniciar o robô? Isso exigirá escanear um novo QR code.")) {
            console.log("[AdminScript] init: Enviando 'control-bot' action: 'restart'");
            window.electronAPI.sendIpcMessage("control-bot", { action: "restart", sessionId: sessionId });
            if(qrStatusText) qrStatusText.textContent = "Solicitando reinício do robô...";
            if(qrDisplay) qrDisplay.innerHTML = svgIconSpinner;
            if (botActionsDiv) botActionsDiv.style.display = "none";
          }
        } else {
          showAlert("Funcionalidade de controle do bot não disponível.", "warning");
          console.error("[AdminScript] init: electronAPI.sendIpcMessage não disponível (restartBotBtn).");
        }
      });
    } else { console.warn("[AdminScript] init: Botão 'restartBotBtn' não encontrado."); }
    
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener("click", () => {
            // console.log("[AdminScript] init: Botão Ver Logs clicado.");
            if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
                window.electronAPI.navigate("logs");
            } else {
                showAlert("Navegação para logs não disponível.", "info");
                console.warn("[AdminScript] init: electronAPI.navigate não disponível (viewLogsBtn).");
            }
        });
    } else { console.warn("[AdminScript] init: Botão 'viewLogsBtn' não encontrado."); }

    if (openDevToolsBtnAdmin) {
        openDevToolsBtnAdmin.addEventListener("click", () => {
            console.log("[AdminScript] init: Botão Abrir DevTools clicado.");
            if (window.electronAPI && typeof window.electronAPI.openDevTools === "function") {
                window.electronAPI.openDevTools();
            } else {
                showAlert("Ferramentas de desenvolvedor não disponíveis.", "info");
                console.warn("[AdminScript] init: electronAPI.openDevTools não disponível (openDevToolsBtnAdmin).");
            }
        });
    } else { console.warn("[AdminScript] init: Botão 'openDevToolsBtnAdmin' não encontrado."); }
    
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            // console.log("[AdminScript] init: Botão Sair clicado.");
            if (window.electronAPI) {
                if (typeof window.electronAPI.sendIpcMessage === "function") {
                    window.electronAPI.sendIpcMessage("admin-logout");
                } else { console.warn("[AdminScript] init: electronAPI.sendIpcMessage não disponível para logout.");}
                if (typeof window.electronAPI.navigate === "function") {
                    window.electronAPI.navigate("login");
                } else {
                     console.warn("[AdminScript] init: electronAPI.navigate não disponível, usando fallback para logout.");
                     window.location.href = "index.html";
                }
            } else {
                console.warn("[AdminScript] init: electronAPI não disponível, usando fallback para logout.");
                window.location.href = "index.html";
            }
        });
    } else { console.warn("[AdminScript] init: Botão 'logoutBtn' não encontrado."); }

    setActiveSection("roboSection");
    connectWebSocket();
    // console.log("[AdminScript] init: Inicialização da UI e WebSocket concluída.");

    const scriptsToLoad = [
      { id: "adminResponsesScript", src: "./js/adminResponses.js", section: "respostasSection" },
      { id: "adminAttendantsScript", src: "./js/adminAttendants.js", section: "funcionariosSection" },
      { id: "adminConfigScript", src: "./js/adminConfig.js", section: "configuracoesSection" },
      { id: "adminSectorsScript", src: "./js/adminSectors.js", section: "setoresSection" }
    ];

    // console.log("[AdminScript] init: Carregando scripts adicionais para as abas...");
    scriptsToLoad.forEach(scriptInfo => {
        if (!document.getElementById(scriptInfo.id)) {
            const scriptElement = document.createElement("script");
            scriptElement.id = scriptInfo.id;
            scriptElement.src = scriptInfo.src;
            scriptElement.defer = true; // defer para garantir que o DOM esteja pronto quando eles executarem sua IIFE
            scriptElement.onload = () => console.log(`[AdminScript] init: Script ${scriptInfo.src} carregado.`);
            scriptElement.onerror = () => console.error(`[AdminScript] init: Falha ao carregar ${scriptInfo.src}.`);
            document.body.appendChild(scriptElement);
            // console.log(`[AdminScript] init: Script ${scriptInfo.src} adicionado para carregamento.`);
        } else {
            // console.log(`[AdminScript] init: Script ${scriptInfo.src} já presente.`);
        }
    });
    // console.log("[AdminScript] init: Função init concluída.");
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
            console.error("[AdminScript] QRCode.js NÃO definido após espera. Funcionalidade de QR Code AFETADA.");
            init(); 
            showAlert("Erro crítico: Biblioteca QRCode não carregada. QR Code falhará.", "error", 10000);
        }
    }, 100);
  } else {
    console.log("[AdminScript] QRCode.js está definido. Inicializando imediatamente.");
    init();
  }
  // console.log("[AdminScript] Script principal de administração finalizado.");
});
