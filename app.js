/* SANE - Sistema Administrativo para Nuevos Emprendedores (desarrollado por App Servis)
   FASE 2: cuentas reales (Firebase Authentication) y datos en la nube (Cloud Firestore).
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
const PLAN_STORAGE_KEY = 'saneAppServis_plan_dev';

let currentScreen = 'inicio';
let currentPeriod = 'dia';
let insumoRowCounter = 0;
let currentUser = null;
let dataUnsubscribers = [];

/* ============ Iconos (SVG en línea, sin emojis ni imágenes externas) ============ */

const ICON_PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l.9-3.6L16.4 5a1.5 1.5 0 0 1 2.1 0l1.5 1.5a1.5 1.5 0 0 1 0 2.1L8.5 20.1 4 20z"/><path d="M14.5 6.5l3 3"/></svg>';

const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7"/><path d="M6.5 7l.7 12.2c0 .95.8 1.8 1.8 1.8h6c1 0 1.8-.85 1.8-1.8L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>';

/* ============ Utilidades generales ============ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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

let data = { productos: [], costeos: [], ventas: [], gastos: [], insumos: [], costeoDetallado: [] };

function vaciarData() {
  data = { productos: [], costeos: [], ventas: [], gastos: [], insumos: [], costeoDetallado: [] };
}

/* ============ Persistencia en Firestore (usuarios/{uid}/...) ============ */

const COLECCIONES = ['productos', 'insumos', 'costeos', 'costeoDetallado', 'ventas', 'gastos'];

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

/* Escucha en tiempo real las 6 colecciones del usuario: cualquier cambio (hecho desde
   este dispositivo o desde otro) actualiza "data" y vuelve a dibujar la pantalla.
   Así se logra la sincronización automática, sin botón "Guardar". */
function attachDataListeners(uid) {
  detachDataListeners();
  const primerasCargas = COLECCIONES.map(nombre => new Promise(resolve => {
    let yaResolvio = false;
    const unsub = onSnapshot(coleccionRef(uid, nombre), snap => {
      data[nombre] = snap.docs.map(d => d.data());
      renderAll();
      if (!yaResolvio) { yaResolvio = true; resolve(); }
    });
    dataUnsubscribers.push(unsub);
  }));
  document.getElementById('data-loading-overlay').classList.add('open');
  Promise.all(primerasCargas).then(() => {
    document.getElementById('data-loading-overlay').classList.remove('open');
  });
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

/* ---- Modo Básico / Pro (interruptor solo para desarrollo) ---- */

function getPlanMode() {
  return localStorage.getItem(PLAN_STORAGE_KEY) === 'pro' ? 'pro' : 'basico';
}

function isPro() {
  return getPlanMode() === 'pro';
}

function setPlanMode(mode) {
  localStorage.setItem(PLAN_STORAGE_KEY, mode);
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

function goToScreen(screen) {
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === screen));
  renderCurrentScreen();
}

function renderCurrentScreen() {
  if (currentScreen === 'inicio') renderInicio();
  if (currentScreen === 'productos') renderProductos();
  if (currentScreen === 'insumos') renderInsumos();
  if (currentScreen === 'costeo') renderCosteo();
  if (currentScreen === 'ventas') renderVentas();
  if (currentScreen === 'gastos') renderGastos();
  if (currentScreen === 'resumen') renderResumen();
}

function renderAll() {
  renderInicio();
  renderProductos();
  renderInsumos();
  renderCosteo();
  renderVentas();
  renderGastos();
  renderResumen();
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

  lista.innerHTML = data.productos.map(p => `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(p.nombre)}</span>
        <span class="item-subtitle">${formatCurrency(p.precioVenta)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="editar-producto" data-id="${p.id}" aria-label="Editar">${ICON_PENCIL}</button>
        <button type="button" class="icon-btn" data-action="eliminar-producto" data-id="${p.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `).join('');
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

  lista.innerHTML = ventasOrdenadas.map(v => `
    <li class="item-card">
      <div class="item-info">
        <span class="item-title">${escapeHtml(v.productoNombre)} × ${v.cantidad}</span>
        <span class="item-subtitle">${formatDate(v.fecha)} · ${formatCurrency(v.cantidad * v.precioVentaUnitario)}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="icon-btn" data-action="eliminar-venta" data-id="${v.id}" aria-label="Eliminar">${ICON_TRASH}</button>
      </div>
    </li>
  `).join('');
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
  const form = document.getElementById('form-producto');
  form.reset();
  document.getElementById('producto-id').value = '';

  if (id) {
    const p = data.productos.find(p => p.id === id);
    if (p) {
      document.getElementById('producto-id').value = p.id;
      document.getElementById('producto-nombre').value = p.nombre;
      document.getElementById('producto-precio').value = p.precioVenta;
    }
  }
  openModal('producto');
}

