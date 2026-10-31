-- ============================================================
--  NovaSalud POS · Botica Nova Salud
--  Esquema MySQL/MariaDB + datos de ejemplo (XAMPP)
--  Cómo usarlo: abre phpMyAdmin (http://localhost/phpmyadmin),
--  pestaña "Importar", elige este archivo y pulsa "Continuar".
--  Los códigos de barras, RUC, precios y stock son DE EJEMPLO.
-- ============================================================
CREATE DATABASE IF NOT EXISTS nova_salud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nova_salud;
SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS v_lotes_por_vencer;
DROP VIEW IF EXISTS v_stock_producto;
DROP TABLE IF EXISTS auditoria, alertas, detalle_compra, compras, detalle_venta, ventas,
  clientes, lotes, presentaciones, productos, proveedores, categorias, usuarios;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('administrador','vendedor','almacen') NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  razon_social VARCHAR(120) NOT NULL,
  ruc CHAR(11) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  correo VARCHAR(120)
) ENGINE=InnoDB;

CREATE TABLE productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo_barras VARCHAR(20) NOT NULL UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  generico VARCHAR(150),
  laboratorio VARCHAR(80),
  categoria_id INT NOT NULL,
  stock_minimo INT NOT NULL DEFAULT 0 COMMENT 'En unidades',
  requiere_receta TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  INDEX idx_producto_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE presentaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  tipo ENUM('unidad','blister','caja') NOT NULL,
  unidades INT NOT NULL COMMENT 'Unidades que contiene',
  precio DECIMAL(10,2) NOT NULL,
  UNIQUE KEY uq_prod_tipo (producto_id, tipo),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB;

CREATE TABLE lotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  proveedor_id INT NULL,
  numero_lote VARCHAR(40) NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  cantidad_inicial INT NOT NULL,
  cantidad_disponible INT NOT NULL COMMENT 'En unidades',
  costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  INDEX idx_fefo (producto_id, fecha_vencimiento)
) ENGINE=InnoDB;

CREATE TABLE clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documento VARCHAR(11) NOT NULL UNIQUE COMMENT 'DNI o RUC',
  nombre VARCHAR(120) NOT NULL,
  telefono VARCHAR(20)
) ENGINE=InnoDB;

CREATE TABLE ventas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  cliente_id INT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  medio_pago ENUM('efectivo','tarjeta','yape','plin','mixto') NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  estado ENUM('emitida','anulada') NOT NULL DEFAULT 'emitida',
  motivo_anulacion VARCHAR(200) NULL,
  receta_medico VARCHAR(120) NULL,
  receta_cmp VARCHAR(20) NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  INDEX idx_venta_fecha (fecha)
) ENGINE=InnoDB;

