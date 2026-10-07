const { query, all, get, pool } = require('../../db');
const produtosGz = require('./produtos-gz.service');
const catalogo = require('./catalogo.service');

const PILOTO = ["7894900700398","5601252231164","7891000359822","7898275012919","7894383000183","436","1064","969","34","795","96","758","2","52","1902","7500435138703","964","7898939778267","78912366","7897744504214","162","928","71","629","678","7898910124335","7897144601353","7897518225093","7898649351026","7898958872557","7591543119753","78930476","7899711508041","90159060789","7891344015774","5605801250187","4210201826613","7899085641269","125","7899970403729","7896033241236","7896085393365","7897753668242","7908492701531","7891098041418","7908324402841","7896098905333","7898967570079","7898933494002","7896336016289","7896013105039","735810180634","7898321380603","7891048050606","5019","7896272000830","618231367108","8410036002916","7894693043832","7891091061765","179","7896945403296","7898760040106","7891024114216","7891079014295","7896029046494","7891112324299","7891112337626","7896007545094","7896359004294","7896283007439","7897326800130","7891112003675","7891150024571","7898202615022","7898723631839","7898202617064","7891112348370","7891055112403","7891150075276","7896036001349","7898270967122","7896001200142","8001860187735","7896009301131","7896022204143","7898951850095","7898205925463","7891097103230","7896041172706","7908615062556","7500435127271","7861002901831","7896731019854","7891962076362","7891025123200","7896342400683","7896279106597","7896619428099","7898697790921","600","601","606","609","88","604","602","7891091010008","7896045505340","603","648","7896259411628","513","7898215151784","7891000065440","5001","78936683","7891022868036","7898422746759","7896006400011","7896045506873","7896009301049","155","7891022638004","114","7896445490598","7896278301900","7894321722016","7896292341098","7893500020110","7896101711012","7893000482401","7894900060010","722","7891107101621","7894904015108","7891150064928","7896110081250","23","7898969564281","611","7898964675579","7891991000727","7891025115656","7891091010503","7893500018469","7899916906031","7898080640222","7896038321056","7894900531008","7896013100461","7896259410133","7898403782387","7896445490086","7898080640611","614","7891097104343","7898286560812","7898564110081","7896347504317","7896445490550","78909045","7891000126905","7891091010701","291","7891035210006","74","7891991014762","7891024132005","7898969564298","7896110001524","7891000412855","7896110083254","331","7896423420180","7891000307120","7898387120090","7891091016260","7891098040886","7891098040831","7898117960033","791","7891022100372","7896004814162","7896102503661","7891091011739","78912939","7891098041630","7896051020127","7896512909787","7896213006235","7891000248768","412","7899848704446","7891991000826","1121","7894900530001","7896009301063","7898215152002","7891000120101","7896221600012","7891091018011","7893000863125","7500435154420","7898215151302","7896110100043","7891150058903","7896445490116","7908324402865","7898939247220","7891962042725","7891021006071","7896914000716","7896639800325","7894900700015","7891000393284","7896006711117","7891000100103","90","7891025122067","7894900010398","7896110012148","7891024135020","7891000249376","394","7891000367506","7891991016124","7896013104919","7891962056500","7896045506415","7898156550622","7891091011913","7896102502183","7898938890076","7891150097544","511","7897886900066","7891010247386","7891991304870","7896055503107","7898215151999","7896004400075","7896013104070","7891091063301","7891022639001","7894900010015","7891000092606","7898192251545","7896224813082","7894000010014","7897664130036","7896045506934","7897886900011","7898031690016","7891022640007","7896045506439","7894900593709","7622210575975","7898321380634","7892840815769","5601216120152","7891991014908","7896260700216","7898080640413","7898994327516","7500435150248","7896003739343","7891025120230","7898505140221","7891097104336","4005900521972","7898969564175","7896268000080","7896110081359","7898321380535","7891962027395","7891008124583","7898215151708","7891962027388","7896445491366","7891150068780","7891091011746","7891024135310","7891000073018","7898912627018","7896102500844","7896110010731","7896213006686","7891150064522","7898939247015","7898505140405","7894321242521","7894900320015","7891134001710","627","7891000379585","7896055503008","4005900521910","7891000006689","7896445491373","7896110000176","7896051130055","7891000307083","7896292334137","7892840812850","7894900160017","7891000370643","7506339363883","6","7891172523328","7509546702605","7895800304228","7898215152811","7898136380065","7891097106118","7891010560737","7896098902042","7896259411796","7896013100515","7896098900215","7896260700230","7891022637007","7891091020021","5601252102433","7891152802078","7898215151319","7898964675555","7898270967313","7891091011548","7896098909737","7898215151982","7891000457467","7896013105619","7896022200756","7891000370728","7891000342176","7896045507726","7891150078413","7896090100101","7891991010481","7894900530308","7891999014092","7898215153221","7898973241079","397","7896055510068","7896224800808","7894900701609","7891024035313","7896098905944","7891095911349","7896213006396","7891172523854","7896311778041","7896272004203","7896100503090","7898942775321","7896347504324","7891991015493","7891150097575","7898505140566","7891000457092","7896065880021","7896006413851","7891000258910","7898942775307","7897398311893","7898215151425","7894650013502","7898005510159","7896013102595","7896024760289","7891010501105","7891910000197","7891024134702","7891091011586","7891095008452","7896034680126","7896098900239","7891010247454","7891000325858","384","7898505140450","7896098900253","7895800304211","7896051099918","7896038306053","7896003739336","7896490288775","5604424244009","7896007811007","7898286560843","7891962018553","7898005516182","7896013105626","7891962018546","7500435157476","7896051111030","7891091011593","7891024035078","70847022015","7898912302823","782","7891024034910","7891152802108","7891000101506","7897517209544","7622300990701","7898973241093","7896221600036","7896005800027","70847022206","7891991297424","7896116900050","7891024035047","7898949599142","7898409957970","7896030892646","7896045507610","7891091061857","7622210564313","7896005213599","844","7896213006464","7891055605806","7896009301155","611269991000","7896013100669","7891022860955","7891097104619","7898031174660","7791293035802","7891091061659","7898938890113","4005900916129","7891962071732","395","7891024132128","7891172421174","7896098906019","7891991302029","7891079001011","7897744504740","7899916917150","7891035285158","7509546695785","78938816","7897398309272","7896045109074","7896029046296","7896445491328","7898505140214","7896603800849","70847033929","7896013109211","7896224814126","7898770420011","7891091010558","7898215157403","7898156551001","7896029046173","7891021001885","7896007912278","7898366930740","7891000446799","7896045506248","7891091018028","7896224802963","7896292340503","7897886900028","70847022305","5601252106103","7891032015215","7896038313198","7897744501176","7898321380627","7896292334298","16","7500435122764","7891091011562","7894900011609","7896044999904","253","7898969564168","7897664130012","7891097000775","7896045110407","7898321380542","7896013105657","7896098900208","7898080640635","7891024037973","7891000072950","7896106903009","7896030892684","7891079001028","7896090082056","7893218003603","7896045115341","7898920160897"];
const INICIO = process.env.GZ_SYNC_START_DATE || '2026-10-01';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INTERVALO_INICIAL_MS = Number(process.env.GZ_SYNC_INTERVAL_MS || 500);
const INTERVALO_MIN_MS = Number(process.env.GZ_SYNC_INTERVAL_MIN_MS || 300);
const INTERVALO_MAX_MS = Number(process.env.GZ_SYNC_INTERVAL_MAX_MS || 5000);
const BACKOFF_MS = Number(process.env.GZ_SYNC_BACKOFF_MS || 10000);
const LIMITE_FALHAS_CONSECUTIVAS = Number(process.env.GZ_SYNC_CIRCUIT_BREAKER || 5);
const SYNC_TIMEZONE = process.env.GZ_SYNC_TIMEZONE || 'America/Fortaleza';
const SYNC_HOUR = Number(process.env.GZ_SYNC_HOUR ?? 0);
const SYNC_MINUTE = Number(process.env.GZ_SYNC_MINUTE ?? 0);
const LOCK_A = 78451, LOCK_B = 51001;
const iso = d => d.toISOString().slice(0,10);
function partesLocais(d=new Date()){ const partes=new Intl.DateTimeFormat('en-CA',{timeZone:SYNC_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d); return Object.fromEntries(partes.filter(x=>x.type!=='literal').map(x=>[x.type,x.value])); }
function hojeLocal(){ const p=partesLocais(); return `${p.year}-${p.month}-${p.day}`; }
function ontem(){ const h=hojeLocal(); const d=new Date(h+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return iso(d); }
function diasEntre(a,b){ const out=[]; let d=new Date(a+'T12:00:00'); const fim=new Date(b+'T12:00:00'); while(d<=fim){out.push(iso(d));d.setDate(d.getDate()+1);} return out; }
function qtdMovimentos(movs,codigo){ let total=0; for(const m of movs||[]){ for(const p of (Array.isArray(m.produto)?m.produto:[])){ const c=String(p?.codigo||'').trim(); if(!c || c===String(codigo).trim()) total += Number(p?.quantidadeVendida||0); } } return total; }
function statusErro(e){ return Number(e?.status||e?.statusCode||e?.response?.status||0)||null; }
function ehLimitacao(e){ const st=statusErro(e); const msg=String(e?.message||e||'').toLowerCase(); return st===429 || st===503 || msg.includes('muitas requisi') || msg.includes('too many') || msg.includes('rate limit'); }

async function garantirPiloto(){ for(const codigo of PILOTO) await query(`INSERT INTO gz_produtos_monitorados(codigo_produto,ativo) VALUES($1,TRUE) ON CONFLICT(codigo_produto) DO NOTHING`,[codigo]); }
async function pendencias(codigo){ const rows=await all(`SELECT data_movimento FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 AND data_movimento BETWEEN $2::date AND $3::date`,[codigo,INICIO,ontem()]); const tem=new Set(rows.map(r=>String(r.data_movimento).slice(0,10))); return diasEntre(INICIO,ontem()).filter(d=>!tem.has(d)); }

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
    await garantirPiloto();
    const exec=(await query(`INSERT INTO gz_sync_execucoes(tipo,status,iniciado_em,usuario_id,parada_solicitada,heartbeat_em) VALUES($1,'EM_ANDAMENTO',NOW(),$2,FALSE,NOW()) RETURNING id`,[manual?'MANUAL':'AUTOMATICA',usuarioId])).rows[0];
    executarInterno(exec.id).catch(e=>console.error('Sincronização GZ:',e.message));
    return {iniciado:true,execucaoId:exec.id,mensagem:'Sincronização iniciada.'};
  }catch(e){ executando=false; await liberarLock(); throw e; }
}

