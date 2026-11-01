const POR_PAGINA = 10;
const PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', mixto: 'Mixto' };

let clientes = [];
let pagina = 1;
let hayMas = false;
let editando = null;
let pedido = 0;

const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

async function cargar() {
  const mio = ++pedido;
  const params = new URLSearchParams({ limit: POR_PAGINA + 1, offset: (pagina - 1) * POR_PAGINA });
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  try {
    const r = await api('clientes.php?' + params);
    if (mio !== pedido) return;
    hayMas = r.clientes.length > POR_PAGINA;
    clientes = r.clientes.slice(0, POR_PAGINA);
    if (!clientes.length && pagina > 1) { pagina--; return cargar(); }
    dibujar();
  } catch (e) {
    if (mio !== pedido) return;
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar los clientes. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function dibujar() {
  if (!clientes.length) {
    $('tabla').innerHTML = `<p class="vacio">${$('q').value.trim() ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes registrados.'}</p>`;
    $('paginacion').innerHTML = '';
    return;
  }
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>DNI / RUC</th><th>Nombre</th><th>Teléfono</th><th class="cen">Acción</th></tr></thead>
    <tbody>${clientes.map((c) => `<tr>
      <td><strong>${esc(c.documento)}</strong></td>
      <td>${esc(c.nombre)}</td>
      <td>${esc(c.telefono || '—')}</td>
      <td class="cen">
        <button class="icono-btn" data-ver="${c.id}" title="Ver compras" aria-label="Ver compras de ${esc(c.nombre)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
        ${c.documento === '00000000' ? '' : `<button class="icono-btn" data-edit="${c.id}" title="Editar" aria-label="Editar ${esc(c.nombre)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`}
      </td></tr>`).join('')}</tbody></table></div>`;
  const desde = (pagina - 1) * POR_PAGINA;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + clientes.length}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>
      <button class="pag activa" aria-current="page">${pagina}</button>
      <button class="pag" data-pag="${pagina + 1}" ${hayMas ? '' : 'disabled'} aria-label="Siguiente">›</button>
    </div>`;
}

function errorForm(t) {
  const e = $('f-error');
  e.textContent = t;
  e.classList.add('visible');
}

function abrirForm(c) {
  editando = c ? c.id : null;
  $('m-form-t').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  $('f-error').classList.remove('visible');
  $('f-doc').value = c ? c.documento : '';
  $('f-nombre').value = c ? c.nombre : '';
  $('f-tel').value = c ? c.telefono || '' : '';
  $('m-form').showModal();
  $('f-doc').focus();
}

async function guardar(ev) {
  ev.preventDefault();
  const cuerpo = { documento: $('f-doc').value.trim(), nombre: $('f-nombre').value.trim(), telefono: $('f-tel').value.trim() };
  if (!/^(\d{8}|\d{11})$/.test(cuerpo.documento)) return errorForm('El documento debe ser un DNI de 8 dígitos o un RUC de 11.');
  if (!cuerpo.nombre) return errorForm('Escribe el nombre del cliente.');
  const b = $('f-guardar');
  b.disabled = true;
  try {
    await api(editando ? 'clientes.php?id=' + editando : 'clientes.php', { method: editando ? 'PUT' : 'POST', body: cuerpo });
    $('m-form').close();
    avisar(editando ? 'Cliente actualizado.' : 'Cliente registrado.');
    cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.message);
  } finally {
    b.disabled = false;
  }
}

async function ver(id) {
  $('m-det-t').textContent = 'Cliente';
  $('det-cuerpo').innerHTML = '<p class="vacio">Cargando…</p>';
  $('m-det').showModal();
  try {
    const { cliente: c } = await api('clientes.php?id=' + id);
    $('m-det-t').textContent = c.nombre;
    $('det-cuerpo').innerHTML = `
      <dl class="ficha">
        <div><dt>DNI / RUC</dt><dd>${esc(c.documento)}</dd></div>
        <div><dt>Teléfono</dt><dd>${esc(c.telefono || '—')}</dd></div>
        <div><dt>Compras realizadas</dt><dd>${c.cantidad_compras}</dd></div>
        <div><dt>Total comprado</dt><dd>${soles(c.total_comprado)}</dd></div>
      </dl>
      <h3 class="sub">Últimas compras</h3>
      ${c.compras.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>N.° Venta</th><th>Fecha</th><th class="der">Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>
      ${c.compras.map((v) => `<tr><td><strong>V-${String(v.id).padStart(4, '0')}</strong></td><td>${fechaHora(v.fecha)}</td><td class="der">${soles(v.total)}</td><td>${PAGO[v.medio_pago] || esc(v.medio_pago)}</td><td><span class="chip ${v.estado === 'anulada' ? 'chip-rojo' : 'chip-verde'}">${v.estado === 'anulada' ? 'Anulada' : 'Emitida'}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="vacio">Este cliente aún no tiene compras.</p>'}`;
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('det-cuerpo').innerHTML = `<p class="error-bloque">${esc(e.message)}</p>`;
  }
}

(async () => {
  const usuario = await iniciarApp('clientes');
  if (!usuario) return;
  if (!['administrador', 'vendedor'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  cargar();

  let espera;
  $('q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { pagina = 1; cargar(); }, 250); });
  $('tabla').addEventListener('click', (e) => {
    const v = e.target.closest('[data-ver]');
    if (v) return ver(v.dataset.ver);
    const ed = e.target.closest('[data-edit]');
    if (ed) abrirForm(clientes.find((c) => c.id === Number(ed.dataset.edit)));
  });
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    cargar();
  });
  $('nuevo').addEventListener('click', () => abrirForm(null));
  $('f-form').addEventListener('submit', guardar);
  $('f-cancelar').addEventListener('click', () => $('m-form').close());
  $('det-cerrar').addEventListener('click', () => $('m-det').close());
})();
