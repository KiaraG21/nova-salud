# API de NovaSalud POS

API REST en PHP que responde **JSON**. La sesión se maneja con cookie (`PHPSESSID`) y expira a los **30 minutos de inactividad**.

## Cómo probarla en local (XAMPP)

1. Importa `database/nova_salud.sql` en phpMyAdmin.
2. Copia `backend/config/config.example.php` como `backend/config/config.php` y ajusta el puerto de MySQL (3307 o 3306).
3. Con Apache y MySQL encendidos, la API queda en `http://localhost/nova-salud/backend/api/`.
4. Si el front está en `http://localhost/nova-salud/frontend/`, usa rutas relativas como `../backend/api/auth.php`. Al ser el mismo servidor no hay problemas de CORS ni de cookies.

Usuarios de prueba:

| Correo | Contraseña | Rol |
|---|---|---|
| admin@novasalud.pe | Admin123! | administrador |
| vendedor@novasalud.pe | Vendedor123! | vendedor |
| almacen@novasalud.pe | Almacen123! | almacen |

## Convenciones

- Las peticiones con cuerpo envían `Content-Type: application/json`.
- Los errores devuelven `{ "error": "mensaje para mostrar al usuario" }`.
- Códigos: `200` ok, `201` creado, `400` JSON inválido, `401` sin sesión o sesión vencida, `403` sin permiso, `404` no existe, `405` método no permitido, `409` conflicto (stock insuficiente, venta ya anulada, dato duplicado), `422` datos inválidos, `429` demasiados intentos de login, `500` error del servidor.
- Dinero en soles como número (`12.5`). Fechas `AAAA-MM-DD`. Stock siempre en **unidades**.
- **401:** mostrar "Tu sesión terminó" y volver al login. **403:** mostrar "No tienes permiso para esta acción".
- El administrador tiene acceso a todo. En cada endpoint se indica qué otro rol puede usarlo.
- Números de venta para mostrar: `numero` viene como `V-0003`.

## Permisos por rol

| Módulo | Administrador | Vendedor | Almacén |
|---|---|---|---|
| Productos y lotes (consultar) | Sí | Sí | Sí |
| Productos (crear y editar) | Sí | No | Sí (sin precios) |
| Ingreso de mercadería y compras | Sí | No | Sí |
| Proveedores | Sí | No | Sí |
| Ventas: registrar | Sí | Sí | No |
| Ventas: historial | Todas | Solo las suyas | No |
| Ventas: anular | Sí | No | No |
| Clientes | Sí | Sí | No |
| Alertas: ver / atender | Sí / Sí | Sí / No | Sí / Sí |
| Reportes, usuarios, auditoría | Sí | No | No |
| Panel de inicio, cambiar contraseña | Sí | Sí | Sí |

## Autenticación — `api/auth.php`

| Método y parámetro | Cuerpo | Respuesta |
|---|---|---|
| `POST ?accion=login` | `{ correo, password }` | `{ usuario: { id, nombre, correo, rol } }` |
| `POST ?accion=logout` | — | `{ ok: true }` |
| `GET ?accion=me` | — | `{ usuario }` (sirve para saber si hay sesión) |
| `POST ?accion=cambiar_password` | `{ actual, nueva, confirmar }` | `{ ok: true }` |

`rol` es `administrador`, `vendedor` o `almacen`. Tras 5 intentos fallidos con el mismo correo, el login responde `429` durante 15 minutos. La contraseña nueva debe tener al menos 8 caracteres y ser distinta de la actual.

## Panel de inicio — `api/resumen.php` (GET, cualquier rol)

El vendedor ve solo sus propias ventas.

```json
{ "ventas_hoy": { "total": 1250, "cantidad": 18, "variacion_vs_ayer_pct": 12.0 },
  "stock_bajo": 12, "por_vencer_60_dias": 8, "vencidos": 2,
  "ventas_recientes": [{ "id": 125, "numero": "V-0125", "fecha": "2026-10-12 10:15:00", "cliente": "Ana Torres", "total": 32.5, "medio_pago": "efectivo", "estado": "emitida" }],
  "alertas_recientes": [{ "id": 3, "tipo": "stock_bajo", "producto": "…", "mensaje": "…", "fecha": "…" }] }
```

`variacion_vs_ayer_pct` es `null` si ayer no hubo ventas.

## Categorías — `api/categorias.php`

`GET` (con sesión) → `{ categorias: [{ id, nombre }] }`.

## Productos — `api/productos.php`

**GET** (con sesión). Filtros opcionales: `q` (nombre, genérico o código), `barcode` (exacto), `id`, `categoria_id`, `estado`, `limit` (máx. 200, por defecto 50), `offset`. Los administradores y el almacén pueden agregar `incluir_inactivos=1`.

