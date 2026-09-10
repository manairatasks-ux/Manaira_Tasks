const router = require('express').Router();
const controller = require('./produtos-gz.controller');
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');

router.get('/consulta', auth, requireModuleAccess('consulta_produtos'), controller.consultar);

module.exports = router;
