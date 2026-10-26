'use strict';
// V65: snapshot GZ persistido, saldos do galpão consultados em tempo real.
const {pool}=require('../../db');
const galpao=require('../galpao/galpao.model');
const gz=require('../produtos-gz/produtos-gz.service');
const {randomUUID}=require('crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const numero=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const codigo=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
const extrairCodigo=p=>codigo(p.codigoEan||p.codigoEAN||p.codigoBarras||p.codigoBarra||p.ean||p.codigo||'');
const GZ_PROPS=['quantidadeEstoque','estoqueAtual','estoque','saldoEstoque','saldo','quantidade'];
const lockKey=650065; // advisory lock exclusivo para esta rotina, inclusive múltiplas instâncias
let localJob=null;
function estoqueGz(p){for(const c of GZ_PROPS){const n=numero(p[c]);if(n!==null)return n;}return null;}
function montar(g,valor){
 const total=valor?.situacao==='encontrado'?numero(valor.saldo):null, gal=Number(g.unidades||0);
 const valido=valor?.situacao==='encontrado'&&total!==null&&total>0&&gal>=0&&gal<=total;
 return {codigo_barra:String(g.codigo_barra),descricao:String(g.descricao),estoque_galpao:gal,
  estoque_gz:total,estoque_loja:valido?total-gal:null,
  percentual_galpao:valido?Math.round(gal/total*10000)/100:null,
  percentual_loja:valido?Math.round((total-gal)/total*10000)/100:null,
  situacao:!valor?'gz_nao_sincronizado':valor.situacao==='erro_consulta_gz'?'erro_consulta_gz':valor.situacao==='ausente'?'nao_encontrado_gz':total===null?'saldo_gz_indisponivel':!valido?'divergencia':'ok',detalhe_erro:valor?.situacao==='erro_consulta_gz'?valor.erro||'Falha de consulta':null};
}
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS pedidos_galpao_sync (
  id integer PRIMARY KEY CHECK (id=1), atualizado_em timestamptz, iniciado_em timestamptz,
  estado text NOT NULL DEFAULT 'aguardando', job_id text, progresso jsonb,
  snapshot jsonb, erro text, ultima_tentativa timestamptz
 )`);
 await pool.query(`INSERT INTO pedidos_galpao_sync(id,estado) VALUES(1,'aguardando') ON CONFLICT(id) DO NOTHING`);
}
async function estado(){const {rows}=await pool.query('SELECT * FROM pedidos_galpao_sync WHERE id=1');return rows[0];}
async function dadosAtuais(){
 const [s,todos]=await Promise.all([estado(),galpao.listProducts({busca:''})]);
 const snapshot=s?.snapshot||{};
 const itens=todos.map(g=>montar(g,snapshot[codigo(g.codigo_barra)])).sort((a,b)=>(b.percentual_galpao??-1)-(a.percentual_galpao??-1)||a.descricao.localeCompare(b.descricao,'pt-BR'));
 return {itens,consultado_em:s?.atualizado_em||null,estado:s?.estado||'aguardando',job_id:s?.estado==='executando'?s.job_id:null,
  progresso:s?.estado==='executando'?s.progresso:null,erro:s?.erro||null,parcial:s?.estado==='parcial',proxima_sincronizacao:'Agendamento entre 06:00 e 22:00 (America/Fortaleza)'};
}
async function progresso(id){
 const s=await estado();if(!s||s.job_id!==id)return null;
 return {...(s.progresso||{}),id,estado:s.estado,erro:s.erro,consultado_em:s.atualizado_em};
}
async function consultar(cod){
 let r;
 for(let tent=0;tent<4;tent++){
  try{
   const resposta=await gz.consultarProduto({codigoBarras:cod});
   const produto=(Array.isArray(resposta.produtos)?resposta.produtos:[]).find(p=>extrairCodigo(p)===cod);
   return {valor:produto?{situacao:'encontrado',saldo:estoqueGz(produto)}:{situacao:'ausente'},repeticoes:tent};
  }catch(e){r=e;if(e.status===404) return {valor:{situacao:'ausente'},repeticoes:tent};
   if(tent<3)await sleep([1500,3500,7000][tent]);
  }
 }
 return {erro:r?.message||'Falha na consulta ao GZ',repeticoes:3};
}
async function publicarProgresso(j){await pool.query(`UPDATE pedidos_galpao_sync SET progresso=$1::jsonb WHERE id=1 AND job_id=$2`,[JSON.stringify(j),j.id]);}
async function iniciar({manual=false}={}){
 const client=await pool.connect();
 try{
  const lock=await client.query('SELECT pg_try_advisory_lock($1) AS ok',[lockKey]);
  if(!lock.rows[0].ok){client.release();return {id:(await estado())?.job_id||null,em_andamento:true};}
  const s=await estado();
  if(s.estado==='executando'&&localJob){await client.query('SELECT pg_advisory_unlock($1)',[lockKey]);return {id:s.job_id,em_andamento:true};}
  const lista=await galpao.listProducts({busca:''});
  if(!lista.length)throw Error('Nenhum produto ativo no Galpão; snapshot anterior preservado.');
  const id=randomUUID();
  const job={id,estado:'executando',fase:'Consultando estoque GZ',total:lista.length,processados:0,sucesso:0,nao_encontrados:0,falhas:0,repeticoes:0,inicio:Date.now(),segundos_restantes:null};
  await client.query(`UPDATE pedidos_galpao_sync SET estado='executando',job_id=$1,iniciado_em=NOW(),ultima_tentativa=NOW(),progresso=$2::jsonb,erro=NULL WHERE id=1`,[id,JSON.stringify(job)]);
  localJob=id;
  // O cliente mantém advisory lock até o fim do trabalho, mesmo em outras instâncias.
  (async()=>{
   try{
    const novos={}; let cursor=0;
    async function trabalhador(){while(cursor<lista.length){
      const g=lista[cursor++],cod=codigo(g.codigo_barra),r=await consultar(cod);
      if(r.erro){job.falhas++;novos[cod]={situacao:'erro_consulta_gz',erro:String(r.erro).slice(0,250)};}else {novos[cod]=r.valor;if(r.valor.situacao==='ausente'||r.valor.saldo===null)job.nao_encontrados++;else job.sucesso++;}
      job.repeticoes+=r.repeticoes;job.processados++;
      job.segundos_restantes=job.processados?Math.max(0,Math.ceil((lista.length-job.processados)*(Date.now()-job.inicio)/1000/job.processados)):null;
      if(job.processados%10===0||job.processados===lista.length)await publicarProgresso(job);
      await sleep(250);
    }}
    await Promise.all(Array.from({length:Math.min(1,lista.length)},()=>trabalhador()));
    // A consulta nunca perde resultados confiáveis porque alguns códigos falharam.
    // Falhas são armazenadas SEM saldo, não como zero e não reutilizam saldo antigo.
    // A gravação acontece atomicamente após a coleta; galpão segue em tempo real.
    if(job.sucesso===0 && job.nao_encontrados===0)throw Error(`Nenhuma consulta GZ confiável (${job.falhas} falhas); snapshot anterior preservado.`);
    const parcial=job.falhas>0;
    const aviso=parcial?`${job.falhas} consulta(s) GZ falharam. Itens com falha ficam sem sugestão até nova sincronização.`:null;
    await pool.query(`UPDATE pedidos_galpao_sync SET snapshot=$1::jsonb,atualizado_em=NOW(),estado=$2,erro=$3,progresso=$4::jsonb WHERE id=1 AND job_id=$5`,[JSON.stringify(novos),parcial?'parcial':'concluido',aviso,JSON.stringify({...job,estado:parcial?'parcial':'concluido',fase:parcial?'Concluído com pendências':'Concluído'}),id]);
   }catch(e){console.error('Pedidos Galpão V65:',e);await pool.query(`UPDATE pedidos_galpao_sync SET estado='erro',erro=$1,progresso=$2::jsonb WHERE id=1 AND job_id=$3`,[e.message,JSON.stringify({...job,estado:'erro'}),id]).catch(console.error);}
   finally{localJob=null;await client.query('SELECT pg_advisory_unlock($1)',[lockKey]).catch(console.error);client.release();}
  })();
  return {id,em_andamento:false};
 }catch(e){await client.query('SELECT pg_advisory_unlock($1)',[lockKey]).catch(()=>{});client.release();throw e;}
}
function horaLocal(){const d=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return {hour:Number(parts.hour),minute:Number(parts.minute),slot:`${parts.year}-${parts.month}-${parts.day} ${parts.hour}`};}
let timer=null;
async function agendar(){
 const h=horaLocal();if(h.hour<6||h.hour>22||(h.hour===22&&h.minute>0))return;
 const s=await estado();if(!s||s.estado==='executando')return;
 const inicio=s.iniciado_em?new Intl.DateTimeFormat('en-US',{timeZone:'America/Fortaleza',hour:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(s.iniciado_em)):[];
 const ip=Object.fromEntries(inicio.map(p=>[p.type,p.value]));const last=`${ip.year}-${ip.month}-${ip.day} ${ip.hour}`;
 if(last===h.slot)return;await iniciar();
}
function startScheduler(){if(timer)return;agendar().catch(e=>console.error('Agendamento GZ:',e));timer=setInterval(()=>agendar().catch(e=>console.error('Agendamento GZ:',e)),60000);timer.unref?.();}
module.exports={init,iniciar,progresso,dadosAtuais,startScheduler};
