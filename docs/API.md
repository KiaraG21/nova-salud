# API de NovaSalud POS

API REST en PHP que responde **JSON**. La sesión se maneja con cookie (`PHPSESSID`) y expira a los **30 minutos de inactividad**.

## Cómo probarla en local (XAMPP)

1. Importa `database/nova_salud.sql` en phpMyAdmin.
2. Copia `backend/config/config.example.php` como `backend/config/config.php` y ajusta el puerto de MySQL (3307 o 3306).
3. Con Apache y MySQL encendidos, la API queda en:
   `http://localhost/nova-salud/backend/api/`
4. Si el front está en `http://localhost/nova-salud/frontend/`, usa rutas relativas como `../backend/api/auth.php`. Al ser el mismo servidor no hay problemas de CORS.

Usuarios de prueba:

| Correo | Contraseña | Rol |
|---|---|---|
| admin@novasalud.pe | Admin123! | administrador |
| vendedor@novasalud.pe | Vendedor123! | vendedor |
| almacen@novasalud.pe | Almacen123! | almacen |

## Convenciones

- Todas las peticiones con cuerpo envían `Content-Type: application/json`.
- Los errores devuelven `{ "error": "mensaje para mostrar al usuario" }` con el código HTTP correspondiente.
- Códigos usados: `200` ok, `201` creado, `400` JSON inválido, `401` sin sesión o sesión vencida, `403` sin permiso, `404` no existe, `405` método no permitido, `409` conflicto (stock insuficiente, venta ya anulada, dato duplicado), `422` datos inválidos, `500` error del servidor.
- Dinero en soles como número (`12.5`). Fechas `AAAA-MM-DD`. Stock siempre en **unidades**.
- **401:** el front debe mostrar "Tu sesión terminó" y volver al login.
- **403:** mostrar "No tienes permiso para esta acción".
- El administrador tiene acceso a todo. Abajo se indica qué rol necesita cada acción.

## Autenticación — `api/auth.php`

| Método y parámetro | Cuerpo | Respuesta |
|---|---|---|
| `POST ?accion=login` | `{ "correo", "password" }` | `{ "usuario": { id, nombre, correo, rol } }` |
| `POST ?accion=logout` | — | `{ "ok": true }` |
| `GET ?accion=me` | — | `{ "usuario": {...} }` (sirve para saber si hay sesión) |

`rol` es `administrador`, `vendedor` o `almacen`. Errores: `401` "Correo o contraseña incorrectos", `422` campos vacíos.

## Productos — `api/productos.php` (cualquier usuario con sesión puede consultar)

**GET** con filtros opcionales: `q` (nombre, genérico o código), `barcode` (exacto), `id`, `solo_bajo=1`, `limit` (máx. 200, por defecto 50), `offset`.

```json
{ "productos": [{
  "id": 5, "codigo_barras": "7750001000005", "nombre": "Amoxicilina 500 mg cápsula",
  "generico": "Amoxicilina", "laboratorio": "Medifarma",
  "categoria_id": 2, "categoria": "Antibióticos",
  "stock_minimo": 100, "stock_vigente": 400, "requiere_receta": true,
  "presentaciones": [
    { "id": 11, "producto_id": 5, "tipo": "unidad", "unidades": 1, "precio": 0.8 },
    { "id": 12, "producto_id": 5, "tipo": "blister", "unidades": 10, "precio": 7.5 }
  ]
}] }
```

`stock_vigente` es la suma de los lotes no vencidos. El estado en pantalla se calcula así: **En stock** si `stock_vigente >= stock_minimo`, **Stock bajo** si es menor, **Agotado** si es 0.

**POST** (almacén o administrador) crea un producto:
`{ codigo_barras, nombre, generico?, laboratorio?, categoria_id, stock_minimo, requiere_receta?, presentaciones: [{ tipo, unidades, precio }] }` → `201 { "id": 32 }`.

**PUT `?id=5`** (almacén o administrador) edita `nombre, generico, laboratorio, categoria_id, stock_minimo, requiere_receta, activo`. Para cambiar precios se envía `presentaciones: [{ id, precio }]` y **solo lo puede hacer el administrador** (si no, `403`).

## Lotes e ingreso de mercadería — `api/lotes.php`

**GET `?producto_id=5`** (con sesión): lotes ordenados por vencimiento. El primero con stock es el que se vende primero (FEFO).

