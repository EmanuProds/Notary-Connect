// frontend/web/js/adminAttendants.js
(function() { // IIFE para encapsular o escopo
  console.log("[AdminAttendants] Script adminAttendants.js INICIADO (execução direta).");

  const funcionariosSection = document.getElementById("funcionariosSection");
  if (!funcionariosSection) {
    console.warn("[AdminAttendants] Seção de funcionários ('funcionariosSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminAttendants] Seção de funcionários encontrada.");

  const attendantList = document.getElementById("attendantList");
  const attendantForm = document.getElementById("attendantForm");
  const attendantModal = document.getElementById("attendantModal");
  const closeModalBtn = document.getElementById("closeAttendantModal");
  const saveAttendantBtn = document.getElementById("saveAttendantBtn"); // Para verificar existência, evento no form
  const addAttendantBtn = document.getElementById("addAttendantBtn");
  const attendantSearchInput = document.getElementById("attendantSearchInput");
  const cancelAttendantBtn = document.getElementById("cancelAttendantBtn");

  if (!attendantList || !attendantForm || !attendantModal || !closeModalBtn || !saveAttendantBtn || !addAttendantBtn || !attendantSearchInput || !cancelAttendantBtn) {
    console.error("[AdminAttendants] ERRO CRÍTICO: Um ou mais elementos da UI para Funcionários não foram encontrados. Verifique os IDs no HTML.");
    return;
  }
  console.log("[AdminAttendants] Todos os elementos da UI para Funcionários foram referenciados.");

  let currentAttendantId = null;
  let allAttendants = [];
  let allSectors = [];

  async function loadAttendants() {
    console.log("[AdminAttendants] loadAttendants: Iniciando carregamento de usuários...");
    try {
      console.log("[AdminAttendants] loadAttendants: Realizando fetch para /api/admin/users");
      const response = await fetch("/api/admin/users");
      console.log("[AdminAttendants] loadAttendants: Resposta do fetch recebida, status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error("[AdminAttendants] loadAttendants: Erro na resposta do fetch:", errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log("[AdminAttendants] loadAttendants: Dados JSON parseados:", data);

      if (data.success) {
        allAttendants = data.data;
        console.log("[AdminAttendants] loadAttendants: Usuários carregados com sucesso:", allAttendants.length, "usuários.");
        renderAttendantList(allAttendants);
      } else {
        console.warn("[AdminAttendants] loadAttendants: Erro ao carregar usuários (data.success = false):", data.message);
        showAlert("Erro ao carregar usuários: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminAttendants] loadAttendants: Falha crítica ao carregar usuários:", error);
      showAlert(`Erro de rede ou servidor ao carregar usuários: ${error.message}`, "error");
    }
  }

  async function loadSectors() {
    console.log("[AdminAttendants] loadSectors: Iniciando carregamento de setores...");
    try {
      console.log("[AdminAttendants] loadSectors: Realizando fetch para /api/admin/sectors");
      const response = await fetch("/api/admin/sectors");
      console.log("[AdminAttendants] loadSectors: Resposta do fetch recebida, status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error("[AdminAttendants] loadSectors: Erro na resposta do fetch:", errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log("[AdminAttendants] loadSectors: Dados JSON parseados:", data);

      if (data.success) {
        allSectors = data.data;
        console.log("[AdminAttendants] loadSectors: Setores carregados com sucesso:", allSectors.length, "setores.");
        populateSectorCheckboxes();
      } else {
        console.warn("[AdminAttendants] loadSectors: Erro ao carregar setores (data.success = false):", data.message);
        showAlert("Erro ao carregar setores: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("[AdminAttendants] loadSectors: Falha crítica ao carregar setores:", error);
      showAlert(`Erro de rede ou servidor ao carregar setores: ${error.message}`, "error");
    }
  }

  function populateSectorCheckboxes() {
    console.log("[AdminAttendants] populateSectorCheckboxes: Populando checkboxes de setores.");
    const sectorContainer = document.getElementById("sectorCheckboxes");
    if (!sectorContainer) {
        console.error("[AdminAttendants] populateSectorCheckboxes: Container de checkboxes de setor não encontrado.");
        return;
    }
    sectorContainer.innerHTML = "";

    if (!allSectors || allSectors.length === 0) {
      console.log("[AdminAttendants] populateSectorCheckboxes: Nenhum setor para popular.");
      sectorContainer.innerHTML = "<p>Nenhum setor cadastrado. Crie setores na respectiva aba.</p>";
      return;
    }

    allSectors.forEach((sector) => {
      if (sector.ACTIVE) {
        const checkboxDiv = document.createElement("div");
        checkboxDiv.className = "checkbox-item";
        checkboxDiv.innerHTML = `
          <input type="checkbox" id="sector_${sector.ID}" name="sectors" value="${sector.SECTOR_KEY}">
          <label for="sector_${sector.ID}">${escapeHTML(sector.SECTOR_NAME)}</label>
        `;
        sectorContainer.appendChild(checkboxDiv);
      }
    });
    console.log("[AdminAttendants] populateSectorCheckboxes: Checkboxes de setores populados.");
  }

  function renderAttendantList(attendants) {
    console.log("[AdminAttendants] renderAttendantList: Renderizando lista com", attendants ? attendants.length : 0, "funcionários.");
    if (!attendantList) {
        console.error("[AdminAttendants] renderAttendantList: Elemento attendantList não encontrado.");
        return;
    }
    attendantList.innerHTML = "";

    if (!attendants || attendants.length === 0) {
      console.log("[AdminAttendants] renderAttendantList: Nenhum funcionário para renderizar.");
      attendantList.innerHTML = '<div class="empty-state">Nenhum funcionário/usuário encontrado. Clique em "Novo Funcionário" para adicionar.</div>';
      return;
    }

    attendants.forEach((attendant) => {
      const attendantItem = document.createElement("div");
      attendantItem.className = "attendant-item list-item"; // Adicionando classe genérica
      attendantItem.dataset.id = attendant.ID;

      const adminBadge = attendant.IS_ADMIN ? '<span class="status-badge admin">Admin</span>' : ""; // Usando status-badge
      const sectors = Array.isArray(attendant.SECTOR) && attendant.SECTOR.length > 0
        ? attendant.SECTOR.map((sKey) => {
            const sectorObj = allSectors.find(s => s.SECTOR_KEY === sKey);
            return `<span class="sector-tag">${escapeHTML(sectorObj ? sectorObj.SECTOR_NAME : sKey)}</span>`;
          }).join("")
        : '<span class="detail-value-muted">Nenhum</span>';

      attendantItem.innerHTML = `
        <div class="list-item-header attendant-header"> <div class="attendant-avatar">
            ${escapeHTML(attendant.NAME.charAt(0).toUpperCase())}
          </div>
          <div class="attendant-info">
            <h4>${escapeHTML(attendant.NAME)} ${adminBadge}</h4> <p class="attendant-username">@${escapeHTML(attendant.USERNAME)}</p>
          </div>
          <div class="item-actions attendant-actions"> <button class="icon-button btn-edit-attendant" data-id="${attendant.ID}" aria-label="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="icon-button btn-delete-attendant" data-id="${attendant.ID}" aria-label="Excluir">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
        <div class="list-item-body attendant-details"> ${attendant.DIRECT_CONTACT_NUMBER ? `
            <p><strong>Contato Direto:</strong> ${escapeHTML(attendant.DIRECT_CONTACT_NUMBER)}</p>
          ` : ""}
          <p><strong>Setores:</strong> <span class="sector-tags">${sectors}</span></p>
        </div>
      `;
      attendantList.appendChild(attendantItem);
    });

    addEventListenersToItemButtons();
    console.log("[AdminAttendants] renderAttendantList: Lista de funcionários renderizada.");
  }
  
  function addEventListenersToItemButtons() {
    console.log("[AdminAttendants] addEventListenersToItemButtons: Adicionando listeners aos botões de editar/excluir.");
    document.querySelectorAll(".btn-edit-attendant").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        console.log("[AdminAttendants] Botão EDITAR funcionário clicado, ID:", e.currentTarget.dataset.id);
        editAttendant(e.currentTarget.dataset.id);
      });
    });
    document.querySelectorAll(".btn-delete-attendant").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const attendantId = e.currentTarget.dataset.id;
        console.log("[AdminAttendants] Botão EXCLUIR funcionário clicado, ID:", attendantId);
        if (confirm("Tem certeza que deseja excluir este funcionário? Esta ação não pode ser desfeita.")) {
          console.log("[AdminAttendants] Confirmação de exclusão para ID:", attendantId);
          deleteAttendant(attendantId);
        } else {
          console.log("[AdminAttendants] Exclusão cancelada para ID:", attendantId);
        }
      });
    });
  }

  async function editAttendant(id) {
    console.log(`[AdminAttendants] editAttendant: Editando funcionário ID: ${id}`);
    try {
      console.log(`[AdminAttendants] editAttendant: Realizando fetch para /api/admin/users/${id}`);
      const response = await fetch(`/api/admin/users/${id}`);
      console.log(`[AdminAttendants] editAttendant: Resposta do fetch para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminAttendants] editAttendant: Erro na resposta do fetch para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminAttendants] editAttendant: Dados JSON parseados para ID ${id}:`, data);

      if (data.success && data.data) {
        const attendantData = data.data;
        console.log(`[AdminAttendants] editAttendant: Populando formulário com dados do funcionário ID ${id}.`);
        document.getElementById("attendantId").value = attendantData.ID;
        document.getElementById("attendantUsername").value = attendantData.USERNAME;
        document.getElementById("attendantName").value = attendantData.NAME;
        document.getElementById("attendantIsAdmin").checked = attendantData.IS_ADMIN === 1 || attendantData.IS_ADMIN === true;
        document.getElementById("attendantPhone").value = attendantData.DIRECT_CONTACT_NUMBER || "";
        document.getElementById("attendantPassword").value = "";
        document.getElementById("passwordNote").style.display = "block";

        document.querySelectorAll('input[name="sectors"]').forEach((checkbox) => {
          checkbox.checked = Array.isArray(attendantData.SECTOR) && attendantData.SECTOR.includes(checkbox.value);
        });

        document.getElementById("attendantModalTitle").textContent = "Editar Funcionário";
        currentAttendantId = attendantData.ID;
        if (attendantModal) attendantModal.classList.add("show"); else console.error("[AdminAttendants] editAttendant: attendantModal é nulo!");
        console.log(`[AdminAttendants] editAttendant: Modal de edição exibido para funcionário ID ${id}.`);
      } else {
        console.warn(`[AdminAttendants] editAttendant: Erro ao carregar dados do funcionário ID ${id} (data.success = false ou sem data):`, data.message);
        showAlert("Erro ao carregar dados do funcionário: " + (data.message || "Usuário não encontrado."), "error");
      }
    } catch (error) {
      console.error(`[AdminAttendants] editAttendant: Falha crítica ao carregar dados do funcionário ID ${id}:`, error);
      showAlert(`Erro de rede ou servidor ao carregar dados do funcionário: ${error.message}`, "error");
    }
  }

  function addNewAttendant() {
    console.log("[AdminAttendants] addNewAttendant: Abrindo modal para novo funcionário.");
    if (attendantForm) attendantForm.reset(); else console.error("[AdminAttendants] addNewAttendant: attendantForm é nulo!");
    document.getElementById("attendantId").value = "";
    document.getElementById("attendantIsAdmin").checked = false;
    document.getElementById("passwordNote").style.display = "none";
    document.getElementById("attendantModalTitle").textContent = "Novo Funcionário";
    currentAttendantId = null;
    if (attendantModal) attendantModal.classList.add("show"); else console.error("[AdminAttendants] addNewAttendant: attendantModal é nulo!");
    document.getElementById("attendantUsername").focus();
    console.log("[AdminAttendants] addNewAttendant: Modal para novo funcionário exibido.");
  }

  async function saveAttendant(event) {
    console.log("[AdminAttendants] saveAttendant: Função saveAttendant INICIADA.");
    if (event) {
        console.log("[AdminAttendants] saveAttendant: Evento de submit recebido, prevenindo default.");
        event.preventDefault(); 
    } else {
        console.warn("[AdminAttendants] saveAttendant: Função chamada sem evento.");
    }

    const username = document.getElementById("attendantUsername").value.trim();
    const name = document.getElementById("attendantName").value.trim();
    const password = document.getElementById("attendantPassword").value.trim();
    console.log("[AdminAttendants] saveAttendant: Dados brutos do formulário:", { username, name, password_length: password.length });

    if (!username || !name) {
      console.warn("[AdminAttendants] saveAttendant: Nome de usuário e nome completo são obrigatórios.");
      showAlert("Nome de usuário e nome completo são obrigatórios.", "warning");
      return;
    }
    if (!currentAttendantId && !password) {
      console.warn("[AdminAttendants] saveAttendant: Senha é obrigatória para novos funcionários.");
      showAlert("Senha é obrigatória para novos funcionários.", "warning");
      return;
    }
    if (password && password.length < 6) {
      console.warn("[AdminAttendants] saveAttendant: Senha muito curta.");
      showAlert("A senha deve ter no mínimo 6 caracteres.", "warning");
      return;
    }

    const selectedSectors = [];
    document.querySelectorAll('input[name="sectors"]:checked').forEach((checkbox) => {
      selectedSectors.push(checkbox.value);
    });
    console.log("[AdminAttendants] saveAttendant: Setores selecionados:", selectedSectors);

    const attendantData = {
      username,
      name,
      is_admin: document.getElementById("attendantIsAdmin").checked,
      sector: selectedSectors.length > 0 ? selectedSectors : null,
      direct_contact_number: document.getElementById("attendantPhone").value.trim() || null,
    };

    if (password) {
      attendantData.password = password;
    }
    console.log("[AdminAttendants] saveAttendant: Dados formatados para envio:", JSON.stringify(attendantData));

    try {
      const url = currentAttendantId ? `/api/admin/users/${currentAttendantId}` : "/api/admin/users";
      const method = currentAttendantId ? "PUT" : "POST";
      console.log(`[AdminAttendants] saveAttendant: Enviando ${method} para ${url}`);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attendantData),
      });
      console.log(`[AdminAttendants] saveAttendant: Resposta do fetch para ${url}, status:`, response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminAttendants] saveAttendant: Erro na resposta do fetch (${url}):`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("[AdminAttendants] saveAttendant: Resultado do backend:", data);

      if (data.success) {
        showAlert(currentAttendantId ? "Funcionário atualizado com sucesso!" : "Funcionário criado com sucesso!", "success");
        if (attendantModal) attendantModal.classList.remove("show"); else console.error("[AdminAttendants] saveAttendant: attendantModal é nulo ao tentar fechar.");
        loadAttendants(); 
        console.log("[AdminAttendants] saveAttendant: Funcionário salvo com sucesso, modal fechado, lista recarregada.");
      } else {
        console.warn("[AdminAttendants] saveAttendant: Erro ao salvar funcionário (backend informou erro):", data.message);
        showAlert("Erro ao salvar funcionário: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminAttendants] saveAttendant: Falha crítica ao salvar funcionário:", error);
      showAlert(`Erro de rede ou servidor ao salvar funcionário: ${error.message}`, "error");
    }
    console.log("[AdminAttendants] saveAttendant: Função saveAttendant CONCLUÍDA.");
  }

  async function deleteAttendant(id) {
    console.log(`[AdminAttendants] deleteAttendant: Excluindo funcionário ID: ${id}`);
    try {
      console.log(`[AdminAttendants] deleteAttendant: Realizando fetch DELETE para /api/admin/users/${id}`);
      const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      console.log(`[AdminAttendants] deleteAttendant: Resposta do fetch DELETE para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminAttendants] deleteAttendant: Erro na resposta do fetch DELETE para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminAttendants] deleteAttendant: Resultado do backend para exclusão ID ${id}:`, data);

      if (data.success) {
        showAlert("Funcionário excluído com sucesso!", "success");
        loadAttendants(); 
        console.log(`[AdminAttendants] deleteAttendant: Funcionário ID ${id} excluído, lista recarregada.`);
      } else {
        console.warn(`[AdminAttendants] deleteAttendant: Erro ao excluir funcionário ID ${id} (backend informou erro):`, data.message);
        showAlert("Erro ao excluir funcionário: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error(`[AdminAttendants] deleteAttendant: Falha crítica ao excluir funcionário ID ${id}:`, error);
      showAlert(`Erro de rede ou servidor ao excluir funcionário: ${error.message}`, "error");
    }
  }

  function filterAttendants() {
    const searchTerm = attendantSearchInput.value.toLowerCase();
    console.log("[AdminAttendants] filterAttendants: Filtrando funcionários com termo:", searchTerm);
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
    console.log("[AdminAttendants] filterAttendants: Filtro aplicado, renderizados", filteredAttendants.length, "funcionários.");
  }

  function showAlert(message, type = "info", duration = 3500) {
    console.log(`[AdminAttendants] showAlert: Tipo: ${type}, Mensagem: ${message}`);
    const alertContainer = document.getElementById("alertContainer") || document.body;
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

  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  console.log("[AdminAttendants] Adicionando event listeners principais...");
  if (addAttendantBtn) addAttendantBtn.addEventListener("click", addNewAttendant);
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => {
    console.log("[AdminAttendants] Botão Fechar Modal clicado.");
    if (attendantModal) attendantModal.classList.remove("show");
  });
  if (cancelAttendantBtn) cancelAttendantBtn.addEventListener("click", () => {
    console.log("[AdminAttendants] Botão Cancelar Modal clicado.");
    if (attendantModal) attendantModal.classList.remove("show");
  });
  
  if (attendantForm) {
    attendantForm.addEventListener("submit", saveAttendant);
    console.log("[AdminAttendants] Event listener de 'submit' ADICIONADO ao attendantForm.");
  } else {
    console.error("[AdminAttendants] attendantForm não encontrado, não foi possível adicionar event listener de submit.");
  }

  if (attendantSearchInput) attendantSearchInput.addEventListener("input", filterAttendants);

  window.addEventListener("click", (e) => {
    if (attendantModal && e.target === attendantModal) {
        console.log("[AdminAttendants] Clique fora do modal detectado.");
        attendantModal.classList.remove("show");
    }
  });
  window.addEventListener('keydown', (e) => {
    if (attendantModal && e.key === 'Escape' && attendantModal.classList.contains('show')) {
        console.log("[AdminAttendants] Tecla Escape pressionada, fechando modal.");
        attendantModal.classList.remove('show');
    }
  });
  console.log("[AdminAttendants] Event listeners principais adicionados.");

  console.log("[AdminAttendants] Chamando loadSectors() e depois loadAttendants().");
  loadSectors().then(() => {
    loadAttendants();
  });
  console.log("[AdminAttendants] Script de funcionários (adminAttendants.js) finalizado sua execução inicial.");
})(); // Fim da IIFE
