const POR_PAGINA = 15;
const ACCION = {
  venta: 'Venta',
  anular: 'Anulación',
  login: 'Inicio de sesión',
  login_fallido: 'Intento fallido',
  crear: 'Creación',
  editar: 'Edición',
  editar_y_cambiar_password: 'Edición + contraseña',
  editar_perfil: 'Edición de perfil',
  cambiar_password: 'Cambio de contraseña',
  atender_alerta: 'Alerta atendida',
  ingreso_mercaderia: 'Ingreso de mercadería',
};
const ENTIDAD = { venta: 'Venta', producto: 'Producto', usuario: 'Usuario', cliente: 'Cliente', proveedor: 'Proveedor', compra: 'Compra', alerta: 'Alerta', lote: 'Lote' };

let pagina = 1;
let pedido = 0;

const $ = (id) => document.getElementById(id);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nombreAccion = (a) => ACCION[a] || a.replace(/_/g, ' ');

function referencia(f) {
  if (f.entidad_id === null) return '—';
  const n = String(f.entidad_id);
  if (f.entidad === 'venta') return 'V-' + n.padStart(4, '0');
  if (f.entidad === 'compra') return 'C-' + n.padStart(6, '0');
  return '#' + n;
}

function detalle(f) {
  const n = f.valor_nuevo;
  const a = f.valor_anterior;
  switch (f.accion) {
    case 'venta': return n ? `Registro de venta · ${soles(n.total)} (${n.medio_pago})` : 'Registro de venta';
    case 'anular': return n && n.motivo ? `Venta anulada: ${n.motivo}` : 'Venta anulada';
    case 'login': return 'Inició sesión';
    case 'login_fallido': return `Intento con ${typeof n === 'string' ? n : 'un correo desconocido'}`;
    case 'atender_alerta': return 'Marcó la alerta como atendida';
    case 'ingreso_mercaderia': return n ? `Ingreso de ${n.items} ${n.items === 1 ? 'lote' : 'lotes'} por ${soles(n.total)}` : 'Ingreso de mercadería';
    case 'cambiar_password': return 'Cambió su contraseña';
    case 'editar_perfil': return 'Actualizó su nombre';
    case 'crear': return `Creó ${n && (n.nombre || n.razon_social) ? esc(n.nombre || n.razon_social) : (ENTIDAD[f.entidad] || f.entidad).toLowerCase()}`;
    case 'editar':
    case 'editar_y_cambiar_password': {
      if (n && n.presentaciones) return 'Actualizó precios o presentaciones';
      const campos = n && typeof n === 'object' ? Object.keys(n).filter((k) => k !== 'presentaciones') : [];
      return campos.length ? `Modificó: ${campos.join(', ')}` : 'Actualizó datos';
    }
    default: return a || n ? 'Ver valores en el registro' : '—';
  }
}

function fechaHoraCorta(f) {
  const d = new Date(String(f).replace(' ', 'T'));
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function errorFiltro(t) {
  const e = $('a-error');
  e.textContent = t;
  e.classList.toggle('visible', !!t);
}

async function cargar() {
  const mio = ++pedido;
  const desde = $('desde').value;
  const hasta = $('hasta').value;
  errorFiltro('');
  if (desde && hasta && desde > hasta) return errorFiltro('La fecha inicial no puede ser posterior a la final.');
  const params = new URLSearchParams({ limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA });
  if ($('f-usuario').value) params.set('usuario_id', $('f-usuario').value);
  if ($('f-accion').value) params.set('accion', $('f-accion').value);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  try {
    const r = await api('auditoria.php?' + params);
    if (mio !== pedido) return;
    const paginas = Math.max(1, Math.ceil(r.total / POR_PAGINA));
    if (pagina > paginas) { pagina = paginas; return cargar(); }
    llenarAcciones(r.acciones);
    dibujar(r);
  } catch (e) {
    if (mio !== pedido) return;
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudo cargar la auditoría. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function llenarAcciones(acciones) {
  const sel = $('f-accion');
  if (sel.options.length > 1) return;
  acciones.forEach((a) => sel.add(new Option(nombreAccion(a), a)));
}

function dibujar({ total, filas }) {
  if (!filas.length) {
    $('tabla').innerHTML = '<p class="vacio">No hay registros con estos filtros.</p>';
    $('paginacion').innerHTML = '';
    return;
  }
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Fecha y Hora</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
    <tbody>${filas.map((f) => `<tr>
      <td>${fechaHoraCorta(f.fecha)}</td>
      <td>${f.usuario ? esc(f.usuario) : '<small>Sin sesión</small>'}</td>
      <td><strong>${esc(nombreAccion(f.accion))}</strong></td>
      <td>${esc(referencia(f))} <small>${esc(ENTIDAD[f.entidad] || f.entidad)}</small></td>
      <td>${detalle(f)}</td></tr>`).join('')}</tbody></table></div>`;

  const paginas = Math.ceil(total / POR_PAGINA);
  const desde = (pagina - 1) * POR_PAGINA;
  const ini = Math.max(1, Math.min(pagina - 2, paginas - 4));
  let btns = '';
  for (let i = ini; i <= Math.min(paginas, ini + 4); i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + filas.length} de ${total}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

(async () => {
  const usuario = await iniciarApp('auditoria');
  if (!usuario) return;
  if (usuario.rol !== 'administrador') { location.replace('inicio.html'); return; }
  cargar();
  api('usuarios.php').then((r) => r.usuarios.forEach((u) => $('f-usuario').add(new Option(u.nombre, u.id)))).catch(() => {});

  let espera;
  $('q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { pagina = 1; cargar(); }, 300); });
  ['f-usuario', 'f-accion', 'desde', 'hasta'].forEach((id) => $(id).addEventListener('change', () => { pagina = 1; cargar(); }));
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    cargar();
  });
})();
