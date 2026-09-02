const router = require('express').Router();
const controller = require('./almoxarifado.controller');
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');

router.use(auth, requireModuleAccess('almoxarifado'));
router.get('/dashboard', controller.dashboard);
router.get('/itens', controller.listItems);
router.post('/itens', controller.createItem);
router.put('/itens/:id', controller.updateItem);
router.post('/entradas', controller.entry);
router.post('/saidas', controller.exit);
router.get('/historico', controller.history);

module.exports = router;
