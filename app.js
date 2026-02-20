// Configuración (DEBES PONER AQUÍ LA URL COMPLETA DEL DESPLIEGUE EXECUTABLE DE GOOGLE APPS SCRIPT)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw5QhAYcMQZMSFfo0d8UcMI5nSIHzrFqwvSF7-EXJ5DuH3c7a-9dfNKxgYuSEAjHgQG/exec";

// Estado Global
let estanquesData = [];
let html5QrcodeScanner = null;
let currentEstanque = null;

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
    registerServiceWorker();
});

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
        setSyncStatus('Sincronizado', 'success');
        btnExportAll.style.display = 'flex';

    } catch (error) {
        console.error("Error fetching data:", error);
        if (estanquesData.length > 0) {
            setSyncStatus('Sin conexión (Usando Caché)', 'syncing');
            syncStatusBanner.style.color = '#f59e0b';
        } else {
            setSyncStatus('Error de conexión', 'error');
            showToast('No se pudo conectar con la base de datos');
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

// Navegación
function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
}

// Scanner Lógica
function startScanner() {
    showView('scanner');

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
    // Al escanear S01, buscamos en los datos
    stopScanner(); // Detenemos la cámara primero para ahorrar recursos
    processScanResult(decodedText);
}

function processScanResult(qrText) {
    // Busca el estanque por ID_QR (Ej: "S01"). Normalizamos mayúsculas.
    const estanque = estanquesData.find(e =>
        (e.ID_QR && e.ID_QR.toString().toUpperCase() === qrText.toUpperCase()) ||
        (e.ID && e.ID.toString().toUpperCase() === qrText.toUpperCase()) // Fallback
    );

    if (estanque) {
        currentEstanque = estanque;
        displayEstanque(estanque, qrText);
    } else {
        showToast(`Estanque ${qrText} no encontrado en la base de datos.`);
        showView('home');
    }
}

function displayEstanque(e, id) {
    // Asignar datos al DOM asumiendo encabezados estándar. Retocamos si no existen.
    document.getElementById('r-idqr').textContent = e.ID_QR || id;
    document.getElementById('r-estanque').textContent = e.ESTANQUE || `Estanque (ID: ${id})`;
    document.getElementById('r-especie').textContent = e.ESPECIE || '--';
    document.getElementById('r-grupo').textContent = e.GRUPO || '--';

    // Mapeo flexible según cabeceras
    const numPeces = e.STOCK_ACTUAL || e.NUMERO_PECES || '--';
    const peso = e.PESO_G || e.PESO || '--';
    const biomasa = e.BIOMASA_KG || '--';
    const densidad = e.DENSIDAD_M3 || e.DENSIDAD || '--';

    document.getElementById('r-numero-peces').textContent = numPeces !== '--' ? numPeces.toLocaleString('es-CL') : '--';
    document.getElementById('r-peso').textContent = peso !== '--' ? peso + ' g' : '--';
    document.getElementById('r-biomasa').textContent = biomasa !== '--' ? biomasa + ' kg' : '--';
    document.getElementById('r-densidad').textContent = densidad !== '--' ? densidad + ' kg/m³' : '--';

    document.getElementById('r-origen').textContent = e.ORIGEN || '--';
    document.getElementById('r-calibre').textContent = e.CALIBRE || '--';
    document.getElementById('r-observaciones').textContent = e.OBSERVACIONES || e.OTROS || '--';

    showView('result');
}

// Utilidad Toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Exportación PDF Individual
function exportIndividualPDF() {
    if (!currentEstanque) return;

    const element = document.getElementById('pdf-content');
    const footer = element.querySelector('.report-footer');

    // Preparar para impresión
    element.classList.add('pdf-export-mode');
    footer.style.display = 'block';
    document.getElementById('report-date').textContent = new Date().toLocaleString('es-CL');

    const opt = {
        margin: 10,
        filename: `Reporte_Estanque_${currentEstanque.ID_QR}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        // Restaurar estado
        element.classList.remove('pdf-export-mode');
        footer.style.display = 'none';
        showToast('PDF Exportado Correctamente');
    });
}

// Exportación Total
function exportAllToPDF() {
    if (estanquesData.length === 0) {
        showToast('No hay datos sincronizados para exportar');
        return;
    }

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

        page.querySelector('#r-idqr').textContent = estanque.ID_QR || '--';
        page.querySelector('#r-estanque').textContent = estanque.ESTANQUE || '--';
        page.querySelector('#r-especie').textContent = estanque.ESPECIE || '--';
        page.querySelector('#r-grupo').textContent = estanque.GRUPO || '--';

        const numPeces = estanque.STOCK_ACTUAL || estanque.NUMERO_PECES || '--';
        const peso = estanque.PESO_G || estanque.PESO || '--';
        const biomasa = estanque.BIOMASA_KG || '--';
        const densidad = estanque.DENSIDAD_M3 || estanque.DENSIDAD || '--';

        page.querySelector('#r-numero-peces').textContent = numPeces !== '--' ? numPeces.toLocaleString('es-CL') : '--';
        page.querySelector('#r-peso').textContent = peso !== '--' ? peso + ' g' : '--';
        page.querySelector('#r-biomasa').textContent = biomasa !== '--' ? biomasa + ' kg' : '--';
        page.querySelector('#r-densidad').textContent = densidad !== '--' ? densidad + ' kg/m³' : '--';

        page.querySelector('#r-origen').textContent = estanque.ORIGEN || '--';
        page.querySelector('#r-calibre').textContent = estanque.CALIBRE || '--';
        page.querySelector('#r-observaciones').textContent = estanque.OBSERVACIONES || estanque.OTROS || '--';

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
