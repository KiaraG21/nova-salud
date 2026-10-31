<?php
// GET /api/auditoria.php?accion=venta&usuario_id=1&desde=2026-10-01&hasta=2026-10-31&limit=50&offset=0
// Solo administrador, solo lectura.
require __DIR__ . '/../src/helpers.php';

require_role('administrador');
if (method() !== 'GET') {
    fail('Método no permitido', 405);
}

$where = ['1 = 1'];
$params = [];
if (!empty($_GET['accion'])) {
    $where[] = 'a.accion = ?';
    $params[] = (string) $_GET['accion'];
}
if (!empty($_GET['usuario_id'])) {
    $where[] = 'a.usuario_id = ?';
    $params[] = (int) $_GET['usuario_id'];
}
if (!empty($_GET['desde'])) {
    $where[] = 'a.fecha >= ?';
    $params[] = (string) $_GET['desde'];
}
if (!empty($_GET['hasta'])) {
    $where[] = 'a.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
    $params[] = (string) $_GET['hasta'];
}
$limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
$offset = max(0, (int) ($_GET['offset'] ?? 0));
$cond = implode(' AND ', $where);

$st = db()->prepare("SELECT COUNT(*) FROM auditoria a WHERE $cond");
$st->execute($params);
$total = (int) $st->fetchColumn();

$st = db()->prepare("SELECT a.id, a.fecha, a.usuario_id, u.nombre AS usuario, a.accion, a.entidad, a.entidad_id,
                            a.valor_anterior, a.valor_nuevo
                     FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
                     WHERE $cond ORDER BY a.id DESC LIMIT $limit OFFSET $offset");
$st->execute($params);
$filas = castear($st->fetchAll(), ['id', 'usuario_id', 'entidad_id']);
foreach ($filas as &$f) {
    $f['valor_anterior'] = $f['valor_anterior'] !== null ? json_decode($f['valor_anterior'], true) : null;
    $f['valor_nuevo'] = $f['valor_nuevo'] !== null ? json_decode($f['valor_nuevo'], true) : null;
}
unset($f);

$acciones = db()->query('SELECT DISTINCT accion FROM auditoria ORDER BY accion')->fetchAll(PDO::FETCH_COLUMN);
respond(['total' => $total, 'acciones' => $acciones, 'filas' => $filas]);
