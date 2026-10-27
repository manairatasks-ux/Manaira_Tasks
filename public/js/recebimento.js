/* Plataforma Manaíra V67: Recebimento → CPD */
(() => {
  let tab='notas',notaAtual=null, retornoFoco=null;
  const painelFiltro={modo:'hoje',inicio:null,fim:null,busca:'',paginas:{recebidas:1,cpd:1,pendencias:1,lancadas:1}};
  const el=()=>document.getElementById('recebimentoPanel');
  const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const data=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):'—';
  const hoje=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const aviso=(m,erro=false)=>{const x=document.getElementById('recAviso');if(x){x.textContent=m;x.style.color=erro?'#ad3030':'#176a4e'}};
  function fecharDetalhe(){
    notaAtual=null;
    const modal=document.getElementById('recModal');
    if(modal)modal.remove();
    document.body.classList.remove('rec-modal-open');
    document.removeEventListener('keydown',teclaModal);
    if(retornoFoco?.isConnected)retornoFoco.focus();
    retornoFoco=null;
  }
  function teclaModal(ev){
    if(ev.key==='Escape'){ev.preventDefault();fecharDetalhe();return;}
    if(ev.key!=='Tab')return;
    const modal=document.getElementById('recModal');
    if(!modal)return;
    const focaveis=[...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter(x=>x.getClientRects().length);
    if(!focaveis.length)return;
    const primeiro=focaveis[0],ultimo=focaveis[focaveis.length-1];
    if(ev.shiftKey&&document.activeElement===primeiro){ev.preventDefault();ultimo.focus();}
    else if(!ev.shiftKey&&document.activeElement===ultimo){ev.preventDefault();primeiro.focus();}
  }
  function montarModal(){
    let modal=document.getElementById('recModal');
    if(!modal){
      modal=document.createElement('div');modal.id='recModal';modal.className='rec-modal-overlay';
      modal.innerHTML=`<section class="rec-modal" role="dialog" aria-modal="true" aria-labelledby="recModalTitulo"><div class="rec-modal-head"><strong id="recModalTitulo">Detalhes da nota fiscal</strong><button type="button" class="rec-modal-close" aria-label="Fechar detalhes">×</button></div><div class="rec-modal-content" id="recDetalhe"></div></section>`;
      document.body.appendChild(modal);
      modal.querySelector('.rec-modal-close').onclick=fecharDetalhe;
      modal.addEventListener('click',ev=>{if(ev.target===modal)fecharDetalhe()});
      document.addEventListener('keydown',teclaModal);
      document.body.classList.add('rec-modal-open');
      modal.querySelector('.rec-modal-close').focus();
    }
    return modal.querySelector('#recDetalhe');
  }
  const campo=(label,name,type='text',value='',extra='')=>`<div><label>${label}</label><input name="${name}" type="${type}" value="${e(value)}" ${extra} required></div>`;
  window.addEventListener('hashchange',()=>{if(location.hash!=='#recebimento')fecharDetalhe()});
  window.abrirRecebimento=async()=>{
    if(!exigirModulo('recebimento_cpd','Recebimento e CPD'))return;
    setModule('recebimento');setView('recebimento');history.replaceState(null,'','#recebimento');
    await render();
  };
  async function render(){
    if(!el())return;
    el().innerHTML=`<div class="rec-top"><div><h2>Recebimento e CPD</h2><p class="rec-muted">Controle de notas físicas e recebidas por mensagem · V67.6</p></div><button class="rec-btn secondary" id="recRefresh">↻ Atualizar</button></div><nav class="rec-tabs"><button class="rec-btn ${tab==='notas'?'':'secondary'}" data-rec-tab="notas">Notas fiscais</button><button class="rec-btn ${tab==='nova'?'':'secondary'}" data-rec-tab="nova">+ Nova nota</button><button class="rec-btn ${tab==='caminhoes'?'':'secondary'}" data-rec-tab="caminhoes">Caminhões</button><button class="rec-btn ${tab==='cpd'?'':'secondary'}" data-rec-tab="cpd">CPD / PIN</button></nav><div id="recAviso" aria-live="polite"></div><div id="recBody"></div>`;
    document.querySelectorAll('[data-rec-tab]').forEach(b=>b.onclick=()=>{fecharDetalhe();tab=b.dataset.recTab;render()});
    document.getElementById('recRefresh').onclick=render;
    try{if(tab==='notas')await notas();if(tab==='nova')nova();if(tab==='caminhoes')await caminhoes();if(tab==='cpd')await cpd()}catch(err){aviso(err.message,true)}
  }
  async function notas(){
    const hojeLocal=hoje();
    if(painelFiltro.modo==='hoje'){painelFiltro.inicio=hojeLocal;painelFiltro.fim=hojeLocal;}
    if(!painelFiltro.inicio){painelFiltro.inicio=hojeLocal;painelFiltro.fim=hojeLocal;}
    const qs=new URLSearchParams({inicio:painelFiltro.inicio,fim:painelFiltro.fim,busca:painelFiltro.busca});
    Object.entries(painelFiltro.paginas).forEach(([chave,pagina])=>qs.set('pagina_'+chave,String(pagina)));
    const area=document.getElementById('recBody');if(area&&!area.querySelector('.rec-board'))area.innerHTML='<div class="rec-card" role="status" aria-live="polite">Carregando quadro de notas...</div>';
    const painel=await api('/api/recebimento/notas/painel?'+qs.toString());
    const definicoes=[
      {id:'recebidas',titulo:'1. Recebidas',sub:'Recebimento · aguardando subir ao CPD',classe:'rec-stage-recebidas'},
      {id:'cpd',titulo:'2. No CPD',sub:'Recebidas pela Cibele · aguardando lançamento',classe:'rec-stage-cpd'},
      {id:'pendencias',titulo:'3. Pendências',sub:'Produtos para cadastrar ou divergências',classe:'rec-stage-pendencias'},
      {id:'lancadas',titulo:'4. Lançadas',sub:'Notas finalizadas pelo CPD',classe:'rec-stage-lancadas'}
    ];
    const rotuloStatus={NAO_RECEBIDA_CPD:'Recebida no mercado',RECEBIDA_CPD:'No CPD',PRODUTOS_CADASTRAR:'Cadastro de produtos',DIVERGENCIA:'Divergência',LANCADA:'Lançada'};
    const total=definicoes.reduce((s,g)=>s+(painel.grupos[g.id]?.total||0),0);
    const cardNota=n=>`<article class="rec-board-note"><div class="rec-board-note-top"><strong>${e(n.fornecedor)}</strong><span class="rec-board-note-num">NF ${e(n.numero)}</span></div><div class="rec-board-note-value">${moeda(n.valor)}</div><div class="rec-board-note-meta"><span>📅 ${data(n.recebido_em)}</span><span>${n.origem==='PAPEL'?'📄 Papel':'📱 Mensagem'}</span></div><div class="rec-board-note-status"><span class="rec-status ${e(n.status)}">${e(rotuloStatus[n.status]||n.status)}</span></div><button type="button" class="rec-btn secondary rec-board-open" data-nota="${Number(n.id)}">Abrir nota</button></article>`;
    document.getElementById('recBody').innerHTML=`
      <section class="rec-card rec-board-filters" aria-label="Filtros das notas fiscais">
        <div class="rec-top"><div><h3>Quadro de notas fiscais</h3><p class="rec-muted">${total} nota(s) no período selecionado · cada coluna mostra até ${painel.limite} notas por página.</p></div></div>
        <div class="rec-board-filter-line">
          <div><label for="recPeriodoModo">Visualização</label><select id="recPeriodoModo" class="rec-filter"><option value="hoje" ${painelFiltro.modo==='hoje'?'selected':''}>Hoje</option><option value="periodo" ${painelFiltro.modo==='periodo'?'selected':''}>Selecionar período</option></select></div>
          <div><label for="recDataInicio">De</label><input id="recDataInicio" type="date" class="rec-filter" value="${e(painelFiltro.inicio)}" ${painelFiltro.modo==='hoje'?'disabled':''}></div>
          <div><label for="recDataFim">Até</label><input id="recDataFim" type="date" class="rec-filter" value="${e(painelFiltro.fim)}" ${painelFiltro.modo==='hoje'?'disabled':''}></div>
          <div class="rec-board-search"><label for="recBusca">Fornecedor, código ou nota</label><input id="recBusca" class="rec-filter" placeholder="Pesquisar..." value="${e(painelFiltro.busca)}"></div>
          <button type="button" class="rec-btn" id="recAplicarFiltro">Aplicar filtros</button>
        </div>
      </section>
      <div class="rec-board" aria-label="Notas agrupadas por etapa">${definicoes.map(grupo=>{
        const d=painel.grupos[grupo.id]||{total:0,pagina:1,paginas:1,itens:[]};
        painelFiltro.paginas[grupo.id]=d.pagina;
        return `<section class="rec-board-col ${grupo.classe}" aria-labelledby="rec-title-${grupo.id}">
          <div class="rec-board-col-head"><h3 id="rec-title-${grupo.id}">${grupo.titulo} <span class="rec-board-count">${d.total}</span></h3><p>${grupo.sub}</p></div>
          <div class="rec-board-items">${d.itens.length?d.itens.map(cardNota).join(''):'<div class="rec-board-empty">Nenhuma nota neste grupo para o período selecionado.</div>'}</div>
          <div class="rec-board-pager"><button class="rec-btn secondary" data-rec-page="${grupo.id}" data-rec-delta="-1" ${d.pagina<=1?'disabled':''} aria-label="Página anterior em ${grupo.titulo}">Anterior</button><span>${d.pagina} / ${d.paginas}</span><button class="rec-btn secondary" data-rec-page="${grupo.id}" data-rec-delta="1" ${d.pagina>=d.paginas?'disabled':''} aria-label="Próxima página em ${grupo.titulo}">Próxima</button></div>
        </section>`;
      }).join('')}</div>`;
    const resetPaginas=()=>{Object.keys(painelFiltro.paginas).forEach(k=>painelFiltro.paginas[k]=1)};
    const filtrar=async()=>{
      const modo=document.getElementById('recPeriodoModo').value;
      const inicio=document.getElementById('recDataInicio').value;
      const fim=document.getElementById('recDataFim').value;
      if(modo==='periodo'&&(!inicio||!fim||inicio>fim)){aviso('Escolha um período válido: data inicial igual ou anterior à final.',true);return;}
      painelFiltro.modo=modo;
      painelFiltro.inicio=modo==='hoje'?hoje():inicio;
      painelFiltro.fim=modo==='hoje'?hoje():fim;
      painelFiltro.busca=document.getElementById('recBusca').value.trim();
      resetPaginas();
      try{await notas();aviso('Listagem atualizada.')}catch(err){aviso(err.message,true)}
    };
    document.getElementById('recPeriodoModo').onchange=ev=>{
      const personalizado=ev.target.value==='periodo';
      document.getElementById('recDataInicio').disabled=!personalizado;
      document.getElementById('recDataFim').disabled=!personalizado;
      if(!personalizado){document.getElementById('recDataInicio').value=hoje();document.getElementById('recDataFim').value=hoje();}
    };
    document.getElementById('recAplicarFiltro').onclick=filtrar;
    document.getElementById('recBusca').onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();filtrar()}};
    document.querySelectorAll('[data-rec-page]').forEach(btn=>btn.onclick=async()=>{
      const grupo=btn.dataset.recPage;
      painelFiltro.paginas[grupo]=Math.max(1,painelFiltro.paginas[grupo]+Number(btn.dataset.recDelta));
      try{await notas()}catch(err){aviso(err.message,true)}
    });
    const itens=Object.values(painel.grupos).flatMap(g=>g.itens);
    document.querySelectorAll('.rec-board-open[data-nota]').forEach(btn=>btn.onclick=async()=>{
      const n=itens.find(x=>String(x.id)===btn.dataset.nota);
      if(!n){aviso('Nota não encontrada. Atualize a listagem.',true);return;}
      retornoFoco=btn;btn.disabled=true;const antes=btn.textContent;btn.textContent='Abrindo...';
      try{await detalhe(n)}catch(err){console.error('Falha ao abrir nota:',err);aviso('Não foi possível abrir a nota: '+err.message,true)}finally{btn.disabled=false;btn.textContent=antes}
    });
    if(notaAtual){const n=itens.find(x=>String(x.id)===String(notaAtual));if(n)await detalhe(n);else fecharDetalhe()}
  }
  async function detalhe(n){if(!n)throw new Error('Nota não encontrada');notaAtual=n.id;const [completa,eventos,anexos,perfil]=await Promise.all([api(`/api/recebimento/notas/${n.id}/detalhe`),api(`/api/recebimento/notas/${n.id}/eventos`),api(`/api/recebimento/notas/${n.id}/anexos`),api('/api/recebimento/cpd/perfil')]);n=completa;
    montarModal().innerHTML=`<div class="rec-card"><div class="rec-top"><h3>Nota ${e(n.numero)} · ${e(n.fornecedor)}</h3><span class="rec-status ${e(n.status)}">${e(n.status)}</span></div><p><b>Fornecedor:</b> ${e(n.codigo_fornecedor)} · <b>Valor:</b> ${moeda(n.valor)} · <b>Origem:</b> ${n.origem==='PAPEL'?'Papel':'Mensagem'} · <b>Registrada por:</b> ${e(n.recebido_por_nome)}</p><p><b>CPD:</b> ${e(n.cpd_por_nome||'Ainda não recebido')} · <b>Pendência:</b> ${e(n.pendencia||'Nenhuma')}</p><h4>Duplicatas</h4><div class="rec-table-wrap"><table class="rec-table"><thead><tr><th>Número</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${(Array.isArray(n.duplicatas)?n.duplicatas:[]).map(d=>`<tr><td>${e(d.numero)}</td><td>${e(d.vencimento)}</td><td>${moeda(d.valor)}</td></tr>`).join('')}</tbody></table></div><h4>Anexos</h4><div id="recAnexos">${anexos.map(a=>`<button class="rec-btn secondary" data-anexo="${a.id}">${e(a.nome_original)}</button>`).join(' ')||'<p class="rec-muted">Nenhum anexo.</p>'}</div><div class="rec-upload"><p class="rec-muted">Anexe uma foto legível ou um PDF da nota (até 8 MB por arquivo).</p><div class="rec-upload-actions"><button type="button" class="rec-btn secondary" id="recEscolherArquivo">📁 Escolher arquivo</button><button type="button" class="rec-btn secondary" id="recTirarFoto">📷 Tirar foto</button></div><input type="file" id="recArquivo" accept="image/jpeg,image/png,image/webp,application/pdf" class="rec-file-hidden" tabindex="-1"><input type="file" id="recCamera" accept="image/*" capture="environment" class="rec-file-hidden" tabindex="-1"><div id="recArquivoPreview" class="rec-upload-preview" aria-live="polite" hidden></div><div class="rec-actions"><button type="button" class="rec-btn" id="recEnviarArquivo" disabled>Enviar anexo</button><button type="button" class="rec-btn secondary" id="recLimparArquivo" hidden>Cancelar</button></div><p id="recUploadAviso" class="rec-muted" role="status" aria-live="polite"></p></div>${perfil.autorizado?`<hr><h4>Movimentar nota no CPD</h4><div class="rec-grid"><div><label>Operação</label><select class="rec-filter" id="recAcao">${[['RECEBER_CPD','Confirmar recebimento físico/digital'],['PENDENCIA','Produtos para cadastrar'],['DIVERGENCIA','Informar divergência'],['RESOLVER','Resolver pendência'],['LANCAR','Marcar como lançada']].map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div><div><label>PIN pessoal do CPD</label><input class="rec-filter" type="password" id="recPin" autocomplete="off"></div></div><p><textarea class="rec-filter" id="recObs" placeholder="Motivo ou observação (obrigatório em pendências)"></textarea></p><button class="rec-btn" id="recConfirmar">Confirmar operação</button>`:'<p class="rec-notice">Somente o responsável habilitado pelo administrador pode confirmar ou alterar o status no CPD.</p>'}<h4>Histórico de eventos</h4><div class="rec-table-wrap"><table class="rec-table"><tbody>${eventos.map(x=>`<tr><td>${data(x.criado_em)}</td><td>${e(x.usuario)}</td><td>${e(x.acao)}</td><td>${e(x.detalhes)}</td></tr>`).join('')}</tbody></table></div></div>`;
    document.querySelectorAll('#recModal [data-anexo]').forEach(b=>b.onclick=async()=>{try{const x=await api(`/api/recebimento/anexos/${b.dataset.anexo}/abrir`);window.open(x.url,'_blank','noopener,noreferrer')}catch(err){alert(err.message)}});
    // Arquivo e câmera são entradas diferentes para facilitar o uso no celular.
    // capture="environment" solicita a câmera traseira quando o navegador oferece suporte.
    const seletor=document.getElementById('recArquivo');
    const camera=document.getElementById('recCamera');
    const preview=document.getElementById('recArquivoPreview');
    const uploadAviso=document.getElementById('recUploadAviso');
    const enviar=document.getElementById('recEnviarArquivo');
    const limpar=document.getElementById('recLimparArquivo');
    let arquivoSelecionado=null;
    let urlPreview=null;
    function limparSelecao(){
      if(urlPreview){URL.revokeObjectURL(urlPreview);urlPreview=null;}
      arquivoSelecionado=null;seletor.value='';camera.value='';
      preview.hidden=true;preview.replaceChildren();enviar.disabled=true;limpar.hidden=true;
      uploadAviso.textContent='';
    }
    function selecionarArquivo(file){
      limparSelecao();
      if(!file)return;
      const formatos=['image/jpeg','image/png','image/webp','application/pdf'];
      if(!formatos.includes(file.type)){uploadAviso.textContent='Formato inválido. Use JPG, PNG, WebP ou PDF.';return;}
      if(file.size>8*1024*1024){uploadAviso.textContent='O arquivo excede o limite de 8 MB.';return;}
      arquivoSelecionado=file;
      const titulo=document.createElement('div');titulo.className='rec-preview-name';titulo.textContent=`${file.name||'Foto da câmera'} · ${(file.size/1024/1024).toFixed(2)} MB`;
      preview.appendChild(titulo);
      if(file.type.startsWith('image/')){
        urlPreview=URL.createObjectURL(file);
        const img=document.createElement('img');img.src=urlPreview;img.alt='Prévia da foto selecionada';img.className='rec-preview-image';
        preview.appendChild(img);
      }else{
        const texto=document.createElement('div');texto.textContent='PDF selecionado e pronto para envio.';preview.appendChild(texto);
      }
      preview.hidden=false;enviar.disabled=false;limpar.hidden=false;
      uploadAviso.textContent='Confira se todas as informações da nota estão legíveis.';
    }
    document.getElementById('recEscolherArquivo').onclick=()=>seletor.click();
    document.getElementById('recTirarFoto').onclick=()=>camera.click();
    seletor.onchange=()=>selecionarArquivo(seletor.files[0]);
    camera.onchange=()=>selecionarArquivo(camera.files[0]);
    limpar.onclick=limparSelecao;
    enviar.onclick=async()=>{
      if(!arquivoSelecionado)return;
      const file=arquivoSelecionado;
      enviar.disabled=true;enviar.textContent='Enviando...';uploadAviso.textContent='Enviando anexo, não feche a janela.';
      try{
        const fd=new FormData();fd.append('arquivo',file,file.name||'foto-nota.jpg');
        const r=await fetch(`/api/recebimento/notas/${n.id}/anexos`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:fd});
        const x=await r.json();if(!r.ok)throw Error(x.error||'Erro ao enviar');
        limparSelecao();await notas();aviso('Arquivo enviado com sucesso.');
      }catch(err){uploadAviso.textContent='Falha no envio: '+err.message;enviar.disabled=false;}
      finally{if(enviar.isConnected)enviar.textContent='Enviar anexo';}
    };
    if(perfil.autorizado)document.getElementById('recConfirmar').onclick=async()=>{try{const acao=document.getElementById('recAcao').value,pin=document.getElementById('recPin').value,observacao=document.getElementById('recObs').value;if(!confirm('Confirmar esta operação no histórico da nota?'))return;await api(`/api/recebimento/notas/${n.id}/acao`,{method:'POST',body:JSON.stringify({acao,pin,observacao})});await notas();aviso('Operação registrada com sucesso')}catch(err){alert(err.message)}};
  }
  function nova(){document.getElementById('recBody').innerHTML=`<form id="recNova" class="rec-card"><h3>Nova nota fiscal</h3><div class="rec-grid">${campo('Código fornecedor','codigo_fornecedor')}${campo('Fornecedor','fornecedor')}${campo('Número NF','numero')}<div><label>Série (opcional)</label><input name="serie" placeholder="Opcional"></div>${campo('Valor total (R$)','valor','number','','min="0.01" step="0.01"')}<div><label>Como chegou ao CPD?</label><select name="origem"><option value="PAPEL">Nota física / papel</option><option value="MENSAGEM">Mensagem / digital</option></select></div></div><p><label>Observação</label><textarea class="rec-filter" name="observacao" placeholder="Informações adicionais"></textarea></p><h4>Duplicatas e vencimentos</h4><div id="recDuplicatas"></div><button class="rec-btn secondary" type="button" id="recAddDup">+ Vencimento</button><p class="rec-muted">A soma dos vencimentos deve ser igual ao valor da nota. A data/hora e o responsável são registrados automaticamente.</p><button class="rec-btn" type="submit">Registrar nota fiscal</button></form>`;
    const adicionar=()=>{const div=document.createElement('div');div.className='rec-dup';div.innerHTML=`<input placeholder="Duplicata" aria-label="Duplicata" class="dup-num"><input type="date" aria-label="Vencimento" class="dup-data" required><input type="number" min="0.01" step="0.01" placeholder="Valor" aria-label="Valor" class="dup-valor" required><button type="button" class="rec-btn danger">×</button>`;div.querySelector('button').onclick=()=>div.remove();document.getElementById('recDuplicatas').appendChild(div)};
    document.getElementById('recAddDup').onclick=adicionar;adicionar();
    document.getElementById('recNova').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget,d=Object.fromEntries(new FormData(f).entries());d.duplicatas=[...document.querySelectorAll('.rec-dup')].map(row=>({numero:row.querySelector('.dup-num').value,vencimento:row.querySelector('.dup-data').value,valor:row.querySelector('.dup-valor').value}));try{const n=await api('/api/recebimento/notas',{method:'POST',body:JSON.stringify(d)});notaAtual=n.id;tab='notas';await render();aviso('Nota cadastrada. Abra-a para anexar fotos/PDF.')}catch(err){aviso(err.message,true)}};
  }
  async function caminhoes(){const dia=hoje();document.getElementById('recBody').innerHTML=`<div class="rec-card"><h3>Registro diário de caminhões</h3><p class="rec-muted">Cada caminhão deve ser registrado uma única vez, mesmo trazendo várias notas.</p><form id="recCam"><div class="rec-grid"><div><label>Data</label><input type="date" name="dia" value="${dia}" required></div><div><label>Setor</label><select name="categoria"><option>MERCEARIA</option><option>HORTIFRUTI</option><option>FRIOS</option></select></div>${campo('Quantidade','quantidade','number','1','min="1" max="100"')}${campo('Observação','observacao')}</div><p><button class="rec-btn" type="submit">Registrar caminhão(ões)</button></p></form><div id="recCamLista"></div></div>`;const carregar=async()=>{const dia=document.querySelector('#recCam [name=dia]').value;const dados=await api(`/api/recebimento/caminhoes?dia=${dia}`);document.getElementById('recCamLista').innerHTML=`<h4>Registros de ${e(dia)} · ${dados.reduce((s,x)=>s+Number(x.quantidade),0)} caminhão(ões)</h4><div class="rec-table-wrap"><table class="rec-table"><thead><tr><th>Setor</th><th>Qtde.</th><th>Usuário</th><th>Hora</th><th>Obs.</th></tr></thead><tbody>${dados.map(x=>`<tr><td>${e(x.categoria)}</td><td>${x.quantidade}</td><td>${e(x.registrado_por_nome)}</td><td>${data(x.criado_em)}</td><td>${e(x.observacao)}</td></tr>`).join('')}</tbody></table></div>`};document.querySelector('#recCam [name=dia]').onchange=carregar;document.getElementById('recCam').onsubmit=async ev=>{ev.preventDefault();try{await api('/api/recebimento/caminhoes',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget)))});await carregar();aviso('Caminhão(ões) registrado(s).')}catch(err){aviso(err.message,true)}};await carregar()}
  async function cpd(){const perfil=await api('/api/recebimento/cpd/perfil');let html=`<div class="rec-card"><h3>Permissão CPD</h3><p class="rec-muted">${perfil.autorizado?'Seu usuário está habilitado para confirmar notas mediante PIN.':'Seu usuário não possui autorização para confirmar notas.'}</p><p>O PIN não substitui o login. Cada ação fica associada ao usuário autenticado.</p></div>`;if(perfil.administrador){const users=await api('/api/recebimento/usuarios');html+=`<form class="rec-card" id="recConfigPin"><h3>Configurar responsável autorizado (administrador)</h3><div class="rec-grid"><div><label>Usuário</label><select name="usuario_id">${users.map(u=>`<option value="${u.id}">${e(u.nome)} (${e(u.email)})</option>`).join('')}</select></div><div><label>PIN numérico (6–10 dígitos)</label><input name="pin" type="password" minlength="6" maxlength="10" pattern="[0-9]{6,10}" autocomplete="new-password" required></div></div><p><button class="rec-btn" type="submit">Salvar autorização</button></p></form>`}document.getElementById('recBody').innerHTML=html;if(perfil.administrador)document.getElementById('recConfigPin').onsubmit=async ev=>{ev.preventDefault();try{await api('/api/recebimento/cpd/configurar',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget)))});aviso('PIN e permissão configurados.')}catch(err){aviso(err.message,true)}};
  }
})();
