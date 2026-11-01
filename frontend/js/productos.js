const POR_PAGINA = 10;
const TIPO = { unidad: 'Unidad', blister: 'Blíster', caja: 'Caja' };
const ESTADO = {
  en_stock: ['chip-verde', 'Disponible'],
  stock_bajo: ['chip-stock_bajo', 'Stock bajo'],
  agotado: ['chip-rojo', 'Agotado'],
  inactivo: ['chip-gris', 'Inactivo'],
};

let productos = [];
let categorias = [];
let pagina = 1;
let editando = null; // producto en edición, o null si es nuevo
let esAdmin = false;

const $ = (id) => document.getElementById(id);
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const estadoDe = (p) => (p.activo ? p.estado_stock : 'inactivo');
const etiquetaPres = (p) => TIPO[p.tipo] + (p.unidades > 1 ? ` ×${p.unidades}` : '');

const ICO = {
  ver: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  editar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  quitar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>',
  activar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>',
};

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

async function cargarTodos() {
  const todos = [];
  let total = 0;
  do {
    const r = await api(`productos.php?incluir_inactivos=1&limit=200&offset=${todos.length}`);
    total = r.total;
    todos.push(...r.productos);
    if (!r.productos.length) break;
  } while (todos.length < total);
  return todos;
}

