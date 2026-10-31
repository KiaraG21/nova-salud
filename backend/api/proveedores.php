<?php
// GET  /api/proveedores.php            lista (filtro opcional ?q=)
// GET  /api/proveedores.php?id=1       un proveedor
// POST /api/proveedores.php            crea  {razon_social, ruc, telefono?, correo?}
// PUT  /api/proveedores.php?id=1       edita
// Acceso: almacén y administrador.
require __DIR__ . '/../src/helpers.php';

function datos_proveedor(array $b, array $actual = []): array
{
    $d = array_merge($actual, array_intersect_key($b, array_flip(['razon_social', 'ruc', 'telefono', 'correo'])));
    $d['razon_social'] = trim((string) ($d['razon_social'] ?? ''));
    $d['ruc'] = trim((string) ($d['ruc'] ?? ''));
    if ($d['razon_social'] === '' || !preg_match('/^\d{11}$/', $d['ruc'])) {
        fail('Indica la razón social y un RUC de 11 dígitos', 422);
    }
    $d['telefono'] = trim((string) ($d['telefono'] ?? '')) ?: null;
    $d['correo'] = trim((string) ($d['correo'] ?? '')) ?: null;
    if ($d['correo'] !== null && !filter_var($d['correo'], FILTER_VALIDATE_EMAIL)) {
        fail('El correo del proveedor no es válido', 422);
    }
    return $d;
}

$u = require_role('almacen');

if (method() === 'GET') {
    $where = ['1 = 1'];
    $params = [];
    if (isset($_GET['id'])) {
        $where[] = 'id = ?';
        $params[] = (int) $_GET['id'];
    }
    if (isset($_GET['q']) && trim($_GET['q']) !== '') {
        $where[] = '(razon_social LIKE ? OR ruc LIKE ?)';
        $like = '%' . trim($_GET['q']) . '%';
        array_push($params, $like, $like);
    }
    $st = db()->prepare('SELECT id, razon_social, ruc, telefono, correo FROM proveedores WHERE ' . implode(' AND ', $where) . ' ORDER BY razon_social LIMIT 200');
    $st->execute($params);
    respond(['proveedores' => castear($st->fetchAll(), ['id'])]);
}

if (method() === 'POST') {
    $d = datos_proveedor(body());
    $pdo = db();
    $pdo->prepare('INSERT INTO proveedores (razon_social, ruc, telefono, correo) VALUES (?,?,?,?)')
        ->execute([$d['razon_social'], $d['ruc'], $d['telefono'], $d['correo']]);
    $id = (int) $pdo->lastInsertId();
    audit($pdo, $u['id'], 'crear', 'proveedor', $id, null, $d);
    respond(['id' => $id], 201);
}

if (method() === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    $st = db()->prepare('SELECT razon_social, ruc, telefono, correo FROM proveedores WHERE id = ?');
    $st->execute([$id]);
    $antes = $st->fetch();
    if (!$antes) {
        fail('Proveedor no encontrado', 404);
    }
    $d = datos_proveedor(body(), $antes);
    db()->prepare('UPDATE proveedores SET razon_social = ?, ruc = ?, telefono = ?, correo = ? WHERE id = ?')
        ->execute([$d['razon_social'], $d['ruc'], $d['telefono'], $d['correo'], $id]);
    audit(db(), $u['id'], 'editar', 'proveedor', $id, $antes, $d);
    respond(['ok' => true]);
}

fail('Método no permitido', 405);