`estado` sirve para las pestañas de Inventario: `en_stock`, `stock_bajo` (incluye los agotados), `agotado`, `por_vencer` (algún lote vence en 60 días o menos) y `vencido` (algún lote con stock ya vencido).

```json
{ "total": 31, "productos": [{
  "id": 5, "codigo_barras": "7750001000005", "nombre": "Amoxicilina 500 mg cápsula",
  "generico": "Amoxicilina", "laboratorio": "Medifarma", "categoria_id": 2, "categoria": "Antibióticos",
  "stock_minimo": 100, "stock_vigente": 400, "estado_stock": "en_stock",
  "proximo_vencimiento": "2027-09-27", "lotes_por_vencer": 0, "lotes_vencidos": 0,
  "requiere_receta": true, "activo": true,
  "presentaciones": [ { "id": 11, "producto_id": 5, "tipo": "unidad", "unidades": 1, "precio": 0.8 } ]
}] }
```

- `stock_vigente` es la suma de los lotes no vencidos. `estado_stock` es `en_stock`, `stock_bajo` o `agotado`.
- `proximo_vencimiento` es el del lote que se vende primero (para la columna "Vence" de Inventario). Es `null` si no hay stock vigente.
- `total` es la cantidad total que cumple los filtros, para la paginación ("Mostrando 1–5 de 31").

**POST** (almacén o administrador): `{ codigo_barras, nombre, generico?, laboratorio?, categoria_id, stock_minimo, requiere_receta?, presentaciones: [{ tipo, unidades, precio }] }` → `201 { id }`. Código de barras repetido → `409`.

**PUT `?id=5`** (almacén o administrador): edita `nombre, generico, laboratorio, categoria_id, stock_minimo, requiere_receta, activo`. Para cambiar precios se envía `presentaciones: [{ id, precio }]` y **solo lo puede hacer el administrador** (`403` en otro caso).

## Lotes e ingreso de mercadería — `api/lotes.php`

**GET `?producto_id=5`** (con sesión): lotes ordenados por vencimiento. El primero con stock es el que se vende primero (FEFO).

```json
{ "lotes": [{ "id": 10, "numero_lote": "AB-2410", "fecha_vencimiento": "2026-11-25",
  "cantidad_inicial": 30, "cantidad_disponible": 30, "costo_unitario": 6, "dias_restantes": 25 }] }
```

Lote **por vencer** si `dias_restantes <= 60`; **vencido** si es negativo (no se vende).

**POST** (almacén o administrador): registra un ingreso.

```json
{ "proveedor_id": 1, "items": [
  { "producto_id": 6, "numero_lote": "AZ-2601", "fecha_vencimiento": "2027-12-31", "cantidad": 100, "costo_unitario": 1.8 } ] }
```

Respuesta `201`: `{ compra_id, total, lotes: [ids] }`. Rechaza vencimientos de hoy o pasados (`422`). Las alertas de stock bajo que ya se repusieron se cierran solas.

## Compras (historial de ingresos) — `api/compras.php` (almacén o administrador)

- `GET ?desde=&hasta=` (por defecto, últimos 90 días) → `{ compras: [{ id, fecha, proveedor, registrado_por, total, items }] }`.
- `GET ?id=1` → `{ compra: { id, fecha, total, proveedor, registrado_por, items: [{ producto, numero_lote, fecha_vencimiento, cantidad, costo_unitario }] } }`.

## Proveedores — `api/proveedores.php` (almacén o administrador)

- `GET` (opcional `?q=` o `?id=`) → `{ proveedores: [{ id, razon_social, ruc, telefono, correo }] }`. Sirve para la lista desplegable del ingreso de mercadería.
- `POST` `{ razon_social, ruc (11 dígitos), telefono?, correo? }` → `201 { id }`. RUC repetido → `409`.
- `PUT ?id=1` con los campos a cambiar → `{ ok: true }`.

## Clientes — `api/clientes.php` (vendedor o administrador)

- `GET ?documento=12345678` busca por DNI o RUC exacto. `GET ?q=maria` busca por nombre o documento. → `{ clientes: [{ id, documento, nombre, telefono }] }`.
- `GET ?id=2` → `{ cliente: { …, compras: [{ id, fecha, total, medio_pago, estado }], total_comprado, cantidad_compras } }`.
- `POST` `{ documento (DNI de 8 o RUC de 11 dígitos), nombre, telefono? }` → `201 { id }`. Documento repetido → `409`.
- `PUT ?id=2` con los campos a cambiar → `{ ok: true }`.

## Ventas — `api/ventas.php`

**POST** (vendedor o administrador): registra una venta.

