/* Manaíra IA V1 — somente Galpão. Compartilha a API autenticada do Board. */
(function(){
  let period=30;
  let history=[];
  let sending=false;
  const out=document.getElementById('manairaIaPanel');
  const drawer=document.getElementById('miaDrawer');
  const messages=document.getElementById('miaDrawerMessages');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=n=>Number(n||0).toLocaleString('pt-BR');
  function appendMessage(role,content,meta){
    history.push({role,content,meta});
    if(history.length>30)history=history.slice(-30);
    renderMessages();
  }
  function renderTable(table){
    if(!table||!Array.isArray(table.rows)||!table.rows.length)return '';
    const cols=Array.isArray(table.columns)?table.columns:[];
    return `<div class="mia-inline-table"><table><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${table.rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="mia-copy" type="button" data-mia-copy="1">Copiar tabela</button>`;
  }
  function renderMessages(){
    const html=history.map(m=>`<div class="mia-message ${m.role}"><div>${esc(m.content)}</div>${m.table?renderTable(m.table):''}${m.meta?`<button type="button" class="mia-source" title="Fonte dos dados">ⓘ Fonte</button><small class="mia-source-detail" hidden>${esc(m.meta)}</small>`:''}</div>`).join('');
    messages.innerHTML=html||'<div class="mia-message bot">Pergunte sobre estoque, entradas, saídas ou validades do Galpão.</div>';
    const main=document.getElementById('miaMainMessages');if(main)main.innerHTML=messages.innerHTML;
    [messages,main].filter(Boolean).forEach(el=>{
      el.querySelectorAll('[data-mia-copy]').forEach((btn,i)=>btn.onclick=()=>{
        const container=btn.closest('.mia-message');const table=container?.querySelector('table');
        if(!table)return;const data=[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent).join('\t')).join('\n');
        navigator.clipboard.writeText(data).then(()=>{btn.textContent='Copiado!';}).catch(()=>{btn.textContent='Não foi possível copiar';});
      });
      el.querySelectorAll('.mia-source').forEach(btn=>btn.onclick=()=>{const detail=btn.nextElementSibling;detail.hidden=!detail.hidden;});
      el.scrollTop=el.scrollHeight;
    });
  }
  function canUse(){return state?.usuario?.perfil==='administrador_principal';}
  async function ask(question,form){
    if(!canUse()||sending)return;
    const previous=[...history].reverse().find(x=>x.role==='user')?.content||'';
    sending=true;
    appendMessage('user',question);
    const button=form?.querySelector('button[type="submit"]'); if(button)button.disabled=true;
    try{
      const reply=await api('/api/manaira-ia/perguntar',{method:'POST',body:JSON.stringify({pergunta:question,perguntaAnterior:previous,periodo:period})});
      if(reply.jobId){
        appendMessage('bot','Consultando Qwen no seu computador...','Aguardando agente Ollama');
        const placeholder=history.length-1;
        const started=Date.now();
        while(Date.now()-started<190000){
          await new Promise(resolve=>setTimeout(resolve,2500));
          const status=await api('/api/manaira-ia/resposta/'+encodeURIComponent(reply.jobId));
          if(status.status==='pending')continue;
          history[placeholder]={role:'bot',content:status.answer,meta:`${status.engine} · ${reply.periodDays} dias · Fonte: Galpão`};
          renderMessages();
          break;
        }
        if(history[placeholder]?.content==='Consultando Qwen no seu computador...'){
          history[placeholder]={role:'bot',content:'O agente local não respondeu a tempo. Atualize a consulta ou confira se está em execução.',meta:'Falha de comunicação com Ollama'};
          renderMessages();
        }
      }else {appendMessage('bot',reply.answer,reply.source||`${reply.engine} · Fonte: Galpão`);if(reply.table){history[history.length-1].table=reply.table;renderMessages();}}
    }catch(e){appendMessage('bot','Não foi possível consultar o Galpão: '+e.message);}
    finally{sending=false;if(button)button.disabled=false;}
  }
  async function render(){
    if(!canUse())return;
    setModule('manaira-ia');setView('manaira-ia');window.history.replaceState(null,'','#manaira-ia');
    out.innerHTML='<div class="mia-loading">Consultando dados do Galpão...</div>';
    try{
      const d=await api('/api/manaira-ia/dashboard?periodo='+period);
      const s=d.summary||{};
      const cards=[['Produtos ativos',s.produtos],['Embalagens em estoque',s.embalagens],['Unidades em estoque',s.unidades],['Produtos sem saldo',s.sem_estoque],['Lotes vencidos',s.lotes_vencidos],['Vencem em 30 dias',s.lotes_vencem_30d]];
      const entries=d.movements.find(x=>x.tipo==='ENTRADA')||{};
      const exits=d.movements.find(x=>x.tipo==='SAIDA')||{};
      out.innerHTML=`<div class="mia-page"><header class="mia-top"><div><span class="mia-kicker">ASSISTENTE GERENCIAL · GALPÃO</span><h2>Manaíra IA</h2><p>Indicadores reais, tendências e recomendações fundamentadas.</p></div><div class="mia-top-actions"><select id="miaPeriod"><option value="7" ${period===7?'selected':''}>7 dias</option><option value="30" ${period===30?'selected':''}>30 dias</option><option value="90" ${period===90?'selected':''}>90 dias</option></select><button id="miaRefresh" type="button">↻ Atualizar</button></div></header><div class="mia-meta">Fonte: Galpão · ${esc(d.engine)} · Gerado em ${new Date(d.generatedAt).toLocaleString('pt-BR')}</div><div class="mia-cards">${cards.map(c=>`<div class="mia-stat"><span>${esc(c[0])}</span><strong>${number(c[1])}</strong></div>`).join('')}</div><div class="mia-cols"><section class="mia-panel"><h3>Movimentação nos últimos ${period} dias</h3><div class="mia-movement"><div><span>Entradas</span><strong>${number(entries.embalagens)}</strong><small>embalagens · ${number(entries.registros)} registros</small></div><div><span>Saídas</span><strong>${number(exits.embalagens)}</strong><small>embalagens · ${number(exits.registros)} registros</small></div></div><h3>Produtos mais movimentados</h3><div class="mia-table-wrap"><table><thead><tr><th>Produto</th><th>Tipo</th><th>Emb.</th></tr></thead><tbody>${d.topMovements.slice(0,8).map(x=>`<tr><td>${esc(x.descricao)}</td><td>${esc(x.tipo)}</td><td>${number(x.embalagens)}</td></tr>`).join('')||'<tr><td colspan="3">Sem dados no período</td></tr>'}</tbody></table></div></section><section class="mia-panel"><h3>Diagnóstico e recomendações</h3>${d.recommendations.map(x=>`<div class="mia-advice"><b>${esc(x.priority)} · ${esc(x.title)}</b><p>${esc(x.reason)}</p><small>${esc(x.action)}</small></div>`).join('')}<p class="mia-disclaimer">Recomendações são hipóteses operacionais para conferência, não ordens automáticas. Nenhuma alteração de estoque é executada.</p></section></div><section class="mia-panel mia-chat-main"><h3>Faça uma pergunta ao Galpão</h3><p>Exemplos: “Quais produtos mais movimentaram?”, “O que está vencendo?”, “Quais riscos devo verificar?”</p><div id="miaMainMessages" class="mia-messages"></div><form id="miaMainForm" class="mia-chat-form"><input id="miaMainQuestion" maxlength="500" placeholder="Pergunte sobre os dados do Galpão..." required><button type="submit">Perguntar</button></form></section><div class="mia-meta">Cálculos obtidos diretamente do PostgreSQL · Movimentações estornadas excluídas · Estoque por embalagem e unidade são medidas distintas.</div></div>`;
      document.getElementById('miaPeriod').onchange=e=>{period=Number(e.target.value);render();};
      document.getElementById('miaRefresh').onclick=render;
      document.getElementById('miaMainForm').onsubmit=e=>{e.preventDefault();const field=document.getElementById('miaMainQuestion');const q=field.value.trim();if(q){field.value='';ask(q,e.target);}};
      renderMessages();
    }catch(e){out.innerHTML=`<div class="mia-page"><h2>Manaíra IA</h2><p>Erro ao consultar o Galpão: ${esc(e.message)}</p><button id="miaTryAgain">Tentar novamente</button></div>`;document.getElementById('miaTryAgain').onclick=render;}
  }
  function openDrawer(){if(!canUse())return;drawer.classList.remove('hidden');renderMessages();document.getElementById('miaDrawerQuestion')?.focus();}
  document.getElementById('cardManairaIa').onclick=render;
  document.getElementById('btnManairaIaPainel').onclick=render;
  document.getElementById('miaFloatOpen').onclick=openDrawer;
  document.getElementById('miaDrawerClose').onclick=()=>drawer.classList.add('hidden');
  document.getElementById('miaDrawerForm').onsubmit=e=>{e.preventDefault();const field=document.getElementById('miaDrawerQuestion');const q=field.value.trim();if(q){field.value='';ask(q,e.target);}};
})();
