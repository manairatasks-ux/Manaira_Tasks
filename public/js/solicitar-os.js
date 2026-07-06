const $ = (id) => document.getElementById(id);
const PORTAL_KEY = 'mb_os_portal_password';

function show(id) {
  ['acessoCard', 'formCard', 'sucessoCard'].forEach(card => {
    $(card).classList.toggle('hidden', card !== id);
  });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Erro na solicitação.');
  }

  return data;
}

async function validarSenha(senha) {
  await api('/api/public/os/validar-senha', {
    method: 'POST',
    body: JSON.stringify({ senha })
  });

  sessionStorage.setItem(PORTAL_KEY, senha);
  show('formCard');
}

$('senhaForm').onsubmit = async (e) => {
  e.preventDefault();
  $('senhaMsg').textContent = '';

  const senha = $('senhaPortal').value.trim();
  const btn = e.target.querySelector('button[type="submit"]');

  try {
    btn.disabled = true;
    btn.textContent = 'Validando...';
    await validarSenha(senha);
  } catch (err) {
    $('senhaMsg').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
};

$('osPublicForm').onsubmit = async (e) => {
  e.preventDefault();
  $('formMsg').textContent = '';

  const senha = sessionStorage.getItem(PORTAL_KEY);

  if (!senha) {
    show('acessoCard');
    return;
  }

  const data = Object.fromEntries(new FormData(e.target));
  data.senha_portal = senha;

  const btn = $('btnEnviar');

  try {
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const resposta = await api('/api/public/os', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    $('numeroOS').textContent = resposta.numero || 'OS criada';
    e.target.reset();
    show('sucessoCard');
  } catch (err) {
    $('formMsg').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar solicitação';
  }
};

$('btnLimpar').onclick = () => $('osPublicForm').reset();
$('btnNovaSolicitacao').onclick = () => show('formCard');

const senhaSalva = sessionStorage.getItem(PORTAL_KEY);
if (senhaSalva) {
  validarSenha(senhaSalva).catch(() => {
    sessionStorage.removeItem(PORTAL_KEY);
    show('acessoCard');
  });
}
