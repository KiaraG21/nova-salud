<?php
// GET  /api/clientes.php?documento=12345678   busca por DNI o RUC exacto
// GET  /api/clientes.php?q=maria              busca por nombre o documento
// GET  /api/clientes.php?id=2                 cliente con su historial de compras
// POST /api/clientes.php                      crea  {documento, nombre, telefono?}
// PUT  /api/clientes.php?id=2                 edita
// Acceso: vendedor y administrador.
require __DIR__ . '/../src/helpers.php';

function datos_cliente(array $b, array $actual = []): array
{
    $d = array_merge($actual, array_intersect_key($b, array_flip(['documento', 'nombre', 'telefono'])));
    $d['documento'] = trim((string) ($d['documento'] ?? ''));
    $d['nombre'] = trim((string) ($d['nombre'] ?? ''));
    if (!preg_match('/^(\d{8}|\d{11})$/', $d['documento'])) {
        fail('El documento debe ser un DNI de 8 dígitos o un RUC de 11', 422);
    }
    if ($d['nombre'] === '') {
        fail('Indica el nombre del cliente', 422);
    }
    $d['telefono'] = trim((string) ($d['telefono'] ?? '')) ?: null;
    return $d;
}

$u = require_role('vendedor');

if (method() === 'GET') {
    if (isset($_GET['id'])) {
        $st = db()->prepare('SELECT id, documento, nombre, telefono FROM clientes WHERE id = ?');
        $st->execute([(int) $_GET['id']]);
        $c = $st->fetch();
        if (!$c) {
            fail('Cliente no encontrado', 404);
        }
        $c = castear([$c], ['id'])[0];
        $st = db()->prepare('SELECT id, fecha, total, medio_pago, estado FROM ventas WHERE cliente_id = ? ORDER BY fecha DESC LIMIT 20');
        $st->execute([$c['id']]);
        $c['compras'] = castear($st->fetchAll(), ['id'], ['total']);
        $st = db()->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM ventas WHERE cliente_id = ? AND estado = 'emitida'");
        $st->execute([$c['id']]);
        $r = $st->fetch();
        $c['total_comprado'] = (float) $r['total'];
        $c['cantidad_compras'] = (int) $r['n'];
        respond(['cliente' => $c]);
    }
    $where = ['1 = 1'];
    $params = [];
    if (isset($_GET['documento'])) {
        $where[] = 'documento = ?';
        $params[] = trim((string) $_GET['documento']);
    }
    if (isset($_GET['q']) && trim($_GET['q']) !== '') {
        $where[] = '(nombre LIKE ? OR documento LIKE ?)';
        $like = '%' . trim($_GET['q']) . '%';
        array_push($params, $like, $like);
    }
    $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $st = db()->prepare('SELECT id, documento, nombre, telefono FROM clientes WHERE ' . implode(' AND ', $where) . " ORDER BY nombre LIMIT $limit OFFSET $offset");
    $st->execute($params);
    respond(['clientes' => castear($st->fetchAll(), ['id'])]);
}

if (method() === 'POST') {
    $d = datos_cliente(body());
    $pdo = db();
    $pdo->prepare('INSERT INTO clientes (documento, nombre, telefono) VALUES (?,?,?)')
        ->execute([$d['documento'], $d['nombre'], $d['telefono']]);
    $id = (int) $pdo->lastInsertId();
    audit($pdo, $u['id'], 'crear', 'cliente', $id, null, $d);
    respond(['id' => $id], 201);
}

if (method() === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    $st = db()->prepare('SELECT documento, nombre, telefono FROM clientes WHERE id = ?');
    $st->execute([$id]);
    $antes = $st->fetch();
    if (!$antes) {
        fail('Cliente no encontrado', 404);
    }
    $d = datos_cliente(body(), $antes);
    db()->prepare('UPDATE clientes SET documento = ?, nombre = ?, telefono = ? WHERE id = ?')
        ->execute([$d['documento'], $d['nombre'], $d['telefono'], $id]);
    audit(db(), $u['id'], 'editar', 'cliente', $id, $antes, $d);
    respond(['ok' => true]);
}

fail('Método no permitido', 405);
