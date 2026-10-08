const galpao = require('../galpao/galpao.model');
const gz = require('../produtos-gz/produtos-gz.service');
function numero(v) { if (v === null || v === undefined || v === '') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function codigo(v) { return String(v??'').trim().replace(/^0+(?=\d)/,''); }
function extrairCodigo(p) { return codigo(p.codigoEan||p.codigoEAN||p.codigoBarras||p.codigoBarra||p.ean||p.codigo||''); }
function estoqueGz(p) { for(const campo of ['quantidadeEstoque','estoqueAtual','estoque','saldoEstoque','saldo','quantidade']) { const n=numero(p[campo]); if(n!==null)return n; } return null; }
// Consultas de leitura por código de barras: compatíveis com a rota /produtos da Ponte atual.
// Cache curto evita repetir milhares de chamadas quando vários usuários abrem a tela.
const cache=new Map();
const CACHE_MS=3*60*1000;
async function consultar(cod) {
  const now=Date.now(),cached=cache.get(cod);
  if(cached&&now-cached.em<CACHE_MS)return cached.resultado;
  try {
    const resposta=await gz.consultarProduto({codigoBarras:cod});
    const lista=Array.isArray(resposta.produtos)?resposta.produtos:[];
    const p=lista.find(x=>extrairCodigo(x)===codigo(cod))||null;
    const resultado={produto:p,erro:null};
    cache.set(cod,{em:Date.now(),resultado});
    return resultado;
  }catch(e){return {produto:null,erro:e.message||'Falha ao consultar GZ'};}
}
async function sugestoes(){
  const itensGalpao=await galpao.listProducts({busca:''});
  const itens=new Array(itensGalpao.length);
  // Limita a concorrência para proteger a Ponte GZ. Nenhum estoque é alterado.
  let indice=0;
  async function trabalhador(){
    while(indice<itensGalpao.length){
      const i=indice++,g=itensGalpao[i],cod=codigo(g.codigo_barra);
      const {produto:p,erro}=await consultar(cod);
      const total=p?estoqueGz(p):null;
      const gal=Number(g.unidades||0);
      const valido=total!==null&&total>0&&gal>=0&&gal<=total;
      itens[i]={codigo_barra:String(g.codigo_barra),descricao:String(g.descricao),estoque_galpao:gal,
        estoque_gz:total,estoque_loja:valido?total-gal:null,
        percentual_galpao:valido?Math.round(gal/total*10000)/100:null,
        percentual_loja:valido?Math.round((total-gal)/total*10000)/100:null,
        situacao:erro?'erro_consulta_gz':!p?'nao_encontrado_gz':total===null?'saldo_gz_indisponivel':!valido?'divergencia':'ok'};
    }
  }
  await Promise.all(Array.from({length:Math.min(5,itensGalpao.length)},()=>trabalhador()));
  itens.sort((a,b)=>(b.percentual_galpao??-1)-(a.percentual_galpao??-1)||a.descricao.localeCompare(b.descricao,'pt-BR'));
  return {itens,consultado_em:new Date().toISOString(),resumo:{total:itens.length,validos:itens.filter(i=>i.situacao==='ok').length,divergencias:itens.filter(i=>i.situacao!=='ok').length}};
}
module.exports={sugestoes};
