const POR_PAGINA = 10;

let compras = [];
let pagina = 1;
let productos = [];

const $ = (id) => document.getElementById(id);
const numero = (id) => 'C-' + String(id).padStart(6, '0');

function fechaDia(f) {
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

async function cargar() {
  try {
    compras = (await api('compras.php?desde=2000-01-01&hasta=' + new Date().toISOString().slice(0, 10))).compras;
    dibujar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar las compras. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function dibujar() {
  if (!compras.length) {
    $('tabla').innerHTML = '<p class="vacio">Aún no hay compras registradas.</p>';
    $('paginacion').innerHTML = '';
    return;
  }
  const paginas = Math.ceil(compras.length / POR_PAGINA);
  if (pagina > paginas) pagina = paginas;
  const desde = (pagina - 1) * POR_PAGINA;
  const vista = compras.slice(desde, desde + POR_PAGINA);
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro tabla-click">
    <thead><tr><th>N.° Compra</th><th>Fecha</th><th>Proveedor</th><th class="der">Total</th><th class="der">Productos</th></tr></thead>
    <tbody>${vista.map((c) => `<tr data-id="${c.id}" tabindex="0" title="Ver detalle">
      <td><strong>${numero(c.id)}</strong></td>
      <td>${fechaDia(c.fecha)}</td>
      <td>${esc(c.proveedor)}</td>
      <td class="der"><b>${soles(c.total)}</b></td>
      <td class="der">${c.unidades} ${c.unidades === 1 ? 'item' : 'items'}</td>
    </tr>`).join('')}</tbody></table></div>`;

  let btns = '';
  for (let i = 1; i <= paginas; i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + vista.length} de ${compras.length}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

async function abrirDetalle(id) {
  $('m-det-t').textContent = 'Detalle de compra';
  $('det-cuerpo').innerHTML = '<p class="vacio">Cargando…</p>';
  $('m-det').showModal();
  try {
    const { compra } = await api('compras.php?id=' + id);
    $('m-det-t').textContent = `Compra ${numero(compra.id)}`;
    $('det-cuerpo').innerHTML = `
      <dl class="ficha">
        <div><dt>Fecha</dt><dd>${fechaHora(compra.fecha)}</dd></div>
        <div><dt>Proveedor</dt><dd>${esc(compra.proveedor)}</dd></div>
        <div><dt>Registrado por</dt><dd>${esc(compra.registrado_por)}</dd></div>
        <div><dt>Total</dt><dd>${soles(compra.total)}</dd></div>
      </dl>
      <h3 class="sub">Productos</h3>
      <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th class="der">Cant.</th><th class="der">Costo</th></tr></thead><tbody>
      ${compra.items.map((i) => `<tr><td>${celdaProd(i.producto, i.imagen)}</td><td>${esc(i.numero_lote)}</td><td>${fechaDia(i.fecha_vencimiento)}</td><td class="der">${i.cantidad}</td><td class="der">${soles(i.costo_unitario)}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('det-cuerpo').innerHTML = `<p class="error-bloque">${esc(e.message)}</p>`;
  }
}

/* ---------- registrar compra ---------- */
function filaItem() {
  const div = document.createElement('div');
  div.className = 'cmp-fila';
  div.innerHTML = `
    <select class="i-prod" aria-label="Producto"><option value="">Producto…</option>${productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select>
    <input class="i-lote" maxlength="40" placeholder="N.° lote" aria-label="Número de lote">
    <input class="i-vence" type="date" min="${manana()}" aria-label="Vencimiento">
    <input class="i-cant" type="number" min="1" step="1" inputmode="numeric" placeholder="Cant." aria-label="Cantidad">
    <input class="i-costo" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Costo S/" aria-label="Costo por unidad">
    <button class="icono-btn peligro i-quitar" type="button" aria-label="Quitar producto">✕</button>`;
  return div;
}

function manana() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recalcular() {
  let total = 0;
  document.querySelectorAll('.cmp-fila').forEach((f) => {
    total += (Number(f.querySelector('.i-cant').value) || 0) * (Number(f.querySelector('.i-costo').value) || 0);
  });
  $('c-total').textContent = soles(total);
}

function errorForm(t) {
  const e = $('c-error');
  e.textContent = t;
  e.classList.add('visible');
}

function abrirForm() {
  $('c-error').classList.remove('visible');
  $('c-prov').value = '';
  $('c-items').innerHTML = '';
  $('c-items').appendChild(filaItem());
  recalcular();
  $('m-compra').showModal();
  $('c-prov').focus();
}

async function guardar(ev) {
  ev.preventDefault();
  const prov = Number($('c-prov').value);
  if (!prov) return errorForm('Elige el proveedor.');
  const items = [];
  const filas = [...document.querySelectorAll('.cmp-fila')];
  for (let n = 0; n < filas.length; n++) {
    const f = filas[n];
    const it = {
      producto_id: Number(f.querySelector('.i-prod').value),
      numero_lote: f.querySelector('.i-lote').value.trim(),
      fecha_vencimiento: f.querySelector('.i-vence').value,
      cantidad: Number(f.querySelector('.i-cant').value),
      costo_unitario: f.querySelector('.i-costo').value === '' ? NaN : Number(f.querySelector('.i-costo').value),
    };
    const p = `Producto ${n + 1}: `;
    if (!it.producto_id) return errorForm(p + 'elige el producto.');
    if (!it.numero_lote) return errorForm(p + 'escribe el número de lote.');
    if (!it.fecha_vencimiento) return errorForm(p + 'indica el vencimiento.');
    if (it.fecha_vencimiento < manana()) return errorForm(p + 'el vencimiento debe ser posterior a hoy.');
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1) return errorForm(p + 'la cantidad debe ser un entero de 1 o más.');
    if (!(it.costo_unitario >= 0)) return errorForm(p + 'indica el costo por unidad.');
    items.push(it);
  }
  const b = $('c-guardar');
  b.disabled = true;
  b.textContent = 'Registrando…';
  try {
    const r = await api('lotes.php', { method: 'POST', body: { proveedor_id: prov, items } });
    $('m-compra').close();
    avisar(`Compra ${numero(r.compra_id)} registrada. El stock se actualizó.`);
    pagina = 1;
    cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.message);
  } finally {
    b.disabled = false;
    b.textContent = 'Registrar compra';
  }
}

(async () => {
  const usuario = await iniciarApp('compras');
  if (!usuario) return;
  if (!['administrador', 'almacen'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  cargar();

  try {
    const [pr, pv] = await Promise.all([api('productos.php?limit=200'), api('proveedores.php')]);
    productos = pr.productos;
    $('c-prov').innerHTML = '<option value="">Elige un proveedor…</option>' + pv.proveedores.map((p) => `<option value="${p.id}">${esc(p.razon_social)}</option>`).join('');
  } catch (e) {
    avisar('No se pudieron cargar los productos o proveedores: ' + e.message);
  }

  $('tabla').addEventListener('click', (e) => {
    const f = e.target.closest('[data-id]');
    if (f) abrirDetalle(f.dataset.id);
  });
  $('tabla').addEventListener('keydown', (e) => {
    const f = e.target.closest('[data-id]');
    if (f && e.key === 'Enter') abrirDetalle(f.dataset.id);
  });
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    dibujar();
  });
  $('det-cerrar').addEventListener('click', () => $('m-det').close());
  $('nuevo').addEventListener('click', abrirForm);
  $('c-mas').addEventListener('click', () => { $('c-items').appendChild(filaItem()); });
  $('c-items').addEventListener('input', recalcular);
  $('c-items').addEventListener('click', (e) => {
    if (!e.target.closest('.i-quitar')) return;
    if (document.querySelectorAll('.cmp-fila').length > 1) e.target.closest('.cmp-fila').remove();
    recalcular();
  });
  $('f-compra').addEventListener('submit', guardar);
  $('c-cancelar').addEventListener('click', () => $('m-compra').close());
})();
