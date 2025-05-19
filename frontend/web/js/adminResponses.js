// frontend/web/js/adminResponses.js
document.addEventListener("DOMContentLoaded", () => {
  const responsesSection = document.getElementById("respostasSection");
  if (!responsesSection) return;

  const responseList = document.getElementById("responseList");
  const responseForm = document.getElementById("responseForm");
  const responseModal = document.getElementById("responseModal");
  const closeModalBtn = document.getElementById("closeResponseModal");
  const cancelResponseBtn = document.getElementById("cancelResponseBtn"); // Botão de cancelar
  const saveResponseBtn = document.getElementById("saveResponseBtn");
  const addResponseBtn = document.getElementById("addResponseBtn");
  const responseSearchInput = document.getElementById("responseSearchInput");

  let currentResponseId = null;
  let allResponses = [];

  async function loadResponses() {
    try {
      const response = await fetch("/api/admin/responses");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        allResponses = data.data;
        renderResponseList(allResponses);
      } else {
        showAlert("Erro ao carregar respostas: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
      showAlert("Erro de rede ou servidor ao carregar respostas.", "error");
    }
  }

  function renderResponseList(responses) {
    if (!responseList) return;
    responseList.innerHTML = "";

    if (!responses || responses.length === 0) {
      responseList.innerHTML = '<div class="empty-state">Nenhuma resposta automática encontrada. Clique em "Nova Resposta" para adicionar.</div>';
      return;
    }

    responses.forEach((resp) => {
      const responseItem = document.createElement("div");
      responseItem.className = "response-item";
      responseItem.dataset.id = resp.ID;

      const activeClass = resp.ACTIVE ? "active" : "inactive";
      const statusText = resp.ACTIVE ? "Ativo" : "Inativo";

      // Formatando delays para exibição
      const typingDelayText = resp.TYPING_DELAY_MS !== null && resp.TYPING_DELAY_MS !== undefined ? `${resp.TYPING_DELAY_MS}ms` : 'Padrão';
      const sendDelayText = resp.RESPONSE_DELAY_MS !== null && resp.RESPONSE_DELAY_MS !== undefined ? `${resp.RESPONSE_DELAY_MS}ms` : 'Padrão';


      responseItem.innerHTML = `
        <div class="response-header">
          <h3 class="response-name">${escapeHTML(resp.RESPONSE_NAME)}</h3>
          <div class="response-actions">
            <span class="response-status ${activeClass}">${statusText}</span>
            <button class="btn-edit" data-id="${resp.ID}" aria-label="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-delete" data-id="${resp.ID}" aria-label="Excluir">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>
        <div class="response-details">
          <div class="response-detail">
            <span class="detail-label">Chave:</span>
            <span class="detail-value code">${escapeHTML(resp.RESPONSE_KEY)}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Padrão/Gatilho:</span>
            <span class="detail-value code">${escapeHTML(resp.PATTERN)}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Prioridade:</span>
            <span class="detail-value">${resp.PRIORITY}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Simular Digitação:</span>
            <span class="detail-value">${typingDelayText}</span>
          </div>
           <div class="response-detail">
            <span class="detail-label">Atraso Envio:</span>
            <span class="detail-value">${sendDelayText}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Horário Agendado:</span>
            <span class="detail-value">${resp.START_TIME || '--:--'} - ${resp.END_TIME || '--:--'}</span>
          </div>
           <div class="response-detail">
            <span class="detail-label">Dias Ativos:</span>
            <span class="detail-value">${formatAllowedDays(resp.ALLOWED_DAYS)}</span>
          </div>
          <div class="response-preview">
            <span class="detail-label">Texto da Resposta:</span>
            <div class="preview-text">${formatMessagePreview(resp.RESPONSE_TEXT)}</div>
          </div>
        </div>
      `;
      responseList.appendChild(responseItem);
    });

    addEventListenersToButtons();
  }
  
  function formatAllowedDays(daysString) {
    if (!daysString) return "Todos os dias";
    const daysMap = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const activeDays = daysString.split(',')
        .map(d => parseInt(d.trim(), 10))
        .filter(d => !isNaN(d) && d >= 0 && d <= 6)
        .map(d => daysMap[d])
        .join(', ');
    return activeDays || "Nenhum especificado";
  }


  function addEventListenersToButtons() {
    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => editResponse(e.currentTarget.dataset.id));
    });
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (confirm("Tem certeza que deseja excluir esta resposta automática? Esta ação não pode ser desfeita.")) {
          deleteResponse(e.currentTarget.dataset.id);
        }
      });
    });
  }

  function formatMessagePreview(text) {
    if (!text) return "";
    let preview = text.length > 150 ? text.substring(0, 147) + "..." : text;
    preview = escapeHTML(preview);
    preview = preview
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
      .replace(/_(.*?)_/g, "<em>$1</em>") // Suporte para itálico com underscores
      .replace(/~(.*?)~/g, "<del>$1</del>") // Suporte para tachado com tils
      .replace(/```(.*?)```/gs, "<pre class='code-block'><code>$1</code></pre>") // Bloco de código
      .replace(/`(.*?)`/g, "<code class='inline-code'>$1</code>") // Código inline
      .replace(/\n/g, "<br>");
    return preview;
  }

  async function editResponse(id) {
    try {
      const response = await fetch(`/api/admin/responses/${id}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success && data.data) {
        const respData = data.data;
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
        // Novos campos de delay
        document.getElementById("responseTypingDelay").value = respData.TYPING_DELAY_MS !== null ? respData.TYPING_DELAY_MS : 1000;
        document.getElementById("responseSendDelay").value = respData.RESPONSE_DELAY_MS !== null ? respData.RESPONSE_DELAY_MS : 500;


        document.getElementById("responseModalTitle").textContent = "Editar Resposta Automática";
        currentResponseId = respData.ID;
        responseModal.classList.add("show");
      } else {
        showAlert("Erro ao carregar dados da resposta: " + (data.message || "Resposta não encontrada."), "error");
      }
    } catch (error) {
      console.error("Erro ao carregar dados da resposta:", error);
      showAlert("Erro de rede ou servidor ao carregar dados da resposta.", "error");
    }
  }

  function addNewResponse() {
    responseForm.reset();
    document.getElementById("responseId").value = "";
    document.getElementById("responseActive").checked = true;
    document.getElementById("responsePriority").value = "0";
    document.getElementById("responseStartTime").value = ""; // Vazio por padrão
    document.getElementById("responseEndTime").value = "";   // Vazio por padrão
    document.getElementById("responseAllowedDays").value = "0,1,2,3,4,5,6"; // Todos os dias por padrão
    // Valores padrão para novos campos de delay
    document.getElementById("responseTypingDelay").value = 1000; // Padrão de 1 segundo
    document.getElementById("responseSendDelay").value = 500;   // Padrão de 0.5 segundos


    document.getElementById("responseModalTitle").textContent = "Nova Resposta Automática";
    currentResponseId = null;
    responseModal.classList.add("show");
    document.getElementById("responseKey").focus(); // Foco no primeiro campo
  }

  async function saveResponse() {
    const responseKey = document.getElementById("responseKey").value.trim();
    const responseName = document.getElementById("responseName").value.trim();
    const responsePattern = document.getElementById("responsePattern").value.trim();
    const responseText = document.getElementById("responseText").value.trim();

    if (!responseKey || !responseName || !responsePattern || !responseText) {
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
      start_time: document.getElementById("responseStartTime").value || null, // Envia null se vazio
      end_time: document.getElementById("responseEndTime").value || null,     // Envia null se vazio
      allowed_days: document.getElementById("responseAllowedDays").value,
      // Novos campos de delay
      typing_delay_ms: parseInt(document.getElementById("responseTypingDelay").value, 10),
      response_delay_ms: parseInt(document.getElementById("responseSendDelay").value, 10)
    };
    
    // Validação dos delays
    if (isNaN(responseData.typing_delay_ms) || responseData.typing_delay_ms < 0) {
        showAlert("Tempo de simulação de digitação inválido.", "warning");
        return;
    }
    if (isNaN(responseData.response_delay_ms) || responseData.response_delay_ms < 0) {
        showAlert("Atraso para envio inválido.", "warning");
        return;
    }


    try {
      const url = currentResponseId ? `/api/admin/responses/${currentResponseId}` : "/api/admin/responses";
      const method = currentResponseId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      if (data.success) {
        showAlert(currentResponseId ? "Resposta atualizada com sucesso!" : "Resposta criada com sucesso!", "success");
        responseModal.classList.remove("show");
        loadResponses();
      } else {
        showAlert("Erro ao salvar resposta: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("Erro ao salvar resposta:", error);
      showAlert(`Erro de rede ou servidor ao salvar resposta: ${error.message}`, "error");
    }
  }

  async function deleteResponse(id) {
    try {
      const response = await fetch(`/api/admin/responses/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        showAlert("Resposta excluída com sucesso!", "success");
        loadResponses();
      } else {
        showAlert("Erro ao excluir resposta: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error("Erro ao excluir resposta:", error);
      showAlert("Erro de rede ou servidor ao excluir resposta.", "error");
    }
  }

  function filterResponses() {
    const searchTerm = responseSearchInput.value.toLowerCase();
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
  }

  function showAlert(message, type = "info", duration = 3000) {
    const alertContainer = document.getElementById("alertContainer") || document.body; // Fallback para body
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    alertContainer.appendChild(alertElement);

    // Força reflow para aplicar a transição de entrada
    requestAnimationFrame(() => {
        alertElement.classList.add("show");
    });

    setTimeout(() => {
      alertElement.classList.remove("show");
      setTimeout(() => alertElement.remove(), 300); // Tempo para a transição de saída
    }, duration);
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  if (addResponseBtn) addResponseBtn.addEventListener("click", addNewResponse);
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => responseModal.classList.remove("show"));
  if (cancelResponseBtn) cancelResponseBtn.addEventListener("click", () => responseModal.classList.remove("show"));
  if (saveResponseBtn) saveResponseBtn.addEventListener("click", saveResponse);
  if (responseSearchInput) responseSearchInput.addEventListener("input", filterResponses);

  window.addEventListener("click", (e) => {
    if (e.target === responseModal) responseModal.classList.remove("show");
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && responseModal.classList.contains('show')) {
        responseModal.classList.remove('show');
    }
  });

  loadResponses();
});
