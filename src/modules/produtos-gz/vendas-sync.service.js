const { query, all, get, pool } = require('../../db');
const produtosGz = require('./produtos-gz.service');
const catalogo = require('./catalogo.service');

const INICIO = process.env.GZ_SYNC_START_DATE || '2026-10-01';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INTERVALO_INICIAL_MS = Number(process.env.GZ_SYNC_INTERVAL_MS || 250);
const INTERVALO_MIN_MS = Number(process.env.GZ_SYNC_INTERVAL_MIN_MS || 250);
const INTERVALO_MAX_MS = Number(process.env.GZ_SYNC_INTERVAL_MAX_MS || 5000);
const BACKOFF_MS = Number(process.env.GZ_SYNC_BACKOFF_MS || 10000);
const LIMITE_FALHAS_CONSECUTIVAS = Number(process.env.GZ_SYNC_CIRCUIT_BREAKER || 5);
const SYNC_TIMEZONE = process.env.GZ_SYNC_TIMEZONE || 'America/Fortaleza';
const SYNC_HOUR = Number(process.env.GZ_SYNC_HOUR ?? 0);
const SYNC_MINUTE = Number(process.env.GZ_SYNC_MINUTE ?? 0);
const SYNC_END_HOUR = Number(process.env.GZ_SYNC_END_HOUR ?? 7);
const LOCK_A = 78451, LOCK_B = 51001;
const iso = d => d.toISOString().slice(0,10);
function partesLocais(d=new Date()){ const partes=new Intl.DateTimeFormat('en-CA',{timeZone:SYNC_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d); return Object.fromEntries(partes.filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); }
function hojeLocal(){ const p=partesLocais(); return `${p.year}-${p.month}-${p.day}`; }
function ontem(){ const h=hojeLocal(); const d=new Date(h+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return iso(d); }
function janelaAutomaticaEncerrada(){ const p=partesLocais(); return Number(p.hour)>=SYNC_END_HOUR; }
function diasEntre(a,b){ const out=[]; let d=new Date(a+'T12:00:00'); const fim=new Date(b+'T12:00:00'); while(d<=fim){out.push(iso(d));d.setDate(d.getDate()+1);} return out; }
function qtdMovimentos(movs,codigo){ let total=0; for(const m of movs||[]){ for(const p of (Array.isArray(m.produto)?m.produto:[])){ const c=String(p?.codigo||'').trim(); if(!c || c===String(codigo).trim()) total += Number(p?.quantidadeVendida||0); } } return total; }
function statusErro(e){ return Number(e?.status||e?.statusCode||e?.response?.status||0)||null; }
function ehLimitacao(e){ const st=statusErro(e); const msg=String(e?.message||e||'').toLowerCase(); return st===429 || st===503 || msg.includes('muitas requisi') || msg.includes('too many') || msg.includes('rate limit'); }

async function pendencias(codigo){ const rows=await all(`SELECT data_movimento FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 AND data_movimento BETWEEN $2::date AND $3::date`,[codigo,INICIO,ontem()]); const tem=new Set(rows.map(r=>String(r.data_movimento).slice(0,10))); return diasEntre(INICIO,ontem()).filter(d=>!tem.has(d)).reverse(); }

let executando=false;
let progressoAtual={fase:null,codigo:null,indice:0,total:0,iniciadoEm:null,intervaloMs:INTERVALO_INICIAL_MS,execucaoId:null};
let lockClient=null;

async function adquirirLock(){
  const client=await pool.connect();
  try{ const r=await client.query('SELECT pg_try_advisory_lock($1,$2) AS ok',[LOCK_A,LOCK_B]); if(!r.rows[0]?.ok){client.release();return null;} return client; }catch(e){client.release();throw e;}
}
async function liberarLock(){ if(!lockClient)return; const c=lockClient; lockClient=null; try{await c.query('SELECT pg_advisory_unlock($1,$2)',[LOCK_A,LOCK_B]);}catch(_){} c.release(); }
async function paradaSolicitada(execId){ const r=await get(`SELECT parada_solicitada FROM gz_sync_execucoes WHERE id=$1`,[execId]); return !!r?.parada_solicitada; }
async function logApi(execId,rota,codigo,data,status,latencia,tentativa,intervalo,erro=null){
  try{await query(`INSERT INTO gz_sync_api_logs(execucao_id,rota,codigo_produto,data_movimento,http_status,latencia_ms,tentativa,intervalo_ms,erro) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[execId,rota,codigo||null,data||null,status||null,latencia||0,tentativa||1,intervalo||0,erro?String(erro).slice(0,1000):null]);}catch(e){console.warn('Log API GZ:',e.message);}
}

async function iniciar({manual=false,usuarioId=null}={}){
  if(executando) return {iniciado:false,mensagem:'Já existe uma sincronização GZ em andamento.'};
  const c=await adquirirLock();
  if(!c) return {iniciado:false,mensagem:'Já existe uma sincronização GZ em andamento em outra instância.'};
  lockClient=c; executando=true;
  try{
    const exec=(await query(`INSERT INTO gz_sync_execucoes(tipo,status,iniciado_em,usuario_id,parada_solicitada,heartbeat_em) VALUES($1,'EM_ANDAMENTO',NOW(),$2,FALSE,NOW()) RETURNING id`,[manual?'MANUAL':'AUTOMATICA',usuarioId])).rows[0];
    executarInterno(exec.id,{manual}).catch(e=>console.error('Sincronização GZ:',e.message));
    return {iniciado:true,execucaoId:exec.id,mensagem:'Sincronização iniciada.'};
  }catch(e){ executando=false; await liberarLock(); throw e; }
}

async function executarInterno(execId,{manual=false}={}){
  let processados=0, erros=0, falhasConsecutivas=0, pausadaProtecao=false, interrompida=false, pausadaJanela=false;
  let intervaloAtual=Math.max(INTERVALO_MIN_MS,Math.min(INTERVALO_MAX_MS,INTERVALO_INICIAL_MS));
  const metricas={chamadasProdutos:0,chamadasMovimento:0,tempoProdutosMs:0,tempoMovimentoMs:0,tempoEsperaMs:0,maxApiMs:0,minApiMs:null,http200:0,http204:0,http429:0,http5xx:0,timeOuts:0,retries:0,backoffs:0};
  const contarStatus=st=>{ if(st===200)metricas.http200++; else if(st===204)metricas.http204++; else if(st===429)metricas.http429++; else if(st>=500)metricas.http5xx++; };
  const esperar=async(ms)=>{metricas.tempoEsperaMs+=ms;await sleep(ms);};
  const aliviar=async()=>{ metricas.backoffs++; intervaloAtual=Math.min(INTERVALO_MAX_MS,Math.max(intervaloAtual*2,1000)); progressoAtual.intervaloMs=intervaloAtual; await esperar(BACKOFF_MS); };
  const estabilizar=()=>{ if(intervaloAtual>INTERVALO_INICIAL_MS) intervaloAtual=Math.max(INTERVALO_INICIAL_MS,Math.round(intervaloAtual*0.9)); progressoAtual.intervaloMs=intervaloAtual; };
  try{
    // V55: antes da rotina normal, baixa uma fotografia completa do catálogo.
    // Se essa etapa falhar, a sincronização continua com a estratégia antiga por produto,
    // preservando confiabilidade em vez de depender de uma fotografia incompleta.
    let catalogoAtualizado=false;
    progressoAtual={fase:'CATALOGO',codigo:null,indice:0,total:0,iniciadoEm:new Date().toISOString(),intervaloMs:intervaloAtual,execucaoId:execId};
    try{
      const cat=await catalogo.atualizarCatalogo(execId,{
        onProgress: async info => {
          const total=Number(info.total||0);
          const indice=Number(info.processados||0);
          const rotulo=info.etapa==='BAIXANDO'?'Baixando catálogo':info.etapa==='FINALIZANDO'?'Finalizando catálogo':`Lote ${info.loteAtual||0}/${info.totalLotes||0}`;
          progressoAtual={...progressoAtual,fase:'CATALOGO',codigo:rotulo,indice,total,intervaloMs:intervaloAtual};
          await query(`UPDATE gz_sync_execucoes SET heartbeat_em=NOW() WHERE id=$1`,[execId]);
        }
      });
      catalogoAtualizado=true;
      const apiMs=Number(cat.apiDuracaoMs||cat.duracaoMs||0);
      metricas.chamadasProdutos++;
      metricas.tempoProdutosMs+=apiMs;
      metricas.maxApiMs=Math.max(metricas.maxApiMs,apiMs);
      metricas.minApiMs=metricas.minApiMs===null?apiMs:Math.min(metricas.minApiMs,apiMs);
      contarStatus(Number(cat.httpStatus||200));
      await logApi(execId,'/produtos/paginacao',null,null,cat.httpStatus||200,apiMs,1,0);
      await query(`UPDATE gz_sync_execucoes SET catalogo_http=$2,catalogo_tempo_ms=$3,catalogo_total=$4,catalogo_ativos=$5,catalogo_inativos=$6,catalogo_desconhecidos=$7,catalogo_novos_hoje=$8,catalogo_reativados=$9,catalogo_inativados=$10,heartbeat_em=NOW() WHERE id=$1`,[execId,cat.httpStatus||200,cat.duracaoMs||0,cat.total||cat.totalRecebido||0,cat.ativos||0,cat.inativos||0,cat.desconhecidos||0,cat.novosHoje||0,cat.reativados||0,cat.inativados||0]);
    }catch(e){
      const ms=0,st=statusErro(e);
      await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,tipo,mensagem) VALUES($1,'ERRO_CATALOGO',$2)`,[execId,`Fotografia completa do catálogo falhou; será usado fallback individual. ${String(e.message||e)}`.slice(0,1000)]);
      if(st) contarStatus(st);
    }

    const produtos=await all(`SELECT codigo_produto FROM gz_produtos_monitorados WHERE ativo=TRUE ORDER BY codigo_produto`);
    progressoAtual={fase:'VENDAS',codigo:null,indice:0,total:produtos.length,iniciadoEm:progressoAtual.iniciadoEm||new Date().toISOString(),intervaloMs:intervaloAtual,execucaoId:execId};
    let indiceProduto=0;
    for(const item of produtos){
      if(!manual && janelaAutomaticaEncerrada()){pausadaJanela=true;break;}
      if(await paradaSolicitada(execId)){interrompida=true;break;}
      await query(`UPDATE gz_sync_execucoes SET heartbeat_em=NOW() WHERE id=$1`,[execId]);
      indiceProduto++; const codigo=item.codigo_produto; progressoAtual={...progressoAtual,codigo,indice:indiceProduto,total:produtos.length,intervaloMs:intervaloAtual};
      let situacao='DESCONHECIDO';
      try{
        const hoje=hojeLocal(); const atual=await get(`SELECT situacao_gz,ultimo_status_em FROM gz_produtos_monitorados WHERE codigo_produto=$1`,[codigo]);
        // Quando a fotografia completa foi obtida nesta execução, só confiamos em status
        // que o catálogo conseguiu relacionar por EAN ou código interno. Itens não encontrados
        // tiveram situacao_gz limpa pelo catalogo.service e caem no fallback abaixo.
        if(catalogoAtualizado && atual?.situacao_gz) situacao=String(atual.situacao_gz).trim().toUpperCase();
        else if(atual?.ultimo_status_em && String(atual.ultimo_status_em).slice(0,10)===hoje && atual.situacao_gz) situacao=String(atual.situacao_gz).trim().toUpperCase();
        else{
          const t=Date.now();
          const codigoBusca=String(codigo).trim();
          let r=null;
          let erroPrimeiraTentativa=null;

          // Os 500 monitorados misturam EANs e códigos internos. Primeiro tenta como EAN;
          // se não houver produto (ou a chamada falhar), tenta como código interno.
          try{
            r=await produtosGz.consultarProduto({codigoBarras:codigoBusca});
          }catch(e){
            erroPrimeiraTentativa=e;
          }

          if(!r?.produtos?.length){
            try{
              r=await produtosGz.consultarProduto({codigoInterno:codigoBusca});
            }catch(e){
              const erroFinal=e;
              const ms=Date.now()-t,st=statusErro(erroFinal)||statusErro(erroPrimeiraTentativa);
              metricas.chamadasProdutos++;
              metricas.tempoProdutosMs+=ms;
              contarStatus(st);
              if(String(erroFinal.message||'').toLowerCase().includes('tempo limite'))metricas.timeOuts++;
              await logApi(execId,'/produtos',codigo,null,st,ms,1,intervaloAtual,erroFinal.message);
              if(ehLimitacao(erroFinal))await aliviar();
              throw erroFinal;
            }
          }

          const ms=Date.now()-t,st=r.httpStatus||200;
          metricas.chamadasProdutos++;
          metricas.tempoProdutosMs+=ms;
          metricas.maxApiMs=Math.max(metricas.maxApiMs,ms);
          metricas.minApiMs=metricas.minApiMs===null?ms:Math.min(metricas.minApiMs,ms);
          contarStatus(st);
          await logApi(execId,'/produtos',codigo,null,st,ms,1,intervaloAtual);

          const p=(r?.produtos||[]).find(x=>{
            const interno=String(x?.codigo??x?.codigoProduto??x?.codigoInterno??'').trim();
            const ean=String(x?.codigoEan??x?.ean??x?.codigoBarras??'').trim();
            return interno===codigoBusca || ean===codigoBusca;
          })||(r?.produtos||[])[0];

          if(!p)throw new Error('Produto não encontrado na consulta de situação da GZ.');
          situacao=String(p.situacao||p.status||p.ativo||'').trim().toUpperCase()||'DESCONHECIDO';
          await query(`UPDATE gz_produtos_monitorados SET situacao_gz=$2,ultimo_status_em=NOW() WHERE codigo_produto=$1`,[codigo,situacao]);
          await esperar(intervaloAtual);
          estabilizar();
        }
      }catch(e){ erros++;falhasConsecutivas++;const msg=`Falha ao verificar situação cadastral: ${String(e.message||e)}`;await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,msg.slice(0,1000)]);await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'ERRO_STATUS',$3)`,[execId,codigo,msg.slice(0,1000)]);if(falhasConsecutivas>=LIMITE_FALHAS_CONSECUTIVAS){pausadaProtecao=true;break;}continue;}
      if(situacao==='INATIVO'){await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]);falhasConsecutivas=0;continue;}
      if(situacao!=='ATIVO'){erros++;await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'STATUS_DESCONHECIDO',$3)`,[execId,codigo,`Situação GZ ${situacao}; vendas não consultadas por segurança.`]);continue;}
      const faltas=await pendencias(codigo);
      for(const data of faltas){
        if(!manual && janelaAutomaticaEncerrada()){pausadaJanela=true;break;}
        if(await paradaSolicitada(execId)){interrompida=true;break;}
        let ok=false,ultimoErro='';
        for(let tentativa=1;tentativa<=3&&!ok;tentativa++){
          const t=Date.now();
          try{const resp=await produtosGz.consultarVendasPeriodoDetalhado(codigo,data,data);const ms=Date.now()-t,st=resp.httpStatus||200;metricas.chamadasMovimento++;metricas.tempoMovimentoMs+=ms;metricas.maxApiMs=Math.max(metricas.maxApiMs,ms);metricas.minApiMs=metricas.minApiMs===null?ms:Math.min(metricas.minApiMs,ms);contarStatus(st);await logApi(execId,'/movimento-estoque',codigo,data,st,ms,tentativa,intervaloAtual);const qtd=qtdMovimentos(resp.movimentos,codigo);await query(`INSERT INTO gz_vendas_diarias(loja,codigo_produto,data_movimento,quantidade_vendida,origem,sincronizado_em) VALUES(1,$1,$2,$3,'API_GZ',NOW()) ON CONFLICT(loja,codigo_produto,data_movimento) DO UPDATE SET quantidade_vendida=EXCLUDED.quantidade_vendida,origem='API_GZ',sincronizado_em=NOW()`,[codigo,data,qtd]);await query(`UPDATE gz_produtos_monitorados SET ultimo_sucesso=NOW(),ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]);ok=true;processados++;falhasConsecutivas=0;estabilizar();}
          catch(e){const ms=Date.now()-t,st=statusErro(e);ultimoErro=String(e.message||e);metricas.chamadasMovimento++;metricas.tempoMovimentoMs+=ms;metricas.maxApiMs=Math.max(metricas.maxApiMs,ms);metricas.minApiMs=metricas.minApiMs===null?ms:Math.min(metricas.minApiMs,ms);contarStatus(st);if(ultimoErro.toLowerCase().includes('tempo limite'))metricas.timeOuts++;if(tentativa>1)metricas.retries++;await logApi(execId,'/movimento-estoque',codigo,data,st,ms,tentativa,intervaloAtual,ultimoErro);if(ehLimitacao(e))await aliviar();else if(tentativa<3){metricas.retries++;await esperar(30000);}}
        }
        if(!ok){erros++;falhasConsecutivas++;await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,ultimoErro.slice(0,1000)]);await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,data_movimento,tipo,mensagem) VALUES($1,$2,$3,'ERRO',$4)`,[execId,codigo,data,ultimoErro.slice(0,1000)]);if(falhasConsecutivas>=LIMITE_FALHAS_CONSECUTIVAS){pausadaProtecao=true;await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,tipo,mensagem) VALUES($1,'PROTECAO',$2)`,[execId,`Sincronização pausada após ${falhasConsecutivas} falhas consecutivas.`]);break;}}
        if(ok)await esperar(intervaloAtual);
      }
      if(interrompida||pausadaProtecao||pausadaJanela)break;
    }
    const chamadasApi=metricas.chamadasProdutos+metricas.chamadasMovimento,tempoApiMs=metricas.tempoProdutosMs+metricas.tempoMovimentoMs;
    if(pausadaJanela){
      await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,tipo,mensagem) VALUES($1,'JANELA_ENCERRADA',$2)`,[execId,`Janela automática encerrada às ${String(SYNC_END_HOUR).padStart(2,'0')}:00. As pendências restantes serão retomadas na próxima madrugada.`]);
    }
    const stFinal=interrompida?'INTERROMPIDA_MANUALMENTE':pausadaJanela?'PAUSADA_JANELA':pausadaProtecao?'PAUSADA_PROTECAO':(erros?'CONCLUIDA_COM_PENDENCIAS':'CONCLUIDA');
    await query(`UPDATE gz_sync_execucoes SET status=$2,finalizado_em=NOW(),itens_processados=$3,erros=$4,chamadas_produtos=$5,chamadas_movimento=$6,tempo_produtos_ms=$7,tempo_movimento_ms=$8,tempo_espera_ms=$9,api_min_ms=$10,api_max_ms=$11,api_media_ms=$12,http_200=$13,http_204=$14,http_429=$15,http_5xx=$16,time_outs=$17,retries=$18,backoffs=$19,intervalo_final_ms=$20 WHERE id=$1`,[execId,stFinal,processados,erros,metricas.chamadasProdutos,metricas.chamadasMovimento,metricas.tempoProdutosMs,metricas.tempoMovimentoMs,metricas.tempoEsperaMs,metricas.minApiMs,metricas.maxApiMs,chamadasApi?Math.round(tempoApiMs/chamadasApi):null,metricas.http200,metricas.http204,metricas.http429,metricas.http5xx,metricas.timeOuts,metricas.retries,metricas.backoffs,intervaloAtual]);
  }catch(e){await query(`UPDATE gz_sync_execucoes SET status='ERRO',finalizado_em=NOW(),erros=erros+1,mensagem=$2 WHERE id=$1`,[execId,String(e.message||e).slice(0,1000)]);throw e;}
  finally{executando=false;progressoAtual={fase:null,codigo:null,indice:0,total:0,iniciadoEm:null,intervaloMs:INTERVALO_INICIAL_MS,execucaoId:null};await liberarLock();}
}

