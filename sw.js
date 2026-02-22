const CACHE_NAME = 'estanques-scanner-v4';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './Cermaq_logo2.png',
    './icon.png',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap',
    'https://unpkg.com/html5-qrcode',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
];

// Instalación: Cachear todo el frontend necesario para funcionar offline
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting()) // Forzar a que el nuevo SW tome el control inmediatamente
    );
});

// Activación: Limpiar cachés antiguas
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Limpiando caché antigua:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptor de Peticiones: Estrategia Stale-While-Revalidate (Proporcionar caché inmediatamente, actualizar silenciosamente de fondo)
self.addEventListener('fetch', event => {
    // 1. Evitar que el Service Worker interfiera con el API de Google Apps Script 
    //    (Dejamos que app.js maneje la data directamente por Red o LocalStorage)
    if (event.request.url.includes('script.google.com') || event.request.url.includes('script.googleusercontent.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Ir a internet a buscar una versión más fresca de todos los archivos silenciosamente
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Guardar la nueva versión en la caché para la próxima vez que se abra la app
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(err => {
                // Si la red falla (estamos offline), el catch ignorará el error y el usuario usará la caché
            });

            // Retornamos el archivo INMEDIATAMENTE de la caché si existe (Carga instantánea)
            // Si es la primera vez y no hay caché, espera a la promesa de descarga (fetchPromise).
            return cachedResponse || fetchPromise;
        })
    );
});
