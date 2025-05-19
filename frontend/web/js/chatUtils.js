// Utilitários para o chat
window.ChatUtils = {
  // Formatar data e hora
  formatDateTime(timestamp) {
    if (!timestamp) return ""

    const date = new Date(timestamp)

    // Verificar se é uma data válida
    if (isNaN(date.getTime())) return ""

    return date.toLocaleString()
  },

  // Formatar apenas a hora
  formatTime(timestamp) {
    if (!timestamp) return ""

    const date = new Date(timestamp)

    // Verificar se é uma data válida
    if (isNaN(date.getTime())) return ""

    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  },

  // Formatar apenas a data
  formatDate(timestamp) {
    if (!timestamp) return ""

    const date = new Date(timestamp)

    // Verificar se é uma data válida
    if (isNaN(date.getTime())) return ""

    return date.toLocaleDateString()
  },

  // Formatar número de telefone
  formatPhoneNumber(phone) {
    if (!phone) return ""

    // Remover caracteres não numéricos
    const cleaned = phone.replace(/\D/g, "")

    // Verificar se é um número brasileiro
    if (cleaned.length === 11) {
      // Formato: (XX) XXXXX-XXXX
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`
    } else if (cleaned.length === 10) {
      // Formato: (XX) XXXX-XXXX
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`
    }

    // Retornar o número original se não for possível formatar
    return phone
  },

  // Truncar texto
  truncateText(text, maxLength = 50) {
    if (!text) return ""

    if (text.length <= maxLength) {
      return text
    }

    return text.substring(0, maxLength) + "..."
  },

  // Gerar ID único
  generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  },

  // Escapar HTML
  escapeHtml(text) {
    if (!text) return ""

    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  },

  // Converter links em texto para elementos clicáveis
  linkify(text) {
    if (!text) return ""

    // Regex para URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g

    // Substituir URLs por links
    return text.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    })
  },

  // Formatar mensagem (escapar HTML e converter links)
  formatMessage(text) {
    if (!text) return ""

    // Primeiro escapar HTML
    const escaped = this.escapeHtml(text)

    // Depois converter links
    return this.linkify(escaped)
  },

  // Verificar se uma data é hoje
  isToday(timestamp) {
    if (!timestamp) return false

    const date = new Date(timestamp)
    const today = new Date()

    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  },

  // Calcular tempo relativo (ex: "há 5 minutos")
  getRelativeTime(timestamp) {
    if (!timestamp) return ""

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) {
      return "agora"
    } else if (diffMin < 60) {
      return `há ${diffMin} ${diffMin === 1 ? "minuto" : "minutos"}`
    } else if (diffHour < 24) {
      return `há ${diffHour} ${diffHour === 1 ? "hora" : "horas"}`
    } else if (diffDay < 30) {
      return `há ${diffDay} ${diffDay === 1 ? "dia" : "dias"}`
    } else {
      return this.formatDate(timestamp)
    }
  },
}

// Corrigir o arquivo chatActions.js para garantir que ele exista
// Este código deve ser adicionado em um arquivo separado chamado chatActions.js
// window.ChatActions = {
//   // Ações relacionadas ao chat
//   sendMessage(message) {
//     // Lógica para enviar mensagem
//   },
//   // Outras ações...
// };
