<?php
// GET  /api/productos.php?q=para        busca por nombre, genérico o código
// GET  /api/productos.php?barcode=...   busca por código de barras exacto
// GET  /api/productos.php?id=1          un producto
// Otros filtros: categoria_id, estado (en_stock, stock_bajo, agotado, por_vencer, vencido), limit, offset
// POST /api/productos.php               crea producto (administrador o almacén)
// PUT  /api/productos.php?id=1          edita (los precios solo el administrador)
require __DIR__ . '/../src/helpers.php';

const TIPOS_PRESENTACION = ['unidad', 'blister', 'caja'];

function validar_presentaciones(mixed $lista): array
{
    if (!is_array($lista) || count($lista) === 0) {
        fail('Agrega al menos una presentación', 422);
    }
    $vistos = [];
    foreach ($lista as $p) {
        $tipo = $p['tipo'] ?? '';
        $unid = (int) ($p['unidades'] ?? 0);
        $precio = $p['precio'] ?? null;
        if (!in_array($tipo, TIPOS_PRESENTACION, true) || $unid < 1 || !is_numeric($precio) || $precio < 0) {
            fail('Presentación inválida: revisa tipo, unidades y precio', 422);
        }
        if (isset($vistos[$tipo])) {
            fail("La presentación «$tipo» está repetida", 422);
        }
        $vistos[$tipo] = true;
    }
    return $lista;
}

if (method() === 'GET') {
    $u = require_login();
    $where = [];
    $params = [];
    $ver_inactivos = !empty($_GET['incluir_inactivos']) && in_array($u['rol'], ['administrador', 'almacen'], true);
    if (!$ver_inactivos) {
        $where[] = 'p.activo = 1';
    }
    if (isset($_GET['id'])) {
        $where[] = 'p.id = ?';
        $params[] = (int) $_GET['id'];
    }
    if (isset($_GET['barcode'])) {
        $where[] = 'p.codigo_barras = ?';
        $params[] = (string) $_GET['barcode'];
    }
    if (isset($_GET['q']) && trim($_GET['q']) !== '') {
        $where[] = '(p.nombre LIKE ? OR p.generico LIKE ? OR p.codigo_barras LIKE ?)';
        $like = '%' . trim($_GET['q']) . '%';
        array_push($params, $like, $like, $like);
    }
    if (!empty($_GET['categoria_id'])) {
        $where[] = 'p.categoria_id = ?';
        $params[] = (int) $_GET['categoria_id'];
    }
    // Filtro por estado (pestañas de Inventario). stock_bajo incluye los agotados.
    $estado = (string) ($_GET['estado'] ?? (!empty($_GET['solo_bajo']) ? 'stock_bajo' : ''));
    $por_estado = [
        'en_stock' => 'COALESCE(s.stock_vigente, 0) >= p.stock_minimo',
        'stock_bajo' => 'COALESCE(s.stock_vigente, 0) < p.stock_minimo',
        'agotado' => 'COALESCE(s.stock_vigente, 0) = 0',
        'por_vencer' => 'EXISTS (SELECT 1 FROM lotes l WHERE l.producto_id = p.id AND l.cantidad_disponible > 0
                                 AND l.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY))',
        'vencido' => 'EXISTS (SELECT 1 FROM lotes l WHERE l.producto_id = p.id AND l.cantidad_disponible > 0
                              AND l.fecha_vencimiento < CURDATE())',
    ];
    if ($estado !== '') {
        if (!isset($por_estado[$estado])) {
            fail('Estado inválido. Usa: ' . implode(', ', array_keys($por_estado)), 422);
        }
        $where[] = $por_estado[$estado];
    }
    $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $cond = $where ? implode(' AND ', $where) : '1 = 1';
    $from = "FROM productos p JOIN categorias c ON c.id = p.categoria_id
             LEFT JOIN v_stock_producto s ON s.producto_id = p.id WHERE $cond";

    $st = db()->prepare("SELECT COUNT(*) $from");
    $st->execute($params);
    $total = (int) $st->fetchColumn();

    $sql = "SELECT p.id, p.codigo_barras, p.nombre, p.generico, p.laboratorio, p.categoria_id,
                   c.nombre AS categoria, p.stock_minimo, p.requiere_receta, p.activo,
                   COALESCE(s.stock_vigente, 0) AS stock_vigente,
                   (SELECT MIN(l.fecha_vencimiento) FROM lotes l WHERE l.producto_id = p.id
                      AND l.cantidad_disponible > 0 AND l.fecha_vencimiento >= CURDATE()) AS proximo_vencimiento,
                   (SELECT COUNT(*) FROM lotes l WHERE l.producto_id = p.id AND l.cantidad_disponible > 0
                      AND l.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)) AS lotes_por_vencer,
                   (SELECT COUNT(*) FROM lotes l WHERE l.producto_id = p.id AND l.cantidad_disponible > 0
                      AND l.fecha_vencimiento < CURDATE()) AS lotes_vencidos
            $from ORDER BY p.nombre LIMIT $limit OFFSET $offset";
    $st = db()->prepare($sql);
    $st->execute($params);
    $productos = castear($st->fetchAll(), ['id', 'categoria_id', 'stock_minimo', 'stock_vigente', 'lotes_por_vencer', 'lotes_vencidos']);

    if ($productos) {
        $ids = array_column($productos, 'id');
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = db()->prepare("SELECT id, producto_id, tipo, unidades, precio FROM presentaciones WHERE producto_id IN ($in) ORDER BY unidades");
        $st->execute($ids);
        $por = [];
        foreach (castear($st->fetchAll(), ['id', 'producto_id', 'unidades'], ['precio']) as $pr) {
            $por[$pr['producto_id']][] = $pr;
        }
        foreach ($productos as &$p) {
            $p['presentaciones'] = $por[$p['id']] ?? [];
            $p['requiere_receta'] = (bool) $p['requiere_receta'];
            $p['activo'] = (bool) $p['activo'];
            $p['estado_stock'] = $p['stock_vigente'] === 0 ? 'agotado' : ($p['stock_vigente'] < $p['stock_minimo'] ? 'stock_bajo' : 'en_stock');
        }
        unset($p);
    }
    respond(['total' => $total, 'productos' => $productos]);
}

