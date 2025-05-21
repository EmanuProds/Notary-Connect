// frontend/web/js/adminResponses.js
(function() { // IIFE para encapsular o escopo
  console.log("[AdminResponses] Script adminResponses.js INICIADO (execução direta).");

  const responsesSection = document.getElementById("respostasSection");
  if (!responsesSection) {
    console.warn("[AdminResponses] Seção de respostas ('respostasSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminResponses] Seção de respostas encontrada.");

  const responseList = document.getElementById("responseList");
  const responseForm = document.getElementById("responseForm");
  const responseModal = document.getElementById("responseModal");
  const closeModalBtn = document.getElementById("closeResponseModal");
  const cancelResponseBtn = document.getElementById("cancelResponseBtn");
  const saveResponseBtn = document.getElementById("saveResponseBtn"); // Usado para verificar se o botão existe, o evento é no form
  const addResponseBtn = document.getElementById("addResponseBtn");
  const responseSearchInput = document.getElementById("responseSearchInput");

  if (!responseList || !responseForm || !responseModal || !closeModalBtn || !cancelResponseBtn || !saveResponseBtn || !addResponseBtn || !responseSearchInput) {
    console.error("[AdminResponses] ERRO CRÍTICO: Um ou mais elementos da UI para Respostas Automáticas não foram encontrados. Verifique os IDs no HTML.");
    return;
  }
  console.log("[AdminResponses] Todos os elementos da UI para Respostas Automáticas foram referenciados.");

  let currentResponseId = null;
  let allResponses = [];

  async function loadResponses() {
    console.log("[AdminResponses] loadResponses: Iniciando carregamento de respostas...");
    try {
      console.log("[AdminResponses] loadResponses: Realizando fetch para /api/admin/responses");
      const response = await fetch("/api/admin/responses");
      console.log("[AdminResponses] loadResponses: Resposta do fetch recebida, status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error("[AdminResponses] loadResponses: Erro na resposta do fetch:", errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log("[AdminResponses] loadResponses: Dados JSON parseados:", data);

      if (data.success) {
        allResponses = data.data;
        console.log("[AdminResponses] loadResponses: Respostas carregadas com sucesso:", allResponses.length, "respostas.");
        renderResponseList(allResponses);
      } else {
        console.warn("[AdminResponses] loadResponses: Erro ao carregar respostas (data.success = false):", data.message);
        showAlert("Erro ao carregar respostas: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("[AdminResponses] loadResponses: Falha crítica ao carregar respostas:", error);
      showAlert("Erro de rede ou servidor ao carregar respostas.", "error");
    }
  }

  function renderResponseList(responses) {
    console.log("[AdminResponses] renderResponseList: Renderizando lista com", responses ? responses.length : 0, "respostas.");
    if (!responseList) {
        console.error("[AdminResponses] renderResponseList: Elemento responseList não encontrado.");
        return;
    }
    responseList.innerHTML = "";

    if (!responses || responses.length === 0) {
      console.log("[AdminResponses] renderResponseList: Nenhuma resposta para renderizar.");
      responseList.innerHTML = '<div class="empty-state">Nenhuma resposta automática encontrada. Clique em "Nova Resposta" para adicionar.</div>';
      return;
    }

    responses.forEach((resp) => {
      const responseItem = document.createElement("div");
      responseItem.className = "response-item list-item"; // Adicionando classe genérica 'list-item'
      responseItem.dataset.id = resp.ID;

      const activeClass = resp.ACTIVE ? "active" : "inactive";
      const statusText = resp.ACTIVE ? "Ativo" : "Inativo";
      const typingDelayText = resp.TYPING_DELAY_MS !== null && resp.TYPING_DELAY_MS !== undefined ? `${resp.TYPING_DELAY_MS}ms` : 'Padrão';
      const sendDelayText = resp.RESPONSE_DELAY_MS !== null && resp.RESPONSE_DELAY_MS !== undefined ? `${resp.RESPONSE_DELAY_MS}ms` : 'Padrão';

      responseItem.innerHTML = `
        <div class="list-item-header">
          <h4>${escapeHTML(resp.RESPONSE_NAME)}</h4>
          <div class="item-actions">
            <span class="status-badge ${activeClass}">${statusText}</span>
            <button class="icon-button btn-edit-response" data-id="${resp.ID}" aria-label="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="icon-button btn-delete-response" data-id="${resp.ID}" aria-label="Excluir">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
        <div class="list-item-body response-details">
          <p><strong>Chave:</strong> <code class="code">${escapeHTML(resp.RESPONSE_KEY)}</code></p>
          <p><strong>Padrão/Gatilho:</strong> <code class="code">${escapeHTML(resp.PATTERN)}</code></p>
          <p><strong>Prioridade:</strong> ${resp.PRIORITY}</p>
          <p><strong>Simular Digitação:</strong> ${typingDelayText}</p>
          <p><strong>Atraso Envio:</strong> ${sendDelayText}</p>
          <p><strong>Horário:</strong> ${resp.START_TIME || '--:--'} - ${resp.END_TIME || '--:--'}</p>
          <p><strong>Dias Ativos:</strong> ${formatAllowedDays(resp.ALLOWED_DAYS)}</p>
          <div class="response-preview">
            <strong>Texto da Resposta:</strong>
            <div class="preview-text">${formatMessagePreview(resp.RESPONSE_TEXT)}</div>
          </div>
        </div>
      `;
      responseList.appendChild(responseItem);
    });

    addEventListenersToItemButtons();
    console.log("[AdminResponses] renderResponseList: Lista de respostas renderizada.");
  }
  
  function formatAllowedDays(daysString) {
    // console.log("[AdminResponses] formatAllowedDays: Formatando dias:", daysString);
    if (!daysString) return "Todos os dias";
    const daysMap = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const activeDays = daysString.split(',')
        .map(d => parseInt(d.trim(), 10))
        .filter(d => !isNaN(d) && d >= 0 && d <= 6)
        .map(d => daysMap[d])
        .join(', ');
    return activeDays || "Nenhum especificado";
  }

  function addEventListenersToItemButtons() {
    console.log("[AdminResponses] addEventListenersToItemButtons: Adicionando listeners aos botões de editar/excluir.");
    document.querySelectorAll(".btn-edit-response").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        console.log("[AdminResponses] Botão EDITAR resposta clicado, ID:", e.currentTarget.dataset.id);
        editResponse(e.currentTarget.dataset.id);
      });
    });
    document.querySelectorAll(".btn-delete-response").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const responseId = e.currentTarget.dataset.id;
        console.log("[AdminResponses] Botão EXCLUIR resposta clicado, ID:", responseId);
        if (confirm("Tem certeza que deseja excluir esta resposta automática? Esta ação não pode ser desfeita.")) {
          console.log("[AdminResponses] Confirmação de exclusão para ID:", responseId);
          deleteResponse(responseId);
        } else {
          console.log("[AdminResponses] Exclusão cancelada para ID:", responseId);
        }
      });
    });
  }

  function formatMessagePreview(text) {
    // console.log("[AdminResponses] formatMessagePreview: Formatando preview do texto.");
    if (!text) return "";
    let preview = text.length > 150 ? text.substring(0, 147) + "..." : text;
    preview = escapeHTML(preview);
    preview = preview
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
      .replace(/_(.*?)_/g, "<em>$1</em>")
      .replace(/~(.*?)~/g, "<del>$1</del>")
      .replace(/```(.*?)```/gs, "<pre class='code-block'><code>$1</code></pre>")
      .replace(/`(.*?)`/g, "<code class='inline-code'>$1</code>")
      .replace(/\n/g, "<br>");
    return preview;
  }

  async function editResponse(id) {
    console.log(`[AdminResponses] editResponse: Editando resposta ID: ${id}`);
    try {
      console.log(`[AdminResponses] editResponse: Realizando fetch para /api/admin/responses/${id}`);
      const response = await fetch(`/api/admin/responses/${id}`);
      console.log(`[AdminResponses] editResponse: Resposta do fetch para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminResponses] editResponse: Erro na resposta do fetch para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminResponses] editResponse: Dados JSON parseados para ID ${id}:`, data);

      if (data.success && data.data) {
        const respData = data.data;
        console.log(`[AdminResponses] editResponse: Populando formulário com dados da resposta ID ${id}.`);
        document.getElementById("responseId").value = respData.ID;
        document.getElementById("responseKey").value = respData.RESPONSE_KEY;
        document.getElementById("responseName").value = respData.RESPONSE_NAME;
        document.getElementById("responsePattern").value = respData.PATTERN;
        document.getElementById("responseText").value = respData.RESPONSE_TEXT;
        document.getElementById("responsePriority").value = respData.PRIORITY;
        document.getElementById("responseActive").checked = respData.ACTIVE === 1;
        document.getElementById("responseStartTime").value = respData.START_TIME || "";
        document.getElementById("responseEndTime").value = respData.END_TIME || "";
        document.getElementById("responseAllowedDays").value = respData.ALLOWED_DAYS || "0,1,2,3,4,5,6";
        document.getElementById("responseTypingDelay").value = respData.TYPING_DELAY_MS !== null ? respData.TYPING_DELAY_MS : 1000;
        document.getElementById("responseSendDelay").value = respData.RESPONSE_DELAY_MS !== null ? respData.RESPONSE_DELAY_MS : 500;

        document.getElementById("responseModalTitle").textContent = "Editar Resposta Automática";
        currentResponseId = respData.ID;
        responseModal.classList.add("show");
        console.log(`[AdminResponses] editResponse: Modal de edição exibido para resposta ID ${id}.`);
      } else {
        console.warn(`[AdminResponses] editResponse: Erro ao carregar dados da resposta ID ${id} (data.success = false ou sem data):`, data.message);
        showAlert("Erro ao carregar dados da resposta: " + (data.message || "Resposta não encontrada."), "error");
      }
    } catch (error) {
      console.error(`[AdminResponses] editResponse: Falha crítica ao carregar dados da resposta ID ${id}:`, error);
      showAlert("Erro de rede ou servidor ao carregar dados da resposta.", "error");
    }
  }

  function addNewResponse() {
    console.log("[AdminResponses] addNewResponse: Abrindo modal para nova resposta.");
    if (responseForm) responseForm.reset(); else console.error("[AdminResponses] addNewResponse: responseForm é nulo!");
    document.getElementById("responseId").value = "";
    document.getElementById("responseActive").checked = true;
    document.getElementById("responsePriority").value = "0";
    document.getElementById("responseStartTime").value = "";
    document.getElementById("responseEndTime").value = "";
    document.getElementById("responseAllowedDays").value = "0,1,2,3,4,5,6";
    document.getElementById("responseTypingDelay").value = 1000;
    document.getElementById("responseSendDelay").value = 500;

    document.getElementById("responseModalTitle").textContent = "Nova Resposta Automática";
    currentResponseId = null;
    if (responseModal) responseModal.classList.add("show"); else console.error("[AdminResponses] addNewResponse: responseModal é nulo!");
    document.getElementById("responseKey").focus();
    console.log("[AdminResponses] addNewResponse: Modal para nova resposta exibido.");
  }

  async function saveResponse(event) {
    console.log("[AdminResponses] saveResponse: Função saveResponse INICIADA.");
     if (event) {
        console.log("[AdminResponses] saveResponse: Evento de submit recebido, prevenindo default.");
        event.preventDefault(); // Previne o submit padrão do formulário
    } else {
        console.warn("[AdminResponses] saveResponse: Função chamada sem evento (provavelmente clique direto no botão).");
    }

    const responseKey = document.getElementById("responseKey").value.trim();
    const responseName = document.getElementById("responseName").value.trim();
    const responsePattern = document.getElementById("responsePattern").value.trim();
    const responseText = document.getElementById("responseText").value.trim();
    console.log("[AdminResponses] saveResponse: Dados brutos do formulário:", { responseKey, responseName, responsePattern, responseText });

    if (!responseKey || !responseName || !responsePattern || !responseText) {
      console.warn("[AdminResponses] saveResponse: Campos obrigatórios não preenchidos.");
      showAlert("Chave, Nome, Padrão/Gatilho e Texto da Resposta são obrigatórios.", "warning");
      return;
    }

    const responseData = {
      response_key: responseKey,
      response_name: responseName,
      pattern: responsePattern,
      response_text: responseText,
      active: document.getElementById("responseActive").checked,
      priority: parseInt(document.getElementById("responsePriority").value, 10) || 0,
      start_time: document.getElementById("responseStartTime").value || null,
      end_time: document.getElementById("responseEndTime").value || null,
      allowed_days: document.getElementById("responseAllowedDays").value,
      typing_delay_ms: parseInt(document.getElementById("responseTypingDelay").value, 10),
      response_delay_ms: parseInt(document.getElementById("responseSendDelay").value, 10)
    };
    console.log("[AdminResponses] saveResponse: Dados formatados para envio:", JSON.stringify(responseData));
    
    if (isNaN(responseData.typing_delay_ms) || responseData.typing_delay_ms < 0) {
        showAlert("Tempo de simulação de digitação inválido.", "warning"); return;
    }
    if (isNaN(responseData.response_delay_ms) || responseData.response_delay_ms < 0) {
        showAlert("Atraso para envio inválido.", "warning"); return;
    }

    try {
      const url = currentResponseId ? `/api/admin/responses/${currentResponseId}` : "/api/admin/responses";
      const method = currentResponseId ? "PUT" : "POST";
      console.log(`[AdminResponses] saveResponse: Enviando ${method} para ${url}`);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseData),
      });
      console.log(`[AdminResponses] saveResponse: Resposta do fetch para ${url}, status:`, response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminResponses] saveResponse: Erro na resposta do fetch (${url}):`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("[AdminResponses] saveResponse: Resultado do backend:", data);

      if (data.success) {
        showAlert(currentResponseId ? "Resposta atualizada com sucesso!" : "Resposta criada com sucesso!", "success");
        if (responseModal) responseModal.classList.remove("show"); else console.error("[AdminResponses] saveResponse: responseModal é nulo ao tentar fechar.");
        loadResponses();
        console.log("[AdminResponses] saveResponse: Resposta salva com sucesso, modal fechado, lista recarregada.");
      } else {
        console.warn("[AdminResponses] saveResponse: Erro ao salvar resposta (backend informou erro):", data.message);
        showAlert("Erro ao salvar resposta: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminResponses] saveResponse: Falha crítica ao salvar resposta:", error);
      showAlert(`Erro de rede ou servidor ao salvar resposta: ${error.message}`, "error");
    }
    console.log("[AdminResponses] saveResponse: Função saveResponse CONCLUÍDA.");
  }

  async function deleteResponse(id) {
    console.log(`[AdminResponses] deleteResponse: Excluindo resposta ID: ${id}`);
    try {
      console.log(`[AdminResponses] deleteResponse: Realizando fetch DELETE para /api/admin/responses/${id}`);
      const response = await fetch(`/api/admin/responses/${id}`, { method: "DELETE" });
      console.log(`[AdminResponses] deleteResponse: Resposta do fetch DELETE para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminResponses] deleteResponse: Erro na resposta do fetch DELETE para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminResponses] deleteResponse: Resultado do backend para exclusão ID ${id}:`, data);

      if (data.success) {
        showAlert("Resposta excluída com sucesso!", "success");
        loadResponses();
        console.log(`[AdminResponses] deleteResponse: Resposta ID ${id} excluída, lista recarregada.`);
      } else {
        console.warn(`[AdminResponses] deleteResponse: Erro ao excluir resposta ID ${id} (backend informou erro):`, data.message);
        showAlert("Erro ao excluir resposta: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error(`[AdminResponses] deleteResponse: Falha crítica ao excluir resposta ID ${id}:`, error);
      showAlert("Erro de rede ou servidor ao excluir resposta.", "error");
    }
  }

  function filterResponses() {
    const searchTerm = responseSearchInput.value.toLowerCase();
    console.log("[AdminResponses] filterResponses: Filtrando respostas com termo:", searchTerm);
    if (!searchTerm) {
      renderResponseList(allResponses);
      return;
    }
    const filtered = allResponses.filter(
      (resp) =>
        resp.RESPONSE_NAME.toLowerCase().includes(searchTerm) ||
        resp.RESPONSE_KEY.toLowerCase().includes(searchTerm) ||
        resp.PATTERN.toLowerCase().includes(searchTerm) ||
        resp.RESPONSE_TEXT.toLowerCase().includes(searchTerm)
    );
    renderResponseList(filtered);
    console.log("[AdminResponses] filterResponses: Filtro aplicado, renderizadas", filtered.length, "respostas.");
  }

  function showAlert(message, type = "info", duration = 3000) {
    console.log(`[AdminResponses] showAlert: Tipo: ${type}, Mensagem: ${message}`);
    const alertContainer = document.getElementById("alertContainer") || document.body;
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    alertContainer.appendChild(alertElement);
    requestAnimationFrame(() => { alertElement.classList.add("show"); });
    setTimeout(() => {
      alertElement.classList.remove("show");
      setTimeout(() => alertElement.remove(), 300);
    }, duration);
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  console.log("[AdminResponses] Adicionando event listeners principais...");
  if (addResponseBtn) addResponseBtn.addEventListener("click", addNewResponse);
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => {
    console.log("[AdminResponses] Botão Fechar Modal clicado.");
    if (responseModal) responseModal.classList.remove("show");
  });
  if (cancelResponseBtn) cancelResponseBtn.addEventListener("click", () => {
    console.log("[AdminResponses] Botão Cancelar Modal clicado.");
    if (responseModal) responseModal.classList.remove("show");
  });
  
  // O evento de salvar é no submit do formulário
  if (responseForm) {
    responseForm.addEventListener("submit", saveResponse);
    console.log("[AdminResponses] Event listener de 'submit' ADICIONADO ao responseForm.");
  } else {
    console.error("[AdminResponses] responseForm não encontrado, não foi possível adicionar event listener de submit.");
    // Se o responseForm não existe, o saveResponseBtn (se existir) não terá efeito se for type="submit"
    // Se o saveResponseBtn for type="button", o listener abaixo seria necessário.
    // if (saveResponseBtn) saveResponseBtn.addEventListener("click", saveResponse);
  }

  if (responseSearchInput) responseSearchInput.addEventListener("input", filterResponses);

  window.addEventListener("click", (e) => {
    if (responseModal && e.target === responseModal) {
      console.log("[AdminResponses] Clique fora do modal detectado.");
      responseModal.classList.remove("show");
    }
  });
  window.addEventListener('keydown', (e) => {
    if (responseModal && e.key === 'Escape' && responseModal.classList.contains('show')) {
        console.log("[AdminResponses] Tecla Escape pressionada, fechando modal.");
        responseModal.classList.remove('show');
    }
  });
  console.log("[AdminResponses] Event listeners principais adicionados.");

  console.log("[AdminResponses] Chamando loadResponses() para carregar respostas iniciais.");
  loadResponses();
  console.log("[AdminResponses] Script de respostas (adminResponses.js) finalizado sua execução inicial.");
})(); // Fim da IIFE
