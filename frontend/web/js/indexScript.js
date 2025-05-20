// frontend/web/js/indexScript.js
document.addEventListener("DOMContentLoaded", () => {
  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    // Opcional: Salvar a preferência do usuário no localStorage, se você adicionar um seletor manual
    // localStorage.setItem('theme', theme);
    console.log(`[IndexTheme] Tema aplicado: ${theme}`);
  };

  const checkSystemTheme = () => {
    // Opcional: Verificar se há um tema salvo pelo usuário
    // const savedTheme = localStorage.getItem('theme');
    // if (savedTheme) {
    //    applyTheme(savedTheme);
    //    return;
    // }

    // Verificar preferência do sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  };

  // Aplicar tema na carga inicial
  checkSystemTheme();

  // Ouvir mudanças na preferência do sistema em tempo real
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  // Set current year in footer
  const currentYearElement = document.getElementById("currentYear");
  if (currentYearElement) {
    currentYearElement.textContent = new Date().getFullYear();
  }

  // Toggle password visibility
  const togglePasswordButton = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  const eyeIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-icon") : null;
  const eyeSlashIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-slash-icon") : null;

  if (togglePasswordButton && passwordInput && eyeIcon && eyeSlashIcon) {
    togglePasswordButton.addEventListener("click", () => {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);

      // Update icon based on password visibility
      if (type === "password") {
        eyeIcon.style.display = "block";
        eyeSlashIcon.style.display = "none";
      } else {
        eyeIcon.style.display = "none";
        eyeSlashIcon.style.display = "block";
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  const closeAppBtn = document.getElementById("closeAppBtn");
  const errorMessageDiv = document.getElementById("errorMessage");

  if (!loginForm) {
    console.error("Elemento loginForm não encontrado!");
    const body = document.querySelector("body");
    if (body) {
      body.innerHTML =
        '<p style="color: red; text-align: center; margin-top: 50px;">Erro crítico: Formulário de login não encontrado. Verifique o HTML.</p>';
    }
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const usernameInput = document.getElementById("username");
    const passwordInputRef = document.getElementById("password");

    if (!usernameInput || !passwordInputRef) {
        if(errorMessageDiv) errorMessageDiv.textContent = "Campos de usuário ou senha não encontrados no formulário.";
        return;
    }

    const username = usernameInput.value;
    const password = passwordInputRef.value;

    if (!username || !password) {
      if(errorMessageDiv) errorMessageDiv.textContent = "Por favor, preencha todos os campos.";
      return;
    }

    if(errorMessageDiv) errorMessageDiv.textContent = ""; // Limpa mensagens de erro anteriores

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    let originalBtnText = "";
    if (submitBtn) {
        originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Entrando...';
    }

    try {
      // Comunicação com o backend para autenticação
      const response = await fetch("/api/auth/login", { // Endpoint do backend
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }

      if (response.ok && data.success) {
        console.log("Login bem-sucedido:", data);
        loginForm.classList.add("success");

        // Navegação usando electronAPI (se disponível)
        if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
          if (data.admin) {
            // Para admin, passar adminInfo com nome e o 'agent' que é o username
            window.electronAPI.navigate("admin", { adminInfo: { name: data.name || username, agent: data.agent } });
          } else {
            // Para atendente, passar agentInfo com 'agent' (username) e nome
            window.electronAPI.navigate("chat", { agentInfo: { agent: data.agent, name: data.name || username } });
          }
        } else {
          // Fallback para navegação web ou mensagem de erro
          if(errorMessageDiv) errorMessageDiv.textContent = "Login bem-sucedido (simulado). Navegação não disponível neste ambiente.";
          console.warn("API do Electron não encontrada para navegação.");
          // Exemplo de fallback para web:
          // window.location.href = data.admin ? 'admin.html' : `chat.html?agentId=${encodeURIComponent(data.agent)}&agentName=${encodeURIComponent(data.name || data.agent)}`;
        }
      } else {
        if(errorMessageDiv) errorMessageDiv.textContent = data.message || "Falha no login. Verifique suas credenciais.";
        loginForm.classList.add("error-shake");
        setTimeout(() => {
          loginForm.classList.remove("error-shake");
        }, 500);
      }
    } catch (error) {
      console.error("Erro durante a requisição de login:", error);
      if(errorMessageDiv) errorMessageDiv.textContent = "Ocorreu um erro ao tentar conectar ao servidor.";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    }
  });

  if (closeAppBtn && window.electronAPI && typeof window.electronAPI.closeApp === "function") {
    closeAppBtn.addEventListener("click", () => {
      window.electronAPI.closeApp();
    });
  } else if (closeAppBtn) {
      closeAppBtn.addEventListener("click", () => {
          if (confirm("Deseja fechar esta aba? (Simulação - não funciona em todos os contextos)")) {
            window.close();
          }
      });
  }

  document.querySelectorAll(".input-wrapper input").forEach((input) => {
    input.addEventListener("focus", () => {
      if (input.parentElement && input.parentElement.parentElement) { // input -> input-group -> input-wrapper
        input.parentElement.parentElement.classList.add("focused");
      }
    });
    input.addEventListener("blur", () => {
       if (input.parentElement && input.parentElement.parentElement) {
        input.parentElement.parentElement.classList.remove("focused");
      }
    });
  });
});
