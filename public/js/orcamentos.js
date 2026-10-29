/* V68 - Módulo Orçamentos */
(()=>{
const $=id=>document.getElementById(id), panel=()=> $('orcamentosPanel');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reais=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let itens=[],results=[],tab='novo',historico=[],editando=null;
const req=async(url,opt={})=>{const r=await fetch(url,{...opt,headers:{...(opt.body?{'Content-Type':'application/json'}:{}),Authorization:'Bearer '+state.token,...opt.headers}}),json=await r.json().catch(()=>({}));if(!r.ok)throw Error(json.error||'Erro na operação');return json};
const aviso=(s,err=false)=>{const x=$('orcAviso');if(x){x.textContent=s;x.style.color=err?'#bd3030':'#166534'}};
const desconto=(kind,val,basis)=>{const n=Number(val)||0;return kind==='percentual'?Math.round(basis*n/100):kind==='valor'?Math.round(n*100):0};
function calcular(){let sub=0,disc=0;for(const i of itens){const gross=Math.round(i.preco_centavos*i.quantidade);sub+=gross;disc+=Math.min(gross,Math.max(0,desconto(i.desconto_tipo,i.desconto_valor,gross)))}const net=sub-disc;const kind=$('orcTipoGeral')?.value||'nenhum',val=Number($('orcDescontoGeral')?.value)||0;const geral=Math.min(net,Math.max(0,desconto(kind,val,net)));return {sub,disc,geral,total:net-geral}};
window.abrirOrcamentos=async()=>{if(!exigirModulo('orcamentos','Orçamentos'))return;setModule('orcamentos');setView('orcamentos');history.replaceState(null,'','#orcamentos');render()};
function render(){panel().innerHTML=`<div class="orc-head"><div><h2>Orçamentos</h2><p>Propostas comerciais com preços do GZ · V68.3</p></div></div><div class="orc-tabs"><button id="orcNovo" class="${tab==='novo'?'selected':''}">+ Novo orçamento</button><button id="orcHistorico" class="${tab==='historico'?'selected':''}">Histórico</button></div><p id="orcAviso" role="status"></p><div id="orcConteudo"></div>`;$('orcNovo').onclick=()=>{editando=null;itens=[];tab='novo';render()};$('orcHistorico').onclick=()=>{tab='historico';render()};tab==='novo'?novo():listar()}
function novo(){const content=$('orcConteudo');content.innerHTML=`<section class="orc-card"><h3>Identificação <span id="orcEditBadge"></span></h3><div class="orc-grid"><label>Tipo de orçamento<select id="orcTipoDest"><option value="CLIENTE">Pessoa física / Cliente</option><option value="EMPRESA">Empresa</option></select></label><label>CPF/CNPJ (CNPJ obrigatório para empresas)<input id="orcDocumento" maxlength="24" placeholder="CPF ou CNPJ"></label><label>Endereço (opcional)<input id="orcEndereco" maxlength="500" placeholder="Endereço do destinatário"></label><label>Cliente / empresa <input id="orcCliente" maxlength="180" placeholder="Nome do cliente"></label><label>Contato (opcional)<input id="orcContato" placeholder="Telefone ou e-mail"></label><label>Validade do orçamento<input type="date" id="orcValidade"></label></div></section><section class="orc-card"><h3>Pesquisar produtos GZ</h3><div class="orc-search"><input id="orcBusca" placeholder="Nome (use % para buscar em qualquer posição), código ou EAN"><button id="orcPesquisar">Pesquisar</button></div><p class="orc-hint">Pesquisa: feijao = começa com; %feijao = contém; %feijao %branco = contém ambos. Preços conferidos novamente no salvamento.</p><div id="orcResultados"></div></section><section class="orc-card"><h3>Itens do orçamento <span id="orcQtd"></span></h3><div id="orcItens"></div><hr><div class="orc-grid"><label>Desconto geral<select id="orcTipoGeral"><option value="nenhum">Sem desconto</option><option value="percentual">Percentual (%)</option><option value="valor">Valor (R$)</option></select></label><label>Valor do desconto<input id="orcDescontoGeral" type="number" min="0" step="0.01" value="0"></label></div><label>Observações<textarea id="orcObs" rows="2" placeholder="Condições, retirada ou entrega"></textarea></label><div class="orc-totais" id="orcTotais"></div><button id="orcSalvar" class="orc-primary">Salvar e emitir orçamento</button><p class="orc-hint">Os usuários com acesso a Orçamentos podem aplicar descontos. Os preços e descontos ficam registrados na emissão.</p></section>`;
$('orcPesquisar').onclick=pesquisar;$('orcBusca').addEventListener('keydown',e=>{if(e.key==='Enter')pesquisar()});$('orcTipoGeral').onchange=totais;$('orcDescontoGeral').oninput=totais;$('orcSalvar').onclick=salvar;mostrarItens()}
const dataBR=d=>{if(!d)return 'Não informada';const v=String(d).slice(0,10).split('-');return v.length===3?`${v[2]}/${v[1]}/${v[0]}`:esc(d)};
const chaveProduto=p=>String(p.codigo||p.ean||'').trim();
const jaIncluido=p=>itens.some(x=>chaveProduto(x)===chaveProduto(p));
function exibirResultados(){
 const target=$('orcResultados');if(!target)return;
 target.innerHTML=results.length?results.map((p,i)=>{
  const inativo=p.situacao==='INATIVO',incluido=jaIncluido(p),semPreco=!p.preco_disponivel;
  const estoque=p.estoque===null||p.estoque===undefined?'Não informado':`${Number(p.estoque).toLocaleString('pt-BR',{maximumFractionDigits:3})} un.`;
  const normal=p.preco_normal_centavos===null||p.preco_normal_centavos===undefined?'—':reais(p.preco_normal_centavos);
  const preco=p.em_promocao?reais(p.preco_promocional_centavos):p.preco_disponivel?reais(p.preco_centavos):'Sem preço';
  return `<div class="orc-result-row${inativo?' orc-inativo':''}">
    <div class="orc-result-name"><strong>${esc(p.descricao)}</strong><small>${esc(p.codigo||p.ean)}${p.ean&&p.codigo&&p.ean!==p.codigo?' · EAN '+esc(p.ean):''}</small></div>
    <div class="orc-result-status">${inativo?'<span class="orc-tag orc-tag-danger">Inativo</span>':p.situacao==='ATIVO'?'<span class="orc-tag orc-tag-active">Ativo</span>':'<span class="orc-tag">Situação não informada</span>'}${incluido?'<span class="orc-tag orc-tag-added">Já no orçamento</span>':''}</div>
    <div class="orc-result-stock"><small>Estoque GZ</small><span>${esc(estoque)}</span></div>
    <div class="orc-result-price">${p.em_promocao?`<small class="orc-old-price">${normal}</small>`:''}<strong class="${p.em_promocao?'orc-offer':''}">${preco}</strong>${p.em_promocao?`<small>Promoção até ${dataBR(p.promocao_ate)}</small>`:''}</div>
    <button data-add="${i}" ${inativo||semPreco?'disabled':''}>${inativo?'Inativo':semPreco?'Sem preço':incluido?'Já adicionado':'Adicionar'}</button>
  </div>`;
 }).join(''):'Nenhum produto encontrado';
 target.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>adicionar(results[Number(x.dataset.add)]));
}
async function pesquisar(){let s=$('orcBusca').value.trim();if(s.length<2){aviso('Digite pelo menos 2 caracteres',true);return}const b=$('orcPesquisar');b.disabled=true;aviso('Consultando o GZ...');try{results=(await req('/api/orcamentos/produtos?busca='+encodeURIComponent(s))).produtos||[];exibirResultados();aviso(results.length+' produto(s) encontrado(s)')}catch(e){results=[];exibirResultados();aviso(e.message,true)}finally{b.disabled=false}}
function adicionar(p){
 if(p.situacao==='INATIVO'){aviso('Produto inativo: não pode ser adicionado.',true);return}
 if(!p.preco_disponivel){aviso('Produto sem preço de terminal disponível.',true);return}
 if(jaIncluido(p)){aviso('Este produto já está no orçamento. Altere a quantidade na lista abaixo.',true);exibirResultados();return}
 itens.push({...p,quantidade:1,desconto_tipo:'nenhum',desconto_valor:0});mostrarItens();
 results=[];exibirResultados();const busca=$('orcBusca');if(busca){busca.value='';busca.focus()}
 aviso('Produto adicionado ao orçamento.');
}
function mostrarItens(){
 const root=$('orcItens');if(!root)return;
 $('orcQtd').textContent='('+itens.length+')';
 root.innerHTML=itens.length?itens.map((x,i)=>{
  const subtotal=Math.round(x.preco_centavos*x.quantidade);
  const desc=Math.min(subtotal,Math.max(0,desconto(x.desconto_tipo,x.desconto_valor,subtotal)));
  return `<div class="orc-item orc-item-v3">
   <div class="orc-item-name"><strong>${esc(x.descricao)}</strong><small>${esc(x.codigo||x.ean)}</small></div>
   <label>Qtd.<input type="number" min="0.001" step="1" value="${x.quantidade}" data-i="${i}" data-f="quantidade"></label>
   <div class="orc-item-value"><small>Unitário</small><strong>${reais(x.preco_centavos)}</strong></div>
   <div class="orc-item-value"><small>Subtotal</small><strong>${reais(subtotal)}</strong></div>
   <label>Desconto<select data-i="${i}" data-f="desconto_tipo"><option value="nenhum" ${x.desconto_tipo==='nenhum'?'selected':''}>Sem desconto</option><option value="percentual" ${x.desconto_tipo==='percentual'?'selected':''}>%</option><option value="valor" ${x.desconto_tipo==='valor'?'selected':''}>R$</option></select></label>
   <label>Valor<input type="number" min="0" step="0.01" value="${x.desconto_valor}" data-i="${i}" data-f="desconto_valor"></label>
   <div class="orc-item-value"><small>Total do item</small><strong class="orc-item-final">${reais(subtotal-desc)}</strong></div>
   <button title="Remover" data-remove="${i}">×</button></div>`;
 }).join(''):'Nenhum produto adicionado.';
 root.querySelectorAll('[data-f]').forEach(el=>{
  el.onchange=()=>{const i=Number(el.dataset.i),f=el.dataset.f;itens[i][f]=f==='desconto_tipo'?el.value:Number(el.value);mostrarItens()};
 });
 root.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{itens.splice(Number(el.dataset.remove),1);mostrarItens();exibirResultados()});
 totais();
}
function totais(){const x=calcular();if($('orcTotais'))$('orcTotais').innerHTML=`<span>Subtotal: <b>${reais(x.sub)}</b></span><span>Desconto nos itens: <b>− ${reais(x.disc)}</b></span><span>Desconto geral: <b>− ${reais(x.geral)}</b></span><strong>TOTAL: ${reais(x.total)}</strong>`}
async function salvar(){
 if(!itens.length){aviso('Adicione produtos.',true);return}
 if(!$('orcCliente').value.trim()){aviso('Informe o cliente.',true);return}
 if($('orcTipoDest').value==='EMPRESA'&&!$('orcDocumento').value.trim()){aviso('Informe o CNPJ da empresa.',true);return}
 const b=$('orcSalvar');b.disabled=true;aviso('Validando e salvando orçamento...');
 try{
  const payload={tipo_destinatario:$('orcTipoDest').value,documento_cliente:$('orcDocumento').value,endereco_cliente:$('orcEndereco').value,cliente:$('orcCliente').value,contato:$('orcContato').value,validade:$('orcValidade').value||null,observacoes:$('orcObs').value,desconto:{tipo:$('orcTipoGeral').value,valor:Number($('orcDescontoGeral').value)||0},itens};
  await req(editando?'/api/orcamentos/'+editando:'/api/orcamentos',{method:editando?'PUT':'POST',body:JSON.stringify(payload)});
  editando=null;itens=[];tab='historico';render();aviso('Orçamento salvo. Consulte o histórico para emitir o PDF ou CSV.');
 }catch(e){aviso(e.message,true)}finally{b.disabled=false}
}
async function editar(id){
 try{
  const data=await req('/api/orcamentos/'+id),o=data.orcamento;
  if(o.status==='CANCELADO'){aviso('Orçamento cancelado não pode ser editado.',true);return}
  editando=Number(id);itens=data.itens.map(x=>({...x,quantidade:Number(x.quantidade),preco_centavos:Number(x.preco_centavos),desconto_valor:Number(x.desconto_valor),preco_disponivel:true}));
  tab='novo';render();
  $('orcEditBadge').textContent='— Editando '+o.numero;
  $('orcTipoDest').value=o.tipo_destinatario||'CLIENTE';$('orcDocumento').value=o.documento_cliente||'';$('orcEndereco').value=o.endereco_cliente||'';
  $('orcCliente').value=o.cliente||'';$('orcContato').value=o.contato||'';$('orcValidade').value=o.validade_em?String(o.validade_em).slice(0,10):'';
  $('orcObs').value=o.observacoes||'';$('orcTipoGeral').value=o.desconto_tipo||'nenhum';$('orcDescontoGeral').value=o.desconto_valor||0;
  $('orcSalvar').textContent='Salvar alterações';mostrarItens();window.scrollTo({top:0,behavior:'smooth'});
 }catch(e){aviso(e.message,true)}
}
async function cancelar(id){
 const motivo=prompt('Informe o motivo do cancelamento do orçamento:');if(motivo===null)return;
 if(motivo.trim().length<5){aviso('Informe um motivo com pelo menos 5 caracteres.',true);return}
 if(!confirm('Cancelar este orçamento? Ele será preservado no histórico para auditoria.'))return;
 try{await req('/api/orcamentos/'+id,{method:'DELETE',body:JSON.stringify({motivo})});await listar();aviso('Orçamento cancelado. Os dados foram preservados.')}
 catch(e){aviso(e.message,true)}
}
async function download(url,name){try{const r=await fetch(url,{headers:{Authorization:'Bearer '+state.token}});if(!r.ok)throw Error('Não foi possível gerar o documento');const blob=await r.blob(),a=document.createElement('a'),href=URL.createObjectURL(blob);a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),3000)}catch(e){aviso(e.message,true)}}
async function listar(){
 const c=$('orcConteudo');c.innerHTML='<section class="orc-card">Carregando histórico...</section>';
 try{
  historico=(await req('/api/orcamentos')).orcamentos;
  c.innerHTML=`<section class="orc-card"><h3>Últimos orçamentos</h3>${historico.length?historico.map(o=>`<div class="orc-history"><div><strong>${esc(o.numero)}</strong> — ${esc(o.cliente)}<small>${new Date(o.criado_em).toLocaleDateString('pt-BR')} · ${esc(o.status)} · ${o.tipo_destinatario==='EMPRESA'?'Empresa':'Cliente'}</small></div><strong>${reais(o.total_centavos)}</strong><button data-pdf="${o.id}">PDF</button><button data-csv="${o.id}">Excel (CSV)</button>${o.status!=='CANCELADO'?`<button data-edit="${o.id}">Editar</button><button class="orc-danger" data-cancel="${o.id}">Cancelar</button>`:''}</div>`).join(''):'Nenhum orçamento emitido.'}</section>`;
  c.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>download('/api/orcamentos/'+b.dataset.pdf+'/pdf','orcamento-'+b.dataset.pdf+'.pdf'));
  c.querySelectorAll('[data-csv]').forEach(b=>b.onclick=()=>download('/api/orcamentos/'+b.dataset.csv+'/csv','orcamento-'+b.dataset.csv+'.csv'));
  c.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editar(b.dataset.edit));
  c.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelar(b.dataset.cancel));
 }catch(e){aviso(e.message,true)}
}
window.addEventListener('hashchange',()=>{if(location.hash==='#orcamentos')window.abrirOrcamentos()});
})();
