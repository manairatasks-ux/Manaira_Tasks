/* Pedidos ao Galpão: consulta e exportação; não movimenta estoques. */
(function(){
'use strict';
let dados=[],selecionados=new Map(),limite=60,busca='',somenteComSaldo=true,consultado='',ordenacao={campo:'percentual_galpao',direcao:-1},jobId=null,polling=false;
const $p=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function visiveis(){return dados.filter(p=>(!somenteComSaldo||p.estoque_galpao>0)&&(!busca||`${p.descricao} ${p.codigo_barra}`.toLowerCase().includes(busca))&&(p.percentual_galpao===null||p.percentual_galpao>=limite)).sort((a,b)=>{
 const x=a[ordenacao.campo],y=b[ordenacao.campo];if(x==null)return y==null?0:1;if(y==null)return -1;
 return ((x-y)||a.descricao.localeCompare(b.descricao,'pt-BR'))*ordenacao.direcao;
});}
function entrar(){if(!exigirModulo('pedidos_galpao','Pedidos ao Galpão'))return;setModule('pedidos-galpao');setView('pedidos-galpao');$p('setorTitulo').textContent='Pedidos ao Galpão';$p('setorDescricao').textContent='Sugestões por distribuição de estoque e guias PDF/Excel. Nenhum estoque é alterado.';history.replaceState(null,'','#pedidos-galpao');render();if(!dados.length&&!polling)atualizar();}
function render(){const panel=$p('pedidosGalpaoPanel');if(!panel)return;
 panel.innerHTML=`<div class="pg-shell"><div class="pg-top"><div><h2>Reposição sugerida</h2><p>Compare o estoque GZ com o Galpão. A loja é estimada pela diferença.</p></div><button id="pgAtualizar" type="button">↻ Atualizar estoques</button></div>
 <div class="pg-alert">Somente consulta. Os relatórios não reservam, transferem ou baixam mercadorias.</div>
 <div id="pgProgresso" class="pg-progress" hidden><div class="pg-progress-head"><strong id="pgFase">Consultando estoque GZ...</strong><strong id="pgContador">0 / 0</strong></div><div class="pg-bar"><div id="pgBarra"></div></div><div id="pgDetalhes"></div><div id="pgTempo">Calculando tempo restante...</div></div>
 <div class="pg-controls"><label>Buscar produto / código<input id="pgBusca" placeholder="Digite para localizar" value="${esc(busca)}" /></label><label>Concentração mínima no galpão <strong id="pgLimiteLabel">${limite}%</strong><input id="pgLimite" type="range" min="0" max="100" step="5" value="${limite}" /></label><label class="pg-check"><input id="pgSaldo" type="checkbox" ${somenteComSaldo?'checked':''}/> Somente com saldo no galpão</label></div>
 <div class="pg-info" id="pgInfo"></div><div class="pg-table-wrap"><table class="pg-table"><thead><tr><th><input type="checkbox" id="pgTodos" title="Selecionar itens visíveis válidos"/></th><th>Produto / código</th>${[['estoque_gz','GZ total'],['estoque_galpao','Galpão'],['estoque_loja','Loja estimada'],['percentual_galpao','% galpão']].map(([k,t])=>`<th><button type="button" class="pg-sort" data-sort="${k}">${t} <span data-sort-icon="${k}">↕</span></button></th>`).join('')}<th>Qtd. pedir</th></tr></thead><tbody id="pgLinhas"></tbody></table></div>
 <div class="pg-footer"><span id="pgSelecionados">Nenhum item selecionado</span><div class="pg-actions"><button type="button" id="pgRepetir" hidden>↻ Tentar novamente os itens com falha</button><button type="button" id="pgExcel">▦ Exportar Excel (.xlsx)</button><button type="button" id="pgPdf">▤ Gerar guia em PDF</button></div></div></div>`;
 $p('pgBusca').oninput=e=>{busca=e.target.value.trim().toLowerCase();linhas();};
 $p('pgLimite').oninput=e=>{limite=Number(e.target.value);$p('pgLimiteLabel').textContent=limite+'%';linhas();};
 $p('pgSaldo').onchange=e=>{somenteComSaldo=e.target.checked;linhas();};
 $p('pgAtualizar').onclick=()=>atualizar();
 $p('pgRepetir').onclick=()=>atualizar(true);
 $p('pgTodos').onchange=e=>{visiveis().filter(p=>p.situacao==='ok'&&p.estoque_galpao>0).forEach(p=>{if(e.target.checked){if(!selecionados.has(p.codigo_barra))selecionados.set(p.codigo_barra,1);}else selecionados.delete(p.codigo_barra);});linhas();};
 panel.querySelectorAll('[data-sort]').forEach(el=>el.onclick=()=>{const campo=el.dataset.sort;ordenacao=ordenacao.campo===campo?{campo,direcao:-ordenacao.direcao}:{campo,direcao:1};linhas();});
 $p('pgPdf').onclick=()=>exportar('pdf');$p('pgExcel').onclick=()=>exportar('xlsx');linhas();if(polling)mostrarProgresso();
}
function linhas(){const itens=visiveis(),tbody=$p('pgLinhas');if(!tbody)return;
 $p('pgInfo').textContent=`${itens.length} produtos exibidos • ${dados.length} cadastrados no Galpão • ${dados.filter(p=>p.situacao!=='ok').length} sem comparação confiável${consultado?' • Atualizado: '+consultado:''}`;
 tbody.innerHTML=itens.map(p=>{const ok=p.situacao==='ok',ativo=ok&&p.estoque_galpao>0,marcado=selecionados.has(p.codigo_barra);
 const estado=ok?'':p.situacao==='nao_encontrado_gz'?'Não localizado na GZ':p.situacao==='saldo_gz_indisponivel'?'Saldo GZ indisponível':p.situacao==='erro_consulta_gz'?'Falha na consulta GZ':'Galpão maior que GZ / saldo divergente';
 return `<tr class="${!ok?'pg-divergencia':''}"><td><input type="checkbox" data-pg-check="${esc(p.codigo_barra)}" ${marcado?'checked':''} ${!ativo?'disabled':''}/></td><td><strong>${esc(p.descricao)}</strong><small>${esc(p.codigo_barra)}${estado?' • '+esc(estado):''}</small></td><td>${p.estoque_gz===null?'—':fmt(p.estoque_gz)}</td><td>${fmt(p.estoque_galpao)}</td><td>${p.estoque_loja===null?'—':fmt(p.estoque_loja)}</td><td>${p.percentual_galpao===null?'—':`<span class="pg-percent">${fmt(p.percentual_galpao)}%</span>`}</td><td><input class="pg-qtd" type="number" min="1" step="1" max="100000000" data-pg-qtd="${esc(p.codigo_barra)}" value="${marcado?selecionados.get(p.codigo_barra):1}" ${!ativo?'disabled':''}/></td></tr>`;
 }).join('')||'<tr><td colspan="7" class="pg-empty">Nenhum produto encontrado para os filtros escolhidos.</td></tr>';
 tbody.querySelectorAll('[data-pg-check]').forEach(el=>el.onchange=()=>{const cod=el.dataset.pgCheck;if(el.checked){const input=Array.from(tbody.querySelectorAll('[data-pg-qtd]')).find(i=>i.dataset.pgQtd===cod),qtd=Number(input?.value||1);selecionados.set(cod,Number.isSafeInteger(qtd)&&qtd>0?qtd:1);}else selecionados.delete(cod);linhas();});
 tbody.querySelectorAll('[data-pg-qtd]').forEach(el=>el.onchange=()=>{if(selecionados.has(el.dataset.pgQtd))selecionados.set(el.dataset.pgQtd,Number(el.value));});
 $p('pgSelecionados').textContent=`${selecionados.size} produto(s) selecionado(s)`;
 $p('pgPdf').disabled=$p('pgExcel').disabled=!selecionados.size;
 const validos=itens.filter(p=>p.situacao==='ok'&&p.estoque_galpao>0);$p('pgTodos').checked=validos.length>0&&validos.every(p=>selecionados.has(p.codigo_barra));
 $p('pgRepetir').hidden=!dados.some(p=>p.situacao==='erro_consulta_gz');
 document.querySelectorAll('[data-sort-icon]').forEach(el=>{el.textContent=el.dataset.sortIcon===ordenacao.campo?(ordenacao.direcao===1?'↑':'↓'):'↕';});
}
function mostrarProgresso(j){const box=$p('pgProgresso');if(!box)return;box.hidden=false;$p('pgAtualizar').disabled=true;$p('pgAtualizar').textContent='Consultando GZ...';if(!j)return;
 const pct=j.total?Math.round(j.processados/j.total*100):100;$p('pgFase').textContent=j.fase||'Consultando estoque GZ';$p('pgContador').textContent=`${j.processados} / ${j.total} (${pct}%)`;$p('pgBarra').style.width=pct+'%';$p('pgDetalhes').textContent=`Consultados: ${j.sucesso} • Não encontrados: ${j.nao_encontrados} • Falhas: ${j.falhas} • Novas tentativas: ${j.repeticoes}`;$p('pgTempo').textContent=j.segundos_restantes==null?'Calculando tempo restante...':`Tempo restante estimado: ${Math.floor(j.segundos_restantes/60)} min ${j.segundos_restantes%60} s`;
}
async function atualizar(somenteFalhas=false){if(polling)return;
 const codigos=somenteFalhas?dados.filter(p=>p.situacao==='erro_consulta_gz').map(p=>p.codigo_barra):[];
 if(somenteFalhas&&!codigos.length)return;
 polling=true;mostrarProgresso();
 try{
  const inicio=await api('/api/pedidos-galpao/sincronizar',{method:'POST',body:JSON.stringify({somenteFalhas,codigos})});jobId=inicio.id;
  while(true){
   const j=await api('/api/pedidos-galpao/sincronizar/'+encodeURIComponent(jobId));mostrarProgresso(j);
   if(j.estado==='erro')throw Error(j.erro||'Erro na consulta GZ');
   if(j.estado==='concluido'){
    if(somenteFalhas){const mapa=new Map(j.itens.map(p=>[p.codigo_barra,p]));dados=dados.map(p=>mapa.get(p.codigo_barra)||p);}else dados=j.itens||[];
    consultado=new Date(j.consultado_em).toLocaleString('pt-BR');
    // Preserva seleção e quantidades ao atualizar, removendo apenas itens sem saldo confiável.
    for(const cod of selecionados.keys())if(!dados.some(p=>p.codigo_barra===cod&&p.situacao==='ok'))selecionados.delete(cod);
    break;
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }catch(e){alert('Não foi possível concluir a consulta: '+e.message);}finally{polling=false;jobId=null;render();}
}
async function exportar(ext){const itens=[...selecionados].map(([codigo_barra,quantidade])=>{const p=dados.find(x=>x.codigo_barra===codigo_barra);return {codigo_barra,quantidade,estoque_gz:p?.estoque_gz??null};});
 if(!itens.length)return alert('Selecione ao menos um produto.');if(itens.some(i=>!Number.isSafeInteger(i.quantidade)||i.quantidade<=0||i.quantidade>100000000))return alert('Informe quantidades inteiras e positivas.');
 const btn=$p(ext==='pdf'?'pgPdf':'pgExcel'),rotulo=btn.textContent;btn.disabled=true;btn.textContent='Gerando arquivo...';
 try{const res=await fetch('/api/pedidos-galpao/relatorio.'+ext,{method:'POST',headers:{'Content-Type':'application/json',...(state.token?{Authorization:'Bearer '+state.token}:{})},body:JSON.stringify({itens})});
 if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||'Não foi possível gerar o arquivo.');}
 const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download='guia-pedidos-galpao.'+ext;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(e){alert(e.message);}finally{btn.disabled=false;btn.textContent=rotulo;}
}
window.entrarPedidosGalpao=entrar;
})();
