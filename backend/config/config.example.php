<?php
// Configuración del sistema. En XAMPP con el puerto cambiado, usa 3307.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3307,          // cambia a 3306 si usas el puerto estándar
        'name' => 'nova_salud',
        'user' => 'root',
        'pass' => '',
    ],
    'sesion_minutos' => 30,      // cierre de sesión por inactividad
];
