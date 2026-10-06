const { query, all, get } = require('../../db');
const produtosGz = require('./produtos-gz.service');

const PILOTO = ["7894900700398","5601252231164","7891000359822","7898275012919","7894383000183","436","1064","969","34","795","96","758","2","52","1902","7500435138703","964","7898939778267","78912366","7897744504214","162","928","71","629","678","7898910124335","7897144601353","7897518225093","7898649351026","7898958872557","7591543119753","78930476","7899711508041","90159060789","7891344015774","5605801250187","4210201826613","7899085641269","125","7899970403729","7896033241236","7896085393365","7897753668242","7908492701531","7891098041418","7908324402841","7896098905333","7898967570079","7898933494002","7896336016289","7896013105039","735810180634","7898321380603","7891048050606","5019","7896272000830","618231367108","8410036002916","7894693043832","7891091061765","179","7896945403296","7898760040106","7891024114216","7891079014295","7896029046494","7891112324299","7891112337626","7896007545094","7896359004294","7896283007439","7897326800130","7891112003675","7891150024571","7898202615022","7898723631839","7898202617064","7891112348370","7891055112403","7891150075276","7896036001349","7898270967122","7896001200142","8001860187735","7896009301131","7896022204143","7898951850095","7898205925463","7891097103230","7896041172706","7908615062556","7500435127271","7861002901831","7896731019854","7891962076362","7891025123200","7896342400683","7896279106597","7896619428099","7898697790921"];
const INICIO = process.env.GZ_SYNC_START_DATE || '2026-10-01';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INTERVALO_CHAMADAS_MS = Number(process.env.GZ_SYNC_INTERVAL_MS || 1000);
const LIMITE_FALHAS_CONSECUTIVAS = Number(process.env.GZ_SYNC_CIRCUIT_BREAKER || 5);
const iso = d => d.toISOString().slice(0,10);
function ontem(){ const d=new Date(); d.setDate(d.getDate()-1); return iso(d); }
function diasEntre(a,b){ const out=[]; let d=new Date(a+'T12:00:00'); const fim=new Date(b+'T12:00:00'); while(d<=fim){out.push(iso(d));d.setDate(d.getDate()+1);} return out; }
function qtdMovimentos(movs,codigo){ let total=0; for(const m of movs||[]){ for(const p of (Array.isArray(m.produto)?m.produto:[])){ const c=String(p?.codigo||'').trim(); if(!c || c===String(codigo).trim()) total += Number(p?.quantidadeVendida||0); } } return total; }

async function garantirPiloto(){
  for(const codigo of PILOTO) await query(`INSERT INTO gz_produtos_monitorados(codigo_produto,ativo) VALUES($1,TRUE) ON CONFLICT(codigo_produto) DO NOTHING`,[codigo]);
}

async function verificarSituacaoProduto(codigo){
  const hoje=iso(new Date());
  const atual=await get(`SELECT situacao_gz,ultimo_status_em FROM gz_produtos_monitorados WHERE codigo_produto=$1`,[codigo]);
  if(atual?.ultimo_status_em && String(atual.ultimo_status_em).slice(0,10)===hoje && atual.situacao_gz){
    return String(atual.situacao_gz).toUpperCase();
  }
  const r=await produtosGz.consultarProduto({codigoInterno:String(codigo).trim()});
  const p=(r?.produtos||[]).find(x=>String(x?.codigo||'').trim()===String(codigo).trim()) || (r?.produtos||[])[0];
  if(!p) throw new Error('Produto não encontrado na consulta de situação da GZ.');
  const situacao=String(p.situacao||'').trim().toUpperCase() || 'DESCONHECIDO';
  await query(`UPDATE gz_produtos_monitorados SET situacao_gz=$2,ultimo_status_em=NOW() WHERE codigo_produto=$1`,[codigo,situacao]);
  await sleep(INTERVALO_CHAMADAS_MS);
  return situacao;
}

