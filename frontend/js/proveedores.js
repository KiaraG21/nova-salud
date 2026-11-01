const POR_PAGINA = 10;

let lista = [];
let pagina = 1;
let editando = null; // id del proveedor en edición, null si es nuevo
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
  const q = $('q').value.trim();
  try {
    const r = await api('proveedores.php' + (q ? '?q=' + encodeURIComponent(q) : ''));
    if (mio !== pedido) return;
    lista = r.proveedores;
    pagina = 1;
    dibujar();
  } catch (e) {
    if (mio !== pedido) return;
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar los proveedores. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function dibujar() {
  if (!lista.length) {
    $('tabla').innerHTML = `<p class="vacio">${$('q').value.trim() ? 'Ningún proveedor coincide con la búsqueda.' : 'Aún no hay proveedores registrados.'}</p>`;
    $('paginacion').innerHTML = '';
    return;
  }
  const paginas = Math.ceil(lista.length / POR_PAGINA);
  const desde = (pagina - 1) * POR_PAGINA;
  const vista = lista.slice(desde, desde + POR_PAGINA);
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Razón social</th><th>RUC</th><th>Teléfono</th><th>Correo</th><th class="cen">Acción</th></tr></thead>
    <tbody>${vista.map((p) => `<tr>
      <td><strong>${esc(p.razon_social)}</strong></td>
      <td>${esc(p.ruc)}</td>
      <td>${esc(p.telefono || '—')}</td>
      <td>${esc(p.correo || '—')}</td>
      <td class="cen"><button class="icono-btn" data-id="${p.id}" title="Editar" aria-label="Editar ${esc(p.razon_social)}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button></td>
    </tr>`).join('')}</tbody></table></div>`;

  let btns = '';
  for (let i = 1; i <= paginas; i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + vista.length} de ${lista.length}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

function errorForm(t) {
  const e = $('f-error');
  e.textContent = t;
  e.classList.add('visible');
}

function abrirForm(p) {
  editando = p ? p.id : null;
  $('m-form-t').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
  $('f-error').classList.remove('visible');
  $('f-razon').value = p ? p.razon_social : '';
  $('f-ruc').value = p ? p.ruc : '';
  $('f-tel').value = p ? p.telefono || '' : '';
  $('f-correo').value = p ? p.correo || '' : '';
  $('m-form').showModal();
  $('f-razon').focus();
}

async function guardar(ev) {
  ev.preventDefault();
  const cuerpo = {
    razon_social: $('f-razon').value.trim(),
    ruc: $('f-ruc').value.trim(),
    telefono: $('f-tel').value.trim(),
    correo: $('f-correo').value.trim(),
  };
  if (!cuerpo.razon_social) return errorForm('Escribe la razón social.');
  if (!/^\d{11}$/.test(cuerpo.ruc)) return errorForm('El RUC debe tener 11 dígitos.');
  if (cuerpo.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuerpo.correo)) return errorForm('El correo no es válido.');
  const b = $('f-guardar');
  b.disabled = true;
  try {
    await api(editando ? 'proveedores.php?id=' + editando : 'proveedores.php', { method: editando ? 'PUT' : 'POST', body: cuerpo });
    $('m-form').close();
    avisar(editando ? 'Proveedor actualizado.' : 'Proveedor registrado.');
    cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.message);
  } finally {
    b.disabled = false;
  }
}

(async () => {
  const usuario = await iniciarApp('proveedores');
  if (!usuario) return;
  if (!['administrador', 'almacen'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  cargar();

  let espera;
  $('q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 250); });
  $('tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrirForm(lista.find((p) => p.id === Number(b.dataset.id)));
  });
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    dibujar();
  });
  $('nuevo').addEventListener('click', () => abrirForm(null));
  $('f-form').addEventListener('submit', guardar);
  $('f-cancelar').addEventListener('click', () => $('m-form').close());
})();
