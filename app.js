/* SANE - Sistema Administrativo para Nuevos Emprendedores (desarrollado por App Servis)
   FASE 2: cuentas reales (Firebase Authentication) y datos en la nube (Cloud Firestore).
   FASE 3: planes y suscripciones (Básico/Pro) controlados desde Firestore, sin cobro todavía.
   Sin frameworks, sin librerías externas más que el SDK de Firebase. */

import {
  auth, db,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
  doc, getDoc, setDoc, deleteDoc, collection, onSnapshot,
  serverTimestamp, writeBatch
} from './firebase.js';

const STORAGE_KEY = 'emprendedoresAppServis_v1'; // datos locales de versiones anteriores (para migración)
const SIDEBAR_STORAGE_KEY = 'emprendedoresAppServis_sidebar_collapsed';

// Límites del plan Básico: TODAVÍA NO APROBADOS. Se dejan en "null" (pendiente
// de definir) a propósito; mientras sigan así, no se bloquea a nadie por
// cantidad. Cuando se confirmen los números reales, solo hay que poner el
// valor numérico aquí.
const BASIC_PRODUCT_LIMIT = null; // pendiente de definir
const BASIC_MONTHLY_SALES_LIMIT = null; // pendiente de definir

let currentScreen = 'inicio';
let currentPeriod = 'dia';
let insumoRowCounter = 0;
let currentUser = null;
let dataUnsubscribers = [];

/* ============ Iconos (SVG en línea, sin emojis ni imágenes externas) ============ */

const ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l.9-3.6L16.4 5a1.5 1.5 0 0 1 2.1 0l1.5 1.5a1.5 1.5 0 0 1 0 2.1L8.5 20.1 4 20z"/><path d="M14.5 6.5l3 3"/></svg>';

const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7"/><path d="M6.5 7l.7 12.2c0 .95.8 1.8 1.8 1.8h6c1 0 1.8-.85 1.8-1.8L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/* ============ Utilidades generales ============ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Folio consecutivo tipo "V-0007": busca el número más alto ya usado con ese
// prefijo en la lista y le suma 1. Si se borra un folio de en medio, no se repite.
function siguienteFolio(prefijo, lista) {
  const maxN = lista.reduce((max, item) => {
    if (!item.folio || !item.folio.startsWith(prefijo + '-')) return max;
    const n = parseInt(item.folio.slice(prefijo.length + 1), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefijo}-${String(maxN + 1).padStart(4, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(fechaStr) {
  return parseDateStr(fechaStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() {
  return toDateStr(new Date());
}

function offsetDateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toDateStr(d);
}

/* ============ Datos (en memoria, sincronizados con Firestore) ============ */

let data = { productos: [], costeos: [], ventas: [], gastos: [], insumos: [], costeoDetallado: [], proveedores: [], clientes: [], pedidos: [], materiales: [], envios: [], activos: [], cotizaciones: [], usuario: null };

function vaciarData() {
  data = { productos: [], costeos: [], ventas: [], gastos: [], insumos: [], costeoDetallado: [], proveedores: [], clientes: [], pedidos: [], materiales: [], envios: [], activos: [], cotizaciones: [], usuario: null };
}

/* ============ Persistencia en Firestore (usuarios/{uid}/...) ============ */

const COLECCIONES = ['productos', 'insumos', 'costeos', 'costeoDetallado', 'ventas', 'gastos', 'proveedores', 'clientes', 'pedidos', 'materiales', 'envios', 'activos', 'cotizaciones'];

function usuarioRef(uid) {
  return doc(db, 'usuarios', uid);
}

function coleccionRef(uid, nombre) {
  return collection(db, 'usuarios', uid, nombre);
}

function documentoRef(uid, nombre, id) {
  return doc(db, 'usuarios', uid, nombre, id);
}

function guardarProducto(p) { return setDoc(documentoRef(currentUser.uid, 'productos', p.id), p); }
function borrarProductoRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'productos', id)); }

function guardarCosteo(c) { return setDoc(documentoRef(currentUser.uid, 'costeos', c.productoId), c); }
function borrarCosteoRemoto(productoId) { return deleteDoc(documentoRef(currentUser.uid, 'costeos', productoId)); }

function guardarCosteoDetallado(c) { return setDoc(documentoRef(currentUser.uid, 'costeoDetallado', c.productoId), c); }
function borrarCosteoDetalladoRemoto(productoId) { return deleteDoc(documentoRef(currentUser.uid, 'costeoDetallado', productoId)); }

function guardarInsumo(i) { return setDoc(documentoRef(currentUser.uid, 'insumos', i.id), i); }
function borrarInsumoRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'insumos', id)); }

function guardarVenta(v) { return setDoc(documentoRef(currentUser.uid, 'ventas', v.id), v); }
function borrarVentaRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'ventas', id)); }

function guardarGasto(g) { return setDoc(documentoRef(currentUser.uid, 'gastos', g.id), g); }
function borrarGastoRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'gastos', id)); }

function guardarProveedor(p) { return setDoc(documentoRef(currentUser.uid, 'proveedores', p.id), p); }
function borrarProveedorRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'proveedores', id)); }

function guardarCliente(c) { return setDoc(documentoRef(currentUser.uid, 'clientes', c.id), c); }
function borrarClienteRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'clientes', id)); }

function guardarPedido(p) { return setDoc(documentoRef(currentUser.uid, 'pedidos', p.id), p); }
function borrarPedidoRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'pedidos', id)); }

function guardarMaterial(m) { return setDoc(documentoRef(currentUser.uid, 'materiales', m.id), m); }
function borrarMaterialRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'materiales', id)); }

function guardarEnvio(e) { return setDoc(documentoRef(currentUser.uid, 'envios', e.id), e); }
function borrarEnvioRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'envios', id)); }

function guardarActivo(a) { return setDoc(documentoRef(currentUser.uid, 'activos', a.id), a); }
function borrarActivoRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'activos', id)); }

function guardarCotizacion(c) { return setDoc(documentoRef(currentUser.uid, 'cotizaciones', c.id), c); }
function borrarCotizacionRemoto(id) { return deleteDoc(documentoRef(currentUser.uid, 'cotizaciones', id)); }

/* Escucha en tiempo real las 8 colecciones del usuario: cualquier cambio (hecho desde
   este dispositivo o desde otro) actualiza "data" y vuelve a dibujar la pantalla.
   Así se logra la sincronización automática, sin botón "Guardar". */
function attachDataListeners(uid) {
  detachDataListeners();
  COLECCIONES.forEach(nombre => {
    const unsub = onSnapshot(coleccionRef(uid, nombre), snap => {
      data[nombre] = snap.docs.map(d => d.data());
      renderAll();
    });
    dataUnsubscribers.push(unsub);
  });

  // Documento del propio usuario (nombre, correo, plan, estadoPlan, suscripción):
  // se escucha en tiempo real para que un cambio de plan (desde Mi Plan, el panel
  // administrativo, o desde otro dispositivo) se refleje aquí automáticamente.
  const unsub = onSnapshot(usuarioRef(uid), snap => {
    data.usuario = snap.exists() ? snap.data() : null;
    renderAll();
  });
  dataUnsubscribers.push(unsub);
}

function detachDataListeners() {
  dataUnsubscribers.forEach(unsub => unsub());
  dataUnsubscribers = [];
}

/* ============ Cálculos de negocio ============ */

function getCosteo(productoId) {
  return data.costeos.find(c => c.productoId === productoId) || null;
}

function costoTotalUnitario(c) {
  return c.materiaPrima + c.empaque + c.manoObra + c.otrosCostos;
}

/* ---- Mis Insumos (función Pro) ---- */

function getInsumo(id) {
  return data.insumos.find(i => i.id === id) || null;
}

function getProveedor(id) {
  return data.proveedores.find(p => p.id === id) || null;
}

function getCliente(id) {
  return data.clientes.find(c => c.id === id) || null;
}

function getPedido(id) {
  return data.pedidos.find(p => p.id === id) || null;
}

function getMaterial(id) {
  return data.materiales.find(m => m.id === id) || null;
}

function getEnvio(id) {
  return data.envios.find(e => e.id === id) || null;
}

function getActivo(id) {
  return data.activos.find(a => a.id === id) || null;
}

function getCotizacion(id) {
  return data.cotizaciones.find(c => c.id === id) || null;
}

function categoriaDeUnidad(unidad) {
  if (unidad === 'gr' || unidad === 'kg') return 'masa';
  if (unidad === 'ml' || unidad === 'lt') return 'volumen';
  return 'pieza';
}

function unidadBaseLabel(categoria) {
  if (categoria === 'masa') return 'gramo';
  if (categoria === 'volumen') return 'mililitro';
  return 'pieza';
}

// Costo por la unidad más pequeña de su categoría (gramo, mililitro o pieza),
// para poder usarse en cualquier receta sin importar en qué se haya comprado.
function costoBaseInsumo(insumo) {
  const cantidad = Number(insumo.cantidadComprada) || 0;
  if (cantidad <= 0) return 0;
  const costoPorUnidadCompra = insumo.precioPagado / cantidad;

  if (insumo.categoria === 'masa') {
    return insumo.unidadCompra === 'kg' ? costoPorUnidadCompra / 1000 : costoPorUnidadCompra;
  }
  if (insumo.categoria === 'volumen') {
    return insumo.unidadCompra === 'lt' ? costoPorUnidadCompra / 1000 : costoPorUnidadCompra;
  }
  return costoPorUnidadCompra;
}

function resumenCostoInsumo(insumo) {
  const base = costoBaseInsumo(insumo);
  if (insumo.categoria === 'masa') {
    return `${formatCurrency(base)} por gramo · ${formatCurrency(base * 1000)} por kilo`;
  }
  if (insumo.categoria === 'volumen') {
    return `${formatCurrency(base)} por mililitro · ${formatCurrency(base * 1000)} por litro`;
  }
  return `${formatCurrency(base)} por pieza`;
}

/* ---- Costeo Detallado (función Pro) ---- */

function getCosteoDetallado(productoId) {
  return data.costeoDetallado.find(c => c.productoId === productoId) || null;
}

function calcularCosteoDetallado(cd) {
  const costoInsumos = (cd.items || []).reduce((sum, item) => {
    const insumo = getInsumo(item.insumoId);
    if (!insumo) return sum;
    return sum + costoBaseInsumo(insumo) * (Number(item.cantidad) || 0);
  }, 0);
  const costoTotalReceta = costoInsumos + (Number(cd.empaque) || 0) + (Number(cd.manoObra) || 0);
  const rendimiento = Number(cd.rendimiento) > 0 ? Number(cd.rendimiento) : 1;
  const costoPorPieza = costoTotalReceta / rendimiento;
  return { costoInsumos, costoTotalReceta, rendimiento, costoPorPieza };
}

// Cuánto insumo consume vender "cantidadVendida" piezas de un producto, según
// su receta de Costeo Detallado (si no usa costeo detallado, no hay forma de
// saber qué insumos gastó, así que no se descuenta nada de existencia).
function consumoInsumosPorVenta(productoId, cantidadVendida) {
  const producto = data.productos.find(p => p.id === productoId);
  if (!producto || !producto.usaCosteoDetallado) return [];
  const cd = getCosteoDetallado(productoId);
  if (!cd || !cd.items) return [];
  const rendimiento = Number(cd.rendimiento) > 0 ? Number(cd.rendimiento) : 1;
  return cd.items
    .map(item => ({ insumoId: item.insumoId, cantidad: (Number(item.cantidad) || 0) / rendimiento * cantidadVendida }))
    .filter(c => c.cantidad > 0);
}

// signo = -1 para descontar (venta), +1 para regresar (se borró la venta).
function aplicarConsumoInsumos(consumo, signo) {
  (consumo || []).forEach(c => {
    const insumo = getInsumo(c.insumoId);
    if (!insumo) return;
    const actual = typeof insumo.existencia === 'number' ? insumo.existencia : 0;
    insumo.existencia = actual + signo * c.cantidad;
    guardarInsumo(insumo);
  });
}

// Costo unitario de un producto, sin importar qué método de costeo use.
// Reutiliza el cálculo rápido o el detallado según corresponda, no los duplica.
function getCostoUnitarioProducto(productoId) {
  const producto = data.productos.find(p => p.id === productoId);
  if (producto && producto.usaCosteoDetallado) {
    const cd = getCosteoDetallado(productoId);
    return cd ? calcularCosteoDetallado(cd).costoPorPieza : 0;
  }
  const c = getCosteo(productoId);
  return c ? costoTotalUnitario(c) : 0;
}

/* ---- Plan Básico / Pro (real, guardado en Firestore) ---- */

function getPlanMode() {
  return (data.usuario && data.usuario.plan === 'pro') ? 'pro' : 'basico';
}

function getEstadoPlan() {
  return (data.usuario && data.usuario.estadoPlan) || 'activo';
}

/* ---- Interruptor Básico/Pro de desarrollo (solo para pruebas) ----
   Vive únicamente en localStorage de este dispositivo; NUNCA toca el plan
   real guardado en Firestore. Sirve para probar las funciones Pro sin
   depender de una cuenta real en Pro. */
const PLAN_DEV_STORAGE_KEY = 'saneAppServis_plan_dev';

function getDevPlanOverride() {
  const v = localStorage.getItem(PLAN_DEV_STORAGE_KEY);
  return (v === 'pro' || v === 'basico') ? v : null;
}

function setDevPlanOverride(valor) {
  localStorage.setItem(PLAN_DEV_STORAGE_KEY, valor);
}

