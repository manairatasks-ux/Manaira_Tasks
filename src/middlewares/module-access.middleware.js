const model = require('../modules/modulos/modulo.model');

function isPrincipal(req) {
  return String(req.user?.perfil || '').toLowerCase() === 'administrador_principal';
}

function requireModuleAccess(codigo) {
  return async (req, res, next) => {
    try {
      if (isPrincipal(req)) return next();
      if (await model.hasAccess(req.user?.id, codigo)) return next();
      return res.status(403).json({ error: `Você não possui acesso ao módulo ${codigo}.` });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao validar acesso ao módulo.', details: err.message });
    }
  };
}

function requireModuleAccessPdf(codigo) {
  return async (req, res, next) => {
    try {
      if (isPrincipal(req)) return next();
      if (await model.hasAccess(req.user?.id, codigo)) return next();
      return res.status(403).send('Você não possui acesso a este módulo.');
    } catch (err) {
      return res.status(500).send('Erro ao validar acesso ao módulo.');
    }
  };
}

module.exports = { requireModuleAccess, requireModuleAccessPdf };
