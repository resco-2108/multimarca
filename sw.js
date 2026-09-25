// Multimarca — service worker: caché para conexiones lentas.
//
// - Páginas (HTML): se piden a la red, pero si tarda más de NET_TIMEOUT se
//   sirve la copia guardada y la red termina de actualizarla de fondo. Así un
//   deploy se ve enseguida con buena conexión y la página abre igual con mala.
// - Scripts propios (support.js, firebase.js, firebase-config.js): siguen a la página que los
//   pidió. Si la página salió del caché, sus scripts también; si salió de la
//   red, sus scripts también (sin timeout). Así nunca se mezcla un HTML nuevo
//   con un JS viejo o al revés, aunque un deploy cambie los dos a la vez.
// - Imágenes y fuentes propias, y librerías de CDN con versión fija (unpkg,
//   Firebase, Google Fonts): se sirven del caché y se refrescan de fondo.
// - Firestore y Auth no pasan por acá: los maneja el SDK (que tiene su propio
//   caché en IndexedDB).
//
// Subir VERSION cuando se cambie este archivo de forma incompatible: al
// activarse borra los cachés de versiones anteriores.
const VERSION = "v1";
const PAGES = "multimarca-pages-" + VERSION;
const STATIC = "multimarca-static-" + VERSION;
const NET_TIMEOUT = 3000;

// Qué versión recibió cada pestaña: clientId -> "cache" | "net". Si el service
// worker se reinicia en medio de una carga se pierde, y se trata como "net".
const pageSource = new Map();

const CDN_HOSTS = ["unpkg.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  // Lo mínimo para que la tienda abra sin red en la próxima visita.
  e.waitUntil(caches.open(PAGES).then(c => c.addAll(["./", "./support.js", "./firebase.js", "./firebase-config.js"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("multimarca-") && k !== PAGES && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate") {
      e.respondWith(navigate(e, req));
    } else if (url.pathname.endsWith(".js") && url.pathname !== "/sw.js") {
      e.respondWith(scriptFor(e, req));
    } else {
      e.respondWith(staleWhileRevalidate(e, req, STATIC));
    }
  } else if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(e, req, STATIC));
  }
});

function cacheable(res) {
  return res && (res.ok || res.type === "opaque");
}

function remember(clientId, source) {
  if (!clientId) return;
  pageSource.set(clientId, source);
  if (pageSource.size > 50) pageSource.delete(pageSource.keys().next().value);
}

async function navigate(e, req) {
  const cache = await caches.open(PAGES);
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  const timeout = new Promise(r => setTimeout(r, NET_TIMEOUT));
  const first = await Promise.race([net.catch(() => null), timeout]);
  if (first) { remember(e.resultingClientId, "net"); return first; }
  // Red lenta o caída: la copia guardada, si hay.
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) { remember(e.resultingClientId, "cache"); return cached; }
  remember(e.resultingClientId, "net");
  return net; // primera visita sin copia: esperar lo que tarde
}

async function scriptFor(e, req) {
  const cache = await caches.open(PAGES);
  if (pageSource.get(e.clientId) === "cache") {
    const cached = await cache.match(req);
    if (cached) return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(e, req, name) {
  const cache = await caches.open(name);
  const cached = await cache.match(req);
  const net = fetch(req).then(res => {
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  });
  if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
  return net;
}
