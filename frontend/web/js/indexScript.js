// indexScript.js (anteriormente menuScript.js)
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('themeToggleButton');
    const themeIcon = document.getElementById('themeIcon');
    const THEME_STORAGE_KEY = 'notaryConnectTheme';

    // --- Lógica de Tema ---

    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeIcon) {
            themeIcon.src = theme === 'dark' ? './img/icons/sun.svg' : './img/icons/moon.svg';
            themeIcon.alt = theme === 'dark' ? 'Tema Claro (Sol)' : 'Tema Escuro (Lua)';
        }
        console.log(`[IndexTheme] Tema aplicado: ${theme}`);
    };

    const saveThemePreference = (theme) => {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (e) {
            console.warn("[IndexTheme] Não foi possível salvar a preferência de tema no localStorage:", e);
        }
    };

    const getSavedThemePreference = () => {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY);
        } catch (e) {
            console.warn("[IndexTheme] Não foi possível carregar a preferência de tema do localStorage:", e);
            return null;
        }
    };

    const initializeTheme = () => {
        const savedTheme = getSavedThemePreference();
        if (savedTheme) {
            applyTheme(savedTheme);
        } else {
            if (window.electronAPI && typeof window.electronAPI.getSystemTheme === 'function') {
                window.electronAPI.getSystemTheme().then(themeFromElectron => {
                    applyTheme(themeFromElectron);
                }).catch(err => {
                    console.warn("[IndexTheme] Erro ao obter tema inicial do Electron, usando fallback do S.O.:", err);
                    checkSystemThemeFallback(false); 
                });
            } else {
                checkSystemThemeFallback(false); 
            }
        }
    };
    
    const checkSystemThemeFallback = (savePreference = true) => {
        let themeToApply = 'light'; 
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            themeToApply = 'dark';
        }
        applyTheme(themeToApply);
        if (savePreference) { 
            saveThemePreference(themeToApply);
        }
    };
    
    initializeTheme(); 

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            saveThemePreference(newTheme);
        });
    }

    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
            const savedTheme = getSavedThemePreference();
            if (!savedTheme) { 
                applyTheme(event.matches ? 'dark' : 'light');
            }
        });
    }
    
    if (window.electronAPI && typeof window.electronAPI.onSystemThemeUpdate === 'function') {
        window.electronAPI.onSystemThemeUpdate((themeFromElectron) => {
            const savedTheme = getSavedThemePreference();
            if (!savedTheme) { 
                console.log('[IndexTheme] Recebida atualização de tema do sistema via Electron API (sem preferência salva):', themeFromElectron);
                applyTheme(themeFromElectron);
            }
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
                    showSlide((currentIndex + 1) % totalSlides); 
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
            currentIndex = (index + totalSlides) % totalSlides; 
            if (carouselInner) {
                const offset = -currentIndex * 100; 
                carouselInner.style.transform = `translateX(${offset}%)`;
            }
            updateIndicators();
        }

        if (totalSlides > 0) {
            if (indicatorsContainer) {
                indicatorsContainer.innerHTML = ''; 
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
            console.log(`[IndexNav] Solicitando abertura de login para ${targetPage} (${pageTitleForLogin}) via Electron API.`);
            try {
                sessionStorage.setItem('loginRedirectPageTitle', pageTitleForLogin);
            } catch(e) {
                console.warn("[IndexNav] Erro ao salvar pageTitle no sessionStorage:", e);
            }
            window.electronAPI.openLoginForTarget(targetPage);
        } else {
            console.warn(`[IndexNav] electronAPI.openLoginForTarget não disponível. Fallback: Navegando para login.html (destino: ${targetPage}, título: ${pageTitleForLogin}).`);
            try {
                sessionStorage.setItem('loginRedirectTarget', targetPage);
                sessionStorage.setItem('loginRedirectPageTitle', pageTitleForLogin);
                window.location.href = 'login.html'; 
            } catch (e) {
                console.error("[IndexNav] Erro ao tentar usar sessionStorage ou window.location.href:", e);
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

    const closeAppBtnMenu = document.getElementById('closeAppBtnMenu');
    if (closeAppBtnMenu) {
        if (window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
            closeAppBtnMenu.addEventListener('click', () => {
                window.electronAPI.closeApp(); 
            });
        } else {
            closeAppBtnMenu.style.display = 'none'; 
            console.warn("[IndexNav] Funcionalidade de fechar app não disponível (não está no Electron ou botão foi removido).");
        }
    }

    // --- Aba "Sobre" ---
    const appVersionAbout = document.getElementById('appVersionAbout');
    const currentYearAbout = document.getElementById('currentYearAbout');
    const openLogsButton = document.getElementById('openLogsButton');
    const checkUpdatesButton = document.getElementById('checkUpdatesButton'); 

    if (currentYearAbout) {
        currentYearAbout.textContent = new Date().getFullYear();
    }

    // Lógica para exibir a versão do App na aba "Sobre"
    if (appVersionAbout) {
        if (window.electronAPI && typeof window.electronAPI.getAppInfo === 'function') {
            // Se estiver no Electron, usa a API do Electron
            window.electronAPI.getAppInfo().then(info => {
                if (info && info.version) {
                    appVersionAbout.textContent = `Versão ${info.version}`;
                } else {
                    appVersionAbout.textContent = 'Versão N/D (API)';
                }
            }).catch(err => {
                console.error("[IndexAbout] Erro ao obter versão do app via Electron API:", err);
                appVersionAbout.textContent = 'Versão N/D (Erro API)';
            });
        } else {
            // Se não estiver no Electron (acesso web), tenta buscar o package.json
            console.warn("[IndexAbout] electronAPI.getAppInfo não disponível. Tentando buscar package.json para obter versão do app.");
            fetch('./package.json') // Assume que package.json está na raiz do servidor web (frontend/web)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data && data.version) {
                        appVersionAbout.textContent = `Versão ${data.version}`;
                    } else {
                        appVersionAbout.textContent = 'Versão N/D (JSON)';
                    }
                })
                .catch(err => {
                    console.error("[IndexAbout] Erro ao buscar ou parsear package.json:", err);
                    appVersionAbout.textContent = 'Versão N/D (Fetch Err)';
                });
        }
    }
    
    if (openLogsButton) {
        if (window.electronAPI && typeof window.electronAPI.navigate === 'function') {
            openLogsButton.addEventListener('click', () => {
                window.electronAPI.navigate("logsViewer", {}); 
            });
        } else {
            openLogsButton.style.display = 'none';
            console.warn("[IndexAbout] Funcionalidade de ver logs não disponível (não está no Electron).");
        }
    }

    if (checkUpdatesButton) { 
        if (window.electronAPI && typeof window.electronAPI.checkForUpdates === 'function') {
            checkUpdatesButton.addEventListener('click', () => {
                console.log("Verificando atualizações...");
                window.electronAPI.checkForUpdates(); 
            });
        } else {
            checkUpdatesButton.style.display = 'none';
            console.warn("[IndexAbout] Funcionalidade de verificar atualizações não disponível (não está no Electron).");
        }
    }
});
