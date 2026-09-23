function mobileApiAuth(req, res, next) {
  const chaveRecebida = String(
    req.headers['x-mobile-key'] || ''
  ).trim();

  const chaveCorreta = String(
    process.env.MOBILE_API_KEY || ''
  ).trim();

  if (!chaveCorreta) {
    return res.status(503).json({
      error: 'MOBILE_API_KEY não configurada no servidor.'
    });
  }

  if (!chaveRecebida || chaveRecebida !== chaveCorreta) {
    return res.status(401).json({
      error: 'Acesso mobile não autorizado.'
    });
  }

  next();
}

module.exports = {
  mobileApiAuth
};