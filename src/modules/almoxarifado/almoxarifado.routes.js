const router = require('express').Router();
const controller = require('./almoxarifado.controller');
const { auth } = require('../../middlewares/auth.middleware');
const { requireModuleAccess } = require('../../middlewares/module-access.middleware');

router.use(auth, requireModuleAccess('almoxarifado'));
router.get('/dashboard', controller.dashboard);
router.get('/produtos', controller.listProducts);
router.post('/produtos', controller.createProduct);
router.put('/produtos/:id', controller.updateProduct);
router.post('/produtos/:id/variacoes', controller.addVariation);
router.patch('/produtos/:id/variacoes/:itemId/desativar', controller.deactivateVariation);
router.get('/itens', controller.listItems);
router.post('/itens', controller.createItem);
router.put('/itens/:id', controller.updateItem);
router.post('/entradas', controller.entry);
router.post('/saidas', controller.exit);
router.get('/historico', controller.history);
router.get('/ajustes', controller.adjustmentHistory);
router.post('/ajustes', controller.adjustStock);

module.exports = router;
