const form = document.getElementById('form');
const errorBox = document.getElementById('error');
const enviar = document.getElementById('enviar');
const password = document.getElementById('password');
const ver = document.getElementById('ver');

// Si ya hay sesión activa, va directo al inicio.
api('auth.php?accion=me').then(() => { location.replace('inicio.html'); }).catch(() => {});

ver.addEventListener('click', () => {
  const oculto = password.type === 'password';
  password.type = oculto ? 'text' : 'password';
  ver.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

document.getElementById('btn-ayuda').addEventListener('click', () => {
  const ayuda = document.getElementById('ayuda');
  ayuda.hidden = !ayuda.hidden;
});

function mostrarError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('visible');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('visible');
  const correo = form.correo.value.trim();
  const pass = password.value;
  if (!correo || !pass) {
    mostrarError('Ingresa tu correo y tu contraseña');
    return;
  }
  enviar.disabled = true;
  enviar.textContent = 'Ingresando…';
  try {
    await api('auth.php?accion=login', { method: 'POST', body: { correo, password: pass } });
    location.href = 'inicio.html';
  } catch (err) {
    mostrarError(err.message);
    enviar.disabled = false;
    enviar.textContent = 'Iniciar sesión';
    password.value = '';
    password.focus();
  }
});
