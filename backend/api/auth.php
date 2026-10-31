<?php
// POST /api/auth.php?accion=login   {correo, password}
// POST /api/auth.php?accion=logout
// POST /api/auth.php?accion=cambiar_password   {actual, nueva, confirmar}
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
    // Máximo 5 intentos fallidos por correo cada 15 minutos
    $st = db()->prepare("SELECT COUNT(*) FROM auditoria WHERE accion = 'login_fallido' AND valor_nuevo = ? AND fecha > DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    $st->execute([json_encode($correo, JSON_UNESCAPED_UNICODE)]);
    if ((int) $st->fetchColumn() >= 5) {
        fail('Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo', 429);
    }
    $st = db()->prepare('SELECT id, nombre, correo, password_hash, rol FROM usuarios WHERE correo = ? AND activo = 1');
    $st->execute([$correo]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['password_hash'])) {
        audit(db(), null, 'login_fallido', 'usuario', null, null, $correo);
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

if (method() === 'POST' && $accion === 'cambiar_password') {
    $u = require_login();
    $b = body();
    $actual = (string) ($b['actual'] ?? '');
    $nueva = (string) ($b['nueva'] ?? '');
    if (strlen($nueva) < 8) {
        fail('La nueva contraseña debe tener al menos 8 caracteres', 422);
    }
    if ($nueva !== (string) ($b['confirmar'] ?? '')) {
        fail('La confirmación no coincide con la nueva contraseña', 422);
    }
    $st = db()->prepare('SELECT password_hash FROM usuarios WHERE id = ?');
    $st->execute([$u['id']]);
    $hash = (string) $st->fetchColumn();
    if (!password_verify($actual, $hash)) {
        fail('La contraseña actual es incorrecta', 422);
    }
    if (password_verify($nueva, $hash)) {
        fail('La nueva contraseña debe ser distinta de la actual', 422);
    }
    db()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')->execute([password_hash($nueva, PASSWORD_DEFAULT), $u['id']]);
    audit(db(), $u['id'], 'cambiar_password', 'usuario', $u['id']);
    respond(['ok' => true]);
}

fail('Acción no válida', 404);
