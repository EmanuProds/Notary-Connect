// frontend/web/js/adminResponses.js
document.addEventListener("DOMContentLoaded", () => {
  const responsesSection = document.getElementById("respostasSection")
  if (!responsesSection) return

  // Elementos da UI
  const responseList = document.getElementById("responseList")
  const responseForm = document.getElementById("responseForm")
  const responseModal = document.getElementById("responseModal")
  const closeModalBtn = document.getElementById("closeResponseModal")
  const saveResponseBtn = document.getElementById("saveResponseBtn")
  const addResponseBtn = document.getElementById("addResponseBtn")
  const responseSearchInput = document.getElementById("responseSearchInput")

  let currentResponseId = null
  let allResponses = []

  // Carregar todas as respostas
  async function loadResponses() {
    try {
      const response = await fetch("/api/admin/responses")
      const data = await response.json()

      if (data.success) {
        allResponses = data.data
        renderResponseList(allResponses)
      } else {
        showAlert("Erro ao carregar respostas: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar respostas:", error)
      showAlert("Erro ao carregar respostas. Verifique a conexão.", "error")
    }
  }

  // Renderizar lista de respostas
  function renderResponseList(responses) {
    if (!responseList) return

    responseList.innerHTML = ""

    if (responses.length === 0) {
      responseList.innerHTML = '<div class="empty-state">Nenhuma resposta automática encontrada.</div>'
      return
    }

    responses.forEach((response) => {
      const responseItem = document.createElement("div")
      responseItem.className = "response-item"
      responseItem.dataset.id = response.ID

      const activeClass = response.ACTIVE ? "active" : "inactive"

      responseItem.innerHTML = `
        <div class="response-header">
          <h3 class="response-name">${escapeHTML(response.RESPONSE_NAME)}</h3>
          <div class="response-actions">
            <span class="response-status ${activeClass}">${response.ACTIVE ? "Ativo" : "Inativo"}</span>
            <button class="btn-edit" data-id="${response.ID}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-delete" data-id="${response.ID}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="response-details">
          <div class="response-detail">
            <span class="detail-label">Chave:</span>
            <span class="detail-value">${escapeHTML(response.RESPONSE_KEY)}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Padrão:</span>
            <span class="detail-value code">${escapeHTML(response.PATTERN)}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Prioridade:</span>
            <span class="detail-value">${response.PRIORITY}</span>
          </div>
          <div class="response-detail">
            <span class="detail-label">Horário:</span>
            <span class="detail-value">${response.START_TIME} - ${response.END_TIME}</span>
          </div>
          <div class="response-preview">
            <span class="detail-label">Resposta:</span>
            <div class="preview-text">${formatMessagePreview(response.RESPONSE_TEXT)}</div>
          </div>
        </div>
      `

      responseList.appendChild(responseItem)
    })

    // Adicionar event listeners para os botões
    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id
        editResponse(id)
      })
    })

    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id
        if (confirm("Tem certeza que deseja excluir esta resposta automática?")) {
          deleteResponse(id)
        }
      })
    })
  }

  // Formatar preview da mensagem
  function formatMessagePreview(text) {
    if (!text) return ""

    // Limitar a 150 caracteres
    let preview = text.length > 150 ? text.substring(0, 150) + "..." : text

    // Escapar HTML
    preview = escapeHTML(preview)

    // Formatar markdown básico
    preview = preview
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/```(.*?)```/g, "<code>$1</code>")
      .replace(/\n/g, "<br>")

    return preview
  }

  // Abrir modal para editar resposta
  async function editResponse(id) {
    try {
      const response = await fetch(`/api/admin/responses/${id}`)
      const data = await response.json()

      if (data.success) {
        const responseData = data.data

        // Preencher o formulário
        document.getElementById("responseId").value = responseData.ID
        document.getElementById("responseKey").value = responseData.RESPONSE_KEY
        document.getElementById("responseName").value = responseData.RESPONSE_NAME
        document.getElementById("responsePattern").value = responseData.PATTERN
        document.getElementById("responseText").value = responseData.RESPONSE_TEXT
        document.getElementById("responsePriority").value = responseData.PRIORITY
        document.getElementById("responseActive").checked = responseData.ACTIVE === 1
        document.getElementById("responseStartTime").value = responseData.START_TIME
        document.getElementById("responseEndTime").value = responseData.END_TIME
        document.getElementById("responseAllowedDays").value = responseData.ALLOWED_DAYS

        // Atualizar título do modal
        document.getElementById("responseModalTitle").textContent = "Editar Resposta Automática"

        // Armazenar ID da resposta atual
        currentResponseId = responseData.ID

        // Abrir modal
        responseModal.classList.add("show")
      } else {
        showAlert("Erro ao carregar dados da resposta: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar dados da resposta:", error)
      showAlert("Erro ao carregar dados da resposta.", "error")
    }
  }

  // Abrir modal para nova resposta
  function addNewResponse() {
    // Limpar o formulário
    responseForm.reset()
    document.getElementById("responseId").value = ""
    document.getElementById("responseActive").checked = true
    document.getElementById("responsePriority").value = "0"
    document.getElementById("responseStartTime").value = "00:00"
    document.getElementById("responseEndTime").value = "23:59"
    document.getElementById("responseAllowedDays").value = "1,2,3,4,5,6,0"

    // Atualizar título do modal
    document.getElementById("responseModalTitle").textContent = "Nova Resposta Automática"

    // Resetar ID da resposta atual
    currentResponseId = null

    // Abrir modal
    responseModal.classList.add("show")
  }

  // Salvar resposta (criar ou atualizar)
  async function saveResponse() {
    // Validar formulário
    const responseKey = document.getElementById("responseKey").value.trim()
    const responseName = document.getElementById("responseName").value.trim()
    const responsePattern = document.getElementById("responsePattern").value.trim()
    const responseText = document.getElementById("responseText").value.trim()

    if (!responseKey || !responseName || !responsePattern || !responseText) {
      showAlert("Preencha todos os campos obrigatórios.", "warning")
      return
    }

    // Coletar dados do formulário
    const responseData = {
      response_key: responseKey,
      response_name: responseName,
      pattern: responsePattern,
      response_text: responseText,
      active: document.getElementById("responseActive").checked,
      priority: Number.parseInt(document.getElementById("responsePriority").value) || 0,
      start_time: document.getElementById("responseStartTime").value,
      end_time: document.getElementById("responseEndTime").value,
      allowed_days: document.getElementById("responseAllowedDays").value,
    }

    try {
      let url, method

      if (currentResponseId) {
        // Atualizar resposta existente
        url = `/api/admin/responses/${currentResponseId}`
        method = "PUT"
      } else {
        // Criar nova resposta
        url = "/api/admin/responses"
        method = "POST"
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(responseData),
      })

      const data = await response.json()

      if (data.success) {
        showAlert(currentResponseId ? "Resposta atualizada com sucesso!" : "Resposta criada com sucesso!", "success")
        responseModal.classList.remove("show")
        loadResponses() // Recarregar lista
      } else {
        showAlert("Erro ao salvar resposta: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao salvar resposta:", error)
      showAlert("Erro ao salvar resposta. Verifique a conexão.", "error")
    }
  }

  // Excluir resposta
  async function deleteResponse(id) {
    try {
      const response = await fetch(`/api/admin/responses/${id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        showAlert("Resposta excluída com sucesso!", "success")
        loadResponses() // Recarregar lista
      } else {
        showAlert("Erro ao excluir resposta: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao excluir resposta:", error)
      showAlert("Erro ao excluir resposta. Verifique a conexão.", "error")
    }
  }

  // Filtrar respostas
  function filterResponses() {
    const searchTerm = responseSearchInput.value.toLowerCase()

    if (!searchTerm) {
      renderResponseList(allResponses)
      return
    }

    const filteredResponses = allResponses.filter((response) => {
      return (
        response.RESPONSE_NAME.toLowerCase().includes(searchTerm) ||
        response.RESPONSE_KEY.toLowerCase().includes(searchTerm) ||
        response.PATTERN.toLowerCase().includes(searchTerm) ||
        response.RESPONSE_TEXT.toLowerCase().includes(searchTerm)
      )
    })

    renderResponseList(filteredResponses)
  }

  // Mostrar alerta
  function showAlert(message, type = "info") {
    const alertElement = document.createElement("div")
    alertElement.className = `alert alert-${type}`
    alertElement.textContent = message

    const alertContainer = document.getElementById("alertContainer") || document.body
    alertContainer.appendChild(alertElement)

    setTimeout(() => {
      alertElement.classList.add("show")
    }, 10)

    setTimeout(() => {
      alertElement.classList.remove("show")
      setTimeout(() => alertElement.remove(), 300)
    }, 3000)
  }

  // Função auxiliar para escapar HTML
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

  // Event Listeners
  if (addResponseBtn) {
    addResponseBtn.addEventListener("click", addNewResponse)
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      responseModal.classList.remove("show")
    })
  }

  if (saveResponseBtn) {
    saveResponseBtn.addEventListener("click", saveResponse)
  }

  if (responseSearchInput) {
    responseSearchInput.addEventListener("input", filterResponses)
  }

  // Fechar modal ao clicar fora dele
  window.addEventListener("click", (e) => {
    if (e.target === responseModal) {
      responseModal.classList.remove("show")
    }
  })

  // Inicializar
  loadResponses()
})
