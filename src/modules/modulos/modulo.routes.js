const router = require('express').Router();
const controller = require('./modulo.controller');
const { auth } = require('../../middlewares/auth.middleware');
const { requireManager } = require('../../shared/profile.service');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');

router.get('/modulos/me', auth, controller.me);
router.get('/modulos/acessos', auth, requireModuleAccess('administracao'), requireManager, controller.adminData);
router.put('/modulos/usuarios/:id', auth, requireModuleAccess('administracao'), requireManager, controller.updateUserModules);

module.exports = router;
