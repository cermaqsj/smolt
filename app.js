// Configuración (DEBES PONER AQUÍ LA URL COMPLETA DEL DESPLIEGUE EXECUTABLE DE GOOGLE APPS SCRIPT)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw5QhAYcMQZMSFfo0d8UcMI5nSIHzrFqwvSF7-EXJ5DuH3c7a-9dfNKxgYuSEAjHgQG/exec";

// Estado Global
let estanquesData = [];
let html5QrcodeScanner = null;
let currentEstanque = null;

// Sistema de Audio (Micro-Interacciones)
const audioSuccess = new Audio('./SOUND/SCPH-10000_00030.wav');
const audioScanOpen = new Audio('./SOUND/SCPH-10000_00029.wav');
const audioExportPDF = new Audio('./SOUND/SCPH-10000_00026.wav');

// Elementos DOM
const viewHome = document.getElementById('view-home');
const viewScanner = document.getElementById('view-scanner');
const viewResult = document.getElementById('view-result');
const syncStatusText = document.getElementById('sync-text');
const syncStatusBanner = document.getElementById('sync-status');
const btnExportAll = document.getElementById('btn-export-all');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    initManualGrid();
    registerServiceWorker();
    initParticles();

    // Intentar forzar rotación nativa (Android)
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("portrait").catch(function () {
            // Falla silenciosamente en browsers sin soporte (ej. iOS Safari)
        });
    }
});

// Función para inicializar la grilla manual de estanques
function initManualGrid() {
    const container = document.getElementById('manual-grid-container');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 1; i <= 20; i++) {
        const estanqueId = 'S' + i.toString().padStart(2, '0');
        const btn = document.createElement('button');
        btn.className = 'btn-manual-estanque';
        btn.textContent = i; // Mostrar solo el número
        btn.onclick = () => {
            // Un pequeño parpadeo al apretar
            btn.style.transform = 'scale(0.9)';
            setTimeout(() => btn.style.transform = '', 150);

            // Simular escaneo con un leve delay temporal
            setTimeout(() => {
                processScanResult(estanqueId);
            }, 100);
        };
        container.appendChild(btn);
    }
}

// Función para obtener los datos
async function fetchData() {
    try {
        setSyncStatus('Sincronizando...', 'syncing');

        // Intenta obtener primero la data offline
        const localData = localStorage.getItem('estanquesData');
        if (localData) {
            estanquesData = JSON.parse(localData);
            setSyncStatus('Datos Locales Listos', 'success');
            btnExportAll.style.display = 'flex';
        }

        if (APPS_SCRIPT_URL.includes('xxxxxxxxxxxxxx')) {
            showToast('⚠️ Falta configurar URL de Apps Script');
            setSyncStatus('URL no configurada', 'error');
            return;
        }

        const response = await fetch(APPS_SCRIPT_URL);
        const data = await response.json();

        estanquesData = data;
        localStorage.setItem('estanquesData', JSON.stringify(data));
        setSyncStatus('Actualizado', 'success');
        btnExportAll.style.display = 'flex';

        // Ocultar Splash Screen después de carga exitosa
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('hidden');
                setTimeout(() => splash.style.display = 'none', 500); // Darle tiempo a la animación CSS
            }
        }, 500);

    } catch (error) {
        console.error("Error fetching data:", error);
        if (estanquesData.length > 0) {
            setSyncStatus('Modo Offline Activo', 'syncing');
            syncStatusBanner.style.backgroundColor = '#f59e0b'; // Naranja warning
            syncStatusBanner.style.color = '#fff';
            syncStatusBanner.style.borderColor = '#d97706';

            showToast('🌐 Sin internet. Usando últimos datos guardados.');

            // Ocultar Splash Screen si usamos datos antiguos
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.classList.add('hidden');
                setTimeout(() => splash.style.display = 'none', 500);
            }
        } else {
            setSyncStatus('¡Sin conexión!', 'error');
            document.getElementById('splash-text').textContent = 'Error: No hay datos guardados ni conexión a internet.';
            showToast('No se pudo conectar con la base de datos');

            // Permitir al usuario intentar recargar
            const splash = document.getElementById('splash-screen');
            if (splash) {
                const btnRetry = document.createElement('button');
                btnRetry.className = 'btn-primary';
                btnRetry.style.marginTop = '20px';
                btnRetry.textContent = 'Intentar de Nuevo';
                btnRetry.onclick = () => location.reload();
                if (!document.getElementById('retry-btn')) {
                    btnRetry.id = 'retry-btn';
                    splash.querySelector('.splash-content').appendChild(btnRetry);
                }
            }
        }
    }
}

