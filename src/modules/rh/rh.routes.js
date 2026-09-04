const router=require('express').Router();
const c=require('./rh.controller');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');

router.get('/public/tipos',c.publicTypes);
router.post('/public/solicitacoes',c.publicCreate);

router.use(auth,requireModuleAccess('rh'));
router.get('/dashboard',c.dashboard);
router.get('/tipos',c.types);
router.post('/tipos',c.createType);
router.put('/tipos/:id',c.updateType);
router.get('/responsaveis',c.responsibles);
router.get('/solicitacoes',c.requests);
router.post('/solicitacoes',c.create);
router.get('/solicitacoes/:id',c.detail);
router.put('/solicitacoes/:id/status',c.status);
router.put('/solicitacoes/:id/responsavel',c.assign);
router.post('/solicitacoes/:id/comentarios',c.comment);
module.exports=router;
