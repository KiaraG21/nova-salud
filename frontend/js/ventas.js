const POR_PAGINA = 10;
const PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', mixto: 'Mixto' };
const TIPO = { unidad: 'Unidad', blister: 'Blíster', caja: 'Caja' };

let ventas = [];
let pagina = 1;
let actual = null; // venta abierta en el detalle
let esAdmin = false;

const $ = (id) => document.getElementById(id);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const chipEstado = (e) => `<span class="chip ${e === 'anulada' ? 'chip-rojo' : 'chip-verde'}">${e === 'anulada' ? 'Anulada' : 'Emitida'}</span>`;

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

function errorFiltro(t) {
  const e = $('h-error');
  e.textContent = t;
  e.classList.toggle('visible', !!t);
}

async function buscar() {
  const desde = $('desde').value;
  const hasta = $('hasta').value;
  errorFiltro('');
  if (!desde || !hasta) return errorFiltro('Indica las dos fechas.');
  if (desde > hasta) return errorFiltro('La fecha inicial no puede ser posterior a la final.');
  const params = new URLSearchParams({ desde, hasta });
  if ($('f-pago').value) params.set('medio_pago', $('f-pago').value);
  if ($('f-estado').value) params.set('estado', $('f-estado').value);
  $('tabla').innerHTML = '<p class="vacio">Cargando ventas…</p>';
  try {
    ventas = (await api('ventas.php?' + params)).ventas;
    pagina = 1;
    dibujar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar las ventas. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function dibujar() {
  if (!ventas.length) {
    $('tabla').innerHTML = '<p class="vacio">No hay ventas en este periodo.</p>';
    $('paginacion').innerHTML = '';
    return;
  }
  const paginas = Math.ceil(ventas.length / POR_PAGINA);
  const desde = (pagina - 1) * POR_PAGINA;
  const vista = ventas.slice(desde, desde + POR_PAGINA);
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>N.° Venta</th><th>Fecha</th><th>Cliente</th><th class="der">Total</th><th>Medio de Pago</th><th>Estado</th><th class="cen">Acción</th></tr></thead>
    <tbody>${vista.map((v) => `<tr>
      <td><strong>${v.numero}</strong></td>
      <td>${fechaHora(v.fecha)}</td>
      <td>${v.cliente ? `${esc(v.cliente)} <small>(${esc(v.cliente_documento)})</small>` : 'Cliente general'}</td>
      <td class="der"><b>${soles(v.total)}</b></td>
      <td>${PAGO[v.medio_pago] || esc(v.medio_pago)}</td>
      <td>${chipEstado(v.estado)}</td>
      <td class="cen"><button class="btn btn-borde btn-chico" data-id="${v.id}">Detalle</button></td>
    </tr>`).join('')}</tbody></table></div>`;

  const emitidas = ventas.filter((v) => v.estado === 'emitida');
  const suma = emitidas.reduce((s, v) => s + v.total, 0);
  let btns = '';
  for (let i = 1; i <= paginas; i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + vista.length} de ${ventas.length} · Vendido (emitidas): <b>${soles(suma)}</b></span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

async function abrirDetalle(id) {
  $('m-det-t').textContent = 'Detalle de venta';
  $('det-cuerpo').innerHTML = '<p class="vacio">Cargando…</p>';
  $('det-anular').hidden = true;
  $('det-anular-btn').hidden = true;
  $('det-error').classList.remove('visible');
  $('motivo').value = '';
  actual = null;
  $('m-det').showModal();
  try {
    const { venta } = await api('ventas.php?id=' + id);
    actual = venta;
    $('m-det-t').textContent = `Venta ${venta.numero}`;
    $('det-cuerpo').innerHTML = `
      <dl class="ficha">
        <div><dt>Fecha</dt><dd>${fechaHora(venta.fecha)}</dd></div>
        <div><dt>Estado</dt><dd>${chipEstado(venta.estado)}</dd></div>
        <div><dt>Cliente</dt><dd>${venta.cliente ? esc(venta.cliente) + ' (' + esc(venta.cliente_documento) + ')' : 'Cliente general'}</dd></div>
        <div><dt>Vendedor</dt><dd>${esc(venta.vendedor)}</dd></div>
        <div><dt>Medio de pago</dt><dd>${PAGO[venta.medio_pago] || esc(venta.medio_pago)}</dd></div>
        <div><dt>Total</dt><dd>${soles(venta.total)}</dd></div>
        ${venta.receta_medico ? `<div><dt>Receta</dt><dd>${esc(venta.receta_medico)}${venta.receta_cmp ? ' · CMP ' + esc(venta.receta_cmp) : ''}</dd></div>` : ''}
        ${venta.estado === 'anulada' ? `<div><dt>Motivo de anulación</dt><dd>${esc(venta.motivo_anulacion)}</dd></div>` : ''}
      </dl>
      <h3 class="sub">Productos</h3>
      <div class="tabla-wrap"><table class="tabla"><thead><tr><th>Producto</th><th class="der">Cant.</th><th class="der">P. Unit.</th><th class="der">Subtotal</th></tr></thead><tbody>
      ${venta.detalle.map((d) => `<tr><td>${celdaProd(d.producto, d.imagen, ` <small>(${TIPO[d.presentacion] || esc(d.presentacion)} · lote ${esc(d.numero_lote)})</small>`)}</td><td class="der">${d.cantidad}</td><td class="der">${soles(d.precio)}</td><td class="der"><b>${soles(d.subtotal)}</b></td></tr>`).join('')}
      </tbody></table></div>`;
    if (esAdmin && venta.estado === 'emitida') $('det-anular-btn').hidden = false;
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('det-cuerpo').innerHTML = `<p class="error-bloque">${esc(e.message)}</p>`;
  }
}

async function anular() {
  if (!actual) return;
  if ($('det-anular').hidden) {
    $('det-anular').hidden = false;
    $('motivo').focus();
    $('det-anular-btn').textContent = 'Confirmar anulación';
    return;
  }
  const motivo = $('motivo').value.trim();
  const err = $('det-error');
  if (!motivo) { err.textContent = 'Indica el motivo de la anulación.'; err.classList.add('visible'); return; }
  const b = $('det-anular-btn');
  b.disabled = true;
  try {
    await api(`ventas.php?accion=anular&id=${actual.id}`, { method: 'POST', body: { motivo } });
    $('m-det').close();
    avisar(`Venta ${actual.numero} anulada. El stock volvió a sus lotes.`);
    buscar();
  } catch (e) {
    err.textContent = e.message;
    err.classList.add('visible');
  } finally {
    b.disabled = false;
  }
}

(async () => {
  const usuario = await iniciarApp('ventas');
  if (!usuario) return;
  if (usuario.rol === 'almacen') { location.replace('inicio.html'); return; }
  esAdmin = usuario.rol === 'administrador';

  const hoy = new Date();
  $('hasta').value = iso(hoy);
  $('desde').value = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  buscar();

  $('buscar').addEventListener('click', buscar);
  ['f-pago', 'f-estado'].forEach((id) => $(id).addEventListener('change', buscar));
  $('tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrirDetalle(b.dataset.id);
  });
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    dibujar();
  });
  $('det-cerrar').addEventListener('click', () => {
    $('m-det').close();
    $('det-anular-btn').textContent = 'Anular venta';
  });
  $('m-det').addEventListener('close', () => { $('det-anular-btn').textContent = 'Anular venta'; });
  $('det-anular-btn').addEventListener('click', anular);
})();
