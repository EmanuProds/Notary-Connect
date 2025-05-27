// frontend/web/js/adminHolidays.js
(function() { // IIFE to encapsulate scope
  console.log("[AdminHolidays] Script adminHolidays.js INICIADO.");

  const holidaysSection = document.getElementById("feriadosSection");
  if (!holidaysSection) {
    console.warn("[AdminHolidays] Seção de feriados ('feriadosSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminHolidays] Seção de feriados encontrada.");

  const addHolidayForm = document.getElementById("addHolidayForm");
  const holidayDateInput = document.getElementById("holidayDate");
  const holidayDescriptionInput = document.getElementById("holidayDescription");
  const holidayList = document.getElementById("holidayList");

  if (!addHolidayForm || !holidayDateInput || !holidayDescriptionInput || !holidayList) {
    console.error("[AdminHolidays] ERRO CRÍTICO: Um ou mais elementos da UI para Feriados não foram encontrados. Verifique os IDs no HTML.");
    return;
  }
  console.log("[AdminHolidays] Todos os elementos da UI para Feriados foram referenciados.");

  let allHolidays = [];

  async function loadHolidays() {
    console.log("[AdminHolidays] loadHolidays: Iniciando carregamento de feriados...");
    try {
      const response = await fetch("/api/admin/holidays");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        allHolidays = data.data;
        console.log("[AdminHolidays] loadHolidays: Feriados carregados com sucesso:", allHolidays.length, "feriados.");
        renderHolidayList(allHolidays);
      } else {
        showAlert("Erro ao carregar feriados: " + (data.message || "Erro desconhecido"), "error");
      }
    } catch (error) {
      console.error("[AdminHolidays] loadHolidays: Falha crítica ao carregar feriados:", error);
      showAlert("Erro de rede ou servidor ao carregar feriados.", "error");
    }
  }

  function renderHolidayList(holidays) {
    console.log("[AdminHolidays] renderHolidayList: Renderizando lista com", holidays ? holidays.length : 0, "feriados.");
    holidayList.innerHTML = "";

    if (!holidays || holidays.length === 0) {
      holidayList.innerHTML = '<div class="empty-state">Nenhum feriado cadastrado.</div>';
      return;
    }

    holidays.forEach((holiday) => {
      const holidayItem = document.createElement("div");
      holidayItem.className = "list-item holiday-item";
      holidayItem.dataset.id = holiday.ID;

      // Format date from YYYY-MM-DD to DD/MM/YYYY
      let formattedDate = holiday.HOLIDAY_DATE;
      try {
        const parts = holiday.HOLIDAY_DATE.split('-');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      } catch (e) {
        console.warn(`[AdminHolidays] Erro ao formatar data '${holiday.HOLIDAY_DATE}':`, e);
      }
      
      holidayItem.innerHTML = `
        <div class="list-item-main-content">
            <span class="holiday-date">${escapeHTML(formattedDate)}</span> - 
            <span class="holiday-description">${escapeHTML(holiday.DESCRIPTION)}</span>
        </div>
        <div class="item-actions">
            <button class="icon-button btn-delete-holiday" data-id="${holiday.ID}" aria-label="Excluir">
              <i class="fas fa-trash-alt"></i>
            </button>
        </div>
      `;
      holidayList.appendChild(holidayItem);
    });

    addEventListenersToItemButtons();
  }

  function addEventListenersToItemButtons() {
    document.querySelectorAll(".btn-delete-holiday").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (confirm("Tem certeza que deseja excluir este feriado?")) {
          deleteHoliday(e.currentTarget.dataset.id);
        }
      });
    });
  }

  async function handleAddHoliday(event) {
    event.preventDefault();
    const date = holidayDateInput.value;
    const description = holidayDescriptionInput.value.trim();

    if (!date || !description) {
      showAlert("Data e Descrição são obrigatórios para adicionar um feriado.", "warning");
      return;
    }

    const holidayData = {
      holiday_date: date,
      description: description,
    };

    console.log("[AdminHolidays] handleAddHoliday: Enviando dados:", holidayData);

    try {
      const response = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holidayData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        showAlert("Feriado adicionado com sucesso!", "success");
        addHolidayForm.reset(); // Limpa o formulário
        loadHolidays(); // Recarrega a lista
      } else {
        showAlert("Erro ao adicionar feriado: " + (data.message || "Erro desconhecido do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminHolidays] handleAddHoliday: Falha crítica ao adicionar feriado:", error);
      showAlert(`Erro de rede ou servidor ao adicionar feriado: ${error.message}`, "error");
    }
  }

  async function deleteHoliday(id) {
    console.log(`[AdminHolidays] deleteHoliday: Excluindo feriado ID: ${id}`);
    try {
      const response = await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        showAlert("Feriado excluído com sucesso!", "success");
        loadHolidays();
      } else {
        showAlert("Erro ao excluir feriado: " + (data.message || "Erro desconhecido."), "error");
      }
    } catch (error) {
      console.error(`[AdminHolidays] deleteHoliday: Falha crítica ao excluir feriado ID ${id}:`, error);
      showAlert("Erro de rede ou servidor ao excluir feriado.", "error");
    }
  }
  
  // Use global showAlert if available, otherwise define a local one
  const showAlert = window.showAlert || function(message, type = "info", duration = 3000) {
    console.log(`[AdminHolidays] showAlert (local): Tipo: ${type}, Mensagem: ${message}`);
    const alertContainer = document.getElementById("alertContainer") || document.body;
    const alertElement = document.createElement("div");
    alertElement.className = `alert alert-${type}`;
    alertElement.textContent = message;
    if (!alertContainer.offsetParent && alertContainer !== document.body) {
        document.body.appendChild(alertContainer);
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
  addHolidayForm.addEventListener("submit", handleAddHoliday);

  // Initial load logic for when the section becomes active
  if (typeof window.adminSectionLoader === 'undefined') {
    window.adminSectionLoader = {};
  }
  window.adminSectionLoader.feriadosSection = loadHolidays;

  // If the section is already active on script load (e.g. direct navigation or refresh)
  if (holidaysSection.classList.contains('active')) {
      loadHolidays();
  } else {
      console.log("[AdminHolidays] Seção de feriados não está ativa. Dados não carregados inicialmente.");
  }

  console.log("[AdminHolidays] Script adminHolidays.js finalizado sua execução inicial.");
})(); // End of IIFE
