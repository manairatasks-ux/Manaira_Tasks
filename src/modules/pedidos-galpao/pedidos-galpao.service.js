const galpao=require('../galpao/galpao.model');
const gz=require('../produtos-gz/produtos-gz.service');
const {randomUUID}=require('crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const numero=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const codigo=v=>String(v??'').trim().replace(/^0+(?=\d)/,'');
const extrairCodigo=p=>codigo(p.codigoEan||p.codigoEAN||p.codigoBarras||p.codigoBarra||p.ean||p.codigo||'');
function estoqueGz(p){for(const c of ['quantidadeEstoque','estoqueAtual','estoque','saldoEstoque','saldo','quantidade']){const n=numero(p[c]);if(n!==null)return n;}return null;}
const cache=new Map(),CACHE_MS=3*60*1000;
async function consultar(cod,forcar=false){
 const cached=cache.get(cod);
 if(!forcar&&cached&&Date.now()-cached.em<CACHE_MS)return cached.resultado;
 try{
  const resposta=await gz.consultarProduto({codigoBarras:cod});
  const lista=Array.isArray(resposta.produtos)?resposta.produtos:[];
  const produto=lista.find(x=>extrairCodigo(x)===codigo(cod))||null;
  const resultado={produto,erro:null};
  if(produto)cache.set(cod,{em:Date.now(),resultado});
  return resultado;
 }catch(e){return {produto:null,erro:e.message||'Falha ao consultar GZ',status:e.status||null};}
}
function montar(g,r){
 const p=r.produto,total=p?estoqueGz(p):null,gal=Number(g.unidades||0);
 const valido=total!==null&&total>0&&gal>=0&&gal<=total;
 return {codigo_barra:String(g.codigo_barra),descricao:String(g.descricao),estoque_galpao:gal,
  estoque_gz:total,estoque_loja:valido?total-gal:null,
  percentual_galpao:valido?Math.round(gal/total*10000)/100:null,
  percentual_loja:valido?Math.round((total-gal)/total*10000)/100:null,
  situacao:r.erro?'erro_consulta_gz':!p?'nao_encontrado_gz':total===null?'saldo_gz_indisponivel':!valido?'divergencia':'ok',
  detalhe_erro:r.erro||null};
}
// Estado temporário em memória: nenhuma escrita no banco ou nos estoques.
const jobs=new Map();let ativo=null;
function limpar(){const agora=Date.now();for(const [id,j] of jobs)if(agora-j.criado>60*60*1000&&j.estado!=='executando')jobs.delete(id);}
async function iniciar({somenteFalhas=false,codigos=[]}={}){
 limpar();if(ativo&&jobs.get(ativo)?.estado==='executando')return {id:ativo};
 const todos=await galpao.listProducts({busca:''});
 const filtro=new Set(codigos.map(codigo));
 const lista=somenteFalhas?todos.filter(g=>filtro.has(codigo(g.codigo_barra))):todos;
 const id=randomUUID();
 const job={id,criado:Date.now(),estado:'executando',fase:'Consultando estoque GZ',total:lista.length,processados:0,sucesso:0,nao_encontrados:0,falhas:0,repeticoes:0,inicio:Date.now(),itens:[],consultado_em:null,erro:null};
 jobs.set(id,job);ativo=id;
 (async()=>{
  try{
   let cursor=0;
   async function trabalhador(){
    while(cursor<lista.length){
     const g=lista[cursor++],cod=codigo(g.codigo_barra);
     let r=await consultar(cod,somenteFalhas);
     // 404 significa produto não encontrado/rota inexistente; não insistir cegamente.
     for(let tentativa=0;tentativa<3&&r.erro&&r.status!==404;tentativa++){
      job.fase='Repetindo consultas com falha';job.repeticoes++;
      await sleep([700,1500,3000][tentativa]);r=await consultar(cod,true);
     }
     const item=montar(g,r);job.itens.push(item);job.processados++;
     if(item.situacao==='erro_consulta_gz')job.falhas++;
     else if(item.situacao==='nao_encontrado_gz'||item.situacao==='saldo_gz_indisponivel')job.nao_encontrados++;
     else job.sucesso++;
     job.fase='Consultando estoque GZ';
     await sleep(200);
    }
   }
   await Promise.all(Array.from({length:Math.min(2,lista.length)},trabalhador));
   job.itens.sort((a,b)=>(b.percentual_galpao??-1)-(a.percentual_galpao??-1)||a.descricao.localeCompare(b.descricao,'pt-BR'));
   job.estado='concluido';job.consultado_em=new Date().toISOString();job.fase='Concluído';
  }catch(e){job.estado='erro';job.erro=e.message||'Falha inesperada';}
  finally{if(ativo===id)ativo=null;}
 })();
 return {id};
}
function progresso(id){const j=jobs.get(id);if(!j)return null;
 const segundos=(Date.now()-j.inicio)/1000;
 return {id:j.id,estado:j.estado,fase:j.fase,total:j.total,processados:j.processados,sucesso:j.sucesso,nao_encontrados:j.nao_encontrados,falhas:j.falhas,repeticoes:j.repeticoes,
  segundos_restantes:j.processados&&j.estado==='executando'?Math.ceil((j.total-j.processados)*segundos/j.processados):null,
  erro:j.erro,consultado_em:j.consultado_em,...(j.estado==='concluido'?{itens:j.itens}:{} )};
}
module.exports={iniciar,progresso};
