// frontend/web/js/indexScript.js
document.addEventListener("DOMContentLoaded", () => {
  const loginPageSubtitleElement = document.getElementById('loginPageSubtitle'); 
  const appVersionLoginElement = document.getElementById('appVersionLogin');
  const currentYearElement = document.getElementById("currentYear"); // Para o ano no rodapé

  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const applyTheme = (theme) => { // theme deve ser 'dark' ou 'light'
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[IndexTheme] Tema aplicado: ${theme}`);
  };

  const initializeSystemTheme = () => {
    // Tenta obter o tema inicial diretamente do Electron API, se disponível
    if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
        window.electronAPI.getSystemTheme().then(theme => {
            applyTheme(theme); // 'theme' já será 'dark' ou 'light'
        }).catch(err => {
            console.warn("[IndexTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
            checkSystemThemeFallback();
        });
    } else {
        // Fallback para window.matchMedia se a API do Electron não estiver disponível ou a função não existir
        checkSystemThemeFallback();
    }
  };
  
  const checkSystemThemeFallback = () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light'); // Padrão para claro se matchMedia não for suportado
    }
  };
  
  initializeSystemTheme(); 

  // Ouvir mudanças de tema do sistema operacional via matchMedia (fallback ou para navegadores)
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
  
  // Ouvir atualizações de tema do processo principal do Electron
  if (window.electronAPI && typeof window.electronAPI.onSystemThemeUpdate === 'function') {
      window.electronAPI.onSystemThemeUpdate((theme) => { // theme já é 'dark' ou 'light'
          console.log('[IndexTheme] Recebida atualização de tema do sistema via Electron API:', theme);
          applyTheme(theme);
      });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  // --- INÍCIO: Lógica para exibir o subtítulo da página de destino ---
  if (loginPageSubtitleElement) {
      try {
          const pageTitle = sessionStorage.getItem('loginRedirectPageTitle');
          if (pageTitle) {
              loginPageSubtitleElement.textContent = pageTitle;
          } else {
            loginPageSubtitleElement.textContent = "Acesse sua conta"; // Subtítulo Padrão
          }
      } catch (e) {
          console.error("[IndexScript] Erro ao acessar sessionStorage para pageTitle:", e);
          loginPageSubtitleElement.textContent = "Acesse sua conta";
      }
  }
  // --- FIM: Lógica para exibir o subtítulo da página de destino ---

  // --- INÍCIO: Atualizar ano no rodapé ---
  if (currentYearElement) {
    currentYearElement.textContent = new Date().getFullYear();
  }
  // --- FIM: Atualizar ano no rodapé ---

  // Toggle password visibility
  const togglePasswordButton = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  const eyeIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-icon") : null;
  const eyeSlashIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-slash-icon") : null;

  if (togglePasswordButton && passwordInput && eyeIcon && eyeSlashIcon) {
    togglePasswordButton.addEventListener("click", () => {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);

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
  const backToMenuBtn = document.getElementById("backToMenuBtn"); 
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

    if(errorMessageDiv) errorMessageDiv.textContent = ""; 

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    let originalBtnText = "";
    if (submitBtn) {
        originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Entrando...';
    }

    try {
      const response = await fetch("/api/auth/login", { 
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
        
        let navigationPayload = { fromLoginWindow: true }; 
        if (data.admin) { 
            navigationPayload.adminInfo = { name: data.name || username, agent: data.agent, isAdmin: true };
        } else { 
            navigationPayload.agentInfo = { agent: data.agent, name: data.name || username };
            navigationPayload.adminInfo = { isAdmin: false, agent: data.agent, name: data.name || username }; 
        }
        
        let intendedTarget = data.admin ? 'admin' : 'chat'; 
        try {
            const storedTarget = sessionStorage.getItem('loginRedirectTarget');
            if (storedTarget) intendedTarget = storedTarget;
            sessionStorage.removeItem('loginRedirectTarget'); 
            sessionStorage.removeItem('loginRedirectPageTitle');
        } catch(e) { console.error("Erro ao limpar sessionStorage", e); }

        console.log(`[IndexLogin] Login OK. Chamando navigate para destino (será decidido por pendingLoginTarget no main): ${intendedTarget}. Payload:`, navigationPayload);
        
        if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
          window.electronAPI.navigate(intendedTarget, navigationPayload);
        } else {
          if(errorMessageDiv) errorMessageDiv.textContent = "Login bem-sucedido. API de navegação não disponível.";
          console.warn("API do Electron não encontrada para navegação pós-login.");
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

  // --- Lógica do Botão Voltar ---
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener("click", () => {
      if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
        console.log("[IndexNav] Solicitando retorno ao menu via Electron API.");
        window.electronAPI.navigate('menu', { fromLoginWindow: true }); 
      } else {
        console.warn("[IndexNav] electronAPI.navigate não disponível. Fallback: Navegando para menu.html");
        window.location.href = 'menu.html'; 
      }
    });
  }

  document.querySelectorAll(".input-wrapper input").forEach((input) => {
    input.addEventListener("focus", () => {
      if (input.parentElement && input.parentElement.parentElement) { 
        input.parentElement.parentElement.classList.add("focused");
      }
    });
    input.addEventListener("blur", () => {
       if (input.parentElement && input.parentElement.parentElement) {
        input.parentElement.parentElement.classList.remove("focused");
      }
    });
  });

  // --- Versão do App ---
  if (appVersionLoginElement && window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
      window.electronAPI.getAppInfo().then(info => {
          if (info && info.version) {
              appVersionLoginElement.textContent = info.version;
          } else {
              appVersionLoginElement.textContent = 'N/D';
          }
      }).catch(err => {
          console.error("[IndexScript] Erro ao obter versão do app:", err);
          appVersionLoginElement.textContent = 'N/D';
      });
  } else if (appVersionLoginElement) {
       appVersionLoginElement.textContent = 'N/D';
  }

});
