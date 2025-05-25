// Serviço de notificações sonoras
window.NotificationService = {
  enabled: true,
  // soundType: "default", // Removido: não é mais necessário carregar tipos de som de arquivos
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
    // this.soundType = config.soundType || "default"; // Removido

    try {
      // Inicializar o contexto de áudio
      if (window.AudioContext || window.webkitAudioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }

      // Modificado: Sempre criar sons de fallback em vez de carregar de arquivos
      this.createFallbackSounds();

      console.log("[NotificationService] Serviço de notificações carregado com sons criados.")
      return true
    } catch (error) {
      console.error("[NotificationService] Erro ao inicializar serviço de notificações:", error)
      // Garantir que os sons de fallback sejam tentados mesmo em caso de erro na inicialização do AudioContext
      if (!this.sounds.message && !this.sounds.newChat) {
        this.createFallbackSounds();
      }
      return false
    }
  },

  // Removido: loadSounds() não é mais necessário, pois sempre usamos os sons criados.
  /*
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
  */

  // Removido: loadSound(url) não é mais necessário.
  /*
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
  */

  // Criar sons de fallback caso os arquivos não sejam encontrados (agora é o método padrão)
  createFallbackSounds() {
    console.log("[NotificationService] Criando sons de fallback programaticamente")

    if (!this.audioContext) {
      console.warn("[NotificationService] AudioContext não disponível. Tentando usar elementos de áudio simples para fallback.")

      // Usar elementos de áudio simples como fallback se AudioContext não estiver disponível
      // Estes são sons de "beep" muito básicos codificados em base64.
      // Você pode substituir os dados base64 por outros sons WAV curtos, se desejar.
      const beepBase64 = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU50T1M+AAAAAA=="; // Um beep curto e simples

      if (!this.sounds.message) {
          try {
            const audio = new Audio(beepBase64);
            audio.volume = 0.3;
            this.sounds.message = {
                play: () => {
                    console.log("[NotificationService] Reproduzindo som de mensagem (simulado com Audio element)");
                    // É preciso criar uma nova instância ou clonar para reproduções sobrepostas rápidas se necessário,
                    // mas para notificações simples, redefinir currentTime e play() geralmente é suficiente.
                    const newAudioInstance = audio.cloneNode();
                    newAudioInstance.currentTime = 0;
                    newAudioInstance.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir beep de mensagem:", e));
                }
            };
          } catch(e) {
              console.warn("[NotificationService] Erro ao criar som de mensagem com Audio element:", e);
              // Fallback final para o console se nem o Audio element funcionar
              this.sounds.message = { play: () => console.log("Beep de mensagem (fallback console)") };
          }
      }

      if (!this.sounds.newChat) {
          try {
            const audio = new Audio(beepBase64); // Pode usar um beep diferente se desejar
            audio.volume = 0.5;
             this.sounds.newChat = {
                play: () => {
                    console.log("[NotificationService] Reproduzindo som de nova conversa (simulado com Audio element)");
                    const newAudioInstance = audio.cloneNode();
                    newAudioInstance.currentTime = 0;
                    newAudioInstance.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir beep de nova conversa:", e));
                }
            };
          } catch(e) {
              console.warn("[NotificationService] Erro ao criar som de nova conversa com Audio element:", e);
              this.sounds.newChat = { play: () => console.log("Beep de nova conversa (fallback console)") };
          }
      }
      console.log("[NotificationService] Sons de fallback (com Audio element ou console) criados.");
      return;
    }

    // Criar som de mensagem (beep curto) usando AudioContext se disponível
    if (!this.sounds.message) {
      this.sounds.message = this.createBeepSound(200, 0.2, 440, 0.7); // Frequência, duração, frequência final, volume
    }

    // Criar som de nova conversa (beep duplo ou diferente) usando AudioContext
    if (!this.sounds.newChat) {
      // Exemplo: um som um pouco mais longo e com modulação de pitch
      this.sounds.newChat = this.createBeepSound(300, 0.3, 600, 0.6, true); // Frequência, duração, frequência final, volume, duplo
    }

    console.log("[NotificationService] Sons de fallback (com AudioContext) criados")
  },

  // Criar um som de beep com AudioContext
  // Parâmetros adicionados para mais controle: startFreq, endFreq, volume, isDouble
  createBeepSound(startFreq = 440, duration = 0.2, endFreq, volume = 0.5, isDouble = false) {
    try {
      if (!this.audioContext) return null;

      const sampleRate = this.audioContext.sampleRate;
      const actualEndFreq = endFreq !== undefined ? endFreq : startFreq; // Se endFreq não for fornecido, não há varredura de frequência

      // Ajustar a duração total se for um beep duplo para incluir o intervalo
      const singleBeepDuration = duration;
      const gapDuration = isDouble ? 0.1 : 0; // 100ms de intervalo para beep duplo
      const totalDuration = isDouble ? (singleBeepDuration * 2) + gapDuration : singleBeepDuration;

      const buffer = this.audioContext.createBuffer(1, Math.ceil(sampleRate * totalDuration), sampleRate);
      const data = buffer.getChannelData(0);

      const generateBeep = (offset, freq1, freq2, beepDur) => {
        for (let i = 0; i < sampleRate * beepDur; i++) {
          const t = i / sampleRate; // Tempo em segundos
          const currentFreq = freq1 + (freq2 - freq1) * (i / (sampleRate * beepDur)); // Interpolação linear da frequência
          // Envelope de decaimento exponencial simples para evitar cliques
          const envelope = Math.exp(-5 * t / beepDur);
          data[Math.ceil(offset * sampleRate) + i] = Math.sin(2 * Math.PI * currentFreq * t) * envelope * volume;
        }
      };

      // Gerar o primeiro (ou único) beep
      generateBeep(0, startFreq, actualEndFreq, singleBeepDuration);

      // Se for duplo, gerar o segundo beep após o intervalo
      if (isDouble) {
        // Opcional: variar o segundo beep (ex: frequência um pouco mais alta)
        generateBeep(singleBeepDuration + gapDuration, startFreq * 1.2, actualEndFreq * 1.2, singleBeepDuration);
      }

      return buffer;
    } catch (error) {
      console.error("[NotificationService] Erro ao criar som de beep:", error);
      return null;
    }
  },

  // Reproduzir um som
  playSound(soundSource) { // Renomeado o parâmetro para clareza
    if (!this.enabled) {
      return;
    }

    try {
      if (!soundSource) {
        console.warn("[NotificationService] Fonte de som não disponível para reprodução");
        return;
      }

      // Se for um AudioBuffer (criado com AudioContext)
      if (this.audioContext && soundSource instanceof AudioBuffer) {
        const sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = soundSource;
        sourceNode.connect(this.audioContext.destination);
        sourceNode.start();
        return;
      }

      // Se for um objeto com método play (fallback para Audio elements simulados)
      if (soundSource.play && typeof soundSource.play === "function") {
        soundSource.play();
        return;
      }
      
      // Se for um elemento de áudio HTML (caso o fallback não use o wrapper {play: fn})
      // Esta verificação pode ser redundante se createFallbackSounds sempre encapsular em {play: fn}
      if (soundSource instanceof Audio) {
        soundSource.currentTime = 0;
        soundSource.play().catch((e) => console.warn("[NotificationService] Erro ao reproduzir áudio HTML:", e));
        return;
      }

      console.warn("[NotificationService] Tipo de fonte de som desconhecido ou não reproduzível:", soundSource);
    } catch (error) {
      console.error("[NotificationService] Erro ao reproduzir som:", error);
    }
  },

  // Reproduzir som de mensagem
  playMessageSound() {
    console.log("[NotificationService] Tentando reproduzir som de mensagem criado");
    this.playSound(this.sounds.message);
  },

  // Reproduzir som de nova conversa
  playNewChatSound() {
    console.log("[NotificationService] Tentando reproduzir som de nova conversa criado");
    this.playSound(this.sounds.newChat);
  },

  // Ativar/desativar notificações
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[NotificationService] Notificações ${enabled ? "ativadas" : "desativadas"}`);
  },

  // Removido: setSoundType(soundType) não é mais relevante.
  /*
  async setSoundType(soundType) {
    this.soundType = soundType
    console.log(`[NotificationService] Tipo de som alterado para: ${soundType}`)
    // await this.loadSounds() // Esta linha seria removida de qualquer forma
  },
  */
};

// Exemplo de como inicializar, se necessário (coloque isso onde você inicializa seus serviços)
/*
document.addEventListener('DOMContentLoaded', () => {
  window.NotificationService.init({ enabled: true })
    .then(success => {
      if (success) {
        console.log("NotificationService inicializado com sucesso.");
        // Para testar:
        // setTimeout(() => window.NotificationService.playMessageSound(), 2000);
        // setTimeout(() => window.NotificationService.playNewChatSound(), 4000);
      } else {
        console.warn("NotificationService não pôde ser inicializado corretamente.");
      }
    });
});
*/
