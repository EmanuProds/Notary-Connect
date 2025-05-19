// frontend/web/js/adminAttendants.js
document.addEventListener("DOMContentLoaded", () => {
  const funcionariosSection = document.getElementById("funcionariosSection")
  if (!funcionariosSection) return

  // Elementos da UI
  const attendantList = document.getElementById("attendantList")
  const attendantForm = document.getElementById("attendantForm")
  const attendantModal = document.getElementById("attendantModal")
  const closeModalBtn = document.getElementById("closeAttendantModal")
  const saveAttendantBtn = document.getElementById("saveAttendantBtn")
  const addAttendantBtn = document.getElementById("addAttendantBtn")
  const attendantSearchInput = document.getElementById("attendantSearchInput")

  let currentAttendantId = null
  let allAttendants = []
  let allSectors = []

  // Carregar todos os atendentes
  async function loadAttendants() {
    try {
      const response = await fetch("/api/admin/attendants")
      const data = await response.json()

      if (data.success) {
        allAttendants = data.data
        renderAttendantList(allAttendants)
      } else {
        showAlert("Erro ao carregar atendentes: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar atendentes:", error)
      showAlert("Erro ao carregar atendentes. Verifique a conexão.", "error")
    }
  }

  // Carregar todos os setores
  async function loadSectors() {
    try {
      const response = await fetch("/api/admin/sectors")
      const data = await response.json()

      if (data.success) {
        allSectors = data.data
        populateSectorCheckboxes()
      } else {
        showAlert("Erro ao carregar setores: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar setores:", error)
      showAlert("Erro ao carregar setores. Verifique a conexão.", "error")
    }
  }

  // Preencher checkboxes de setores
  function populateSectorCheckboxes() {
    const sectorContainer = document.getElementById("sectorCheckboxes")
    if (!sectorContainer) return

    sectorContainer.innerHTML = ""

    if (allSectors.length === 0) {
      sectorContainer.innerHTML = "<p>Nenhum setor cadastrado.</p>"
      return
    }

    allSectors.forEach((sector) => {
      if (sector.ACTIVE) {
        const checkboxDiv = document.createElement("div")
        checkboxDiv.className = "checkbox-item"

        checkboxDiv.innerHTML = `
          <input type="checkbox" id="sector_${sector.ID}" name="sectors" value="${sector.SECTOR_KEY}">
          <label for="sector_${sector.ID}">${escapeHTML(sector.SECTOR_NAME)}</label>
        `

        sectorContainer.appendChild(checkboxDiv)
      }
    })
  }

  // Renderizar lista de atendentes
  function renderAttendantList(attendants) {
    if (!attendantList) return

    attendantList.innerHTML = ""

    if (attendants.length === 0) {
      attendantList.innerHTML = '<div class="empty-state">Nenhum atendente encontrado.</div>'
      return
    }

    attendants.forEach((attendant) => {
      const attendantItem = document.createElement("div")
      attendantItem.className = "attendant-item"
      attendantItem.dataset.id = attendant.ID

      const adminBadge = attendant.IS_ADMIN ? '<span class="badge admin-badge">Admin</span>' : ""

      const sectors = Array.isArray(attendant.SECTOR)
        ? attendant.SECTOR.map((s) => `<span class="sector-tag">${escapeHTML(s)}</span>`).join("")
        : ""

      attendantItem.innerHTML = `
        <div class="attendant-header">
          <div class="attendant-avatar">
            ${attendant.NAME.charAt(0).toUpperCase()}
          </div>
          <div class="attendant-info">
            <h3 class="attendant-name">${escapeHTML(attendant.NAME)} ${adminBadge}</h3>
            <p class="attendant-username">@${escapeHTML(attendant.USERNAME)}</p>
          </div>
          <div class="attendant-actions">
            <button class="btn-edit" data-id="${attendant.ID}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-delete" data-id="${attendant.ID}">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
        <div class="attendant-details">
          ${
            attendant.DIRECT_CONTACT_NUMBER
              ? `
            <div class="attendant-detail">
              <span class="detail-label">Contato:</span>
              <span class="detail-value">${escapeHTML(attendant.DIRECT_CONTACT_NUMBER)}</span>
            </div>
          `
              : ""
          }
          ${
            sectors
              ? `
            <div class="attendant-detail">
              <span class="detail-label">Setores:</span>
              <div class="sector-tags">${sectors}</div>
            </div>
          `
              : ""
          }
        </div>
      `

      attendantList.appendChild(attendantItem)
    })

    // Adicionar event listeners para os botões
    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id
        editAttendant(id)
      })
    })

    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id
        if (confirm("Tem certeza que deseja excluir este atendente?")) {
          deleteAttendant(id)
        }
      })
    })
  }

  // Abrir modal para editar atendente
  async function editAttendant(id) {
    try {
      const response = await fetch(`/api/admin/attendants/${id}`)
      const data = await response.json()

      if (data.success) {
        const attendantData = data.data

        // Preencher o formulário
        document.getElementById("attendantId").value = attendantData.ID
        document.getElementById("attendantUsername").value = attendantData.USERNAME
        document.getElementById("attendantName").value = attendantData.NAME
        document.getElementById("attendantIsAdmin").checked = attendantData.IS_ADMIN
        document.getElementById("attendantPhone").value = attendantData.DIRECT_CONTACT_NUMBER || ""

        // Limpar senha (não exibimos a senha atual)
        document.getElementById("attendantPassword").value = ""
        document.getElementById("passwordNote").style.display = "block"

        // Marcar setores
        document.querySelectorAll('input[name="sectors"]').forEach((checkbox) => {
          checkbox.checked = Array.isArray(attendantData.SECTOR) && attendantData.SECTOR.includes(checkbox.value)
        })

        // Atualizar título do modal
        document.getElementById("attendantModalTitle").textContent = "Editar Atendente"

        // Armazenar ID do atendente atual
        currentAttendantId = attendantData.ID

        // Abrir modal
        attendantModal.classList.add("show")
      } else {
        showAlert("Erro ao carregar dados do atendente: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar dados do atendente:", error)
      showAlert("Erro ao carregar dados do atendente.", "error")
    }
  }

  // Abrir modal para novo atendente
  function addNewAttendant() {
    // Limpar o formulário
    attendantForm.reset()
    document.getElementById("attendantId").value = ""

    // Ocultar nota sobre senha
    document.getElementById("passwordNote").style.display = "none"

    // Atualizar título do modal
    document.getElementById("attendantModalTitle").textContent = "Novo Atendente"

    // Resetar ID do atendente atual
    currentAttendantId = null

    // Abrir modal
    attendantModal.classList.add("show")
  }

  // Salvar atendente (criar ou atualizar)
  async function saveAttendant() {
    // Validar formulário
    const username = document.getElementById("attendantUsername").value.trim()
    const name = document.getElementById("attendantName").value.trim()
    const password = document.getElementById("attendantPassword").value.trim()

    if (!username || !name) {
      showAlert("Nome de usuário e nome são obrigatórios.", "warning")
      return
    }

    if (!currentAttendantId && !password) {
      showAlert("Senha é obrigatória para novos atendentes.", "warning")
      return
    }

    // Coletar setores selecionados
    const selectedSectors = []
    document.querySelectorAll('input[name="sectors"]:checked').forEach((checkbox) => {
      selectedSectors.push(checkbox.value)
    })

    // Coletar dados do formulário
    const attendantData = {
      username,
      name,
      is_admin: document.getElementById("attendantIsAdmin").checked,
      sector: selectedSectors,
      direct_contact_number: document.getElementById("attendantPhone").value.trim(),
    }

    // Adicionar senha apenas se fornecida
    if (password) {
      attendantData.password = password
    }

    try {
      let url, method

      if (currentAttendantId) {
        // Atualizar atendente existente
        url = `/api/admin/attendants/${currentAttendantId}`
        method = "PUT"
      } else {
        // Criar novo atendente
        url = "/api/admin/attendants"
        method = "POST"
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attendantData),
      })

      const data = await response.json()

      if (data.success) {
        showAlert(currentAttendantId ? "Atendente atualizado com sucesso!" : "Atendente criado com sucesso!", "success")
        attendantModal.classList.remove("show")
        loadAttendants() // Recarregar lista
      } else {
        showAlert("Erro ao salvar atendente: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao salvar atendente:", error)
      showAlert("Erro ao salvar atendente. Verifique a conexão.", "error")
    }
  }

  // Excluir atendente
  async function deleteAttendant(id) {
    try {
      const response = await fetch(`/api/admin/attendants/${id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        showAlert("Atendente excluído com sucesso!", "success")
        loadAttendants() // Recarregar lista
      } else {
        showAlert("Erro ao excluir atendente: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao excluir atendente:", error)
      showAlert("Erro ao excluir atendente. Verifique a conexão.", "error")
    }
  }

  // Filtrar atendentes
  function filterAttendants() {
    const searchTerm = attendantSearchInput.value.toLowerCase()

    if (!searchTerm) {
      renderAttendantList(allAttendants)
      return
    }

    const filteredAttendants = allAttendants.filter((attendant) => {
      return (
        attendant.NAME.toLowerCase().includes(searchTerm) ||
        attendant.USERNAME.toLowerCase().includes(searchTerm) ||
        (attendant.DIRECT_CONTACT_NUMBER && attendant.DIRECT_CONTACT_NUMBER.toLowerCase().includes(searchTerm))
      )
    })

    renderAttendantList(filteredAttendants)
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
  if (addAttendantBtn) {
    addAttendantBtn.addEventListener("click", addNewAttendant)
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      attendantModal.classList.remove("show")
    })
  }

  if (saveAttendantBtn) {
    saveAttendantBtn.addEventListener("click", saveAttendant)
  }

  if (attendantSearchInput) {
    attendantSearchInput.addEventListener("input", filterAttendants)
  }

  // Fechar modal ao clicar fora dele
  window.addEventListener("click", (e) => {
    if (e.target === attendantModal) {
      attendantModal.classList.remove("show")
    }
  })

  // Inicializar
  loadAttendants()
  loadSectors()
})
