const TIPOS = {
  stock_bajo: { texto: 'Stock Bajo', clase: 'rojo' },
  por_vencer: { texto: 'Por Vencer', clase: 'naranja' },
  vencido: { texto: 'Vencido', clase: 'rojo' },
};
const PESTANAS = [['todas', 'Todas'], ['stock_bajo', 'Stock Bajo'], ['por_vencer', 'Por Vencer'], ['vencido', 'Vencido']];

let alertas = [];
let resumen = {};
let filtro = 'todas';

const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

function cuando(f) {
  const d = new Date(String(f).replace(' ', 'T'));
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dias = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (dias === 0) return `Hoy, ${hora}`;
  if (dias === 1) return `Ayer, ${hora}`;
  return `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${hora}`;
}

function detalle(a) {
  const s = a.mensaje.match(/\((\d+) de mínimo (\d+)\)/);
  if (a.tipo === 'stock_bajo' && s) return `Stock: ${s[1]} und. (mín: ${s[2]})`;
  const l = a.mensaje.match(/lote (\S+) \((\d{4})-(\d{2})-(\d{2})\)/);
  if (l) return `${a.tipo === 'vencido' ? 'Venció' : 'Vence'}: ${l[4]}/${l[3]}/${l[2]} · Lote ${l[1]}`;
  return a.mensaje;
}

function dibujarPestanas() {
  const total = alertas.length;
  $('pestanas').innerHTML = PESTANAS.map(([id, texto]) => {
    const n = id === 'todas' ? total : resumen[id] || 0;
    return `<button class="pestana ${id === filtro ? 'activa' : ''}" role="tab" aria-selected="${id === filtro}" data-tab="${id}">${texto}<span>${n}</span></button>`;
  }).join('');
}

function dibujar() {
  dibujarPestanas();
  const lista = filtro === 'todas' ? alertas : alertas.filter((a) => a.tipo === filtro);
  if (!lista.length) {
    $('tabla').innerHTML = `<p class="vacio">${alertas.length ? 'No hay alertas de este tipo.' : '¡Todo en orden! No hay alertas activas.'}</p>`;
    return;
  }
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Tipo</th><th>Producto</th><th>Detalle</th><th>Fecha</th><th class="cen">Acción</th></tr></thead>
    <tbody>${lista.map((a) => {
      const t = TIPOS[a.tipo];
      return `<tr>
        <td><span class="tipo-al ${t.clase}"><i class="punto"></i>${t.texto}</span></td>
        <td>${celdaProd(a.producto, a.imagen)}</td>
        <td class="detalle">${esc(detalle(a))}</td>
        <td>${cuando(a.fecha)}</td>
        <td class="cen"><button class="btn btn-borde btn-chico" data-atender="${a.id}">Atender</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

async function cargar() {
  try {
    const r = await api('alertas.php');
    alertas = r.alertas;
    resumen = r.resumen;
    mostrarInsignias(alertas.length);
    dibujar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar las alertas. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
  }
}

(async () => {
  const usuario = await iniciarApp('alertas');
  if (!usuario) return;
  if (!['administrador', 'almacen'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  cargar();

  $('pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    filtro = b.dataset.tab;
    dibujar();
  });
  $('tabla').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-atender]');
    if (!b) return;
    b.disabled = true;
    try {
      await api(`alertas.php?accion=atender&id=${b.dataset.atender}`, { method: 'POST' });
      avisar('Alerta marcada como atendida.');
      await cargar();
    } catch (err) {
      b.disabled = false;
      avisar(err.message);
    }
  });
})();
