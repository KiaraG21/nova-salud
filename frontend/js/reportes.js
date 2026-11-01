const TITULOS = { ventas_dia: 'Ventas por día', top_productos: 'Productos más vendidos', stock_critico: 'Stock crítico' };

let tipo = 'ventas_dia';
let pedido = 0;

const $ = (id) => document.getElementById(id);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rango() {
  const hoy = new Date();
  const p = $('rep-periodo').value;
  if (p === 'mes') return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy];
  if (p === 'mes_ant') return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 0)];
  return [new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (Number(p) - 1)), hoy];
}

async function cargar() {
  const mio = ++pedido;
  $('rep-titulo').textContent = TITULOS[tipo];
  $('rep-periodo-caja').hidden = tipo === 'stock_critico';
  $('rep-resumen').innerHTML = '';
  $('rep-cuerpo').innerHTML = '<p class="vacio">Cargando…</p>';
  const [d, h] = rango();
  const params = new URLSearchParams({ tipo, desde: iso(d), hasta: iso(h) });
  try {
    const r = await api('reportes.php?' + params);
    if (mio !== pedido) return;
    if (tipo === 'ventas_dia') ventasDia(r.filas, d, h);
    else if (tipo === 'top_productos') topProductos(r.filas);
    else stockCritico(r.filas);
  } catch (e) {
    if (mio !== pedido) return;
    if (e.status === 401) { location.replace('login.html'); return; }
    $('rep-cuerpo').innerHTML = `<p class="error-bloque">No se pudo cargar el reporte. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
  }
}

function escala(max) {
  const paso = Math.pow(10, Math.floor(Math.log10(max || 1)));
  const sube = [1, 2, 2.5, 5, 10].map((m) => m * paso).find((p) => p * 4 >= max) || paso * 10;
  return { paso: sube, tope: sube * 4 };
}

function ventasDia(filas, desde, hasta) {
  const porDia = new Map(filas.map((f) => [String(f.dia).slice(0, 10), f]));
  const dias = [];
  for (let d = new Date(desde); iso(d) <= iso(hasta); d.setDate(d.getDate() + 1)) {
    const f = porDia.get(iso(d));
    dias.push({ fecha: new Date(d), total: f ? f.total : 0, ventas: f ? f.ventas : 0 });
  }
  const total = dias.reduce((s, x) => s + x.total, 0);
  const nVentas = dias.reduce((s, x) => s + x.ventas, 0);
  $('rep-resumen').innerHTML = `<div><span>Total vendido</span><b>${soles(total)}</b></div><div><span>Ventas emitidas</span><b>${nVentas}</b></div><div><span>Ticket promedio</span><b>${soles(nVentas ? total / nVentas : 0)}</b></div>`;
  if (!nVentas) { $('rep-cuerpo').innerHTML = '<p class="vacio">No hay ventas emitidas en este periodo.</p>'; return; }

  const W = 640, H = 280, L = 52, R = 16, T = 16, B = 34;
  const { paso, tope } = escala(Math.max(...dias.map((x) => x.total)));
  const x = (i) => L + (dias.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (dias.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / tope);
  let rejilla = '';
  for (let v = 0; v <= tope; v += paso) rejilla += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-rej"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="g-txt">${v}</text>`;
  const cada = Math.ceil(dias.length / 8);
  const etiquetas = dias.map((dd, i) => (i % cada === 0 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="g-txt">${dd.fecha.getDate()}/${dd.fecha.getMonth() + 1}</text>` : '')).join('');
  const linea = dias.map((dd, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(dd.total).toFixed(1)}`).join(' ');
  const area = `${linea} L${x(dias.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const puntos = dias.map((dd, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(dd.total).toFixed(1)}" r="${dd.total ? 4.5 : 2.5}" class="g-pto"><title>${dd.fecha.toLocaleDateString('es-PE')}: ${soles(dd.total)} (${dd.ventas} ${dd.ventas === 1 ? 'venta' : 'ventas'})</title></circle>`).join('');
  $('rep-cuerpo').innerHTML = `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas por día en soles">${rejilla}${etiquetas}<path d="${area}" class="g-area"/><path d="${linea}" class="g-linea"/>${puntos}</svg><p class="g-pie">Montos en soles (S/). Pasa el cursor sobre un punto para ver el detalle.</p>`;
}

function topProductos(filas) {
  if (!filas.length) { $('rep-cuerpo').innerHTML = '<p class="vacio">No hay ventas emitidas en este periodo.</p>'; return; }
  const max = Math.max(...filas.map((f) => f.unidades));
  $('rep-cuerpo').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>#</th><th>Producto</th><th>Unidades vendidas</th><th class="der">Ingresos</th></tr></thead>
    <tbody>${filas.map((f, i) => `<tr><td>${i + 1}</td><td>${celdaProd(f.nombre, f.imagen)}</td>
      <td><div class="barra"><span style="width:${Math.max(4, (f.unidades / max) * 100)}%"></span><b>${f.unidades}</b></div></td>
      <td class="der"><b>${soles(f.ingresos)}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function stockCritico(filas) {
  if (!filas.length) { $('rep-cuerpo').innerHTML = '<p class="vacio">Ningún producto está por debajo de su stock mínimo. 🎉</p>'; return; }
  $('rep-resumen').innerHTML = `<div><span>Productos bajo el mínimo</span><b>${filas.length}</b></div>`;
  $('rep-cuerpo').innerHTML = `<div class="tabla-wrap"><table class="tabla tabla-cuadro">
    <thead><tr><th>Producto</th><th class="der">Stock actual</th><th class="der">Stock mínimo</th><th>Estado</th></tr></thead>
    <tbody>${filas.map((f) => `<tr><td>${celdaProd(f.nombre, f.imagen)}</td><td class="der"><b>${f.stock_vigente}</b></td><td class="der">${f.stock_minimo}</td>
      <td><span class="chip ${f.stock_vigente === 0 ? 'chip-rojo' : 'chip-por_vencer'}">${f.stock_vigente === 0 ? 'Agotado' : 'Stock bajo'}</span></td></tr>`).join('')}</tbody></table></div>`;
}

(async () => {
  const usuario = await iniciarApp('reportes');
  if (!usuario) return;
  if (usuario.rol !== 'administrador') { location.replace('inicio.html'); return; }
  cargar();
  $('rep-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    tipo = b.dataset.tipo;
    document.querySelectorAll('.rep-op').forEach((o) => o.classList.toggle('activa', o === b));
    cargar();
  });
  $('rep-periodo').addEventListener('change', cargar);
})();
