<?php
// GET /api/compras.php?desde=&hasta=   historial de ingresos de mercadería
// GET /api/compras.php?id=1            un ingreso con su detalle
// Acceso: almacén y administrador. Para registrar un ingreso se usa POST /api/lotes.php
require __DIR__ . '/../src/helpers.php';

require_role('almacen');
if (method() !== 'GET') {
    fail('Método no permitido', 405);
}

if (isset($_GET['id'])) {
    $st = db()->prepare('SELECT c.id, c.fecha, c.total, p.razon_social AS proveedor, u.nombre AS registrado_por
                         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id JOIN usuarios u ON u.id = c.usuario_id
                         WHERE c.id = ?');
    $st->execute([(int) $_GET['id']]);
    $compra = $st->fetch();
    if (!$compra) {
        fail('Ingreso no encontrado', 404);
    }
    $compra = castear([$compra], ['id'], ['total'])[0];
    $st = db()->prepare('SELECT pr.nombre AS producto, l.numero_lote, l.fecha_vencimiento, d.cantidad, d.costo_unitario
                         FROM detalle_compra d JOIN productos pr ON pr.id = d.producto_id JOIN lotes l ON l.id = d.lote_id
                         WHERE d.compra_id = ? ORDER BY d.id');
    $st->execute([$compra['id']]);
    $compra['items'] = castear($st->fetchAll(), ['cantidad'], ['costo_unitario']);
    respond(['compra' => $compra]);
}

$desde = $_GET['desde'] ?? date('Y-m-d', strtotime('-90 days'));
$hasta = $_GET['hasta'] ?? date('Y-m-d');
$st = db()->prepare('SELECT c.id, c.fecha, p.razon_social AS proveedor, u.nombre AS registrado_por, c.total,
                            (SELECT COUNT(*) FROM detalle_compra d WHERE d.compra_id = c.id) AS items
                     FROM compras c JOIN proveedores p ON p.id = c.proveedor_id JOIN usuarios u ON u.id = c.usuario_id
                     WHERE c.fecha >= ? AND c.fecha < DATE_ADD(?, INTERVAL 1 DAY)
                     ORDER BY c.fecha DESC, c.id DESC LIMIT 500');
$st->execute([$desde, $hasta]);
respond(['compras' => castear($st->fetchAll(), ['id', 'items'], ['total'])]);
