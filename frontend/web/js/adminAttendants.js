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
  const cancelAttendantBtn = document.getElementById("cancelAttendantBtn"); // Botão de cancelar no modal

  let currentAttendantId = null
  let allAttendants = []
  let allSectors = []

  // Carregar todos os atendentes/usuários
  async function loadAttendants() {
    try {
      // CORREÇÃO: Alterado endpoint de /api/admin/attendants para /api/admin/users
      const response = await fetch("/api/admin/users"); 
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();

      if (data.success) {
        allAttendants = data.data;
        renderAttendantList(allAttendants);
      } else {
        showAlert("Erro ao carregar usuários: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      showAlert(`Erro de rede ou servidor ao carregar usuários: ${error.message}`, "error");
    }
  }

  // Carregar todos os setores
  async function loadSectors() {
    try {
      const response = await fetch("/api/admin/sectors");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();

      if (data.success) {
        allSectors = data.data;
        populateSectorCheckboxes();
      } else {
        showAlert("Erro ao carregar setores: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("Erro ao carregar setores:", error);
      showAlert(`Erro de rede ou servidor ao carregar setores: ${error.message}`, "error");
    }
  }

  // Preencher checkboxes de setores
  function populateSectorCheckboxes() {
    const sectorContainer = document.getElementById("sectorCheckboxes");
    if (!sectorContainer) return;

    sectorContainer.innerHTML = "";

    if (!allSectors || allSectors.length === 0) {
      sectorContainer.innerHTML = "<p>Nenhum setor cadastrado. Crie setores na respectiva aba.</p>";
      return;
    }

    allSectors.forEach((sector) => {
      if (sector.ACTIVE) { // Considerar apenas setores ativos para atribuição
        const checkboxDiv = document.createElement("div");
        checkboxDiv.className = "checkbox-item";

        checkboxDiv.innerHTML = `
          <input type="checkbox" id="sector_${sector.ID}" name="sectors" value="${sector.SECTOR_KEY}">
          <label for="sector_${sector.ID}">${escapeHTML(sector.SECTOR_NAME)}</label>
        `;
        sectorContainer.appendChild(checkboxDiv);
      }
    });
  }

  // Renderizar lista de atendentes
  function renderAttendantList(attendants) {
    if (!attendantList) return;
    attendantList.innerHTML = "";

    if (!attendants || attendants.length === 0) {
      attendantList.innerHTML = '<div class="empty-state">Nenhum funcionário/usuário encontrado. Clique em "Novo Funcionário" para adicionar.</div>';
      return;
    }

    attendants.forEach((attendant) => {
      const attendantItem = document.createElement("div");
      attendantItem.className = "attendant-item";
      attendantItem.dataset.id = attendant.ID;

      const adminBadge = attendant.IS_ADMIN ? '<span class="badge admin-badge">Admin</span>' : "";
      const sectors = Array.isArray(attendant.SECTOR) && attendant.SECTOR.length > 0
        ? attendant.SECTOR.map((sKey) => {
            const sectorObj = allSectors.find(s => s.SECTOR_KEY === sKey);
            return `<span class="sector-tag">${escapeHTML(sectorObj ? sectorObj.SECTOR_NAME : sKey)}</span>`;
          }).join("")
        : '<span class="detail-value-muted">Nenhum</span>';


      attendantItem.innerHTML = `
        <div class="attendant-header">
          <div class="attendant-avatar">
            ${escapeHTML(attendant.NAME.charAt(0).toUpperCase())}
          </div>
          <div class="attendant-info">
            <h3 class="attendant-name">${escapeHTML(attendant.NAME)} ${adminBadge}</h3>
            <p class="attendant-username">@${escapeHTML(attendant.USERNAME)}</p>
          </div>
          <div class="attendant-actions">
            <button class="btn-edit" data-id="${attendant.ID}" aria-label="Editar">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-delete" data-id="${attendant.ID}" aria-label="Excluir">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </div>
        <div class="attendant-details">
          ${attendant.DIRECT_CONTACT_NUMBER ? `
            <div class="attendant-detail">
              <span class="detail-label">Contato Direto:</span>
              <span class="detail-value">${escapeHTML(attendant.DIRECT_CONTACT_NUMBER)}</span>
            </div>
          ` : ""}
          <div class="attendant-detail">
            <span class="detail-label">Setores:</span>
            <div class="sector-tags">${sectors}</div>
          </div>
        </div>
      `;
      attendantList.appendChild(attendantItem);
    });

    addEventListenersToButtons();
  }
  
  function addEventListenersToButtons() {
    document.querySelectorAll(".attendant-item .btn-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => editAttendant(e.currentTarget.dataset.id));
    });
    document.querySelectorAll(".attendant-item .btn-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (confirm("Tem certeza que deseja excluir este funcionário? Esta ação não pode ser desfeita.")) {
          deleteAttendant(e.currentTarget.dataset.id);
        }
      });
    });
  }

  // Abrir modal para editar atendente
  async function editAttendant(id) {
    try {
      // CORREÇÃO: Alterado endpoint de /api/admin/attendants para /api/admin/users
      const response = await fetch(`/api/admin/users/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();

      if (data.success && data.data) {
        const attendantData = data.data;
        document.getElementById("attendantId").value = attendantData.ID;
        document.getElementById("attendantUsername").value = attendantData.USERNAME;
        document.getElementById("attendantName").value = attendantData.NAME;
        document.getElementById("attendantIsAdmin").checked = attendantData.IS_ADMIN; // IS_ADMIN já deve ser booleano
        document.getElementById("attendantPhone").value = attendantData.DIRECT_CONTACT_NUMBER || "";
        document.getElementById("attendantPassword").value = "";
        document.getElementById("passwordNote").style.display = "block";

        document.querySelectorAll('input[name="sectors"]').forEach((checkbox) => {
          checkbox.checked = Array.isArray(attendantData.SECTOR) && attendantData.SECTOR.includes(checkbox.value);
        });

        document.getElementById("attendantModalTitle").textContent = "Editar Funcionário";
        currentAttendantId = attendantData.ID;
        attendantModal.classList.add("show");
      } else {
        showAlert("Erro ao carregar dados do funcionário: " + (data.message || "Usuário não encontrado."), "error");
      }
    } catch (error) {
      console.error("Erro ao carregar dados do funcionário:", error);
      showAlert(`Erro de rede ou servidor ao carregar dados do funcionário: ${error.message}`, "error");
    }
  }

  // Abrir modal para novo atendente
  function addNewAttendant() {
    attendantForm.reset();
    document.getElementById("attendantId").value = "";
    document.getElementById("attendantIsAdmin").checked = false; // Padrão para novo usuário
    document.getElementById("passwordNote").style.display = "none";
    document.getElementById("attendantModalTitle").textContent = "Novo Funcionário";
    currentAttendantId = null;
    attendantModal.classList.add("show");
    document.getElementById("attendantUsername").focus();
  }

  // Salvar atendente (criar ou atualizar)
  async function saveAttendant() {
    const username = document.getElementById("attendantUsername").value.trim();
    const name = document.getElementById("attendantName").value.trim();
    const password = document.getElementById("attendantPassword").value.trim();

    if (!username || !name) {
      showAlert("Nome de usuário e nome completo são obrigatórios.", "warning");
      return;
    }
    if (!currentAttendantId && !password) {
      showAlert("Senha é obrigatória para novos funcionários.", "warning");
      return;
    }
    if (password && password.length < 6) {
      showAlert("A senha deve ter no mínimo 6 caracteres.", "warning");
      return;
    }

    const selectedSectors = [];
    document.querySelectorAll('input[name="sectors"]:checked').forEach((checkbox) => {
      selectedSectors.push(checkbox.value);
    });

    const attendantData = {
      username, // O backend espera 'username' em minúsculas para consistência com o login
      name,
      is_admin: document.getElementById("attendantIsAdmin").checked,
      sector: selectedSectors.length > 0 ? selectedSectors : null, // Envia null se nenhum setor selecionado
      direct_contact_number: document.getElementById("attendantPhone").value.trim() || null,
    };

    if (password) {
      attendantData.password = password; // A senha será hasheada no backend se for um novo usuário ou se for alterada
    }

    try {
      // CORREÇÃO: Alterado endpoint de /api/admin/attendants para /api/admin/users
      const url = currentAttendantId ? `/api/admin/users/${currentAttendantId}` : "/api/admin/users";
      const method = currentAttendantId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attendantData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      
      const data = await response.json();

      if (data.success) {
        showAlert(currentAttendantId ? "Funcionário atualizado com sucesso!" : "Funcionário criado com sucesso!", "success");
        attendantModal.classList.remove("show");
        loadAttendants(); 
      } else {
        showAlert("Erro ao salvar funcionário: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("Erro ao salvar funcionário:", error);
      showAlert(`Erro de rede ou servidor ao salvar funcionário: ${error.message}`, "error");
    }
  }

  // Excluir atendente
  async function deleteAttendant(id) {
    try {
      // CORREÇÃO: Alterado endpoint de /api/admin/attendants para /api/admin/users
      const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();

      if (data.success) {
        showAlert("Funcionário excluído com sucesso!", "success");
        loadAttendants(); 
      } else {
        showAlert("Erro ao excluir funcionário: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error("Erro ao excluir funcionário:", error);
      showAlert(`Erro de rede ou servidor ao excluir funcionário: ${error.message}`, "error");
    }
  }

  // Filtrar atendentes
  function filterAttendants() {
    const searchTerm = attendantSearchInput.value.toLowerCase();
    if (!searchTerm) {
      renderAttendantList(allAttendants);
      return;
    }
    const filteredAttendants = allAttendants.filter(
      (attendant) =>
        (attendant.NAME && attendant.NAME.toLowerCase().includes(searchTerm)) ||
        (attendant.USERNAME && attendant.USERNAME.toLowerCase().includes(searchTerm)) ||
        (attendant.DIRECT_CONTACT_NUMBER && attendant.DIRECT_CONTACT_NUMBER.toLowerCase().includes(searchTerm)) ||
        (Array.isArray(attendant.SECTOR) && attendant.SECTOR.some(sKey => {
            const sectorObj = allSectors.find(s => s.SECTOR_KEY === sKey);
            return sectorObj && sectorObj.SECTOR_NAME.toLowerCase().includes(searchTerm);
        }))
    );
    renderAttendantList(filteredAttendants);
  }

  // Mostrar alerta
  function showAlert(message, type = "info", duration = 3500) {
    const alertContainer = document.getElementById("alertContainer") || document.body;
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    
    // Remove alertas antigos do mesmo tipo para evitar sobreposição excessiva
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

  // Função auxiliar para escapar HTML
  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  // Event Listeners
  if (addAttendantBtn) addAttendantBtn.addEventListener("click", addNewAttendant);
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => attendantModal.classList.remove("show"));
  if (cancelAttendantBtn) cancelAttendantBtn.addEventListener("click", () => attendantModal.classList.remove("show"));
  if (saveAttendantBtn) saveAttendantBtn.addEventListener("click", saveAttendant);
  if (attendantSearchInput) attendantSearchInput.addEventListener("input", filterAttendants);

  window.addEventListener("click", (e) => {
    if (e.target === attendantModal) attendantModal.classList.remove("show");
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && attendantModal.classList.contains('show')) {
        attendantModal.classList.remove('show');
    }
  });

  // Inicializar
  loadSectors().then(() => { // Garante que os setores sejam carregados antes dos atendentes para renderização correta
    loadAttendants();
  });
});
