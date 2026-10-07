const router = require('express').Router();
const controller = require('./produtos-gz.controller');
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');
const syncController = require('./vendas-sync.controller');

router.get('/consulta', auth, requireModuleAccess('consulta_produtos'), controller.consultar);
router.get('/vendas', auth, requireModuleAccess('consulta_produtos'), syncController.principal, syncController.historico);
router.get('/sincronizacao', auth, syncController.admin, syncController.status);
router.post('/sincronizacao/executar', auth, syncController.admin, syncController.executar);
router.post('/sincronizacao/parar', auth, syncController.admin, syncController.parar);

module.exports = router;
