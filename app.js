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
    document.getElementById('r-peso').textContent = peso !== '--' ? peso + ' g' : '--';

    const densidad = getFlexibleValue(e, ['DENSIDAD_M3', 'CULTURE DENSITY (KG/M3)', 'DENSIDAD']) || '--';
    document.getElementById('r-densidad').textContent = densidad !== '--' ? densidad + ' kg/m³' : '--';

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

    // Cerrar siempre el desplegable de "Todos los datos" al buscar uno nuevo
    const detailsContainer = document.getElementById('all-details-container');
    const iconToggle = document.getElementById('icon-toggle-details');

    // Mostramos como grid siempre, pero lo ocultamos por default
    detailsContainer.style.display = 'none';
    detailsContainer.innerHTML = '';
    iconToggle.style.transform = 'rotate(0deg)';

    // Construir la tabla dinámica de todas las claves que manda el Sheets
    const fragment = document.createDocumentFragment();

    // Ignorar las claves que ya están permanentemente visibles arriba para no duplicar
    const rawIgnoreKeys = ['ESTANQUE', 'ID_QR', 'SECTION', 'ID', 'ESPECIE', 'SPECIES', 'GRUPO', 'GROUP', 'STOCK_ACTUAL', 'CURRENT STOCK', 'NUMERO_PECES', 'PESO_G', 'CURRENT WEIGT (GR)', 'CURRENT WEIGHT (GR)', 'PESO', 'DENSIDAD_M3', 'CULTURE DENSITY (KG/M3)', 'DENSIDAD', 'ORIGEN', 'ORIGIN', 'CALIBRE', 'CURRENT COEF. VAR. (%)', 'ÍNDICE DE CONDICIÓN (K)', 'ÍNDICE DE CONDICIÓN', 'OTROS', 'OBSERVACIONES', 'OBSERVATIONS', 'ACTUALIZADO', 'DATE', 'FECHA'];
    const ignoreKeys = rawIgnoreKeys.map(k => k.toUpperCase().trim());

    for (const [key, value] of Object.entries(e)) {
        const cleanKey = key.toUpperCase().trim();

        if (value !== "" && !ignoreKeys.includes(cleanKey)) {
            const dataGroup = document.createElement('div');
            dataGroup.className = 'data-group';

            const label = document.createElement('label');
            label.textContent = cleanKey.replace(/_/g, ' ');

            const p = document.createElement('p');

            // Formatear fechas si detecta la clave
            if (cleanKey === 'ACTUALIZADO') {
                try {
                    const date = new Date(value);
                    if (!isNaN(date)) p.textContent = date.toLocaleDateString('es-CL');
                    else p.textContent = value;
                } catch (err) { p.textContent = value; }
            } else {
                p.textContent = value;
            }

            p.style.color = "white"; // Asegurar que todo se vea blanco

            dataGroup.appendChild(label);
            dataGroup.appendChild(p);
            fragment.appendChild(dataGroup);
        }
    }
    detailsContainer.appendChild(fragment);

    showView('result');
}

