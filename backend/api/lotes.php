<?php
// GET  /api/lotes.php?producto_id=1   lotes de un producto, el que vence primero arriba
// POST /api/lotes.php                 ingreso de mercadería (almacén)
//   {proveedor_id, items:[{producto_id, numero_lote, fecha_vencimiento:"YYYY-MM-DD", cantidad, costo_unitario}]}
require __DIR__ . '/../src/helpers.php';

if (method() === 'GET') {
    require_login();
    $pid = (int) ($_GET['producto_id'] ?? 0);
    if ($pid < 1) {
        fail('Indica producto_id', 422);
    }
    $st = db()->prepare('SELECT id, numero_lote, fecha_vencimiento, cantidad_inicial, cantidad_disponible, costo_unitario,
                                DATEDIFF(fecha_vencimiento, CURDATE()) AS dias_restantes
                         FROM lotes WHERE producto_id = ? ORDER BY fecha_vencimiento, id');
    $st->execute([$pid]);
    respond(['lotes' => castear($st->fetchAll(), ['id', 'cantidad_inicial', 'cantidad_disponible', 'dias_restantes'], ['costo_unitario'])]);
}

if (method() === 'POST') {
    $u = require_role('almacen');
    $b = body();
    $prov = (int) ($b['proveedor_id'] ?? 0);
    $items = $b['items'] ?? [];
    if ($prov < 1 || !is_array($items) || count($items) === 0) {
        fail('Indica el proveedor y al menos un producto', 422);
    }
    $hoy = date('Y-m-d');
    foreach ($items as $i => $it) {
        $n = $i + 1;
        $f = (string) ($it['fecha_vencimiento'] ?? '');
        $d = DateTime::createFromFormat('Y-m-d', $f);
        if (!$d || $d->format('Y-m-d') !== $f) {
            fail("Ítem $n: la fecha de vencimiento debe tener formato AAAA-MM-DD", 422);
        }
        if ($f <= $hoy) {
            fail("Ítem $n: el lote ya está vencido o vence hoy", 422);
        }
        if ((int) ($it['producto_id'] ?? 0) < 1 || trim((string) ($it['numero_lote'] ?? '')) === ''
            || (int) ($it['cantidad'] ?? 0) < 1 || !is_numeric($it['costo_unitario'] ?? null) || $it['costo_unitario'] < 0) {
            fail("Ítem $n: revisa producto, lote, cantidad y costo", 422);
        }
    }

    $res = transaction(function (PDO $pdo) use ($prov, $items, $u) {
        $st = $pdo->prepare('SELECT 1 FROM proveedores WHERE id = ?');
        $st->execute([$prov]);
        if (!$st->fetch()) {
            fail('Proveedor no encontrado', 404);
        }
        $pdo->prepare('INSERT INTO compras (proveedor_id, usuario_id, total) VALUES (?,?,0)')->execute([$prov, $u['id']]);
        $compraId = (int) $pdo->lastInsertId();
        $total = 0.0;
        $ids = [];
        $chk = $pdo->prepare('SELECT 1 FROM productos WHERE id = ? AND activo = 1');
        $insL = $pdo->prepare('INSERT INTO lotes (producto_id, proveedor_id, numero_lote, fecha_vencimiento, cantidad_inicial, cantidad_disponible, costo_unitario) VALUES (?,?,?,?,?,?,?)');
        $insD = $pdo->prepare('INSERT INTO detalle_compra (compra_id, producto_id, lote_id, cantidad, costo_unitario) VALUES (?,?,?,?,?)');
        foreach ($items as $i => $it) {
            $chk->execute([(int) $it['producto_id']]);
            if (!$chk->fetch()) {
                fail('Ítem ' . ($i + 1) . ': producto no encontrado', 404);
            }
            $cant = (int) $it['cantidad'];
            $costo = round((float) $it['costo_unitario'], 2);
            $insL->execute([(int) $it['producto_id'], $prov, trim($it['numero_lote']), $it['fecha_vencimiento'], $cant, $cant, $costo]);
            $loteId = (int) $pdo->lastInsertId();
            $insD->execute([$compraId, (int) $it['producto_id'], $loteId, $cant, $costo]);
            $ids[] = $loteId;
            $total += $cant * $costo;
        }
        $pdo->prepare('UPDATE compras SET total = ? WHERE id = ?')->execute([round($total, 2), $compraId]);
        audit($pdo, $u['id'], 'ingreso_mercaderia', 'compra', $compraId, null, ['items' => count($items), 'total' => round($total, 2)]);
        sincronizar_alertas($pdo);   // cierra las alertas de stock que ya se repusieron
        return ['compra_id' => $compraId, 'total' => round($total, 2), 'lotes' => $ids];
    });
    respond($res, 201);
}

fail('Método no permitido', 405);
