const POR_PAGINA = 10;
const ESTADO = {
  vigente: ['chip-verde', 'Vigente'],
  por_vencer: ['chip-por_vencer', 'Por vencer'],
  vencido: ['chip-rojo', 'Vencido'],
  agotado: ['chip-gris', 'Agotado'],
};

let pagina = 1;
let pedido = 0;

const $ = (id) => document.getElementById(id);

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

function fechaDia(f) {
  const [a, m, d] = String(f).split('-');
  return `${d}/${m}/${a}`;
}

function estadoLote(l) {
  if (l.cantidad_disponible === 0) return 'agotado';
  if (l.dias_restantes < 0) return 'vencido';
  if (l.dias_restantes <= 60) return 'por_vencer';
  return 'vigente';
}

async function cargar() {
  const mio = ++pedido;
  const params = new URLSearchParams({ limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA });
  if ($('q').value.trim()) params.set('q', $('q').value.trim());
  if ($('f-prod').value) params.set('producto_id', $('f-prod').value);
  if ($('f-estado').value) params.set('estado', $('f-estado').value);
  try {
    const r = await api('lotes.php?' + params);
    if (mio !== pedido) return;
    const paginas = Math.max(1, Math.ceil(r.total / POR_PAGINA));
    if (pagina > paginas) { pagina = paginas; return cargar(); }
    dibujar(r);
  } catch (e) {
    if (mio !== pedido) return;
    if (e.status === 401) { location.replace('login.html'); return; }
    $('tabla').innerHTML = `<p class="error-bloque">No se pudieron cargar los lotes. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    $('paginacion').innerHTML = '';
  }
}

function dibujar({ total, lotes }) {
  if (!lotes.length) {
    const filtrando = $('q').value.trim() || $('f-prod').value || $('f-estado').value;
    $('tabla').innerHTML = `<p class="vacio">${filtrando ? 'Ningún lote coincide con los filtros.' : 'Aún no hay lotes registrados.'}</p>`;
    $('paginacion').innerHTML = '';
    return;
  }
  $('tabla').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>N.° Lote</th><th>Producto</th><th>F. Ingreso</th><th>F. Vencimiento</th><th class="der">Cantidad</th><th class="der">Disponible</th><th>Estado</th></tr></thead>
    <tbody>${lotes.map((l) => {
      const [clase, texto] = ESTADO[estadoLote(l)];
      return `<tr>
        <td><strong>${esc(l.numero_lote)}</strong></td>
        <td>${celdaProd(l.producto, l.imagen)}</td>
        <td>${fechaDia(l.fecha_ingreso)}</td>
        <td>${fechaDia(l.fecha_vencimiento)}</td>
        <td class="der">${l.cantidad_inicial}</td>
        <td class="der"><b>${l.cantidad_disponible}</b></td>
        <td><span class="chip ${clase}">${texto}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;

  const paginas = Math.ceil(total / POR_PAGINA);
  const desde = (pagina - 1) * POR_PAGINA;
  let btns = '';
  for (let i = 1; i <= paginas; i++) btns += `<button class="pag ${i === pagina ? 'activa' : ''}" data-pag="${i}" aria-label="Página ${i}">${i}</button>`;
  $('paginacion').innerHTML = `<span>Mostrando ${desde + 1}–${desde + lotes.length} de ${total}</span>
    <div class="pags">
      <button class="pag" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>${btns}
      <button class="pag" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
}

function errorForm(t) {
  const e = $('l-error');
  e.textContent = t;
  e.classList.add('visible');
}

function abrirForm() {
  $('l-error').classList.remove('visible');
  ['l-lote', 'l-vence', 'l-cant', 'l-costo'].forEach((id) => { $(id).value = ''; });
  const manana = new Date(Date.now() + 86400000);
  $('l-vence').min = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
  $('m-lote').showModal();
  $('l-prod').focus();
}

async function guardar(ev) {
  ev.preventDefault();
  const item = {
    producto_id: Number($('l-prod').value),
    numero_lote: $('l-lote').value.trim(),
    fecha_vencimiento: $('l-vence').value,
    cantidad: Number($('l-cant').value),
    costo_unitario: $('l-costo').value === '' ? NaN : Number($('l-costo').value),
  };
  const prov = Number($('l-prov').value);
  if (!item.producto_id) return errorForm('Elige el producto.');
  if (!prov) return errorForm('Elige el proveedor.');
  if (!item.numero_lote) return errorForm('Escribe el número de lote.');
  if (!item.fecha_vencimiento) return errorForm('Indica la fecha de vencimiento.');
  if (item.fecha_vencimiento < $('l-vence').min) return errorForm('La fecha de vencimiento debe ser posterior a hoy.');
  if (!Number.isInteger(item.cantidad) || item.cantidad < 1) return errorForm('La cantidad debe ser un número entero de 1 o más.');
  if (!(item.costo_unitario >= 0)) return errorForm('Indica el costo por unidad (0 o mayor).');

  const boton = $('l-guardar');
  boton.disabled = true;
  boton.textContent = 'Registrando…';
  try {
    await api('lotes.php', { method: 'POST', body: { proveedor_id: prov, items: [item] } });
    $('m-lote').close();
    avisar('Lote registrado. El stock se actualizó.');
    pagina = 1;
    cargar();
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorForm(e.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar lote';
  }
}

(async () => {
  const usuario = await iniciarApp('inventario');
  if (!usuario) return;
  if (!['administrador', 'almacen'].includes(usuario.rol)) { location.replace('inicio.html'); return; }
  cargar();

  try {
    const [pr, pv] = await Promise.all([api('productos.php?limit=200'), api('proveedores.php')]);
    const opcionesProd = pr.productos.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('f-prod').innerHTML = '<option value="">Todos</option>' + opcionesProd;
    $('l-prod').innerHTML = '<option value="">Elige un producto…</option>' + opcionesProd;
    $('l-prov').innerHTML = '<option value="">Elige un proveedor…</option>' + pv.proveedores.map((p) => `<option value="${p.id}">${esc(p.razon_social)}</option>`).join('');
  } catch (e) {
    avisar('No se pudieron cargar los productos o proveedores: ' + e.message);
  }

  let espera;
  $('q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { pagina = 1; cargar(); }, 250); });
  ['f-prod', 'f-estado'].forEach((id) => $(id).addEventListener('change', () => { pagina = 1; cargar(); }));
  $('paginacion').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b || b.disabled) return;
    pagina = Number(b.dataset.pag);
    cargar();
  });
  $('nuevo').addEventListener('click', abrirForm);
  $('f-lote').addEventListener('submit', guardar);
  $('l-cancelar').addEventListener('click', () => $('m-lote').close());
})();
