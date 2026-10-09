'use strict';
// Uso: node scripts/migrar-almox-v62.js --simular
//      node scripts/migrar-almox-v62.js --aplicar --confirmar=MIGRAR_V62
// Execute o aplicar somente com o sistema parado e backup de banco testado.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
function classificar(item) {
  let nome=String(item.descricao).trim();
  let rotulo='Padrão', tipo='Padrão';
  const tam = nome.match(/\s*\(\s*(?:TAMANHO\s*|N\s*[.º°o]*\s*)\s*(P|M|G|GG|G1|XGG|\d{2})\s*\)\s*$/i);
  if(tam) {rotulo=tam[1].toUpperCase();tipo='Tamanho';nome=nome.slice(0,tam.index).trim();}
  // Novo/usado é uma condição diferente, não um tamanho: manter como variação.
  const cond = !tam && nome.match(/\s*\((Novo|Usado)\)\s*$/i);
  if(cond){rotulo=cond[1];tipo='Condição';nome=nome.slice(0,cond.index).trim();}
  return { nome, rotulo, tipo, categoria:item.categoria||'', unidade:item.unidade||'UND', item_id:item.id, saldo:Number(item.quantidade_atual) };
}
function plano(itens) {
  const grupos=new Map();
  for(const item of itens){
    const c=classificar(item);
    const chave=[c.nome,c.categoria,c.unidade].map(v=>v.toLocaleLowerCase('pt-BR')).join('|');
    if(!grupos.has(chave)) grupos.set(chave,{descricao:c.nome,categoria:c.categoria,unidade:c.unidade,variacoes:[]});
    grupos.get(chave).variacoes.push(c);
  }
  return [...grupos.values()];
}
async function executar(){
  const aplicar=process.argv.includes('--aplicar');
  if(aplicar && !process.argv.includes('--confirmar=MIGRAR_V62')) throw Error('Para aplicar use --aplicar --confirmar=MIGRAR_V62');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    if(aplicar) await client.query('LOCK TABLE almox_itens IN SHARE ROW EXCLUSIVE MODE');
    const result=await client.query(`SELECT i.* FROM almox_itens i
      LEFT JOIN almox_variacoes v ON v.item_id=i.id
      WHERE i.ativo=TRUE AND v.id IS NULL ORDER BY i.id`);
    const grupos=plano(result.rows);
    const ambiguos=grupos.filter(g=>new Set(g.variacoes.map(v=>v.rotulo.toLowerCase())).size!==g.variacoes.length);
    const report={modo:aplicar?'APLICAR':'SIMULAR',em:new Date().toISOString(),itens_nao_mapeados:result.rows.length,
      saldo_nao_mapeado:result.rows.reduce((a,i)=>a+Number(i.quantidade_atual),0),produtos:grupos,ambiguidades:ambiguos.map(g=>g.descricao)};
    const filepath=path.join(__dirname,`relatorio_almox_v62_${aplicar?'aplicacao':'simulacao'}.json`);
    // Sempre grave a prévia, sem credenciais.
    fs.writeFileSync(filepath,JSON.stringify(report,null,2),'utf8');
    console.log(`Relatório: ${filepath}`);
    console.log(`Itens a vincular: ${result.rows.length}. Famílias identificadas: ${grupos.length}. Saldo: ${report.saldo_nao_mapeado}`);
    if(ambiguos.length) throw Error(`Variações de rótulo duplicado em: ${ambiguos.map(g=>g.descricao).join(', ')}. Corrija e revise antes da migração.`);
    if(aplicar){
      for(const g of grupos){
        let found=await client.query(`SELECT * FROM almox_produtos WHERE lower(trim(descricao))=lower(trim($1)) AND lower(trim(coalesce(categoria,'')))=lower(trim($2)) FOR UPDATE`,[g.descricao,g.categoria]);
        let produto=found.rows[0];
        if(!produto){const novo=await client.query(`INSERT INTO almox_produtos(descricao,categoria,unidade) VALUES($1,$2,$3) RETURNING *`,[g.descricao,g.categoria||null,g.unidade]);produto=novo.rows[0];}
        if(produto.unidade!==g.unidade)throw Error(`Unidade divergente em ${g.descricao}`);
        for(const v of g.variacoes){
          await client.query(`INSERT INTO almox_variacoes(produto_id,item_id,rotulo,atributos) VALUES($1,$2,$3,$4::jsonb)`,
          [produto.id,v.item_id,v.rotulo,JSON.stringify({tipo:v.tipo,valor:v.rotulo})]);
        }
      }
      const check=await client.query(`SELECT COUNT(*)::int total FROM almox_itens i LEFT JOIN almox_variacoes v ON v.item_id=i.id WHERE i.ativo AND v.id IS NULL`);
      if(check.rows[0].total!==0)throw Error('Migração incompleta: há itens ativos sem variação.');
      await client.query('COMMIT');console.log('Migração concluída. Nenhum saldo ou histórico foi alterado.');
    }else {await client.query('ROLLBACK');console.log('Simulação concluída. Banco não alterado. Revise o JSON antes de aplicar.');}
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
}
executar().catch(e=>{console.error('Falha:',e.message);process.exitCode=1;});
