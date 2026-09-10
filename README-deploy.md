# Multimarca — despliegue (Cloudflare Workers + Firebase)

## Firebase
1. Crear proyecto → habilitar **Firestore**, **Authentication** (Email/Password) y **Storage**.
2. Crear el usuario admin en Authentication.
3. Colecciones Firestore:
   - `products/{id}`: nombre, marca, codigo, categoria, precio (number), stock (number), destacado (bool), vehiculos (string), descripcion, img (URL de Storage), createdAt
   - `orders/{id}`: items[], total, cliente{nombre, telefono, email, entrega, calle, numero, localidad, cp, referencias}, pago, estado, createdAt
   - `settings/store` (doc único): alias, cbu, banco, titular, whatsapp, envioNota
4. Reglas:
```
service cloud.firestore {
  match /databases/{db}/documents {
    match /products/{id} { allow read: if true; allow write: if request.auth != null; }
    match /settings/{id} { allow read: if true; allow write: if request.auth != null; }
    match /orders/{id}   { allow create: if true; allow read, update, delete: if request.auth != null; }
  }
}
```
Storage: `allow read: if true; allow write: if request.auth != null;` en `products/{file}`.

## Adaptador de datos
La lógica de la tienda usa una clase `LocalStore` con estos métodos:
`listProducts, saveProduct, deleteProduct, getSettings, saveSettings, createOrder, listOrders, signIn(email, pass)`.
Reemplazar por `FirestoreStore` con la misma interfaz usando el SDK web (`firebase/firestore`, `firebase/auth`, `firebase/storage`):
- `saveProduct`: si `img` es dataURL → `uploadString` a Storage → guardar `getDownloadURL`.
- `signIn`: `signInWithEmailAndPassword`; mantener sesión con `onAuthStateChanged`.
- `createOrder`: `addDoc(collection(db,'orders'), {...o, createdAt: serverTimestamp()})`.

## Cloudflare Workers
- Sitio estático: `wrangler pages deploy` (Pages) o Worker con `[assets] directory = "./dist"`.
- Variables públicas de Firebase (`apiKey`, `projectId`, etc.) van en el cliente; no son secretas.
- Favicon: `assets/favicon.png`. Dominio custom + SSL desde el dashboard de Cloudflare.
- Opcional: Worker que reciba `orders` nuevos vía webhook y notifique por WhatsApp Business API.
