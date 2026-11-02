<?php
declare(strict_types=1);

date_default_timezone_set('America/Lima');

class ApiError extends Exception
{
    public function __construct(string $message, public int $status = 400)
    {
        parent::__construct($message);
    }
}

function cfg(): array
{
    static $c = null;
    return $c ??= require __DIR__ . '/../config/config.php';
}

/* ---------- Sesión y respuesta ---------- */
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');

set_exception_handler(function (Throwable $e) {
    if ($e instanceof ApiError) {
        http_response_code($e->status);
        echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        return;
    }
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062) {
        http_response_code(409);
        echo json_encode(['error' => 'Ya existe un registro con ese código, documento, RUC o correo'], JSON_UNESCAPED_UNICODE);
        return;
    }
    error_log((string) $e);
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor'], JSON_UNESCAPED_UNICODE);
});

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function fail(string $message, int $status = 400): never
{
    throw new ApiError($message, $status);
}

function method(): string
{
    return $_SERVER['REQUEST_METHOD'];
}

function body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('El cuerpo de la petición debe ser JSON válido', 400);
    }
    return $data;
}

/* ---------- Base de datos ---------- */
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg()['db'];
        $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4";
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,   // consultas preparadas reales
        ]);
    }
    return $pdo;
}

function transaction(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn($pdo);
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/* ---------- Autenticación y roles ---------- */
function require_login(): array
{
    $u = $_SESSION['user'] ?? null;
    $limite = cfg()['sesion_minutos'] * 60;
    if ($u && isset($_SESSION['last']) && time() - $_SESSION['last'] > $limite) {
        $_SESSION = [];
        session_destroy();
        $u = null;
    }
    if (!$u) {
        fail('Debes iniciar sesión', 401);
    }
    $_SESSION['last'] = time();
    return $u;
}

/** El administrador siempre tiene acceso; los demás deben estar en la lista. */
function require_role(string ...$roles): array
{
    $u = require_login();
    if ($u['rol'] !== 'administrador' && !in_array($u['rol'], $roles, true)) {
        fail('No tienes permiso para esta acción', 403);
    }
    return $u;
}

/* ---------- Utilidades de salida ---------- */
/** MySQL devuelve los decimales como texto; los convertimos a número para el front. */
function castear(array $filas, array $enteros = [], array $decimales = []): array
{
    foreach ($filas as &$f) {
        foreach ($enteros as $k) {
            if (isset($f[$k])) {
                $f[$k] = (int) $f[$k];
            }
        }
        foreach ($decimales as $k) {
            if (isset($f[$k])) {
                $f[$k] = (float) $f[$k];
            }
        }
    }
    return $filas;
}

/* ---------- Auditoría ---------- */
function audit(PDO $pdo, ?int $usuarioId, string $accion, string $entidad, ?int $entidadId, mixed $antes = null, mixed $despues = null): void
{
    $pdo->prepare(
        'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, valor_anterior, valor_nuevo) VALUES (?,?,?,?,?,?)'
    )->execute([
        $usuarioId, $accion, $entidad, $entidadId,
        $antes === null ? null : json_encode($antes, JSON_UNESCAPED_UNICODE),
        $despues === null ? null : json_encode($despues, JSON_UNESCAPED_UNICODE),
    ]);
}

/* ---------- Alertas ---------- */
/** Crea las alertas que falten y cierra las que ya no aplican. */
function sincronizar_alertas(PDO $pdo): void
{
    // Una alerta atendida a mano no se vuelve a crear mientras la condición siga igual;
    // cuando la condición desaparece pasa a 'resuelta' y, si vuelve, se genera una nueva.
    $pdo->exec("
        INSERT INTO alertas (tipo, producto_id, mensaje)
        SELECT 'stock_bajo', s.producto_id,
               CONCAT('Stock bajo: ', s.nombre, ' (', s.stock_vigente, ' de mínimo ', s.stock_minimo, ')')
        FROM v_stock_producto s
        WHERE s.bajo_minimo = 1
          AND NOT EXISTS (SELECT 1 FROM alertas a
                          WHERE a.tipo = 'stock_bajo' AND a.estado IN ('activa','atendida') AND a.producto_id = s.producto_id)");
    // Lotes por vencer y vencidos
    $pdo->exec("
        INSERT INTO alertas (tipo, producto_id, lote_id, mensaje)
        SELECT IF(v.dias_restantes < 0, 'vencido', 'por_vencer'), l.producto_id, v.lote_id,
               CONCAT(IF(v.dias_restantes < 0, 'Lote vencido: ', 'Lote por vencer: '), v.nombre,
                      ' · lote ', v.numero_lote, ' (', v.fecha_vencimiento, ')')
        FROM v_lotes_por_vencer v JOIN lotes l ON l.id = v.lote_id
        WHERE NOT EXISTS (SELECT 1 FROM alertas a
                          WHERE a.lote_id = v.lote_id AND a.estado IN ('activa','atendida')
                            AND a.tipo = IF(v.dias_restantes < 0, 'vencido', 'por_vencer'))");
    // Cerrar alertas de stock que ya se resolvieron
    $pdo->exec("
        UPDATE alertas SET estado = 'resuelta'
        WHERE tipo = 'stock_bajo' AND estado IN ('activa','atendida')
          AND producto_id IN (SELECT producto_id FROM v_stock_producto WHERE bajo_minimo = 0)");
    // Cerrar alertas de lotes agotados, y las "por vencer" de lotes que ya vencieron (ahora tienen su alerta de vencido)
    $pdo->exec("
        UPDATE alertas a JOIN lotes l ON l.id = a.lote_id
        SET a.estado = 'resuelta'
        WHERE a.estado IN ('activa','atendida') AND a.tipo IN ('por_vencer','vencido')
          AND (l.cantidad_disponible = 0 OR (a.tipo = 'por_vencer' AND l.fecha_vencimiento < CURDATE()))");
}
