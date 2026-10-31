<?php
// GET  /api/usuarios.php             lista (filtro opcional ?q=)
// POST /api/usuarios.php             crea  {nombre, correo, rol, password}
// PUT  /api/usuarios.php?id=2        edita {nombre?, correo?, rol?, activo?, password?}
// Solo administrador. Los usuarios no se borran: se desactivan.
require __DIR__ . '/../src/helpers.php';

const ROLES = ['administrador', 'vendedor', 'almacen'];

function validar_password(string $p): void
{
    if (strlen($p) < 8) {
        fail('La contraseña debe tener al menos 8 caracteres', 422);
    }
}

$yo = require_role('administrador');

if (method() === 'GET') {
    $where = ['1 = 1'];
    $params = [];
    if (isset($_GET['q']) && trim($_GET['q']) !== '') {
        $where[] = '(nombre LIKE ? OR correo LIKE ?)';
        $like = '%' . trim($_GET['q']) . '%';
        array_push($params, $like, $like);
    }
    $st = db()->prepare('SELECT id, nombre, correo, rol, activo, creado_en FROM usuarios WHERE ' . implode(' AND ', $where) . ' ORDER BY nombre');
    $st->execute($params);
    $filas = castear($st->fetchAll(), ['id']);
    foreach ($filas as &$f) {
        $f['activo'] = (bool) $f['activo'];
    }
    respond(['usuarios' => $filas]);
}

if (method() === 'POST') {
    $b = body();
    $nombre = trim((string) ($b['nombre'] ?? ''));
    $correo = trim((string) ($b['correo'] ?? ''));
    $rol = (string) ($b['rol'] ?? '');
    $pass = (string) ($b['password'] ?? '');
    if ($nombre === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL) || !in_array($rol, ROLES, true)) {
        fail('Revisa el nombre, un correo válido y el rol', 422);
    }
    validar_password($pass);
    $pdo = db();
    $pdo->prepare('INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (?,?,?,?)')
        ->execute([$nombre, $correo, password_hash($pass, PASSWORD_DEFAULT), $rol]);
    $id = (int) $pdo->lastInsertId();
    audit($pdo, $yo['id'], 'crear', 'usuario', $id, null, ['nombre' => $nombre, 'correo' => $correo, 'rol' => $rol]);
    respond(['id' => $id], 201);
}

if (method() === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    $b = body();
    $st = db()->prepare('SELECT nombre, correo, rol, activo FROM usuarios WHERE id = ?');
    $st->execute([$id]);
    $antes = $st->fetch();
    if (!$antes) {
        fail('Usuario no encontrado', 404);
    }
    $set = [];
    $vals = [];
    if (array_key_exists('nombre', $b)) {
        $n = trim((string) $b['nombre']);
        if ($n === '') {
            fail('El nombre no puede estar vacío', 422);
        }
        $set[] = 'nombre = ?';
        $vals[] = $n;
    }
    if (array_key_exists('correo', $b)) {
        if (!filter_var($b['correo'], FILTER_VALIDATE_EMAIL)) {
            fail('El correo no es válido', 422);
        }
        $set[] = 'correo = ?';
        $vals[] = trim($b['correo']);
    }
    if (array_key_exists('rol', $b)) {
        if (!in_array($b['rol'], ROLES, true)) {
            fail('Rol inválido', 422);
        }
        $set[] = 'rol = ?';
        $vals[] = $b['rol'];
    }
    if (array_key_exists('activo', $b)) {
        $set[] = 'activo = ?';
        $vals[] = $b['activo'] ? 1 : 0;
    }
    if (!empty($b['password'])) {
        validar_password((string) $b['password']);
        $set[] = 'password_hash = ?';
        $vals[] = password_hash((string) $b['password'], PASSWORD_DEFAULT);
    }
    // Evita que el administrador se deje a sí mismo sin acceso
    if ($id === $yo['id'] && ((array_key_exists('activo', $b) && !$b['activo']) || (array_key_exists('rol', $b) && $b['rol'] !== 'administrador'))) {
        fail('No puedes desactivarte ni quitarte el rol de administrador a ti mismo', 409);
    }
    if (!$set) {
        fail('No hay cambios que guardar', 422);
    }
    db()->prepare('UPDATE usuarios SET ' . implode(', ', $set) . ' WHERE id = ?')->execute([...$vals, $id]);
    $cambios = array_diff_key($b, ['password' => 1]);
    audit(db(), $yo['id'], !empty($b['password']) ? 'editar_y_cambiar_password' : 'editar', 'usuario', $id, $antes, $cambios);
    respond(['ok' => true]);
}

fail('Método no permitido', 405);
