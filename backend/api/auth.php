<?php
// POST /api/auth.php?accion=login   {correo, password}
// POST /api/auth.php?accion=logout
// GET  /api/auth.php?accion=me
require __DIR__ . '/../src/helpers.php';

$accion = $_GET['accion'] ?? '';

if (method() === 'POST' && $accion === 'login') {
    $b = body();
    $correo = trim((string) ($b['correo'] ?? ''));
    $pass = (string) ($b['password'] ?? '');
    if ($correo === '' || $pass === '') {
        fail('Ingresa tu correo y tu contraseña', 422);
    }
    $st = db()->prepare('SELECT id, nombre, correo, password_hash, rol FROM usuarios WHERE correo = ? AND activo = 1');
    $st->execute([$correo]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        fail('Correo o contraseña incorrectos', 401);
    }
    session_regenerate_id(true);
    $_SESSION['user'] = ['id' => (int) $u['id'], 'nombre' => $u['nombre'], 'correo' => $u['correo'], 'rol' => $u['rol']];
    $_SESSION['last'] = time();
    audit(db(), (int) $u['id'], 'login', 'usuario', (int) $u['id']);
    respond(['usuario' => $_SESSION['user']]);
}

if (method() === 'POST' && $accion === 'logout') {
    $_SESSION = [];
    session_destroy();
    respond(['ok' => true]);
}

if (method() === 'GET' && $accion === 'me') {
    respond(['usuario' => require_login()]);
}

fail('Acción no válida', 404);
