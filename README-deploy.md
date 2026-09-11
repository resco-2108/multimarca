# Multimarca — despliegue (Firebase + Cloudflare)

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Sitio completo (público + panel admin). Framework DC en `support.js`. |
| `firebase-config.js` | Config pública del proyecto → `window.MULTIMARCA_FIREBASE`. Se carga antes que `support.js`. |
| `firebase.js` | Capa de datos real (`FirestoreStore`): Firestore + Auth + Storage + Analytics. |
| `firebase/firestore.rules`, `firebase/storage.rules` | Reglas de seguridad. |
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
- **Fotos de producto**: el input las lee como dataURL y `saveProduct` las sube a
  Storage (`products/<id>-<timestamp>.<ext>`) y guarda la URL de descarga en el campo `img`.
- **Pedidos**: los crea cualquiera desde el checkout; el número visible (`#123456`) se genera
  en el cliente porque no hay contador central escribible por el público. Solo el admin los lee.

## Pasos que faltan en la consola de Firebase

1. **Firestore** ya existe. **Storage: crear el bucket** (Build → Storage → Comenzar), si no,
   subir fotos falla (el panel muestra el error en un toast).
2. **Authentication → Email/Password** ya está habilitado. El admin es **`admin@multimarca.com`**
   (crearlo en la consola si todavía no existe; la contraseña se define ahí, no está en el código).
3. **Desplegar las reglas** (sin esto, la web no lee nada — hoy responde `PERMISSION_DENIED`):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage
   ```
4. **Cargar datos de muestra** (opcional):
   ```bash
   cd seed && npm i
   ADMIN_EMAIL=admin@multimarca.com ADMIN_PASS=... node seed.js
   ```

## Colecciones

- `products/{id}`: nombre, marca, codigo, categoria, precio (number), stock (number),
  destacado (bool), vehiculos, specs, descripcion, img (URL de Storage), createdAt, updatedAt
- `orders/{id}`: items[], total, cliente{nombre, entrega, calle, localidad, cp, referencias},
  pago, numero, fecha, estado, createdAt
- `settings/store` (doc único): alias, cbu, banco, titular, whatsapp, envioNota

## Cloudflare

- Sitio estático: `wrangler pages deploy .` (Pages) o Worker con `[assets] directory`.
- Las claves de `firebase-config.js` son públicas: la seguridad la dan las reglas + Auth.
- Favicon: `assets/favicon.png`. Dominio custom + SSL desde el dashboard.