async function executarInterno(execId){
  let processados=0, erros=0, falhasConsecutivas=0, pausadaProtecao=false, interrompida=false;
  let intervaloAtual=Math.max(INTERVALO_MIN_MS,Math.min(INTERVALO_MAX_MS,INTERVALO_INICIAL_MS));
  const metricas={chamadasProdutos:0,chamadasMovimento:0,tempoProdutosMs:0,tempoMovimentoMs:0,tempoEsperaMs:0,maxApiMs:0,minApiMs:null,http200:0,http204:0,http429:0,http5xx:0,timeOuts:0,retries:0,backoffs:0};
  const contarStatus=st=>{ if(st===200)metricas.http200++; else if(st===204)metricas.http204++; else if(st===429)metricas.http429++; else if(st>=500)metricas.http5xx++; };
  const esperar=async(ms)=>{metricas.tempoEsperaMs+=ms;await sleep(ms);};
  const aliviar=async()=>{ metricas.backoffs++; intervaloAtual=Math.min(INTERVALO_MAX_MS,Math.max(intervaloAtual*2,1000)); progressoAtual.intervaloMs=intervaloAtual; await esperar(BACKOFF_MS); };
  const estabilizar=()=>{ if(intervaloAtual>INTERVALO_INICIAL_MS) intervaloAtual=Math.max(INTERVALO_INICIAL_MS,Math.round(intervaloAtual*0.9)); progressoAtual.intervaloMs=intervaloAtual; };
  try{
    // V52: antes da rotina normal, baixa uma fotografia completa do catálogo.
    // Se essa etapa falhar, a sincronização continua com a estratégia antiga por produto,
    // preservando confiabilidade em vez de depender de uma fotografia incompleta.
    let catalogoAtualizado=false;
    progressoAtual={fase:'CATALOGO',codigo:null,indice:0,total:0,iniciadoEm:new Date().toISOString(),intervaloMs:intervaloAtual,execucaoId:execId};
    try{
      const cat=await catalogo.atualizarCatalogo(execId);
      catalogoAtualizado=true;
      metricas.chamadasProdutos++;
      metricas.tempoProdutosMs+=Number(cat.duracaoMs||0);
      metricas.maxApiMs=Math.max(metricas.maxApiMs,Number(cat.duracaoMs||0));
      metricas.minApiMs=metricas.minApiMs===null?Number(cat.duracaoMs||0):Math.min(metricas.minApiMs,Number(cat.duracaoMs||0));
      contarStatus(Number(cat.httpStatus||200));
      await logApi(execId,'/produtos/paginacao',null,null,cat.httpStatus||200,cat.duracaoMs||0,1,0);
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
      if(await paradaSolicitada(execId)){interrompida=true;break;}
      await query(`UPDATE gz_sync_execucoes SET heartbeat_em=NOW() WHERE id=$1`,[execId]);
      indiceProduto++; const codigo=item.codigo_produto; progressoAtual={...progressoAtual,codigo,indice:indiceProduto,total:produtos.length,intervaloMs:intervaloAtual};
      let situacao='DESCONHECIDO';
      try{
        const hoje=hojeLocal(); const atual=await get(`SELECT situacao_gz,ultimo_status_em FROM gz_produtos_monitorados WHERE codigo_produto=$1`,[codigo]);
        // Quando a fotografia V52 foi obtida nesta execução, o status de todos os monitorados
        // já foi atualizado em lote. Não há motivo para repetir /produtos 500 vezes.
        if(catalogoAtualizado && atual?.situacao_gz) situacao=String(atual.situacao_gz).toUpperCase();
        else if(atual?.ultimo_status_em && String(atual.ultimo_status_em).slice(0,10)===hoje && atual.situacao_gz) situacao=String(atual.situacao_gz).toUpperCase();
        else{
          const t=Date.now(); let r;
          try{r=await produtosGz.consultarProduto({codigoInterno:String(codigo).trim()});}catch(e){const ms=Date.now()-t,st=statusErro(e);metricas.chamadasProdutos++;metricas.tempoProdutosMs+=ms;contarStatus(st);if(String(e.message||'').toLowerCase().includes('tempo limite'))metricas.timeOuts++;await logApi(execId,'/produtos',codigo,null,st,ms,1,intervaloAtual,e.message);if(ehLimitacao(e))await aliviar();throw e;}
          const ms=Date.now()-t,st=r.httpStatus||200; metricas.chamadasProdutos++;metricas.tempoProdutosMs+=ms;metricas.maxApiMs=Math.max(metricas.maxApiMs,ms);metricas.minApiMs=metricas.minApiMs===null?ms:Math.min(metricas.minApiMs,ms);contarStatus(st);await logApi(execId,'/produtos',codigo,null,st,ms,1,intervaloAtual);
          const p=(r?.produtos||[]).find(x=>String(x?.codigo||'').trim()===String(codigo).trim())||(r?.produtos||[])[0]; if(!p)throw new Error('Produto não encontrado na consulta de situação da GZ.'); situacao=String(p.situacao||'').trim().toUpperCase()||'DESCONHECIDO'; await query(`UPDATE gz_produtos_monitorados SET situacao_gz=$2,ultimo_status_em=NOW() WHERE codigo_produto=$1`,[codigo,situacao]); await esperar(intervaloAtual); estabilizar();
        }
      }catch(e){ erros++;falhasConsecutivas++;const msg=`Falha ao verificar situação cadastral: ${String(e.message||e)}`;await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=$2 WHERE codigo_produto=$1`,[codigo,msg.slice(0,1000)]);await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'ERRO_STATUS',$3)`,[execId,codigo,msg.slice(0,1000)]);if(falhasConsecutivas>=LIMITE_FALHAS_CONSECUTIVAS){pausadaProtecao=true;break;}continue;}
      if(situacao==='INATIVO'){await query(`UPDATE gz_produtos_monitorados SET ultimo_erro=NULL WHERE codigo_produto=$1`,[codigo]);falhasConsecutivas=0;continue;}
      if(situacao!=='ATIVO'){erros++;await query(`INSERT INTO gz_sync_ocorrencias(execucao_id,codigo_produto,tipo,mensagem) VALUES($1,$2,'STATUS_DESCONHECIDO',$3)`,[execId,codigo,`Situação GZ ${situacao}; vendas não consultadas por segurança.`]);continue;}
      const faltas=await pendencias(codigo);
      for(const data of faltas){
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
      if(interrompida||pausadaProtecao)break;
    }
    const chamadasApi=metricas.chamadasProdutos+metricas.chamadasMovimento,tempoApiMs=metricas.tempoProdutosMs+metricas.tempoMovimentoMs;
    const stFinal=interrompida?'INTERROMPIDA_MANUALMENTE':pausadaProtecao?'PAUSADA_PROTECAO':(erros?'CONCLUIDA_COM_PENDENCIAS':'CONCLUIDA');
    await query(`UPDATE gz_sync_execucoes SET status=$2,finalizado_em=NOW(),itens_processados=$3,erros=$4,chamadas_produtos=$5,chamadas_movimento=$6,tempo_produtos_ms=$7,tempo_movimento_ms=$8,tempo_espera_ms=$9,api_min_ms=$10,api_max_ms=$11,api_media_ms=$12,http_200=$13,http_204=$14,http_429=$15,http_5xx=$16,time_outs=$17,retries=$18,backoffs=$19,intervalo_final_ms=$20 WHERE id=$1`,[execId,stFinal,processados,erros,metricas.chamadasProdutos,metricas.chamadasMovimento,metricas.tempoProdutosMs,metricas.tempoMovimentoMs,metricas.tempoEsperaMs,metricas.minApiMs,metricas.maxApiMs,chamadasApi?Math.round(tempoApiMs/chamadasApi):null,metricas.http200,metricas.http204,metricas.http429,metricas.http5xx,metricas.timeOuts,metricas.retries,metricas.backoffs,intervaloAtual]);
  }catch(e){await query(`UPDATE gz_sync_execucoes SET status='ERRO',finalizado_em=NOW(),erros=erros+1,mensagem=$2 WHERE id=$1`,[execId,String(e.message||e).slice(0,1000)]);throw e;}
  finally{executando=false;progressoAtual={fase:null,codigo:null,indice:0,total:0,iniciadoEm:null,intervaloMs:INTERVALO_INICIAL_MS,execucaoId:null};await liberarLock();}
}

