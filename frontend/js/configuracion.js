const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

function error(id, t) {
  const e = $(id);
  e.textContent = t;
  e.classList.toggle('visible', !!t);
}

(async () => {
  const usuario = await iniciarApp('configuracion');
  if (!usuario) return;

  const iniciales = (n) => n.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  $('p-avatar').textContent = iniciales(usuario.nombre);
  $('p-nombre').value = usuario.nombre;
  $('p-rol').textContent = NOMBRE_ROL[usuario.rol] || usuario.rol;
  $('p-correo').textContent = usuario.correo;

  $('cfg-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-panel]');
    if (!b) return;
    document.querySelectorAll('#cfg-menu .rep-op').forEach((o) => o.classList.toggle('activa', o === b));
    $('p-perfil').hidden = b.dataset.panel !== 'perfil';
    $('p-clave').hidden = b.dataset.panel !== 'clave';
  });

  $('p-perfil').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nombre = $('p-nombre').value.trim();
    error('p-error', '');
    if (!nombre) return error('p-error', 'Escribe tu nombre.');
    if (nombre === usuario.nombre) return avisar('No hay cambios que guardar.');
    const b = $('p-guardar');
    b.disabled = true;
    try {
      await api('auth.php?accion=actualizar_perfil', { method: 'POST', body: { nombre } });
      avisar('Perfil actualizado.');
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      if (e.status === 401) { location.replace('login.html'); return; }
      error('p-error', e.message);
    } finally {
      b.disabled = false;
    }
  });

  $('p-clave').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const actual = $('c-actual').value;
    const nueva = $('c-nueva').value;
    error('c-error', '');
    if (!actual) return error('c-error', 'Escribe tu contraseña actual.');
    if (nueva.length < 8) return error('c-error', 'La nueva contraseña debe tener al menos 8 caracteres.');
    if (nueva !== $('c-conf').value) return error('c-error', 'La confirmación no coincide con la nueva contraseña.');
    const b = $('c-guardar');
    b.disabled = true;
    try {
      await api('auth.php?accion=cambiar_password', { method: 'POST', body: { actual, nueva, confirmar: $('c-conf').value } });
      ['c-actual', 'c-nueva', 'c-conf'].forEach((id) => { $(id).value = ''; });
      avisar('Contraseña actualizada.');
    } catch (e) {
      if (e.status === 401) { location.replace('login.html'); return; }
      error('c-error', e.message);
    } finally {
      b.disabled = false;
    }
  });
})();
