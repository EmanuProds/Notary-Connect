// frontend/web/js/adminServices.js
(function() { // IIFE to encapsulate scope
  console.log("[AdminServices] Script adminServices.js INICIADO.");

  const servicesSection = document.getElementById("servicosSection");
  if (!servicesSection) {
    console.warn("[AdminServices] Seção de serviços ('servicosSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminServices] Seção de serviços encontrada.");

  const serviceList = document.getElementById("serviceList");
  const serviceForm = document.getElementById("serviceForm");
  const serviceModal = document.getElementById("serviceModal");
  const closeServiceModalBtn = document.getElementById("closeServiceModal");
  const cancelServiceBtn = document.getElementById("cancelServiceBtn");
  const addServiceBtn = document.getElementById("addServiceBtn");
  const serviceSearchInput = document.getElementById("serviceSearchInput");
  const serviceModalTitle = document.getElementById("serviceModalTitle");

  // Input fields
  const serviceIdInput = document.getElementById("serviceId");
  const serviceKeyInput = document.getElementById("serviceKey");
  const serviceNameInput = document.getElementById("serviceName");
  const serviceDescriptionInput = document.getElementById("serviceDescription");
  const serviceEditableValueInput = document.getElementById("serviceEditableValue");
  const serviceActiveInput = document.getElementById("serviceActive");

  if (!serviceList || !serviceForm || !serviceModal || !closeServiceModalBtn || !cancelServiceBtn || !addServiceBtn || !serviceSearchInput || !serviceModalTitle ||
      !serviceIdInput || !serviceKeyInput || !serviceNameInput || !serviceDescriptionInput || !serviceEditableValueInput || !serviceActiveInput) {
    console.error("[AdminServices] ERRO CRÍTICO: Um ou mais elementos da UI para Serviços não foram encontrados. Verifique os IDs no HTML.");
    return;
  }
  console.log("[AdminServices] Todos os elementos da UI para Serviços foram referenciados.");

  let currentServiceId = null;
  let allServices = [];

  async function loadServices() {
    console.log("[AdminServices] loadServices: Iniciando carregamento de serviços...");
    try {
      const response = await fetch("/api/admin/services");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        allServices = data.data;
        console.log("[AdminServices] loadServices: Serviços carregados com sucesso:", allServices.length, "serviços.");
        renderServiceList(allServices);
      } else {
        showAlert("Erro ao carregar serviços: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("[AdminServices] loadServices: Falha crítica ao carregar serviços:", error);
      showAlert("Erro de rede ou servidor ao carregar serviços.", "error");
    }
  }

  function renderServiceList(services) {
    console.log("[AdminServices] renderServiceList: Renderizando lista com", services ? services.length : 0, "serviços.");
    serviceList.innerHTML = "";

    if (!services || services.length === 0) {
      serviceList.innerHTML = '<div class="empty-state">Nenhum serviço encontrado. Clique em "Novo Serviço" para adicionar.</div>';
      return;
    }

    services.forEach((service) => {
      const serviceItem = document.createElement("div");
      serviceItem.className = "list-item service-item";
      serviceItem.dataset.id = service.ID;

      const activeClass = service.ACTIVE ? "active" : "inactive";
      const statusText = service.ACTIVE ? "Ativo" : "Inativo";
      const descriptionPreview = service.DESCRIPTION ? escapeHTML(service.DESCRIPTION.substring(0, 100) + (service.DESCRIPTION.length > 100 ? "..." : "")) : "N/A";
      const valuePreview = service.EDITABLE_VALUE ? escapeHTML(service.EDITABLE_VALUE.substring(0, 100) + (service.EDITABLE_VALUE.length > 100 ? "..." : "")) : "N/A";

      serviceItem.innerHTML = `
        <div class="list-item-header">
          <h4>${escapeHTML(service.SERVICE_NAME)}</h4>
          <div class="item-actions">
            <span class="status-badge ${activeClass}">${statusText}</span>
            <button class="icon-button btn-edit-service" data-id="${service.ID}" aria-label="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="icon-button btn-delete-service" data-id="${service.ID}" aria-label="Excluir">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
        <div class="list-item-body">
          <p><strong>Chave:</strong> <code class="code">${escapeHTML(service.SERVICE_KEY)}</code></p>
          <p><strong>Descrição:</strong> ${descriptionPreview}</p>
          <p><strong>Valor Editável:</strong> <code class="code">${valuePreview}</code></p>
        </div>
      `;
      serviceList.appendChild(serviceItem);
    });

    addEventListenersToItemButtons();
  }

  function addEventListenersToItemButtons() {
    document.querySelectorAll(".btn-edit-service").forEach((btn) => {
      btn.addEventListener("click", (e) => editService(e.currentTarget.dataset.id));
    });
    document.querySelectorAll(".btn-delete-service").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (confirm("Tem certeza que deseja excluir este serviço? Esta ação não pode ser desfeita.")) {
          deleteService(e.currentTarget.dataset.id);
        }
      });
    });
  }

  function addNewService() {
    console.log("[AdminServices] addNewService: Abrindo modal para novo serviço.");
    serviceForm.reset();
    serviceIdInput.value = "";
    serviceActiveInput.checked = true;
    serviceModalTitle.textContent = "Novo Serviço";
    currentServiceId = null;
    serviceModal.classList.add("show");
    serviceKeyInput.focus();
  }

  async function editService(id) {
    console.log(`[AdminServices] editService: Editando serviço ID: ${id}`);
    try {
      const response = await fetch(`/api/admin/services/${id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.data) {
        const serviceData = data.data;
        serviceIdInput.value = serviceData.ID;
        serviceKeyInput.value = serviceData.SERVICE_KEY;
        serviceNameInput.value = serviceData.SERVICE_NAME;
        serviceDescriptionInput.value = serviceData.DESCRIPTION || "";
        serviceEditableValueInput.value = serviceData.EDITABLE_VALUE || "";
        serviceActiveInput.checked = serviceData.ACTIVE === 1;

        serviceModalTitle.textContent = "Editar Serviço";
        currentServiceId = serviceData.ID;
        serviceModal.classList.add("show");
      } else {
        showAlert("Erro ao carregar dados do serviço: " + (data.message || "Serviço não encontrado."), "error");
      }
    } catch (error) {
      console.error(`[AdminServices] editService: Falha crítica ao carregar dados do serviço ID ${id}:`, error);
      showAlert("Erro de rede ou servidor ao carregar dados do serviço.", "error");
    }
  }

  async function saveService(event) {
    event.preventDefault();
    const serviceKey = serviceKeyInput.value.trim();
    const serviceName = serviceNameInput.value.trim();

    if (!serviceKey || !serviceName) {
      showAlert("Chave Única e Nome do Serviço são obrigatórios.", "warning");
      return;
    }

    const serviceData = {
      service_key: serviceKey,
      service_name: serviceName,
      description: serviceDescriptionInput.value.trim(),
      editable_value: serviceEditableValueInput.value.trim(),
      active: serviceActiveInput.checked,
    };

    try {
      const url = currentServiceId ? `/api/admin/services/${currentServiceId}` : "/api/admin/services";
      const method = currentServiceId ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serviceData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        showAlert(currentServiceId ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", "success");
        serviceModal.classList.remove("show");
        loadServices();
      } else {
        showAlert("Erro ao salvar serviço: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminServices] saveService: Falha crítica ao salvar serviço:", error);
      showAlert(`Erro de rede ou servidor ao salvar serviço: ${error.message}`, "error");
    }
  }

  async function deleteService(id) {
    console.log(`[AdminServices] deleteService: Excluindo serviço ID: ${id}`);
    try {
      const response = await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        showAlert("Serviço excluído com sucesso!", "success");
        loadServices();
      } else {
        showAlert("Erro ao excluir serviço: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error(`[AdminServices] deleteService: Falha crítica ao excluir serviço ID ${id}:`, error);
      showAlert("Erro de rede ou servidor ao excluir serviço.", "error");
    }
  }

  function filterServices() {
    const searchTerm = serviceSearchInput.value.toLowerCase();
    if (!searchTerm) {
      renderServiceList(allServices);
      return;
    }
    const filtered = allServices.filter(
      (service) =>
        service.SERVICE_NAME.toLowerCase().includes(searchTerm) ||
        service.SERVICE_KEY.toLowerCase().includes(searchTerm) ||
        (service.DESCRIPTION && service.DESCRIPTION.toLowerCase().includes(searchTerm)) ||
        (service.EDITABLE_VALUE && service.EDITABLE_VALUE.toLowerCase().includes(searchTerm))
    );
    renderServiceList(filtered);
  }

  // Use global showAlert if available, otherwise define a local one
  const showAlert = window.showAlert || function(message, type = "info", duration = 3000) {
    console.log(`[AdminServices] showAlert (local): Tipo: ${type}, Mensagem: ${message}`);
    const alertContainer = document.getElementById("alertContainer") || document.body;
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    
    // Ensure alertContainer is part of the DOM for offsetHeight calculation
    if (!alertContainer.offsetParent && alertContainer !== document.body) {
        document.body.appendChild(alertContainer); // Fallback append
    }
    alertContainer.appendChild(alertElement);
    
    requestAnimationFrame(() => { alertElement.classList.add("show"); });
    
    setTimeout(() => {
      alertElement.classList.remove("show");
      setTimeout(() => alertElement.remove(), 300);
    }, duration);
  };
  
  const escapeHTML = window.escapeHTML || function(str) {
    if (typeof str !== "string") return String(str === null || str === undefined ? "" : str);
    return str.replace(/[&<>"']/g, (match) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[match]);
  };

  // Event Listeners
  addServiceBtn.addEventListener("click", addNewService);
  closeServiceModalBtn.addEventListener("click", () => serviceModal.classList.remove("show"));
  cancelServiceBtn.addEventListener("click", () => serviceModal.classList.remove("show"));
  serviceForm.addEventListener("submit", saveService);
  serviceSearchInput.addEventListener("input", filterServices);

  window.addEventListener("click", (e) => {
    if (e.target === serviceModal) {
      serviceModal.classList.remove("show");
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && serviceModal.classList.contains('show')) {
        serviceModal.classList.remove('show');
    }
  });

  console.log("[AdminServices] Event listeners principais adicionados.");
  // Initial load
  // Check if this section is active before loading, or ensure adminScript.js handles this
  if (servicesSection.classList.contains('active')) {
      loadServices();
  } else {
      console.log("[AdminServices] Seção de serviços não está ativa. Dados não carregados inicialmente.");
  }
  
  // Expose loadServices if it needs to be called by adminScript.js when section becomes active
  // This is a common pattern for single-page applications or tabbed interfaces
  if (typeof window.adminSectionLoader === 'undefined') {
    window.adminSectionLoader = {};
  }
  window.adminSectionLoader.servicosSection = loadServices;


  console.log("[AdminServices] Script adminServices.js finalizado sua execução inicial.");
})(); // End of IIFE
