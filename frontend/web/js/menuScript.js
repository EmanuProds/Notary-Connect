// menuScript.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Lógica de Tema Vinculada ao Sistema Operacional ---

    const applyTheme = (theme) => { // theme deve ser 'dark' ou 'light'
        document.documentElement.setAttribute('data-theme', theme);
        console.log(`[MenuTheme] Tema do sistema aplicado via JS: ${theme}`);
    };

    const initializeSystemTheme = () => {
        // Tenta obter o tema inicial diretamente do Electron API, se disponível
        if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
            window.electronAPI.getSystemTheme().then(theme => {
                applyTheme(theme); // 'theme' já será 'dark' ou 'light'
            }).catch(err => {
                console.warn("[MenuTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
                checkSystemThemeFallback();
            });
        } else {
            // Fallback para window.matchMedia se a API do Electron não estiver disponível ou a função não existir
            checkSystemThemeFallback();
        }
    };
    
    const checkSystemThemeFallback = () => {
        if (window.matchMedia) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark ? 'dark' : 'light');
        } else {
            applyTheme('light'); // Padrão para claro se matchMedia não for suportado
            console.warn('[MenuTheme] window.matchMedia não suportado, usando tema claro como padrão.');
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
            console.log('[MenuTheme] Recebida atualização de tema do sistema via Electron API:', theme);
            applyTheme(theme);
        });
    }

    // --- Lógica de Abas ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const targetTab = button.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `tab-${targetTab}`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // --- Lógica do Carrossel ---
    const carousel = document.querySelector('.carousel');
    let carouselInterval; 

    if (carousel) {
        const carouselInner = carousel.querySelector('.carousel-inner'); 
        const slides = carousel.querySelectorAll('.carousel-slide');
        const prevButton = carousel.querySelector('.carousel-prev');
        const nextButton = carousel.querySelector('.carousel-next');
        const indicatorsContainer = carousel.querySelector('.carousel-indicators');
        let currentIndex = 0;
        const totalSlides = slides.length;

        function stopCarouselAutoplay() {
            clearInterval(carouselInterval);
        }

        function startCarouselAutoplay() {
            stopCarouselAutoplay(); 
            if (totalSlides > 1) { 
                carouselInterval = setInterval(() => {
                    showSlide((currentIndex + 1) % totalSlides); // Garante loop
                }, 8000); 
            }
        }

        function updateIndicators() {
            if (indicatorsContainer) {
                const indicators = indicatorsContainer.querySelectorAll('span');
                indicators.forEach((indicator, idx) => {
                    indicator.classList.toggle('active', idx === currentIndex);
                });
            }
        }

        function showSlide(index) {
            if (totalSlides === 0) return; 

            currentIndex = (index + totalSlides) % totalSlides; // Garante que o índice seja válido e faça loop

            if (carouselInner) {
                const offset = -currentIndex * 100; 
                carouselInner.style.transform = `translateX(${offset}%)`;
            }
            
            updateIndicators();
        }


        if (totalSlides > 0) {
            if (indicatorsContainer) {
                indicatorsContainer.innerHTML = ''; // Limpa indicadores existentes para recriar
                for (let i = 0; i < totalSlides; i++) {
                    const indicator = document.createElement('span');
                    indicator.addEventListener('click', () => {
                        showSlide(i);
                        startCarouselAutoplay(); 
                    });
                    indicatorsContainer.appendChild(indicator);
                }
            }

            if (prevButton) {
                prevButton.addEventListener('click', () => {
                    showSlide(currentIndex - 1);
                    startCarouselAutoplay(); 
                });
            }
            if (nextButton) {
                nextButton.addEventListener('click', () => {
                    showSlide(currentIndex + 1);
                    startCarouselAutoplay(); 
                });
            }
            
            showSlide(0); 
            startCarouselAutoplay(); 
        }
    }


    // --- Lógica de Navegação ---
    const goToChatButton = document.getElementById('goToChatButton');
    const goToAdminButton = document.getElementById('goToAdminButton');

    function handleSectorSelection(targetPage, pageTitleForLogin) {
        if (window.electronAPI && typeof window.electronAPI.openLoginForTarget === 'function') {
            console.log(`[MenuNav] Solicitando abertura de login para ${targetPage} (${pageTitleForLogin}) via Electron API.`);
            try {
                // Armazena o título da página de destino para ser usado pela tela de login
                sessionStorage.setItem('loginRedirectPageTitle', pageTitleForLogin);
            } catch(e) {
                console.warn("[MenuNav] Erro ao salvar pageTitle no sessionStorage:", e);
            }
            window.electronAPI.openLoginForTarget(targetPage);
        } else {
            console.error(`[MenuNav] electronAPI.openLoginForTarget não disponível. Fallback: Navegando para index.html (destino: ${targetPage}, título: ${pageTitleForLogin}).`);
            try {
                sessionStorage.setItem('loginRedirectTarget', targetPage);
                sessionStorage.setItem('loginRedirectPageTitle', pageTitleForLogin);
                window.location.href = 'index.html'; 
            } catch (e) {
                console.error("[MenuNav] Erro ao tentar usar sessionStorage ou window.location.href:", e);
            }
        }
    }

    if (goToChatButton) {
        goToChatButton.addEventListener('click', () => {
            handleSectorSelection('chat', 'Sistema de Atendimento');
        });
    }

    if (goToAdminButton) {
        goToAdminButton.addEventListener('click', () => {
            handleSectorSelection('admin', 'Administração do Sistema');
        });
    }

    // --- Botão de Fechar App (no menu) ---
    const closeAppBtnMenu = document.getElementById('closeAppBtnMenu');
    if (closeAppBtnMenu && window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
        closeAppBtnMenu.addEventListener('click', () => {
            window.electronAPI.closeApp(); 
        });
    }

    // --- Aba "Sobre" ---
    const appVersionAbout = document.getElementById('appVersionAbout');
    const currentYearAbout = document.getElementById('currentYearAbout');
    const openLogsButton = document.getElementById('openLogsButton');
    const checkUpdatesButton = document.getElementById('checkUpdatesButton'); // Mantido, mas a funcionalidade depende do main process

    if (currentYearAbout) {
        currentYearAbout.textContent = new Date().getFullYear();
    }

    if (window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
        window.electronAPI.getAppInfo().then(info => {
            if (appVersionAbout && info && info.version) {
                appVersionAbout.textContent = `Versão ${info.version}`;
            }
        }).catch(err => {
            console.error("Erro ao obter informações do app para 'Sobre':", err);
            if (appVersionAbout) appVersionAbout.textContent = 'Versão N/D';
        });
    } else if (appVersionAbout) {
        appVersionAbout.textContent = 'Versão N/D'; // Fallback se a API não estiver disponível
    }
    
    if (openLogsButton && window.electronAPI && typeof window.electronAPI.navigate === 'function') {
        openLogsButton.addEventListener('click', () => {
            window.electronAPI.navigate("logsViewer", {}); // Navega para a tela de logs
        });
    }

    if (checkUpdatesButton) { // Lógica para o botão de verificar atualizações
        if (window.electronAPI && typeof window.electronAPI.checkForUpdates === 'function') {
            checkUpdatesButton.addEventListener('click', () => {
                console.log("Verificando atualizações...");
                window.electronAPI.checkForUpdates(); 
            });
        } else {
            checkUpdatesButton.addEventListener('click', () => {
                console.warn("Funcionalidade de verificação de atualizações não disponível via electronAPI.");
                // Poderia mostrar uma mensagem para o usuário aqui, se desejado
            });
        }
    }
});
