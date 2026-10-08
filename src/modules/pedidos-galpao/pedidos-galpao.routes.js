const router=require('express').Router();
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const controller=require('./pedidos-galpao.controller');
router.use(auth,requireModuleAccess('pedidos_galpao'));
router.get('/sugestoes',controller.sugestoes);
router.post('/relatorio.pdf',controller.relatorio);
module.exports=router;
