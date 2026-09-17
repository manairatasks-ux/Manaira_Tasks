const router = require('express').Router();
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');
const produtosGzService = require('../produtos-gz/produtos-gz.service');

router.get('/consulta', auth, requireModuleAccess('cartazes'), async (req, res) => {
  try {
    const { codigoBarras, codigoInterno, descricao } = req.query;
    const data = await produtosGzService.consultarProduto({ codigoBarras, codigoInterno, descricao });
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, details: err.response || undefined });
  }
});
module.exports = router;
