const { query, all, get } = require('../../db');
const produtosGz = require('./produtos-gz.service');

const PILOTO = ['7894900700398','5601252231164','7891000359822'];
const INICIO = process.env.GZ_SYNC_START_DATE || '2026-10-01';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = d => d.toISOString().slice(0,10);
function ontem(){ const d=new Date(); d.setDate(d.getDate()-1); return iso(d); }
function diasEntre(a,b){ const out=[]; let d=new Date(a+'T12:00:00'); const fim=new Date(b+'T12:00:00'); while(d<=fim){out.push(iso(d));d.setDate(d.getDate()+1);} return out; }
function qtdMovimentos(movs,codigo){ let total=0; for(const m of movs||[]){ for(const p of (Array.isArray(m.produto)?m.produto:[])){ const c=String(p?.codigo||'').trim(); if(!c || c===String(codigo).trim()) total += Number(p?.quantidadeVendida||0); } } return total; }

async function garantirPiloto(){
  for(const codigo of PILOTO) await query(`INSERT INTO gz_produtos_monitorados(codigo_produto,ativo) VALUES($1,TRUE) ON CONFLICT(codigo_produto) DO NOTHING`,[codigo]);
}
async function pendencias(codigo){
  const rows=await all(`SELECT data_movimento FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 AND data_movimento BETWEEN $2::date AND $3::date`,[codigo,INICIO,ontem()]);
  const tem=new Set(rows.map(r=>String(r.data_movimento).slice(0,10)));
  return diasEntre(INICIO,ontem()).filter(d=>!tem.has(d));
}
async function executar({manual=false,usuarioId=null}={}){
  await garantirPiloto();
  const exec=(await query(`INSERT INTO gz_sync_execucoes(tipo,status,iniciado_em,usuario_id) VALUES($1,'EM_ANDAMENTO',NOW(),$2) RETURNING id`,[manual?'MANUAL':'AUTOMATICA',usuarioId])).rows[0];
  let processados=0, erros=0;
  try{
    const produtos=await all(`SELECT codigo_produto FROM gz_produtos_monitorados WHERE ativo=TRUE ORDER BY codigo_produto`);
    for(const item of produtos){
      const codigo=item.codigo_produto; const faltas=await pendencias(codigo);
      for(const data of faltas){
        let ok=false, ultimoErro='';
        for(let tentativa=1; tentativa<=3 && !ok; tentativa++){
          try{
            const movs=await produtosGz.consultarVendasPeriodo(codigo,data,data);
            const qtd=qtdMovimentos(movs,codigo);
            await query(`INSERT INTO gz_vendas_diarias(loja,codigo_produto,data_movimento,quantidade_vendida,origem,sincronizado_em) VALUES(1,$1,$2,$3,'API_GZ',NOW()) ON CONFLICT(loja,codigo_produto,data_movimento) DO UPDATE SET quantidade_vendida=EXCLUDED.quantidade_vendida,origem='API_GZ',sincronizado_em=NOW()`,[codigo,data,qtd]);
            await query(`UPDATE gz_produtos_monitorados SET ultimo_sucesso=NOW(),ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]); ok=true; processados++;
          }catch(e){ ultimoErro=String(e.message||e); if(tentativa<3) await sleep(30000); }
        }
        if(!ok){ erros++; await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,ultimoErro.slice(0,1000)]); await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,data_movimento,tipo,mensagem) VALUES($1,$2,$3,'ERRO',$4)`,[exec.id,codigo,data,ultimoErro.slice(0,1000)]); }
        await sleep(1500);
      }
    }
    await query(`UPDATE gz_sync_execucoes SET status=$2,finalizado_em=NOW(),itens_processados=$3,erros=$4 WHERE id=$1`,[exec.id,erros?'CONCLUIDA_COM_PENDENCIAS':'CONCLUIDA',processados,erros]);
  }catch(e){ await query(`UPDATE gz_sync_execucoes SET status='ERRO',finalizado_em=NOW(),erros=erros+1,mensagem=$2 WHERE id=$1`,[exec.id,String(e.message||e).slice(0,1000)]); throw e; }
  return status();
}
async function status(){
  await garantirPiloto();
  const produtos=await all(`SELECT p.codigo_produto,p.ativo,p.ultimo_sucesso,p.ultimo_erro,MAX(v.data_movimento) AS atualizado_ate FROM gz_produtos_monitorados p LEFT JOIN gz_vendas_diarias v ON v.codigo_produto=p.codigo_produto AND v.loja=1 GROUP BY p.codigo_produto,p.ativo,p.ultimo_sucesso,p.ultimo_erro ORDER BY p.codigo_produto`);
  const execucoes=await all(`SELECT id,tipo,status,iniciado_em,finalizado_em,itens_processados,erros,mensagem FROM gz_sync_execucoes ORDER BY id DESC LIMIT 20`);
  const ocorrencias=await all(`SELECT id,codigo_produto,data_movimento,tipo,mensagem,criado_em FROM gz_sync_ocorrencias ORDER BY id DESC LIMIT 30`);
  return {inicioHistorico:INICIO,esperadoAte:ontem(),produtos,execucoes,ocorrencias};
}
async function historico(codigo){ return all(`SELECT data_movimento,quantidade_vendida,valor_venda,origem,sincronizado_em FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 ORDER BY data_movimento`,[String(codigo).trim()]); }
let timer;
function iniciarAgendador(){
  if(timer) return; const hora=Number(process.env.GZ_SYNC_HOUR||2); let ultimoDia='';
  const tick=async()=>{ const agora=new Date(); const dia=iso(agora); if(agora.getHours()===hora && ultimoDia!==dia){ ultimoDia=dia; try{await executar();}catch(e){console.error('Sincronização GZ:',e.message);} } };
  timer=setInterval(tick,15*60*1000); setTimeout(tick,5000); console.log(`Sincronização GZ preparada: ${hora}:00, ${PILOTO.length} produtos piloto.`);
}
module.exports={executar,status,historico,iniciarAgendador,garantirPiloto};
