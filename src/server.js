require('dotenv').config();
const app=require('./app');
const {initDb}=require('./init-db');
const {port}=require('./config/env');
const vendasSync=require('./modules/produtos-gz/vendas-sync.service');

(async()=>{
  try{
    await initDb();
    // app.listen(port,()=>{ console.log(`Plataforma Manaíra V57 rodando na porta ${port}`); vendasSync.iniciarAgendador(); });
    app.listen(port,()=>{ console.log(`Plataforma Manaíra V57 rodando na porta ${port}`); });
  }catch(err){
    console.error('Erro ao iniciar a aplicação:',err);
    process.exit(1);
  }
})();