```json
{ "lotes": [{ "id": 10, "numero_lote": "AB-2410", "fecha_vencimiento": "2026-11-25",
  "cantidad_inicial": 30, "cantidad_disponible": 30, "costo_unitario": 6, "dias_restantes": 25 }] }
```

Un lote está **por vencer** si `dias_restantes <= 60` y **vencido** si es negativo (no se vende).

**POST** (almacén o administrador) registra un ingreso de mercadería:

```json
{ "proveedor_id": 1, "items": [
  { "producto_id": 6, "numero_lote": "AZ-2601", "fecha_vencimiento": "2027-12-31",
    "cantidad": 100, "costo_unitario": 1.8 } ] }
```

Respuesta `201`: `{ compra_id, total, lotes: [ids] }`. Rechaza fechas de hoy o pasadas (`422`). Al guardar, las alertas de stock bajo que ya se repusieron se cierran solas.

## Ventas — `api/ventas.php`

**POST** (vendedor o administrador) registra una venta:

```json
{ "medio_pago": "yape",
  "cliente_id": 2,
  "receta": { "medico": "Dr. Juan Pérez", "cmp": "12345" },
  "items": [ { "producto_id": 1, "presentacion_id": 2, "cantidad": 5 } ] }
```

- `medio_pago`: `efectivo`, `tarjeta`, `yape`, `plin` o `mixto`.
- `cliente_id` y `receta` son opcionales, pero **si algún producto requiere receta, `receta.medico` es obligatorio** (`422`).
- `cantidad` es en la presentación elegida (5 blísteres de 10 = 50 unidades descontadas).
- El sistema asigna solo los lotes (FEFO). Si falta stock responde `409` con un mensaje como "Stock insuficiente de «Azitromicina…»: faltan 8 unidades" y **no descuenta nada**.
- Respuesta `201`: `{ venta_id, total, medio_pago, items: [{ producto, unidades, importe, lotes: ["PA-2401"] }] }`. Sirve para el comprobante.

**GET `?id=3`** (con sesión): venta con su detalle (`producto, presentacion, cantidad, unidades_descontadas, numero_lote, precio, subtotal`), vendedor, cliente, receta y `estado` (`emitida` o `anulada`).

**GET `?desde=2026-10-01&hasta=2026-10-31`** (administrador): listado de ventas (hasta 500).

**POST `?accion=anular&id=3`** (administrador): cuerpo `{ "motivo": "Error en el cobro" }`. Devuelve el stock a los lotes. `409` si ya estaba anulada.

## Alertas — `api/alertas.php`

**GET** (con sesión): recalcula y devuelve las alertas activas, ordenadas por urgencia (vencidos, stock bajo, por vencer).

```json
{ "resumen": { "stock_bajo": 4, "por_vencer": 2, "vencido": 1 },
  "alertas": [{ "id": 3, "tipo": "stock_bajo", "producto_id": 6, "producto": "Azitromicina 500 mg tableta",
    "lote_id": null, "numero_lote": null, "mensaje": "Stock bajo: Azitromicina… (12 de mínimo 30)", "fecha": "2026-10-31 02:10:00" }] }
```

Los contadores de las pestañas salen de `resumen`. **POST `?accion=atender&id=3`** (almacén o administrador) marca una alerta como atendida.

## Reportes — `api/reportes.php` (solo administrador)

Todos con `GET`. Rango opcional: `desde` y `hasta` (por defecto, últimos 30 días).

| `?tipo=` | Respuesta |
|---|---|
| `ventas_dia` | `filas: [{ dia, ventas, total }]` (solo ventas emitidas) |
| `top_productos` | `filas: [{ nombre, unidades, ingresos }]` (10 más vendidos) |
| `stock_critico` | `filas: [{ producto_id, nombre, stock_vigente, stock_minimo }]` |

## Pendiente de crear en el back-end

El diseño ya contempla estas pantallas, pero todavía no tienen endpoint:

- Lista de **categorías** (para los formularios de producto) y de **proveedores** (para el ingreso de mercadería).
- **Clientes**: listar, crear y buscar por DNI o RUC.
- **Proveedores**: crear y editar.
- **Usuarios y roles**: crear, editar y desactivar.
- **Auditoría**: consultar con filtros.
- **Resumen del panel de inicio**: ventas de hoy, comparación con ayer y contadores.
- **Cambiar contraseña** del perfil.
- Historial de **ingresos de mercadería** (lista y detalle).
