const IGV = 0.18;
const TIPO = { unidad: 'Unidad', blister: 'Blíster', caja: 'Caja' };

let productos = [];
let categoriaActiva = 0;
let carrito = []; // { producto, pres, cantidad }
let clienteId = null;
let ultimoVuelto = '';

const $ = (id) => document.getElementById(id);
const centimos = (n) => Math.round(Number(n) * 100);
const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const etiquetaPres = (p) => TIPO[p.tipo] + (p.unidades > 1 ? ` ×${p.unidades}` : '');

function avisar(texto) {
  const a = $('aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.hidden = true; }, 3200);
}

function unidadesEnCarrito(productoId) {
  return carrito.filter((l) => l.producto.id === productoId).reduce((s, l) => s + l.cantidad * l.pres.unidades, 0);
}

function agregar(producto, pres) {
  if (unidadesEnCarrito(producto.id) + pres.unidades > producto.stock_vigente) {
    avisar(`Sin stock suficiente de ${producto.nombre} (disponible: ${producto.stock_vigente} unidades)`);
    return;
  }
  const linea = carrito.find((l) => l.pres.id === pres.id);
  if (linea) linea.cantidad += 1;
  else carrito.push({ producto, pres, cantidad: 1 });
  dibujarCarrito();
}

function cambiarCantidad(presId, nueva) {
  const linea = carrito.find((l) => l.pres.id === presId);
  if (!linea) return;
  nueva = Math.floor(Number(nueva));
  if (!Number.isFinite(nueva) || nueva < 1) {
    carrito = carrito.filter((l) => l !== linea);
  } else {
    const otras = unidadesEnCarrito(linea.producto.id) - linea.cantidad * linea.pres.unidades;
    if (otras + nueva * linea.pres.unidades > linea.producto.stock_vigente) {
      avisar(`Sin stock suficiente de ${linea.producto.nombre} (disponible: ${linea.producto.stock_vigente} unidades)`);
    } else {
      linea.cantidad = nueva;
    }
  }
  dibujarCarrito();
}

function totalCentimos() {
  return carrito.reduce((s, l) => s + centimos(l.pres.precio) * l.cantidad, 0);
}

function dibujarCarrito() {
  const cont = $('lineas');
  if (!carrito.length) {
    cont.innerHTML = '<p class="vacio">La venta está vacía.<br>Agrega productos desde el catálogo.</p>';
  } else {
    cont.innerHTML = `<table class="tabla pv-lineas"><thead><tr><th>Producto</th><th class="cen">Cant.</th><th class="der">P. Unit.</th><th class="der">Subtotal</th><th></th></tr></thead><tbody>` +
      carrito.map((l) => `<tr>
        <td><div class="prod-celda">${fotoProd(l.producto.imagen)}<span><strong>${esc(l.producto.nombre)}</strong><small>${etiquetaPres(l.pres)}${l.producto.requiere_receta ? ' · <b class="rx">Receta</b>' : ''}</small></span></div></td>
        <td class="cen"><div class="cant">
          <button type="button" data-menos="${l.pres.id}" aria-label="Quitar uno">−</button>
          <input type="number" min="1" value="${l.cantidad}" data-cant="${l.pres.id}" aria-label="Cantidad de ${esc(l.producto.nombre)}">
          <button type="button" data-mas="${l.pres.id}" aria-label="Agregar uno">+</button>
        </div></td>
        <td class="der">${soles(l.pres.precio)}</td>
        <td class="der"><strong>${soles(l.pres.precio * l.cantidad)}</strong></td>
        <td><button class="quitar" type="button" data-quitar="${l.pres.id}" aria-label="Quitar ${esc(l.producto.nombre)}">✕</button></td>
      </tr>`).join('') + '</tbody></table>';
  }

  const total = totalCentimos();
  const base = Math.round(total / (1 + IGV));
  $('totales').innerHTML = `
    <div><dt>Subtotal:</dt><dd>${soles(base / 100)}</dd></div>
    <div><dt>IGV (18%):</dt><dd>${soles((total - base) / 100)}</dd></div>
    <div class="gran"><dt>Total:</dt><dd>${soles(total / 100)}</dd></div>`;
  $('cobrar').disabled = !carrito.length;
  dibujarProductos();
}

function dibujarCategorias(categorias) {
  const todas = [{ id: 0, nombre: 'Todos' }, ...categorias];
  $('cats').innerHTML = todas.map((c) =>
    `<button type="button" class="chip-cat${c.id === categoriaActiva ? ' activa' : ''}" data-cat="${c.id}">${esc(c.nombre)}</button>`).join('');
}

function dibujarProductos() {
  const q = sinTildes($('q').value.trim());
  const lista = productos.filter((p) =>
    (!categoriaActiva || p.categoria_id === categoriaActiva) &&
    (!q || sinTildes(p.nombre).includes(q) || sinTildes(p.generico).includes(q) || p.codigo_barras.includes(q)));

  if (!lista.length) {
    $('productos').innerHTML = '<p class="vacio">No se encontraron productos.</p>';
    return;
  }
  $('productos').innerHTML = lista.map((p) => {
    const agotado = p.stock_vigente <= 0;
    const enCarrito = unidadesEnCarrito(p.id);
    const disp = p.stock_vigente - enCarrito;
    const botones = p.presentaciones.map((pr) => {
      const sin = agotado || pr.unidades > disp;
      return `<button type="button" class="pres" data-prod="${p.id}" data-pres="${pr.id}" ${sin ? 'disabled' : ''}>
        <span>${etiquetaPres(pr)}</span><b>${soles(pr.precio)}</b></button>`;
    }).join('');
    return `<article class="pv-prod${agotado ? ' agotado' : ''}">
      <div class="pv-ico${p.imagen ? ' con-foto' : ''}">${p.imagen ? `<img src="img/productos/${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">` : '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 3.5l10 10a3.5 3.5 0 0 1-5 5l-10-10a3.5 3.5 0 0 1 5-5zM8 8l5 5"/></svg>'}</div>
      <h3>${esc(p.nombre)}</h3>
      <p class="pv-meta">${agotado ? '<span class="sin">Agotado</span>' : `Stock: ${disp}`}${p.requiere_receta ? ' · <b class="rx">Receta</b>' : ''}</p>
      <div class="pv-pres">${botones}</div>
    </article>`;
  }).join('');
}

async function cargarProductos() {
  try {
    const [pr, ca] = await Promise.all([api('productos.php?limit=200'), api('categorias.php')]);
    productos = pr.productos.filter((p) => p.activo && p.presentaciones.length);
    const usadas = new Set(productos.map((p) => p.categoria_id));
    dibujarCategorias(ca.categorias.filter((c) => usadas.has(c.id)));
    dibujarProductos();
  } catch (e) {
    $('productos').innerHTML = `<p class="error-bloque">No se pudieron cargar los productos. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
  }
}

/* Cobro */
function abrirCobro() {
  if (!carrito.length) return;
  $('m-total').textContent = soles(totalCentimos() / 100);
  $('m-error').classList.remove('visible');
  $('recibido').value = '';
  $('vuelto').textContent = '';
  $('m-receta').hidden = !carrito.some((l) => l.producto.requiere_receta);
  actualizarPago();
  $('m-cobro').showModal();
}

function actualizarPago() {
  const pago = document.querySelector('input[name=pago]:checked').value;
  $('m-efectivo').hidden = pago !== 'efectivo';
}

function actualizarVuelto() {
  const recibido = centimos($('recibido').value || 0);
  const total = totalCentimos();
  const el = $('vuelto');
  if (!recibido) { el.textContent = ''; el.className = 'vuelto'; return; }
  if (recibido >= total) { el.textContent = `Vuelto: ${soles((recibido - total) / 100)}`; el.className = 'vuelto ok'; }
  else { el.textContent = `Faltan ${soles((total - recibido) / 100)}`; el.className = 'vuelto falta'; }
}

async function buscarCliente() {
  const doc = $('documento').value.trim();
  const estado = $('cli-estado');
  clienteId = null;
  $('cli-nombre').hidden = true;
  if (!/^(\d{8}|\d{11})$/.test(doc)) {
    estado.textContent = 'Ingresa un DNI de 8 dígitos o un RUC de 11.';
    estado.className = 'm-ayuda mal';
    return;
  }
  try {
    const r = await api('clientes.php?documento=' + doc);
    if (r.clientes.length) {
      clienteId = r.clientes[0].id;
      estado.textContent = `Cliente: ${r.clientes[0].nombre}`;
      estado.className = 'm-ayuda bien';
    } else {
      estado.textContent = 'No está registrado. Escribe su nombre para registrarlo al cobrar.';
      estado.className = 'm-ayuda';
      $('cli-nombre').hidden = false;
      $('cli-nombre').focus();
    }
  } catch (e) {
    estado.textContent = e.message;
    estado.className = 'm-ayuda mal';
  }
}

function errorCobro(texto) {
  const e = $('m-error');
  e.textContent = texto;
  e.classList.add('visible');
}

async function confirmarCobro(ev) {
  ev.preventDefault();
  $('m-error').classList.remove('visible');
  const pago = document.querySelector('input[name=pago]:checked').value;
  const conReceta = carrito.some((l) => l.producto.requiere_receta);
  const medico = $('medico').value.trim();
  if (conReceta && !medico) { errorCobro('Ingresa el nombre del médico: hay productos que requieren receta.'); $('medico').focus(); return; }

  const doc = $('documento').value.trim();
  if (doc && !clienteId && $('cli-nombre').hidden) { errorCobro('Busca al cliente o borra el documento para vender como «Cliente general».'); return; }
  if (doc && !clienteId && !$('cli-nombre').value.trim()) { errorCobro('Escribe el nombre del nuevo cliente.'); $('cli-nombre').focus(); return; }

  const boton = $('m-confirmar');
  boton.disabled = true;
  boton.textContent = 'Registrando…';
  try {
    let cid = clienteId;
    if (doc && !cid) {
      cid = (await api('clientes.php', { method: 'POST', body: { documento: doc, nombre: $('cli-nombre').value.trim() } })).id;
    }
    const cuerpo = {
      medio_pago: pago,
      items: carrito.map((l) => ({ producto_id: l.producto.id, presentacion_id: l.pres.id, cantidad: l.cantidad })),
    };
    if (cid) cuerpo.cliente_id = cid;
    if (conReceta) cuerpo.receta = { medico, cmp: $('cmp').value.trim() };

    const r = await api('ventas.php', { method: 'POST', body: cuerpo });
    const total = totalCentimos();
    const recibido = centimos($('recibido').value || 0);
    ultimoVuelto = pago === 'efectivo' && recibido >= total && recibido > 0 ? `Vuelto: ${soles((recibido - total) / 100)}` : '';
    $('m-cobro').close();
    mostrarExito(r);
  } catch (e) {
    if (e.status === 401) { location.replace('login.html'); return; }
    errorCobro(e.message);
    if (e.status === 409) cargarProductos();
  } finally {
    boton.disabled = false;
    boton.textContent = 'Confirmar cobro';
  }
}

function mostrarExito(r) {
  $('ok-numero').textContent = 'N.° ' + 'V-' + String(r.venta_id).padStart(4, '0');
  $('ok-lista').innerHTML = r.items.map((i) => `<li><span class="prod-celda">${fotoProd(i.imagen)}<span>${esc(i.producto)}</span></span><b>${soles(i.importe)}</b></li>`).join('');
  $('ok-total').textContent = soles(r.total);
  $('ok-vuelto').textContent = ultimoVuelto;
  $('m-ok').showModal();
}

function reiniciar() {
  carrito = [];
  clienteId = null;
  $('documento').value = '';
  $('cli-nombre').value = '';
  $('cli-nombre').hidden = true;
  $('cli-estado').textContent = 'Sin cliente: se registra como «Cliente general».';
  $('cli-estado').className = 'm-ayuda';
  $('medico').value = '';
  $('cmp').value = '';
  dibujarCarrito();
}

(async () => {
  const usuario = await iniciarApp('venta');
  if (!usuario) return;
  dibujarCarrito();
  cargarProductos();

  $('q').addEventListener('input', dibujarProductos);
  $('q').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    const exacto = productos.find((p) => p.codigo_barras === q);
    const lista = productos.filter((p) => sinTildes(p.nombre).includes(sinTildes(q)) || sinTildes(p.generico).includes(sinTildes(q)));
    const elegido = exacto || (lista.length === 1 ? lista[0] : null);
    if (!elegido) { avisar(lista.length ? 'Hay varios resultados: elige uno de la lista.' : 'No se encontró el producto.'); return; }
    const pres = [...elegido.presentaciones].sort((a, b) => a.unidades - b.unidades)[0];
    agregar(elegido, pres);
    $('q').value = '';
    dibujarProductos();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F9') { e.preventDefault(); $('q').focus(); $('q').select(); }
  });

  $('cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    categoriaActiva = Number(b.dataset.cat);
    document.querySelectorAll('.chip-cat').forEach((c) => c.classList.toggle('activa', c === b));
    dibujarProductos();
  });
  $('productos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pres]');
    if (!b) return;
    const p = productos.find((x) => x.id === Number(b.dataset.prod));
    agregar(p, p.presentaciones.find((x) => x.id === Number(b.dataset.pres)));
  });

  $('lineas').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const val = (k) => Number(t.dataset[k]);
    const linea = (id) => carrito.find((l) => l.pres.id === id);
    if (t.dataset.mas) cambiarCantidad(val('mas'), linea(val('mas')).cantidad + 1);
    else if (t.dataset.menos) cambiarCantidad(val('menos'), linea(val('menos')).cantidad - 1);
    else if (t.dataset.quitar) cambiarCantidad(val('quitar'), 0);
  });
  $('lineas').addEventListener('change', (e) => {
    if (e.target.dataset.cant) cambiarCantidad(Number(e.target.dataset.cant), e.target.value);
  });

  $('limpiar').addEventListener('click', () => { if (carrito.length) reiniciar(); });
  $('cancelar').addEventListener('click', () => {
    if (!carrito.length || confirm('¿Cancelar la venta? Se descartarán los productos agregados.')) {
      reiniciar();
      location.href = 'inicio.html';
    }
  });
  $('cobrar').addEventListener('click', abrirCobro);

  $('pagos').addEventListener('change', actualizarPago);
  $('recibido').addEventListener('input', actualizarVuelto);
  $('buscar-cli').addEventListener('click', buscarCliente);
  $('documento').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCliente(); } });
  $('documento').addEventListener('input', () => {
    clienteId = null;
    $('cli-nombre').hidden = true;
    $('cli-estado').textContent = 'Sin cliente: se registra como «Cliente general».';
    $('cli-estado').className = 'm-ayuda';
  });
  $('f-cobro').addEventListener('submit', confirmarCobro);
  $('m-volver').addEventListener('click', () => $('m-cobro').close());

  $('ok-imprimir').addEventListener('click', () => window.print());
  $('ok-nueva').addEventListener('click', () => { $('m-ok').close(); reiniciar(); cargarProductos(); $('q').focus(); });
})();
