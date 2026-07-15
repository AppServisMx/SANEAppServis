/* SANE - Sistema Administrativo para Nuevos Emprendedores (desarrollado por App Servis)
   Almacenamiento: localStorage. Sin frameworks, sin librerías externas. */

const STORAGE_KEY = 'emprendedoresAppServis_v1';
const SIDEBAR_STORAGE_KEY = 'emprendedoresAppServis_sidebar_collapsed';

let currentScreen = 'inicio';
let currentPeriod = 'dia';

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

  return { productos, costeos, ventas, gastos };
}

/* ============ Persistencia ============ */

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const demo = getDefaultData();
    saveData(demo);
    return demo;
  }
  return JSON.parse(raw);
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
  if (currentScreen === 'costeo') renderCosteo();
  if (currentScreen === 'ventas') renderVentas();
  if (currentScreen === 'gastos') renderGastos();
  if (currentScreen === 'resumen') renderResumen();
}

function renderAll() {
  renderInicio();
  renderProductos();
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
    const c = getCosteo(p.id);
    const subtitle = c ? `Te cuesta hacerlo: ${formatCurrency(costoTotalUnitario(c))}` : 'Aún no sabes cuánto te cuesta';
    return `
      <li class="item-card">
        <div class="item-info">
          <span class="item-title">${escapeHtml(p.nombre)}</span>
          <span class="item-subtitle">${subtitle}</span>
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
  const costeo = producto ? getCosteo(producto.id) : null;
  if (producto && !costeo) {
    hint.textContent = 'Aún no sabes cuánto te cuesta este producto. Por ahora se usará $0.00.';
  } else if (producto && costeo) {
    hint.textContent = `Te cuesta hacerlo: ${formatCurrency(costoTotalUnitario(costeo))}`;
  } else {
    hint.textContent = '';
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
  saveData(data);
  renderProductos();
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

  /* Navegación (barra inferior en móvil/tablet y barra lateral en escritorio) */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => goToScreen(btn.dataset.screen));
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
    if (action === 'editar-costeo') openCosteoModal(id);
    if (action === 'eliminar-venta') eliminarVenta(id);
    if (action === 'eliminar-gasto') eliminarGasto(id);
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

    const costeo = getCosteo(productoId);
    const costoUnitario = costeo ? costoTotalUnitario(costeo) : 0;

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

  /* Borrar datos de demostración */
  document.getElementById('btn-reset-demo').addEventListener('click', () => {
    if (!confirm('¿Seguro que quieres borrar estos datos de ejemplo y empezar desde cero? No podrás recuperarlos.')) return;
    data = { productos: [], costeos: [], ventas: [], gastos: [] };
    saveData(data);
    renderAll();
  });
});