// Toggle para expandir todos los detalles
function toggleAllDetails() {
    const container = document.getElementById('all-details-container');
    const icon = document.getElementById('icon-toggle-details');

    if (container.style.display === 'none') {
        container.style.display = 'grid';
        icon.style.transform = 'rotate(180deg)';
        icon.style.transition = 'transform 0.3s';
    } else {
        container.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

// Utilidad Toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Variables globales temporales para UI de Previsualización PDF
let detailsWasHidden = true;

// Previsualización Física en Pantalla
function previewPDF() {
    if (!currentEstanque) return;

    const element = document.getElementById('pdf-content');
    const footer = element.querySelector('.report-footer');
    const detailsContainer = document.getElementById('all-details-container');

    detailsWasHidden = detailsContainer.style.display === 'none';
    if (detailsWasHidden) detailsContainer.style.display = 'grid';

    // Activa clases CSS de PDF que vuelven todo blanco a impresión negra real
    element.classList.add('pdf-export-mode');
    footer.style.display = 'block';
    document.getElementById('report-date').textContent = new Date().toLocaleString('es-CL');

    // Transicionar Botonera
    document.getElementById('normal-action-buttons').style.display = 'none';
    document.getElementById('preview-action-buttons').style.display = 'flex';

    // Scrollear al inicio para que el usuario aprecie el ticket
    document.getElementById('view-result').scrollTop = 0;
}

// Cancelar Previsualización y Regresar a la Ficha Interactiva
function cancelPDFPreview() {
    const element = document.getElementById('pdf-content');
    const footer = element.querySelector('.report-footer');
    const detailsContainer = document.getElementById('all-details-container');

    // Revertir CSS de Impresión
    element.classList.remove('pdf-export-mode');
    footer.style.display = 'none';
    if (detailsWasHidden) detailsContainer.style.display = 'none';

    // Restaurar Botonera
    document.getElementById('normal-action-buttons').style.display = 'flex';
    document.getElementById('preview-action-buttons').style.display = 'none';
}

// Exportación PDF Individual Definitiva
function confirmDownloadPDF() {
    if (!currentEstanque) return;

    audioExportPDF.play().catch(e => console.log('Audio autoplay prevented'));
    const element = document.getElementById('pdf-content');

    showToast('Procesando Documento... por favor espere.');

    const opt = {
        margin: 10,
        filename: `Reporte...Estanque_${currentEstanque.ID_QR || currentEstanque.ESTANQUE}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        showToast('PDF Descargado exitosamente');
        cancelPDFPreview(); // Restaurar el layout al terminar
    }).catch(err => {
        showToast('Error generando PDF: ' + err.message);
        cancelPDFPreview();
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
    const container = document.getElementById('full-pdf-container');
    container.innerHTML = ''; // Limpiar

    const baseTemplate = document.getElementById('pdf-content').cloneNode(true);
    baseTemplate.classList.add('pdf-export-mode');

    // Mapear cabeceras a IDs de elementos
    estanquesData.forEach((estanque, idx) => {
        if (!estanque.ID_QR && !estanque.ESTANQUE) return; // Salto vacíos

        const page = baseTemplate.cloneNode(true);
        page.classList.add('full-report-page');
        page.id = `page-${idx}`;

        // Activar el logo vectorial corporativo
        const logo = page.querySelector('.print-cermaq-logo-svg');
        if (logo) logo.style.display = 'block';

        const estanqueName = getFlexibleValue(estanque, ['ESTANQUE', 'SECTION', 'ID_QR', 'ID']) || '--';
        page.querySelector('#r-estanque').textContent = estanqueName;

        const especie = getFlexibleValue(estanque, ['ESPECIE', 'SPECIES']) || '--';
        page.querySelector('#r-especie').textContent = especie;

        const grupo = getFlexibleValue(estanque, ['GRUPO', 'GROUP']) || '--';
        page.querySelector('#r-grupo').textContent = grupo;

        const numPeces = getFlexibleValue(estanque, ['STOCK_ACTUAL', 'CURRENT STOCK', 'NUMERO_PECES']) || '--';
        page.querySelector('#r-numero-peces').textContent = numPeces !== '--' ? numPeces.toLocaleString('es-CL') : '--';

        const peso = getFlexibleValue(estanque, ['PESO_G', 'CURRENT WEIGT (GR)', 'CURRENT WEIGHT (GR)', 'PESO']) || '--';
        page.querySelector('#r-peso').textContent = peso !== '--' ? peso + ' g' : '--';

        const densidad = getFlexibleValue(estanque, ['DENSIDAD_M3', 'CULTURE DENSITY (KG/M3)', 'DENSIDAD']) || '--';
        page.querySelector('#r-densidad').textContent = densidad !== '--' ? densidad + ' kg/m³' : '--';

        const origen = getFlexibleValue(estanque, ['ORIGEN', 'ORIGIN']) || '--';
        page.querySelector('#r-origen').textContent = origen;

        const calibre = getFlexibleValue(estanque, ['CALIBRE', 'CURRENT COEF. VAR. (%)', 'ÍNDICE DE CONDICIÓN (K)', 'ÍNDICE DE CONDICIÓN']) || '--';
        page.querySelector('#r-calibre').textContent = calibre;

        const otros = getFlexibleValue(estanque, ['OTROS', 'OBSERVACIONES', 'OBSERVATIONS']) || '--';
        page.querySelector('#r-otros').textContent = otros;

        const actualizado = getFlexibleValue(estanque, ['ACTUALIZADO', 'DATE', 'FECHA']) || '--';
        let fechaTxt = actualizado;
        if (actualizado && actualizado !== '--') {
            try {
                const date = new Date(actualizado);
                if (!isNaN(date)) fechaTxt = date.toLocaleDateString('es-CL');
            } catch (err) { }
        }
        page.querySelector('#r-actualizado').textContent = fechaTxt;

        page.querySelector('.report-footer').style.display = 'block';
        page.querySelector('#report-date').textContent = new Date().toLocaleString('es-CL');

        container.appendChild(page);
    });

    container.style.display = 'block';

    const opt = {
        margin: 10,
        filename: `Reporte_Total_Estanques.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save().then(() => {
        container.style.display = 'none';
        container.innerHTML = '';
        showToast('Reporte Total Exportado');
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