CREATE TABLE detalle_venta (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_id INT NOT NULL,
  producto_id INT NOT NULL,
  lote_id INT NOT NULL,
  presentacion_id INT NOT NULL,
  cantidad DECIMAL(10,3) NOT NULL COMMENT 'En la presentación vendida (fracción si el lote se reparte)',
  unidades_descontadas INT NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (venta_id) REFERENCES ventas(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (lote_id) REFERENCES lotes(id),
  FOREIGN KEY (presentacion_id) REFERENCES presentaciones(id)
) ENGINE=InnoDB;

CREATE TABLE compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proveedor_id INT NOT NULL,
  usuario_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

CREATE TABLE detalle_compra (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL,
  producto_id INT NOT NULL,
  lote_id INT NOT NULL,
  cantidad INT NOT NULL,
  costo_unitario DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (compra_id) REFERENCES compras(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (lote_id) REFERENCES lotes(id)
) ENGINE=InnoDB;

CREATE TABLE alertas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('stock_bajo','por_vencer','vencido') NOT NULL,
  producto_id INT NOT NULL,
  lote_id INT NULL,
  mensaje VARCHAR(255) NOT NULL,
  estado ENUM('activa','atendida') NOT NULL DEFAULT 'activa',
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (lote_id) REFERENCES lotes(id),
  INDEX idx_alerta_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  accion VARCHAR(40) NOT NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id INT NULL,
  valor_anterior TEXT NULL,
  valor_nuevo TEXT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- Stock vigente por producto (no cuenta lotes vencidos)
CREATE VIEW v_stock_producto AS
SELECT p.id AS producto_id, p.nombre, p.stock_minimo,
       COALESCE(SUM(CASE WHEN l.fecha_vencimiento >= CURDATE() THEN l.cantidad_disponible END),0) AS stock_vigente,
       (COALESCE(SUM(CASE WHEN l.fecha_vencimiento >= CURDATE() THEN l.cantidad_disponible END),0) < p.stock_minimo) AS bajo_minimo
FROM productos p LEFT JOIN lotes l ON l.producto_id = p.id
WHERE p.activo = 1
GROUP BY p.id, p.nombre, p.stock_minimo;

-- Lotes con stock que vencen en los próximos 60 días o ya vencidos
CREATE VIEW v_lotes_por_vencer AS
SELECT l.id AS lote_id, p.nombre, l.numero_lote, l.fecha_vencimiento, l.cantidad_disponible,
       DATEDIFF(l.fecha_vencimiento, CURDATE()) AS dias_restantes
FROM lotes l JOIN productos p ON p.id = l.producto_id
WHERE l.cantidad_disponible > 0 AND l.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 60 DAY);

-- ===================== DATOS DE EJEMPLO =====================
-- Usuarios de prueba (cambia las contraseñas antes de publicar el sistema):
--   admin@novasalud.pe     / Admin123!
--   vendedor@novasalud.pe  / Vendedor123!
--   almacen@novasalud.pe   / Almacen123!
INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES
('Administrador','admin@novasalud.pe','$2y$10$nMlTn9NlxNvNkWQhQ6ydWe1qdblyFjYjjFdKh.W38XNvITnvoDIGu','administrador'),
('Vendedor de turno','vendedor@novasalud.pe','$2y$10$3P4e/6CWPQGl8L8eMsSMFuTgJZzyN1vphSvd7kZiT2mU2vMc3waIG','vendedor'),
('Encargado de almacén','almacen@novasalud.pe','$2y$10$SLLMJnhBRlZ7NvL1i2pBA.7kp3FUsJLY1IqbuKED5vwK5gWHAi8.O','almacen');

INSERT INTO proveedores (razon_social, ruc, telefono, correo) VALUES
('Droguería Andina S.A.C.','20100000011','014000001','ventas@drogueriaandina.example'),
('Distribuidora Salud Perú S.A.C.','20100000022','014000002','pedidos@saludperu.example'),
('Insumos Médicos Lima E.I.R.L.','20100000033','014000003','contacto@insumoslima.example');

INSERT INTO clientes (documento, nombre, telefono) VALUES
('00000000','Cliente varios',NULL),
('12345678','María Quispe Huamán','999111222');

INSERT INTO categorias (nombre) VALUES
('Analgésicos y antiinflamatorios'),
('Antibióticos'),
('Antigripales y respiratorios'),
('Gastrointestinales'),
('Vitaminas y suplementos'),
('Cuidado personal e higiene'),
('Primeros auxilios'),
('Dermatológicos'),
('Antialérgicos'),
('Cuidado del bebé'),
('Enfermedades crónicas');

INSERT INTO productos (codigo_barras, nombre, generico, laboratorio, categoria_id, stock_minimo, requiere_receta) VALUES
('7750001000001','Paracetamol 500 mg tableta','Paracetamol','Genfar',1,150,0),
('7750001000002','Ibuprofeno 400 mg tableta','Ibuprofeno','MK',1,120,0),
('7750001000003','Naproxeno 550 mg tableta','Naproxeno sódico','Portugal',1,60,0),
('7750001000004','Diclofenaco 50 mg tableta','Diclofenaco sódico','Genfar',1,60,0),
('7750001000005','Amoxicilina 500 mg cápsula','Amoxicilina','Medifarma',2,100,1),
('7750001000006','Azitromicina 500 mg tableta','Azitromicina','Medifarma',2,30,1),
('7750001000007','Ciprofloxacino 500 mg tableta','Ciprofloxacino','Genfar',2,40,1),
('7750001000008','Antigripal tableta','Paracetamol + clorfenamina + fenilefrina','Medifarma',3,80,0),
('7750001000009','Ambroxol jarabe 15 mg/5 ml 120 ml','Ambroxol','Portugal',3,15,0),
('7750001000010','Loratadina 10 mg tableta','Loratadina','Genfar',9,80,0),
('7750001000011','Cetirizina 10 mg tableta','Cetirizina','MK',9,60,0),
('7750001000012','Omeprazol 20 mg cápsula','Omeprazol','Genfar',4,100,0),
('7750001000013','Loperamida 2 mg cápsula','Loperamida','Portugal',4,40,0),
('7750001000014','Sales de rehidratación oral sobre','Electrolitos','Medifarma',4,30,0),
('7750001000015','Hioscina 10 mg tableta','N-butilbromuro de hioscina','Medifarma',4,40,0),
('7750001000016','Vitamina C 500 mg tableta','Ácido ascórbico','Genfar',5,80,0),
('7750001000017','Complejo B tableta','Vitaminas del complejo B','MK',5,50,0),
('7750001000018','Multivitamínico y minerales tableta','Multivitamínico','Portugal',5,30,0),
('7750001000019','Alcohol medicinal 70° 250 ml','Alcohol etílico','Marca propia',7,20,0),
('7750001000020','Agua oxigenada 120 ml','Peróxido de hidrógeno','Marca propia',7,20,0),
('7750001000021','Gasa estéril 10 x 10 cm',NULL,'Marca propia',7,50,0),
('7750001000022','Apósitos adhesivos (curitas)',NULL,'Marca propia',7,20,0),
('7750001000023','Algodón hidrófilo 100 g',NULL,'Marca propia',7,15,0),
('7750001000024','Mascarilla quirúrgica',NULL,'Marca propia',6,10,0),
('7750001000025','Jabón antibacterial 90 g','Triclosán','Marca propia',6,20,0),
('7750001000026','Crema de óxido de zinc 60 g','Óxido de zinc','Medifarma',10,15,0),
('7750001000027','Clotrimazol crema 1% 20 g','Clotrimazol','Genfar',8,15,0),
('7750001000028','Hidrocortisona crema 1% 15 g','Hidrocortisona','MK',8,10,0),
('7750001000029','Termómetro digital',NULL,'Marca propia',6,8,0),
('7750001000030','Metformina 850 mg tableta','Metformina','Genfar',11,60,1),
('7750001000031','Losartán 50 mg tableta','Losartán potásico','MK',11,60,1);

INSERT INTO presentaciones (producto_id, tipo, unidades, precio) VALUES
(1,'unidad',1,0.30),
(1,'blister',10,2.50),
(1,'caja',100,22.00),
(2,'unidad',1,0.60),
(2,'blister',10,5.00),
(2,'caja',100,45.00),
(3,'unidad',1,1.20),
(3,'blister',10,11.00),
(4,'unidad',1,0.50),
(4,'blister',10,4.50),
(5,'unidad',1,0.80),
(5,'blister',10,7.50),
(5,'caja',100,70.00),
(6,'unidad',1,3.50),
(6,'blister',3,10.00),
(7,'unidad',1,0.90),
(7,'blister',10,8.50),
(8,'unidad',1,0.70),
(8,'blister',10,6.00),
(9,'unidad',1,12.00),
(10,'unidad',1,0.40),
(10,'blister',10,3.50),
(11,'unidad',1,0.50),
(11,'blister',10,4.50),
(12,'unidad',1,0.45),
(12,'blister',14,6.00),
(13,'unidad',1,0.80),
(13,'blister',10,7.00),
(14,'unidad',1,2.50),
(15,'unidad',1,0.90),
(15,'blister',10,8.00),
(16,'unidad',1,0.50),
(16,'blister',10,4.50),
(17,'unidad',1,0.60),
(17,'blister',10,5.50),
(18,'unidad',1,0.90),
(18,'caja',30,24.00),
(19,'unidad',1,5.00),
(20,'unidad',1,3.00),
(21,'unidad',1,0.50),
(21,'caja',50,20.00),
(22,'unidad',1,0.20),
(22,'caja',100,15.00),
(23,'unidad',1,4.50),
(24,'unidad',1,0.50),
(24,'caja',50,20.00),
(25,'unidad',1,3.50),
(26,'unidad',1,9.00),
(27,'unidad',1,7.50),
(28,'unidad',1,8.50),
(29,'unidad',1,15.00),
(30,'unidad',1,0.40),
(30,'blister',10,3.50),
(30,'caja',100,32.00),
(31,'unidad',1,0.50),
(31,'blister',10,4.50),
(31,'caja',100,42.00);

-- Lotes con vencimientos relativos a hoy para que las alertas se vean al probar
INSERT INTO lotes (producto_id, proveedor_id, numero_lote, fecha_vencimiento, cantidad_inicial, cantidad_disponible, costo_unitario) VALUES
(1,2,'PA-2401',DATE_ADD(CURDATE(), INTERVAL 420 DAY),600,600,0.15),
(1,2,'PA-2502',DATE_ADD(CURDATE(), INTERVAL 610 DAY),400,400,0.16),
(2,3,'IB-2403',DATE_ADD(CURDATE(), INTERVAL 380 DAY),500,500,0.30),
(3,1,'NA-2404',DATE_ADD(CURDATE(), INTERVAL 300 DAY),200,200,0.60),
(4,2,'DI-2405',DATE_ADD(CURDATE(), INTERVAL 450 DAY),240,240,0.25),
(5,3,'AM-2406',DATE_ADD(CURDATE(), INTERVAL 330 DAY),400,400,0.40),
(6,1,'AZ-2407',DATE_ADD(CURDATE(), INTERVAL 270 DAY),12,12,1.80),
(7,2,'CI-2408',DATE_ADD(CURDATE(), INTERVAL 360 DAY),120,120,0.45),
(8,3,'AG-2409',DATE_ADD(CURDATE(), INTERVAL 300 DAY),300,300,0.35),
(9,1,'AB-2410',DATE_ADD(CURDATE(), INTERVAL 25 DAY),30,30,6.00),
(9,1,'AB-2511',DATE_ADD(CURDATE(), INTERVAL 400 DAY),24,24,6.20),
(10,2,'LO-2411',DATE_ADD(CURDATE(), INTERVAL 500 DAY),300,300,0.18),
(11,3,'CE-2412',DATE_ADD(CURDATE(), INTERVAL 480 DAY),200,200,0.22),
(12,1,'OM-2413',DATE_ADD(CURDATE(), INTERVAL 410 DAY),350,350,0.20),
(13,2,'LP-2414',DATE_ADD(CURDATE(), INTERVAL 350 DAY),25,25,0.35),
(14,3,'SR-2415',DATE_ADD(CURDATE(), INTERVAL 40 DAY),60,60,1.20),
(15,1,'HI-2416',DATE_ADD(CURDATE(), INTERVAL 390 DAY),150,150,0.40),
(16,2,'VC-2417',DATE_ADD(CURDATE(), INTERVAL 520 DAY),300,300,0.20),
(17,3,'CB-2301',DATE_ADD(CURDATE(), INTERVAL -15 DAY),20,20,0.25),
(17,3,'CB-2418',DATE_ADD(CURDATE(), INTERVAL 450 DAY),150,150,0.27),
(18,1,'MV-2419',DATE_ADD(CURDATE(), INTERVAL 600 DAY),120,120,0.40),
(19,2,'AL-2420',DATE_ADD(CURDATE(), INTERVAL 700 DAY),48,48,2.50),
(20,3,'AO-2421',DATE_ADD(CURDATE(), INTERVAL 650 DAY),40,40,1.30),
(21,1,'GA-2422',DATE_ADD(CURDATE(), INTERVAL 800 DAY),200,200,0.22),
(22,2,'CU-2423',DATE_ADD(CURDATE(), INTERVAL 900 DAY),10,10,0.08),
(23,3,'AH-2424',DATE_ADD(CURDATE(), INTERVAL 900 DAY),30,30,2.00),
(24,1,'MA-2425',DATE_ADD(CURDATE(), INTERVAL 700 DAY),4,4,0.20),
(25,2,'JA-2426',DATE_ADD(CURDATE(), INTERVAL 500 DAY),45,45,1.60),
(26,3,'OZ-2427',DATE_ADD(CURDATE(), INTERVAL 430 DAY),30,30,4.50),
(27,1,'CL-2428',DATE_ADD(CURDATE(), INTERVAL 420 DAY),36,36,3.50),
(28,2,'HC-2429',DATE_ADD(CURDATE(), INTERVAL 410 DAY),24,24,4.00),
(29,3,'TD-2430',DATE_ADD(CURDATE(), INTERVAL 1000 DAY),16,16,8.00),
(30,1,'ME-2431',DATE_ADD(CURDATE(), INTERVAL 440 DAY),400,400,0.18),
(31,2,'LS-2432',DATE_ADD(CURDATE(), INTERVAL 460 DAY),350,350,0.22);

-- Consultas útiles para el back-end:
-- SELECT * FROM v_stock_producto WHERE bajo_minimo = 1;      -- alerta de stock bajo
-- SELECT * FROM v_lotes_por_vencer ORDER BY fecha_vencimiento; -- alerta de vencimientos
-- FEFO: SELECT id, cantidad_disponible FROM lotes
--       WHERE producto_id = ? AND cantidad_disponible > 0 AND fecha_vencimiento >= CURDATE()
--       ORDER BY fecha_vencimiento ASC FOR UPDATE;
