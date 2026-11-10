(()=>{'use strict';
const root=document.getElementById('tvRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const duration=n=>{n=Math.round(Number(n)||0);return [Math.floor(n/3600),Math.floor((n%3600)/60),n%60].map(v=>String(v).padStart(2,'0')).join(':')};
const niceDate=x=>String(x||'').slice(0,10).split('-').reverse().join('/');
let last='';
function pedestal(place,person){
 const name=person?esc(person.nome):'Aguardando resultado';
 const value=person?fmt(person.itens):'—';
 const description=person?'itens separados':'sem classificação';
 const fairs=person?fmt(person.compras):'—';
 const icon=place===1?'★':place===2?'◆':'●';
 return `<article class="tv-winner tv-winner-${place}" aria-label="${place}º lugar: ${name}">
  <div class="tv-winner-info"><div class="tv-winner-medal" aria-hidden="true">${icon}</div>
   <div class="tv-winner-place">${place}º LUGAR</div>
   <div class="tv-winner-name" title="${name}">${name}</div>
   <div class="tv-winner-number">${value}</div><div class="tv-winner-caption">${description}</div>
   <div class="tv-winner-fairs"><strong>${fairs}</strong><span>feiras separadas</span></div>
  </div>
  <div class="tv-step"><div class="tv-step-number">${place}</div></div>
 </article>`;
}
async function refresh(){try{
 const response=await fetch('/api/ecommerce-produtividade/tv/publico',{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Não foi possível atualizar o painel.');
 if(!data.publicado){root.innerHTML='<div class="tv-empty">Aguardando a primeira publicação do ranking pelo responsável.</div>';last='';return}
 const fresh=JSON.stringify(data);if(fresh===last)return;last=fresh;
 const all=(data.usuarios||[]).slice().sort((a,b)=>Number(b.itens)-Number(a.itens)||String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
 const top=all.slice(0,3),v=data.totais||{};
 const stats=[['Compras dos separadores',fmt(v.compras)],['Itens separados',fmt(v.itens)],['Usuários considerados',fmt(all.length)],['Tempo médio/compra',v.compras?duration(v.segundos_total/v.compras):'—']];
 const podium=pedestal(2,top[1])+pedestal(1,top[0])+pedestal(3,top[2]);
 const fourth=all[3]?`<aside class="tv-fourth" aria-label="Quarto colocado"><span class="tv-fourth-rank">4º LUGAR</span><span class="tv-fourth-name" title="${esc(all[3].nome)}">${esc(all[3].nome)}</span><span class="tv-fourth-metrics">${fmt(all[3].itens)} itens · ${fmt(all[3].compras)} feiras</span></aside>`:'';
 const published=data.publicado_em?new Date(data.publicado_em).toLocaleString('pt-BR'):'—';
 root.innerHTML=`<header class="tv-header"><div><div class="tv-brand">SUPERMERCADO MANAÍRA · E-COMMERCE</div><h1 class="tv-title">Destaques de Produtividade</h1><div class="tv-period">${niceDate(data.inicio)} a ${niceDate(data.fim)} · Por itens separados</div></div><div class="tv-badge">TOP 3 DO SETOR</div></header>
 <main class="tv-main"><div class="tv-podium-title">🏆 OS 3 MELHORES DO PERÍODO</div><section class="tv-podium" aria-label="Pódio dos três melhores colaboradores">${podium}</section>${fourth}</main>
 <section class="tv-stats" aria-label="Indicadores gerais">${stats.map(([label,value])=>`<div class="tv-stat"><div class="tv-stat-label">${label}</div><div class="tv-stat-value">${value}</div></div>`).join('')}</section>
 <footer class="tv-footer"><span>Você já é de casa</span><span>Última publicação: ${esc(published)} · Atualização automática</span></footer>`;
 }catch(e){root.innerHTML='<div class="tv-error">'+esc(e.message)+'<div class="tv-linkhelp">Verifique a conexão com a internet ou consulte o responsável pelo painel.</div></div>';last=''}}
refresh();setInterval(refresh,60000);
})();
