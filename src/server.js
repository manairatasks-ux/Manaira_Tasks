require('dotenv').config();
const app=require('./app');
const {initDb}=require('./init-db');
const {port}=require('./config/env');

(async()=>{
  try{
    await initDb();
    app.listen(port,()=>console.log(`Plataforma Manaíra V16 rodando na porta ${port}`));
  }catch(err){
    console.error('Erro ao iniciar a aplicação:',err);
    process.exit(1);
  }
})();