```json
{ "medio_pago": "yape", "cliente_id": 2,
  "receta": { "medico": "Dr. Juan Pérez", "cmp": "12345" },
  "items": [ { "producto_id": 1, "presentacion_id": 2, "cantidad": 5 } ] }
```

- `medio_pago`: `efectivo`, `tarjeta`, `yape`, `plin` o `mixto`. `cliente_id` y `receta` son opcionales.
- Si algún producto requiere receta, `receta.medico` es obligatorio (`422`).
- `cantidad` es en la presentación elegida (5 blísteres de 10 = 50 unidades descontadas).
- El sistema asigna los lotes (FEFO). Si falta stock responde `409` con un mensaje como "Stock insuficiente de «Azitromicina…»: faltan 8 unidades" y **no descuenta nada**.
- Respuesta `201`: `{ venta_id, total, medio_pago, items: [{ producto, unidades, importe, lotes: ["PA-2401"] }] }` (sirve para el comprobante).

**GET `?id=3`** (vendedor o administrador): venta con `numero`, vendedor, cliente, receta, `estado` (`emitida` o `anulada`), `motivo_anulacion` y `detalle: [{ producto, presentacion, cantidad, unidades_descontadas, numero_lote, precio, subtotal }]`. El vendedor solo puede ver las suyas.

**GET `?desde=&hasta=`** (por defecto, hoy): listado con `numero, fecha, vendedor, cliente, medio_pago, total, estado`. El vendedor ve solo sus ventas. El administrador puede filtrar por `vendedor_id`, `medio_pago` y `estado`.

**POST `?accion=anular&id=3`** (administrador): cuerpo `{ motivo }`. Devuelve el stock a los lotes. `409` si ya estaba anulada.

## Alertas — `api/alertas.php`

**GET** (con sesión): recalcula y devuelve las alertas activas, ordenadas por urgencia (vencidos, stock bajo, por vencer).

```json
{ "resumen": { "stock_bajo": 4, "por_vencer": 2, "vencido": 1 },
  "alertas": [{ "id": 3, "tipo": "stock_bajo", "producto_id": 6, "producto": "…", "lote_id": null, "numero_lote": null, "mensaje": "…", "fecha": "…" }] }
```

Los contadores de las pestañas salen de `resumen`. **POST `?accion=atender&id=3`** (almacén o administrador) marca una alerta como atendida.

## Reportes — `api/reportes.php` (solo administrador)

`GET`, con rango opcional `desde` y `hasta` (por defecto, últimos 30 días).

| `?tipo=` | Respuesta |
|---|---|
| `ventas_dia` | `filas: [{ dia, ventas, total }]` (solo ventas emitidas) |
| `top_productos` | `filas: [{ nombre, unidades, ingresos }]` (10 más vendidos) |
| `stock_critico` | `filas: [{ producto_id, nombre, stock_vigente, stock_minimo }]` |

## Usuarios y roles — `api/usuarios.php` (solo administrador)

- `GET` (opcional `?q=`) → `{ usuarios: [{ id, nombre, correo, rol, activo, creado_en }] }`. Nunca devuelve contraseñas.
- `POST` `{ nombre, correo, rol, password (mín. 8) }` → `201 { id }`. Correo repetido → `409`.
- `PUT ?id=2` con `nombre, correo, rol, activo` y/o `password` (para restablecerla) → `{ ok: true }`.
- Los usuarios no se borran, se **desactivan** (`activo: false`) y dejan de poder entrar. El administrador no puede desactivarse ni quitarse el rol a sí mismo (`409`).

## Auditoría — `api/auditoria.php` (solo administrador, solo lectura)

`GET` con filtros opcionales `accion`, `usuario_id`, `desde`, `hasta`, `limit` (máx. 200) y `offset`.

```json
{ "total": 120, "acciones": ["anular", "venta", "login", "…"],
  "filas": [{ "id": 9, "fecha": "…", "usuario_id": 1, "usuario": "Administrador", "accion": "anular",
              "entidad": "venta", "entidad_id": 3, "valor_anterior": { "estado": "emitida" }, "valor_nuevo": { "estado": "anulada", "motivo": "…" } }] }
```

`acciones` sirve para llenar el filtro "Tipo de evento". Las acciones que se registran: `login`, `login_fallido`, `venta`, `anular`, `ingreso_mercaderia`, `crear`, `editar`, `atender_alerta`, `cambiar_password`, `editar_y_cambiar_password`.

## Lo que queda fuera de esta versión

- Envío de alertas por correo o WhatsApp.
- Boleta o factura electrónica de SUNAT (el comprobante es interno).
- Recuperar contraseña por correo (el administrador puede restablecerla desde Usuarios).
