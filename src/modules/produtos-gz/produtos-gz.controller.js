const service = require('./produtos-gz.service');

async function consultar(req, res) {
  try {
    const { codigoBarras, codigoInterno, descricao, situacao } = req.query;
    const data = await service.consultarProduto({ codigoBarras, codigoInterno, descricao, situacao });
    res.json(data);
  } catch (err) {
    const msg = err.code === 'GZ_TOKEN_MISSING'
      ? err.message
      : /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|timeout|Tempo limite/i.test(String(err.message))
        ? 'Não foi possível alcançar a API GZ. Verifique se o servidor do Manaíra Board possui acesso à rede/VPN da GZ.'
        : err.message;
    res.status(err.status || (err.code === 'GZ_TOKEN_MISSING' ? 503 : 502)).json({ error: msg, details: err.response || undefined });
  }
}

module.exports = { consultar };
