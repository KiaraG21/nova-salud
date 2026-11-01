const API = '../backend/api/';

// Devuelve el JSON de la API o lanza un Error con el mensaje para mostrar al usuario.
async function api(ruta, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + ruta, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'Error inesperado'), { status: res.status });
  }
  return data;
}
