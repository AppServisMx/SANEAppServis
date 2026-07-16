/* SANE - Sistema Administrativo para Nuevos Emprendedores (desarrollado por App Servis)
   Almacenamiento: localStorage. Sin frameworks, sin librerías externas. */

const STORAGE_KEY = 'emprendedoresAppServis_v1';
const SIDEBAR_STORAGE_KEY = 'emprendedoresAppServis_sidebar_collapsed';
const PLAN_STORAGE_KEY = 'saneAppServis_plan_dev';

let currentScreen = 'inicio';
let currentPeriod = 'dia';
let insumoRowCounter = 0;

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

/* ============ Datos de demostración ============ */

function getDefaultData() {
  // Negocio de ejemplo: "Dulces Detalles", venta de pasteles, gelatinas y arreglos de dulces.
  const p1 = uid();
  const p2 = uid();
  const p3 = uid();

  const productos = [
    { id: p1, nombre: 'Pastel de chocolate', precioVenta: 180 },
    { id: p2, nombre: 'Gelatinas de mosaico (paquete de 6)', precioVenta: 90 },
    { id: p3, nombre: 'Arreglo de dulces', precioVenta: 150 }
  ];

  const costeos = [
    { productoId: p1, materiaPrima: 45, empaque: 8, manoObra: 30, otrosCostos: 5 },
    { productoId: p2, materiaPrima: 25, empaque: 5, manoObra: 15, otrosCostos: 3 },
    { productoId: p3, materiaPrima: 60, empaque: 10, manoObra: 20, otrosCostos: 5 }
  ];

  const ventas = [
    { id: uid(), productoId: p1, productoNombre: productos[0].nombre, cantidad: 1, precioVentaUnitario: 180, costoTotalUnitario: 88, fecha: offsetDateStr(0) },
    { id: uid(), productoId: p2, productoNombre: productos[1].nombre, cantidad: 2, precioVentaUnitario: 90, costoTotalUnitario: 48, fecha: offsetDateStr(0) },
    { id: uid(), productoId: p3, productoNombre: productos[2].nombre, cantidad: 1, precioVentaUnitario: 150, costoTotalUnitario: 95, fecha: offsetDateStr(1) },
    { id: uid(), productoId: p1, productoNombre: productos[0].nombre, cantidad: 1, precioVentaUnitario: 180, costoTotalUnitario: 88, fecha: offsetDateStr(3) },
    { id: uid(), productoId: p2, productoNombre: productos[1].nombre, cantidad: 3, precioVentaUnitario: 90, costoTotalUnitario: 48, fecha: offsetDateStr(6) },
    { id: uid(), productoId: p3, productoNombre: productos[2].nombre, cantidad: 2, precioVentaUnitario: 150, costoTotalUnitario: 95, fecha: offsetDateStr(10) }
  ];

  const gastos = [
    { id: uid(), concepto: 'Gasolina para entregas', monto: 100, categoria: 'gasolina', fecha: offsetDateStr(0) },
    { id: uid(), concepto: 'Internet del mes', monto: 300, categoria: 'internet', fecha: offsetDateStr(2) },
    { id: uid(), concepto: 'Renta del local', monto: 1500, categoria: 'renta', fecha: offsetDateStr(8) },
    { id: uid(), concepto: 'Anuncios en redes sociales', monto: 250, categoria: 'publicidad', fecha: offsetDateStr(12) }
  ];

  // Insumos de ejemplo (función Pro): lo que se compra para hacer los productos.
  const insumos = [
    { id: uid(), nombre: 'Harina', categoria: 'masa', unidadCompra: 'kg', cantidadComprada: 1, precioPagado: 25, proveedor: 'Central de abastos' },
    { id: uid(), nombre: 'Chocolate', categoria: 'masa', unidadCompra: 'kg', cantidadComprada: 1, precioPagado: 120, proveedor: '' },
    { id: uid(), nombre: 'Leche', categoria: 'volumen', unidadCompra: 'lt', cantidadComprada: 1, precioPagado: 22, proveedor: '' },
    { id: uid(), nombre: 'Huevo', categoria: 'pieza', unidadCompra: 'pza', cantidadComprada: 12, precioPagado: 42, proveedor: '' }
  ];

  const costeoDetallado = [];

  return { productos, costeos, ventas, gastos, insumos, costeoDetallado };
}

/* ============ Persistencia ============ */

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = getDefaultData();
    saveData(demo);
    return demo;
  }
  const parsed = JSON.parse(raw);
  // Compatibilidad con datos guardados antes de que existiera Mis Insumos / Costeo Detallado.
  if (!parsed.insumos) parsed.insumos = [];
  if (!parsed.costeoDetallado) parsed.costeoDetallado = [];
  return parsed;
}

function saveData(d) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

let data = loadData();

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
    saveData(data);
    renderCosteo();
    openCosteoDetalladoModal(productoId);
  } else {
    producto.usaCosteoDetallado = false;
    saveData(data);
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
  data.productos = data.productos.filter(p => p.id !== id);
  data.costeos = data.costeos.filter(c => c.productoId !== id);
  data.costeoDetallado = data.costeoDetallado.filter(c => c.productoId !== id);
  saveData(data);
  renderProductos();
  renderCosteo();
}

function eliminarInsumo(id) {
  if (!confirm('¿Seguro que quieres borrar este insumo? No podrás recuperarlo.')) return;
  data.insumos = data.insumos.filter(i => i.id !== id);
  data.costeoDetallado.forEach(cd => {
    cd.items = cd.items.filter(item => item.insumoId !== id);
  });
  saveData(data);
  renderInsumos();
  renderCosteo();
}

function eliminarVenta(id) {
  if (!confirm('¿Seguro que quieres borrar esta venta?')) return;
  data.ventas = data.ventas.filter(v => v.id !== id);
  saveData(data);
  renderVentas();
  renderInicio();
}

function eliminarGasto(id) {
  if (!confirm('¿Seguro que quieres borrar este gasto?')) return;
  data.gastos = data.gastos.filter(g => g.id !== id);
  saveData(data);
  renderGastos();
  renderInicio();
}

/* ============ Inicialización ============ */

document.addEventListener('DOMContentLoaded', () => {
  renderAll();

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
    } else {
      data.productos.push({ id: uid(), nombre, precioVenta });
    }
    saveData(data);
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
    } else {
      data.costeos.push({ productoId, materiaPrima, empaque, manoObra, otrosCostos });
    }
    saveData(data);
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

    data.ventas.push({
      id: uid(),
      productoId,
      productoNombre: producto.nombre,
      cantidad,
      precioVentaUnitario: producto.precioVenta,
      costoTotalUnitario: costoUnitario,
      fecha
    });
    saveData(data);
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

    data.gastos.push({ id: uid(), concepto, monto, categoria, fecha });
    saveData(data);
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
    } else {
      data.insumos.push({ id: uid(), nombre, unidadCompra, categoria, cantidadComprada, precioPagado, proveedor });
    }
    saveData(data);
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
    } else {
      data.costeoDetallado.push({ productoId, items, empaque, manoObra, rendimiento });
    }
    saveData(data);
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

  /* Borrar datos de demostración */
  document.getElementById('btn-reset-demo').addEventListener('click', () => {
    if (!confirm('¿Seguro que quieres borrar estos datos de ejemplo y empezar desde cero? No podrás recuperarlos.')) return;
    data = { productos: [], costeos: [], ventas: [], gastos: [], insumos: [], costeoDetallado: [] };
    saveData(data);
    renderAll();
  });
});
