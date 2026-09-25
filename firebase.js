// ============================================================
//  Multimarca — Capa de datos Firebase (producción)
//  Módulo ES con la MISMA interfaz que LocalStore (index.html):
//    listProducts({cache}), saveProduct, deleteProduct,
//    getSettings({cache}), saveSettings,
//    createOrder, listOrders,
//    signIn  (+ signOut, onAuth)
//
//  Uso (desde el <script type="text/x-dc"> de index.html):
//    const mod = await import('./firebase.js');
//    this.store = mod.createStore() || this.store;   // fallback local
//
//  Requiere que firebase-config.js se cargue antes (window.MULTIMARCA_FIREBASE).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, getDocs, getDocsFromCache, doc, getDoc, getDocFromCache, setDoc, addDoc,
  deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const PRODUCTS = 'products';
const ORDERS   = 'orders';
const SETTINGS = 'settings';
const SETTINGS_DOC = 'store';

let app, db, auth;

function init(){
  if (app) return true;
  const cfg = window.MULTIMARCA_FIREBASE;
  if (!cfg || !cfg.apiKey) {
    console.warn('[multimarca] Falta firebase-config.js — la tienda usa datos locales.');
    return false;
  }
  app = initializeApp(cfg);
  // Caché persistente (IndexedDB): lo último que se leyó queda guardado en el
  // navegador, así con conexión lenta la tienda arranca con eso y después se
  // actualiza. Si IndexedDB no está disponible (algunas ventanas privadas)
  // se sigue con el caché en memoria de siempre.
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch(e){
    console.warn('[multimarca] Caché local de Firestore no disponible:', e.message);
    db = getFirestore(app);
  }
  auth = getAuth(app);
  // Analytics aparte y sin bloquear: no hace falta para mostrar la tienda.
  import("https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js")
    .then(m => m.isSupported().then(ok => { if (ok) m.getAnalytics(app); }))
    .catch(()=>{});
  return true;
}

// ---- helpers ----
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const millis = t => (t && t.toMillis) ? t.toMillis() : Number.MAX_SAFE_INTEGER; // recién creado (serverTimestamp pendiente) va primero

// Más nuevos primero. Se ordena en el cliente para que la misma lectura sirva
// desde el caché y desde el servidor (y los docs sin createdAt no se pierdan).
// { cache: true } lee solo el caché local (instantáneo, sin red); si no hay
// nada guardado devuelve []. Sin opciones va al servidor.
async function readAll(name, { cache = false } = {}){
  const ref = collection(db, name);
  const list = rows(await (cache ? getDocsFromCache(ref) : getDocs(ref)));
  return list.sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
}

// ---- Imágenes ----
// El proyecto no usa Firebase Storage, así que la foto se guarda dentro del
// propio documento como data URL JPEG. Firestore limita cada documento a
// 1 MiB: se achica la foto hasta que entre con margen para el resto de los campos.
const IMG_MAX_BYTES = 700 * 1024;
export async function compressImg(file, maxSide = 900){
  if (!file || !/^image\//.test(file.type || '')) throw new Error('El archivo no es una imagen.');
  const src = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen (probá con JPG o PNG).')); };
    im.src = url;
  });
  let side = maxSide;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, side / Math.max(src.naturalWidth, src.naturalHeight));
    const w = Math.max(1, Math.round(src.naturalWidth * k)), h = Math.max(1, Math.round(src.naturalHeight * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); // PNG con transparencia -> fondo blanco
    cx.drawImage(src, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58]) {
      const data = cv.toDataURL('image/jpeg', q);
      if (data.length <= IMG_MAX_BYTES) return data;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error('La imagen es demasiado pesada, probá con otra.');
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email o contraseña incorrectos',
  'auth/wrong-password':     'Email o contraseña incorrectos',
  'auth/user-not-found':     'Email o contraseña incorrectos',
  'auth/invalid-email':      'El email no es válido',
  'auth/user-disabled':      'Ese usuario está deshabilitado',
  'auth/too-many-requests':  'Demasiados intentos. Probá de nuevo en unos minutos',
  'auth/network-request-failed': 'Sin conexión. Revisá tu internet'
};

const asUser = u => u ? { email: u.email, name: u.displayName || 'Multimarca', uid: u.uid } : null;

// ============================================================
//  FirestoreStore — mismo contrato que LocalStore
// ============================================================
class FirestoreStore {

  // ---------- catálogo ----------
  async listProducts(opts){
    return readAll(PRODUCTS, opts);
  }

  // `img` llega ya comprimida desde el panel (compressImg) y se guarda tal cual.
  async saveProduct(p){
    const { id, ...rest } = p;
    const pid = id || doc(collection(db, PRODUCTS)).id;
    rest.precio = Number(rest.precio) || 0;
    rest.stock = Number(rest.stock) || 0;
    rest.destacado = !!rest.destacado;
    rest.img = rest.img || '';
    if (!id) rest.createdAt = serverTimestamp();
    rest.updatedAt = serverTimestamp();
    await setDoc(doc(db, PRODUCTS, pid), rest, { merge: true });
    return { ...p, id: pid };
  }

  compressImg(file){
    return compressImg(file);
  }

  async deleteProduct(id){
    await deleteDoc(doc(db, PRODUCTS, id));
  }

  // ---------- configuración de la tienda ----------
  async getSettings({ cache = false } = {}){
    const ref = doc(db, SETTINGS, SETTINGS_DOC);
    let d;
    try { d = await (cache ? getDocFromCache(ref) : getDoc(ref)); }
    catch(e){ if (cache) return null; throw e; } // getDocFromCache falla si no está guardado
    return d.exists() ? d.data() : null;
  }

  async saveSettings(s){
    const data = { ...s, updatedAt: serverTimestamp() };
    await setDoc(doc(db, SETTINGS, SETTINGS_DOC), data, { merge: true });
    return { ...s };
  }

  // ---------- pedidos ----------
  // El número visible (#123456) se genera en el cliente: los pedidos los crea
  // gente sin autenticar, así que no hay un contador central que puedan tocar.
  async createOrder(o){
    const numero = String(Date.now()).slice(-6);
    const fecha = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const base = { ...o, numero, fecha, estado: 'pendiente' };
    const r = await addDoc(collection(db, ORDERS), { ...base, createdAt: serverTimestamp() });
    return { ...base, id: numero, docId: r.id };
  }

  // Solo admin autenticado (ver firestore.rules): el público recibe permiso denegado.
  async listOrders(){
    const list = await readAll(ORDERS);
    return list.map(o => ({ ...o, docId: o.id, id: o.numero || o.id }));
  }

  // ---------- auth (panel admin) ----------
  async signIn(email, pass){
    try {
      const cred = await signInWithEmailAndPassword(auth, (email||'').trim(), pass||'');
      return asUser(cred.user);
    } catch(err){
      throw new Error(AUTH_ERRORS[err.code] || 'No pudimos iniciar sesión. Probá de nuevo');
    }
  }

  signOut(){
    return signOut(auth);
  }

  onAuth(cb){
    return onAuthStateChanged(auth, u => cb(asUser(u)));
  }
}

export function createStore(){
  try {
    return init() ? new FirestoreStore() : null;
  } catch(err){
    console.warn('[multimarca] Firebase no disponible:', err);
    return null;
  }
}

export { FirestoreStore };
