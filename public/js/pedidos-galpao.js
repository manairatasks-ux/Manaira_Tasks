/* Pedidos ao Galpão: exclusivamente consulta e geração de PDF. */
(function(){
'use strict';
let dados=[],selecionados=new Map(),limite=60,busca='',somenteComSaldo=true,consultado='';
const $p=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function visiveis(){return dados.filter(p=>(!somenteComSaldo||p.estoque_galpao>0)&&(!busca||`${p.descricao} ${p.codigo_barra}`.toLowerCase().includes(busca))&&(p.percentual_galpao===null||p.percentual_galpao>=limite));}
function entrar(){
 if(!exigirModulo('pedidos_galpao','Pedidos ao Galpão'))return;
 setModule('pedidos-galpao');setView('pedidos-galpao');
 $p('setorTitulo').textContent='Pedidos ao Galpão';
 $p('setorDescricao').textContent='Sugestões por distribuição de estoque e guia PDF. Nenhum estoque é alterado.';
 history.replaceState(null,'','#pedidos-galpao');
 render();if(!dados.length)atualizar();
}
function render(){
 const panel=$p('pedidosGalpaoPanel');if(!panel)return;
 panel.innerHTML=`<div class="pg-shell">
 <div class="pg-top"><div><h2>Reposição sugerida</h2><p>Compare a quantidade em unidades da GZ com a do Galpão. O estoque da loja é estimado pela diferença.</p></div><button id="pgAtualizar" type="button">↻ Atualizar estoques</button></div>
 <div class="pg-alert">Somente consulta. O PDF é um guia manual: não reserva, transfere ou baixa mercadorias em nenhum estoque.</div>
 <div class="pg-controls"><label>Buscar produto / código<input id="pgBusca" placeholder="Digite para localizar" value="${esc(busca)}" /></label><label>Concentração mínima no galpão <strong id="pgLimiteLabel">${limite}%</strong><input id="pgLimite" type="range" min="0" max="100" step="5" value="${limite}" /></label><label class="pg-check"><input id="pgSaldo" type="checkbox" ${somenteComSaldo?'checked':''}/> Somente com saldo no galpão</label></div>
 <div class="pg-info" id="pgInfo"></div><div class="pg-table-wrap"><table class="pg-table"><thead><tr><th><input type="checkbox" id="pgTodos" title="Selecionar todos os itens visíveis válidos" /></th><th>Produto / código</th><th>GZ total</th><th>Galpão</th><th>Loja estimada</th><th>% galpão</th><th>Qtd. pedir</th></tr></thead><tbody id="pgLinhas"></tbody></table></div>
 <div class="pg-footer"><span id="pgSelecionados">Nenhum item selecionado</span><button type="button" id="pgPdf">▤ Gerar guia em PDF</button></div></div>`;
 $p('pgBusca').oninput=e=>{busca=e.target.value.trim().toLowerCase();linhas();};
 $p('pgLimite').oninput=e=>{limite=Number(e.target.value);$p('pgLimiteLabel').textContent=limite+'%';linhas();};
 $p('pgSaldo').onchange=e=>{somenteComSaldo=e.target.checked;linhas();};
 $p('pgAtualizar').onclick=atualizar;
 $p('pgTodos').onchange=e=>{visiveis().filter(p=>p.situacao==='ok'&&p.estoque_galpao>0).forEach(p=>{if(e.target.checked){if(!selecionados.has(p.codigo_barra))selecionados.set(p.codigo_barra,1);}else selecionados.delete(p.codigo_barra);});linhas();};
 $p('pgPdf').onclick=gerarPdf;linhas();
}
function linhas(){
 const itens=visiveis();const tbody=$p('pgLinhas');if(!tbody)return;
 $p('pgInfo').textContent=`${itens.length} produtos exibidos • ${dados.length} cadastrados no Galpão • ${dados.filter(p=>p.situacao!=='ok').length} sem comparação confiável${consultado?' • Atualizado: '+consultado:''}`;
 tbody.innerHTML=itens.map(p=>{
  const ok=p.situacao==='ok',ativo=ok&&p.estoque_galpao>0,marcado=selecionados.has(p.codigo_barra);
  const estado=ok?'':p.situacao==='nao_encontrado_gz'?'Não localizado na GZ':p.situacao==='saldo_gz_indisponivel'?'Saldo GZ indisponível':'Divergência de saldos';
  return `<tr class="${!ok?'pg-divergencia':''}"><td><input type="checkbox" data-pg-check="${esc(p.codigo_barra)}" ${marcado?'checked':''} ${!ativo?'disabled':''}/></td><td><strong>${esc(p.descricao)}</strong><small>${esc(p.codigo_barra)}${estado?' • '+esc(estado):''}</small></td><td>${p.estoque_gz===null?'—':fmt(p.estoque_gz)}</td><td>${fmt(p.estoque_galpao)}</td><td>${p.estoque_loja===null?'—':fmt(p.estoque_loja)}</td><td>${p.percentual_galpao===null?'—':`<span class="pg-percent">${fmt(p.percentual_galpao)}%</span>`}</td><td><input class="pg-qtd" type="number" min="1" step="1" max="100000000" data-pg-qtd="${esc(p.codigo_barra)}" value="${marcado?selecionados.get(p.codigo_barra):1}" ${!ativo?'disabled':''}/></td></tr>`;
 }).join('')||'<tr><td colspan="7" class="pg-empty">Nenhum produto encontrado para os filtros escolhidos.</td></tr>';
 tbody.querySelectorAll('[data-pg-check]').forEach(el=>el.onchange=()=>{const cod=el.dataset.pgCheck;if(el.checked){const qtd=Number(tbody.querySelectorAll('[data-pg-qtd]').length?Array.from(tbody.querySelectorAll('[data-pg-qtd]')).find(i=>i.dataset.pgQtd===cod)?.value:1);selecionados.set(cod,Number.isSafeInteger(qtd)&&qtd>0?qtd:1);}else selecionados.delete(cod);linhas();});
 tbody.querySelectorAll('[data-pg-qtd]').forEach(el=>el.onchange=()=>{if(selecionados.has(el.dataset.pgQtd))selecionados.set(el.dataset.pgQtd,Number(el.value));});
 $p('pgSelecionados').textContent=`${selecionados.size} produto(s) selecionado(s)`;
 $p('pgPdf').disabled=!selecionados.size;
 const validos=itens.filter(p=>p.situacao==='ok'&&p.estoque_galpao>0);$p('pgTodos').checked=validos.length>0&&validos.every(p=>selecionados.has(p.codigo_barra));
}
async function atualizar(){
 const btn=$p('pgAtualizar');if(btn){btn.disabled=true;btn.textContent='Consultando GZ e Galpão...';}
 try{const resultado=await api('/api/pedidos-galpao/sugestoes');dados=resultado.itens||[];consultado=new Date(resultado.consultado_em).toLocaleString('pt-BR');selecionados.clear();render();}
 catch(e){alert('Não foi possível comparar os estoques: '+e.message);if(btn){btn.disabled=false;btn.textContent='↻ Atualizar estoques';}}
}
async function gerarPdf(){
 const itens=[...selecionados].map(([codigo_barra,quantidade])=>({codigo_barra,quantidade}));
 if(!itens.length)return alert('Selecione ao menos um produto.');
 if(itens.some(i=>!Number.isSafeInteger(i.quantidade)||i.quantidade<=0||i.quantidade>100000000))return alert('Informe quantidades inteiras e positivas.');
 const btn=$p('pgPdf');btn.disabled=true;btn.textContent='Gerando PDF...';
 try{
  const res=await fetch('/api/pedidos-galpao/relatorio.pdf',{method:'POST',headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{})},body:JSON.stringify({itens})});
  if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||'Não foi possível gerar o PDF.');}
  const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download='guia-pedidos-galpao.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(e){alert(e.message);}finally{btn.disabled=false;btn.textContent='▤ Gerar guia em PDF';}
}
window.entrarPedidosGalpao=entrar;
})();
