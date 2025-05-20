// frontend/web/js/adminConfig.js
document.addEventListener("DOMContentLoaded", () => {
  const configSection = document.getElementById("configuracoesSection");
  if (!configSection) {
    console.warn("[AdminConfig] Seção de configurações não encontrada no DOM.");
    return;
  }

  const configForm = document.getElementById("configForm");
  const saveConfigBtn = document.getElementById("saveConfigBtn");
  // Adicione outros elementos da UI que você possa precisar manipular aqui

  async function loadConfigs() {
    console.log("[AdminConfig] Tentando carregar configurações...");
    try {
      const response = await fetch("/api/admin/config");
      if (!response.ok) {
        // Tenta obter uma mensagem de erro do corpo da resposta, se houver
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status} - ${response.statusText}` }));
        throw new Error(errorData.message || `Erro HTTP: ${response.status} - ${response.statusText}`);
      }
      const data = await response.json();

      if (data.success) {
        console.log("[AdminConfig] Configurações carregadas com sucesso:", data.data);
        populateConfigForm(data.data);
      } else {
        // O backend indicou uma falha, mas a requisição HTTP foi ok
        console.warn("[AdminConfig] Erro ao carregar configurações (data.success = false):", data.message);
        showAlert("Erro ao carregar configurações: " + (data.message || "Resposta de erro do servidor."), "error");
      }
    } catch (error) {
      // Erro de rede, falha ao parsear JSON, ou erro lançado pelo !response.ok
      console.error("[AdminConfig] Falha crítica ao carregar configurações:", error);
      showAlert("Falha ao carregar configurações: " + error.message, "error");
    }
  }

  function populateConfigForm(configs) {
    if (!configForm) {
        console.warn("[AdminConfig] Formulário de configuração (configForm) não encontrado para popular.");
        return;
    }
    if (!Array.isArray(configs)) {
        console.warn("[AdminConfig] Dados de configurações recebidos não são um array:", configs);
        showAlert("Formato de dados de configurações inválido recebido do servidor.", "error");
        return;
    }

    configs.forEach((config) => {
      // Tenta encontrar o input pelo ID construído
      const inputId = `config_${config.CONFIG_KEY}`;
      const input = document.getElementById(inputId);

      if (input) {
        if (input.type === "checkbox") {
          input.checked = config.CONFIG_VALUE === true || config.CONFIG_VALUE === 'true';
        } else if (input.type === "number") {
          input.value = Number(config.CONFIG_VALUE);
        } else {
          input.value = config.CONFIG_VALUE;
        }
        // console.log(`[AdminConfig] Populado ${inputId} com valor: ${config.CONFIG_VALUE}`);
      } else {
        // console.warn(`[AdminConfig] Input com ID '${inputId}' não encontrado no formulário para a chave: ${config.CONFIG_KEY}`);
      }
    });
  }

  async function saveConfigs(event) {
    if (event) event.preventDefault();
    if (!configForm) {
        showAlert("Formulário de configuração não encontrado.", "error");
        return;
    }
    console.log("[AdminConfig] Tentando salvar configurações...");

    // Mapeia os IDs dos inputs para as chaves de configuração e seus tipos esperados
    const configMapping = [
      { id: "config_bot_active", key: "bot_active", type: "boolean", description: "Ativa/desativa o robô de respostas automáticas" },
      { id: "config_bot_response_delay", key: "bot_response_delay", type: "number", description: "Delay em milissegundos antes de enviar resposta automática" },
      { id: "config_bot_working_days", key: "bot_working_days", type: "string", description: "Dias da semana em que o robô está ativo (0=Domingo, 1=Segunda, etc)" },
      { id: "config_bot_working_hours_start", key: "bot_working_hours_start", type: "string", description: "Horário de início do funcionamento do robô" },
      { id: "config_bot_working_hours_end", key: "bot_working_hours_end", type: "string", description: "Horário de término do funcionamento do robô" },
      { id: "config_bot_out_of_hours_message", key: "bot_out_of_hours_message", type: "string", description: "Mensagem enviada fora do horário de funcionamento" },
      { id: "config_enable_sound_notifications", key: "enable_sound_notifications", type: "boolean", description: "Ativa/desativa notificações sonoras para novas mensagens"},
      { id: "config_notification_sound", key: "notification_sound", type: "string", description: "Som de notificação para novas mensagens (default, bell, chime)"},
    ];

    const configsToSave = [];
    let formIsValid = true;

    configMapping.forEach(map => {
        const inputElement = document.getElementById(map.id);
        if (inputElement) {
            let value;
            if (inputElement.type === "checkbox") {
                value = inputElement.checked.toString(); // Enviar como string 'true' ou 'false'
            } else if (inputElement.type === "number") {
                value = inputElement.value;
                if (isNaN(parseFloat(value))) {
                    showAlert(`Valor inválido para ${map.description || map.key}. Deve ser um número.`, "warning");
                    formIsValid = false;
                }
            } else {
                value = inputElement.value;
            }
            configsToSave.push({ key: map.key, value: value, type: map.type, description: map.description });
        } else {
            console.warn(`[AdminConfig] Input ${map.id} não encontrado para salvar.`);
        }
    });

    if (!formIsValid) return;

    try {
      // O backend espera um array de objetos de configuração ou um objeto por vez?
      // A rota POST /api/admin/config no backend parece esperar um objeto de configuração por vez.
      // Vamos enviar um por um.
      let allSavedSuccessfully = true;
      for (const config of configsToSave) {
        const response = await fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config), // Envia cada configuração individualmente
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status} ao salvar ${config.key}` }));
          showAlert(`Erro ao salvar configuração '${config.key}': ${errorData.message}`, "error");
          allSavedSuccessfully = false;
          // Decide se quer parar no primeiro erro ou tentar salvar todos
          // break; 
        } else {
          const result = await response.json();
          if (!result.success) {
            showAlert(`Falha ao salvar configuração '${config.key}': ${result.message}`, "error");
            allSavedSuccessfully = false;
            // break;
          }
        }
      }

      if (allSavedSuccessfully) {
        showAlert("Configurações salvas com sucesso!", "success");
        loadConfigs(); // Recarrega para garantir consistência, opcional
      } else {
        showAlert("Algumas configurações podem não ter sido salvas. Verifique os alertas.", "warning");
      }

    } catch (error) {
      console.error("[AdminConfig] Erro ao salvar configurações:", error);
      showAlert("Erro de rede ou servidor ao salvar configurações: " + error.message, "error");
    }
  }

  function showAlert(message, type = "info", duration = 3500) {
    const alertContainer = document.getElementById("alertContainer") || document.body;
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

  if (configForm && saveConfigBtn) {
    // O botão é type="button" no HTML ou o listener de submit do form é usado?
    // Se for submit no form:
    configForm.addEventListener("submit", saveConfigs);
    // Se for click no botão (e o botão não for type="submit"):
    // saveConfigBtn.addEventListener("click", saveConfigs);
  } else {
    console.warn("[AdminConfig] configForm ou saveConfigBtn não encontrado.");
  }

  loadConfigs();
});