function setSyncStatus(text, type) {
    syncStatusText.textContent = text;
    syncStatusBanner.className = 'sync-status ' + type;
    if (type === 'success') {
        syncStatusBanner.style.background = 'rgba(16, 185, 129, 0.1)';
        syncStatusBanner.style.color = 'var(--accent)';
    } else if (type === 'error') {
        syncStatusBanner.style.background = 'rgba(239, 68, 68, 0.1)';
        syncStatusBanner.style.color = 'var(--danger)';
    }
}

// Navegación con Historial Nativo (Previene Cierres por Botón Atrás en PWA)
function showView(viewId, updateHistory = true) {
    // Si el usuario cambia de vista estando en medio de una previsualización de PDF, la abortamos para limpiar la UI
    if (document.getElementById('pdf-content') && document.getElementById('pdf-content').classList.contains('pdf-export-mode')) {
        cancelPDFPreview();
    }

    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    if (updateHistory) {
        // Empujar al historial de navegación el ID de la vista actual
        window.history.pushState({ view: viewId }, "", `#${viewId}`);
    }
}

// Capturar evento cuando el usuario presiona el Botón "Atrás" de Android o Gestos de iOS
window.addEventListener('popstate', (event) => {
    // Si el usuario presiona "Volver atrás" luego de un resultado de escaneo,
    // el historial natural querrá abrir el "escáner" (que ya está apagado, viéndose negro)
    // Para prevenir esto y por diseño, cualquier intento de retroceso envía al inicio.

    let targetView = (event.state && event.state.view) ? event.state.view : 'home';

    // Si el destino es scanner, anular y redirigir siempre a Home
    if (targetView === 'scanner') {
        targetView = 'home';
    }

    // Ejecutar renderización visual
    showView(targetView, false);

    // Apagar Forzosamente Hardware de la Cámara
    if (html5QrcodeScanner && html5QrcodeScanner.getState() === 2) {
        html5QrcodeScanner.stop().catch(e => console.log(e));
        html5QrcodeScanner.clear();
    }
});

// Scanner Lógica
function startScanner() {
    showView('scanner');
    audioScanOpen.play().catch(e => console.log('Audio autoplay prevented'));

    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
        .catch(err => {
            console.error(err);
            showToast("Error al abrir cámara: " + err);
            stopScanner();
        });
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            showView('home');
        }).catch(err => console.error(err));
    } else {
        showView('home');
    }
}

function onScanSuccess(decodedText) {
    audioSuccess.currentTime = 0;
    audioSuccess.play().catch(e => console.log('Audio autoplay prevented'));

    if (html5QrcodeScanner) {
        // En vez de detener el hardware (que es asincrono y pisa la UI), simplemente lo pausamos 
        // y ocultamos la vista. De esta forma el resultado del escaneo no compite con la promesa de Stop.
        html5QrcodeScanner.pause(true);
        setTimeout(() => {
            html5QrcodeScanner.stop().then(() => html5QrcodeScanner.clear()).catch(e => e);
        }, 500); // Apagar hardware medio segundo DESPUES de renderizar, sin romper la UX.
    }

    processScanResult(decodedText);
}

// Función auxiliar para buscar el valor de una clave ignorando mayúsculas y espacios invisibles
function getFlexibleValue(obj, keysArray) {
    for (let key of keysArray) {
        const found = Object.keys(obj).find(k => k.toUpperCase().trim() === key.toUpperCase().trim());
        if (found !== undefined && obj[found] !== undefined && obj[found] !== '') {
            return obj[found];
        }
    }
    return '';
}

