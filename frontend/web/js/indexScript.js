document.addEventListener("DOMContentLoaded", () => {
  // Set current year in footer
  document.getElementById("currentYear").textContent = new Date().getFullYear()

  // Toggle password visibility
  const togglePassword = document.getElementById("togglePassword")
  const passwordInput = document.getElementById("password")

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password"
      passwordInput.setAttribute("type", type)

      // Update icon based on password visibility
      const eyeIcon = togglePassword.querySelector(".eye-icon")
      if (type === "password") {
        eyeIcon.innerHTML = `
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                `
      } else {
        eyeIcon.innerHTML = `
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                `
      }
    })
  }

  const loginForm = document.getElementById("loginForm")
  const closeAppBtn = document.getElementById("closeAppBtn") // Botão Fechar
  // const openDevToolsBtn = document.getElementById('openDevToolsBtn'); // Botão DevTools opcional
  const errorMessageDiv = document.getElementById("errorMessage")

  if (!loginForm) {
    console.error("Elemento loginForm não encontrado!")
    const body = document.querySelector("body")
    if (body) {
      body.innerHTML =
        '<p style="color: red; text-align: center; margin-top: 50px;">Erro crítico: Formulário de login não encontrado. Verifique o HTML.</p>'
    }
    return
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault()

    const username = document.getElementById("username").value
    const password = document.getElementById("password").value

    if (!username || !password) {
      errorMessageDiv.textContent = "Por favor, preencha todos os campos."
      return
    }

    errorMessageDiv.textContent = ""

    try {
      // Show loading state
      const submitBtn = loginForm.querySelector('button[type="submit"]')
      const originalBtnText = submitBtn.textContent
      submitBtn.disabled = true
      submitBtn.innerHTML = '<span class="loading-spinner"></span> Entrando...'

      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      // Reset button state
      submitBtn.disabled = false
      submitBtn.textContent = originalBtnText

      if (response.ok && data.success) {
        console.log("Login bem-sucedido:", data)

        // Add success animation
        loginForm.classList.add("success")

        if (window.electronAPI && typeof window.electronAPI.navigate === "function") {
          if (data.admin) {
            window.electronAPI.navigate("admin", { adminInfo: { name: data.name || username } })
          } else {
            window.electronAPI.navigate("chat", { agentInfo: { agent: data.attendant, name: data.name || username } })
          }
        } else {
          errorMessageDiv.textContent = "Erro de configuração: não é possível navegar."
        }
      } else {
        errorMessageDiv.textContent = data.message || "Falha no login. Verifique suas credenciais."

        // Add shake animation for error
        loginForm.classList.add("error-shake")
        setTimeout(() => {
          loginForm.classList.remove("error-shake")
        }, 500)
      }
    } catch (error) {
      console.error("Erro durante a requisição de login:", error)
      errorMessageDiv.textContent = "Ocorreu um erro ao tentar conectar ao servidor."
    }
  })

  // Handle close button
  if (closeAppBtn && window.electronAPI && typeof window.electronAPI.closeApp === "function") {
    closeAppBtn.addEventListener("click", () => {
      window.electronAPI.closeApp()
    })
  }

  // Add some animations and styles
  document.querySelectorAll(".input-wrapper input").forEach((input) => {
    input.addEventListener("focus", () => {
      input.parentElement.classList.add("focused")
    })

    input.addEventListener("blur", () => {
      input.parentElement.classList.remove("focused")
    })
  })
})