async function pendencias(codigo){
  const rows=await all(`SELECT data_movimento FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 AND data_movimento BETWEEN $2::date AND $3::date`,[codigo,INICIO,ontem()]);
  const tem=new Set(rows.map(r=>String(r.data_movimento).slice(0,10)));
  return diasEntre(INICIO,ontem()).filter(d=>!tem.has(d));
}
let executando=false;
let progressoAtual={codigo:null,indice:0,total:0,iniciadoEm:null};
async function executar({manual=false,usuarioId=null}={}){
  if(executando) throw new Error('Já existe uma sincronização GZ em andamento.');
  await garantirPiloto();
  const exec=(await query(`INSERT INTO gz_sync_execucoes(tipo,status,iniciado_em,usuario_id) VALUES($1,'EM_ANDAMENTO',NOW(),$2) RETURNING id`,[manual?'MANUAL':'AUTOMATICA',usuarioId])).rows[0];
  executando=true;
  let processados=0, erros=0, falhasConsecutivas=0, pausadaProtecao=false;
  try{
    const produtos=await all(`SELECT codigo_produto FROM gz_produtos_monitorados WHERE ativo=TRUE ORDER BY codigo_produto`);
    progressoAtual={codigo:null,indice:0,total:produtos.length,iniciadoEm:new Date().toISOString()};
    let indiceProduto=0;
    for(const item of produtos){
      indiceProduto++;
      const codigo=item.codigo_produto;
      progressoAtual={...progressoAtual,codigo,indice:indiceProduto,total:produtos.length};
      let situacao='DESCONHECIDO';
      try{
        situacao=await verificarSituacaoProduto(codigo);
      }catch(e){
        erros++; falhasConsecutivas++;
        const msg=`Falha ao verificar situação cadastral: ${String(e.message||e)}`;
        await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,msg.slice(0,1000)]);
        await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'ERRO_STATUS',$3)`,[exec.id,codigo,msg.slice(0,1000)]);
        if(falhasConsecutivas >= LIMITE_FALHAS_CONSECUTIVAS){ pausadaProtecao=true; break; }
        await sleep(INTERVALO_CHAMADAS_MS);
        continue;
      }
      if(situacao==='INATIVO'){
        await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]);
        falhasConsecutivas=0;
        continue;
      }
      if(situacao!=='ATIVO'){
        erros++;
        await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'STATUS_DESCONHECIDO',$3)`,[exec.id,codigo,`Situação GZ ${situacao}; vendas não consultadas por segurança.`]);
        continue;
      }
      const faltas=await pendencias(codigo);
      for(const data of faltas){
        let ok=false, ultimoErro='';
        for(let tentativa=1; tentativa<=3 && !ok; tentativa++){
          try{
            const movs=await produtosGz.consultarVendasPeriodo(codigo,data,data);
            const qtd=qtdMovimentos(movs,codigo);
            await query(`INSERT INTO gz_vendas_diarias(loja,codigo_produto,data_movimento,quantidade_vendida,origem,sincronizado_em) VALUES(1,$1,$2,$3,'API_GZ',NOW()) ON CONFLICT(loja,codigo_produto,data_movimento) DO UPDATE SET quantidade_vendida=EXCLUDED.quantidade_vendida,origem='API_GZ',sincronizado_em=NOW()`,[codigo,data,qtd]);
            await query(`UPDATE gz_produtos_monitorados SET ultimo_sucesso=NOW(),ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]); ok=true; processados++; falhasConsecutivas=0;
          }catch(e){ ultimoErro=String(e.message||e); if(tentativa<3) await sleep(30000); }
        }
        if(!ok){
          erros++; falhasConsecutivas++;
          await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,ultimoErro.slice(0,1000)]);
          await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,data_movimento,tipo,mensagem) VALUES($1,$2,$3,'ERRO',$4)`,[exec.id,codigo,data,ultimoErro.slice(0,1000)]);
          if(falhasConsecutivas >= LIMITE_FALHAS_CONSECUTIVAS){
            pausadaProtecao=true;
            await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,tipo,mensagem) VALUES($1,'PROTECAO',$2)`,[exec.id,`Sincronização pausada após ${falhasConsecutivas} falhas consecutivas para proteger a API GZ.`]);
            break;
          }
        }
        await sleep(INTERVALO_CHAMADAS_MS);
      }
      if(pausadaProtecao) break;
    }
    await query(`UPDATE gz_sync_execucoes SET status=$2,finalizado_em=NOW(),itens_processados=$3,erros=$4 WHERE id=$1`,[exec.id,pausadaProtecao?'PAUSADA_PROTECAO':(erros?'CONCLUIDA_COM_PENDENCIAS':'CONCLUIDA'),processados,erros]);
  }catch(e){ await query(`UPDATE gz_sync_execucoes SET status='ERRO',finalizado_em=NOW(),erros=erros+1,mensagem=$2 WHERE id=$1`,[exec.id,String(e.message||e).slice(0,1000)]); executando=false; progressoAtual={codigo:null,indice:0,total:0,iniciadoEm:null}; throw e; }
  executando=false;
  progressoAtual={codigo:null,indice:0,total:0,iniciadoEm:null};
  return status();
}
async function status(){
  // Se o servidor foi reiniciado durante uma execução, evita deixar registros órfãos como EM_ANDAMENTO.
  if(!executando){
    await query(`UPDATE gz_sync_execucoes SET status='INTERROMPIDA',finalizado_em=COALESCE(finalizado_em,NOW()),mensagem=COALESCE(mensagem,'Execução interrompida antes da conclusão (reinício/encerramento do servidor).') WHERE status='EM_ANDAMENTO'`);
  }
  const esperado=ontem();
  const resumo=await get(`WITH ult AS (SELECT codigo_produto,MAX(data_movimento) atualizado_ate FROM gz_vendas_diarias WHERE loja=1 GROUP BY codigo_produto) SELECT COUNT(*) FILTER (WHERE p.ativo=TRUE)::int AS monitorados, COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz='INATIVO')::int AS inativos, COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz IS DISTINCT FROM 'INATIVO' AND u.atualizado_ate >= $1::date)::int AS em_dia, COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.ultimo_erro IS NOT NULL)::int AS com_erro, COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz IS DISTINCT FROM 'INATIVO' AND (u.atualizado_ate IS NULL OR u.atualizado_ate < $1::date) AND p.ultimo_erro IS NULL)::int AS pendentes FROM gz_produtos_monitorados p LEFT JOIN ult u ON u.codigo_produto=p.codigo_produto`,[esperado]);
  const execucoes=await all(`SELECT id,tipo,status,iniciado_em,finalizado_em,itens_processados,erros,mensagem FROM gz_sync_execucoes ORDER BY id DESC LIMIT 10`);
  const ocorrencias=await all(`SELECT id,codigo_produto,data_movimento,tipo,mensagem,criado_em FROM gz_sync_ocorrencias ORDER BY id DESC LIMIT 15`);
  return {inicioHistorico:INICIO,esperadoAte:esperado,resumo:resumo||{},execucoes,ocorrencias,executando,progresso:progressoAtual,intervaloChamadasMs:INTERVALO_CHAMADAS_MS,limiteFalhasConsecutivas:LIMITE_FALHAS_CONSECUTIVAS};
}
async function historico(codigo){ return all(`SELECT data_movimento,quantidade_vendida,valor_venda,origem,sincronizado_em FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 ORDER BY data_movimento`,[String(codigo).trim()]); }
let timer;
function iniciarAgendador(){
  if(timer) return; const hora=Number(process.env.GZ_SYNC_HOUR||2); let ultimoDia='';
  const tick=async()=>{ const agora=new Date(); const dia=iso(agora); if(agora.getHours()===hora && ultimoDia!==dia){ ultimoDia=dia; try{await executar();}catch(e){console.error('Sincronização GZ:',e.message);} } };
  timer=setInterval(tick,15*60*1000); setTimeout(tick,5000); console.log(`Sincronização GZ preparada: ${hora}:00, ${PILOTO.length} produtos piloto.`);
}
module.exports={executar,status,historico,iniciarAgendador,garantirPiloto};
