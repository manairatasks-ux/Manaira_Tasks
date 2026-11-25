require('dotenv').config();
const app=require('./app');
const {initDb}=require('./init-db');
const {port}=require('./config/env');
const vendasSync=require('./modules/produtos-gz/vendas-sync.service');
const pedidosSync=require('./modules/pedidos-galpao/pedidos-galpao.service');

(async()=>{
  try{
    await initDb();
    await require('./modules/manaira-ia/routes').initIaJobs();
    await pedidosSync.init();
    pedidosSync.startScheduler();
    app.listen(port,()=>{ console.log(`Manaíra Board V74.35 rodando na porta ${port}`); });
  }catch(err){
    console.error('Erro ao iniciar a aplicação:',err);
    process.exit(1);
  }
})();