// Si el interruptor de desarrollo está activo, manda sobre el plan real
// (solo en este dispositivo, solo para pruebas). Si no, se usa el plan real
// guardado en Firestore. Un plan Pro suspendido o cancelado pierde los
// beneficios Pro hasta reactivarse.
function isPro() {
  const override = getDevPlanOverride();
  if (override) return override === 'pro';
  return getPlanMode() === 'pro' && getEstadoPlan() === 'activo';
}

/* ---- Límites del plan Básico ---- */

function ventasDelMesActual() {
  const hoy = new Date();
  return data.ventas.filter(v => {
    const f = parseDateStr(v.fecha);
    return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
  }).length;
}

function mostrarLimitePlan(mensaje) {
  document.getElementById('limite-plan-mensaje').textContent = mensaje;
  document.getElementById('limite-plan-overlay').classList.add('open');
}

/* ---- Diálogos propios de SANE (reemplazan confirm()/alert() del navegador) ---- */

let _confirmResolver = null;
let _avisoResolver = null;

function mostrarConfirmacion(mensaje, opciones = {}) {
  return new Promise(resolve => {
    _confirmResolver = resolve;
    document.getElementById('confirm-titulo').textContent = opciones.titulo || '¿Estás seguro?';
    document.getElementById('confirm-mensaje').textContent = mensaje;
    document.getElementById('confirm-aceptar').textContent = opciones.textoAceptar || 'Aceptar';
    document.getElementById('confirm-overlay').classList.add('open');
  });
}

function cerrarConfirmacion(resultado) {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolver) {
    _confirmResolver(resultado);
    _confirmResolver = null;
  }
}

function mostrarAviso(mensaje, titulo) {
  return new Promise(resolve => {
    _avisoResolver = resolve;
    document.getElementById('aviso-titulo').textContent = titulo || 'Aviso';
    document.getElementById('aviso-mensaje').textContent = mensaje;
    document.getElementById('aviso-overlay').classList.add('open');
  });
}

function cerrarAviso() {
  document.getElementById('aviso-overlay').classList.remove('open');
  if (_avisoResolver) {
    _avisoResolver();
    _avisoResolver = null;
  }
}

// Antes de crear un producto o venta nuevos, confirma que el plan Básico no haya
// llegado a su tope; si ya llegó, muestra el aviso elegante y detiene la acción.
// Mientras los límites sigan "pendientes de definir" (null), nunca bloquea.
function puedeAgregarProducto() {
  if (isPro()) return true;
  if (BASIC_PRODUCT_LIMIT === null) return true;
  if (data.productos.length >= BASIC_PRODUCT_LIMIT) {
    mostrarLimitePlan(`Con el plan Básico puedes tener hasta ${BASIC_PRODUCT_LIMIT} productos.`);
    return false;
  }
  return true;
}

function puedeAgregarVenta() {
  if (isPro()) return true;
  if (BASIC_MONTHLY_SALES_LIMIT === null) return true;
  if (ventasDelMesActual() >= BASIC_MONTHLY_SALES_LIMIT) {
    mostrarLimitePlan(`Con el plan Básico puedes anotar hasta ${BASIC_MONTHLY_SALES_LIMIT} ventas por mes.`);
    return false;
  }
  return true;
}

function isInPeriod(fechaStr, periodo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = parseDateStr(fechaStr);
  fecha.setHours(0, 0, 0, 0);
  const diffDias = Math.round((hoy - fecha) / (1000 * 60 * 60 * 24));

  if (periodo === 'dia') return diffDias === 0;
  if (periodo === 'semana') return diffDias >= 0 && diffDias <= 6;
  if (periodo === 'mes') return fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth();
  return false;
}

function computeResumen(periodo) {
  const ventasPeriodo = data.ventas.filter(v => isInPeriod(v.fecha, periodo));
  const gastosPeriodo = data.gastos.filter(g => isInPeriod(g.fecha, periodo));

  const ventasTotales = ventasPeriodo.reduce((sum, v) => sum + v.cantidad * v.precioVentaUnitario, 0);
  const utilidadProductos = ventasPeriodo.reduce((sum, v) => sum + v.cantidad * (v.precioVentaUnitario - v.costoTotalUnitario), 0);
  const gastosGenerales = gastosPeriodo.reduce((sum, g) => sum + g.monto, 0);
  const gananciaEstimada = utilidadProductos - gastosGenerales;

  return { ventasTotales, utilidadProductos, gastosGenerales, gananciaEstimada };
}

/* ============ Detalle de tarjetas (modal informativo) ============ */

function periodTabLabel(periodo) {
  if (periodo === 'dia') return 'Hoy';
  if (periodo === 'semana') return 'Semana';
  if (periodo === 'mes') return 'Mes';
  return '';
}

