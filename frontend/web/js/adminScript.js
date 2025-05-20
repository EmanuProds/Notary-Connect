// frontend/web/js/adminScript.js
document.addEventListener("DOMContentLoaded", () => {
  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[AdminTheme] Tema aplicado: ${theme}`);
    // Atualiza cores do QR Code se ele estiver visível e o objeto QRCode existir
    const qrDisplay = document.getElementById("qrDisplay");
    if (qrDisplay && qrDisplay.querySelector('canvas') && typeof QRCode !== 'undefined') {
        if (window.currentQR) {
            qrDisplay.innerHTML = ""; // Limpa o QR antigo
            try {
                new QRCode(qrDisplay, {
                    text: window.currentQR,
                    width: 180,
                    height: 180,
                    colorDark: theme === 'dark' ? "#eeeeec" : "#000000",
                    colorLight: theme === 'dark' ? "#2c2c2c" : "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H,
                });
                console.log("[AdminTheme] QR Code redesenhado com novo tema.");
            } catch (e) {
                console.error("[AdminTheme] Erro ao redesenhar QR Code com novo tema:", e);
            }
        } else {
            console.log("[AdminTheme] window.currentQR não definido, não é possível redesenhar o QR Code para o novo tema.");
        }
    } else if (qrDisplay && typeof QRCode === 'undefined') {
        console.warn("[AdminTheme] Biblioteca QRCode não definida ao tentar aplicar tema ao QR Code.");
    }
  };

  const checkSystemTheme = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  };

  // Aplicar tema na carga inicial
  checkSystemTheme();

  // Ouvir mudanças na preferência do sistema em tempo real
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  console.log("[AdminScript] Script carregado. Inicializando interface de administração...");

  // Elementos de Navegação
  const navButtons = document.querySelectorAll(".nav-item");
  const contentSections = document.querySelectorAll(".content-section");

  // Elementos do QR Code
  const qrDisplay = document.getElementById("qrDisplay");
  const qrStatusText = document.getElementById("qrStatusText");
  const botActionsDiv = document.getElementById("botActions");
  const pauseBotBtn = document.getElementById("pauseBotBtn");
  const restartBotBtn = document.getElementById("restartBotBtn");

  // Elementos de Informação do Sistema
  const systemStatus = document.getElementById("systemStatus");
  const onlineAttendants = document.getElementById("onlineAttendants");
  const activeConversations = document.getElementById("activeConversations");
  const lastUpdate = document.getElementById("lastUpdate");

  // Botões do Rodapé
  const viewLogsBtn = document.getElementById("viewLogsBtn");
  const openDevToolsBtnAdmin = document.getElementById("openDevToolsBtnAdmin");
  const logoutBtn = document.getElementById("logoutBtn");

  // Status da Conexão
  const connectionStatusDiv = document.getElementById("connectionStatus");

  // Variáveis de Sessão e WebSocket
  const sessionId = "whatsapp-bot-session"; // ID da sessão do bot
  const wsUrl = `ws://${window.location.host}/admin-qr`; // URL do WebSocket, ajusta host dinamicamente
  let websocket;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  let reconnectTimeout = null;
  const baseReconnectDelay = 3000; // ms
  window.currentQR = null; // Armazena o QR Code atual para ser usado pelo applyTheme

  // Ícones para o status do QR Code (SVG)
  const svgIconSpinner = `
        <svg class="spinner" viewBox="0 0 50 50" style="width: 60px; height: 60px; stroke: var(--accent-color);">
            <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
    `;
  const svgIconSuccess = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
    `;
  const svgIconError = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--error-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
    `;
  const svgIconWarning = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--warning-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 80px; height: 80px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    `;

  // Função auxiliar para escapar HTML
  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
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
    );
  }

  // Define a seção ativa na navegação
  function setActiveSection(sectionIdToShow) {
    console.log(`[AdminScript] Ativando seção: ${sectionIdToShow}`);
    navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === sectionIdToShow);
    });
    contentSections.forEach((section) => {
      section.classList.toggle("active", section.id === sectionIdToShow);
    });
  }

  // Atualiza a UI com o status do bot (QR Code, Conectado, etc.)
  function updateBotStatusUI(clientData) {
    if (!qrDisplay || !qrStatusText) {
      console.error("[AdminScript] Elementos de exibição do QR (qrDisplay ou qrStatusText) não encontrados!");
      return;
    }

    console.log("[AdminScript] updateBotStatusUI chamada com clientData:", clientData);
    qrStatusText.className = "status-text"; // Reseta classes de status
    qrDisplay.innerHTML = ""; // Limpa o display do QR anterior
    window.currentQR = null;  // Reseta o QR Code atual

    if (clientData.status === "QR_CODE") {
      const qrCodeValue = clientData.qrCode || clientData.qr; // Tenta ambas as chaves
      console.log("[AdminScript] Status é QR_CODE. Valor do QR Code recebido:", qrCodeValue ? qrCodeValue.substring(0,30) + "..." : "NULO ou VAZIO");
      if (qrCodeValue && typeof qrCodeValue === "string" && qrCodeValue.trim() !== "") {
        window.currentQR = qrCodeValue; // Armazena o QR Code para ser usado pelo tema
        if (typeof QRCode !== 'undefined') {
          try {
            console.log("[AdminScript] Gerando novo QR Code...");
            new QRCode(qrDisplay, {
              text: window.currentQR,
              width: 180,
              height: 180,
              colorDark: document.documentElement.getAttribute('data-theme') === 'dark' ? "#eeeeec" : "#000000",
              colorLight: document.documentElement.getAttribute('data-theme') === 'dark' ? "#2c2c2c" : "#ffffff",
              correctLevel: QRCode.CorrectLevel.H,
            });
            qrStatusText.textContent = "Escaneie o QR Code com o WhatsApp";
            qrStatusText.style.color = "var(--text-secondary-color)";
            if (botActionsDiv) botActionsDiv.style.display = "none";
            console.log("[AdminScript] QR Code gerado e exibido com sucesso.");
          } catch (qrError) {
            console.error("[AdminScript] Erro ao gerar QR code com a biblioteca QRCode.js:", qrError);
            qrDisplay.innerHTML = svgIconError;
            qrStatusText.textContent = "Falha ao gerar QR Code. Verifique o console.";
            qrStatusText.classList.add("error");
          }
        } else {
          console.error("[AdminScript] Biblioteca QRCode não está definida! Não é possível exibir o QR Code.");
          qrDisplay.innerHTML = svgIconError;
          qrStatusText.textContent = "Erro: Biblioteca QRCode não carregada.";
          qrStatusText.classList.add("error");
        }
      } else {
        console.warn("[AdminScript] QR Code string inválida, vazia ou não fornecida no payload. Payload:", clientData);
        qrDisplay.innerHTML = svgIconWarning;
        qrStatusText.textContent = "QR Code inválido ou não recebido.";
        qrStatusText.classList.add("error");
      }
    } else if (clientData.status === "READY") {
      console.log("[AdminScript] Status é READY. JID:", clientData.jid);
      qrDisplay.innerHTML = svgIconSuccess;
      qrStatusText.textContent = `Robô Conectado! (Celular: ${clientData.jid ? clientData.jid.split('@')[0] : "N/A"})`;
      qrStatusText.classList.add("ready");
      if (botActionsDiv) botActionsDiv.style.display = "flex";
    } else if (
      clientData.status === "DISCONNECTED" ||
      clientData.status === "AUTH_FAILURE" ||
      clientData.status === "FATAL_ERROR" ||
      clientData.status === "RESTARTING"
    ) {
      console.warn(`[AdminScript] Status do bot: ${clientData.status}. Razão: ${clientData.reason || clientData.error || 'N/A'}`);
      qrDisplay.innerHTML = svgIconWarning;
      const statusMessage = `Robô ${clientData.status === "RESTARTING" ? "Reiniciando" : "Desconectado"}`;
      let reasonText = clientData.error ? ` Razão: ${escapeHTML(String(clientData.error))}` : (clientData.reason ? ` Razão: ${escapeHTML(String(clientData.reason))}` : "");
      if (clientData.status === "AUTH_FAILURE") reasonText = " Falha na autenticação. Verifique o WhatsApp e reinicie o robô se necessário.";
      qrStatusText.textContent = statusMessage + reasonText;
      qrStatusText.classList.add("error");
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else if (clientData.status) { // Outros status intermediários
      console.log(`[AdminScript] Status do bot: ${clientData.status}`);
      qrDisplay.innerHTML = svgIconSpinner;
      qrStatusText.textContent = escapeHTML(clientData.status);
      if (botActionsDiv) botActionsDiv.style.display = "none";
    } else {
      console.log("[AdminScript] Status do bot desconhecido ou não fornecido. Payload:", clientData);
      qrDisplay.innerHTML = svgIconSpinner;
      qrStatusText.textContent = "Aguardando status do robô...";
      if (botActionsDiv) botActionsDiv.style.display = "none";
    }
    // Atualiza informações do sistema (simulado)
    updateSystemInfo({
        status: clientData.status === "READY" ? "Online" : (clientData.status === "QR_CODE" ? "Aguardando QR" : (clientData.status || "Offline")),
        attendants: clientData.status === "READY" ? (Math.floor(Math.random() * 5) + 1) : 0, // Simulado
        conversations: clientData.status === "READY" ? (Math.floor(Math.random() * 10) + 1) : 0, // Simulado
    });
  }

  // Atualiza as informações do sistema na UI
  function updateSystemInfo(data) {
    if (systemStatus) systemStatus.textContent = data.status;
    if (onlineAttendants) onlineAttendants.textContent = data.attendants;
    if (activeConversations) activeConversations.textContent = data.conversations;
    if (lastUpdate) lastUpdate.textContent = new Date().toLocaleTimeString();

    if (systemStatus) {
      systemStatus.classList.remove("ready", "error", "warning-text");
      if (data.status === "Online") systemStatus.classList.add("ready");
      else if (data.status === "Offline" || data.status === "FATAL_ERROR" || data.status === "AUTH_FAILURE") systemStatus.classList.add("error");
      else systemStatus.classList.add("warning-text"); // Para status como "Aguardando QR", "Reiniciando"
    }
  }

  // Atualiza o status da conexão WebSocket na UI
  function updateWebSocketConnectionStatus(statusKey, message = "") {
    if (!connectionStatusDiv) return;
    connectionStatusDiv.className = "connection-status"; // Reseta classes
    let statusText = "";
    if (statusKey === "connected") {
      statusText = "Conectado ao Servidor";
      connectionStatusDiv.classList.add("connected");
    } else if (statusKey === "connecting") {
      statusText = "Conectando...";
      connectionStatusDiv.classList.add("connecting");
    } else if (statusKey === "disconnected") {
      statusText = "Desconectado";
      connectionStatusDiv.classList.add("disconnected");
    }
    connectionStatusDiv.textContent = statusText + (message ? ` (${message})` : "");
  }

  // Conecta ao servidor WebSocket
  function connectWebSocket() {
    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      console.log("[AdminScript] WebSocket já conectado ou conectando.");
      return;
    }
    updateWebSocketConnectionStatus("connecting");
    console.log(`[AdminScript] Conectando ao WebSocket em ${wsUrl}`);
    try {
      websocket = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[AdminScript] Erro ao criar WebSocket:", e);
      updateWebSocketConnectionStatus("disconnected", "Erro ao criar WebSocket");
      reconnectWebSocket(); // Tenta reconectar
      return;
    }

    websocket.onopen = () => {
      console.log("[AdminScript] Conexão WebSocket aberta.");
      updateWebSocketConnectionStatus("connected");
      reconnectAttempts = 0; // Reseta tentativas de reconexão
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = null;

      if (websocket.readyState === WebSocket.OPEN) {
        console.log("[AdminScript] Solicitando status inicial para o bot:", sessionId);
        websocket.send(
          JSON.stringify({
            type: "request_initial_status",
            clientType: "admin-qr",
            sessionId: sessionId,
          }),
        );
      }
    };

    websocket.onmessage = (event) => {
      const rawData = event.data;
      console.log("[AdminScript] Mensagem WebSocket recebida (RAW):", rawData ? rawData.substring(0, 300) + (rawData.length > 300 ? "..." : "") : "N/A");
      let data;
      try {
        data = JSON.parse(rawData);
        console.log("[AdminScript] Mensagem WebSocket parseada:", data);
      } catch (e) {
        console.error("[AdminScript] Erro ao parsear mensagem WebSocket JSON:", e, "Dados RAW:", rawData);
        return;
      }

      // Verifica se a mensagem é para este cliente (sessionId) ou um broadcast de status do bot
      if (data.clientId === sessionId || !data.clientId || data.type === "bot_status_update" || data.type === "status_update" || data.type === "initial_status" || data.type === "qr_code") {
        console.log("[AdminScript] Processando mensagem para o bot. Tipo:", data.type, "Payload:", data.payload);
        if ((data.type === "status_update" || data.type === "initial_status" || data.type === "bot_status_update") && data.payload) {
          updateBotStatusUI(data.payload);
          if (typeof data.payload.isPaused === "boolean" && pauseBotBtn) {
            const pauseIconHTML = `<img src="./img/icons/pause.svg" alt="Pausar" class="btn-icon-img" onerror="this.parentElement.querySelector('.fa-icon.fa-pause').style.display='inline-block'; this.style.display='none';"><i class="fas fa-pause fa-icon" style="display:none;"></i>`;
            const playIconHTML = `<img src="./img/icons/play.svg" alt="Continuar" class="btn-icon-img" onerror="this.parentElement.querySelector('.fa-icon.fa-play').style.display='inline-block'; this.style.display='none';"><i class="fas fa-play fa-icon" style="display:none;"></i>`;
            pauseBotBtn.innerHTML = (data.payload.isPaused ? playIconHTML : pauseIconHTML) + `<span>${data.payload.isPaused ? "Continuar Robô" : "Pausar Robô"}</span>`;
          }
        } else if (data.type === "qr_code" && data.payload) {
            console.log("[AdminScript] Evento 'qr_code' recebido, payload:", data.payload);
            // A chave do QR code pode ser 'qr', 'qrCode' ou o próprio payload ser a string do QR
            const qrString = data.payload.qr || data.payload.qrCode || (typeof data.payload === 'string' ? data.payload : null);
            if (qrString) {
                updateBotStatusUI({ status: "QR_CODE", qrCode: qrString });
            } else {
                console.warn("[AdminScript] Evento 'qr_code' recebido, mas sem valor de QR Code no payload:", data.payload);
                updateBotStatusUI({ status: "QR_CODE_ERROR", reason: "QR Code não encontrado no payload." });
            }
        } else {
            console.warn("[AdminScript] Tipo de mensagem ou payload não reconhecido para atualização da UI:", data);
        }
      } else {
        console.log("[AdminScript] Mensagem recebida para um clientId diferente ou tipo não relevante para este admin. Ignorando. Dados:", data);
      }
    };

    websocket.onerror = (errorEvent) => {
      console.error("[AdminScript] Erro no WebSocket:", errorEvent);
      // onclose será chamado em seguida, tratando a reconexão
    };

    websocket.onclose = (event) => {
      console.log(`[AdminScript] Conexão WebSocket fechada. Código=${event.code}, Limpa=${event.wasClean}, Razão: ${event.reason}`);
      updateWebSocketConnectionStatus("disconnected", `Código: ${event.code}`);
      if (!event.wasClean && !reconnectTimeout) {
        reconnectWebSocket();
      }
    };
  }

  // Tenta reconectar ao WebSocket
  function reconnectWebSocket() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(30000, baseReconnectDelay * Math.pow(1.8, reconnectAttempts - 1) + Math.random() * 1000); // Jitter
      updateWebSocketConnectionStatus("connecting", `Tentativa ${reconnectAttempts}`);
      console.log(`[AdminScript] Tentando reconectar WebSocket em ${delay / 1000}s (Tentativa ${reconnectAttempts}/${maxReconnectAttempts})`);
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectWebSocket();
      }, delay);
    } else {
      console.error("[AdminScript] Número máximo de tentativas de reconexão atingido.");
      updateWebSocketConnectionStatus("disconnected", "Falha ao reconectar");
      if (qrStatusText) qrStatusText.textContent = "Não foi possível reconectar ao servidor.";
      if (qrDisplay) qrDisplay.innerHTML = svgIconError;
    }
  }
  
  // Função de Alerta
  function showAlert(message, type = "info", duration = 3500) {
    const alertContainer = document.getElementById("alertContainer");
    if (!alertContainer) {
        console.warn("Elemento alertContainer não encontrado para exibir alerta.");
        alert(`${type.toUpperCase()}: ${message}`); // Fallback
        return;
    }
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    
    const existingAlerts = alertContainer.querySelectorAll(`.alert-${type}`);
    existingAlerts.forEach(alert => alert.remove());

    alertContainer.appendChild(alertElement);
    requestAnimationFrame(() => {
        alertElement.classList.add("show");
    });
    setTimeout(() => {
      alertElement.classList.remove("show");
      setTimeout(() => alertElement.remove(), 300);
    }, duration);
  }

  // Inicialização da interface
  function init() {
    console.log("[AdminScript] Função init() chamada.");
    if (typeof window.electronAPI !== 'undefined') {
        console.log("[AdminScript] electronAPI está disponível. Métodos:", Object.keys(window.electronAPI));
    } else {
        console.warn("[AdminScript] electronAPI NÃO está disponível. Algumas funcionalidades podem não operar como esperado.");
    }

    // Configura navegação
    if (!navButtons || navButtons.length === 0) {
        console.error("[AdminScript] Botões de navegação (.nav-item) não encontrados.");
    } else {
        navButtons.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const sectionId = btn.dataset.section;
                console.log(`[AdminScript] Botão de navegação clicado: ${sectionId}`);
                if (sectionId) setActiveSection(sectionId);
            });
        });
    }

    // Configura botões de controle do bot
    if (pauseBotBtn) {
      pauseBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] Botão Pausar/Continuar Bot clicado.");
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          console.log("[AdminScript] Enviando mensagem 'control-bot' action: 'pause'");
          window.electronAPI.sendIpcMessage("control-bot", { action: "pause", sessionId: sessionId });
        } else {
          showAlert("Funcionalidade de controle do bot não disponível neste ambiente.", "warning");
          console.error("[AdminScript] ERRO: window.electronAPI.sendIpcMessage não é uma função ou window.electronAPI não está definido (pauseBotBtn).");
        }
      });
    } else { console.warn("[AdminScript] Botão 'pauseBotBtn' não encontrado."); }

    if (restartBotBtn) {
      restartBotBtn.addEventListener("click", () => {
        console.log("[AdminScript] Botão Reiniciar Bot clicado.");
        if (window.electronAPI && typeof window.electronAPI.sendIpcMessage === "function") {
          if (confirm("Tem certeza que deseja reiniciar o robô? Isso exigirá escanear um novo QR code.")) {
            console.log("[AdminScript] Enviando mensagem 'control-bot' action: 'restart'");
            window.electronAPI.sendIpcMessage("control-bot", { action: "restart", sessionId: sessionId });
            if(qrStatusText) qrStatusText.textContent = "Solicitando reinício do robô...";
            if(qrDisplay) qrDisplay.innerHTML = svgIconSpinner;
            if (botActionsDiv) botActionsDiv.style.display = "none";
          }
        } else {
          showAlert("Funcionalidade de controle do bot não disponível neste ambiente.", "warning");
          console.error("[AdminScript] ERRO: window.electronAPI.sendIpcMessage não é uma função ou window.electronAPI não está definido (restartBotBtn).");
        }
      });
    } else { console.warn("[AdminScript] Botão 'restartBotBtn' não encontrado."); }
    
    // Configura botões do rodapé
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener("click", () => {
            console.log("[AdminScript] Botão Ver Logs clicado.");
            if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
                console.log("[AdminScript] Navegando para 'logs'");
                window.electronAPI.navigate("logs");
            } else {
                showAlert("Navegação para logs não disponível.", "info");
                console.warn("[AdminScript] ERRO: window.electronAPI.navigate não é uma função ou window.electronAPI não está definido (viewLogsBtn).");
            }
        });
    } else { console.warn("[AdminScript] Botão 'viewLogsBtn' não encontrado."); }

    if (openDevToolsBtnAdmin) {
        openDevToolsBtnAdmin.addEventListener("click", () => {
            console.log("[AdminScript] Botão Abrir DevTools clicado.");
            if (window.electronAPI && typeof window.electronAPI.openDevTools === "function") {
                console.log("[AdminScript] Abrindo DevTools");
                window.electronAPI.openDevTools();
            } else {
                showAlert("Ferramentas de desenvolvedor não disponíveis.", "info");
                console.warn("[AdminScript] ERRO: window.electronAPI.openDevTools não é uma função ou window.electronAPI não está definido (openDevToolsBtnAdmin).");
            }
        });
    } else { console.warn("[AdminScript] Botão 'openDevToolsBtnAdmin' não encontrado."); }
    
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            console.log("[AdminScript] Botão Sair clicado.");
            if (window.electronAPI) {
                if (typeof window.electronAPI.sendIpcMessage === "function") {
                    console.log("[AdminScript] Enviando mensagem 'admin-logout'");
                    window.electronAPI.sendIpcMessage("admin-logout");
                } else { console.warn("[AdminScript] window.electronAPI.sendIpcMessage não disponível para logout.");}
                
                if (typeof window.electronAPI.navigate === "function") {
                    console.log("[AdminScript] Navegando para 'login'");
                    window.electronAPI.navigate("login");
                } else {
                     console.warn("[AdminScript] window.electronAPI.navigate não disponível, usando fallback window.location.href para logout.");
                     window.location.href = "index.html";
                }
            } else {
                console.warn("[AdminScript] window.electronAPI não disponível, usando fallback window.location.href para logout.");
                window.location.href = "index.html";
            }
        });
    } else { console.warn("[AdminScript] Botão 'logoutBtn' não encontrado."); }

    // Define a seção ativa padrão
    setActiveSection("roboSection");
    // Conecta ao WebSocket
    connectWebSocket();
    console.log("[AdminScript] Inicialização da UI concluída.");

    // Carrega scripts adicionais para as abas
    const scriptsToLoad = [
      { id: "adminResponsesScript", src: "./js/adminResponses.js", section: "respostasSection" },
      { id: "adminAttendantsScript", src: "./js/adminAttendants.js", section: "funcionariosSection" },
      { id: "adminConfigScript", src: "./js/adminConfig.js", section: "configuracoesSection" },
      // Adicione aqui adminSectors.js se ele existir e for necessário
      // { id: "adminSectorsScript", src: "./js/adminSectors.js", section: "setoresSection" }
    ];

    scriptsToLoad.forEach(scriptInfo => {
        if (!document.getElementById(scriptInfo.id)) {
            const scriptElement = document.createElement("script");
            scriptElement.id = scriptInfo.id;
            scriptElement.src = scriptInfo.src;
            scriptElement.defer = true;
            scriptElement.onload = () => console.log(`[AdminScript] Script ${scriptInfo.src} carregado com sucesso.`);
            scriptElement.onerror = () => console.error(`[AdminScript] Falha ao carregar script ${scriptInfo.src}.`);
            document.body.appendChild(scriptElement);
            console.log(`[AdminScript] Script ${scriptInfo.src} adicionado ao body para carregamento.`);
        } else {
            console.log(`[AdminScript] Script ${scriptInfo.src} já presente no DOM.`);
        }
    });
  }

  // Verifica se a biblioteca QRCode está carregada antes de chamar init()
  if (typeof QRCode === 'undefined') {
    console.warn("[AdminScript] QRCode.js não está definido no momento do DOMContentLoaded. Tentando aguardar...");
    let attempts = 0;
    const maxAttempts = 20; // Tenta por 2 segundos (20 * 100ms)
    const intervalId = setInterval(() => {
        attempts++;
        if (typeof QRCode !== 'undefined') {
            clearInterval(intervalId);
            console.log("[AdminScript] QRCode.js definido após espera. Inicializando agora.");
            init();
        } else if (attempts >= maxAttempts) {
            clearInterval(intervalId);
            console.error("[AdminScript] QRCode.js AINDA NÃO definido após espera. A funcionalidade de QR Code será AFETADA.");
            init(); // Tenta inicializar mesmo assim, mas o QR Code não funcionará.
            showAlert("Erro crítico: Biblioteca QRCode não carregada. A exibição do QR Code falhará.", "error", 10000);
        }
    }, 100);
  } else {
    console.log("[AdminScript] QRCode.js está definido. Inicializando imediatamente.");
    init();
  }
});
