const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não informado.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'Token inválido.' }); }
}

function authPdf(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).send('Token não informado.');
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).send('Token inválido.'); }
}

module.exports = { auth, authPdf };
