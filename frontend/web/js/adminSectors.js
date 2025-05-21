// frontend/web/js/adminSectors.js
(function() { // IIFE para encapsular o escopo
  console.log("[AdminSectors] Script adminSectors.js INICIADO (execução direta).");

  const setoresSection = document.getElementById("setoresSection");
  if (!setoresSection) {
    console.warn("[AdminSectors] Seção de setores ('setoresSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminSectors] Seção de setores encontrada.");

  const sectorList = document.getElementById("sectorList");
  const sectorForm = document.getElementById("sectorForm");
  const sectorModal = document.getElementById("sectorModal");
  const closeModalBtn = document.getElementById("closeSectorModal");
  const cancelSectorBtn = document.getElementById("cancelSectorBtn");
  const saveSectorBtn = document.getElementById("saveSectorBtn"); // Para verificar existência, evento no form
  const addSectorBtn = document.getElementById("addSectorBtn");
  const sectorSearchInput = document.getElementById("sectorSearchInput");
  const sectorModalTitle = document.getElementById("sectorModalTitle");

  if (!sectorList || !sectorForm || !sectorModal || !closeModalBtn || !cancelSectorBtn || !saveSectorBtn || !addSectorBtn || !sectorSearchInput || !sectorModalTitle) {
    console.error("[AdminSectors] ERRO CRÍTICO: Um ou mais elementos da UI para Setores não foram encontrados. Verifique os IDs no HTML.");
    return;
  }
  console.log("[AdminSectors] Todos os elementos da UI para Setores foram referenciados.");

  let currentSectorId = null;
  let allSectors = [];

  async function loadSectors() {
    console.log("[AdminSectors] loadSectors: Iniciando carregamento de setores...");
    try {
      console.log("[AdminSectors] loadSectors: Realizando fetch para /api/admin/sectors");
      const response = await fetch("/api/admin/sectors");
      console.log("[AdminSectors] loadSectors: Resposta do fetch recebida, status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error("[AdminSectors] loadSectors: Erro na resposta do fetch:", errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log("[AdminSectors] loadSectors: Dados JSON parseados:", data);

      if (data.success) {
        allSectors = data.data;
        console.log("[AdminSectors] loadSectors: Setores carregados com sucesso:", allSectors.length, "setores.");
        renderSectorList(allSectors);
      } else {
        console.warn("[AdminSectors] loadSectors: Erro ao carregar setores (data.success = false):", data.message);
        showAlert("Erro ao carregar setores: " + (data.message || "Erro desconhecido do servidor."), "error");
        if (sectorList) sectorList.innerHTML = '<div class="empty-state">Não foi possível carregar os setores.</div>';
      }
    } catch (error) {
      console.error("[AdminSectors] loadSectors: Falha crítica ao carregar setores:", error);
      showAlert(`Erro de rede ou servidor ao carregar setores: ${error.message}`, "error");
      if (sectorList) sectorList.innerHTML = '<div class="empty-state">Erro ao carregar setores. Verifique o console.</div>';
    }
  }

  function renderSectorList(sectors) {
    console.log("[AdminSectors] renderSectorList: Renderizando lista com", sectors ? sectors.length : 0, "setores.");
    if (!sectorList) {
        console.error("[AdminSectors] renderSectorList: Elemento sectorList não encontrado.");
        return;
    }
    sectorList.innerHTML = "";

    if (!sectors || sectors.length === 0) {
      console.log("[AdminSectors] renderSectorList: Nenhum setor para renderizar.");
      sectorList.innerHTML = '<div class="empty-state">Nenhum setor encontrado. Clique em "Novo Setor" para adicionar.</div>';
      return;
    }

    sectors.forEach((sector) => {
      const sectorItem = document.createElement("div");
      sectorItem.className = "list-item sector-item";
      sectorItem.dataset.id = sector.ID;

      const activeClass = sector.ACTIVE ? "active" : "inactive";
      const statusText = sector.ACTIVE ? "Ativo" : "Inativo";

      sectorItem.innerHTML = `
        <div class="list-item-header">
          <h4>${escapeHTML(sector.SECTOR_NAME)}</h4>
          <div class="item-actions">
            <span class="status-badge ${activeClass}">${statusText}</span>
            <button class="icon-button btn-edit-sector" data-id="${sector.ID}" aria-label="Editar Setor">
              <i class="fas fa-edit"></i>
            </button>
            <button class="icon-button btn-delete-sector" data-id="${sector.ID}" aria-label="Excluir Setor">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
        <div class="list-item-body">
          <p><strong>Chave:</strong> <code class="code">${escapeHTML(sector.SECTOR_KEY)}</code></p>
          ${sector.DESCRIPTION ? `<p><strong>Descrição:</strong> ${escapeHTML(sector.DESCRIPTION)}</p>` : ""}
        </div>
      `;
      sectorList.appendChild(sectorItem);
    });

    addEventListenersToSectorButtons();
    console.log("[AdminSectors] renderSectorList: Lista de setores renderizada.");
  }

  function addEventListenersToSectorButtons() {
    console.log("[AdminSectors] addEventListenersToSectorButtons: Adicionando listeners aos botões de editar/excluir.");
    document.querySelectorAll(".btn-edit-sector").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        console.log("[AdminSectors] Botão EDITAR setor clicado, ID:", e.currentTarget.dataset.id);
        editSector(e.currentTarget.dataset.id);
      });
    });
    document.querySelectorAll(".btn-delete-sector").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const sectorId = e.currentTarget.dataset.id;
        console.log("[AdminSectors] Botão EXCLUIR setor clicado, ID:", sectorId);
        if (confirm("Tem certeza que deseja excluir este setor? Esta ação não pode ser desfeita e pode afetar funcionários vinculados.")) {
          console.log("[AdminSectors] Confirmação de exclusão para ID:", sectorId);
          deleteSector(sectorId);
        } else {
          console.log("[AdminSectors] Exclusão cancelada para ID:", sectorId);
        }
      });
    });
  }

  async function editSector(id) {
    console.log(`[AdminSectors] editSector: Editando setor ID: ${id}`);
    try {
      console.log(`[AdminSectors] editSector: Realizando fetch para /api/admin/sectors/${id}`);
      const response = await fetch(`/api/admin/sectors/${id}`); // Assumindo que existe um endpoint GET para um setor específico
      console.log(`[AdminSectors] editSector: Resposta do fetch para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminSectors] editSector: Erro na resposta do fetch para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminSectors] editSector: Dados JSON parseados para ID ${id}:`, data);

      if (data.success && data.data) {
        const sectorData = data.data;
        console.log(`[AdminSectors] editSector: Populando formulário com dados do setor ID ${id}.`);
        document.getElementById("sectorId").value = sectorData.ID;
        document.getElementById("sectorKey").value = sectorData.SECTOR_KEY;
        document.getElementById("sectorName").value = sectorData.SECTOR_NAME;
        document.getElementById("sectorDescription").value = sectorData.DESCRIPTION || "";
        document.getElementById("sectorActive").checked = sectorData.ACTIVE === 1 || sectorData.ACTIVE === true;

        if (sectorModalTitle) sectorModalTitle.textContent = "Editar Setor";
        currentSectorId = sectorData.ID;
        if (sectorModal) sectorModal.classList.add("show"); else console.error("[AdminSectors] editSector: sectorModal é nulo!");
        console.log(`[AdminSectors] editSector: Modal de edição exibido para setor ID ${id}.`);
      } else {
        console.warn(`[AdminSectors] editSector: Erro ao carregar dados do setor ID ${id} (data.success = false ou sem data):`, data.message);
        showAlert("Erro ao carregar dados do setor: " + (data.message || "Setor não encontrado."), "error");
      }
    } catch (error) {
      console.error(`[AdminSectors] editSector: Falha crítica ao carregar dados do setor ID ${id}:`, error);
      showAlert(`Erro de rede ou servidor ao carregar dados do setor: ${error.message}`, "error");
    }
  }

  function openNewSectorModal() {
    console.log("[AdminSectors] openNewSectorModal: Abrindo modal para novo setor.");
    if (sectorForm) sectorForm.reset(); else console.error("[AdminSectors] openNewSectorModal: sectorForm é nulo!");
    document.getElementById("sectorId").value = "";
    document.getElementById("sectorActive").checked = true;
    if (sectorModalTitle) sectorModalTitle.textContent = "Novo Setor";
    currentSectorId = null;
    if (sectorModal) sectorModal.classList.add("show"); else console.error("[AdminSectors] openNewSectorModal: sectorModal é nulo!");
    document.getElementById("sectorKey").focus();
    console.log("[AdminSectors] openNewSectorModal: Modal para novo setor exibido.");
  }

  async function handleSaveSector(event) {
    console.log("[AdminSectors] handleSaveSector: Função handleSaveSector INICIADA.");
    if (event) {
        console.log("[AdminSectors] handleSaveSector: Evento de submit recebido, prevenindo default.");
        event.preventDefault();
    } else {
        console.warn("[AdminSectors] handleSaveSector: Função chamada sem evento.");
    }

    const sectorKey = document.getElementById("sectorKey").value.trim();
    const sectorName = document.getElementById("sectorName").value.trim();
    const sectorDescription = document.getElementById("sectorDescription").value.trim();
    const sectorActive = document.getElementById("sectorActive").checked;
    console.log("[AdminSectors] handleSaveSector: Dados brutos do formulário:", { sectorKey, sectorName, sectorDescription, sectorActive });

    if (!sectorKey || !sectorName) {
      console.warn("[AdminSectors] handleSaveSector: Chave Única e Nome do Setor são obrigatórios.");
      showAlert("Chave Única e Nome do Setor são obrigatórios.", "warning");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(sectorKey)) {
      console.warn("[AdminSectors] handleSaveSector: Chave Única inválida.");
      showAlert("A Chave Única deve conter apenas letras minúsculas, números e underscores (_).", "warning");
      return;
    }

    const sectorData = {
      sector_key: sectorKey,
      sector_name: sectorName,
      description: sectorDescription,
      active: sectorActive,
    };
    console.log("[AdminSectors] handleSaveSector: Dados formatados para envio:", JSON.stringify(sectorData));

    try {
      const url = currentSectorId ? `/api/admin/sectors/${currentSectorId}` : "/api/admin/sectors";
      const method = currentSectorId ? "PUT" : "POST";
      console.log(`[AdminSectors] handleSaveSector: Enviando ${method} para ${url}`);

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sectorData),
      });
      console.log(`[AdminSectors] handleSaveSector: Resposta do fetch para ${url}, status:`, response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminSectors] handleSaveSector: Erro na resposta do fetch (${url}):`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status} ao salvar setor.`);
      }
      
      const data = await response.json();
      console.log("[AdminSectors] handleSaveSector: Resultado do backend:", data);

      if (data.success) {
        showAlert(currentSectorId ? "Setor atualizado com sucesso!" : "Setor criado com sucesso!", "success");
        if (sectorModal) sectorModal.classList.remove("show"); else console.error("[AdminSectors] handleSaveSector: sectorModal é nulo ao tentar fechar.");
        loadSectors(); 
        if (typeof window.loadSectorsForAttendants === 'function') {
            console.log("[AdminSectors] handleSaveSector: Chamando loadSectorsForAttendants para atualizar lista em Funcionários.");
            window.loadSectorsForAttendants();
        }
        console.log("[AdminSectors] handleSaveSector: Setor salvo com sucesso, modal fechado, lista recarregada.");
      } else {
        console.warn("[AdminSectors] handleSaveSector: Erro ao salvar setor (backend informou erro):", data.message);
        showAlert("Erro ao salvar setor: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminSectors] handleSaveSector: Falha crítica ao salvar setor:", error);
      showAlert(`Erro de rede ou servidor ao salvar setor: ${error.message}`, "error");
    }
    console.log("[AdminSectors] handleSaveSector: Função handleSaveSector CONCLUÍDA.");
  }

  async function deleteSector(id) {
    console.log(`[AdminSectors] deleteSector: Excluindo setor ID: ${id}`);
    try {
      console.log(`[AdminSectors] deleteSector: Realizando fetch DELETE para /api/admin/sectors/${id}`);
      const response = await fetch(`/api/admin/sectors/${id}`, { method: "DELETE" }); // Assumindo endpoint DELETE
      console.log(`[AdminSectors] deleteSector: Resposta do fetch DELETE para ID ${id}, status:`, response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        console.error(`[AdminSectors] deleteSector: Erro na resposta do fetch DELETE para ID ${id}:`, errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[AdminSectors] deleteSector: Resultado do backend para exclusão ID ${id}:`, data);

      if (data.success) {
        showAlert("Setor excluído com sucesso!", "success");
        loadSectors();
        if (typeof window.loadSectorsForAttendants === 'function') { // Atualiza em outros módulos se necessário
            console.log("[AdminSectors] deleteSector: Chamando loadSectorsForAttendants para atualizar lista em Funcionários.");
            window.loadSectorsForAttendants();
        }
        console.log(`[AdminSectors] deleteSector: Setor ID ${id} excluído, lista recarregada.`);
      } else {
        console.warn(`[AdminSectors] deleteSector: Erro ao excluir setor ID ${id} (backend informou erro):`, data.message);
        showAlert("Erro ao excluir setor: " + (data.message || "Erro desconhecido do servidor. Verifique se há funcionários vinculados a este setor."), "error");
      }
    } catch (error) {
      console.error(`[AdminSectors] deleteSector: Falha crítica ao excluir setor ID ${id}:`, error);
      showAlert(`Erro de rede ou servidor ao excluir setor: ${error.message}`, "error");
    }
  }

  function filterSectors() {
    const searchTerm = sectorSearchInput.value.toLowerCase();
    console.log("[AdminSectors] filterSectors: Filtrando setores com termo:", searchTerm);
    if (!searchTerm) {
      renderSectorList(allSectors);
      return;
    }
    const filteredSectors = allSectors.filter(
      (sector) =>
        (sector.SECTOR_NAME && sector.SECTOR_NAME.toLowerCase().includes(searchTerm)) ||
        (sector.SECTOR_KEY && sector.SECTOR_KEY.toLowerCase().includes(searchTerm)) ||
        (sector.DESCRIPTION && sector.DESCRIPTION.toLowerCase().includes(searchTerm))
    );
    renderSectorList(filteredSectors);
    console.log("[AdminSectors] filterSectors: Filtro aplicado, renderizados", filteredSectors.length, "setores.");
  }

  function showAlert(message, type = "info", duration = 3500) {
    console.log(`[AdminSectors] showAlert: Tipo: ${type}, Mensagem: ${message}`);
    // Reutiliza a função global showAlert se disponível (de adminScript.js)
    if (typeof window.showAlert === "function" && window.showAlert !== showAlert) { // Evita recursão infinita
      window.showAlert(message, type, duration);
    } else {
      const alertContainerFallback = document.getElementById("alertContainer") || document.body;
      const alertElement = document.createElement("div");
      alertElement.className = `alert alert-${type}`;
      alertElement.textContent = message;
      alertContainerFallback.appendChild(alertElement);
      setTimeout(() => alertElement.remove(), duration);
      console.log(`[AdminSectors Fallback Alert] ${type}: ${message}`);
    }
  }

  function escapeHTML(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  }

  console.log("[AdminSectors] Adicionando event listeners principais...");
  if (addSectorBtn) addSectorBtn.addEventListener("click", openNewSectorModal);
  if (closeModalBtn) closeModalBtn.addEventListener("click", () => {
    console.log("[AdminSectors] Botão Fechar Modal clicado.");
    if(sectorModal) sectorModal.classList.remove("show");
  });
  if (cancelSectorBtn) cancelSectorBtn.addEventListener("click", () => {
    console.log("[AdminSectors] Botão Cancelar Modal clicado.");
    if(sectorModal) sectorModal.classList.remove("show");
  });
  
  if (sectorForm) {
    sectorForm.addEventListener("submit", handleSaveSector);
    console.log("[AdminSectors] Event listener de 'submit' ADICIONADO ao sectorForm.");
  } else {
    console.error("[AdminSectors] sectorForm não encontrado, não foi possível adicionar event listener de submit.");
  }

  if (sectorSearchInput) sectorSearchInput.addEventListener("input", filterSectors);

  window.addEventListener("click", (e) => {
    if (sectorModal && e.target === sectorModal) {
        console.log("[AdminSectors] Clique fora do modal detectado.");
        sectorModal.classList.remove("show");
    }
  });
  window.addEventListener('keydown', (e) => {
    if (sectorModal && e.key === 'Escape' && sectorModal.classList.contains('show')) {
        console.log("[AdminSectors] Tecla Escape pressionada, fechando modal.");
        sectorModal.classList.remove('show');
    }
  });
  console.log("[AdminSectors] Event listeners principais adicionados.");

  console.log("[AdminSectors] Chamando loadSectors() para carregar setores iniciais.");
  loadSectors();
  console.log("[AdminSectors] Script de setores (adminSectors.js) finalizado sua execução inicial.");
})(); // Fim da IIFE
