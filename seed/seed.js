// ============================================================
//  Multimarca — Semilla de datos para Firestore
//  Sube el catálogo de muestra y settings/store al proyecto real.
//
//  Uso:
//    cd seed && npm i firebase
//    ADMIN_EMAIL=admin@multimarca.com ADMIN_PASS=... node seed.js
//
//  Requiere un usuario en Authentication (las reglas piden admin
//  autenticado para escribir en products/ y settings/).
// ============================================================

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// Config compartida con el sitio (firebase-config.js define window.MULTIMARCA_FIREBASE)
const cfgSrc = readFileSync(new URL('../firebase-config.js', import.meta.url), 'utf8');
const win = {};
new Function('window', cfgSrc)(win);

const CATS = ['Frenos','Suspensión','Motor','Filtros','Lubricantes','Distribución','Eléctrico','Embrague','Refrigeración','Accesorios'];

const SEED = [
  {id:'p1',nombre:'Kit de distribución con bomba de agua',marca:'SKF',codigo:'VKMC 01250-1',categoria:'Distribución',precio:189900,stock:6,destacado:true,vehiculos:'VW Gol Trend, VW Voyage, VW Fox, VW Suran',specs:'Contenido: Correa dentada, tensor, rodillo guía, bomba de agua\nMotor: 1.6 8v (EA111)\nDientes de correa: 137\nGarantía: 12 meses',descripcion:'Kit completo: correa dentada, tensor, rodillo y bomba de agua. Motores 1.6 8v.'},
  {id:'p2',nombre:'Pastillas de freno delanteras',marca:'Fras-le',codigo:'PD/1062',categoria:'Frenos',precio:42500,stock:14,destacado:true,vehiculos:'Chevrolet Corsa, Chevrolet Classic, Chevrolet Celta',specs:'Posición: Delantero\nMaterial: Cerámico\nContenido: 4 pastillas\nAlto x ancho: 52 x 116 mm',descripcion:'Juego de 4 pastillas cerámicas. Bajo nivel de ruido y polvo.'},
  {id:'p3',nombre:'Amortiguador delantero',marca:'Sachs',codigo:'313 512',categoria:'Suspensión',precio:98700,stock:4,destacado:true,vehiculos:'Peugeot 206, Peugeot 207',specs:'Posición: Delantero\nLado: Izquierdo o derecho (indistinto)\nTipo: Hidráulico presurizado a gas\nVenta: Por unidad',descripcion:'Amortiguador hidráulico presurizado a gas. Precio por unidad.'},
  {id:'p4',nombre:'Aceite sintético 5W-30 x 4L',marca:'Gulf',codigo:'FORMULA-G-5W30',categoria:'Lubricantes',precio:67900,stock:22,destacado:true,vehiculos:'',specs:'Viscosidad: 5W-30\nBase: 100% sintético\nNormas: API SN, ACEA C3\nEnvase: 4 litros',descripcion:'Aceite 100% sintético API SN, ACEA C3. Para motores nafteros y diésel modernos.'},
  {id:'p5',nombre:'Filtro de aceite',marca:'Mann',codigo:'W 712/75',categoria:'Filtros',precio:12900,stock:31,destacado:false,vehiculos:'Chevrolet Corsa, Chevrolet Agile, Chevrolet Onix',descripcion:'Filtro de aceite roscado con válvula antirretorno.'},
  {id:'p6',nombre:'Kit de embrague',marca:'LuK',codigo:'620 3095 00',categoria:'Embrague',precio:214000,stock:3,destacado:false,vehiculos:'Fiat Palio, Fiat Siena, Fiat Uno',specs:'Contenido: Placa, disco, rodamiento\nDiámetro: 200 mm\nMotor: Fire 1.4 8v',descripcion:'Placa, disco y rodamiento. Motores Fire 1.4.'},
  {id:'p7',nombre:'Batería 12V 65Ah',marca:'Moura',codigo:'M22GD',categoria:'Eléctrico',precio:158000,stock:8,destacado:false,vehiculos:'Ford Focus, Ford EcoSport, Renault Sandero, Renault Logan',specs:'Voltaje: 12V\nCapacidad: 65 Ah\nBorne positivo: Derecho\nGarantía: 18 meses',descripcion:'Batería libre de mantenimiento. 18 meses de garantía.'},
  {id:'p8',nombre:'Bomba de agua',marca:'Dolz',codigo:'R230',categoria:'Refrigeración',precio:54300,stock:5,destacado:false,vehiculos:'Renault Clio, Renault Kangoo, Renault Sandero',descripcion:'Bomba de agua con junta. Motores K4M / K7M.'},
  {id:'p9',nombre:'Discos de freno delanteros (par)',marca:'Fremax',codigo:'BD-4561',categoria:'Frenos',precio:89900,stock:7,destacado:false,vehiculos:'Toyota Corolla, Toyota Etios',descripcion:'Discos ventilados con tratamiento anticorrosión. Se venden en par.'},
  {id:'p10',nombre:'Filtro de aire',marca:'Fram',codigo:'CA 10190',categoria:'Filtros',precio:15800,stock:0,destacado:false,vehiculos:'VW Gol Trend, VW Voyage',descripcion:'Filtro de aire de panel. Reemplazo cada 15.000 km.'},
  {id:'p11',nombre:'Bujías iridio x4',marca:'NGK',codigo:'ILZKR7B-11S',categoria:'Motor',precio:38900,stock:12,destacado:false,vehiculos:'Ford Ka, Ford Fiesta, Ford Focus',descripcion:'Bujías de iridio de larga duración. Juego de 4.'},
  {id:'p12',nombre:'Cubre alfombras de goma x4',marca:'Ruta 40',codigo:'CA-UNIV',categoria:'Accesorios',precio:19900,stock:15,destacado:false,vehiculos:'',descripcion:'Universales, recortables. Color negro.'}
];

const DEFAULT_SETTINGS = {alias:'multimarca.repuestos',cbu:'0000003100012345678901',banco:'Mercado Pago',titular:'Multimarca Repuestos del Automotor',whatsapp:'2622539851',envioNota:'El costo de envío se coordina por WhatsApp según la zona. Envíos a todo el Valle de Uco.'};

const email = process.env.ADMIN_EMAIL;
const pass  = process.env.ADMIN_PASS;
if (!email || !pass) {
  console.error('Faltan credenciales: ADMIN_EMAIL=admin@multimarca.com ADMIN_PASS=... node seed.js');
  process.exit(1);
}

const app = initializeApp(win.MULTIMARCA_FIREBASE);
const db = getFirestore(app);

await signInWithEmailAndPassword(getAuth(app), email, pass);
console.log('Autenticado como', email);

for (const p of SEED) {
  const { id, ...rest } = p;
  await setDoc(doc(db, 'products', id), { ...rest, img: rest.img || '', createdAt: serverTimestamp() }, { merge: true });
  console.log('  producto', id, '·', p.nombre);
}

await setDoc(doc(db, 'settings', 'store'), { ...DEFAULT_SETTINGS, categorias: CATS, updatedAt: serverTimestamp() }, { merge: true });
console.log('  settings/store');

console.log('Listo:', SEED.length, 'productos + configuración.');
process.exit(0);