function openCosteoModal(productoId = null) {
  if (data.productos.length === 0) {
    alert('Primero agrega al menos un producto en la pestaña Productos.');
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
    }
  }
  actualizarPreviewInsumo();
  openModal('insumo');
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
  if (data.productos.length === 0) {
    alert('Primero agrega al menos un producto en la pestaña Productos.');
    return;
  }
  const select = document.getElementById('venta-producto-select');
  select.innerHTML = data.productos.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)}</option>`).join('');
  document.getElementById('venta-cantidad').value = 1;
  document.getElementById('venta-fecha').value = todayStr();
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

/* ============ Acciones: eliminar ============ */

function eliminarProducto(id) {
  if (!confirm('¿Seguro que quieres borrar este producto? No podrás recuperarlo.')) return;
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

function eliminarInsumo(id) {
  if (!confirm('¿Seguro que quieres borrar este insumo? No podrás recuperarlo.')) return;
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

function eliminarVenta(id) {
  if (!confirm('¿Seguro que quieres borrar esta venta?')) return;
  data.ventas = data.ventas.filter(v => v.id !== id);
  borrarVentaRemoto(id);
  renderVentas();
  renderInicio();
}

function eliminarGasto(id) {
  if (!confirm('¿Seguro que quieres borrar este gasto?')) return;
  data.gastos = data.gastos.filter(g => g.id !== id);
  borrarGastoRemoto(id);
  renderGastos();
  renderInicio();
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
      fechaActualizacion: serverTimestamp()
    });
  }
}

function actualizarAccountBarUI(user) {
  document.getElementById('account-bar-nombre').textContent = user.displayName || user.email || '';
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

/* Reacciona a cualquier cambio de sesión: entrar, salir, o que Firebase confirme
   al cargar la página si ya había una sesión guardada en este dispositivo. */
/* El logo de la pantalla de carga se "dibuja" de abajo hacia arriba durante
   este tiempo; se espera a que termine antes de dejar entrar al usuario,
   sin importar qué tan rápido responda Firebase. */
const SPLASH_MINIMO_MS = 1900;
const splashMinimo = new Promise(resolve => setTimeout(resolve, SPLASH_MINIMO_MS));

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    await ensureUserDoc(user);
    attachDataListeners(user.uid);
    await splashMinimo;
    document.body.classList.remove('state-loading', 'state-auth');
    document.body.classList.add('state-app');
    actualizarAccountBarUI(user);
    checkMigration(user.uid);
  } else {
    currentUser = null;
    detachDataListeners();
    vaciarData();
    await splashMinimo;
    document.body.classList.remove('state-loading', 'state-app');
    document.body.classList.add('state-auth');
    renderAll();
  }
});

/* ============ Inicialización ============ */

document.addEventListener('DOMContentLoaded', () => {
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
    try {
      const cred = await createUserWithEmailAndPassword(auth, correo, password);
      await updateProfile(cred.user, { displayName: nombre });
      await setDoc(usuarioRef(cred.user.uid), {
        nombre, correo, plan: 'basico', estado: 'activo',
        fechaAlta: serverTimestamp(), fechaActualizacion: serverTimestamp()
      });
    } catch (err) {
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
    try {
      await signInWithEmailAndPassword(auth, correo, password);
    } catch (err) {
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
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (!confirm('¿Seguro que quieres cerrar sesión?')) return;
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
    const { action, id } = btn.dataset;
    if (action === 'editar-producto') openProductoModal(id);
    if (action === 'eliminar-producto') eliminarProducto(id);
    if (action === 'editar-costeo') openEditCosteoForProduct(id);
    if (action === 'cambiar-modo-costeo') cambiarModoCosteo(id);
    if (action === 'eliminar-venta') eliminarVenta(id);
    if (action === 'eliminar-gasto') eliminarGasto(id);
    if (action === 'editar-insumo') openInsumoModal(id);
    if (action === 'eliminar-insumo') eliminarInsumo(id);
  });

  /* Formulario: Producto */
  document.getElementById('form-producto').addEventListener('submit', e => {
    e.preventDefault();
    const id = document.getElementById('producto-id').value;
    const nombre = document.getElementById('producto-nombre').value.trim();
    const precioVenta = parseFloat(document.getElementById('producto-precio').value);
    if (!nombre || isNaN(precioVenta) || precioVenta < 0) return;

    if (id) {
      const p = data.productos.find(p => p.id === id);
      p.nombre = nombre;
      p.precioVenta = precioVenta;
      guardarProducto(p);
    } else {
      const nuevo = { id: uid(), nombre, precioVenta };
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

    const nuevaVenta = {
      id: uid(),
      productoId,
      productoNombre: producto.nombre,
      cantidad,
      precioVentaUnitario: producto.precioVenta,
      costoTotalUnitario: costoUnitario,
      fecha
    };
    data.ventas.push(nuevaVenta);
    guardarVenta(nuevaVenta);
    closeModal();
    renderVentas();
    renderInicio();
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

    if (!nombre || isNaN(cantidadComprada) || cantidadComprada <= 0 || isNaN(precioPagado) || precioPagado < 0) return;

    if (id) {
      const i = getInsumo(id);
      i.nombre = nombre;
      i.unidadCompra = unidadCompra;
      i.categoria = categoria;
      i.cantidadComprada = cantidadComprada;
      i.precioPagado = precioPagado;
      i.proveedor = proveedor;
      guardarInsumo(i);
    } else {
      const nuevo = { id: uid(), nombre, unidadCompra, categoria, cantidadComprada, precioPagado, proveedor };
      data.insumos.push(nuevo);
      guardarInsumo(nuevo);
    }
    closeModal();
    renderInsumos();
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

  /* Interruptor Básico/Pro (solo para desarrollo) */
  function actualizarPlanDevToggleUI() {
    const modo = getPlanMode();
    document.querySelectorAll('.plan-dev-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.plan === modo);
    });
  }
  document.querySelectorAll('.plan-dev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setPlanMode(btn.dataset.plan);
      actualizarPlanDevToggleUI();
      renderCurrentScreen();
    });
  });
  actualizarPlanDevToggleUI();

  /* Botones hacia la pantalla SANE Pro y de regreso a Inicio */
  document.querySelectorAll('[data-goto-sane-pro]').forEach(btn => {
    btn.addEventListener('click', () => goToScreen('sane-pro'));
  });
  document.querySelectorAll('[data-goto-inicio]').forEach(btn => {
    btn.addEventListener('click', () => goToScreen('inicio'));
  });

  /* Borrar todos los datos y empezar desde cero */
  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    if (!confirm('¿Seguro que quieres borrar todos tus datos y empezar desde cero? No podrás recuperarlos.')) return;
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
