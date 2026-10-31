<?php
// GET /api/reportes.php?tipo=ventas_dia&desde=2026-10-01&hasta=2026-10-31
// GET /api/reportes.php?tipo=top_productos&desde=...&hasta=...
// GET /api/reportes.php?tipo=stock_critico
require __DIR__ . '/../src/helpers.php';

require_role('administrador');
if (method() !== 'GET') {
    fail('Método no permitido', 405);
}
$tipo = $_GET['tipo'] ?? '';
$desde = $_GET['desde'] ?? date('Y-m-d', strtotime('-30 days'));
$hasta = $_GET['hasta'] ?? date('Y-m-d');

if ($tipo === 'ventas_dia') {
    $st = db()->prepare("SELECT DATE(fecha) AS dia, COUNT(*) AS ventas, SUM(total) AS total
                         FROM ventas WHERE estado = 'emitida' AND fecha >= ? AND fecha < DATE_ADD(?, INTERVAL 1 DAY)
                         GROUP BY DATE(fecha) ORDER BY dia");
    $st->execute([$desde, $hasta]);
    respond(['desde' => $desde, 'hasta' => $hasta, 'filas' => castear($st->fetchAll(), ['ventas', 'unidades'], ['total', 'ingresos'])]);
}

if ($tipo === 'top_productos') {
    $st = db()->prepare("SELECT p.nombre, SUM(d.unidades_descontadas) AS unidades, SUM(d.subtotal) AS ingresos
                         FROM detalle_venta d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id
                         WHERE v.estado = 'emitida' AND v.fecha >= ? AND v.fecha < DATE_ADD(?, INTERVAL 1 DAY)
                         GROUP BY p.id, p.nombre ORDER BY unidades DESC LIMIT 10");
    $st->execute([$desde, $hasta]);
    respond(['desde' => $desde, 'hasta' => $hasta, 'filas' => castear($st->fetchAll(), ['ventas', 'unidades'], ['total', 'ingresos'])]);
}

if ($tipo === 'stock_critico') {
    $st = db()->query('SELECT producto_id, nombre, stock_vigente, stock_minimo FROM v_stock_producto WHERE bajo_minimo = 1 ORDER BY nombre');
    respond(['filas' => castear($st->fetchAll(), ['producto_id', 'stock_vigente', 'stock_minimo'])]);
}

fail('Tipo de reporte no válido', 422);