function buildVentasDetailHtml(periodo) {
  const ventas = data.ventas
    .filter(v => isInPeriod(v.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (ventas.length === 0) {
    return '<p class="detail-empty">No hay ventas registradas en este período.</p>';
  }

  const total = ventas.reduce((sum, v) => sum + v.cantidad * v.precioVentaUnitario, 0);

  const rows = ventas.map(v => `
    <div class="detail-row">
      <div class="detail-row-main">
        <span class="detail-row-title">${escapeHtml(v.productoNombre)} × ${v.cantidad}</span>
        <span class="detail-row-value">${formatCurrency(v.cantidad * v.precioVentaUnitario)}</span>
      </div>
      <div class="detail-row-sub">Precio unitario: ${formatCurrency(v.precioVentaUnitario)} · ${formatDate(v.fecha)}</div>
    </div>
  `).join('');

  return `
    <div class="detail-list">${rows}</div>
    <div class="detail-total"><span>Total vendido</span><span>${formatCurrency(total)}</span></div>
  `;
}

function buildGastosDetailHtml(periodo) {
  const gastos = data.gastos
    .filter(g => isInPeriod(g.fecha, periodo))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (gastos.length === 0) {
    return '<p class="detail-empty">No hay gastos registrados en este período.</p>';
  }

  const total = gastos.reduce((sum, g) => sum + g.monto, 0);

  const rows = gastos.map(g => `
    <div class="detail-row">
      <div class="detail-row-main">
        <span class="detail-row-title">${escapeHtml(g.concepto)}</span>
        <span class="detail-row-value">${formatCurrency(g.monto)}</span>
      </div>
      <div class="detail-row-sub">${CATEGORIA_LABEL[g.categoria] || 'Otros'} · ${formatDate(g.fecha)}</div>
    </div>
  `).join('');

  return `
    <div class="detail-list">${rows}</div>
    <div class="detail-total"><span>Total de gastos</span><span>${formatCurrency(total)}</span></div>
  `;
}

function buildUtilidadDetailHtml(periodo) {
  const ventas = data.ventas.filter(v => isInPeriod(v.fecha, periodo));

  if (ventas.length === 0) {
    return '<p class="detail-empty">No hay ventas registradas en este período.</p>';
  }

  const porProducto = {};
  ventas.forEach(v => {
    if (!porProducto[v.productoNombre]) {
      porProducto[v.productoNombre] = { ingreso: 0, costo: 0 };
    }
    porProducto[v.productoNombre].ingreso += v.cantidad * v.precioVentaUnitario;
    porProducto[v.productoNombre].costo += v.cantidad * v.costoTotalUnitario;
  });

  const rows = Object.entries(porProducto).map(([nombre, d]) => `
    <div class="detail-row">
      <div class="detail-row-main">
        <span class="detail-row-title">${escapeHtml(nombre)}</span>
        <span class="detail-row-value">${formatCurrency(d.ingreso - d.costo)}</span>
      </div>
      <div class="detail-row-sub">Ingreso: ${formatCurrency(d.ingreso)} · Costo: ${formatCurrency(d.costo)}</div>
    </div>
  `).join('');

  const totalUtilidad = Object.values(porProducto).reduce((sum, d) => sum + (d.ingreso - d.costo), 0);

  return `
    <div class="detail-list">${rows}</div>
    <div class="detail-total"><span>Utilidad total de productos</span><span>${formatCurrency(totalUtilidad)}</span></div>
  `;
}

function buildGananciaDetailHtml(periodo) {
  const r = computeResumen(periodo);
  const costoProductos = r.ventasTotales - r.utilidadProductos;

  return `
    <div class="detail-formula">
      <div class="detail-formula-row"><span>Ventas</span><span>${formatCurrency(r.ventasTotales)}</span></div>
      <div class="detail-formula-row detail-formula-row--sub"><span>− Costo de productos vendidos</span><span>${formatCurrency(costoProductos)}</span></div>
      <div class="detail-formula-row detail-formula-row--result"><span>= Utilidad de productos</span><span>${formatCurrency(r.utilidadProductos)}</span></div>
      <div class="detail-formula-row detail-formula-row--sub"><span>− Gastos generales</span><span>${formatCurrency(r.gastosGenerales)}</span></div>
      <div class="detail-formula-row detail-formula-row--result detail-formula-row--final"><span>= Ganancia estimada</span><span>${formatCurrency(r.gananciaEstimada)}</span></div>
    </div>
    <p class="detail-explainer">La ganancia estimada se calcula restando el costo de producir los productos vendidos y los gastos generales registrados.</p>
  `;
}

const DETAIL_CONFIG = {
  'home-ventas': { fixedPeriodo: 'dia', title: 'Ventas de hoy', build: buildVentasDetailHtml },
  'home-gastos': { fixedPeriodo: 'dia', title: 'Gastos de hoy', build: buildGastosDetailHtml },
  'home-ganancia': { fixedPeriodo: 'dia', title: 'Cómo se calculó tu ganancia de hoy', build: buildGananciaDetailHtml },
  'resumen-ventas': { fixedPeriodo: null, title: 'Ventas', build: buildVentasDetailHtml },
  'resumen-utilidad': { fixedPeriodo: null, title: 'Utilidad por producto', build: buildUtilidadDetailHtml },
  'resumen-gastos': { fixedPeriodo: null, title: 'Gastos', build: buildGastosDetailHtml },
  'resumen-ganancia': { fixedPeriodo: null, title: 'Cómo se calculó la ganancia estimada', build: buildGananciaDetailHtml }
};

function openDetailModal(type) {
  const config = DETAIL_CONFIG[type];
  if (!config) return;

  const periodo = config.fixedPeriodo || currentPeriod;
  const title = config.fixedPeriodo ? config.title : `${config.title} — ${periodTabLabel(currentPeriod)}`;

  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-body').innerHTML = config.build(periodo);
  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetailModal() {
  document.getElementById('detail-overlay').classList.remove('open');
}

/* ============ Navegación entre pantallas ============ */

/* ---- Grupos desplegables del sidebar (Producción / Ventas / Negocio) ---- */

const SIDEBAR_GRUPO_STORAGE_PREFIX = 'emprendedoresAppServis_grupo_';

// La primera vez (sin nada guardado) los grupos arrancan cerrados, para que
// el menú no se vea tan largo; una vez que el usuario abre uno, se recuerda.
function getGrupoColapsado(nombre) {
  const v = localStorage.getItem(SIDEBAR_GRUPO_STORAGE_PREFIX + nombre);
  return v === null ? true : v === 'true';
}

function setGrupoColapsado(nombre, colapsado) {
  localStorage.setItem(SIDEBAR_GRUPO_STORAGE_PREFIX + nombre, colapsado);
  const grupo = document.querySelector(`.sidebar-group[data-grupo="${nombre}"]`);
  if (grupo) grupo.classList.toggle('collapsed', colapsado);
}

// Al entrar a una pantalla que vive dentro de un grupo, ese grupo se abre
// solo, para que siempre se vea resaltada la opción activa.
function expandirGrupoDeScreen(screen) {
  const boton = document.querySelector(`.nav-btn[data-screen="${screen}"]`);
  const grupo = boton && boton.closest('.sidebar-group');
  if (grupo) setGrupoColapsado(grupo.dataset.grupo, false);
}

function goToScreen(screen) {
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
  expandirGrupoDeScreen(screen);
  renderCurrentScreen();
}

function renderCurrentScreen() {
  if (currentScreen === 'inicio') renderInicio();
  if (currentScreen === 'productos') renderProductos();
  if (currentScreen === 'insumos') renderInsumos();
  if (currentScreen === 'materiales') renderMateriales();
  if (currentScreen === 'costeo') renderCosteo();
  if (currentScreen === 'ventas') renderVentas();
  if (currentScreen === 'pedidos') renderPedidos();
  if (currentScreen === 'envios') renderEnvios();
  if (currentScreen === 'gastos') renderGastos();
  if (currentScreen === 'cotizaciones') renderCotizaciones();
  if (currentScreen === 'activos') renderActivos();
  if (currentScreen === 'proveedores') renderProveedores();
  if (currentScreen === 'clientes') renderClientes();
  if (currentScreen === 'inventario') renderInventario();
  if (currentScreen === 'resumen') renderResumen();
  if (currentScreen === 'mi-plan') renderMiPlan();
  actualizarSidebarProShading();
}

function renderAll() {
  renderInicio();
  renderProductos();
  renderInsumos();
  renderMateriales();
  renderCosteo();
  renderVentas();
  renderPedidos();
  renderEnvios();
  renderGastos();
  renderCotizaciones();
  renderActivos();
  renderProveedores();
  renderClientes();
  renderInventario();
  renderResumen();
  renderMiPlan();
  actualizarSidebarProShading();
}

function actualizarSidebarProShading() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('plan-basico', !isPro());
}

/* ============ Render: Mi Plan ============ */

const ESTADO_PLAN_LABEL = {
  activo: 'Activo',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado'
};

function renderMiPlan() {
  const badge = document.getElementById('mi-plan-badge');
  const estadoEl = document.getElementById('mi-plan-estado');
  const siguientePaso = document.getElementById('mi-plan-siguiente-paso');
  const btnActivar = document.getElementById('btn-activar-pro');
  if (!badge) return;

  const modo = getPlanMode();
  const estado = getEstadoPlan();

  badge.textContent = modo === 'pro' ? 'Pro' : 'Básico';
  estadoEl.textContent = ESTADO_PLAN_LABEL[estado] || 'Activo';

  if (estado !== 'activo') {
    siguientePaso.textContent = 'Tu plan no está activo en este momento. Si crees que esto es un error, contacta a soporte.';
    btnActivar.style.display = 'none';
    return;
  }

  if (modo === 'pro') {
    siguientePaso.textContent = 'Ya tienes SANE Pro. Disfruta de todas las funciones sin límite.';
    btnActivar.style.display = 'none';
  } else {
    siguientePaso.textContent = 'Actívalo cuando quieras: por ahora no tiene ningún costo.';
    btnActivar.style.display = 'block';
  }
}

/* ============ Render: Inicio ============ */

function renderInicio() {
  const r = computeResumen('dia');
  document.getElementById('home-ventas').textContent = formatCurrency(r.ventasTotales);
  document.getElementById('home-gastos').textContent = formatCurrency(r.gastosGenerales);
  document.getElementById('home-ganancia').textContent = formatCurrency(r.gananciaEstimada);

  const numVentasHoy = data.ventas.filter(v => isInPeriod(v.fecha, 'dia')).length;
  document.getElementById('home-ventas-count').textContent =
    numVentasHoy === 1 ? '1 venta hoy' : `${numVentasHoy} ventas hoy`;
}

/* ============ Render: Productos ============ */

function renderProductos() {
  const lista = document.getElementById('lista-productos');
  const vacio = document.getElementById('productos-vacio');

  if (data.productos.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.productos.map(p => {
    const detalle = [p.clave, p.categoria, formatCurrency(p.precioVenta), p.rendimiento].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(p.nombre)}</span>
        <span class="item-subtitle">${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-producto" data-id="${p.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-producto" data-id="${p.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Mis Insumos (función Pro) ============ */

function renderInsumos() {
  const bloqueado = document.getElementById('insumos-bloqueado');
  const contenido = document.getElementById('insumos-contenido');

  if (!isPro()) {
    bloqueado.style.display = 'flex';
    contenido.style.display = 'none';
    return;
  }
  bloqueado.style.display = 'none';
  contenido.style.display = 'block';

  const lista = document.getElementById('lista-insumos');
  const vacio = document.getElementById('insumos-vacio');

  if (data.insumos.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.insumos.map(i => `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(i.nombre)}</span>
        <span class="item-subtitle">${resumenCostoInsumo(i)}${i.proveedor ? ' · ' + escapeHtml(i.proveedor) : ''}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-insumo" data-id="${i.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-insumo" data-id="${i.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `).join('');
}

/* ============ Render: Materiales ============ */

function renderMateriales() {
  const bloqueado = document.getElementById('materiales-bloqueado');
  const contenido = document.getElementById('materiales-contenido');

  if (!isPro()) {
    bloqueado.style.display = 'flex';
    contenido.style.display = 'none';
    return;
  }
  bloqueado.style.display = 'none';
  contenido.style.display = 'block';

  const lista = document.getElementById('lista-materiales');
  const vacio = document.getElementById('materiales-vacio');

  if (data.materiales.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.materiales.map(m => {
    const costoPieza = m.cantidadComprada > 0 ? m.costoTotal / m.cantidadComprada : 0;
    const detalle = [m.modelo, m.especificaciones, `${formatCurrency(costoPieza)} por pieza`, m.proveedor].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(m.nombre)}</span>
        <span class="item-subtitle">${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-material" data-id="${m.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-material" data-id="${m.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Costeo ============ */

function renderCosteo() {
  const lista = document.getElementById('lista-costeo');
  const vacio = document.getElementById('costeo-vacio');

  if (data.productos.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.productos.map(p => {
    const usaDetallado = !!p.usaCosteoDetallado;
    let subtitle;
    if (usaDetallado) {
      const cd = getCosteoDetallado(p.id);
      subtitle = cd ? `Te cuesta hacerlo: ${formatCurrency(calcularCosteoDetallado(cd).costoPorPieza)} por pieza` : 'Aún no sabes cuánto te cuesta';
    } else {
      const c = getCosteo(p.id);
      subtitle = c ? `Te cuesta hacerlo: ${formatCurrency(costoTotalUnitario(c))}` : 'Aún no sabes cuánto te cuesta';
    }
    const modoLabel = usaDetallado ? 'Detallado' : 'Rápido';
    const cambiarALabel = usaDetallado ? 'Usar Costeo Rápido' : 'Usar Costeo Detallado';
    return `
      <li class="item-card">
        <div class="item-info">
          <span class="item-title">${escapeHtml(p.nombre)}</span>
          <span class="item-subtitle">${subtitle}</span>
          <div class="costeo-mode-line">
            <span class="costeo-mode-badge">${modoLabel}</span>
            <button type="button" class="costeo-mode-link" data-action="cambiar-modo-costeo" data-id="${p.id}">${cambiarALabel}</button>
          </div>
        </div>
        <div class="item-actions">
          <button type="button" class="icon-btn" data-action="editar-costeo" data-id="${p.id}" aria-label="Editar costeo">${ICON_PENCIL}</button>
        </div>
      </li>
    `;
  }).join('');
}

/* ============ Render: Ventas ============ */

const VIA_LABEL = {
  mostrador: 'Mostrador',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  otro: 'Otro'
};

function renderVentas() {
  const lista = document.getElementById('lista-ventas');
  const vacio = document.getElementById('ventas-vacio');
  const ventasOrdenadas = [...data.ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (ventasOrdenadas.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = ventasOrdenadas.map(v => {
    const detalle = [
      v.folio,
      formatDate(v.fecha),
      formatCurrency(v.cantidad * v.precioVentaUnitario),
      v.clienteNombre,
      VIA_LABEL[v.via]
    ].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(v.productoNombre)} × ${v.cantidad}</span>
        <span class="item-subtitle">${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="eliminar-venta" data-id="${v.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Gastos ============ */

const CATEGORIA_LABEL = {
  gasolina: 'Gasolina',
  publicidad: 'Publicidad',
  internet: 'Internet',
  renta: 'Renta',
  servicios: 'Servicios',
  otros: 'Otros'
};

function renderGastos() {
  const lista = document.getElementById('lista-gastos');
  const vacio = document.getElementById('gastos-vacio');
  const gastosOrdenados = [...data.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (gastosOrdenados.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = gastosOrdenados.map(g => `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(g.concepto)}</span>
        <span class="item-subtitle">${formatDate(g.fecha)} · ${CATEGORIA_LABEL[g.categoria] || 'Otros'} · ${formatCurrency(g.monto)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="eliminar-gasto" data-id="${g.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `).join('');
}

/* ============ Render: Cotizaciones ============ */

function opcionMasBarata(opciones) {
  const conCosto = (opciones || []).filter(o => typeof o.costo === 'number' && !isNaN(o.costo));
  if (conCosto.length === 0) return null;
  return conCosto.reduce((min, o) => (o.costo < min.costo ? o : min), conCosto[0]);
}

function renderCotizaciones() {
  const lista = document.getElementById('lista-cotizaciones');
  const vacio = document.getElementById('cotizaciones-vacio');

  if (data.cotizaciones.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.cotizaciones.map(c => {
    const numOpciones = (c.opciones || []).length;
    const masBarata = opcionMasBarata(c.opciones);
    const detalle = [
      c.cantidad ? `${c.cantidad} pza` : '',
      numOpciones > 0 ? `${numOpciones} opción(es)` : 'Sin opciones aún',
      masBarata ? `Más barata: ${escapeHtml(masBarata.proveedor || 'Sin nombre')} (${formatCurrency(masBarata.costo)})` : ''
    ].filter(Boolean).join(' · ');
    const badgeClase = c.comprado ? 'estado-badge--entregado' : 'estado-badge--pendiente';
    const badgeTexto = c.comprado ? 'Comprado' : 'Por comprar';
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(c.articulo)}</span>
        <span class="item-subtitle"><span class="estado-badge ${badgeClase}">${badgeTexto}</span>${detalle}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="toggle-comprado-cotizacion" data-id="${c.id}" aria-label="Marcar comprado">${ICON_CHECK}</button>
        <button type="button" class="icon-btn" data-action="editar-cotizacion" data-id="${c.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-cotizacion" data-id="${c.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Activos ============ */

function renderActivos() {
  const lista = document.getElementById('lista-activos');
  const vacio = document.getElementById('activos-vacio');

  if (data.activos.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.activos.map(a => {
    const detalle = [a.modelo, formatCurrency(a.costo), a.fecha ? formatDate(a.fecha) : '', a.proveedor].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(a.nombre)}</span>
        <span class="item-subtitle">${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-activo" data-id="${a.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-activo" data-id="${a.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Proveedores ============ */

function renderProveedores() {
  const lista = document.getElementById('lista-proveedores');
  const vacio = document.getElementById('proveedores-vacio');

  if (data.proveedores.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.proveedores.map(p => {
    const detalle = [p.contacto, p.telefono].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(p.nombre)}</span>
        <span class="item-subtitle">${detalle ? escapeHtml(detalle) : 'Sin datos de contacto'}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-proveedor" data-id="${p.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-proveedor" data-id="${p.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Clientes ============ */

const FUENTE_LABEL = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  recomendacion: 'Recomendación',
  otro: 'Otro'
};

function renderClientes() {
  const lista = document.getElementById('lista-clientes');
  const vacio = document.getElementById('clientes-vacio');

  if (data.clientes.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = data.clientes.map(c => {
    const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(' ');
    const detalle = [c.telefono || c.celular, FUENTE_LABEL[c.fuente]].filter(Boolean).join(' · ');
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(nombreCompleto)}</span>
        <span class="item-subtitle">${detalle ? escapeHtml(detalle) : 'Sin datos de contacto'}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-cliente" data-id="${c.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-cliente" data-id="${c.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Pedidos ============ */

const ESTADO_PEDIDO_LABEL = { pendiente: 'Pendiente', entregado: 'Entregado' };

function renderPedidos() {
  const lista = document.getElementById('lista-pedidos');
  const vacio = document.getElementById('pedidos-vacio');

  if (data.pedidos.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  const pedidosOrdenados = [...data.pedidos].sort((a, b) => (a.fechaEntrega || '').localeCompare(b.fechaEntrega || ''));

  lista.innerHTML = pedidosOrdenados.map(p => {
    const saldo = (Number(p.total) || 0) - (Number(p.anticipo) || 0);
    const detalle = [
      p.folio,
      p.clienteNombre,
      `Entrega: ${formatDate(p.fechaEntrega)}`,
      `Saldo: ${formatCurrency(saldo)}`
    ].filter(Boolean).join(' · ');
    const badgeClase = p.estado === 'entregado' ? 'estado-badge--entregado' : 'estado-badge--pendiente';
    const badgeTexto = ESTADO_PEDIDO_LABEL[p.estado] || 'Pendiente';
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(p.descripcion)}</span>
        <span class="item-subtitle"><span class="estado-badge ${badgeClase}">${badgeTexto}</span>${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="toggle-estado-pedido" data-id="${p.id}" aria-label="Cambiar estado">${ICON_CHECK}</button>
        <button type="button" class="icon-btn" data-action="editar-pedido" data-id="${p.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-pedido" data-id="${p.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Envíos ============ */

const ESTADO_ENVIO_LABEL = { pendiente: 'Pendiente', entregado: 'Entregado' };

function renderEnvios() {
  const lista = document.getElementById('lista-envios');
  const vacio = document.getElementById('envios-vacio');

  if (data.envios.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  const enviosOrdenados = [...data.envios].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  lista.innerHTML = enviosOrdenados.map(e => {
    const detalle = [
      e.clienteNombre,
      e.direccion,
      `Entrega: ${formatDate(e.fecha)}`,
      e.repartidor,
      e.costo ? formatCurrency(e.costo) : ''
    ].filter(Boolean).join(' · ');
    const badgeClase = e.estado === 'entregado' ? 'estado-badge--entregado' : 'estado-badge--pendiente';
    const badgeTexto = ESTADO_ENVIO_LABEL[e.estado] || 'Pendiente';
    return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(e.descripcion)}</span>
        <span class="item-subtitle"><span class="estado-badge ${badgeClase}">${badgeTexto}</span>${escapeHtml(detalle)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="toggle-estado-envio" data-id="${e.id}" aria-label="Cambiar estado">${ICON_CHECK}</button>
        <button type="button" class="icon-btn" data-action="editar-envio" data-id="${e.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-envio" data-id="${e.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `;
  }).join('');
}

/* ============ Render: Inventario ============ */

function renderFilaInventario(item, tipo, unidad) {
  const tieneExistencia = typeof item.existencia === 'number';
  const existenciaTexto = tieneExistencia ? `${item.existencia} ${unidad}` : 'Sin registrar';
  const existenciaClase = tieneExistencia && item.existencia <= 0 ? 'inventario-existencia--baja' : '';
  return `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(item.nombre)}</span>
        <span class="item-subtitle inventario-existencia ${existenciaClase}">${escapeHtml(existenciaTexto)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="agregar-compra" data-tipo="${tipo}" data-id="${item.id}" aria-label="Agregar compra">${ICON_PLUS}</button>
      </div>
    </li>
  `;
}

function renderInventario() {
  const bloqueado = document.getElementById('inventario-bloqueado');
  const contenido = document.getElementById('inventario-contenido');

  if (!isPro()) {
    bloqueado.style.display = 'flex';
    contenido.style.display = 'none';
    return;
  }
  bloqueado.style.display = 'none';
  contenido.style.display = 'block';

  const listaInsumos = document.getElementById('lista-inventario-insumos');
  const vacioInsumos = document.getElementById('inventario-insumos-vacio');
  if (data.insumos.length === 0) {
    listaInsumos.innerHTML = '';
    vacioInsumos.style.display = 'block';
  } else {
    vacioInsumos.style.display = 'none';
    listaInsumos.innerHTML = data.insumos.map(i => renderFilaInventario(i, 'insumo', i.unidadCompra)).join('');
  }

  const listaMateriales = document.getElementById('lista-inventario-materiales');
  const vacioMateriales = document.getElementById('inventario-materiales-vacio');
  if (data.materiales.length === 0) {
    listaMateriales.innerHTML = '';
    vacioMateriales.style.display = 'block';
  } else {
    vacioMateriales.style.display = 'none';
    listaMateriales.innerHTML = data.materiales.map(m => renderFilaInventario(m, 'material', 'pza')).join('');
  }
}

/* ============ Render: Resumen ============ */

function renderResumen() {
  const r = computeResumen(currentPeriod);
  document.getElementById('resumen-ventas').textContent = formatCurrency(r.ventasTotales);
  document.getElementById('resumen-utilidad').textContent = formatCurrency(r.utilidadProductos);
  document.getElementById('resumen-gastos').textContent = formatCurrency(r.gastosGenerales);
  document.getElementById('resumen-ganancia').textContent = formatCurrency(r.gananciaEstimada);
}

/* ============ Modales: apertura / cierre ============ */

function openModal(type) {
  document.querySelectorAll('.modal-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`form-${type}`).classList.add('active');
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal-form').forEach(f => f.classList.remove('active'));
}

function openProductoModal(id = null) {
  if (!id && !puedeAgregarProducto()) return;

  const form = document.getElementById('form-producto');
  form.reset();
  document.getElementById('producto-id').value = '';

  if (id) {
    const p = data.productos.find(p => p.id === id);
    if (p) {
      document.getElementById('producto-id').value = p.id;
      document.getElementById('producto-nombre').value = p.nombre;
      document.getElementById('producto-clave').value = p.clave || '';
      document.getElementById('producto-categoria').value = p.categoria || '';
      document.getElementById('producto-rendimiento').value = p.rendimiento || '';
      document.getElementById('producto-precio').value = p.precioVenta;
    }
  }
  actualizarPrecioSugerido(id);
  openModal('producto');
}

// Referencia informativa (no se guarda): 3 veces el costo de producción, tal
// como lo calculas tú mismo en tu lista de precios. El precio que de verdad
// se usa en Ventas/Resumen sigue siendo "producto-precio", editable a mano.
function actualizarPrecioSugerido(productoId) {
  const hint = document.getElementById('producto-precio-sugerido');
  const costo = productoId ? getCostoUnitarioProducto(productoId) : 0;
  if (!costo) {
    hint.textContent = '';
    return;
  }
  hint.textContent = `Precio sugerido (3x costo de ${formatCurrency(costo)}): ${formatCurrency(costo * 3)}`;
}

function openCosteoModal(productoId = null) {
  if (data.productos.length === 0) {
    mostrarAviso('Primero agrega al menos un producto en la pestaña Productos.');
    return;
  }
  const select = document.getElementById('costeo-producto-select');
  select.innerHTML = data.productos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  select.value = productoId || data.productos[0].id;
  cargarValoresCosteo(select.value);
  openModal('costeo');
}

function cargarValoresCosteo(productoId) {
  const c = getCosteo(productoId);
  document.getElementById('costeo-materia-prima').value = c ? c.materiaPrima : '';
  document.getElementById('costeo-empaque').value = c ? c.empaque : '';
  document.getElementById('costeo-mano-obra').value = c ? c.manoObra : '';
  document.getElementById('costeo-otros').value = c ? c.otrosCostos : '';
  actualizarPreviewCosteo();
}

function actualizarPreviewCosteo() {
  const mp = parseFloat(document.getElementById('costeo-materia-prima').value) || 0;
  const emp = parseFloat(document.getElementById('costeo-empaque').value) || 0;
  const mo = parseFloat(document.getElementById('costeo-mano-obra').value) || 0;
  const ot = parseFloat(document.getElementById('costeo-otros').value) || 0;
  document.getElementById('costeo-total-preview').textContent = formatCurrency(mp + emp + mo + ot);
}

/* ---- Edición de costeo: decide entre Rápido o Detallado según el producto ---- */

function openEditCosteoForProduct(productoId) {
  const producto = data.productos.find(p => p.id === productoId);
  if (producto && producto.usaCosteoDetallado) {
    openCosteoDetalladoModal(productoId);
  } else {
    openCosteoModal(productoId);
  }
}

function cambiarModoCosteo(productoId) {
  const producto = data.productos.find(p => p.id === productoId);
  if (!producto) return;

  if (!producto.usaCosteoDetallado) {
    if (!isPro()) {
      goToScreen('sane-pro');
      return;
    }
    producto.usaCosteoDetallado = true;
    guardarProducto(producto);
    renderCosteo();
    openCosteoDetalladoModal(productoId);
  } else {
    producto.usaCosteoDetallado = false;
    guardarProducto(producto);
    renderCosteo();
    openCosteoModal(productoId);
  }
}

/* ---- Costeo Detallado (función Pro) ---- */

function openCosteoDetalladoModal(productoId) {
  const producto = data.productos.find(p => p.id === productoId);
  if (!producto) return;

  document.getElementById('costeo-detallado-producto-id').value = productoId;
  document.getElementById('costeo-detallado-producto-nombre').textContent = producto.nombre;

  const cd = getCosteoDetallado(productoId);
  document.getElementById('costeo-detallado-empaque').value = cd ? cd.empaque : '';
  document.getElementById('costeo-detallado-mano-obra').value = cd ? cd.manoObra : '';
  document.getElementById('costeo-detallado-rendimiento').value = cd ? cd.rendimiento : '';

  const filasContenedor = document.getElementById('costeo-detallado-insumos');
  filasContenedor.innerHTML = '';

  const sinInsumosMsg = document.getElementById('costeo-detallado-sin-insumos');
  const addBtn = document.getElementById('btn-add-insumo-row');
  if (data.insumos.length === 0) {
    sinInsumosMsg.style.display = 'block';
    addBtn.style.display = 'none';
  } else {
    sinInsumosMsg.style.display = 'none';
    addBtn.style.display = 'block';
  }

  if (cd && cd.items && cd.items.length > 0) {
    cd.items.forEach(item => agregarFilaInsumo(item.insumoId, item.cantidad));
  } else if (data.insumos.length > 0) {
    agregarFilaInsumo();
  }

  actualizarPreviewCosteoDetallado();
  openModal('costeo-detallado');
}

function agregarFilaInsumo(insumoIdSeleccionado = null, cantidad = '') {
  insumoRowCounter += 1;
  const contenedor = document.getElementById('costeo-detallado-insumos');

  const div = document.createElement('div');
  div.className = 'insumo-row';
  div.dataset.rowId = `insumo-row-${insumoRowCounter}`;

  const opciones = data.insumos.map(i => `<option value="${i.id}">${escapeHtml(i.nombre)}</option>`).join('');
  const primerInsumo = insumoIdSeleccionado || (data.insumos[0] && data.insumos[0].id) || '';
  const insumoActivo = getInsumo(primerInsumo);
  const unidadLabel = insumoActivo ? unidadBaseLabel(insumoActivo.categoria) : '';

  div.innerHTML = `
    <select class="insumo-row-select">${opciones}</select>
    <input type="number" class="insumo-row-cantidad" min="0" step="0.01" placeholder="0" value="${cantidad}">
    <span class="insumo-row-unidad">${unidadLabel}</span>
    <button type="button" class="insumo-row-remove" aria-label="Quitar insumo">${ICON_TRASH}</button>
  `;

  contenedor.appendChild(div);

  const select = div.querySelector('.insumo-row-select');
  select.value = primerInsumo;

  select.addEventListener('change', () => {
    const insumo = getInsumo(select.value);
    div.querySelector('.insumo-row-unidad').textContent = insumo ? unidadBaseLabel(insumo.categoria) : '';
    actualizarPreviewCosteoDetallado();
  });
  div.querySelector('.insumo-row-cantidad').addEventListener('input', actualizarPreviewCosteoDetallado);
  div.querySelector('.insumo-row-remove').addEventListener('click', () => {
    div.remove();
    actualizarPreviewCosteoDetallado();
  });
}

function leerFilasInsumo() {
  return Array.from(document.querySelectorAll('#costeo-detallado-insumos .insumo-row')).map(row => ({
    insumoId: row.querySelector('.insumo-row-select').value,
    cantidad: parseFloat(row.querySelector('.insumo-row-cantidad').value) || 0
  })).filter(item => item.insumoId);
}

function actualizarPreviewCosteoDetallado() {
  const items = leerFilasInsumo();
  const empaque = parseFloat(document.getElementById('costeo-detallado-empaque').value) || 0;
  const manoObra = parseFloat(document.getElementById('costeo-detallado-mano-obra').value) || 0;
  const rendimiento = parseFloat(document.getElementById('costeo-detallado-rendimiento').value) || 0;

  const resultado = calcularCosteoDetallado({ items, empaque, manoObra, rendimiento });

  const productoId = document.getElementById('costeo-detallado-producto-id').value;
  const producto = data.productos.find(p => p.id === productoId);
  const precioVenta = producto ? producto.precioVenta : 0;
  const utilidad = precioVenta - resultado.costoPorPieza;
  const porcentaje = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;

  document.getElementById('costeo-detallado-preview').innerHTML = `
    <div class="detail-formula-row"><span>Costo total de la receta</span><span>${formatCurrency(resultado.costoTotalReceta)}</span></div>
    <div class="detail-formula-row detail-formula-row--result"><span>Costo por pieza</span><span>${formatCurrency(resultado.costoPorPieza)}</span></div>
    <div class="detail-formula-row"><span>Precio de venta actual</span><span>${formatCurrency(precioVenta)}</span></div>
    <div class="detail-formula-row detail-formula-row--result"><span>Utilidad por pieza</span><span>${formatCurrency(utilidad)}</span></div>
    <div class="detail-formula-row"><span>% de utilidad</span><span>${porcentaje.toFixed(0)}%</span></div>
    <div class="detail-formula-row detail-formula-row--pending"><span>Precio sugerido</span><span>Pendiente de definir</span></div>
  `;
}

/* ---- Mis Insumos: modal agregar/editar ---- */

function openInsumoModal(id = null) {
  const form = document.getElementById('form-insumo');
  form.reset();
  document.getElementById('insumo-id').value = '';
  document.getElementById('insumo-unidad').value = 'gr';

  if (id) {
    const i = getInsumo(id);
    if (i) {
      document.getElementById('insumo-id').value = i.id;
      document.getElementById('insumo-nombre').value = i.nombre;
      document.getElementById('insumo-unidad').value = i.unidadCompra;
      document.getElementById('insumo-cantidad').value = i.cantidadComprada;
      document.getElementById('insumo-precio').value = i.precioPagado;
      document.getElementById('insumo-proveedor').value = i.proveedor || '';
      document.getElementById('insumo-marca').value = i.marca || '';
      document.getElementById('insumo-ticket').value = i.ticket || '';
      document.getElementById('insumo-fecha').value = i.fecha || '';
    }
  }
  actualizarPreviewInsumo();
  openModal('insumo');
}

function openMaterialModal(id = null) {
  const form = document.getElementById('form-material');
  form.reset();
  document.getElementById('material-id').value = '';

  if (id) {
    const m = getMaterial(id);
    if (m) {
      document.getElementById('material-id').value = m.id;
      document.getElementById('material-nombre').value = m.nombre;
      document.getElementById('material-modelo').value = m.modelo || '';
      document.getElementById('material-especificaciones').value = m.especificaciones || '';
      document.getElementById('material-cantidad').value = m.cantidadComprada;
      document.getElementById('material-costo').value = m.costoTotal;
      document.getElementById('material-proveedor').value = m.proveedor || '';
      document.getElementById('material-ticket').value = m.ticket || '';
      document.getElementById('material-fecha').value = m.fecha || '';
    }
  }
  actualizarPreviewMaterial();
  openModal('material');
}

function actualizarPreviewMaterial() {
  const cantidad = parseFloat(document.getElementById('material-cantidad').value) || 0;
  const costo = parseFloat(document.getElementById('material-costo').value) || 0;
  const preview = document.getElementById('material-costo-preview');
  preview.textContent = cantidad > 0 ? `Costo por pieza: ${formatCurrency(costo / cantidad)}` : 'Costo por pieza: $0.00';
}

function actualizarPreviewInsumo() {
  const unidad = document.getElementById('insumo-unidad').value;
  const categoria = categoriaDeUnidad(unidad);
  const cantidad = parseFloat(document.getElementById('insumo-cantidad').value) || 0;
  const precio = parseFloat(document.getElementById('insumo-precio').value) || 0;
  const preview = document.getElementById('insumo-costo-preview');

  if (cantidad <= 0) {
    preview.textContent = 'Costo por unidad: $0.00';
    return;
  }
  preview.textContent = resumenCostoInsumo({ categoria, unidadCompra: unidad, cantidadComprada: cantidad, precioPagado: precio });
}

function openVentaModal() {
  if (!puedeAgregarVenta()) return;
  if (data.productos.length === 0) {
    mostrarAviso('Primero agrega al menos un producto en la pestaña Productos.');
    return;
  }
  const select = document.getElementById('venta-producto-select');
  select.innerHTML = data.productos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('venta-cantidad').value = 1;
  document.getElementById('venta-fecha').value = todayStr();
  document.getElementById('venta-via').value = '';

  const clienteSelect = document.getElementById('venta-cliente-select');
  clienteSelect.innerHTML = '<option value="">Sin especificar</option>' +
    data.clientes.map(c => `<option value="${c.id}">${escapeHtml([c.nombre, c.apellido].filter(Boolean).join(' '))}</option>`).join('');

  document.getElementById('venta-folio-preview').textContent = `Folio: ${siguienteFolio('V', data.ventas)}`;
  actualizarPreviewVenta();
  openModal('venta');
}

function actualizarPreviewVenta() {
  const productoId = document.getElementById('venta-producto-select').value;
  const cantidad = parseFloat(document.getElementById('venta-cantidad').value) || 0;
  const producto = data.productos.find(p => p.id === productoId);
  const ingreso = producto ? cantidad * producto.precioVenta : 0;
  document.getElementById('venta-ingreso-preview').textContent = formatCurrency(ingreso);

  const hint = document.getElementById('venta-costo-hint');
  if (!producto) {
    hint.textContent = '';
    return;
  }
  const tieneCosteo = producto.usaCosteoDetallado ? !!getCosteoDetallado(producto.id) : !!getCosteo(producto.id);
  if (!tieneCosteo) {
    hint.textContent = 'Aún no sabes cuánto te cuesta este producto. Por ahora se usará $0.00.';
  } else {
    hint.textContent = `Te cuesta hacerlo: ${formatCurrency(getCostoUnitarioProducto(producto.id))}`;
  }
}

function openGastoModal() {
  document.getElementById('form-gasto').reset();
  document.getElementById('gasto-fecha').value = todayStr();
  document.getElementById('gasto-categoria').value = 'otros';
  openModal('gasto');
}

function abrirCompraModal(tipo, id) {
  const item = tipo === 'material' ? getMaterial(id) : getInsumo(id);
  if (!item) return;
  document.getElementById('form-compra').reset();
  document.getElementById('compra-tipo').value = tipo;
  document.getElementById('compra-id').value = id;
  document.getElementById('compra-fecha').value = todayStr();
  const unidad = tipo === 'material' ? 'pza' : item.unidadCompra;
  document.getElementById('compra-item-nombre').textContent =
    `${item.nombre} · existencia actual: ${typeof item.existencia === 'number' ? item.existencia : 0} ${unidad}`;
  actualizarPreviewCompra();
  openModal('compra');
}

function actualizarPreviewCompra() {
  const tipo = document.getElementById('compra-tipo').value;
  const id = document.getElementById('compra-id').value;
  const item = tipo === 'material' ? getMaterial(id) : getInsumo(id);
  const existenciaActual = (item && typeof item.existencia === 'number') ? item.existencia : 0;
  const cantidad = parseFloat(document.getElementById('compra-cantidad').value) || 0;
  document.getElementById('compra-existencia-preview').textContent = existenciaActual + cantidad;
}

function actualizarPreviewPedido() {
  const total = parseFloat(document.getElementById('pedido-total').value) || 0;
  const anticipo = parseFloat(document.getElementById('pedido-anticipo').value) || 0;
  document.getElementById('pedido-saldo-preview').textContent = formatCurrency(total - anticipo);
}

function openPedidoModal(id = null) {
  const form = document.getElementById('form-pedido');
  form.reset();
  document.getElementById('pedido-id').value = '';

  const clienteSelect = document.getElementById('pedido-cliente-select');
  clienteSelect.innerHTML = '<option value="">Sin especificar</option>' +
    data.clientes.map(c => `<option value="${c.id}">${escapeHtml([c.nombre, c.apellido].filter(Boolean).join(' '))}</option>`).join('');

  if (id) {
    const p = getPedido(id);
    if (p) {
      document.getElementById('pedido-id').value = p.id;
      document.getElementById('pedido-descripcion').value = p.descripcion;
      clienteSelect.value = p.clienteId || '';
      document.getElementById('pedido-fecha-entrega').value = p.fechaEntrega;
      document.getElementById('pedido-total').value = p.total;
      document.getElementById('pedido-anticipo').value = p.anticipo;
      document.getElementById('pedido-folio-preview').textContent = `Folio: ${p.folio}`;
    }
  } else {
    document.getElementById('pedido-folio-preview').textContent = `Folio: ${siguienteFolio('P', data.pedidos)}`;
  }
  actualizarPreviewPedido();
  openModal('pedido');
}

function openEnvioModal(id = null) {
  const form = document.getElementById('form-envio');
  form.reset();
  document.getElementById('envio-id').value = '';

  const clienteSelect = document.getElementById('envio-cliente-select');
  clienteSelect.innerHTML = '<option value="">Sin especificar</option>' +
    data.clientes.map(c => `<option value="${c.id}">${escapeHtml([c.nombre, c.apellido].filter(Boolean).join(' '))}</option>`).join('');

  if (id) {
    const e = getEnvio(id);
    if (e) {
      document.getElementById('envio-id').value = e.id;
      document.getElementById('envio-descripcion').value = e.descripcion;
      clienteSelect.value = e.clienteId || '';
      document.getElementById('envio-direccion').value = e.direccion;
      document.getElementById('envio-fecha').value = e.fecha;
      document.getElementById('envio-repartidor').value = e.repartidor || '';
      document.getElementById('envio-costo').value = e.costo || '';
    }
  } else {
    document.getElementById('envio-fecha').value = todayStr();
  }
  openModal('envio');
}

function openProveedorModal(id = null) {
  const form = document.getElementById('form-proveedor');
  form.reset();
  document.getElementById('proveedor-id').value = '';

  if (id) {
    const p = getProveedor(id);
    if (p) {
      document.getElementById('proveedor-id').value = p.id;
      document.getElementById('proveedor-nombre').value = p.nombre;
      document.getElementById('proveedor-contacto').value = p.contacto || '';
      document.getElementById('proveedor-telefono').value = p.telefono || '';
      document.getElementById('proveedor-domicilio').value = p.domicilio || '';
      document.getElementById('proveedor-horario').value = p.horario || '';
      document.getElementById('proveedor-observaciones').value = p.observaciones || '';
    }
  }
  openModal('proveedor');
}

function openClienteModal(id = null) {
  const form = document.getElementById('form-cliente');
  form.reset();
  document.getElementById('cliente-id').value = '';

  if (id) {
    const c = getCliente(id);
    if (c) {
      document.getElementById('cliente-id').value = c.id;
      document.getElementById('cliente-nombre').value = c.nombre;
      document.getElementById('cliente-apellido').value = c.apellido || '';
      document.getElementById('cliente-telefono').value = c.telefono || '';
      document.getElementById('cliente-celular').value = c.celular || '';
      document.getElementById('cliente-email').value = c.email || '';
      document.getElementById('cliente-fuente').value = c.fuente || '';
    }
  }
  openModal('cliente');
}

/* ============ Acciones: eliminar ============ */

async function eliminarProducto(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este producto? No podrás recuperarlo.')) return;
  const teniaCosteo = data.costeos.some(c => c.productoId === id);
  const teniaCosteoDetallado = data.costeoDetallado.some(c => c.productoId === id);
  data.productos = data.productos.filter(p => p.id !== id);
  data.costeos = data.costeos.filter(c => c.productoId !== id);
  data.costeoDetallado = data.costeoDetallado.filter(c => c.productoId !== id);
  borrarProductoRemoto(id);
  if (teniaCosteo) borrarCosteoRemoto(id);
  if (teniaCosteoDetallado) borrarCosteoDetalladoRemoto(id);
  renderProductos();
  renderCosteo();
}

async function eliminarInsumo(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este insumo? No podrás recuperarlo.')) return;
  data.insumos = data.insumos.filter(i => i.id !== id);
  borrarInsumoRemoto(id);
  data.costeoDetallado.forEach(cd => {
    const totalAntes = cd.items.length;
    cd.items = cd.items.filter(item => item.insumoId !== id);
    if (cd.items.length !== totalAntes) guardarCosteoDetallado(cd);
  });
  renderInsumos();
  renderCosteo();
}

async function eliminarVenta(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar esta venta?')) return;
  const venta = data.ventas.find(v => v.id === id);
  data.ventas = data.ventas.filter(v => v.id !== id);
  borrarVentaRemoto(id);
  if (venta) aplicarConsumoInsumos(venta.consumoInsumos, 1);
  renderVentas();
  renderInicio();
  renderInsumos();
  renderInventario();
}

async function eliminarGasto(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este gasto?')) return;
  data.gastos = data.gastos.filter(g => g.id !== id);
  borrarGastoRemoto(id);
  renderGastos();
  renderInicio();
}

async function eliminarPedido(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este pedido?')) return;
  data.pedidos = data.pedidos.filter(p => p.id !== id);
  borrarPedidoRemoto(id);
  renderPedidos();
}

async function eliminarMaterial(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este material?')) return;
  data.materiales = data.materiales.filter(m => m.id !== id);
  borrarMaterialRemoto(id);
  renderMateriales();
  renderInventario();
}

function toggleEstadoPedido(id) {
  const p = getPedido(id);
  if (!p) return;
  p.estado = p.estado === 'entregado' ? 'pendiente' : 'entregado';
  guardarPedido(p);
  renderPedidos();
}

async function eliminarEnvio(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este envío?')) return;
  data.envios = data.envios.filter(e => e.id !== id);
  borrarEnvioRemoto(id);
  renderEnvios();
}

function toggleEstadoEnvio(id) {
  const e = getEnvio(id);
  if (!e) return;
  e.estado = e.estado === 'entregado' ? 'pendiente' : 'entregado';
  guardarEnvio(e);
  renderEnvios();
}

async function eliminarProveedor(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este proveedor?')) return;
  data.proveedores = data.proveedores.filter(p => p.id !== id);
  borrarProveedorRemoto(id);
  renderProveedores();
}

async function eliminarCliente(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este cliente?')) return;
  data.clientes = data.clientes.filter(c => c.id !== id);
  borrarClienteRemoto(id);
  renderClientes();
}

function openActivoModal(id = null) {
  const form = document.getElementById('form-activo');
  form.reset();
  document.getElementById('activo-id').value = '';

  if (id) {
    const a = getActivo(id);
    if (a) {
      document.getElementById('activo-id').value = a.id;
      document.getElementById('activo-nombre').value = a.nombre;
      document.getElementById('activo-modelo').value = a.modelo || '';
      document.getElementById('activo-costo').value = a.costo;
      document.getElementById('activo-fecha').value = a.fecha || '';
      document.getElementById('activo-proveedor').value = a.proveedor || '';
      document.getElementById('activo-observaciones').value = a.observaciones || '';
    }
  }
  openModal('activo');
}

async function eliminarActivo(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este activo?')) return;
  data.activos = data.activos.filter(a => a.id !== id);
  borrarActivoRemoto(id);
  renderActivos();
}

/* ---- Cotizaciones: filas dinámicas de opciones de proveedor ---- */

let opcionRowCounter = 0;

function agregarFilaOpcion(valores = {}) {
  opcionRowCounter += 1;
  const contenedor = document.getElementById('cotizacion-opciones');
  const div = document.createElement('div');
  div.className = 'insumo-row opcion-row';
  div.dataset.rowId = `opcion-row-${opcionRowCounter}`;
  div.innerHTML = `
    <div class="opcion-row-fields">
      <input type="text" class="opcion-proveedor" placeholder="Proveedor" value="${escapeHtml(valores.proveedor || '')}">
      <input type="text" class="opcion-telefono" placeholder="Teléfono" value="${escapeHtml(valores.telefono || '')}">
      <input type="number" class="opcion-costo" min="0" step="0.01" placeholder="Costo" value="${valores.costo != null ? valores.costo : ''}">
      <input type="text" class="opcion-observaciones" placeholder="Observaciones (opcional)" value="${escapeHtml(valores.observaciones || '')}">
    </div>
    <button type="button" class="insumo-row-remove" aria-label="Quitar opción">${ICON_TRASH}</button>
  `;
  contenedor.appendChild(div);
  div.querySelector('.insumo-row-remove').addEventListener('click', () => div.remove());
}

function openCotizacionModal(id = null) {
  const form = document.getElementById('form-cotizacion');
  form.reset();
  document.getElementById('cotizacion-id').value = '';
  document.getElementById('cotizacion-opciones').innerHTML = '';

  if (id) {
    const c = getCotizacion(id);
    if (c) {
      document.getElementById('cotizacion-id').value = c.id;
      document.getElementById('cotizacion-articulo').value = c.articulo;
      document.getElementById('cotizacion-cantidad').value = c.cantidad || '';
      (c.opciones || []).forEach(o => agregarFilaOpcion(o));
    }
  }
  if (document.getElementById('cotizacion-opciones').children.length === 0) {
    agregarFilaOpcion();
  }
  openModal('cotizacion');
}

async function eliminarCotizacion(id) {
  if (!await mostrarConfirmacion('¿Seguro que quieres borrar este artículo?')) return;
  data.cotizaciones = data.cotizaciones.filter(c => c.id !== id);
  borrarCotizacionRemoto(id);
  renderCotizaciones();
}

function toggleCompradoCotizacion(id) {
  const c = getCotizacion(id);
  if (!c) return;
  c.comprado = !c.comprado;
  guardarCotizacion(c);
  renderCotizaciones();
}

/* ============ Cuentas (Firebase Authentication) ============ */

function mensajeErrorAuth(code) {
  const mensajes = {
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Intenta iniciar sesión.',
    'auth/invalid-email': 'Ese correo no es válido.',
    'auth/weak-password': 'La contraseña es muy débil, usa al menos 6 caracteres.',
    'auth/missing-password': 'Escribe tu contraseña.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    'auth/unauthorized-domain': 'Este sitio todavía no está autorizado en Firebase. Avísale al desarrollador.'
  };
  return mensajes[code] || 'Ocurrió un error. Intenta de nuevo.';
}

function estructuraSuscripcionVacia() {
  return {
    estado: '',
    fechaInicio: null,
    fechaFin: null,
    renovacionAutomatica: false,
    proveedorPago: '',
    idSuscripcion: ''
  };
}

async function ensureUserDoc(user) {
  const ref = usuarioRef(user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      nombre: user.displayName || '',
      correo: user.email || '',
      plan: 'basico',
      estado: 'activo',
      fechaAlta: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
      estadoPlan: 'activo',
      fechaAltaPlan: serverTimestamp(),
      fechaActualizacionPlan: serverTimestamp(),
      suscripcion: estructuraSuscripcionVacia()
    });
    return;
  }

  // Cuentas creadas antes de FASE 3: se completan los campos nuevos sin tocar
  // los que ya existían (nombre, correo, plan, historial, etc.).
  const actuales = snap.data();
  const faltantes = {};
  if (!actuales.plan) faltantes.plan = 'basico';
  if (!actuales.estadoPlan) faltantes.estadoPlan = 'activo';
  if (!actuales.fechaAltaPlan) faltantes.fechaAltaPlan = serverTimestamp();
  if (!actuales.fechaActualizacionPlan) faltantes.fechaActualizacionPlan = serverTimestamp();
  if (!actuales.suscripcion) faltantes.suscripcion = estructuraSuscripcionVacia();
  if (Object.keys(faltantes).length > 0) {
    await setDoc(ref, faltantes, { merge: true });
  }
}

function actualizarAccountBarUI(user) {
  const nombre = (user.displayName || (data.usuario && data.usuario.nombre) || '').trim();
  const saludo = document.getElementById('topbar-saludo');
  if (saludo) saludo.textContent = nombre ? `¡Hola, ${nombre}!` : '¡Hola!';
}

/* ============ Migración de datos guardados en este dispositivo antes de tener cuenta ============ */

function checkMigration(uid) {
  const flagKey = `sane_migracion_${uid}`;
  if (localStorage.getItem(flagKey)) return;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { localStorage.setItem(flagKey, 'sin_datos'); return; }

  let local;
  try { local = JSON.parse(raw); } catch { localStorage.setItem(flagKey, 'sin_datos'); return; }

  const totalRegistros = (local.productos || []).length + (local.insumos || []).length +
    (local.costeos || []).length + (local.costeoDetallado || []).length +
    (local.ventas || []).length + (local.gastos || []).length;
  if (totalRegistros === 0) { localStorage.setItem(flagKey, 'sin_datos'); return; }

  const overlay = document.getElementById('migration-overlay');
  overlay.classList.add('open');

  document.getElementById('migration-si').onclick = async () => {
    overlay.classList.remove('open');
    await migrarDatosLocales(uid, local);
    localStorage.setItem(flagKey, 'migrado');
  };
  document.getElementById('migration-no').onclick = () => {
    overlay.classList.remove('open');
    localStorage.setItem(flagKey, 'rechazado');
  };
}

async function migrarDatosLocales(uid, local) {
  const batch = writeBatch(db);
  (local.productos || []).forEach(p => batch.set(documentoRef(uid, 'productos', p.id), p));
  (local.insumos || []).forEach(i => batch.set(documentoRef(uid, 'insumos', i.id), i));
  (local.costeos || []).forEach(c => batch.set(documentoRef(uid, 'costeos', c.productoId), c));
  (local.costeoDetallado || []).forEach(c => batch.set(documentoRef(uid, 'costeoDetallado', c.productoId), c));
  (local.ventas || []).forEach(v => batch.set(documentoRef(uid, 'ventas', v.id), v));
  (local.gastos || []).forEach(g => batch.set(documentoRef(uid, 'gastos', g.id), g));
  await batch.commit();
}

/* ============ Animación de bienvenida (solo tras registro/login correcto) ============ */

const BIENVENIDA_DIBUJAR_MS = 1400;
const BIENVENIDA_RESPIRAR_MS = 700;
const BIENVENIDA_TEXTO_MS = 600;
const BIENVENIDA_ESPERA_MS = 300;

// Se activa justo antes de intentar un login/registro real; onAuthStateChanged
// la consulta una sola vez y la apaga, así que nunca se dispara al cargar la
// página ni al restaurar una sesión ya iniciada (solo en una entrada real).
let mostrarBienvenidaAlEntrar = false;

function reproducirBienvenida() {
  const overlay = document.getElementById('welcome-overlay');
  const logo = document.getElementById('welcome-logo');
  const texto = document.getElementById('welcome-text');
  const prefiereMovimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  overlay.classList.add('open');

  if (prefiereMovimientoReducido) {
    logo.classList.remove('dibujando', 'respirando');
    logo.classList.add('dibujado');
    texto.classList.add('mostrar');
    return new Promise(resolve => setTimeout(() => {
      overlay.classList.remove('open');
      resolve();
    }, 500));
  }

  texto.classList.remove('mostrar');
  logo.classList.remove('dibujando', 'dibujado', 'respirando');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      logo.classList.add('dibujando');
    });
  });

  return new Promise(resolve => {
    setTimeout(() => {
      // "dibujado" deja el resultado fijo con una propiedad normal, para que no
      // se pierda cuando "respirando" defina su propia animación de transform.
      logo.classList.add('dibujado');
      logo.classList.add('respirando');
    }, BIENVENIDA_DIBUJAR_MS);
    setTimeout(() => texto.classList.add('mostrar'), BIENVENIDA_DIBUJAR_MS + BIENVENIDA_RESPIRAR_MS - 250);
    setTimeout(() => {
      overlay.classList.remove('open');
      resolve();
    }, BIENVENIDA_DIBUJAR_MS + BIENVENIDA_RESPIRAR_MS + BIENVENIDA_TEXTO_MS + BIENVENIDA_ESPERA_MS - 250);
  });
}

/* Reacciona a cualquier cambio de sesión: entrar, salir, o que Firebase confirme
   al cargar la página si ya había una sesión guardada en este dispositivo.
   La animación de bienvenida SOLO se reproduce cuando "mostrarBienvenidaAlEntrar"
   fue activada por un login/registro real (ver los formularios más abajo);
   nunca al cargar la página ni al restaurar una sesión existente. */
// Límite de seguridad: pase lo que pase (un error, un navegador donde algo no
// se dispare como se espera), nunca se queda la pantalla trabada más de esto.
const BIENVENIDA_LIMITE_MS = 4000;

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    const debeMostrarBienvenida = mostrarBienvenidaAlEntrar;
    mostrarBienvenidaAlEntrar = false;

    try {
      await ensureUserDoc(user);
    } catch (e) {
      // No dejar la animación ni la entrada congeladas si falla este paso;
      // los listeners de Firestore reintentan por su cuenta.
    }
    attachDataListeners(user.uid);

    if (debeMostrarBienvenida) {
      try {
        await Promise.race([
          reproducirBienvenida(),
          new Promise(resolve => setTimeout(resolve, BIENVENIDA_LIMITE_MS))
        ]);
      } catch (e) {
        // Si algo truena en la animación, entrar de todos modos.
      }
      document.getElementById('welcome-overlay').classList.remove('open');
    }

    document.body.classList.remove('state-loading', 'state-auth');
    document.body.classList.add('state-app');
    actualizarAccountBarUI(user);
    checkMigration(user.uid);
  } else {
    currentUser = null;
    detachDataListeners();
    vaciarData();
    document.body.classList.remove('state-loading', 'state-app');
    document.body.classList.add('state-auth');
    renderAll();
  }
});

/* ============ Inicialización ============ */

document.addEventListener('DOMContentLoaded', () => {
  // Cada vez que se entra a la app (login o refresh) siempre arranca en
  // plan Básico y en la pantalla Inicio, sin importar en qué quedó antes.
  setDevPlanOverride('basico');
  renderAll();

  /* Puerta de acceso: pestañas login / crear cuenta, y enlaces hacia recuperar contraseña */
  function mostrarAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.dataset.authForm === tab));
  }
  document.querySelectorAll('[data-auth-tab]').forEach(btn => {
    btn.addEventListener('click', () => mostrarAuthTab(btn.dataset.authTab));
  });

  /* Registro de usuario */
  document.getElementById('form-registro').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = document.getElementById('registro-nombre').value.trim();
    const correo = document.getElementById('registro-correo').value.trim();
    const password = document.getElementById('registro-password').value;
    const password2 = document.getElementById('registro-password2').value;
    const errorEl = document.getElementById('registro-error');
    errorEl.textContent = '';

    if (!nombre) { errorEl.textContent = 'Escribe tu nombre.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { errorEl.textContent = 'Escribe un correo válido.'; return; }
    if (password.length < 6) { errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (password !== password2) { errorEl.textContent = 'Las contraseñas no coinciden.'; return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    mostrarBienvenidaAlEntrar = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, correo, password);
      await updateProfile(cred.user, { displayName: nombre });
      await setDoc(usuarioRef(cred.user.uid), {
        nombre, correo, plan: 'basico', estado: 'activo',
        fechaAlta: serverTimestamp(), fechaActualizacion: serverTimestamp()
      });
    } catch (err) {
      mostrarBienvenidaAlEntrar = false;
      errorEl.textContent = mensajeErrorAuth(err.code);
    } finally {
      btn.disabled = false;
    }
  });

  /* Inicio de sesión */
  document.getElementById('form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const correo = document.getElementById('login-correo').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    mostrarBienvenidaAlEntrar = true;
    try {
      await signInWithEmailAndPassword(auth, correo, password);
    } catch (err) {
      mostrarBienvenidaAlEntrar = false;
      errorEl.textContent = mensajeErrorAuth(err.code);
    } finally {
      btn.disabled = false;
    }
  });

  /* Recuperar contraseña */
  document.getElementById('form-reset').addEventListener('submit', async e => {
    e.preventDefault();
    const correo = document.getElementById('reset-correo').value.trim();
    const msgEl = document.getElementById('reset-mensaje');
    msgEl.textContent = '';
    msgEl.className = 'auth-message';
    try {
      await sendPasswordResetEmail(auth, correo);
      msgEl.textContent = 'Listo. Revisa tu correo para restablecer tu contraseña.';
      msgEl.classList.add('auth-message--ok');
    } catch (err) {
      msgEl.textContent = mensajeErrorAuth(err.code);
      msgEl.classList.add('auth-message--error');
    }
  });

  /* Cerrar sesión */
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!await mostrarConfirmacion('¿Seguro que quieres cerrar sesión?')) return;
    signOut(auth);
  });

  /* Barra lateral: recordar si el usuario la dejó contraída o expandida.
     Si nunca la ha ajustado, arranca contraída en pantallas angostas para no
     quitarle espacio al contenido, y expandida en pantallas grandes. */
  const sidebar = document.getElementById('sidebar');
  const storedSidebarState = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  const shouldStartCollapsed = storedSidebarState === null
    ? window.innerWidth < 1024
    : storedSidebarState === 'true';
  if (shouldStartCollapsed) {
    sidebar.classList.add('collapsed');
  }
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed);
  });

  /* Grupos desplegables del sidebar (Producción / Ventas / Negocio) */
  document.querySelectorAll('.sidebar-group').forEach(grupo => {
    setGrupoColapsado(grupo.dataset.grupo, getGrupoColapsado(grupo.dataset.grupo));
  });
  document.querySelectorAll('.sidebar-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const grupo = header.closest('.sidebar-group');
      setGrupoColapsado(grupo.dataset.grupo, !grupo.classList.contains('collapsed'));
    });
  });
  expandirGrupoDeScreen(currentScreen);

  /* Barra lateral: abrir/cerrar arrastrando el borde con el dedo o el mouse.
     Solo se mueve mientras se arrastra; al soltar siempre cae en uno de los
     dos tamaños fijos (contraída o expandida), nunca queda en un ancho intermedio.
     Se usan eventos de mouse y touch por separado (no Pointer Events) por
     compatibilidad, y el seguimiento del arrastre se hace sobre "document"
     para que no se pierda si el dedo o el mouse se salen del mango. */
  const sidebarCollapsedWidth = 76;
  const getSidebarExpandedWidth = () => Math.min(190, window.innerWidth * 0.7);

  let dragStartX = 0;
  let dragStartWidth = 0;
  let isDraggingSidebar = false;

  const resizeHandle = document.getElementById('sidebar-resize-handle');

  function startSidebarDrag(clientX) {
    isDraggingSidebar = true;
    dragStartX = clientX;
    dragStartWidth = sidebar.getBoundingClientRect().width;
    sidebar.classList.add('dragging');
  }

  function moveSidebarDrag(clientX) {
    if (!isDraggingSidebar) return;
    const collapsedW = sidebarCollapsedWidth;
    const expandedW = getSidebarExpandedWidth();
    const delta = clientX - dragStartX;
    const newWidth = Math.min(expandedW, Math.max(collapsedW, dragStartWidth + delta));
    sidebar.style.width = `${newWidth}px`;
  }

  function endSidebarDrag() {
    if (!isDraggingSidebar) return;
    isDraggingSidebar = false;
    sidebar.classList.remove('dragging');

    const collapsedW = sidebarCollapsedWidth;
    const expandedW = getSidebarExpandedWidth();
    const currentWidth = sidebar.getBoundingClientRect().width;
    const shouldCollapse = (currentWidth - collapsedW) < (expandedW - currentWidth);

    sidebar.style.width = '';
    sidebar.classList.toggle('collapsed', shouldCollapse);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, shouldCollapse);
  }

  resizeHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    startSidebarDrag(e.clientX);
  });
  document.addEventListener('mousemove', e => moveSidebarDrag(e.clientX));
  document.addEventListener('mouseup', endSidebarDrag);

  resizeHandle.addEventListener('touchstart', e => {
    startSidebarDrag(e.touches[0].clientX);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!isDraggingSidebar) return;
    moveSidebarDrag(e.touches[0].clientX);
  }, { passive: true });
  document.addEventListener('touchend', endSidebarDrag);
  document.addEventListener('touchcancel', endSidebarDrag);

  /* Navegación (barra inferior en móvil/tablet y barra lateral en escritorio) */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
  });

  /* Tarjetas clickeables: abren el modal de detalle */
  document.querySelectorAll('[data-detail]').forEach(card => {
    card.addEventListener('click', () => openDetailModal(card.dataset.detail));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetailModal(card.dataset.detail);
      }
    });
  });

  /* Cierre del modal de detalle */
  document.getElementById('detail-close-x').addEventListener('click', closeDetailModal);
  document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
  document.getElementById('detail-overlay').addEventListener('click', e => {
    if (e.target.id === 'detail-overlay') closeDetailModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeDetailModal();
    if (document.getElementById('modal-overlay').classList.contains('open')) closeModal();
  });

  /* Accesos rápidos de Inicio */
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.goto;
      goToScreen(screen);
      if (screen === 'ventas') openVentaModal();
      if (screen === 'gastos') openGastoModal();
    });
  });

  /* Botón "Agregar" propio de cada pantalla */
  document.getElementById('btn-add-producto').addEventListener('click', () => openProductoModal());
  document.getElementById('btn-add-costeo').addEventListener('click', () => openCosteoModal());
  document.getElementById('btn-add-venta').addEventListener('click', () => openVentaModal());
  document.getElementById('btn-add-gasto').addEventListener('click', () => openGastoModal());

  /* Cierre de modales */
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  /* Pestañas de período en Resumen */
  document.querySelectorAll('.period-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPeriod = tab.dataset.periodo;
      renderResumen();
    });
  });

  /* Delegación de eventos para editar/eliminar en listas */
  document.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id, tipo } = btn.dataset;
    if (action === 'editar-producto') openProductoModal(id);
    if (action === 'eliminar-producto') eliminarProducto(id);
    if (action === 'editar-costeo') openEditCosteoForProduct(id);
    if (action === 'cambiar-modo-costeo') cambiarModoCosteo(id);
    if (action === 'eliminar-venta') eliminarVenta(id);
    if (action === 'eliminar-gasto') eliminarGasto(id);
    if (action === 'editar-insumo') openInsumoModal(id);
    if (action === 'eliminar-insumo') eliminarInsumo(id);
    if (action === 'editar-proveedor') openProveedorModal(id);
    if (action === 'eliminar-proveedor') eliminarProveedor(id);
    if (action === 'editar-cliente') openClienteModal(id);
    if (action === 'eliminar-cliente') eliminarCliente(id);
    if (action === 'editar-pedido') openPedidoModal(id);
    if (action === 'eliminar-pedido') eliminarPedido(id);
    if (action === 'toggle-estado-pedido') toggleEstadoPedido(id);
    if (action === 'editar-material') openMaterialModal(id);
    if (action === 'eliminar-material') eliminarMaterial(id);
    if (action === 'agregar-compra') abrirCompraModal(tipo, id);
    if (action === 'editar-envio') openEnvioModal(id);
    if (action === 'eliminar-envio') eliminarEnvio(id);
    if (action === 'toggle-estado-envio') toggleEstadoEnvio(id);
    if (action === 'editar-activo') openActivoModal(id);
    if (action === 'eliminar-activo') eliminarActivo(id);
    if (action === 'editar-cotizacion') openCotizacionModal(id);
    if (action === 'eliminar-cotizacion') eliminarCotizacion(id);
    if (action === 'toggle-comprado-cotizacion') toggleCompradoCotizacion(id);
  });

  /* Formulario: Producto */
  document.getElementById('form-producto').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('producto-id').value;
    const nombre = document.getElementById('producto-nombre').value.trim();
    const clave = document.getElementById('producto-clave').value.trim();
    const categoria = document.getElementById('producto-categoria').value.trim();
    const rendimiento = document.getElementById('producto-rendimiento').value.trim();
    const precioVenta = parseFloat(document.getElementById('producto-precio').value);
    if (!nombre || isNaN(precioVenta) || precioVenta < 0) return;

    if (id) {
      const p = data.productos.find(p => p.id === id);
      p.nombre = nombre;
      p.clave = clave;
      p.categoria = categoria;
      p.rendimiento = rendimiento;
      p.precioVenta = precioVenta;
      guardarProducto(p);
    } else {
      const nuevo = { id: uid(), nombre, clave, categoria, rendimiento, precioVenta };
      data.productos.push(nuevo);
      guardarProducto(nuevo);
    }
    closeModal();
    renderProductos();
    renderCosteo();
  });

  /* Formulario: Costeo */
  document.getElementById('costeo-producto-select').addEventListener('change', () => {
    cargarValoresCosteo(document.getElementById('costeo-producto-select').value);
  });
  ['costeo-materia-prima', 'costeo-empaque', 'costeo-mano-obra', 'costeo-otros'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewCosteo);
  });
  document.getElementById('form-costeo').addEventListener('submit', e => {
    e.preventDefault();
    const productoId = document.getElementById('costeo-producto-select').value;
    const materiaPrima = parseFloat(document.getElementById('costeo-materia-prima').value) || 0;
    const empaque = parseFloat(document.getElementById('costeo-empaque').value) || 0;
    const manoObra = parseFloat(document.getElementById('costeo-mano-obra').value) || 0;
    const otrosCostos = parseFloat(document.getElementById('costeo-otros').value) || 0;

    const existente = getCosteo(productoId);
    if (existente) {
      existente.materiaPrima = materiaPrima;
      existente.empaque = empaque;
      existente.manoObra = manoObra;
      existente.otrosCostos = otrosCostos;
      guardarCosteo(existente);
    } else {
      const nuevo = { productoId, materiaPrima, empaque, manoObra, otrosCostos };
      data.costeos.push(nuevo);
      guardarCosteo(nuevo);
    }
    closeModal();
    renderCosteo();
  });

  /* Formulario: Venta */
  document.getElementById('venta-producto-select').addEventListener('change', actualizarPreviewVenta);
  document.getElementById('venta-cantidad').addEventListener('input', actualizarPreviewVenta);
  document.getElementById('form-venta').addEventListener('submit', e => {
    e.preventDefault();
    const productoId = document.getElementById('venta-producto-select').value;
    const cantidad = parseInt(document.getElementById('venta-cantidad').value, 10);
    const fecha = document.getElementById('venta-fecha').value;
    const producto = data.productos.find(p => p.id === productoId);
    if (!producto || !cantidad || cantidad < 1 || !fecha) return;

    const costoUnitario = getCostoUnitarioProducto(productoId);
    const via = document.getElementById('venta-via').value;
    const clienteId = document.getElementById('venta-cliente-select').value;
    const cliente = clienteId ? getCliente(clienteId) : null;

    const consumoInsumos = consumoInsumosPorVenta(productoId, cantidad);

    const nuevaVenta = {
      id: uid(),
      folio: siguienteFolio('V', data.ventas),
      productoId,
      productoNombre: producto.nombre,
      cantidad,
      precioVentaUnitario: producto.precioVenta,
      costoTotalUnitario: costoUnitario,
      fecha,
      via,
      clienteId,
      clienteNombre: cliente ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') : '',
      consumoInsumos
    };
    data.ventas.push(nuevaVenta);
    guardarVenta(nuevaVenta);
    aplicarConsumoInsumos(consumoInsumos, -1);
    closeModal();
    renderVentas();
    renderInicio();
    renderInsumos();
    renderInventario();
  });

  /* Formulario: Pedido */
  document.getElementById('btn-add-pedido').addEventListener('click', () => openPedidoModal());
  ['pedido-total', 'pedido-anticipo'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewPedido);
  });
  document.getElementById('form-pedido').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('pedido-id').value;
    const descripcion = document.getElementById('pedido-descripcion').value.trim();
    const clienteId = document.getElementById('pedido-cliente-select').value;
    const cliente = clienteId ? getCliente(clienteId) : null;
    const fechaEntrega = document.getElementById('pedido-fecha-entrega').value;
    const total = parseFloat(document.getElementById('pedido-total').value);
    const anticipo = parseFloat(document.getElementById('pedido-anticipo').value) || 0;
    if (!descripcion || !fechaEntrega || isNaN(total) || total < 0) return;

    const clienteNombre = cliente ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') : '';

    if (id) {
      const p = getPedido(id);
      p.descripcion = descripcion;
      p.clienteId = clienteId;
      p.clienteNombre = clienteNombre;
      p.fechaEntrega = fechaEntrega;
      p.total = total;
      p.anticipo = anticipo;
      guardarPedido(p);
    } else {
      const nuevo = {
        id: uid(),
        folio: siguienteFolio('P', data.pedidos),
        descripcion,
        clienteId,
        clienteNombre,
        fechaEntrega,
        total,
        anticipo,
        estado: 'pendiente'
      };
      data.pedidos.push(nuevo);
      guardarPedido(nuevo);
    }
    closeModal();
    renderPedidos();
  });

  /* Formulario: Envío */
  document.getElementById('btn-add-envio').addEventListener('click', () => openEnvioModal());
  document.getElementById('form-envio').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('envio-id').value;
    const descripcion = document.getElementById('envio-descripcion').value.trim();
    const clienteId = document.getElementById('envio-cliente-select').value;
    const cliente = clienteId ? getCliente(clienteId) : null;
    const direccion = document.getElementById('envio-direccion').value.trim();
    const fecha = document.getElementById('envio-fecha').value;
    const repartidor = document.getElementById('envio-repartidor').value.trim();
    const costo = parseFloat(document.getElementById('envio-costo').value) || 0;
    if (!descripcion || !direccion || !fecha) return;

    const clienteNombre = cliente ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') : '';

    if (id) {
      const e2 = getEnvio(id);
      e2.descripcion = descripcion;
      e2.clienteId = clienteId;
      e2.clienteNombre = clienteNombre;
      e2.direccion = direccion;
      e2.fecha = fecha;
      e2.repartidor = repartidor;
      e2.costo = costo;
      guardarEnvio(e2);
    } else {
      const nuevo = { id: uid(), descripcion, clienteId, clienteNombre, direccion, fecha, repartidor, costo, estado: 'pendiente' };
      data.envios.push(nuevo);
      guardarEnvio(nuevo);
    }
    closeModal();
    renderEnvios();
  });

  /* Formulario: Gasto */
  document.getElementById('form-gasto').addEventListener('submit', e => {
    e.preventDefault();
    const concepto = document.getElementById('gasto-concepto').value.trim();
    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const categoria = document.getElementById('gasto-categoria').value;
    const fecha = document.getElementById('gasto-fecha').value;
    if (!concepto || isNaN(monto) || monto < 0 || !fecha) return;

    const nuevoGasto = { id: uid(), concepto, monto, categoria, fecha };
    data.gastos.push(nuevoGasto);
    guardarGasto(nuevoGasto);
    closeModal();
    renderGastos();
    renderInicio();
  });

  /* Formulario: Activos */
  document.getElementById('btn-add-activo').addEventListener('click', () => openActivoModal());
  document.getElementById('form-activo').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('activo-id').value;
    const nombre = document.getElementById('activo-nombre').value.trim();
    const modelo = document.getElementById('activo-modelo').value.trim();
    const costo = parseFloat(document.getElementById('activo-costo').value);
    const fecha = document.getElementById('activo-fecha').value;
    const proveedor = document.getElementById('activo-proveedor').value.trim();
    const observaciones = document.getElementById('activo-observaciones').value.trim();
    if (!nombre || isNaN(costo) || costo < 0) return;

    if (id) {
      const a = getActivo(id);
      a.nombre = nombre;
      a.modelo = modelo;
      a.costo = costo;
      a.fecha = fecha;
      a.proveedor = proveedor;
      a.observaciones = observaciones;
      guardarActivo(a);
    } else {
      const nuevo = { id: uid(), nombre, modelo, costo, fecha, proveedor, observaciones };
      data.activos.push(nuevo);
      guardarActivo(nuevo);
    }
    closeModal();
    renderActivos();
  });

  /* Formulario: Cotizaciones */
  document.getElementById('btn-add-cotizacion').addEventListener('click', () => openCotizacionModal());
  document.getElementById('btn-add-opcion-row').addEventListener('click', () => agregarFilaOpcion());
  document.getElementById('form-cotizacion').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('cotizacion-id').value;
    const articulo = document.getElementById('cotizacion-articulo').value.trim();
    const cantidad = parseInt(document.getElementById('cotizacion-cantidad').value, 10) || null;
    if (!articulo) return;

    const opciones = Array.from(document.querySelectorAll('#cotizacion-opciones .opcion-row')).map(row => {
      const proveedor = row.querySelector('.opcion-proveedor').value.trim();
      const telefono = row.querySelector('.opcion-telefono').value.trim();
      const costoVal = row.querySelector('.opcion-costo').value;
      const observaciones = row.querySelector('.opcion-observaciones').value.trim();
      return { proveedor, telefono, costo: costoVal === '' ? null : parseFloat(costoVal), observaciones };
    }).filter(o => o.proveedor || o.telefono || o.costo != null || o.observaciones);

    if (id) {
      const c = getCotizacion(id);
      c.articulo = articulo;
      c.cantidad = cantidad;
      c.opciones = opciones;
      guardarCotizacion(c);
    } else {
      const nuevo = { id: uid(), articulo, cantidad, opciones, comprado: false };
      data.cotizaciones.push(nuevo);
      guardarCotizacion(nuevo);
    }
    closeModal();
    renderCotizaciones();
  });

  /* Formulario: Proveedores */
  document.getElementById('btn-add-proveedor').addEventListener('click', () => openProveedorModal());
  document.getElementById('form-proveedor').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('proveedor-id').value;
    const nombre = document.getElementById('proveedor-nombre').value.trim();
    const contacto = document.getElementById('proveedor-contacto').value.trim();
    const telefono = document.getElementById('proveedor-telefono').value.trim();
    const domicilio = document.getElementById('proveedor-domicilio').value.trim();
    const horario = document.getElementById('proveedor-horario').value.trim();
    const observaciones = document.getElementById('proveedor-observaciones').value.trim();
    if (!nombre) return;

    if (id) {
      const p = getProveedor(id);
      p.nombre = nombre;
      p.contacto = contacto;
      p.telefono = telefono;
      p.domicilio = domicilio;
      p.horario = horario;
      p.observaciones = observaciones;
      guardarProveedor(p);
    } else {
      const nuevo = { id: uid(), nombre, contacto, telefono, domicilio, horario, observaciones };
      data.proveedores.push(nuevo);
      guardarProveedor(nuevo);
    }
    closeModal();
    renderProveedores();
  });

  /* Formulario: Clientes */
  document.getElementById('btn-add-cliente').addEventListener('click', () => openClienteModal());
  document.getElementById('form-cliente').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('cliente-id').value;
    const nombre = document.getElementById('cliente-nombre').value.trim();
    const apellido = document.getElementById('cliente-apellido').value.trim();
    const telefono = document.getElementById('cliente-telefono').value.trim();
    const celular = document.getElementById('cliente-celular').value.trim();
    const email = document.getElementById('cliente-email').value.trim();
    const fuente = document.getElementById('cliente-fuente').value;
    if (!nombre) return;

    if (id) {
      const c = getCliente(id);
      c.nombre = nombre;
      c.apellido = apellido;
      c.telefono = telefono;
      c.celular = celular;
      c.email = email;
      c.fuente = fuente;
      guardarCliente(c);
    } else {
      const nuevo = { id: uid(), nombre, apellido, telefono, celular, email, fuente };
      data.clientes.push(nuevo);
      guardarCliente(nuevo);
    }
    closeModal();
    renderClientes();
  });

  /* Formulario: Mis Insumos */
  document.getElementById('btn-add-insumo').addEventListener('click', () => openInsumoModal());
  ['insumo-unidad', 'insumo-cantidad', 'insumo-precio'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewInsumo);
    document.getElementById(id).addEventListener('change', actualizarPreviewInsumo);
  });
  document.getElementById('form-insumo').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('insumo-id').value;
    const nombre = document.getElementById('insumo-nombre').value.trim();
    const unidadCompra = document.getElementById('insumo-unidad').value;
    const categoria = categoriaDeUnidad(unidadCompra);
    const cantidadComprada = parseFloat(document.getElementById('insumo-cantidad').value);
    const precioPagado = parseFloat(document.getElementById('insumo-precio').value);
    const proveedor = document.getElementById('insumo-proveedor').value.trim();
    const marca = document.getElementById('insumo-marca').value.trim();
    const ticket = document.getElementById('insumo-ticket').value.trim();
    const fecha = document.getElementById('insumo-fecha').value;

    if (!nombre || isNaN(cantidadComprada) || cantidadComprada <= 0 || isNaN(precioPagado) || precioPagado < 0) return;

    if (id) {
      const i = getInsumo(id);
      i.nombre = nombre;
      i.unidadCompra = unidadCompra;
      i.categoria = categoria;
      i.cantidadComprada = cantidadComprada;
      i.precioPagado = precioPagado;
      i.proveedor = proveedor;
      i.marca = marca;
      i.ticket = ticket;
      i.fecha = fecha;
      guardarInsumo(i);
    } else {
      // La primera vez que se registra un insumo, esa cantidad comprada es
      // también su primera existencia. De ahí en adelante, subir existencia
      // se hace con "Agregar compra" en Inventario, no editando este formulario.
      const nuevo = { id: uid(), nombre, unidadCompra, categoria, cantidadComprada, precioPagado, proveedor, marca, ticket, fecha, existencia: cantidadComprada };
      data.insumos.push(nuevo);
      guardarInsumo(nuevo);
    }
    closeModal();
    renderInsumos();
    renderInventario();
  });

  /* Formulario: Materiales */
  document.getElementById('btn-add-material').addEventListener('click', () => openMaterialModal());
  ['material-cantidad', 'material-costo'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewMaterial);
  });
  document.getElementById('form-material').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('material-id').value;
    const nombre = document.getElementById('material-nombre').value.trim();
    const modelo = document.getElementById('material-modelo').value.trim();
    const especificaciones = document.getElementById('material-especificaciones').value.trim();
    const cantidadComprada = parseFloat(document.getElementById('material-cantidad').value);
    const costoTotal = parseFloat(document.getElementById('material-costo').value);
    const proveedor = document.getElementById('material-proveedor').value.trim();
    const ticket = document.getElementById('material-ticket').value.trim();
    const fecha = document.getElementById('material-fecha').value;

    if (!nombre || isNaN(cantidadComprada) || cantidadComprada <= 0 || isNaN(costoTotal) || costoTotal < 0) return;

    if (id) {
      const m = getMaterial(id);
      m.nombre = nombre;
      m.modelo = modelo;
      m.especificaciones = especificaciones;
      m.cantidadComprada = cantidadComprada;
      m.costoTotal = costoTotal;
      m.proveedor = proveedor;
      m.ticket = ticket;
      m.fecha = fecha;
      guardarMaterial(m);
    } else {
      // Igual que con Insumos: la primera compra es la existencia inicial;
      // de ahí en adelante se sube con "Agregar compra" en Inventario.
      const nuevo = { id: uid(), nombre, modelo, especificaciones, cantidadComprada, costoTotal, proveedor, ticket, fecha, existencia: cantidadComprada };
      data.materiales.push(nuevo);
      guardarMaterial(nuevo);
    }
    closeModal();
    renderMateriales();
    renderInventario();
  });

  /* Formulario: Agregar compra (Inventario) */
  document.getElementById('compra-cantidad').addEventListener('input', actualizarPreviewCompra);
  document.getElementById('form-compra').addEventListener('submit', e => {
    e.preventDefault();
    const tipo = document.getElementById('compra-tipo').value;
    const id = document.getElementById('compra-id').value;
    const cantidad = parseFloat(document.getElementById('compra-cantidad').value);
    const fecha = document.getElementById('compra-fecha').value;
    if (isNaN(cantidad) || cantidad <= 0 || !fecha) return;

    if (tipo === 'material') {
      const m = getMaterial(id);
      if (!m) return;
      m.existencia = (typeof m.existencia === 'number' ? m.existencia : 0) + cantidad;
      guardarMaterial(m);
      renderMateriales();
    } else {
      const i = getInsumo(id);
      if (!i) return;
      i.existencia = (typeof i.existencia === 'number' ? i.existencia : 0) + cantidad;
      guardarInsumo(i);
      renderInsumos();
    }
    closeModal();
    renderInventario();
  });

  /* Formulario: Costeo Detallado */
  document.getElementById('btn-add-insumo-row').addEventListener('click', () => {
    agregarFilaInsumo();
    actualizarPreviewCosteoDetallado();
  });
  ['costeo-detallado-empaque', 'costeo-detallado-mano-obra', 'costeo-detallado-rendimiento'].forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarPreviewCosteoDetallado);
  });
  document.getElementById('form-costeo-detallado').addEventListener('submit', e => {
    e.preventDefault();
    const productoId = document.getElementById('costeo-detallado-producto-id').value;
    const items = leerFilasInsumo();
    const empaque = parseFloat(document.getElementById('costeo-detallado-empaque').value) || 0;
    const manoObra = parseFloat(document.getElementById('costeo-detallado-mano-obra').value) || 0;
    const rendimiento = parseFloat(document.getElementById('costeo-detallado-rendimiento').value) || 0;

    const existente = getCosteoDetallado(productoId);
    if (existente) {
      existente.items = items;
      existente.empaque = empaque;
      existente.manoObra = manoObra;
      existente.rendimiento = rendimiento;
      guardarCosteoDetallado(existente);
    } else {
      const nuevo = { productoId, items, empaque, manoObra, rendimiento };
      data.costeoDetallado.push(nuevo);
      guardarCosteoDetallado(nuevo);
    }
    closeModal();
    renderCosteo();
  });

  /* Mi Plan: un usuario normal solo puede conocer SANE Pro (pantalla comercial),
     nunca activarse Pro él mismo. El único cambio de plan real hasta ahora es
     manual, vía el panel administrativo (sin permisos reales todavía). */
  document.getElementById('btn-activar-pro').addEventListener('click', () => {
    goToScreen('sane-pro');
  });

  /* Aviso elegante de límite de plan alcanzado */
  document.getElementById('limite-plan-cerrar').addEventListener('click', () => {
    document.getElementById('limite-plan-overlay').classList.remove('open');
  });
  document.getElementById('limite-plan-conocer').addEventListener('click', () => {
    document.getElementById('limite-plan-overlay').classList.remove('open');
    goToScreen('sane-pro');
  });

  /* Diálogos propios de confirmación y aviso */
  document.getElementById('confirm-cancelar').addEventListener('click', () => cerrarConfirmacion(false));
  document.getElementById('confirm-aceptar').addEventListener('click', () => cerrarConfirmacion(true));
  document.getElementById('aviso-cerrar').addEventListener('click', () => cerrarAviso());

  /* Interruptor Básico/Pro de desarrollo: solo para pruebas, separado del
     plan real guardado en Firestore (no escribe nada en la nube). */
  function actualizarPlanDevToggleUI() {
    const override = getDevPlanOverride();
    document.querySelectorAll('.plan-dev-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.plan === override);
    });
  }
  document.querySelectorAll('.plan-dev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDevPlanOverride(btn.dataset.plan);
      actualizarPlanDevToggleUI();
      renderCurrentScreen();
    });
  });
  actualizarPlanDevToggleUI();

  /* Panel administrativo (estructura preliminar, sin permisos reales todavía):
     por ahora las reglas de Firestore solo permiten leer/escribir la propia
     cuenta, así que únicamente funciona buscando tu propio correo. */
  document.getElementById('btn-admin-buscar').addEventListener('click', async () => {
    const correo = document.getElementById('admin-plan-correo').value.trim().toLowerCase();
    const mensajeEl = document.getElementById('admin-plan-mensaje');
    const resultadoEl = document.getElementById('admin-plan-resultado');
    mensajeEl.textContent = '';
    resultadoEl.classList.remove('mostrar');

    if (!correo) { mensajeEl.textContent = 'Escribe un correo.'; return; }

    if (correo !== (currentUser.email || '').toLowerCase()) {
      mensajeEl.textContent = 'Todavía no se pueden administrar otras cuentas: hace falta activar permisos de administrador en una fase futura. Por ahora puedes probar los cambios con tu propia cuenta.';
      return;
    }

    document.getElementById('admin-plan-nombre-encontrado').textContent =
      (data.usuario && data.usuario.nombre) || currentUser.email;
    actualizarAdminPlanPillsUI();
    resultadoEl.classList.add('mostrar');
  });

  function actualizarAdminPlanPillsUI() {
    const modo = getPlanMode();
    const estado = getEstadoPlan();
    const valorActivo = estado !== 'activo' ? estado : modo;
    document.querySelectorAll('.admin-plan-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.valor === valorActivo);
    });
  }

  document.querySelectorAll('.admin-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const valor = btn.dataset.valor;
      const cambios = { fechaActualizacionPlan: serverTimestamp() };
      if (valor === 'basico' || valor === 'pro') {
        cambios.plan = valor;
        cambios.estadoPlan = 'activo';
      } else {
        cambios.estadoPlan = valor;
      }
      await setDoc(usuarioRef(currentUser.uid), cambios, { merge: true });
      actualizarAdminPlanPillsUI();
    });
  });

  /* Botones hacia la pantalla SANE Pro y de regreso a Inicio */
  document.querySelectorAll('[data-goto-sane-pro]').forEach(btn => {
    btn.addEventListener('click', () => goToScreen('sane-pro'));
  });
  document.querySelectorAll('[data-goto-inicio]').forEach(btn => {
    btn.addEventListener('click', () => goToScreen('inicio'));
  });

  /* Borrar todos los datos y empezar desde cero */
  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    if (!await mostrarConfirmacion('¿Seguro que quieres borrar todos tus datos y empezar desde cero? No podrás recuperarlos.')) return;
    const batch = writeBatch(db);
    data.productos.forEach(p => batch.delete(documentoRef(currentUser.uid, 'productos', p.id)));
    data.insumos.forEach(i => batch.delete(documentoRef(currentUser.uid, 'insumos', i.id)));
    data.costeos.forEach(c => batch.delete(documentoRef(currentUser.uid, 'costeos', c.productoId)));
    data.costeoDetallado.forEach(c => batch.delete(documentoRef(currentUser.uid, 'costeoDetallado', c.productoId)));
    data.ventas.forEach(v => batch.delete(documentoRef(currentUser.uid, 'ventas', v.id)));
    data.gastos.forEach(g => batch.delete(documentoRef(currentUser.uid, 'gastos', g.id)));
    await batch.commit();
    vaciarData();
    renderAll();
  });
});
