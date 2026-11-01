const PAGO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', mixto: 'Mixto' };

const ALERTA = {
  stock_bajo: { titulo: 'Producto con stock bajo', clase: 'naranja', icono: 'M12 3v10M8 10l4 4 4-4M5 20h14' },
  por_vencer: { titulo: 'Lote por vencer', clase: 'amarillo', icono: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
  vencido: { titulo: 'Producto vencido', clase: 'oscuro', icono: 'M5 12l5 5 9-10' },
};

const trazo = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${d}"/></svg>`;

function curva(valores, color, relleno = false) {
  const max = Math.max(...valores, 1);
  const pts = valores.map((v, i) => [i * (100 / (valores.length - 1)), 26 - (v / max) * 22]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function kpi(clase, icono, valor, titulo, detalle, spark) {
  return `<div class="kpi">
    <span class="k-icono ${clase}">${icono}</span>
    <div class="k-texto"><strong>${valor}</strong><span class="k-titulo">${titulo}</span>${detalle ? `<span class="k-detalle">${detalle}</span>` : ''}</div>
    ${spark}
  </div>`;
}

function detalleVariacion(v) {
  if (v === null || v === undefined) return 'Sin ventas ayer para comparar';
  if (v === 0) return 'Igual que ayer';
  return `<span class="${v < 0 ? 'baja' : 'sube'}">${v > 0 ? '↑ +' : '↓ '}${v.toLocaleString('es-PE')}%</span>`;
}

function pasoLindo(maximo) {
  const bruto = Math.max(maximo, 100) / 4;
  const base = Math.pow(10, Math.floor(Math.log10(bruto)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 10]) if (base * m >= bruto) return base * m;
  return base * 10;
}

function graficoVentas(dias) {
  const W = 640, H = 270, izq = 54, der = 12, arriba = 14, abajo = 32;
  const paso = pasoLindo(Math.max(...dias.map((d) => d.total)));
  const tope = paso * 4;
  const ancho = (W - izq - der) / dias.length;
  const alto = H - arriba - abajo;
  const y = (v) => arriba + alto - (v / tope) * alto;

  let rejilla = '';
  for (let i = 0; i <= 4; i++) {
    const v = paso * i;
    rejilla += `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" stroke="${i ? '#e4e0f7' : '#cfc8f0'}" stroke-dasharray="${i ? '4 4' : ''}"/>
      <text x="${izq - 10}" y="${y(v) + 4}" text-anchor="end" class="g-eje">${v.toLocaleString('es-PE')}</text>`;
  }

  const hoy = dias.length - 1;
  const barras = dias.map((d, i) => {
    const bw = Math.min(40, ancho * 0.5);
    const x = izq + ancho * i + (ancho - bw) / 2;
    const h = Math.max((d.total / tope) * alto, d.total > 0 ? 3 : 0);
    const etiqueta = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '');
    return `<g>
      <title>${etiqueta} ${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}: ${soles(d.total)}</title>
      ${h ? `<rect x="${x}" y="${y(d.total)}" width="${bw}" height="${h}" rx="6" fill="${i === hoy ? 'url(#g-hoy)' : 'url(#g-dia)'}"/>` : ''}
      <text x="${izq + ancho * i + ancho / 2}" y="${H - 10}" text-anchor="middle" class="g-eje">${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}</text>
    </g>`;
  }).join('');

  const centro = (i) => izq + ancho * i + ancho / 2;
  const puntos = dias.map((d, i) => `${centro(i)},${y(d.total)}`).join(' ');
  const puntosSvg = dias.map((d, i) => `<circle cx="${centro(i)}" cy="${y(d.total)}" r="4" fill="#fff" stroke="#7c5ce6" stroke-width="2"/>`).join('');
  const sinVentas = dias.every((d) => d.total === 0);

  return `<svg class="grafico-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas de los últimos 7 días">
    <defs>
      <linearGradient id="g-dia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7a4f5"/><stop offset="1" stop-color="#d9d0fa"/></linearGradient>
      <linearGradient id="g-hoy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d49df"/><stop offset="1" stop-color="#4320b5"/></linearGradient>
    </defs>
    ${rejilla}${barras}
    ${sinVentas ? '' : `<polyline points="${puntos}" fill="none" stroke="#7c5ce6" stroke-width="2" stroke-linejoin="round"/>${puntosSvg}`}
  </svg>${sinVentas ? '<p class="vacio">Aún no hay ventas en los últimos 7 días.</p>' : ''}`;
}

(async () => {
  const usuario = await iniciarApp('inicio');
  if (!usuario) return;
  document.getElementById('bienvenida').textContent = `¡Bienvenido, ${usuario.nombre.split(/\s+/)[0]}!`;

  try {
    const r = await api('resumen.php');
    const v = r.ventas_hoy;
    const serie = r.ventas_7_dias.map((d) => d.total);
    mostrarInsignias(r.alertas_activas);

    document.getElementById('tarjetas').innerHTML =
      kpi('morado', trazo('M3 4h2l2.4 11h10.2L20 7H6M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01'), soles(v.total), usuario.rol === 'vendedor' ? 'Mis ventas hoy' : 'Ventas hoy', detalleVariacion(v.variacion_vs_ayer_pct), curva(serie, '#7c5ce6')) +
      kpi('naranja', trazo('M12 3l10 18H2zM12 10v5M12 18v.01'), r.alertas_activas, 'Alertas activas', '', curva([3, 5, 4, 6, 5, 7, 6], '#f59e0b')) +
      kpi('violeta', trazo('M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8'), r.productos_en_stock.toLocaleString('es-PE'), 'Productos en stock', '', curva([4, 3, 5, 4, 6, 5, 7], '#4320b5')) +
      kpi('rosa', trazo('M5 5h14v16H5zM5 10h14M9 3v4M15 3v4'), r.lotes_por_vencer, 'Lotes por vencer', '', curva([2, 4, 3, 5, 4, 6, 5], '#ec4899'));

    document.getElementById('grafico').innerHTML = graficoVentas(r.ventas_7_dias);

    document.getElementById('ver-alertas').innerHTML = enlaceModulo('alertas', 'Ver todas →');
    document.getElementById('alertas').innerHTML = r.alertas_recientes.length
      ? '<ul class="lista-alertas">' + r.alertas_recientes.slice(0, 3).map((a) => {
        const t = ALERTA[a.tipo] || ALERTA.stock_bajo;
        return `<li>
          ${a.imagen ? fotoProd(a.imagen, 'grande') : `<span class="a-icono ${t.clase}">${trazo(t.icono)}</span>`}
          <div class="a-texto"><strong>${t.titulo}</strong><small>${esc(a.producto)}</small></div>
          <time>${hace(a.fecha)}</time>
        </li>`;
      }).join('') + '</ul>'
      : '<p class="vacio">No hay alertas activas. Todo en orden.</p>';

    document.getElementById('ver-ventas').innerHTML = enlaceModulo('ventas', 'Ver historial →');
    document.getElementById('ventas').innerHTML = r.ventas_recientes.length
      ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>N.° Venta</th><th>Fecha</th><th>Cliente</th><th class="der">Total</th><th>Medio de pago</th><th>Estado</th></tr></thead><tbody>` +
        r.ventas_recientes.map((x) => `<tr>
          <td><strong>${esc(x.numero)}</strong></td>
          <td>${fechaHora(x.fecha)}</td>
          <td>${esc(x.cliente || 'Cliente general')}</td>
          <td class="der">${soles(x.total)}</td>
          <td>${PAGO[x.medio_pago] || esc(x.medio_pago)}</td>
          <td><span class="chip ${x.estado === 'anulada' ? 'chip-rojo' : 'chip-verde'}">${x.estado === 'anulada' ? 'Anulada' : 'Emitida'}</span></td>
        </tr>`).join('') + '</tbody></table></div>'
      : '<p class="vacio">Aún no hay ventas registradas.</p>';
  } catch (e) {
    document.getElementById('tarjetas').innerHTML = '';
    document.getElementById('grafico').innerHTML =
      `<p class="error-bloque">No se pudo cargar el resumen. ${esc(e.message)} <button class="btn btn-borde" onclick="location.reload()">Reintentar</button></p>`;
    document.getElementById('alertas').innerHTML = '';
    document.getElementById('ventas').innerHTML = '';
  }
})();
