'use strict';
// Consultas seguras e predeterminadas: o LLM não executa SQL.
// Carregamento sob demanda para que classificações sejam testáveis sem banco de dados.
const db = () => require('../../config/database');
const normal = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmt = n => Number(n||0).toLocaleString('pt-BR');
const localDate = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const minusDays = (iso, n) => {const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10);};
function dateScope(question){
  const q=normal(question), today=localDate();
  if(/\bontem\b/.test(q))return {from:minusDays(today,1),to:minusDays(today,1),label:'ontem'};
  if(/\b(hoje|do dia|deste dia)\b/.test(q))return {from:today,to:today,label:'hoje'};
  const match=q.match(/\b(\d{2})[\/-](\d{2})[\/-](\d{4})\b/);
  if(match){const iso=`${match[3]}-${match[2]}-${match[1]}`;if(!Number.isNaN(Date.parse(iso))&&new Date(iso+'T12:00:00Z').toISOString().slice(0,10)===iso)return {from:iso,to:iso,label:match[0]};}
  if(/\b(esta|desta|nessa) semana\b/.test(q)){const week=new Date(today+'T12:00:00Z');const days=(week.getUTCDay()+6)%7;return {from:minusDays(today,days),to:today,label:'nesta semana'};}
  if(/\b(este|deste|nesse) mes\b/.test(q))return {from:today.slice(0,7)+'-01',to:today,label:'neste mês'};
  return null;
}
function classify(question,previous=''){
 const q=normal(question);
 const prev=normal(previous);
 const isCorrection=/^(eu (falo|quis dizer)|na verdade|me refiro|quero dizer|so |somente |as |os )/.test(q);
 const type=/\b(saidas?|retiradas?)\b/.test(q)?'SAIDA':/\b(entradas?|recebimentos?)\b/.test(q)?'ENTRADA':isCorrection&&/\b(saidas?|retiradas?)\b/.test(prev)?'SAIDA':isCorrection&&/\b(entradas?|recebimentos?)\b/.test(prev)?'ENTRADA':null;
 const scope=dateScope(question) || (isCorrection?dateScope(previous):null);
 const wantsDetail=/\b(liste|listar|mostre|mostrar|quais|relacao|detalhe|detalhamento|codigos?|barras?|registros?|lancamentos?|movimentacoes?|historico|produtos?)\b/.test(q);
 if(type&&scope&&(wantsDetail||isCorrection))return {type,scope};
 return null;
}
async function detailed(question,previous=''){
 const intent=classify(question,previous);
 if(!intent)return null;
 const {all,get}=db();
 const params=[intent.type,intent.scope.from,intent.scope.to];
 const total=await get(`SELECT COUNT(*)::int AS registros, COALESCE(SUM(m.quantidade),0)::bigint AS embalagens
 FROM galpao_movimentacoes m WHERE COALESCE(m.estornado,FALSE)=FALSE AND m.tipo=$1 AND m.data_movimento BETWEEN $2::date AND $3::date`,params);
 const rows=await all(`SELECT m.data_movimento::text AS data,p.codigo_barra AS codigo,p.descricao AS produto,
 m.quantidade AS embalagens,m.unidades_por_embalagem AS unidades_por_embalagem, (m.quantidade::bigint*m.unidades_por_embalagem)::bigint AS unidades
 FROM galpao_movimentacoes m JOIN galpao_produtos p ON p.id=m.produto_id
 WHERE COALESCE(m.estornado,FALSE)=FALSE AND m.tipo=$1 AND m.data_movimento BETWEEN $2::date AND $3::date
 ORDER BY m.data_movimento DESC,m.criado_em DESC,m.id DESC LIMIT 101`,params);
 const hasMore=rows.length>100;
 const items=rows.slice(0,100).map(r=>({data:String(r.data).slice(0,10),codigo:String(r.codigo||''),produto:String(r.produto||''),embalagens:Number(r.embalagens),unidades:Number(r.unidades)}));
 const noun=intent.type==='SAIDA'?'saídas':'entradas';
 const count=Number(total?.registros||0);
 const answer=count ? `${fmt(count)} ${noun} ${intent.scope.label}, totalizando ${fmt(total.embalagens)} embalagens.${hasMore?' Exibindo as primeiras 100 movimentações.':''}` : `Nenhuma movimentação de ${noun} registrada ${intent.scope.label}.`;
 return {answer,table:items.length?{columns:[{key:'data',label:'Data'},{key:'codigo',label:'Código'},{key:'produto',label:'Produto'},{key:'embalagens',label:'Emb.'},{key:'unidades',label:'Unid.'}],rows:items,hasMore}:null,period:intent.scope.label,source:'Galpão · movimentações não estornadas'};
}
module.exports={normal,localDate,dateScope,classify,detailed};
