// frontend/web/js/indexScript.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const closeAppBtn = document.getElementById('closeAppBtn'); // Botão Fechar
    // const openDevToolsBtn = document.getElementById('openDevToolsBtn'); // Botão DevTools opcional

    if (!loginForm) {
        console.error("Elemento loginForm não encontrado!");
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Erro crítico: Formulário de login não encontrado. Verifique o HTML.</p>';
        }
        return;
    }

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const errorMessageDiv = document.getElementById('errorMessage');

        if (!usernameInput || !passwordInput || !errorMessageDiv) {
            console.error("Elementos do formulário (username, password, errorMessage) não encontrados!");
            if(errorMessageDiv) errorMessageDiv.textContent = 'Erro interno no formulário. Contacte o suporte.';
            return;
        }

        const username = usernameInput.value;
        const password = passwordInput.value;
        errorMessageDiv.textContent = '';

        const API_URL = 'http://localhost:3000/api/auth/login';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Login bem-sucedido:', data);
                if (window.electronAPI && typeof window.electronAPI.navigate === 'function') {
                    if (data.admin) {
                        window.electronAPI.navigate('admin', { adminInfo: { name: data.name || username } });
                    } else {
                        window.electronAPI.navigate('chat', { agentInfo: { agent: data.attendant, name: data.name || username } });
                    }
                } else {
                    console.error('electronAPI.navigate não está disponível. A navegação falhará.');
                    errorMessageDiv.textContent = 'Erro de configuração: não é possível navegar.';
                }
            } else {
                errorMessageDiv.textContent = data.message || 'Falha no login. Verifique suas credenciais e tente novamente.';
            }
        } catch (error) {
            console.error('Erro durante a requisição de login:', error);
            errorMessageDiv.textContent = 'Ocorreu um erro ao tentar conectar ao servidor. Tente novamente mais tarde.';
        }
    });

    // Event listener para o botão Fechar
    if (closeAppBtn) {
        closeAppBtn.addEventListener('click', () => {
            if (window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
                window.electronAPI.closeApp();
            } else {
                console.error('electronAPI.closeApp não está disponível.');
                // Fallback caso a API do Electron não esteja disponível (improvável neste contexto)
                alert("Não foi possível fechar a aplicação via API do Electron.");
            }
        });
    } else {
        console.warn("Botão 'closeAppBtn' não encontrado no DOM.");
    }

    // Event listener para o botão DevTools (opcional)
    /*
    if (openDevToolsBtn) {
        openDevToolsBtn.addEventListener('click', () => {
            if (window.electronAPI && typeof window.electronAPI.openDevTools === 'function') {
                window.electronAPI.openDevTools();
            } else {
                console.error('electronAPI.openDevTools não está disponível.');
            }
        });
    }
    */
});
