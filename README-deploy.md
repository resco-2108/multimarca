# Multimarca — despliegue (Firebase + Cloudflare)

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Sitio completo (público + panel admin). Framework DC en `support.js`. |
| `firebase-config.js` | Config pública del proyecto → `window.MULTIMARCA_FIREBASE`. Se carga antes que `support.js`. |
| `firebase.js` | Capa de datos real (`FirestoreStore`): Firestore (con caché persistente) + Auth + Analytics. |
| `sw.js` | Service worker: caché para conexiones lentas. |
| `_headers` | Cabeceras de caché de Cloudflare para `assets/`. |
| `firebase/firestore.rules` | Reglas de seguridad. |
| `firebase.json`, `.firebaserc` | Para desplegar las reglas con el CLI. |
| `seed/seed.js` | Carga el catálogo de muestra y `settings/store` en Firestore. |

**Proyecto Firebase:** `multimarca-fd659`.

## Cómo está conectado

`index.html` importa `./firebase.js` en `componentDidMount`. Si el import funciona,
`this.store` pasa a ser `FirestoreStore`; si falla (abierto con `file://`, sin red o sin
config) sigue andando `LocalStore` con el catálogo de demostración. Las dos clases tienen
la misma interfaz:

`listProducts · saveProduct · deleteProduct · getSettings · saveSettings · createOrder · listOrders · signIn` (+ `signOut` y `onAuth` en la versión Firebase).

- **Sesión del admin**: `onAuthStateChanged`. Si recargás la página logueado, el panel sigue abierto.
- **Fotos de producto**: el proyecto **no usa Firebase Storage**. El panel achica la foto en
  el navegador (`compressImg`: JPEG, lado mayor 900 px, máx. ~700 KB) y la guarda como data URL
  dentro del propio documento, en el campo `img` (Firestore limita cada documento a 1 MiB).
- **Productos y configuración salen siempre de Firestore**: el catálogo de demostración (`SEED`)
  solo se muestra si no hay conexión con Firebase (por ejemplo, abriendo el archivo con `file://`).
- **Pedidos**: los crea cualquiera desde el checkout; el número visible (`#123456`) se genera
  en el cliente porque no hay contador central escribible por el público. Solo el admin los lee.

## Pasos que faltan en la consola de Firebase

1. **Firestore** ya existe. **Storage no se usa** (las fotos van dentro del documento).
2. **Authentication → Email/Password** ya está habilitado. El admin es **`admin@multimarca.com`**
   (crearlo en la consola si todavía no existe; la contraseña se define ahí, no está en el código).
   Las reglas solo dejan escribir a ese email: si se cambia el admin, cambiarlo también en
   `firebase/firestore.rules`.
3. **Desplegar las reglas** (sin esto, la web no lee nada — hoy responde `PERMISSION_DENIED`):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
4. **Cargar datos de muestra** (opcional):
   ```bash
   cd seed && npm i
   ADMIN_EMAIL=admin@multimarca.com ADMIN_PASS=... node seed.js
   ```

## Caché (conexiones lentas)

Igual que en acuarela, tres capas:

1. **Datos — caché persistente de Firestore** (`persistentLocalCache`, en `firebase.js`).
   Lo último leído queda en IndexedDB. La tienda primero pinta lo guardado
   (`listProducts({ cache: true })`, `getSettings({ cache: true })`) y después lo reemplaza con
   lo que traiga el servidor. Las fotos viven dentro de los documentos, así que también quedan
   guardadas. En la primera visita no hay caché y se espera al servidor.
2. **Service worker** (`sw.js`, registrado al final de `index.html`):
   - HTML: primero la red; si tarda más de 3 s, la copia guardada (y la red la actualiza de
     fondo para la próxima visita).
   - JS propio (`support.js`, `firebase.js`, `firebase-config.js`): sale de la misma fuente que
     la página que lo pidió, así nunca se mezcla un HTML nuevo con un JS viejo.
   - Imágenes, fuentes y librerías de CDN con versión fija (Firebase, unpkg, Google Fonts):
     del caché, y se refrescan de fondo. No toca Firestore ni Auth.
   - Si se cambia `sw.js` de forma incompatible, subir `VERSION`: al activarse borra los cachés viejos.

   **Desactivarlo en una emergencia**: reemplazar el contenido de `sw.js` por esto y hacer deploy
   (no borrar el archivo: si da 404, los navegadores siguen usando el que tienen instalado):
   ```js
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", e => e.waitUntil((async () => {
     for (const k of await caches.keys()) await caches.delete(k);
     await self.registration.unregister();
     for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
   })()));
   ```
3. **Cabeceras HTTP** (`_headers`, las lee Cloudflare): `assets/` con 7 días de caché y
   `stale-while-revalidate`; `sw.js` con `no-cache`. **Si se reemplaza una imagen de `assets/`,
   subirla con otro nombre.**

## Colecciones

- `products/{id}`: nombre, marca, codigo, categoria, precio (number),
  destacado (bool), vehiculos, specs, descripcion, img (data URL JPEG comprimida), createdAt, updatedAt
- `orders/{id}`: items[], total, cliente{nombre, entrega, calle, localidad, cp, referencias},
  pago, numero, fecha, createdAt
- `settings/store` (doc único): alias, cbu, banco, titular, whatsapp, envioNota, categorias (array de strings), marcas (array de strings).
  Las dos listas se editan en Panel → Configuración; si el doc no las tiene, se usan las de `index.html` (`CATS`, `MARCAS`).

## Cloudflare

- Sitio estático: `wrangler pages deploy .` (Pages) o Worker con `[assets] directory`.
- Las claves de `firebase-config.js` son públicas: la seguridad la dan las reglas + Auth.
- `.assetsignore` deja fuera del deploy los archivos de trabajo (README, reglas, `seed/`, `uploads/`,
  config de Firebase): mencionan el email del admin y no hacen falta para el sitio.
- Favicon: `assets/favicon.png`. Dominio custom + SSL desde el dashboard.