function processScanResult(qrText) {
    const query = qrText.toString().toUpperCase().trim();

    // Construir posibles variantes del nombre (ej: "S01" -> "1", "01", "ESTANQUE 1", etc.)
    const queryMatches = [query];
    const numMatch = query.match(/\d+/);
    if (numMatch) {
        const numStr = numMatch[0]; // ej: "01"
        const numInt = parseInt(numStr, 10).toString(); // ej: "1"
        queryMatches.push(
            numStr,
            numInt,
            `S${numStr}`,
            `S${numInt}`,
            `ESTANQUE ${numStr}`,
            `ESTANQUE ${numInt}`
        );
    }

    // Busca el estanque por ID_QR, ID o ESTANQUE
    const estanque = estanquesData.find(e => {
        const idQr = getFlexibleValue(e, ['ID_QR']).toString().toUpperCase().trim();
        const id = getFlexibleValue(e, ['ID']).toString().toUpperCase().trim();
        const estNombre = getFlexibleValue(e, ['ESTANQUE']).toString().toUpperCase().trim();

        return queryMatches.includes(idQr) ||
            queryMatches.includes(id) ||
            queryMatches.includes(estNombre);
    });

    if (estanque) {
        currentEstanque = estanque;
        displayEstanque(estanque, qrText);
    } else {
        showToast(`Estanque ${qrText} no encontrado en BD descargada (${estanquesData.length} registros).`);
        // Si no lo encuentra, volvemos al inicio
        showView('home');
    }
}

function displayEstanque(e, id) {
    // Asignar datos al DOM asumiendo encabezados estándar. Retocamos si no existen.
    const estanqueName = getFlexibleValue(e, ['ESTANQUE']) || `Estanque ${id}`;
    document.getElementById('r-estanque').textContent = estanqueName;

    // Mapeo directo a los campos solicitados
    const especie = getFlexibleValue(e, ['ESPECIE', 'SPECIES']) || '--';
    document.getElementById('r-especie').textContent = especie;

    const grupo = getFlexibleValue(e, ['GRUPO', 'GROUP']) || '--';
    document.getElementById('r-grupo').textContent = grupo;

    const numPeces = getFlexibleValue(e, ['STOCK_ACTUAL', 'CURRENT STOCK', 'NUMERO_PECES']) || '--';
    document.getElementById('r-numero-peces').textContent = numPeces !== '--' ? numPeces.toLocaleString('es-CL') : '--';

    const peso = getFlexibleValue(e, ['PESO_G', 'CURRENT WEIGT (GR)', 'CURRENT WEIGHT (GR)', 'PESO']) || '--';
    document.getElementById('r-peso').textContent = peso !== '--' ? peso : '--';

    const densidad = getFlexibleValue(e, ['DENSIDAD_M3', 'CULTURE DENSITY (KG/M3)', 'DENSIDAD']) || '--';
    document.getElementById('r-densidad').textContent = densidad !== '--' ? densidad : '--';

    const origen = getFlexibleValue(e, ['ORIGEN', 'ORIGIN']) || '--';
    document.getElementById('r-origen').textContent = origen;

    const calibre = getFlexibleValue(e, ['CALIBRE', 'CURRENT COEF. VAR. (%)', 'ÍNDICE DE CONDICIÓN (K)', 'ÍNDICE DE CONDICIÓN']) || '--';
    document.getElementById('r-calibre').textContent = calibre;

    const otros = getFlexibleValue(e, ['OTROS', 'OBSERVACIONES', 'OBSERVATIONS']) || '--';
    document.getElementById('r-otros').textContent = otros;

    const actualizado = getFlexibleValue(e, ['ACTUALIZADO', 'DATE', 'FECHA']) || '--';
    let fechaTxt = actualizado;
    if (actualizado && actualizado !== '--') {
        try {
            const date = new Date(actualizado);
            if (!isNaN(date)) fechaTxt = date.toLocaleDateString('es-CL');
        } catch (err) { }
    }
    document.getElementById('r-actualizado').textContent = fechaTxt;

    // Automáticamente saltar al modo documento (A4 Blanco) según nuevo flujo solicitado
    showView('result');
    setTimeout(() => {
        previewPDF();
    }, 50); // Pequeño retraso para permitir al DOM dibujar la vista base primero
}