async function parar(){ const r=await query(`UPDATE gz_sync_execucoes SET parada_solicitada=TRUE,mensagem=COALESCE(mensagem,'Parada manual solicitada pelo administrador.') WHERE status='EM_ANDAMENTO' RETURNING id`); return {solicitado:r.rowCount>0,execucoes:r.rows.map(x=>x.id)}; }
async function status(){
  await query(`UPDATE gz_sync_execucoes SET status='INTERROMPIDA',finalizado_em=COALESCE(finalizado_em,NOW()),mensagem=COALESCE(mensagem,'Execução interrompida sem heartbeat (reinício/encerramento do processo).') WHERE status='EM_ANDAMENTO' AND COALESCE(heartbeat_em,iniciado_em) < NOW() - INTERVAL '2 minutes'`);
  const esperado=ontem();
  const resumo=await get(`WITH ult AS (SELECT codigo_produto,MAX(data_movimento) atualizado_ate FROM gz_vendas_diarias WHERE loja=1 GROUP BY codigo_produto) SELECT COUNT(*) FILTER (WHERE p.ativo=TRUE)::int AS monitorados,COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz='INATIVO')::int AS inativos,COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz IS DISTINCT FROM 'INATIVO' AND u.atualizado_ate >= $1::date)::int AS em_dia,COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.ultimo_erro IS NOT NULL)::int AS com_erro,COUNT(*) FILTER (WHERE p.ativo=TRUE AND p.situacao_gz IS DISTINCT FROM 'INATIVO' AND (u.atualizado_ate IS NULL OR u.atualizado_ate < $1::date) AND p.ultimo_erro IS NULL)::int AS pendentes FROM gz_produtos_monitorados p LEFT JOIN ult u ON u.codigo_produto=p.codigo_produto`,[esperado]);
  const execucoes=await all(`SELECT * FROM gz_sync_execucoes ORDER BY id DESC LIMIT 10`); const ocorrencias=await all(`SELECT id,codigo_produto,data_movimento,tipo,mensagem,criado_em FROM gz_sync_ocorrencias ORDER BY id DESC LIMIT 15`); const apiLogs=await all(`SELECT rota,codigo_produto,data_movimento,http_status,latencia_ms,tentativa,intervalo_ms,erro,criado_em FROM gz_sync_api_logs ORDER BY id DESC LIMIT 30`); const ativa=await get(`SELECT id FROM gz_sync_execucoes WHERE status='EM_ANDAMENTO' ORDER BY id DESC LIMIT 1`);
  const resumoCatalogo=await catalogo.resumoCatalogo();
  const cadastradosHoje=await catalogo.cadastrados({dataInicio:hojeLocal(),dataFim:hojeLocal(),limite:50});
  return {inicioHistorico:INICIO,esperadoAte:esperado,resumo:resumo||{},catalogo:resumoCatalogo,cadastradosHoje,execucoes,ocorrencias,apiLogs,executando:!!ativa,progresso:progressoAtual,intervaloChamadasMs:progressoAtual.intervaloMs||INTERVALO_INICIAL_MS,limiteFalhasConsecutivas:LIMITE_FALHAS_CONSECUTIVAS,agendamento:{hora:SYNC_HOUR,minuto:SYNC_MINUTE,timeZone:SYNC_TIMEZONE}};
}
async function historico(codigo){return all(`SELECT data_movimento,quantidade_vendida,valor_venda,origem,sincronizado_em FROM gz_vendas_diarias WHERE loja=1 AND codigo_produto=$1 ORDER BY data_movimento`,[String(codigo).trim()]);}
let timer;
function iniciarAgendador(){if(timer)return;let ultimoDia='';const tick=async()=>{const p=partesLocais(),dia=`${p.year}-${p.month}-${p.day}`;if(Number(p.hour)===SYNC_HOUR&&Number(p.minute)===SYNC_MINUTE&&ultimoDia!==dia){const r=await iniciar();if(r.iniciado)ultimoDia=dia;}};timer=setInterval(()=>tick().catch(e=>console.error('Agendador GZ:',e.message)),30*1000);setTimeout(()=>tick().catch(e=>console.error('Agendador GZ:',e.message)),3000);console.log(`Sincronização GZ preparada: ${String(SYNC_HOUR).padStart(2,'0')}:${String(SYNC_MINUTE).padStart(2,'0')} (${SYNC_TIMEZONE}), ${PILOTO.length} produtos.`);}
module.exports={iniciar,parar,status,historico,iniciarAgendador,garantirPiloto};
