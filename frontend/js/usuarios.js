const ROL = { administrador: 'Administrador', vendedor: 'Vendedor', almacen: 'Almacén' };
const AYUDA = {
  administrador: 'Acceso total: ventas, inventario, precios, reportes, usuarios y auditoría.',
  vendedor: 'Punto de venta, historial de ventas y clientes.',
  almacen: 'Inventario, productos, alertas, compras y proveedores.',
};

let usuarios = [];
let yo = null;
let editando = null;

const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

async function cargar() {
  try {
    usuarios = (await api('usuarios.php')).usuarios;
    dibujar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar los usuarios. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
  }
}

function dibujar() {
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th class="cen">Acción</th></tr></thead>
    <tbody>${usuarios.map((u) => {
      const soyYo = u.id === yo.id;
      return `<tr>
      <td><strong>${esc(u.correo)}</strong><br><small>${esc(u.nombre)}${soyYo ? ' (tú)' : ''}</small></td>
      <td>${ROL[u.rol] || esc(u.rol)}</td>
      <td><span class="chip ${u.activo ? 'chip-verde' : 'chip-gris'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="cen">
        <button class="icono-btn" data-edit="${u.id}" title="Editar" aria-label="Editar ${esc(u.correo)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        ${soyYo ? '' : `<button class="icono-btn ${u.activo ? 'peligro' : 'bien'}" data-estado="${u.id}" title="${u.activo ? 'Desactivar' : 'Reactivar'}" aria-label="${u.activo ? 'Desactivar' : 'Reactivar'} ${esc(u.correo)}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${u.activo ? '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>' : '<path d="M5 12l5 5L20 7"/>'}</svg></button>`}
      </td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function errorForm(t) {
  const e = $('f-error');
  e.textContent = t;
  e.classList.add('visible');
}

function abrirForm(u) {
  editando = u ? u.id : null;
  $('m-form-t').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  $('f-error').classList.remove('visible');
  $('f-nombre').value = u ? u.nombre : '';
  $('f-correo').value = u ? u.correo : '';
  $('f-rol').value = u ? u.rol : 'vendedor';
  $('f-rol').disabled = !!u && u.id === yo.id;
  $('f-pass').value = '';
  $('f-pass-t').textContent = u ? 'Nueva contraseña (opcional)' : 'Contraseña *';
  ayuda();
  $('m-form').showModal();
  $('f-nombre').focus();
}

function ayuda() {
  $('f-ayuda').textContent = AYUDA[$('f-rol').value];
}

async function guardar(ev) {
  ev.preventDefault();
  const cuerpo = { nombre: $('f-nombre').value.trim(), correo: $('f-correo').value.trim(), rol: $('f-rol').value };
  const pass = $('f-pass').value;
  if (!cuerpo.nombre) return errorForm('Escribe el nombre.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuerpo.correo)) return errorForm('Escribe un correo válido.');
  if ((!editando || pass) && pass.length < 8) return errorForm('La contraseña debe tener al menos 8 caracteres.');
  if (pass) cuerpo.password = pass;
  const b = $('f-guardar');
  b.disabled = true;
  try {
    await api(editando ? 'usuarios.php?id=' + editando : 'usuarios.php', { method: editando ? 'PUT' : 'POST', body: cuerpo });
    $('m-form').close();
    avisar(editando ? 'Usuario actualizado.' : 'Usuario creado.');
    cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.message);
  } finally {
    b.disabled = false;
  }
}

async function cambiarEstado(id) {
  const u = usuarios.find((x) => x.id === id);
  if (u.activo && !confirm(`¿Desactivar a ${u.correo}? Ya no podrá entrar al sistema.`)) return;
  try {
    await api('usuarios.php?id=' + id, { method: 'PUT', body: { activo: !u.activo } });
    avisar(u.activo ? 'Usuario desactivado.' : 'Usuario reactivado.');
    cargar();
  } catch (e) {
    avisar(e.message);
  }
}

(async () => {
  yo = await iniciarApp('usuarios');
  if (!yo) return;
  if (yo.rol !== 'administrador') { location.replace('inicio.html'); return; }
  cargar();
  $('tabla').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return abrirForm(usuarios.find((u) => u.id === Number(ed.dataset.edit)));
    const es = e.target.closest('[data-estado]');
    if (es) cambiarEstado(Number(es.dataset.estado));
  });
  $('nuevo').addEventListener('click', () => abrirForm(null));
  $('f-rol').addEventListener('change', ayuda);
  $('f-form').addEventListener('submit', guardar);
  $('f-cancelar').addEventListener('click', () => $('m-form').close());
})();
