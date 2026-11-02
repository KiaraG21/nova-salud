<?php
// GET  /api/alertas.php                  alertas activas (stock bajo, por vencer, vencidos)
// POST /api/alertas.php?accion=atender&id=3   marca una alerta como atendida (almacén)
require __DIR__ . '/../src/helpers.php';

if (method() === 'GET') {
    require_login();
    sincronizar_alertas(db());
    $st = db()->query("SELECT a.id, a.tipo, a.producto_id, p.nombre AS producto, p.imagen, a.lote_id, l.numero_lote, a.mensaje, a.fecha
                       FROM alertas a JOIN productos p ON p.id = a.producto_id
                       LEFT JOIN lotes l ON l.id = a.lote_id
                       WHERE a.estado = 'activa'
                       ORDER BY FIELD(a.tipo, 'vencido', 'stock_bajo', 'por_vencer'), a.fecha DESC");
    $alertas = castear($st->fetchAll(), ['id', 'producto_id', 'lote_id']);
    $resumen = ['stock_bajo' => 0, 'por_vencer' => 0, 'vencido' => 0];
    foreach ($alertas as $a) {
        $resumen[$a['tipo']]++;
    }
    respond(['resumen' => $resumen, 'alertas' => $alertas]);
}

if (method() === 'POST' && ($_GET['accion'] ?? '') === 'atender') {
    $u = require_role('almacen');
    $id = (int) ($_GET['id'] ?? 0);
    $st = db()->prepare("UPDATE alertas SET estado = 'atendida' WHERE id = ? AND estado = 'activa'");
    $st->execute([$id]);
    if ($st->rowCount() === 0) {
        fail('Alerta no encontrada o ya atendida', 404);
    }
    audit(db(), $u['id'], 'atender_alerta', 'alerta', $id);
    respond(['ok' => true]);
}

fail('Método no permitido', 405);