if (method() === 'POST') {
    $u = require_role('almacen');
    $b = body();
    $codigo = trim((string) ($b['codigo_barras'] ?? ''));
    $nombre = trim((string) ($b['nombre'] ?? ''));
    $cat = (int) ($b['categoria_id'] ?? 0);
    $min = (int) ($b['stock_minimo'] ?? -1);
    if ($codigo === '' || $nombre === '' || $cat < 1 || $min < 0) {
        fail('Completa código de barras, nombre, categoría y stock mínimo', 422);
    }
    $presentaciones = validar_presentaciones($b['presentaciones'] ?? null);

    $id = transaction(function (PDO $pdo) use ($b, $codigo, $nombre, $cat, $min, $presentaciones, $u) {
        $pdo->prepare('INSERT INTO productos (codigo_barras, nombre, generico, laboratorio, categoria_id, stock_minimo, requiere_receta) VALUES (?,?,?,?,?,?,?)')
            ->execute([$codigo, $nombre, $b['generico'] ?? null, $b['laboratorio'] ?? null, $cat, $min, !empty($b['requiere_receta']) ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
        $ins = $pdo->prepare('INSERT INTO presentaciones (producto_id, tipo, unidades, precio) VALUES (?,?,?,?)');
        foreach ($presentaciones as $p) {
            $ins->execute([$id, $p['tipo'], (int) $p['unidades'], round((float) $p['precio'], 2)]);
        }
        audit($pdo, $u['id'], 'crear', 'producto', $id, null, ['nombre' => $nombre, 'codigo_barras' => $codigo]);
        return $id;
    });
    respond(['id' => $id], 201);
}

if (method() === 'PUT') {
    $u = require_role('almacen');
    $id = (int) ($_GET['id'] ?? 0);
    $b = body();
    $st = db()->prepare('SELECT nombre, generico, laboratorio, categoria_id, stock_minimo, requiere_receta, activo FROM productos WHERE id = ?');
    $st->execute([$id]);
    $antes = $st->fetch();
    if (!$antes) {
        fail('Producto no encontrado', 404);
    }
    $permitidos = ['nombre', 'generico', 'laboratorio', 'categoria_id', 'stock_minimo', 'requiere_receta', 'activo'];
    $set = [];
    $vals = [];
    foreach ($permitidos as $campo) {
        if (array_key_exists($campo, $b)) {
            $set[] = "$campo = ?";
            $vals[] = $b[$campo];
        }
    }
    if (isset($b['presentaciones']) && $u['rol'] !== 'administrador') {
        fail('Solo el administrador puede cambiar precios', 403);
    }
    transaction(function (PDO $pdo) use ($id, $set, $vals, $b, $antes, $u) {
        if ($set) {
            $pdo->prepare('UPDATE productos SET ' . implode(', ', $set) . ' WHERE id = ?')->execute([...$vals, $id]);
        }
        foreach ($b['presentaciones'] ?? [] as $p) {
            $pdo->prepare('UPDATE presentaciones SET precio = ? WHERE id = ? AND producto_id = ?')
                ->execute([round((float) $p['precio'], 2), (int) $p['id'], $id]);
        }
        audit($pdo, $u['id'], 'editar', 'producto', $id, $antes, $b);
    });
    respond(['ok' => true]);
}

fail('Método no permitido', 405);
