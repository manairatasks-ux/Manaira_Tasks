/* V74.4 — leitor local de texto copiado do portal Scanntech. Sem chamadas externas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScanntechParser=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const clean=s=>String(s||'').replace(/\r/g,'').replace(/\*\*/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/[\u00a0\u202f]/g,' ').replace(/[ \t]+/g,' ').trim();
 function price(s){if(!s)return null;let v=String(s).replace(/\s/g,'');if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');const n=Number(v);return Number.isFinite(n)&&n>=0?n:null}
 const amount=n=>n==null?'':n.toFixed(2).replace('.',',');
 function findAmount(src,labels){for(const label of labels){const re=new RegExp('(?:^|\\n)\\s*'+label+'\\s*:?\\s*(?:R\\$\\s*)?([0-9][0-9.,]*)','im');const m=src.match(re);if(m){const n=price(m[1]);if(n!=null)return n}}return null}
 function isoDate(raw){const m=String(raw||'').match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);if(!m)return '';const s=`${m[3]}-${m[2]}-${m[1]}`;const d=new Date(s+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:''}
 function parse(raw){const src=clean(raw);const normalized=src.replace(/\s*\n\s*/g,'\n');const result={titulo:'',codigo:'',marca:'',antigo:null,novo:null,desconto:null,reembolso:null,limite:null,inicio:'',fim:'',produtos:[],avisos:[],conditions:''};
  const heading=normalized.match(/(?:^|\n)\s*#*\s*R\$\s*\d[\d.,]*\s+([^\n]+)/i);if(heading)result.titulo=heading[1].trim().replace(/^#+\s*/,'');
  const code=normalized.match(/C[oó]digo\s*:\s*#?\s*(\d{4,12})/i);if(code)result.codigo=code[1];
  const author=normalized.match(/Autor\s*:\s*([^\n]+)/i);if(author)result.marca=author[1].split(/\b(?:Pre[çc]o|Reembolso|Desconto|Limite|Aceitar|Rejeitar)\b/i)[0].trim().replace(/\*+/g,'');
  result.antigo=findAmount(normalized,['Pre[çc]o\\s+antigo','Pre[çc]o\\s+de']);
  result.novo=findAmount(normalized,['Pre[çc]o\\s+novo','Pre[çc]o\\s+por']);
  result.desconto=findAmount(normalized,['Desconto']);
  result.reembolso=findAmount(normalized,['Reembolso(?:\\s+fixo)?(?:\\s+de)?']);
  result.limite=findAmount(normalized,['Limite\\s+da\\s+promo[çc][aã]o\\s+por\\s+rede']);
  const validity=normalized.match(/Validade\s*(?:de)?\s*:?\s*(\d{2}[\/-]\d{2}[\/-]\d{4})\s*(?:at[eé]|a)\s*(\d{2}[\/-]\d{2}[\/-]\d{4})/i);
  if(validity){result.inicio=isoDate(validity[1]);result.fim=isoDate(validity[2]);if(!result.inicio||!result.fim||result.inicio>result.fim)result.avisos.push('Confira a validade da campanha: as datas parecem inválidas.');}
  const seen=new Set();for(const line of normalized.split('\n')){const m=line.match(/^\s*(?:[•*\-]\s*)?(\d{8,14})\s*[-–—:]\s*(.+?)\s*$/);if(!m||seen.has(m[1]))continue;seen.add(m[1]);result.produtos.push({codigo:m[1],descricaoOrigem:m[2].trim()});}
  if(!result.produtos.length)result.avisos.push('Nenhum produto com EAN e descrição foi identificado.');
  if(result.antigo==null)result.avisos.push('Preço antigo não identificado.');
  if(result.novo==null)result.avisos.push('Preço novo não identificado.');
  if(result.reembolso==null)result.avisos.push('Reembolso não identificado.');
  if(!result.inicio||!result.fim)result.avisos.push('Datas da promoção não identificadas.');
  if(result.antigo!=null&&result.novo!=null){const expected=Math.max(0,result.antigo-result.novo);if(result.desconto!=null&&Math.abs(result.desconto-expected)>0.011)result.avisos.push('O desconto informado no portal não corresponde à diferença dos preços. Confira.');}
  return result;
 }
 return {parse,price,amount,isoDate};
});
