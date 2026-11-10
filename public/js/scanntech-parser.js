/* V74.4 — leitor local de texto copiado do portal Scanntech. Sem chamadas externas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScanntechParser=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const clean=s=>String(s||'').replace(/\r/g,'').replace(/\*\*/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/[\u00a0\u202f]/g,' ').replace(/[ \t]+/g,' ').trim();
 function price(s){if(!s)return null;let v=String(s).replace(/\s/g,'');if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
 const amount=n=>n==null?'':n.toFixed(2).replace('.',',');
 function findAmounts(src,labels){for(const label of labels){const re=new RegExp('(?:^|\\n)\\s*'+label+'\\s*:?\\s*(\\[[^\\]\\n]+\\]|(?:R\\$\\s*)?[0-9][0-9.,]*)','im');const m=src.match(re);if(!m)continue;const vals=[...m[1].matchAll(/(?:R\\$\\s*)?([0-9][0-9.,]*)/g)].map(x=>price(x[1])).filter(v=>v!=null);if(vals.length)return [...new Set(vals)];}return []}
 function findAmount(src,labels){for(const label of labels){const re=new RegExp('(?:^|\\n)\\s*'+label+'\\s*:?\\s*(?:R\\$\\s*)?([0-9][0-9.,]*)','im');const m=src.match(re);if(m){const n=price(m[1]);if(n!=null)return n}}return null}
 function isoDate(raw){const m=String(raw||'').match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);if(!m)return '';const s=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:''}
 function parse(raw){const src=clean(raw);const normalized=src.replace(/\s*\n\s*/g,'\n');const result={tipo:'normal',quantidade:1,totalAntigo:null,totalNovo:null,reembolsoTotal:null,titulo:'',marca:'',antigo:null,novo:null,desconto:null,precosAntigos:[],descontos:[],multiplosPrecos:false,reembolso:null,limite:null,inicio:'',fim:'',produtos:[],avisos:[],conditions:''};
  // Mecânica de quantidade: preços principais do portal são totais do conjunto.
  const leve=normalized.match(/(?:^|\n)\s*#*\s*LEVE\s+(\d{1,3})\b[^\n]*/i);
  const levando=normalized.match(/Levando\s+(\d{1,3})\s+unidades?/i);
  const group=leve||levando;
  const unitHeadline=leve&&leve[0].match(/POR\s*R\$\s*([\d.,]+)\s*CADA/i);
  const totalText=normalized.match(/Paga\s+um\s+total\s+de\s*(?:R\$\s*)?([\d.,]+)/i);
  if(group){result.tipo='leve_pague';result.quantidade=Number(group[1]);if(result.quantidade<2||result.quantidade>100)result.avisos.push('Confira a quantidade de unidades da oferta.');}
  if(leve)result.titulo=leve[0].replace(/^\s*#*\s*/,'').trim();
  const heading=normalized.match(/(?:^|\n)\s*#*\s*R\$\s*\d[\d.,]*\s+([^\n]+)/i);if(heading&&!result.titulo)result.titulo=heading[1].trim().replace(/^#+\s*/,'');
  const code=normalized.match(/C[oó]digo\s*:\s*#?\s*(\d{4,12})/i);if(code)result.codigo=code[1];
  const author=normalized.match(/Autor\s*:\s*([^\n]+)/i);if(author)result.marca=author[1].split(/\b(?:Pre[çc]o|Reembolso|Desconto|Limite|Aceitar|Rejeitar)\b/i)[0].trim().replace(/\*+/g,'');
  result.precosAntigos=findAmounts(normalized,['Pre[çc]o\\s+antigo','Pre[çc]o\\s+de']);
  result.antigo=result.precosAntigos[0]??findAmount(normalized,['Pre[çc]o\\s+antigo','Pre[çc]o\\s+de']);
  result.novo=findAmount(normalized,['Pre[çc]o\\s+novo','Pre[çc]o\\s+por']);
  result.descontos=findAmounts(normalized,['Desconto']);
  result.desconto=result.descontos[0]??findAmount(normalized,['Desconto']);
  if(result.tipo==='leve_pague'){
   const q=result.quantidade;
   result.totalAntigo=result.antigo;
   result.totalNovo=result.novo??(totalText?price(totalText[1]):null);
   if(unitHeadline&&result.totalNovo==null)result.totalNovo=Math.round(price(unitHeadline[1])*q*100)/100;
   if(result.totalNovo==null&&totalText)result.totalNovo=price(totalText[1]);
   if(result.totalAntigo!=null)result.antigo=Math.round(result.totalAntigo/q*100)/100;
   if(result.totalNovo!=null)result.novo=Math.round(result.totalNovo/q*100)/100;
   if(unitHeadline&&result.novo!=null&&Math.abs(result.novo-price(unitHeadline[1]))>.011)result.avisos.push('Preço por unidade do título difere do total do conjunto; confira no portal.');
   if(result.desconto!=null)result.desconto=Math.round(result.desconto/q*100)/100;
   result.precosAntigos=result.precosAntigos.map(v=>Math.round(v/q*100)/100);
   result.descontos=result.descontos.map(v=>Math.round(v/q*100)/100);
  }
  result.multiplosPrecos=result.precosAntigos.length>1;
  if(result.multiplosPrecos)result.avisos.push('Campanha com mais de um preço antigo. Confira os preços individuais no GZ. Ativação requer autorização expressa do responsável.');
  result.reembolso=findAmount(normalized,['Reembolso(?:\\s+fixo)?(?:\\s+de)?']);
  if(result.tipo==='leve_pague'){
   const unitRefund=normalized.match(/Reembolso\s+fixo\s+de\s*R\$\s*([\d.,]+)\s+por\s+unidade/i);
   const totalRefund=result.reembolso;
   result.reembolsoTotal=totalRefund;
   if(unitRefund){result.reembolso=price(unitRefund[1]);result.reembolsoTotal=Math.round(result.reembolso*result.quantidade*100)/100;}
   else if(totalRefund!=null)result.reembolso=Math.round(totalRefund/result.quantidade*100)/100;
   if(result.totalAntigo!=null&&result.totalNovo!=null&&result.desconto!=null&&Math.abs(result.totalAntigo-result.totalNovo-result.desconto*result.quantidade)>.03)result.avisos.push('Desconto do conjunto não corresponde aos valores informados. Confira.');
  }
  result.limite=findAmount(normalized,['Limite\\s+da\\s+promo[çc][aã]o\\s+por\\s+rede']);
  const validity=normalized.match(/Validade\s*(?:de)?\s*:?\s*(\d{2}[\/-]\d{2}[\/-]\d{4})\s*(?:at[eé]|a)\s*(\d{2}[\/-]\d{2}[\/-]\d{4})/i);
  if(validity){result.inicio=isoDate(validity[1]);result.fim=isoDate(validity[2]);if(!result.inicio||!result.fim||result.inicio>result.fim)result.avisos.push('Confira a validade da campanha: as datas parecem inválidas.');}
  const seen=new Set();for(const line of normalized.split('\n')){const m=line.match(/^\s*(?:[•*\-]\s*)?(\d{8,14})\s*[-–—:]\s*(.+?)\s*$/);if(!m||seen.has(m[1]))continue;seen.add(m[1]);result.produtos.push({codigo:m[1],descricaoOrigem:m[2].trim()});}
  if(!result.produtos.length)result.avisos.push('Nenhum produto com EAN e descrição foi identificado.');
  if(result.antigo==null)result.avisos.push('Preço antigo não identificado.');
  if(result.novo==null)result.avisos.push('Preço novo não identificado.');
  if(result.reembolso==null)result.avisos.push('Reembolso não identificado.');
  if(!result.inicio||!result.fim)result.avisos.push('Datas da promoção não identificadas.');
  if(!result.multiplosPrecos&&result.antigo!=null&&result.novo!=null){const expected=Math.max(0,result.antigo-result.novo);if(result.desconto!=null&&Math.abs(result.desconto-expected)>0.011)result.avisos.push('O desconto informado no portal não corresponde à diferença dos preços. Confira.');}
  return result;
 }
 return {parse,price,amount,isoDate};
});
