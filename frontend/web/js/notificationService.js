// Serviço de notificações sonoras
window.NotificationService = {
  enabled: true,
  soundType: "default",
  sounds: {
    message: null,
    newChat: null,
  },
  audioContext: null,

  // Inicializar o serviço
  async init(config = {}) {
    console.log("[NotificationService] Inicializando serviço de notificações")

    // Configurar com base nos parâmetros ou valores padrão
    this.enabled = config.enabled !== undefined ? config.enabled : true
    this.soundType = config.soundType || "default"

    try {
      // Inicializar o contexto de áudio
      if (window.AudioContext || window.webkitAudioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }

      // Carregar os sons
      await this.loadSounds()

      console.log("[NotificationService] Serviço de notificações carregado.")
      return true
    } catch (error) {
      console.error("[NotificationService] Erro ao inicializar serviço de notificações:", error)
      // Criar sons de fallback mesmo em caso de erro
      this.createFallbackSounds()
      return false
    }
  },

  // Carregar os sons
  async loadSounds() {
    try {
      // Definir caminhos dos arquivos de som com base no tipo selecionado
      const messageSoundPath = `./audio/${this.soundType}_message.mp3`
      const newChatSoundPath = `./audio/${this.soundType}_new_chat.mp3`

      // Tentar carregar os sons
      const messageSound = await this.loadSound(messageSoundPath)
      const newChatSound = await this.loadSound(newChatSoundPath)

      // Se os sons foram carregados com sucesso, armazená-los
      if (messageSound) this.sounds.message = messageSound
      if (newChatSound) this.sounds.newChat = newChatSound

      // Se algum som não foi carregado, criar sons de fallback
      if (!this.sounds.message || !this.sounds.newChat) {
        console.log("[NotificationService] Criando sons de fallback para sons não carregados")
        this.createFallbackSounds()
      } else {
        console.log("[NotificationService] Sons carregados com sucesso")
      }
    } catch (error) {
      console.error("[NotificationService] Erro ao carregar sons:", error)
      // Criar sons de fallback em caso de erro
      this.createFallbackSounds()
    }
  },

  // Carregar um som específico
  async loadSound(url) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Não foi possível carregar o som: ${url}`)
      }

      if (!this.audioContext) {
        console.warn("[NotificationService] AudioContext não disponível, usando elemento de áudio")
        const audio = new Audio(url)
        return audio
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)

      return audioBuffer
    } catch (error) {
      console.warn(`[NotificationService] Erro ao carregar som ${url}:`, error)
      return null
    }
  },

  // Criar sons de fallback caso os arquivos não sejam encontrados
  createFallbackSounds() {
    console.log("[NotificationService] Criando sons de fallback")

    if (!this.audioContext) {
      console.warn("[NotificationService] AudioContext não disponível para criar sons de fallback")

      // Usar elementos de áudio simples como fallback
      this.sounds.message = {
        play: () => {
          console.log("[NotificationService] Reproduzindo som de mensagem (simulado)")
          if (window.Audio) {
            try {
              const beep = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...")
              beep.volume = 0.3
              beep.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir beep:", e))
            } catch (e) {
              console.warn("[NotificationService] Erro ao criar beep:", e)
            }
          }
        },
      }

      this.sounds.newChat = {
        play: () => {
          console.log("[NotificationService] Reproduzindo som de nova conversa (simulado)")
          if (window.Audio) {
            try {
              const beep = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...")
              beep.volume = 0.5
              beep.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir beep:", e))
            } catch (e) {
              console.warn("[NotificationService] Erro ao criar beep:", e)
            }
          }
        },
      }

      return
    }

    // Criar som de mensagem (beep curto)
    if (!this.sounds.message) {
      this.sounds.message = this.createBeepSound(200, 0.3)
    }

    // Criar som de nova conversa (beep duplo)
    if (!this.sounds.newChat) {
      this.sounds.newChat = this.createBeepSound(300, 0.5, true)
    }

    console.log("[NotificationService] Sons de fallback criados")
  },

  // Criar um som de beep
  createBeepSound(frequency = 440, duration = 0.3, isDouble = false) {
    try {
      if (!this.audioContext) return null

      const sampleRate = this.audioContext.sampleRate
      const buffer = this.audioContext.createBuffer(1, sampleRate * (isDouble ? duration * 2 : duration), sampleRate)
      const data = buffer.getChannelData(0)

      // Gerar onda senoidal para o primeiro beep
      for (let i = 0; i < sampleRate * duration; i++) {
        data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * Math.exp((-5 * i) / (sampleRate * duration))
      }

      // Se for duplo, adicionar segundo beep após um pequeno intervalo
      if (isDouble) {
        const gap = sampleRate * 0.1 // 100ms de intervalo
        for (let i = 0; i < sampleRate * duration; i++) {
          if (i + sampleRate * duration + gap < data.length) {
            data[i + sampleRate * duration + gap] =
              Math.sin((2 * Math.PI * (frequency * 1.2) * i) / sampleRate) *
              Math.exp((-5 * i) / (sampleRate * duration))
          }
        }
      }

      return buffer
    } catch (error) {
      console.error("[NotificationService] Erro ao criar som de beep:", error)
      return null
    }
  },

  // Reproduzir um som
  playSound(soundBuffer) {
    if (!this.enabled) {
      return
    }

    try {
      if (!soundBuffer) {
        console.warn("[NotificationService] Som não disponível para reprodução")
        return
      }

      // Se for um elemento de áudio
      if (soundBuffer instanceof Audio) {
        soundBuffer.currentTime = 0
        soundBuffer.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir áudio:", e))
        return
      }

      // Se for um AudioBuffer
      if (this.audioContext && soundBuffer instanceof AudioBuffer) {
        const source = this.audioContext.createBufferSource()
        source.buffer = soundBuffer
        source.connect(this.audioContext.destination)
        source.start()
        return
      }

      // Se for um objeto com método play (fallback)
      if (soundBuffer.play && typeof soundBuffer.play === "function") {
        soundBuffer.play()
        return
      }

      console.warn("[NotificationService] Tipo de som desconhecido:", soundBuffer)
    } catch (error) {
      console.error("[NotificationService] Erro ao reproduzir som:", error)
    }
  },

  // Reproduzir som de mensagem
  playMessageSound() {
    console.log("[NotificationService] Reproduzindo som de mensagem")
    this.playSound(this.sounds.message)
  },

  // Reproduzir som de nova conversa
  playNewChatSound() {
    console.log("[NotificationService] Reproduzindo som de nova conversa")
    this.playSound(this.sounds.newChat)
  },

  // Ativar/desativar notificações
  setEnabled(enabled) {
    this.enabled = enabled
    console.log(`[NotificationService] Notificações ${enabled ? "ativadas" : "desativadas"}`)
  },

  // Alterar tipo de som
  async setSoundType(soundType) {
    this.soundType = soundType
    console.log(`[NotificationService] Tipo de som alterado para: ${soundType}`)
    await this.loadSounds()
  },
}
