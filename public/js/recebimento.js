/* Plataforma Manaíra V67: Recebimento → CPD */
(() => {
  let tab='notas',notaAtual=null, retornoFoco=null;
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
    el().innerHTML=`<div class="rec-top"><div><h2>Recebimento e CPD</h2><p class="rec-muted">Controle de notas físicas e recebidas por mensagem · V67</p></div><button class="rec-btn secondary" id="recRefresh">↻ Atualizar</button></div><nav class="rec-tabs"><button class="rec-btn ${tab==='notas'?'':'secondary'}" data-rec-tab="notas">Notas fiscais</button><button class="rec-btn ${tab==='nova'?'':'secondary'}" data-rec-tab="nova">+ Nova nota</button><button class="rec-btn ${tab==='caminhoes'?'':'secondary'}" data-rec-tab="caminhoes">Caminhões</button><button class="rec-btn ${tab==='cpd'?'':'secondary'}" data-rec-tab="cpd">CPD / PIN</button></nav><div id="recAviso" aria-live="polite"></div><div id="recBody"></div>`;
    document.querySelectorAll('[data-rec-tab]').forEach(b=>b.onclick=()=>{fecharDetalhe();tab=b.dataset.recTab;render()});
    document.getElementById('recRefresh').onclick=render;
    try{if(tab==='notas')await notas();if(tab==='nova')nova();if(tab==='caminhoes')await caminhoes();if(tab==='cpd')await cpd()}catch(err){aviso(err.message,true)}
  }
  async function notas(){
    const [resumo,lista]=await Promise.all([api('/api/recebimento/resumo'),api('/api/recebimento/notas')]);
    const k=resumo.notas;document.getElementById('recBody').innerHTML=`<div class="rec-grid">${[['Notas hoje',k.total],['Aguardando CPD',k.aguardando],['Pendentes de cadastro',k.cadastro],['Lançadas hoje',k.lancadas]].map(x=>`<div class="rec-card"><div class="rec-muted">${x[0]}</div><div class="rec-kpi">${x[1]}</div></div>`).join('')}</div><div class="rec-card"><div class="rec-top"><h3>Notas registradas</h3><input class="rec-filter" id="recBusca" placeholder="Filtrar fornecedor ou número" style="max-width:280px"></div><div class="rec-table-wrap"><table class="rec-table"><thead><tr><th>Recebida em</th><th>Fornecedor</th><th>Nota</th><th>Valor</th><th>CPD</th><th>Status</th><th></th></tr></thead><tbody id="recLinhas"></tbody></table></div></div>`;
    const linhas=()=>{const term=document.getElementById('recBusca').value.toLowerCase();document.getElementById('recLinhas').innerHTML=lista.filter(n=>`${n.fornecedor} ${n.numero}`.toLowerCase().includes(term)).map(n=>`<tr><td data-label="Recebida em">${data(n.recebido_em)}</td><td data-label="Fornecedor">${e(n.fornecedor)}</td><td data-label="Nota">${e(n.numero)}</td><td data-label="Valor">${moeda(n.valor)}</td><td data-label="CPD">${n.cpd_recebido_em?data(n.cpd_recebido_em):'Aguardando'}</td><td data-label="Status"><span class="rec-status ${e(n.status)}">${e(({NAO_RECEBIDA_CPD:'Não recebido',RECEBIDA_CPD:'Recebido CPD',PRODUTOS_CADASTRAR:'Produtos para cadastrar',DIVERGENCIA:'Divergência',LANCADA:'Recebida e lançada'})[n.status]||n.status)}</span></td><td class="rec-list-action"><button class="rec-btn secondary" data-nota="${n.id}">Abrir</button></td></tr>`).join('')||'<tr><td colspan="7">Nenhuma nota encontrada</td></tr>';document.querySelectorAll('[data-nota]').forEach(b=>b.onclick=async()=>{
      const selecionada=lista.find(n=>String(n.id)===String(b.dataset.nota));
      if(!selecionada){aviso('Nota não encontrada na lista. Atualize a página.',true);return;}
      retornoFoco=b;
      b.disabled=true;
      const textoAnterior=b.textContent;
      b.textContent='Abrindo...';
      try{
        await detalhe(selecionada);
        // A janela modal permanece sobre a listagem, sem rolar a pagina.
      }catch(err){
        console.error('Falha ao abrir nota do Recebimento:',err);
        aviso('Não foi possível abrir a nota: '+(err?.message||'erro desconhecido'),true);
      }finally{b.disabled=false;b.textContent=textoAnterior;}
    })};
    document.getElementById('recBusca').oninput=linhas;linhas();if(notaAtual){const n=lista.find(n=>String(n.id)===String(notaAtual));if(n)await detalhe(n);else fecharDetalhe()}
  }
  async function detalhe(n){if(!n)throw new Error('Nota não encontrada');notaAtual=n.id;const eventos=await api(`/api/recebimento/notas/${n.id}/eventos`),anexos=await api(`/api/recebimento/notas/${n.id}/anexos`),perfil=await api('/api/recebimento/cpd/perfil');
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
