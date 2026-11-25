const assert=require('node:assert/strict');
const path=require('path');
const modulePath=path.resolve(__dirname,'../../config/database.js');
const seen=[];
require.cache[modulePath]={id:modulePath,filename:modulePath,loaded:true,exports:{
  get:async(sql,args)=>{seen.push({sql,args});return {registros:2,embalagens:'105'}},
  all:async(sql,args)=>{seen.push({sql,args});return [
    {data:'2026-11-25',codigo:'7890000000001',produto:'Produto A',embalagens:75,unidades:450},
    {data:'2026-11-25',codigo:'1046',produto:'Produto B',embalagens:30,unidades:30}
  ]}
}};
const {detailed}=require('./consultas-galpao');
(async()=>{
 const result=await detailed('Liste os códigos das saídas de 25/11/2026');
 assert.match(result.answer,/2 saídas/);
 assert.equal(result.table.rows[0].codigo,'7890000000001');
 assert.equal(result.table.rows[1].codigo,'1046');
 assert.equal(seen[0].args[0],'SAIDA');
 assert.equal(seen[0].args[1],'2026-11-25');
 assert.match(seen[0].sql,/estornado,FALSE\)=FALSE/);
 assert.equal(await detailed('Olá'),null);
 console.log('7 verificações de SQL parametrizado, estornos, totais e códigos passaram');
})().catch(e=>{console.error(e);process.exitCode=1});
