// frontend/web/js/adminConfig.js
(function() { // IIFE para encapsular o escopo
  console.log("[AdminConfig] Script adminConfig.js INICIADO (execução direta).");

  const configSection = document.getElementById("configuracoesSection");
  if (!configSection) {
    console.warn("[AdminConfig] Seção de configurações ('configuracoesSection') não encontrada no DOM. Script encerrado.");
    return;
  }
  console.log("[AdminConfig] Seção de configurações encontrada.");

  const configForm = document.getElementById("configForm");
  const saveConfigBtn = document.getElementById("saveConfigBtn"); // Usado para verificar a existência

  if (!configForm) {
    console.error("[AdminConfig] ERRO CRÍTICO: Formulário 'configForm' não encontrado! Funcionalidade de salvar não funcionará.");
    return;
  }
  if (!saveConfigBtn) {
    console.warn("[AdminConfig] Botão 'saveConfigBtn' não encontrado. O submit deve ocorrer no formulário 'configForm'.");
  }
  console.log("[AdminConfig] Elementos configForm e saveConfigBtn (se aplicável) referenciados.");

  async function loadConfigs() {
    console.log("[AdminConfig] loadConfigs: Iniciando carregamento de configurações...");
    try {
      console.log("[AdminConfig] loadConfigs: Realizando fetch para /api/admin/config");
      const response = await fetch("/api/admin/config");
      console.log("[AdminConfig] loadConfigs: Resposta do fetch recebida, status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status} - ${response.statusText}` }));
        console.error("[AdminConfig] loadConfigs: Erro na resposta do fetch:", errorData.message || `Erro HTTP: ${response.status}`);
        throw new Error(errorData.message || `Erro HTTP: ${response.status} - ${response.statusText}`);
      }
      const data = await response.json();
      console.log("[AdminConfig] loadConfigs: Dados JSON parseados:", data);

      if (data.success) {
        console.log("[AdminConfig] loadConfigs: Configurações carregadas com sucesso do backend:", data.data);
        populateConfigForm(data.data);
      } else {
        console.warn("[AdminConfig] loadConfigs: Erro ao carregar configurações (data.success = false):", data.message);
        showAlert("Erro ao carregar configurações: " + (data.message || "Resposta de erro do servidor."), "error");
      }
    } catch (error) {
      console.error("[AdminConfig] loadConfigs: Falha crítica ao carregar configurações:", error);
      showAlert("Falha ao carregar configurações: " + error.message, "error");
    }
  }

  function populateConfigForm(configs) {
    console.log("[AdminConfig] populateConfigForm: Iniciando preenchimento do formulário com", configs ? configs.length : 0, "configurações.");
    if (!configForm) {
        console.warn("[AdminConfig] populateConfigForm: Formulário de configuração (configForm) não encontrado para popular.");
        return;
    }
    if (!Array.isArray(configs)) {
        console.warn("[AdminConfig] populateConfigForm: Dados de configurações recebidos não são um array:", configs);
        showAlert("Formato de dados de configurações inválido recebido do servidor.", "error");
        return;
    }

    configs.forEach((config) => {
      const inputId = `config_${config.CONFIG_KEY}`;
      const input = document.getElementById(inputId);
      // console.log(`[AdminConfig] populateConfigForm: Procurando input ${inputId} para chave ${config.CONFIG_KEY}`);

      if (input) {
        // console.log(`[AdminConfig] populateConfigForm: Input ${inputId} encontrado. Tipo: ${input.type}, Valor do DB: ${config.CONFIG_VALUE}`);
        if (input.type === "checkbox") {
          input.checked = config.CONFIG_VALUE === true || config.CONFIG_VALUE === 'true';
        } else if (input.type === "number") {
          input.value = Number(config.CONFIG_VALUE);
        } else {
          input.value = config.CONFIG_VALUE;
        }
        // console.log(`[AdminConfig] populateConfigForm: Populado ${inputId} com valor: ${input.value} (checked: ${input.checked})`);
      } else {
        // console.warn(`[AdminConfig] populateConfigForm: Input com ID '${inputId}' não encontrado no formulário para a chave: ${config.CONFIG_KEY}`);
      }
    });
    console.log("[AdminConfig] populateConfigForm: Preenchimento do formulário concluído.");
  }

  async function saveConfigs(event) {
    console.log("[AdminConfig] saveConfigs: Função saveConfigs INICIADA.");
    if (event) {
        console.log("[AdminConfig] saveConfigs: Evento de submit recebido, prevenindo default.");
        event.preventDefault();
    } else {
        console.warn("[AdminConfig] saveConfigs: Função chamada sem evento.");
    }

    if (!configForm) {
        console.error("[AdminConfig] saveConfigs: Formulário de configuração não encontrado. Abortando.");
        showAlert("Formulário de configuração não encontrado.", "error");
        return;
    }
    console.log("[AdminConfig] saveConfigs: Coletando dados do formulário...");

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
                value = inputElement.checked.toString();
            } else if (inputElement.type === "number") {
                value = inputElement.value;
                if (isNaN(parseFloat(value))) {
                    console.warn(`[AdminConfig] saveConfigs: Valor inválido para ${map.key}: ${value}`);
                    showAlert(`Valor inválido para ${map.description || map.key}. Deve ser um número.`, "warning");
                    formIsValid = false;
                }
            } else {
                value = inputElement.value;
            }
            configsToSave.push({ key: map.key, value: value, type: map.type, description: map.description });
        } else {
            console.warn(`[AdminConfig] saveConfigs: Input ${map.id} não encontrado para salvar.`);
        }
    });
    console.log("[AdminConfig] saveConfigs: Configurações coletadas para salvar:", JSON.stringify(configsToSave));

    if (!formIsValid) {
        console.warn("[AdminConfig] saveConfigs: Formulário inválido. Abortando salvamento.");
        return;
    }

    console.log("[AdminConfig] saveConfigs: Iniciando loop para enviar configurações ao backend.");
    try {
      let allSavedSuccessfully = true;
      for (const config of configsToSave) {
        console.log(`[AdminConfig] saveConfigs: Enviando configuração ${config.key} com valor ${config.value}`);
        const response = await fetch("/api/admin/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });
        console.log(`[AdminConfig] saveConfigs: Resposta do fetch para ${config.key}, status:`, response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: `Erro HTTP: ${response.status} ao salvar ${config.key}` }));
          console.error(`[AdminConfig] saveConfigs: Erro ao salvar ${config.key}:`, errorData.message);
          showAlert(`Erro ao salvar configuração '${config.key}': ${errorData.message}`, "error");
          allSavedSuccessfully = false;
        } else {
          const result = await response.json();
          console.log(`[AdminConfig] saveConfigs: Resultado do backend para ${config.key}:`, result);
          if (!result.success) {
            console.warn(`[AdminConfig] saveConfigs: Falha ao salvar ${config.key} (backend informou erro):`, result.message);
            showAlert(`Falha ao salvar configuração '${config.key}': ${result.message}`, "error");
            allSavedSuccessfully = false;
          } else {
            console.log(`[AdminConfig] saveConfigs: Configuração ${config.key} salva com sucesso.`);
          }
        }
      }

      if (allSavedSuccessfully) {
        console.log("[AdminConfig] saveConfigs: Todas as configurações salvas com sucesso!");
        showAlert("Configurações salvas com sucesso!", "success");
        loadConfigs(); 
      } else {
        console.warn("[AdminConfig] saveConfigs: Algumas configurações podem não ter sido salvas.");
        showAlert("Algumas configurações podem não ter sido salvas. Verifique os alertas.", "warning");
      }

    } catch (error) {
      console.error("[AdminConfig] saveConfigs: Erro de rede ou servidor ao salvar configurações:", error);
      showAlert("Erro de rede ou servidor ao salvar configurações: " + error.message, "error");
    }
    console.log("[AdminConfig] saveConfigs: Função saveConfigs CONCLUÍDA.");
  }

  function showAlert(message, type = "info", duration = 3500) {
    console.log(`[AdminConfig] showAlert: Tipo: ${type}, Mensagem: ${message}`);
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

  if (configForm) {
    configForm.addEventListener("submit", (event) => {
        console.log("[AdminConfig] Evento de SUBMIT disparado no configForm.");
        saveConfigs(event);
    });
    console.log("[AdminConfig] Event listener de 'submit' ADICIONADO ao configForm.");
  } else {
    console.error("[AdminConfig] configForm não encontrado, não foi possível adicionar event listener de submit.");
  }

  console.log("[AdminConfig] Chamando loadConfigs() para carregar configurações iniciais.");
  loadConfigs();
  console.log("[AdminConfig] Script de configurações (adminConfig.js) finalizado sua execução inicial.");
})(); // Fim da IIFE
