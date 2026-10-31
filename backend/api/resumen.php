<?php
// GET /api/resumen.php   datos del panel de inicio
// El vendedor ve solo sus propias ventas; administrador y almacén ven todas.
require __DIR__ . '/../src/helpers.php';

if (method() !== 'GET') {
    fail('Método no permitido', 405);
}
$u = require_login();
$pdo = db();
sincronizar_alertas($pdo);

$filtro = $u['rol'] === 'vendedor' ? ' AND usuario_id = ' . (int) $u['id'] : '';

$total_dia = function (string $dia) use ($pdo, $filtro): array {
    $r = $pdo->query("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad FROM ventas
                      WHERE estado = 'emitida' AND DATE(fecha) = $dia $filtro")->fetch();
    return ['total' => (float) $r['total'], 'cantidad' => (int) $r['cantidad']];
};
$hoy = $total_dia('CURDATE()');
$ayer = $total_dia('DATE_SUB(CURDATE(), INTERVAL 1 DAY)');
$variacion = $ayer['total'] > 0 ? round(($hoy['total'] - $ayer['total']) / $ayer['total'] * 100, 1) : null;

$stock_bajo = (int) $pdo->query('SELECT COUNT(*) FROM v_stock_producto WHERE bajo_minimo = 1')->fetchColumn();
$por_vencer = (int) $pdo->query('SELECT COUNT(DISTINCT l.producto_id) FROM v_lotes_por_vencer v JOIN lotes l ON l.id = v.lote_id WHERE v.dias_restantes >= 0')->fetchColumn();
$vencidos = (int) $pdo->query('SELECT COUNT(DISTINCT l.producto_id) FROM v_lotes_por_vencer v JOIN lotes l ON l.id = v.lote_id WHERE v.dias_restantes < 0')->fetchColumn();

$recientes = $pdo->query("SELECT v.id, v.fecha, c.nombre AS cliente, v.total, v.medio_pago, v.estado
                          FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
                          WHERE 1 = 1 " . str_replace('usuario_id', 'v.usuario_id', $filtro) . "
                          ORDER BY v.fecha DESC, v.id DESC LIMIT 5")->fetchAll();
$recientes = castear($recientes, ['id'], ['total']);
foreach ($recientes as &$v) {
    $v['numero'] = sprintf('V-%04d', $v['id']);
}
unset($v);

$alertas = $pdo->query("SELECT a.id, a.tipo, p.nombre AS producto, a.mensaje, a.fecha
                        FROM alertas a JOIN productos p ON p.id = a.producto_id
                        WHERE a.estado = 'activa'
                        ORDER BY FIELD(a.tipo, 'vencido', 'stock_bajo', 'por_vencer'), a.fecha DESC LIMIT 5")->fetchAll();

respond([
    'ventas_hoy' => ['total' => $hoy['total'], 'cantidad' => $hoy['cantidad'], 'variacion_vs_ayer_pct' => $variacion],
    'stock_bajo' => $stock_bajo,
    'por_vencer_60_dias' => $por_vencer,
    'vencidos' => $vencidos,
    'ventas_recientes' => $recientes,
    'alertas_recientes' => castear($alertas, ['id']),
]);
