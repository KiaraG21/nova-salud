ALTER TABLE ventas
  ADD COLUMN tipo_comprobante ENUM('boleta','factura') NOT NULL DEFAULT 'boleta' AFTER fecha;
