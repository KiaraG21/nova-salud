<?php
// GET /api/categorias.php   lista de categorías (filtros y formularios)
require __DIR__ . '/../src/helpers.php';

if (method() !== 'GET') {
    fail('Método no permitido', 405);
}
require_login();
$filas = db()->query('SELECT id, nombre FROM categorias ORDER BY nombre')->fetchAll();
respond(['categorias' => castear($filas, ['id'])]);
