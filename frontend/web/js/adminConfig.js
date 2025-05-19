// frontend/web/js/adminConfig.js
document.addEventListener("DOMContentLoaded", () => {
  const configSection = document.getElementById("configuracoesSection")
  if (!configSection) return

  // Elementos da UI
  const configForm = document.getElementById("configForm")
  const saveConfigBtn = document.getElementById("saveConfigBtn")

  // Carregar todas as configurações
  async function loadConfigs() {
    try {
      const response = await fetch("/api/admin/config")
      const data = await response.json()

      if (data.success) {
        populateConfigForm(data.data)
      } else {
        showAlert("Erro ao carregar configurações: " + data.message, "error")
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error)
      showAlert("Erro ao carregar configurações. Verifique a conexão.", "error")
    }
  }

  // Preencher formulário de configurações
  function populateConfigForm(configs) {
    configs.forEach((config) => {
      const inputId = `config_${config.CONFIG_KEY}`
      const input = document.getElementById(inputId)

      if (input) {
        if (input.type === "checkbox") {
          input.checked = config.CONFIG_VALUE.toLowerCase() === "true"
        } else {
          input.value = config.CONFIG_VALUE
        }
      }
    })
  }

  // Salvar configurações
  async function saveConfigs(event) {
    event.preventDefault()

    const configsToSave = [
      {
        key: "bot_active",
        value: document.getElementById("config_bot_active").checked.toString(),
        type: "boolean",
        description: "Ativa/desativa o robô de respostas automáticas",
      },
      {
        key: "bot_response_delay",
        value: document.getElementById("config_bot_response_delay").value,
        type: "number",
        description: "Delay em milissegundos antes de enviar resposta automática",
      },
      {
        key: "bot_working_days",
        value: document.getElementById("config_bot_working_days").value,
        type: "string",
        description: "Dias da semana em que o robô está ativo (0=Domingo, 1=Segunda, etc)",
      },
      {
        key: "bot_working_hours_start",
        value: document.getElementById("config_bot_working_hours_start").value,
        type: "string",
        description: "Horário de início do funcionamento do robô",
      },
      {
        key: "bot_working_hours_end",
        value: document.getElementById("config_bot_working_hours_end").value,
        type: "string",
        description: "Horário de término do funcionamento do robô",
      },
      {
        key: "bot_out_of_hours_message",
        value: document.getElementById("config_bot_out_of_hours_message").value,
        type: "string",
        description: "Mensagem enviada fora do horário de funcionamento",
      },
    ]

    try {
      // Salvar cada configuração
      for (const config of configsToSave) {
        await fetch("/api/admin/config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config),
        })
      }

      showAlert("Configurações salvas com sucesso!", "success")
    } catch (error) {
      console.error("Erro ao salvar configurações:", error)
      showAlert("Erro ao salvar configurações. Verifique a conexão.", "error")
    }
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

  // Event Listeners
  if (configForm) {
    configForm.addEventListener("submit", saveConfigs)
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener("click", (e) => {
      e.preventDefault()
      saveConfigs(e)
    })
  }

  // Inicializar
  loadConfigs()
})
