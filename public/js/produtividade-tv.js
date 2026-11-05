(()=>{'use strict';
const root=document.getElementById('tvRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const duration=n=>{n=Math.round(Number(n)||0);return [Math.floor(n/3600),Math.floor((n%3600)/60),n%60].map(v=>String(v).padStart(2,'0')).join(':')};
const niceDate=x=>String(x||'').slice(0,10).split('-').reverse().join('/');
let last='';
async function refresh(){try{
 const response=await fetch('/api/ecommerce-produtividade/tv/publico',{cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Não foi possível atualizar o painel.');
 if(!data.publicado){root.innerHTML='<div class="tv-empty">Aguardando a primeira publicação do ranking pelo responsável.</div>';return}
 const fresh=JSON.stringify(data);if(fresh===last)return;last=fresh;
 const all=(data.usuarios||[]).slice().sort((a,b)=>Number(b.itens)-Number(a.itens)||a.nome.localeCompare(b.nome,'pt-BR'));
 const top=all.slice(0,3),others=all.slice(3),v=data.totais||{};
 const stats=[['Compras dos separadores',fmt(v.compras)],['Itens separados',fmt(v.itens)],['Usuários considerados',fmt(all.length)],['Tempo médio/compra',v.compras?duration(v.segundos_total/v.compras):'—']];
 const three=[0,1,2].map((i)=>{const person=top[i];return `<div class="tv-top"><div class="tv-top-place">${i+1}º</div><div><div class="tv-top-name">${person?esc(person.nome):'—'}</div><div class="tv-top-sub">Itens separados</div></div><div class="tv-top-value">${person?fmt(person.itens):'—'}</div></div>`}).join('');
 const otherRows=others.slice(0,12).map((x,i)=>`<div class="tv-rank"><span class="tv-place">${i+4}º</span><span class="tv-name">${esc(x.nome)}</span><strong class="tv-value">${fmt(x.itens)}</strong></div>`).join('');
 root.innerHTML=`<header class="tv-header"><div><div class="tv-brand">SUPERMERCADO MANAÍRA · E-COMMERCE</div><div class="tv-title">Ranking de Produtividade</div><div class="tv-period">${niceDate(data.inicio)} a ${niceDate(data.fim)} · Por itens separados</div></div><div class="tv-badge">PAINEL DO SETOR</div></header><section class="tv-stats">${stats.map(([label,value])=>`<div class="tv-stat"><div class="tv-stat-label">${label}</div><div class="tv-stat-value">${value}</div></div>`).join('')}</section><main class="tv-columns"><section class="tv-panel"><h2 class="tv-section-title">Classificação geral · 4º em diante</h2><div class="tv-rank-list">${otherRows||'<p class="tv-placeholder">Não há outros colaboradores no período.</p>'}</div></section><section class="tv-panel"><h2 class="tv-section-title">🏆 Top 3 destaques</h2><div class="tv-podium">${three}</div></section></main><footer class="tv-footer"><span>Você já é de casa</span><span>Última publicação: ${new Date(data.publicado_em).toLocaleString('pt-BR')} · Atualização automática</span></footer>`;
 }catch(e){root.innerHTML='<div class="tv-error">'+esc(e.message)+'<div class="tv-linkhelp">Verifique a conexão com a internet ou consulte o responsável pelo painel.</div></div>';last=''}}
refresh();setInterval(refresh,60000);
})();