async function cargar() {
  try {
    const [lista, ca] = await Promise.all([cargarTodos(), api('categorias.php')]);
    productos = lista;
    categorias = ca.categorias;
    if (!$('f-cat').options[1]) {
      $('f-cat').innerHTML += categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
      $('categoria').innerHTML = categorias.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    }
    dibujar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar los productos. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function filtrados() {
  const q = sinTildes($('q').value.trim());
  const cat = Number($('f-cat').value) || 0;
  const est = $('f-estado').value;
  return productos.filter((p) => {
    if (cat && p.categoria_id !== cat) return false;
    if (est && estadoDe(p) !== est) return false;
    if (!q) return true;
    return [p.nombre, p.generico, p.laboratorio, p.codigo_barras].some((t) => sinTildes(t).includes(q));
  });
}

function dibujar() {
  const lista = filtrados();
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  const desde = (pagina - 1) * POR_PAGINA;
  const vista = lista.slice(desde, desde + POR_PAGINA);

  if (!vista.length) {
    $('tabla').innerHTML = `<p class="vacio">${productos.length ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos registrados.'}</p>`;
    $('paginacion').innerHTML = '';
    return;
  }

  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Código</th><th>Producto</th><th>Genérico</th><th>Laboratorio</th><th>Categoría</th><th class="der">Stock</th><th>Estado</th><th class="cen">Acciones</th></tr></thead>
    <tbody>${vista.map((p) => {
      const [clase, texto] = ESTADO[estadoDe(p)];
      return `<tr class="${p.activo ? '' : 'inactivo'}">
        <td>${esc(p.codigo_barras)}</td>
        <td><div class="prod-celda">${p.imagen ? `<img class="miniatura" src="img/productos/${esc(p.imagen)}" alt="" loading="lazy">` : '<span class="miniatura vacia"></span>'}<span><strong>${esc(p.nombre)}</strong>${p.requiere_receta ? ' <span class="rx">Receta</span>' : ''}</span></div></td>
        <td>${esc(p.generico) || '—'}</td>
        <td>${esc(p.laboratorio) || '—'}</td>
        <td>${esc(p.categoria)}</td>
        <td class="der"><b>${p.stock_vigente}</b></td>
        <td><span class="chip ${clase}">${texto}</span></td>
        <td class="acciones">
          <button class="icono-btn" data-acc="ver" data-id="${p.id}" title="Ver detalle" aria-label="Ver ${esc(p.nombre)}">${ICO.ver}</button>
          <button class="icono-btn" data-acc="editar" data-id="${p.id}" title="Editar" aria-label="Editar ${esc(p.nombre)}">${ICO.editar}</button>
          <button class="icono-btn ${p.activo ? 'peligro' : 'bien'}" data-acc="estado" data-id="${p.id}" title="${p.activo ? 'Desactivar' : 'Reactivar'}" aria-label="${p.activo ? 'Desactivar' : 'Reactivar'} ${esc(p.nombre)}">${p.activo ? ICO.quitar : ICO.activar}</button>
        </td></tr>`;
    }).join('')}</tbody></table></div>`;

  let btns = '';
  for (let i = 1; i <= paginas; i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + vista.length} de ${lista.length}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

/* Detalle */
async function verProducto(p) {
  $('m-ver-t').textContent = p.nombre;
  const [clase, texto] = ESTADO[estadoDe(p)];
  $('ver-cuerpo').innerHTML = (p.imagen ? `<img class="foto-detalle" src="img/productos/${esc(p.imagen)}" alt="${esc(p.nombre)}">` : '') + `
    <dl class="ficha">
      <div><dt>Código</dt><dd>${esc(p.codigo_barras)}</dd></div>
      <div><dt>Genérico</dt><dd>${esc(p.generico) || '—'}</dd></div>
      <div><dt>Laboratorio</dt><dd>${esc(p.laboratorio) || '—'}</dd></div>
      <div><dt>Categoría</dt><dd>${esc(p.categoria)}</dd></div>
      <div><dt>Stock vigente</dt><dd>${p.stock_vigente} unidades (mínimo ${p.stock_minimo})</dd></div>
      <div><dt>Estado</dt><dd><span class="chip ${clase}">${texto}</span>${p.requiere_receta ? ' <span class="rx">Requiere receta</span>' : ''}</dd></div>
    </dl>
    <h3 class="sub">Presentaciones</h3>
    <ul class="ok-lista">${p.presentaciones.map((x) => `<li><span>${etiquetaPres(x)}</span><b>${soles(x.precio)}</b></li>`).join('') || '<li>Sin presentaciones</li>'}</ul>
    <h3 class="sub">Lotes</h3>
    <div id="ver-lotes"><p class="vacio">Cargando lotes…</p></div>`;
  $('m-ver').showModal();
  try {
    const { lotes } = await api('lotes.php?producto_id=' + p.id);
    $('ver-lotes').innerHTML = lotes.length
      ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>N.° Lote</th><th>Vence</th><th class="der">Disponible</th><th>Estado</th></tr></thead><tbody>${lotes.map((l) => {
          const [c, t] = estadoLote(l);
          return `<tr><td>${esc(l.numero_lote)}</td><td>${fechaDia(l.fecha_vencimiento)}</td><td class="der">${l.cantidad_disponible}</td><td><span class="chip ${c}">${t}</span></td></tr>`;
        }).join('')}</tbody></table></div>`
      : '<p class="vacio">Este producto aún no tiene lotes.</p>';
  } catch (e) {
    $('ver-lotes').innerHTML = `<p class="error-bloque">${esc(e.message)}</p>`;
  }
}

function fechaDia(f) {
  const [a, m, d] = String(f).split('-');
  return `${d}/${m}/${a}`;
}

function estadoLote(l) {
  if (l.cantidad_disponible === 0) return ['chip-gris', 'Agotado'];
  if (l.dias_restantes < 0) return ['chip-rojo', 'Vencido'];
  if (l.dias_restantes <= 60) return ['chip-por_vencer', 'Por vencer'];
  return ['chip-verde', 'Vigente'];
}

/* Formulario */
function filaPres(p = {}) {
  const nueva = !p.id;
  const div = document.createElement('div');
  div.className = 'pres-fila';
  if (p.id) div.dataset.id = p.id;
  if (nueva) {
    div.innerHTML = `
      <select class="p-tipo" aria-label="Tipo"><option value="unidad">Unidad</option><option value="blister">Blíster</option><option value="caja">Caja</option></select>
      <input class="p-unid" type="number" min="1" step="1" value="1" aria-label="Unidades" title="Unidades por presentación">
      <input class="p-precio" type="number" min="0" step="0.01" placeholder="Precio S/" aria-label="Precio">
      <button class="icono-btn peligro p-quitar" type="button" aria-label="Quitar presentación">${ICO.quitar}</button>`;
    const tipo = div.querySelector('.p-tipo');
    const unid = div.querySelector('.p-unid');
    tipo.addEventListener('change', () => {
      unid.disabled = tipo.value === 'unidad';
      if (tipo.value === 'unidad') unid.value = 1;
    });
    unid.disabled = true;
    div.querySelector('.p-quitar').addEventListener('click', () => div.remove());
  } else {
    div.innerHTML = `
      <span class="pres-nombre">${etiquetaPres(p)}</span>
      <input class="p-precio" type="number" min="0" step="0.01" value="${p.precio}" aria-label="Precio de ${etiquetaPres(p)}" ${esAdmin ? '' : 'disabled'}>`;
  }
  return div;
}

function abrirForm(p) {
  editando = p;
  $('m-prod-t').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('p-error').classList.remove('visible');
  $('c-codigo').hidden = !!p;
  $('c-activo').hidden = !p;
  $('codigo').value = '';
  $('nombre').value = p?.nombre ?? '';
  $('generico').value = p?.generico ?? '';
  $('laboratorio').value = p?.laboratorio ?? '';
  $('categoria').value = p?.categoria_id ?? categorias[0]?.id ?? '';
  $('minimo').value = p?.stock_minimo ?? 0;
  $('receta').checked = !!p?.requiere_receta;
  $('activo').checked = p ? p.activo : true;
  $('pres-filas').innerHTML = '';
  if (p) {
    p.presentaciones.forEach((x) => $('pres-filas').appendChild(filaPres(x)));
    $('pres-mas').hidden = true;
    $('pres-nota').textContent = esAdmin ? 'Puedes cambiar los precios.' : 'Solo el administrador puede cambiar los precios.';
  } else {
    $('pres-filas').appendChild(filaPres());
    $('pres-mas').hidden = false;
    $('pres-nota').textContent = 'Indica el precio de venta de cada presentación (con IGV).';
  }
  $('m-prod').showModal();
  (p ? $('nombre') : $('codigo')).focus();
}

function errorForm(t) {
  const e = $('p-error');
  e.textContent = t;
  e.classList.add('visible');
}

async function guardar(ev) {
  ev.preventDefault();
  const nombre = $('nombre').value.trim();
  const minimo = $('minimo').value.trim();
  if (!nombre) return errorForm('Escribe el nombre del producto.');
  if (minimo === '' || Number(minimo) < 0 || !Number.isInteger(Number(minimo))) return errorForm('El stock mínimo debe ser un número entero, 0 o mayor.');
  if (!$('categoria').value) return errorForm('Elige una categoría.');

  const base = {
    nombre,
    generico: $('generico').value.trim(),
    laboratorio: $('laboratorio').value.trim(),
    categoria_id: Number($('categoria').value),
    stock_minimo: Number(minimo),
    requiere_receta: $('receta').checked,
  };
  const filas = [...document.querySelectorAll('#pres-filas .pres-fila')];
  let ruta = 'productos.php';
  let metodo = 'POST';
  let cuerpo;

  if (editando) {
    ruta += '?id=' + editando.id;
    metodo = 'PUT';
    cuerpo = { ...base, activo: $('activo').checked };
    if (esAdmin) {
      const cambios = [];
      for (const f of filas) {
        const precio = f.querySelector('.p-precio').value;
        if (precio === '' || Number(precio) < 0) return errorForm('Revisa los precios: no pueden estar vacíos ni ser negativos.');
        const original = editando.presentaciones.find((x) => x.id === Number(f.dataset.id));
        if (original && Number(precio) !== original.precio) cambios.push({ id: original.id, precio: Number(precio) });
      }
      if (cambios.length) cuerpo.presentaciones = cambios;
    }
  } else {
    const codigo = $('codigo').value.trim();
    if (!codigo) return errorForm('Escribe el código de barras.');
    if (!filas.length) return errorForm('Agrega al menos una presentación.');
    const presentaciones = [];
    for (const f of filas) {
      const precio = f.querySelector('.p-precio').value;
      const unidades = Number(f.querySelector('.p-unid').value);
      if (precio === '' || Number(precio) < 0) return errorForm('Indica un precio válido (0 o mayor) en cada presentación.');
      if (!Number.isInteger(unidades) || unidades < 1) return errorForm('Las unidades de cada presentación deben ser 1 o más.');
      presentaciones.push({ tipo: f.querySelector('.p-tipo').value, unidades, precio: Number(precio) });
    }
    if (new Set(presentaciones.map((x) => x.tipo)).size !== presentaciones.length) return errorForm('No repitas el mismo tipo de presentación.');
    cuerpo = { ...base, codigo_barras: codigo, presentaciones };
  }

  const boton = $('p-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await api(ruta, { method: metodo, body: cuerpo });
    $('m-prod').close();
    avisar(editando ? 'Producto actualizado.' : 'Producto creado.');
    await cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.status === 409 ? 'Ya existe un producto con ese código de barras.' : e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar';
  }
}

async function cambiarEstado(p) {
  const pregunta = p.activo
    ? `¿Desactivar «${p.nombre}»? Dejará de aparecer en el punto de venta, pero se conserva su historial.`
    : `¿Reactivar «${p.nombre}»?`;
  if (!confirm(pregunta)) return;
  try {
    await api('productos.php?id=' + p.id, { method: 'PUT', body: { activo: !p.activo } });
    avisar(p.activo ? 'Producto desactivado.' : 'Producto reactivado.');
    await cargar();
  } catch (e) {
    avisar(e.message);
  }
}

(async () => {
  const usuario = await iniciarApp('productos');
  if (!usuario) return;
  if (!['administrador', 'almacen'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  esAdmin = usuario.rol === 'administrador';
  cargar();

  ['q', 'f-cat', 'f-estado'].forEach((id) => $(id).addEventListener('input', () => { pagina = 1; dibujar(); }));
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    dibujar();
  });
  $('tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acc]');
    if (!b) return;
    const p = productos.find((x) => x.id === Number(b.dataset.id));
    if (!p) return;
    if (b.dataset.acc === 'ver') verProducto(p);
    else if (b.dataset.acc === 'editar') abrirForm(p);
    else cambiarEstado(p);
  });
  $('nuevo').addEventListener('click', () => abrirForm(null));
  $('pres-mas').addEventListener('click', () => $('pres-filas').appendChild(filaPres()));
  $('f-prod').addEventListener('submit', guardar);
  $('p-cancelar').addEventListener('click', () => $('m-prod').close());
  $('ver-cerrar').addEventListener('click', () => $('m-ver').close());
})();
