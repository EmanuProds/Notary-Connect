// loginScript.js (anteriormente indexScript.js)
document.addEventListener("DOMContentLoaded", () => {
  const loginPageSubtitleElement = document.getElementById('loginPageSubtitle'); 
  const appVersionLoginElement = document.getElementById('appVersionLogin');
  const currentYearElement = document.getElementById("currentYear");

  // --- INÍCIO: Lógica de Detecção e Aplicação de Tema ---
  const THEME_STORAGE_KEY = 'notaryConnectTheme'; // Chave para localStorage

  const applyTheme = (theme) => { 
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[LoginTheme] Tema aplicado: ${theme}`); 
  };

  const initializePageTheme = () => {
    let themeToApply = 'light'; 
    try {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) {
            themeToApply = savedTheme;
            console.log(`[LoginTheme] Tema '${savedTheme}' carregado do localStorage.`);
        } else {
            if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
                window.electronAPI.getSystemTheme().then(themeFromElectron => {
                    applyTheme(themeFromElectron);
                }).catch(err => {
                    console.warn("[LoginTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
                    checkSystemThemeFallbackForLogin();
                });
                return; 
            } else {
                 checkSystemThemeFallbackForLogin();
            }
        }
    } catch (e) {
        console.warn("[LoginTheme] Erro ao acessar localStorage, usando tema do sistema/padrão:", e);
        checkSystemThemeFallbackForLogin();
    }
    applyTheme(themeToApply);
  };

  const checkSystemThemeFallbackForLogin = () => {
    let theme = 'light';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    applyTheme(theme); 
  };
  
  initializePageTheme(); 

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        try {
            if (!localStorage.getItem(THEME_STORAGE_KEY)) { 
                applyTheme(event.matches ? 'dark' : 'light');
            }
        } catch (e) {
             applyTheme(event.matches ? 'dark' : 'light'); 
        }
    });
  }
  
  if (window.electronAPI && typeof window.electronAPI.onSystemThemeUpdate === 'function') {
      window.electronAPI.onSystemThemeUpdate((theme) => { 
          try {
            if (!localStorage.getItem(THEME_STORAGE_KEY)) { 
                console.log('[LoginTheme] Recebida atualização de tema do sistema via Electron API (sem preferência salva):', theme);
                applyTheme(theme);
            }
          } catch (e) {
              console.log('[LoginTheme] Recebida atualização de tema do sistema via Electron API (localStorage falhou):', theme);
              applyTheme(theme);
          }
      });
  }
  // --- FIM: Lógica de Detecção e Aplicação de Tema ---

  if (loginPageSubtitleElement) {
      try {
          const pageTitle = sessionStorage.getItem('loginRedirectPageTitle');
          if (pageTitle) {
              loginPageSubtitleElement.textContent = pageTitle;
          } else {
            loginPageSubtitleElement.textContent = "Acesse sua conta"; 
          }
      } catch (e) {
          console.error("[LoginScript] Erro ao acessar sessionStorage para pageTitle:", e);
          loginPageSubtitleElement.textContent = "Acesse sua conta";
      }
  }

  if (currentYearElement) {
    currentYearElement.textContent = new Date().getFullYear();
  }

  const togglePasswordButton = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  const eyeIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-icon") : null;
  const eyeSlashIcon = togglePasswordButton ? togglePasswordButton.querySelector(".eye-slash-icon") : null;

  if (togglePasswordButton && passwordInput && eyeIcon && eyeSlashIcon) {
    togglePasswordButton.addEventListener("click", () => {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);
      eyeIcon.style.display = type === "password" ? "block" : "none";
      eyeSlashIcon.style.display = type === "password" ? "none" : "block";
    });
  }

  const loginForm = document.getElementById("loginForm");
  const backToMenuBtn = document.getElementById("backToMenuBtn"); 
  const errorMessageDiv = document.getElementById("errorMessage");

  if (!loginForm) {
    console.error("Elemento loginForm não encontrado!");
    document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Erro crítico: Formulário de login não encontrado.</p>';
    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usernameInput = document.getElementById("username");
    const passwordInputRef = document.getElementById("password");

    if (!usernameInput || !passwordInputRef) {
        if(errorMessageDiv) errorMessageDiv.textContent = "Campos de usuário ou senha não encontrados.";
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }

      if (response.ok && data.success) {
        console.log("[LoginScript] Login bem-sucedido:", data);
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
        } catch(e) { console.error("[LoginScript] Erro ao limpar sessionStorage", e); }

        console.log(`[LoginScript] Login OK. Destino pretendido: ${intendedTarget}. Payload:`, navigationPayload);
        
        if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
          window.electronAPI.navigate(intendedTarget, navigationPayload);
        } else {
          console.warn("[LoginScript] API do Electron não encontrada para navegação pós-login. Redirecionando via window.location.");
          if (intendedTarget === 'admin') {
            window.location.href = '/admin.html';
          } else if (intendedTarget === 'chat') {
            window.location.href = `/chat.html?agentId=${encodeURIComponent(data.agent)}&agentName=${encodeURIComponent(data.name || data.agent)}`;
          } else {
            window.location.href = '/index.html'; 
          }
        }
      } else {
        if(errorMessageDiv) errorMessageDiv.textContent = data.message || "Falha no login. Verifique suas credenciais.";
        loginForm.classList.add("error-shake");
        setTimeout(() => { loginForm.classList.remove("error-shake"); }, 500);
      }
    } catch (error) {
      console.error("[LoginScript] Erro durante a requisição de login:", error);
      if(errorMessageDiv) errorMessageDiv.textContent = "Ocorreu um erro ao tentar conectar ao servidor.";
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }
    }
  });

  if (backToMenuBtn) {
    backToMenuBtn.addEventListener("click", () => {
      if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
        console.log("[LoginNav] Solicitando retorno ao menu via Electron API.");
        window.electronAPI.navigate('menu', { fromLoginWindow: true }); 
      } else {
        console.warn("[LoginNav] electronAPI.navigate não disponível. Fallback: Navegando para index.html (novo menu).");
        window.location.href = 'index.html'; 
      }
    });
  }

  document.querySelectorAll(".input-wrapper input").forEach((input) => {
    input.addEventListener("focus", () => {
      if (input.parentElement?.parentElement) { 
        input.parentElement.parentElement.classList.add("focused");
      }
    });
    input.addEventListener("blur", () => {
       if (input.parentElement?.parentElement) {
        input.parentElement.parentElement.classList.remove("focused");
      }
    });
  });

  // --- Lógica para exibir a versão do App ---
  if (appVersionLoginElement) {
    if (window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
        // Se estiver no Electron, usa a API do Electron
        window.electronAPI.getAppInfo().then(info => {
            if (info && info.version) {
                appVersionLoginElement.textContent = info.version;
            } else {
                appVersionLoginElement.textContent = 'N/D (API)';
            }
        }).catch(err => {
            console.error("[LoginScript] Erro ao obter versão do app via Electron API:", err);
            appVersionLoginElement.textContent = 'N/D (Erro API)';
        });
    } else {
        // Se não estiver no Electron (acesso web), tenta buscar o package.json
        console.warn("[LoginScript] electronAPI.getAppInfo não disponível. Tentando buscar package.json para obter versão do app.");
        fetch('./package.json') // Assume que package.json está na raiz do servidor web
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && data.version) {
                    appVersionLoginElement.textContent = data.version;
                } else {
                    appVersionLoginElement.textContent = 'N/D (JSON)';
                }
            })
            .catch(err => {
                console.error("[LoginScript] Erro ao buscar ou parsear package.json:", err);
                appVersionLoginElement.textContent = 'N/D (Fetch Err)';
            });
    }
  }
});
