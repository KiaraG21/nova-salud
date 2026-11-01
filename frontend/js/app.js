// Armazón común del POS: menú lateral según el rol y barra superior.
const MENU = [
  { id: 'inicio', texto: 'Inicio', href: 'inicio.html', icono: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', roles: ['administrador', 'vendedor', 'almacen'] },
  { id: 'venta', texto: 'Punto de Venta', href: 'venta.html', icono: 'M3 4h2l2.4 11h10.2L20 7H6M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01', roles: ['administrador', 'vendedor'] },
  { id: 'inventario', texto: 'Inventario', href: 'inventario.html', icono: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8',   roles: ['administrador', 'almacen'] },
    { id: 'productos', texto: 'Productos', href: 'productos.html', icono: 'M10.5 3.5l10 10a3.5 3.5 0 0 1-5 5l-10-10a3.5 3.5 0 0 1 5-5zM8 8l5 5', roles: ['administrador', 'almacen'] },
  { id: 'alertas', texto: 'Alertas', href: 'alertas.html', icono: 'M12 3l10 18H2zM12 10v5M12 18v.01',   roles: ['administrador', 'almacen'] },
    { id: 'ventas', texto: 'Historial de ventas', href: 'ventas.html', icono: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6', roles: ['administrador', 'vendedor'] },
  { id: 'compras', texto: 'Compras', href: 'compras.html', icono: 'M3 7h13v10H3zM16 10h3l2 3v4h-5M7 19a1.5 1.5 0 1 0 0 .01M17 19a1.5 1.5 0 1 0 0 .01', roles: ['administrador', 'almacen'] },
  { id: 'clientes', texto: 'Clientes', href: 'clientes.html', icono: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', roles: ['administrador', 'vendedor'] },
  { id: 'proveedores', texto: 'Proveedores', href: 'proveedores.html', icono: 'M3 21V8l9-5 9 5v13zM9 21v-6h6v6', roles: ['administrador', 'almacen'] },
  { id: 'reportes', texto: 'Reportes', href: 'reportes.html', icono: 'M4 20V10M10 20V4M16 20v-8M22 20H2', roles: ['administrador'] },
  { id: 'usuarios', texto: 'Usuarios', href: 'usuarios.html', icono: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 19a6 6 0 0 0-4-5.6', roles: ['administrador'] },
  { id: 'auditoria', texto: 'Auditoría', href: 'auditoria.html', icono: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4', roles: ['administrador'] },
];

const NOMBRE_ROL = { administrador: 'Administrador', vendedor: 'Vendedor', almacen: 'Almacén' };

function esc(texto) {
  const d = document.createElement('div');
  d.textContent = texto ?? '';
  return d.innerHTML;
}

const soles = (n) => 'S/ ' + Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fechaCorta(f) {
  const d = new Date(String(f).replace(' ', 'T'));
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fechaHora(f) {
  const d = new Date(String(f).replace(' ', 'T'));
  const dia = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} - ${hora}`;
}

function hace(f) {
  const min = Math.max(0, Math.round((Date.now() - new Date(String(f).replace(' ', 'T')).getTime()) / 60000));
  if (min < 1) return 'Hace un momento';
  if (min < 60) return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
  return `Hace ${Math.round(min / 1440)} d`;
}

let USUARIO = null;

// Enlace a otra pantalla; si aún no existe o el rol no la tiene, no se enlaza.
function enlaceModulo(id, texto) {
  const m = MENU.find((x) => x.id === id);
  if (!m || !USUARIO || !m.roles.includes(USUARIO.rol)) return '';
  return m.pronto
    ? `<span class="ver-mas apagado" title="Próximamente">${texto}</span>`
    : `<a class="ver-mas" href="${m.href}">${texto}</a>`;
}

const ICONO_SALIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';

async function iniciarApp(activo) {
  let usuario;
  try {
    ({ usuario } = await api('auth.php?accion=me'));
  } catch {
    location.replace('login.html');
    return null;
  }
  USUARIO = usuario;
  const rol = NOMBRE_ROL[usuario.rol] || usuario.rol;
  const iniciales = usuario.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const items = MENU.filter((m) => m.roles.includes(usuario.rol)).map((m) => {
    const icono = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${m.icono}"/></svg>`;
    const insignia = m.id === 'alertas' ? '<b class="insignia" id="ins-alertas" hidden></b>' : '';
    if (m.pronto) {
      return `<span class="menu-item pronto" title="Próximamente">${icono}<span>${m.texto}</span>${insignia}</span>`;
    }
    return `<a class="menu-item${m.id === activo ? ' activo' : ''}" href="${m.href}"${m.id === activo ? ' aria-current="page"' : ''}>${icono}<span>${m.texto}</span>${insignia}</a>`;
  }).join('');

  document.body.insertAdjacentHTML('afterbegin', `
    <aside class="lateral" id="lateral">
      <div class="lateral-marca">
        <svg viewBox="0 0 72 60" width="46" height="38" aria-hidden="true">
          <defs><linearGradient id="hoja-m" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#86efac"/></linearGradient></defs>
          <path d="M24 2h14v16h14v14H38v14H24V32H10V18h14z" fill="#fff"/>
          <path d="M40 56C38 38 48 24 68 20 70 40 60 54 40 56z" fill="url(#hoja-m)" stroke="#2d1a78" stroke-width="2"/>
        </svg>
        <div><strong>Nova Salud</strong><small>BOTICA &amp; SALUD</small></div>
      </div>
      <nav class="menu-app" aria-label="Menú principal">${items}</nav>
      <div class="lateral-yo">
        <span class="avatar">${esc(iniciales)}</span>
        <div><strong>${esc(usuario.nombre)}</strong><small>${rol}</small></div>
        <button class="js-salir" type="button" title="Cerrar sesión" aria-label="Cerrar sesión">${ICONO_SALIR}</button>
      </div>
    </aside>
    <div class="velo" id="velo"></div>`);

  const barra = document.getElementById('topbar');
  barra.innerHTML = `
    <button class="btn-menu" id="abrir-menu" type="button" aria-label="Abrir menú">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <label class="buscador">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input type="search" placeholder="Buscar productos, clientes…" aria-label="Buscar">
    </label>
    <div class="topbar-der">
      <div class="campana-wrap">
        <button class="campana" id="campana" type="button" title="Alertas" aria-label="Alertas" aria-haspopup="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/></svg>
          <b class="insignia" id="ins-campana" hidden></b>
        </button>
        <div class="alertas-menu" id="alertas-menu" hidden></div>
      </div>
      <div class="yo-app">
        <button class="yo-boton" id="yo-boton" type="button" aria-haspopup="true" aria-expanded="false">
          <span class="avatar">${esc(iniciales)}</span>
          <span class="yo-datos"><strong>${esc(usuario.nombre)}</strong><span>${rol}</span></span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="yo-menu" id="yo-menu" hidden>
          <a href="configuracion.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><span>Configuración</span></a>
          <button class="js-salir" id="salir" type="button">${ICONO_SALIR}<span>Cerrar sesión</span></button>
        </div>
      </div>
    </div>`;

  const lateral = document.getElementById('lateral');
  const velo = document.getElementById('velo');
  const alternar = (abierto) => {
    lateral.classList.toggle('abierto', abierto);
    velo.classList.toggle('visible', abierto);
  };
  document.getElementById('abrir-menu').addEventListener('click', () => alternar(true));
  velo.addEventListener('click', () => alternar(false));

  const boton = document.getElementById('yo-boton');
  const menuYo = document.getElementById('yo-menu');
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    menuYo.hidden = !menuYo.hidden;
    boton.setAttribute('aria-expanded', String(!menuYo.hidden));
  });
  const campana = document.getElementById('campana');
  const menuAlertas = document.getElementById('alertas-menu');
  campana.addEventListener('click', (e) => {
    e.stopPropagation();
    menuYo.hidden = true;
    menuAlertas.hidden = !menuAlertas.hidden;
    if (!menuAlertas.hidden) cargarAlertasRapidas(menuAlertas);
  });
  menuAlertas.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { menuYo.hidden = true; menuAlertas.hidden = true; boton.setAttribute('aria-expanded', 'false'); });

  document.querySelectorAll('.js-salir').forEach((b) => b.addEventListener('click', async () => {
    try { await api('auth.php?accion=logout', { method: 'POST' }); } catch {}
    location.replace('login.html');
  }));

  if (activo !== 'inicio') {
    api('resumen.php').then((r) => mostrarInsignias(r.alertas_activas)).catch(() => {});
  }

  return usuario;
}

// Miniatura del producto (o un cuadro vacío si no tiene foto) y celda con foto + nombre.
function fotoProd(imagen, clase = '') {
  return imagen
    ? `<img class="miniatura ${clase}" src="img/productos/${esc(imagen)}" alt="" loading="lazy">`
    : `<span class="miniatura vacia ${clase}"></span>`;
}
function celdaProd(nombre, imagen, detalle = '') {
  return `<div class="prod-celda">${fotoProd(imagen)}<span><strong>${esc(nombre)}</strong>${detalle}</span></div>`;
}

const ROTULO_ALERTA = { vencido: 'Vencido', stock_bajo: 'Stock bajo', por_vencer: 'Por vencer' };

// Ventanita de la campana: las alertas más importantes (vencidos primero).
async function cargarAlertasRapidas(caja) {
  caja.innerHTML = '<p class="alertas-vacio">Cargando…</p>';
  try {
    const r = await api('alertas.php');
    mostrarInsignias(r.alertas.length);
    const lista = r.alertas.slice(0, 5).map((a) =>
      `<a class="alerta-fila ${a.tipo}" href="alertas.html">${fotoProd(a.imagen)}<span class="alerta-txt"><span class="alerta-tipo">${ROTULO_ALERTA[a.tipo] || a.tipo}</span><strong>${esc(a.producto)}</strong><small>${esc(a.mensaje)}</small></span></a>`).join('');
    const extra = r.alertas.length > 5 ? ` (${r.alertas.length})` : '';
    caja.innerHTML = '<h4>Alertas activas</h4>'
      + (lista || '<p class="alertas-vacio">No hay alertas pendientes</p>')
      + `<a class="alertas-todas" href="alertas.html">Ver todas las alertas${extra}</a>`;
  } catch {
    caja.innerHTML = '<p class="alertas-vacio">No se pudieron cargar las alertas</p>';
  }
}

// Cuenta de alertas activas en la campana y en el menú.
function mostrarInsignias(n) {
  ['ins-alertas', 'ins-campana'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : n;
    el.hidden = !n;
  });
}