// Utilidad Toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Previsualización Física en Pantalla
function previewPDF() {
    if (!currentEstanque) return;

    const element = document.getElementById('pdf-content');

    // Activa clases CSS de PDF que vuelven todo blanco a impresión negra real
    element.classList.add('pdf-export-mode');
    document.body.classList.add('pdf-preview-active');

    // Escala del documento para previsualizarse en pantalla del teléfono 
    // sin alterar sus dimensiones estrictas físicas originales de 700px (A4)
    if (window.innerWidth < 740) {
        const zoomLevel = (window.innerWidth - 30) / 700; // factor de reducción visual
        element.style.zoom = zoomLevel;
    }

    // Scrollear al inicio para que el usuario aprecie el ticket
    document.getElementById('view-result').scrollTop = 0;
}

// Cancelar Previsualización internamente al salir de vista (ej: Escanear Otro)
function cancelPDFPreview() {
    const element = document.getElementById('pdf-content');
    if (!element) return;

    // Revertir CSS de Impresión y visualización
    element.classList.remove('pdf-export-mode');
    document.body.classList.remove('pdf-preview-active');
    element.style.zoom = ''; // Resetear escala a normalidad
}

// Exportación PDF Individual Definitiva
function confirmDownloadPDF() {
    if (!currentEstanque) return;

    audioExportPDF.play().catch(e => console.log('Audio autoplay prevented'));
    const element = document.getElementById('pdf-content');

    // Clon estricto: Lo mandamos fuera de la pantalla limitando su ancho exacto (700px) para ignorar el tamaño del celular
    const staticClone = element.cloneNode(true);
    staticClone.style.zoom = '1'; // Evitar que PDF herede la escala miniaturizada del celular
    staticClone.style.transform = 'none';
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '700px';
    wrapper.style.backgroundColor = '#fff';
    wrapper.appendChild(staticClone);
    document.body.appendChild(wrapper);

    showToast('Procesando Documento... por favor espere.');

    const opt = {
        margin: [10, 10, 10, 10], // Márgenes seguros
        filename: `Reporte...Estanque_${currentEstanque.ID_QR || currentEstanque.ESTANQUE}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 1.5, useCORS: true, letterRendering: true, windowWidth: 700 }, // scale 1.5 y windowWidth 700 evitan cortes laterales
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, // Forzando encaje estático
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(staticClone).save().then(() => {
        showToast('PDF Descargado exitosamente');
        document.body.removeChild(wrapper);
    }).catch(err => {
        showToast('Error generando PDF: ' + err.message);
        document.body.removeChild(wrapper);
    });
}

// Exportación Total
function exportAllToPDF() {
    if (estanquesData.length === 0) {
        showToast('No hay datos sincronizados para exportar');
        return;
    }

    audioExportPDF.play().catch(e => console.log('Audio autoplay prevented'));
    showToast('Generando reporte completo... esto tomará unos segundos.');

    // Crear un wrapper completamente fuera del flujo visual pero renderable por html2canvas
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 700px;
        pointer-events: none;
        z-index: -9999;
        background: #fff;
    `;

    const baseTemplate = document.getElementById('pdf-content').cloneNode(true);
    // Limpiar atributos que podrían interferir
    baseTemplate.removeAttribute('id');
    baseTemplate.style.zoom = '1';
    baseTemplate.style.transform = 'none';

    estanquesData.forEach((estanque, idx) => {
        if (!estanque.ID_QR && !estanque.ESTANQUE) return; // Saltar vacíos

        const page = baseTemplate.cloneNode(true);
        page.classList.add('pdf-export-mode', 'full-report-page');
        page.id = `page-export-${idx}`;

        // Activar el logo vectorial corporativo
        const logo = page.querySelector('.print-cermaq-logo-svg');
        if (logo) logo.style.display = 'block';

        page.querySelector('#r-estanque') && (page.querySelector('#r-estanque').id = `re-estanque-${idx}`);
        const estanqueName = getFlexibleValue(estanque, ['ESTANQUE', 'SECTION', 'ID_QR', 'ID']) || '--';
        const elEstanque = page.querySelector(`#re-estanque-${idx}`) || page.querySelector('[id^="r-estanque"]');
        if (elEstanque) elEstanque.textContent = estanqueName;

        const setField = (selector, value) => {
            const el = page.querySelector(selector);
            if (el) el.textContent = value;
        };

        const especie = getFlexibleValue(estanque, ['ESPECIE', 'SPECIES']) || '--';
        setField('#r-especie', especie);

        const grupo = getFlexibleValue(estanque, ['GRUPO', 'GROUP']) || '--';
        setField('#r-grupo', grupo);

        const numPeces = getFlexibleValue(estanque, ['STOCK_ACTUAL', 'CURRENT STOCK', 'NUMERO_PECES']) || '--';
        setField('#r-numero-peces', numPeces !== '--' ? numPeces.toLocaleString('es-CL') : '--');

        const peso = getFlexibleValue(estanque, ['PESO_G', 'CURRENT WEIGT (GR)', 'CURRENT WEIGHT (GR)', 'PESO']) || '--';
        setField('#r-peso', peso !== '--' ? peso : '--');

        const densidad = getFlexibleValue(estanque, ['DENSIDAD_M3', 'CULTURE DENSITY (KG/M3)', 'DENSIDAD']) || '--';
        setField('#r-densidad', densidad !== '--' ? densidad : '--');

        const origen = getFlexibleValue(estanque, ['ORIGEN', 'ORIGIN']) || '--';
        setField('#r-origen', origen);

        const calibre = getFlexibleValue(estanque, ['CALIBRE', 'CURRENT COEF. VAR. (%)', 'ÍNDICE DE CONDICIÓN (K)', 'ÍNDICE DE CONDICIÓN']) || '--';
        setField('#r-calibre', calibre);

        const otros = getFlexibleValue(estanque, ['OTROS', 'OBSERVACIONES', 'OBSERVATIONS']) || '--';
        setField('#r-otros', otros);

        const actualizado = getFlexibleValue(estanque, ['ACTUALIZADO', 'DATE', 'FECHA']) || '--';
        let fechaTxt = actualizado;
        if (actualizado && actualizado !== '--') {
            try {
                const date = new Date(actualizado);
                if (!isNaN(date)) fechaTxt = date.toLocaleDateString('es-CL');
            } catch (err) { }
        }
        setField('#r-actualizado', fechaTxt);

        const footer = page.querySelector('.report-footer');
        if (footer) {
            footer.style.display = 'block';
            const dateEl = page.querySelector('#report-date');
            if (dateEl) dateEl.textContent = new Date().toLocaleString('es-CL');
        }

        // Ocultar elementos que no deben ir al PDF
        const toggleBtn = page.querySelector('#btn-toggle-details');
        if (toggleBtn) toggleBtn.style.display = 'none';
        const detailsContainer = page.querySelector('#all-details-container');
        if (detailsContainer) detailsContainer.style.display = 'none';

        wrapper.appendChild(page);
    });

    document.body.appendChild(wrapper);

    const opt = {
        margin: [8, 8, 8, 8],
        filename: `Reporte_Total_Estanques_CERMAQ.pdf`,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: {
            scale: 1.5,
            useCORS: true,
            letterRendering: true,
            windowWidth: 700,
            backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], before: '.full-report-page' }
    };

    html2pdf().set(opt).from(wrapper).save().then(() => {
        document.body.removeChild(wrapper);
        showToast('✅ Reporte Total exportado correctamente');
    }).catch(err => {
        document.body.removeChild(wrapper);
        showToast('Error generando PDF: ' + err.message);
    });
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.error('SW Error', err));
    }
}

// --- Particles System ---
function initParticles() {
    const canvas = document.getElementById('bg-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    let particles = [];
    const numParticles = 40;
    const colorStr = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? '14, 165, 233'
        : '56, 189, 248';

    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.radius = Math.random() * 2 + 0.5;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > width) this.vx = -this.vx;
            if (this.y < 0 || this.y > height) this.vy = -this.vy;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${colorStr}, 0.5)`;
            ctx.fill();
        }
    }

    for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 120) {
                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(${colorStr}, ${0.2 * (1 - distance / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}

// --- PWA Install Logic ---
let deferredPrompt;
const installAppBtn = document.getElementById('install-app-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!window.matchMedia('(display-mode: standalone)').matches && installAppBtn) {
        installAppBtn.style.display = 'flex';
    }
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installAppBtn.style.display = 'none';
            }
            deferredPrompt = null;
        }
    });
}

if (window.matchMedia('(display-mode: standalone)').matches && installAppBtn) {
    installAppBtn.style.display = 'none';
}
