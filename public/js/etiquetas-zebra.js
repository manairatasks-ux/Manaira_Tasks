/* Manaíra Board V74.23 - impressão Zebra por estação do operador */
(() => {
  'use strict';
  const KEY = 'mb_zebra_cfg_v7420';
  const HIST = 'mb_zebra_hist_v7420';
  const defaultCfg = {printer:'',token:'',auto:true,width:105,height:30,x:0,y:0,copies:1};
  let cfg = {...defaultCfg, ...read(KEY,{})};
  // Atualiza as dimensões antigas do protótipo sem perder a impressora, token, ajustes ou cópias.
  if (Number(cfg.width) === 110 && Number(cfg.height) === 35) {
    cfg.width = 105;
    cfg.height = 30;
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {}
  }
  let busy=false, current=null, lastCode='', lastAt=0;
  const el=id=>document.getElementById(id);
  const safe=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function read(k,fb){try{return JSON.parse(localStorage.getItem(k))||fb;}catch{return fb;}}
  function save(){localStorage.setItem(KEY,JSON.stringify(cfg));}
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function moneyNoSymbol(v){return money(v).replace('R$','').trim();}
  const cssNum=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
  function activeOffer(p){return typeof cartazTemOferta === 'function' && cartazTemOferta(p);}
  function describe(p){return String(p?.descricao||p?.descpdv||'PRODUTO SEM DESCRIÇÃO').trim();}
  function barcode(p,typed){return String(p?.codigoEan||p?.ean||p?.codigoBarras||typed||'').replace(/\D/g,'');}
  function compactText(text,max=36){
    const cleaned = String(text || '').toUpperCase().replace(/\s+/g,' ').trim();
    return cleaned.length>max ? cleaned.slice(0,max-1).trimEnd()+'…' : cleaned;
  }
  async function bridge(path, method='GET', data){
    if(!cfg.token.trim())throw Error('Informe o código de pareamento exibido no agente de impressão.');
    let resp;
    try {resp=await fetch('http://127.0.0.1:18719'+path,{method,headers:{'X-Manaira-Print-Token':cfg.token.trim(), ...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(7000)});}
    catch(e){throw Error('Agente local indisponível. Execute INICIAR-IMPRESSAO-ZEBRA.bat neste computador. '+e.message);}
    const json=await resp.json().catch(()=>({}));
    if(!resp.ok)throw Error(json.error||'Falha na comunicação com a impressora.');
    return json;
  }
  function status(message,isError=false){const n=el('zebraStatus');if(n){n.textContent=message;n.className='zebra-status '+(isError?'error':'');}}
  function keepInputs(){for(const [id,key] of [['zebraToken','token'],['zebraPrinter','printer'],['zebraWidth','width'],['zebraHeight','height'],['zebraX','x'],['zebraY','y'],['zebraCopies','copies']]){if(el(id))cfg[key]=['token','printer'].includes(key)?el(id).value:cssNum(el(id).value,cfg[key]);}cfg.auto=!!el('zebraAuto')?.checked; save();}
  function lastHistory(){return read(HIST,[]).slice(0,20);}
  function renderHistory(){const n=el('zebraHistory');if(!n)return;const h=lastHistory();n.innerHTML=h.length?h.map(i=>`<div><b>${safe(i.date)}</b> · ${safe(i.desc)} · ${safe(i.mode)} · ${safe(i.price)} · ${i.copies} etiqueta(s) · ${safe(i.printer)}</div>`).join(''):'Nenhuma impressão enviada por este navegador.';}
  function renderProduct(){
    const n=el('zebraProduct');if(!n)return;
    if(!current){n.innerHTML='<p>Leia um código de barras para consultar o GZ.</p>';return;}
    const {p,code}=current, promo=activeOffer(p), normal=cssNum(p.precoVenda,0), price=promo?cssNum(cartazPrecoOferta(p),0):normal;
    const labelName=describe(p).toUpperCase().replace(/\s+/g,' ').trim();
    const ean=barcode(p,code);
    const priceText=moneyNoSymbol(price);
    const nameClass=labelName.length>45?'zebra-name-mini':labelName.length>32?'zebra-name-small':'';
    n.innerHTML=`<div class="zebra-preview-wrap">
      <div class="zebra-label ${promo?'promo':'normal'}">
        <span class="zebra-cut"></span>
        <div class="zebra-name ${nameClass}" title="${safe(labelName)}">${safe(labelName)}</div>
        <div class="zebra-bar"><div class="zebra-bars"></div><div class="zebra-ean">${safe(ean)}</div></div>
        ${promo?`<div class="zebra-from">De: <b>${safe(moneyNoSymbol(normal))}</b></div><div class="zebra-por">Por:</div>`:`<div class="zebra-currency">R$</div>`}
        <div class="zebra-big-price">${safe(priceText)}</div>
        <div class="zebra-logo-preview"><img src="/img/favicon.png" alt=""/><span>SUPERMERCADO</span><strong>MANAÍRA</strong></div>
      </div>
    </div>
    <p class="zebra-meta">${promo?'PROMOCIONAL · detectada automaticamente':'PREÇO NORMAL'} · ${money(price)} · EAN ${safe(ean)}</p>
    <button class="primary" id="zebraManualPrint" type="button">Imprimir esta etiqueta</button>`;
    el('zebraManualPrint').onclick=()=>printCurrent();
  }
  function focus(){el('zebraScan')?.focus();}
  async function fetchPrinters(){keepInputs();status('Consultando impressoras deste computador...');try{const r=await bridge('/printers');const sel=el('zebraPrinter');const selected=cfg.printer;sel.innerHTML='<option value="">Selecione uma impressora</option>'+r.printers.map(name=>`<option value="${safe(name)}">${safe(name)}</option>`).join('');sel.value=r.printers.includes(selected)?selected:'';cfg.printer=sel.value;save();status(r.printers.length+' impressora(s) encontrada(s) no Windows.');}catch(e){status(e.message,true);}focus();}
  async function printCurrent(){if(!current||busy)return;keepInputs();if(!cfg.printer)return status('Selecione a impressora do Windows antes de imprimir.',true);
    const p=current.p, promo=activeOffer(p), normal=cssNum(p.precoVenda,0), price=promo?cssNum(cartazPrecoOferta(p),0):normal;
    if(!(normal>0)||!(price>0))return status('Preço GZ inválido: impressão bloqueada.',true);
    if(cfg.width<55||cfg.width>150||cfg.height<20||cfg.height>90||cfg.copies<1||cfg.copies>100)return status('Confira largura, altura e quantidade (1–100).',true);
    busy=true;status('Enviando etiqueta para '+cfg.printer+'...');
    try{const r=await bridge('/print','POST',{printer:cfg.printer,product:{description:describe(p),ean:barcode(p,current.code),normal,price,promo},settings:{width:cfg.width,height:cfg.height,x:cfg.x,y:cfg.y,copies:cfg.copies}});
      const h=lastHistory();h.unshift({date:new Date().toLocaleString('pt-BR'),desc:describe(p),mode:promo?'PROMO':'NORMAL',price:money(price),copies:cfg.copies,printer:cfg.printer,job:r.job});localStorage.setItem(HIST,JSON.stringify(h.slice(0,100)));renderHistory();status('Etiqueta enviada ao spooler do Windows (tarefa '+r.job+'). Confirme a saída física na Zebra.');
    }catch(e){status(e.message,true);}finally{busy=false;focus();}
  }
  async function scan(e){e?.preventDefault();if(busy)return;const input=el('zebraScan');const code=input?.value.trim()||'';if(!code)return;
    input.value='';if(code===lastCode&&Date.now()-lastAt<1200){status('Leitura duplicada ignorada.');return;}lastCode=code;lastAt=Date.now();status('Consultando código '+code+' no GZ...');
    try{const r=await api('/api/cartazes/consulta?'+new URLSearchParams({codigoBarras:code}));const items=Array.isArray(r.produtos)?r.produtos:[];
      if(items.length!==1){current=null;renderProduct();return status(items.length?'Consulta retornou vários produtos; impressão bloqueada para evitar preço incorreto.':'Produto não encontrado no GZ. Nenhuma etiqueta foi impressa.',true);}
      current={p:items[0],code};renderProduct();if(cfg.auto)await printCurrent();else status('Produto encontrado. Confira o preço e clique em Imprimir.');
    }catch(e){current=null;renderProduct();status('Erro na consulta GZ: '+e.message,true);}finally{focus();}
  }
  window.renderEtiquetasZebra=function(){const panel=el('cartazesPanel');if(!panel)return;
    panel.innerHTML=`<div class="zebra-shell"><header class="zebra-head"><div><h2>Etiquetas Zebra · impressão por bipagem</h2><p>Consulta os preços no GZ, reconhece promoções ativas e imprime no Windows deste usuário.</p></div><span>V74.23 TESTE</span></header>
    <div class="zebra-grid"><section class="zebra-card"><h3>1. Leitura do produto</h3><form id="zebraForm"><label>EAN / Código de barras</label><div class="zebra-row"><input id="zebraScan" inputmode="numeric" autocomplete="off" placeholder="Bipe o produto e pressione Enter" autofocus/><button class="primary" type="submit">Consultar</button></div></form><label class="zebra-check"><input type="checkbox" id="zebraAuto" ${cfg.auto?'checked':''}/> Imprimir automaticamente após cada bipagem válida</label><div id="zebraStatus" class="zebra-status">Configure a impressora e faça uma impressão de teste.</div><div id="zebraProduct"></div></section>
    <section class="zebra-card"><h3>2. Impressora deste computador</h3><label>Código do agente local (pareamento)</label><input type="password" id="zebraToken" autocomplete="off" value="${safe(cfg.token)}" placeholder="Copie o código exibido no agente"/><label>Impressora Windows</label><div class="zebra-row"><select id="zebraPrinter"><option value="${safe(cfg.printer)}">${safe(cfg.printer||'Clique em Buscar impressoras')}</option></select><button id="zebraReload" type="button">Buscar impressoras</button></div><p class="zebra-help">A seleção fica salva neste navegador. É necessário executar o agente local no Windows de cada operador.</p><div class="zebra-dims"><label>Largura (mm)<input id="zebraWidth" type="number" min="55" max="150" value="${cfg.width}"></label><label>Altura (mm)<input id="zebraHeight" type="number" min="20" max="90" value="${cfg.height}"></label><label>Ajuste X (mm)<input id="zebraX" type="number" min="-20" max="20" value="${cfg.x}"></label><label>Ajuste Y (mm)<input id="zebraY" type="number" min="-20" max="20" value="${cfg.y}"></label><label>Cópias por bipagem<input id="zebraCopies" type="number" min="1" max="100" value="${cfg.copies}"></label></div><p class="zebra-help">Medida física confirmada: 105 × 30 mm (proporção 3,5:1). A área da logo continua reservada porque o material já é pré-impresso.</p><button type="button" id="zebraSave">Salvar configuração</button></section></div>
    <section class="zebra-card"><h3>Últimas impressões deste navegador</h3><div id="zebraHistory" class="zebra-history"></div></section></div>`;
    el('zebraForm').onsubmit=scan;el('zebraReload').onclick=fetchPrinters;el('zebraSave').onclick=()=>{keepInputs();status('Configuração salva neste navegador.');focus();};
    ['zebraPrinter','zebraAuto','zebraCopies','zebraWidth','zebraHeight','zebraX','zebraY'].forEach(id=>el(id).addEventListener('change',keepInputs));
    renderProduct();renderHistory();setTimeout(focus,50);
  };
})();
