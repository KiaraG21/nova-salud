<?php
// POST /api/ventas.php                      registra una venta (vendedor)
//   {medio_pago, cliente_id?, receta?:{medico, cmp}, items:[{producto_id, presentacion_id, cantidad}]}
// GET  /api/ventas.php?id=5                 una venta con su detalle
// GET  /api/ventas.php?desde=&hasta=        listado (el vendedor ve solo las suyas; filtros: vendedor_id, medio_pago, estado)
// POST /api/ventas.php?accion=anular&id=5   anula con motivo (administrador) {motivo}
require __DIR__ . '/../src/helpers.php';

$accion = $_GET['accion'] ?? '';

/* ---------- Consultar ---------- */
if (method() === 'GET') {
    $u = require_login();
    if ($u['rol'] === 'almacen') {
        fail('No tienes permiso para esta acción', 403);
    }
    if (isset($_GET['id'])) {
        $st = db()->prepare('SELECT v.id, v.fecha, v.medio_pago, v.total, v.estado, v.motivo_anulacion,
                                    v.receta_medico, v.receta_cmp, v.usuario_id, u.nombre AS vendedor, c.nombre AS cliente, c.documento AS cliente_documento
                             FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
                             LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?');
        $st->execute([(int) $_GET['id']]);
        $venta = $st->fetch();
        if (!$venta) {
            fail('Venta no encontrada', 404);
        }
        if ($u['rol'] === 'vendedor' && (int) $venta['usuario_id'] !== $u['id']) {
            fail('Solo puedes ver tus propias ventas', 403);
        }
        $st = db()->prepare('SELECT p.nombre AS producto, p.imagen, pr.tipo AS presentacion, d.cantidad, d.unidades_descontadas,
                                    l.numero_lote, d.precio, d.subtotal
                             FROM detalle_venta d
                             JOIN productos p ON p.id = d.producto_id
                             JOIN presentaciones pr ON pr.id = d.presentacion_id
                             JOIN lotes l ON l.id = d.lote_id
                             WHERE d.venta_id = ? ORDER BY d.id');
        $st->execute([$venta['id']]);
        $venta = castear([$venta], ['id', 'usuario_id'], ['total'])[0];
        $venta['numero'] = sprintf('V-%04d', $venta['id']);
        $venta['detalle'] = castear($st->fetchAll(), ['unidades_descontadas'], ['cantidad', 'precio', 'subtotal']);
        respond(['venta' => $venta]);
    }
    // Listado: el vendedor ve solo sus ventas; el administrador ve todas y puede filtrar
    $desde = $_GET['desde'] ?? date('Y-m-d');
    $hasta = $_GET['hasta'] ?? date('Y-m-d');
    $where = ['v.fecha >= ?', 'v.fecha < DATE_ADD(?, INTERVAL 1 DAY)'];
    $params = [$desde, $hasta];
    if ($u['rol'] === 'vendedor') {
        $where[] = 'v.usuario_id = ?';
        $params[] = $u['id'];
    } elseif (!empty($_GET['vendedor_id'])) {
        $where[] = 'v.usuario_id = ?';
        $params[] = (int) $_GET['vendedor_id'];
    }
    if (!empty($_GET['medio_pago'])) {
        $where[] = 'v.medio_pago = ?';
        $params[] = (string) $_GET['medio_pago'];
    }
    if (!empty($_GET['estado'])) {
        $where[] = 'v.estado = ?';
        $params[] = (string) $_GET['estado'];
    }
    $st = db()->prepare('SELECT v.id, v.fecha, v.medio_pago, v.total, v.estado,     u.nombre AS vendedor, c.nombre AS cliente, c.documento AS cliente_documento
                         FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
                         LEFT JOIN clientes c ON c.id = v.cliente_id
                         WHERE ' . implode(' AND ', $where) . ' ORDER BY v.fecha DESC, v.id DESC LIMIT 500');
    $st->execute($params);
    $ventas = castear($st->fetchAll(), ['id'], ['total']);
    foreach ($ventas as &$v) {
        $v['numero'] = sprintf('V-%04d', $v['id']);
    }
    unset($v);
    respond(['ventas' => $ventas]);
}

/* ---------- Anular ---------- */
if (method() === 'POST' && $accion === 'anular') {
    $u = require_role('administrador');
    $id = (int) ($_GET['id'] ?? 0);
    $motivo = trim((string) (body()['motivo'] ?? ''));
    if ($motivo === '') {
        fail('Indica el motivo de la anulación', 422);
    }
    transaction(function (PDO $pdo) use ($id, $motivo, $u) {
        $st = $pdo->prepare('SELECT estado FROM ventas WHERE id = ? FOR UPDATE');
        $st->execute([$id]);
        $v = $st->fetch();
        if (!$v) {
            fail('Venta no encontrada', 404);
        }
        if ($v['estado'] === 'anulada') {
            fail('La venta ya está anulada', 409);
        }
        $st = $pdo->prepare('SELECT lote_id, unidades_descontadas FROM detalle_venta WHERE venta_id = ?');
        $st->execute([$id]);
        $upd = $pdo->prepare('UPDATE lotes SET cantidad_disponible = cantidad_disponible + ? WHERE id = ?');
        foreach ($st->fetchAll() as $d) {
            $upd->execute([(int) $d['unidades_descontadas'], (int) $d['lote_id']]);   // devuelve el stock al lote
        }
        $pdo->prepare("UPDATE ventas SET estado = 'anulada', motivo_anulacion = ? WHERE id = ?")->execute([$motivo, $id]);
        audit($pdo, $u['id'], 'anular', 'venta', $id, ['estado' => 'emitida'], ['estado' => 'anulada', 'motivo' => $motivo]);
        sincronizar_alertas($pdo);
    });
    respond(['ok' => true]);
}

/* ---------- Registrar venta ---------- */
if (method() === 'POST') {
    $u = require_role('vendedor');
    $b = body();

    $medio = (string) ($b['medio_pago'] ?? '');
    if (!in_array($medio, ['efectivo', 'tarjeta', 'yape', 'plin', 'mixto'], true)) {
        fail('Medio de pago inválido', 422);
    }
    $items = $b['items'] ?? [];
    if (!is_array($items) || count($items) === 0) {
        fail('La venta no tiene productos', 422);
    }
    $clienteId = !empty($b['cliente_id']) ? (int) $b['cliente_id'] : null;
    $receta = is_array($b['receta'] ?? null) ? $b['receta'] : [];

    $resultado = transaction(function (PDO $pdo) use ($items, $medio, $clienteId, $receta, $u) {
        if ($clienteId !== null) {
            $st = $pdo->prepare('SELECT 1 FROM clientes WHERE id = ?');
            $st->execute([$clienteId]);
            if (!$st->fetch()) {
                fail('Cliente no encontrado', 404);
            }
        }

        $stProd = $pdo->prepare('SELECT p.nombre, p.imagen, p.requiere_receta, pr.unidades, pr.precio
                                 FROM productos p JOIN presentaciones pr ON pr.producto_id = p.id
                                 WHERE p.id = ? AND pr.id = ? AND p.activo = 1');
        // FEFO: primero los lotes que vencen antes; FOR UPDATE bloquea las filas durante la venta
        $stLotes = $pdo->prepare('SELECT id, numero_lote, cantidad_disponible FROM lotes
                                  WHERE producto_id = ? AND cantidad_disponible > 0 AND fecha_vencimiento >= CURDATE()
                                  ORDER BY fecha_vencimiento ASC, id ASC FOR UPDATE');
        $descuenta = $pdo->prepare('UPDATE lotes SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?');

        $lineas = [];
        $total = 0.0;
        foreach ($items as $n => $it) {
            $num = $n + 1;
            $pid = (int) ($it['producto_id'] ?? 0);
            $presId = (int) ($it['presentacion_id'] ?? 0);
            $cant = (float) ($it['cantidad'] ?? 0);
            if ($pid < 1 || $presId < 1 || $cant <= 0) {
                fail("Producto $num: datos incompletos", 422);
            }
            $stProd->execute([$pid, $presId]);
            $row = $stProd->fetch();
            if (!$row) {
                fail("Producto $num: no existe o la presentación no le corresponde", 422);
            }
            if ($row['requiere_receta'] && trim((string) ($receta['medico'] ?? '')) === '') {
                fail("«{$row['nombre']}» requiere receta: registra el médico y su CMP", 422);
            }
            $unidadesF = $cant * (int) $row['unidades'];
            if (abs($unidadesF - round($unidadesF)) > 1e-9) {
                fail("Producto $num: la cantidad no equivale a unidades enteras", 422);
            }
            $unidades = (int) round($unidadesF);
            $importe = round($cant * (float) $row['precio'], 2);

            $stLotes->execute([$pid]);
            $falta = $unidades;
            $asignado = [];
            foreach ($stLotes->fetchAll() as $l) {
                if ($falta <= 0) {
                    break;
                }
                $toma = min($falta, (int) $l['cantidad_disponible']);
                $asignado[] = ['lote_id' => (int) $l['id'], 'numero_lote' => $l['numero_lote'], 'unidades' => $toma];
                $falta -= $toma;
            }
            if ($falta > 0) {
                fail("Stock insuficiente de «{$row['nombre']}»: faltan $falta unidades", 409);
            }
            foreach ($asignado as $a) {
                $descuenta->execute([$a['unidades'], $a['lote_id']]);
            }
            $lineas[] = ['producto_id' => $pid, 'presentacion_id' => $presId, 'nombre' => $row['nombre'], 'imagen' => $row['imagen'],
                         'precio' => (float) $row['precio'], 'presentacion_unidades' => (int) $row['unidades'],
                         'unidades' => $unidades, 'importe' => $importe, 'asignado' => $asignado];
            $total += $importe;
        }
        $total = round($total, 2);

        $pdo->prepare('INSERT INTO ventas (usuario_id, cliente_id, medio_pago, total, receta_medico, receta_cmp) VALUES (?,?,?,?,?,?)')
            ->execute([$u['id'], $clienteId, $medio, $total,
                       trim((string) ($receta['medico'] ?? '')) ?: null, trim((string) ($receta['cmp'] ?? '')) ?: null]);
        $ventaId = (int) $pdo->lastInsertId();

        $insD = $pdo->prepare('INSERT INTO detalle_venta (venta_id, producto_id, lote_id, presentacion_id, cantidad, unidades_descontadas, precio, subtotal) VALUES (?,?,?,?,?,?,?,?)');
        $comprobante = [];
        foreach ($lineas as $ln) {
            $acum = 0.0;
            $ult = count($ln['asignado']) - 1;
            foreach ($ln['asignado'] as $j => $a) {
                // el último tramo absorbe el redondeo para que la suma cuadre con el importe
                $sub = $j === $ult ? round($ln['importe'] - $acum, 2) : round($ln['importe'] * $a['unidades'] / $ln['unidades'], 2);
                $acum += $sub;
                $insD->execute([$ventaId, $ln['producto_id'], $a['lote_id'], $ln['presentacion_id'],
                                round($a['unidades'] / $ln['presentacion_unidades'], 3), $a['unidades'], $ln['precio'], $sub]);
            }
            $comprobante[] = ['producto' => $ln['nombre'], 'imagen' => $ln['imagen'], 'unidades' => $ln['unidades'], 'importe' => $ln['importe'],
                              'lotes' => array_column($ln['asignado'], 'numero_lote')];
        }
        audit($pdo, $u['id'], 'venta', 'venta', $ventaId, null, ['total' => $total, 'medio_pago' => $medio, 'lineas' => count($lineas)]);
        sincronizar_alertas($pdo);
        return ['venta_id' => $ventaId, 'total' => $total, 'medio_pago' => $medio, 'items' => $comprobante];
    });
    respond($resultado, 201);
}

fail('Método no permitido', 405);