async function parar(){ const r=await query(`UPDATE gz_sync_execucoes SET parada_solicitada=TRUE,mensagem=COALESCE(mensagem,'Parada manual solicitada pelo administrador.') WHERE status='EM_ANDAMENTO' RETURNING id`); return {solicitado:r.rowCount>0,execucoes:r.rows.map(x=>x.id)}; }
async function status(){
  const staleMin=Math.max(2,Number(process.env.GZ_SYNC_HEARTBEAT_STALE_MIN || 5));
  await query(`UPDATE gz_sync_execucoes SET status='INTERROMPIDA',finalizado_em=COALESCE(finalizado_em,NOW()),mensagem=COALESCE(mensagem,'Execução interrompida sem heartbeat (reinício/encerramento do processo).') WHERE status='EM_ANDAMENTO' AND COALESCE(heartbeat_em,iniciado_em) < NOW() - ($1 * INTERVAL '1 minute')`,[staleMin]);
  const esperado=ontem();
  const resumo=await get(`
    WITH ult AS (
      SELECT codigo_produto,MAX(data_movimento) atualizado_ate
        FROM gz_vendas_diarias WHERE loja=1 GROUP BY codigo_produto
    )
    SELECT
      COUNT(*) FILTER (WHERE p.ativo=TRUE)::int AS monitorados,
      (SELECT COUNT(*)::int FROM gz_catalogo_produtos WHERE situacao='INATIVO') AS inativos,
      COUNT(*) FILTER (WHERE p.ativo=TRUE AND u.atualizado_ate >= $1::date)::int AS em_dia,
      COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.ultimo_erro IS NOT NULL)::int AS com_erro,
      COUNT(*) FILTER (WHERE p.ativo=TRUE AND (u.atualizado_ate IS NULL OR u.atualizado_ate < $1::date) AND p.ultimo_erro IS NULL)::int AS pendentes
    FROM gz_produtos_monitorados p
    LEFT JOIN ult u ON u.codigo_produto=p.codigo_produto
  `,[esperado]);
  const execucoes=await all(`SELECT * FROM gz_sync_execucoes ORDER BY id DESC LIMIT 10`); const ocorrencias=await all(`SELECT id,codigo_produto,data_movimento,tipo,mensagem,criado_em FROM gz_sync_ocorrencias ORDER BY id DESC LIMIT 15`); const apiLogs=await all(`SELECT rota,codigo_produto,data_movimento,http_status,latencia_ms,tentativa,intervalo_ms,erro,criado_em FROM gz_sync_api_logs ORDER BY id DESC LIMIT 30`); const ativa=await get(`SELECT id FROM gz_sync_execucoes WHERE status='EM_ANDAMENTO' ORDER BY id DESC LIMIT 1`);
  const resumoCatalogo=await catalogo.resumoCatalogo();
  const cadastradosHoje=await catalogo.cadastrados({dataInicio:hojeLocal(),dataFim:hojeLocal(),limite:50});
  return {inicioHistorico:INICIO,esperadoAte:esperado,resumo:resumo||{},catalogo:resumoCatalogo,cadastradosHoje,execucoes,ocorrencias,apiLogs,executando:!!ativa,progresso:progressoAtual,intervaloChamadasMs:progressoAtual.intervaloMs||INTERVALO_INICIAL_MS,limiteFalhasConsecutivas:LIMITE_FALHAS_CONSECUTIVAS,agendamento:{hora:SYNC_HOUR,minuto:SYNC_MINUTE,horaFim:SYNC_END_HOUR,timeZone:SYNC_TIMEZONE}};
}
async function historico(codigo){return all(`SELECT data_movimento,quantidade_vendida,valor_venda,origem,sincronizado_em FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 ORDER BY data_movimento`,[String(codigo).trim()]);}
let timer;
function dentroJanelaAutomatica(){
  const p=partesLocais();
  const hora=Number(p.hour);
  const minuto=Number(p.minute);
  const aposInicio=hora>SYNC_HOUR || (hora===SYNC_HOUR && minuto>=SYNC_MINUTE);
  return aposInicio && hora<SYNC_END_HOUR;
}
async function marcarExecucoesAutomaticasStale(){
  const staleMin=Math.max(2,Number(process.env.GZ_SYNC_HEARTBEAT_STALE_MIN || 5));
  await query(`
    UPDATE gz_sync_execucoes
       SET status='INTERROMPIDA',
           finalizado_em=COALESCE(finalizado_em,NOW()),
           mensagem=COALESCE(mensagem,'Execução automática interrompida sem heartbeat; será retomada dentro da janela noturna.')
     WHERE tipo='AUTOMATICA'
       AND status='EM_ANDAMENTO'
       AND COALESCE(heartbeat_em,iniciado_em) < NOW() - ($1 * INTERVAL '1 minute')
  `,[staleMin]);
}
async function ultimaAutomaticaHoje(){
  const dia=hojeLocal();
  return get(`
    SELECT id,status,iniciado_em,finalizado_em
      FROM gz_sync_execucoes
     WHERE tipo='AUTOMATICA'
       AND (iniciado_em AT TIME ZONE $1)::date=$2::date
     ORDER BY id DESC
     LIMIT 1
  `,[SYNC_TIMEZONE,dia]);
}
function iniciarAgendador(){
  if(timer)return;
  const tick=async()=>{
    if(!dentroJanelaAutomatica()) return;
    await marcarExecucoesAutomaticasStale();
    const ultima=await ultimaAutomaticaHoje();
    if(ultima && ultima.status!=='INTERROMPIDA') return;
    const r=await iniciar({manual:false});
    if(r.iniciado) console.log(`[V55] Sincronização automática iniciada/retomada na janela noturna. Execução ${r.execucaoId}.`);
  };
  timer=setInterval(()=>tick().catch(e=>console.error('Agendador GZ:',e.message)),30*1000);
  setTimeout(()=>tick().catch(e=>console.error('Agendador GZ:',e.message)),3000);
  console.log(`Sincronização GZ preparada: ${String(SYNC_HOUR).padStart(2,'0')}:${String(SYNC_MINUTE).padStart(2,'0')}–${String(SYNC_END_HOUR).padStart(2,'0')}:00 (${SYNC_TIMEZONE}), todos os produtos ativos.`);
}
module.exports={iniciar,parar,status,historico,iniciarAgendador};
