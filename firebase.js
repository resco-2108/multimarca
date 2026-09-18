// ============================================================
//  Multimarca — Capa de datos Firebase (producción)
//  Módulo ES con la MISMA interfaz que LocalStore (index.html):
//    listProducts, saveProduct, deleteProduct,
//    getSettings, saveSettings,
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
  getFirestore, collection, getDocs, doc, getDoc, setDoc, addDoc,
  deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage, ref, uploadString, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

const PRODUCTS = 'products';
const ORDERS   = 'orders';
const SETTINGS = 'settings';
const SETTINGS_DOC = 'store';

let app, db, auth, storage;

function init(){
  if (app) return true;
  const cfg = window.MULTIMARCA_FIREBASE;
  if (!cfg || !cfg.apiKey) {
    console.warn('[multimarca] Falta firebase-config.js — la tienda usa datos locales.');
    return false;
  }
  app = initializeApp(cfg);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  // Analytics solo donde el navegador lo soporta (https, sin bloqueadores).
  isSupported().then(ok => { if (ok) { try { getAnalytics(app); } catch(e){} } }).catch(()=>{});
  return true;
}

// ---- helpers ----
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// Lee una colección ordenada; si el campo de orden no existe en ningún doc,
// Firestore devuelve vacío sin error, así que reintentamos sin ordenar.
async function readAll(name, field = 'createdAt', dir = 'desc'){
  try {
    const snap = await getDocs(query(collection(db, name), orderBy(field, dir)));
    if (!snap.empty) return rows(snap);
  } catch(e){}
  return rows(await getDocs(collection(db, name)));
}

async function uploadImage(pid, dataUrl){
  const mime = (dataUrl.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const r = ref(storage, `${PRODUCTS}/${pid}-${Date.now()}.${ext}`);
  await uploadString(r, dataUrl, 'data_url');
  return getDownloadURL(r);
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

// Storage puede no existir todavía: el bucket se crea a mano en la consola
// (paso 1 del README-deploy.md). Sin bucket, el SDK tira storage/unknown.
const STORAGE_ERRORS = {
  'storage/unknown':              'falta crear el bucket de Storage en Firebase',
  'storage/object-not-found':     'falta crear el bucket de Storage en Firebase',
  'storage/bucket-not-found':     'falta crear el bucket de Storage en Firebase',
  'storage/no-default-bucket':    'falta crear el bucket de Storage en Firebase',
  'storage/project-not-found':    'falta crear el bucket de Storage en Firebase',
  'storage/unauthorized':         'Storage rechazó la foto: reglas sin desplegar, o pesa más de 8 MB',
  'storage/unauthenticated':      'volvé a iniciar sesión para subir fotos',
  'storage/quota-exceeded':       'se llenó la cuota de Storage',
  'storage/retry-limit-exceeded': 'se cortó la subida. Revisá la conexión',
  'storage/canceled':             'se canceló la subida'
};

const storageMessage = err =>
  STORAGE_ERRORS[err && err.code] || (err && err.message) || 'no se pudo subir la foto';

const asUser = u => u ? { email: u.email, name: u.displayName || 'Multimarca', uid: u.uid } : null;

// ============================================================
//  FirestoreStore — mismo contrato que LocalStore
// ============================================================
class FirestoreStore {

  // ---------- catálogo ----------
  async listProducts(){
    return readAll(PRODUCTS);
  }

  async saveProduct(p){
    const { id, ...rest } = p;
    const pid = id || doc(collection(db, PRODUCTS)).id;
    rest.precio = Number(rest.precio) || 0;
    rest.stock = Number(rest.stock) || 0;
    rest.destacado = !!rest.destacado;
    // La foto va a Storage antes que el documento, pero su fallo no debe costar el
    // producto: guardamos igual sin tocar `img` (con merge queda la foto anterior si
    // había) y avisamos después con err.productSaved, para que el panel lo distinga
    // de un guardado que nunca ocurrió.
    let imgError = null;
    if (rest.img && rest.img.startsWith('data:')) {
      try {
        rest.img = await uploadImage(pid, rest.img);
      } catch(err){
        imgError = storageMessage(err);
        delete rest.img;
      }
    }
    if (!id) rest.createdAt = serverTimestamp();
    rest.updatedAt = serverTimestamp();
    await setDoc(doc(db, PRODUCTS, pid), rest, { merge: true });
    if (imgError){ const e = new Error(imgError); e.productSaved = true; throw e; }
    return { ...p, id: pid, img: rest.img || '' };
  }

  async deleteProduct(id){
    await deleteDoc(doc(db, PRODUCTS, id));
  }

  // ---------- configuración de la tienda ----------
  async getSettings(){
    const d = await getDoc(doc(db, SETTINGS, SETTINGS_DOC));
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
