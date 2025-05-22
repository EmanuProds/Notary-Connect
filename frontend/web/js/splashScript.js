// splashScript.js
document.addEventListener('DOMContentLoaded', () => {
    // --- INÍCIO: Lógica de Detecção e Aplicação de Tema (adaptada do indexScript.txt) ---
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        console.log(`[SplashTheme] Tema aplicado: ${theme}`);
    };

    const checkSystemTheme = () => {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme('dark');
        } else {
            applyTheme('light'); // Default to light theme
        }
    };

    // Aplicar tema na carga inicial do splash screen
    checkSystemTheme();

    // Ouvir mudanças na preferência do sistema em tempo real para o splash
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            applyTheme(event.matches ? 'dark' : 'light');
        });
    }
    // --- FIM: Lógica de Detecção e Aplicação de Tema ---

    const progressBar = document.getElementById('progress-bar');
    const appVersionElement = document.getElementById('app-version');
    const projectNameElement = document.getElementById('project-name');
    const loadingStatusElement = document.getElementById('loading-status');
    const currentYearElement = document.getElementById('current-year');

    // Define o ano atual
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }

    // Recebe informações da aplicação (versão, nome) do processo principal
    if (window.splashAPI && typeof window.splashAPI.receiveAppInfo === 'function') {
        window.splashAPI.receiveAppInfo(({ version, name }) => {
            console.log('Splash: Informações recebidas:', { version, name });
            if (appVersionElement) {
                appVersionElement.textContent = `Versão ${version || 'N/A'}`;
            }
            if (projectNameElement) {
                const formattedName = name
                    ? name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                    : 'Notary Connect'; // Fallback
                projectNameElement.textContent = formattedName;
            }
        });
    } else {
        console.warn('Splash: window.splashAPI.receiveAppInfo não está disponível. Verifique o preloadSplash.js e o contexto da janela.');
        if (appVersionElement) appVersionElement.textContent = 'Versão N/D';
        if (projectNameElement) projectNameElement.textContent = 'Notary Connect';
    }

    // --- Lógica de Animação da Barra de Progresso com Tempo Controlado ---
    const progressBarAnimationTime = 3000; 
    let progress = 0;
    const numberOfSteps = 30; 
    const incrementPerStep = 100 / numberOfSteps;
    const timePerStep = progressBarAnimationTime / numberOfSteps;
    let currentStep = 0;

    const statusMessages = [
        "Inicializando módulos...",
        "Conectando aos serviços...",
        "Carregando interface...",
        "Verificando configurações...",
        "Quase pronto...",
        "Finalizando preparativos..."
    ];
    const statusChangeInterval = Math.floor(numberOfSteps / statusMessages.length);

    function updateProgress() {
        if (currentStep < numberOfSteps) {
            progress += incrementPerStep;
            if (progress > 100) progress = 100;

            if (progressBar) {
                progressBar.style.width = progress + '%';
            }

            const messageIndex = Math.floor(currentStep / statusChangeInterval);
            if (loadingStatusElement && statusMessages[messageIndex] && loadingStatusElement.textContent !== statusMessages[messageIndex]) {
                if (currentStep < numberOfSteps - statusChangeInterval) { 
                    loadingStatusElement.textContent = statusMessages[messageIndex];
                }
            }
            
            currentStep++;
            setTimeout(updateProgress, timePerStep);

        } else { 
            if (progressBar) {
                 progressBar.style.width = '100%'; 
            }
            if (loadingStatusElement) {
                loadingStatusElement.textContent = 'Pronto!'; 
            }
        }
    }

    setTimeout(updateProgress, 150); 
});
