'use strict';
const router=require('express').Router();
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
const maps=require('./maps.service');
const opt=require('./optimizer');
router.use(auth,requireModuleAccess('manaira_rotas'));
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
function bad(msg,status=400){const e=new Error(msg);e.status=status;throw e}
function s(v,max=300){return String(v??'').trim().slice(0,max)}
function num(v,min,max){const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)bad('Número fora do limite permitido.');return n}
function origin(row){return {lat:Number(row.lat),lon:Number(row.lon)}}
function log(client,entity,id,action,uid,details={}){return client.query('INSERT INTO mr_eventos(entidade,registro_id,evento,usuario_id,detalhes) VALUES($1,$2,$3,$4,$5::jsonb)',[entity,id,action,uid,JSON.stringify(details)])}
function canManage(req){return ['administrador_principal','administrador','gerente','encarregado'].includes(String(req.user.perfil).toLowerCase())}
function canControl(req,trip){return Number(trip.entregador_id)===Number(req.user.id)||['administrador_principal','administrador','gerente','encarregado'].includes(String(req.user.perfil).toLowerCase())}
async function allTrips(){return (await query(`SELECT v.*,u.nome AS entregador_nome,COALESCE((SELECT COUNT(*) FROM mr_paradas p WHERE p.viagem_id=v.id),0)::int AS total,COALESCE((SELECT COUNT(*) FROM mr_paradas p WHERE p.viagem_id=v.id AND p.status='entregue'),0)::int AS entregues,l.lat AS atual_lat,l.lon AS atual_lon,l.atualizado_em AS gps_atualizado_em FROM mr_viagens v LEFT JOIN usuarios u ON u.id=v.entregador_id LEFT JOIN mr_localizacoes l ON l.viagem_id=v.id ORDER BY v.id DESC LIMIT 1000`)).rows}
async function stops(id){return (await query(`SELECT p.*,o.numero,o.cliente,o.cep,o.rua,o.numero_endereco,o.bairro,o.complemento,o.cidade,o.uf,o.lat,o.lon,o.prazo FROM mr_paradas p JOIN mr_pedidos o ON o.id=p.pedido_id WHERE p.viagem_id=$1 ORDER BY p.ordem`,[id])).rows}
router.get('/bootstrap',safe(async(req,res)=>{const [config,pedidos,viagens,usuarios]=await Promise.all([query('SELECT * FROM mr_config WHERE id=1'),query('SELECT * FROM mr_pedidos ORDER BY id DESC LIMIT 1000'),allTrips(),query("SELECT u.id,u.nome FROM usuarios u WHERE u.perfil='administrador_principal' OR EXISTS(SELECT 1 FROM usuario_modulos um JOIN modulos m ON m.id=um.modulo_id WHERE um.usuario_id=u.id AND m.codigo='manaira_rotas') ORDER BY u.nome LIMIT 800")]);res.set('Cache-Control','no-store');res.json({config:config.rows[0],pedidos:pedidos.rows,viagens,usuarios:usuarios.rows,usuario_id:req.user.id,pode_gerenciar:canManage(req),mapas_configurados:maps.hasKey(),provedor_mapa:maps.provider()})}));
router.put('/config',safe(async(req,res)=>{const b=req.body;const address=s(b.endereco_origem,500);if(!address)bad('Informe o endereço completo do supermercado.');let lat=b.lat,lon=b.lon;if(lat===''||lon===''||lat==null||lon==null){if(!maps.hasKey())bad('Configure a chave gratuita GEOAPIFY_API_KEY ou escolha a base pelo mapa.');const g=await maps.geocode({rua:address,numero_endereco:'',cidade:'João Pessoa',uf:'PB'});if(!g.ok)bad(g.reason);lat=g.lat;lon=g.lon}const r=await query('UPDATE mr_config SET nome_origem=$1,endereco_origem=$2,lat=$3,lon=$4,updated_at=NOW() WHERE id=1 RETURNING *',[s(b.nome_origem,120)||'Supermercado Manaíra',address,num(lat,-90,90),num(lon,-180,180)]);await log({query:query},'config',1,'ATUALIZAR',req.user.id);res.json(r.rows[0])}));
router.get('/cep/:cep',safe(async(req,res)=>{const cep=s(req.params.cep).replace(/\D/g,'');if(cep.length!==8)bad('CEP deve ter 8 dígitos.');const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:AbortSignal.timeout(9000)});if(!r.ok)bad('Consulta CEP indisponível.',502);const d=await r.json();if(d.erro)bad('CEP não encontrado.');res.json({rua:d.logradouro,bairro:d.bairro,cidade:d.localidade,uf:d.uf,cep})}));
async function findCoords(o){if(o.lat!==''&&o.lat!=null&&o.lon!==''&&o.lon!=null){return {lat:num(o.lat,-90,90),lon:num(o.lon,-180,180),status:'confirmado'}}if(!maps.hasKey())return {lat:null,lon:null,status:'pendente'};try{const g=await maps.geocode(o);return g.ok?{lat:g.lat,lon:g.lon,status:g.preciso?'automatico':'revisar'}:{lat:null,lon:null,status:'pendente'}}catch(e){console.warn('Geo:',e.message);return {lat:null,lon:null,status:'pendente'}}}
function validateOrder(b){const numero=s(b.numero,80),rua=s(b.rua,250),n=s(b.numero_endereco,30),cep=s(b.cep).replace(/\D/g,'').slice(0,8);if(!numero||!rua||!n)bad('Preencha número do pedido, rua e número do endereço.');if(cep.length!==8)bad('Informe um CEP de oito dígitos.');return {numero,rua,numero_endereco:n,cep,cliente:s(b.cliente,150),bairro:s(b.bairro,120),complemento:s(b.complemento,200),cidade:s(b.cidade,100)||'João Pessoa',uf:s(b.uf,2).toUpperCase()||'PB',observacao:s(b.observacao,1000),prazo:b.prazo||null}}
router.post('/pedidos',safe(async(req,res)=>{const b=validateOrder(req.body);const g=await findCoords({...b,lat:req.body.lat,lon:req.body.lon});const r=await query(`INSERT INTO mr_pedidos(numero,cliente,cep,rua,numero_endereco,bairro,complemento,cidade,uf,observacao,prazo,lat,lon,geo_status,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[b.numero,b.cliente,b.cep,b.rua,b.numero_endereco,b.bairro,b.complemento,b.cidade,b.uf,b.observacao,b.prazo,g.lat,g.lon,g.status,req.user.id]);await log({query},'pedido',r.rows[0].id,'CRIAR',req.user.id);res.status(201).json(r.rows[0])}));
router.post('/pedidos/importar',safe(async(req,res)=>{const input=req.body.pedidos;if(!Array.isArray(input)||input.length===0||input.length>100)bad('Envie entre 1 e 100 pedidos por lote.');const results=[];for(let i=0;i<input.length;i++){try{const b=validateOrder(input[i]);const g=await findCoords({...b,lat:input[i].lat,lon:input[i].lon});const r=await query(`INSERT INTO mr_pedidos(numero,cliente,cep,rua,numero_endereco,bairro,complemento,cidade,uf,observacao,prazo,lat,lon,geo_status,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(numero) DO NOTHING RETURNING id`,[b.numero,b.cliente,b.cep,b.rua,b.numero_endereco,b.bairro,b.complemento,b.cidade,b.uf,b.observacao,b.prazo,g.lat,g.lon,g.status,req.user.id]);results.push({linha:i+1,numero:b.numero,ok:!!r.rowCount,mensagem:r.rowCount?'Cadastrado':'Pedido já cadastrado'});}catch(e){results.push({linha:i+1,ok:false,mensagem:e.message})}}res.json({resultados:results,inseridos:results.filter(x=>x.ok).length})}));
// V72.1 — cadastro rápido por CEP: conserva o pedido como rascunho até confirmar endereço e ponto exato.
router.post('/pedidos/ceps',safe(async(req,res)=>{
 const items=req.body?.itens;
 if(!Array.isArray(items)||!items.length||items.length>40)bad('Informe de 1 a 40 CEPs por envio.');
 const results=[];
 const viaCepCache=new Map();
 for(let offset=0;offset<items.length;offset+=5){
  const batch=await Promise.all(items.slice(offset,offset+5).map(async (item,position)=>{
   const i=offset+position;
   try{
   const cep=s(items[i].cep).replace(/\D/g,'');
   if(cep.length!==8)bad('CEP inválido.');
   if(!viaCepCache.has(cep))viaCepCache.set(cep,(async()=>{const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:AbortSignal.timeout(8000)});if(!response.ok)bad('Consulta de CEP temporariamente indisponível.');return response.json()})());
   const info=await viaCepCache.get(cep);
   if(info.erro)bad('CEP não encontrado.');
   const numeroEndereco=s(items[i].numero_endereco,30),cliente=s(items[i].cliente,150);
   const order={cep,rua:s(info.logradouro,250)||'Logradouro a confirmar',numero_endereco:numeroEndereco,bairro:s(info.bairro,120),cidade:s(info.localidade,100)||'João Pessoa',uf:s(info.uf,2)||'PB'};
   let geo={lat:null,lon:null,status:'pendente'};
   if(maps.hasKey()){
     try{const g=await maps.geocode(order);if(g.ok)geo={lat:g.lat,lon:g.lon,status:'revisar'};}catch(e){console.warn('[Rotas] CEP '+cep+': '+e.message)}
   }
   const numeroPedido=s(items[i].numero,80)||`CEP-${Date.now()}-${i+1}-${require('crypto').randomBytes(3).toString('hex')}`;
   const r=await query(`INSERT INTO mr_pedidos(numero,cliente,cep,rua,numero_endereco,bairro,cidade,uf,lat,lon,geo_status,status,observacao,criado_por)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'preparando',$12,$13) RETURNING *`,
    [numeroPedido,cliente,cep,order.rua,numeroEndereco,order.bairro,order.cidade,order.uf,geo.lat,geo.lon,geo.status,'Entrada rápida por CEP. Confirmar número e localização antes de liberar.',req.user.id]);
   return {linha:i+1,ok:true,pedido:r.rows[0]};
  }catch(e){return {linha:i+1,ok:false,cep:items[i]?.cep,mensagem:e.message}}
  }));
  results.push(...batch);
 }
 res.json({resultados:results,inseridos:results.filter(x=>x.ok).length});
}));
// Completar endereço e/ou confirmar ponto no mapa; sem marcação falsa de precisão.
router.patch('/pedidos/:id/endereco',safe(async(req,res)=>{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const old=(await client.query('SELECT * FROM mr_pedidos WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
  if(!old)bad('Pedido não encontrado.',404);
  if(!['preparando','pronto'].includes(old.status))bad('Não é possível alterar endereço de pedido já despachado.');
  const b=req.body||{},cep=s(b.cep||old.cep).replace(/\D/g,'');
  if(cep.length!==8)bad('Informe CEP válido.');
  const rua=s(b.rua||old.rua,250),numeroEndereco=s(b.numero_endereco,30),bairro=s(b.bairro??old.bairro,120);
  const cidade=s(b.cidade||old.cidade,100),uf=s(b.uf||old.uf,2).toUpperCase();
  if(!rua||!numeroEndereco)bad('Informe rua e número para confirmar a entrega.');
  let lat=null,lon=null,geoStatus='pendente';
  if(b.lat!==''&&b.lat!=null&&b.lon!==''&&b.lon!=null){lat=num(b.lat,-90,90);lon=num(b.lon,-180,180);geoStatus='confirmado'}
  else if(maps.hasKey()){
   const g=await maps.geocode({rua,numero_endereco:numeroEndereco,bairro,cidade,uf,cep});
   if(g.ok){lat=g.lat;lon=g.lon;geoStatus=g.preciso?'automatico':'revisar'}
  }
  const r=await client.query(`UPDATE mr_pedidos SET cep=$1,rua=$2,numero_endereco=$3,bairro=$4,cidade=$5,uf=$6,lat=$7,lon=$8,geo_status=$9,atualizado_em=NOW()
   WHERE id=$10 RETURNING *`,[cep,rua,numeroEndereco,bairro,cidade,uf,lat,lon,geoStatus,old.id]);
  await log(client,'pedido',old.id,'CONFIRMAR_ENDERECO',req.user.id,{anterior:{cep:old.cep,rua:old.rua,numero_endereco:old.numero_endereco},novo:{cep,rua,numero_endereco:numeroEndereco,geo_status:geoStatus}});
  await client.query('COMMIT');res.json(r.rows[0]);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.patch('/pedidos/:id',safe(async(req,res)=>{const b=req.body;const exists=await query('SELECT * FROM mr_pedidos WHERE id=$1',[req.params.id]);if(!exists.rowCount)bad('Pedido não encontrado.',404);const old=exists.rows[0];if(old.status==='em_rota'||old.status==='entregue')bad('Pedido já saiu em rota.');if(b.status){if(!['preparando','pronto','cancelado'].includes(b.status))bad('Situação inválida.');if(b.status==='pronto'&&(old.lat==null||old.lon==null||!['automatico','confirmado'].includes(old.geo_status)))bad('Confirme a localização exata antes de liberar o pedido.');const r=await query('UPDATE mr_pedidos SET status=$1,atualizado_em=NOW() WHERE id=$2 RETURNING *',[b.status,old.id]);await log({query},'pedido',old.id,'STATUS',req.user.id,{de:old.status,para:b.status});return res.json(r.rows[0])}if(b.lat!=null&&b.lon!=null){const r=await query("UPDATE mr_pedidos SET lat=$1,lon=$2,geo_status='confirmado',atualizado_em=NOW() WHERE id=$3 RETURNING *",[num(b.lat,-90,90),num(b.lon,-180,180),old.id]);await log({query},'pedido',old.id,'LOCALIZAR',req.user.id);return res.json(r.rows[0])}bad('Nenhuma alteração informada.')}));
// V72.3 — exclusão de pedidos de teste ou ainda não despachados, preservando viagens e auditoria.
router.delete('/pedidos/:id',safe(async(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)bad('Pedido inválido.');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const found=(await client.query('SELECT id,numero,status FROM mr_pedidos WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!found)bad('Pedido não encontrado.',404);
  if(!['preparando','pronto','cancelado'].includes(found.status))bad('Este pedido já foi despachado ou finalizado e não pode ser excluído. Preserve o histórico de entregas.',409);
  const linked=await client.query('SELECT 1 FROM mr_paradas WHERE pedido_id=$1 LIMIT 1',[id]);
  if(linked.rowCount)bad('Este pedido pertence ao histórico de uma viagem e não pode ser excluído.',409);
  await client.query('DELETE FROM mr_pedidos WHERE id=$1',[id]);
  await log(client,'pedido',id,'EXCLUIR',req.user.id,{numero:found.numero,status:found.status});
  await client.query('COMMIT');
  res.json({ok:true,id});
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}));
// V72.5: Arquivamento de pedidos concluídos (sem excluir provas ou vínculos de viagens).
router.patch('/pedidos/:id/arquivar',safe(async(req,res)=>{
 if(!canManage(req))bad('Somente responsáveis podem arquivar pedidos.',403);
 const id=num(req.params.id,1,Number.MAX_SAFE_INTEGER),archived=req.body?.arquivado===true;
 const client=await pool.connect();try{await client.query('BEGIN');
 const row=(await client.query('SELECT * FROM mr_pedidos WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!row)bad('Pedido não encontrado.',404);
 if(!['entregue','nao_entregue','cancelado'].includes(row.status))bad('Só é possível arquivar pedidos finalizados ou cancelados.');
 const updated=(await client.query('UPDATE mr_pedidos SET arquivado=$1,atualizado_em=NOW() WHERE id=$2 RETURNING *',[archived,id])).rows[0];
 await log(client,'pedido',id,archived?'ARQUIVAR':'DESARQUIVAR',req.user.id,{numero:row.numero});
 await client.query('COMMIT');res.json(updated);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.post('/pedidos/:id/reagendar',safe(async(req,res)=>{const p=(await query('SELECT * FROM mr_pedidos WHERE id=$1',[req.params.id])).rows[0];if(!p)bad('Pedido não encontrado.',404);if(p.status!=='nao_entregue')bad('Somente pedidos não entregues podem ser liberados para nova tentativa.');const updated=await query("UPDATE mr_pedidos SET status='pronto',atualizado_em=NOW() WHERE id=$1 RETURNING *",[p.id]);await log({query},'pedido',p.id,'REAGENDAR',req.user.id);res.json(updated.rows[0])}));
router.post('/pedidos/:id/geocodificar',safe(async(req,res)=>{const r=await query('SELECT * FROM mr_pedidos WHERE id=$1',[req.params.id]);if(!r.rowCount)bad('Pedido não encontrado.',404);if(r.rows[0].status==='em_rota')bad('Pedido em rota.');if(!maps.hasKey())bad('Configure GEOAPIFY_API_KEY no Render para localizar automaticamente.');const g=await maps.geocode(r.rows[0]);if(!g.ok)bad(g.reason);const updated=await query('UPDATE mr_pedidos SET lat=$1,lon=$2,geo_status=$3,atualizado_em=NOW() WHERE id=$4 RETURNING *',[g.lat,g.lon,g.preciso?'automatico':'revisar',r.rows[0].id]);res.json(updated.rows[0])}));
async function buildPlan(b){const cfg=(await query('SELECT * FROM mr_config WHERE id=1')).rows[0];if(!cfg||cfg.lat==null||cfg.lon==null)bad('Configure a localização exata do supermercado primeiro.');const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(Number.isInteger):[];if(!ids.length||ids.length>120)bad('Selecione entre 1 e 120 pedidos prontos.');if(new Set(ids).size!==ids.length)bad('Há pedidos repetidos.');const count=num(b.veiculos,1,10),max=num(b.max_paradas||15,1,24);if(ids.length>count*max)bad('Quantidade de pedidos excede a capacidade das viagens. Aumente veículos ou limite por veículo.');const r=await query('SELECT * FROM mr_pedidos WHERE id=ANY($1::bigint[]) AND status=$2',[ids,'pronto']);if(r.rowCount!==ids.length)bad('Algum pedido não está mais pronto. Recarregue o painel.');const missing=r.rows.filter(x=>x.lat==null||x.lon==null||!['automatico','confirmado'].includes(x.geo_status));if(missing.length)bad('Confirme no mapa a localização de: '+missing.map(x=>'#'+x.numero).join(', '));const base=origin(cfg);const assigned=opt.distribute(base,r.rows.map(x=>({...x,lat:Number(x.lat),lon:Number(x.lon)})),count,max);const routes=[];for(const group of assigned){routes.push(await maps.route(base,group))}return {origem:cfg,rotas:routes,total:ids.length}}
router.post('/planejar',safe(async(req,res)=>{const data=await buildPlan(req.body);res.json(data)}));
router.post('/viagens/criar',safe(async(req,res)=>{const b=req.body;const data=await buildPlan(b);const drivers=Array.isArray(b.entregadores)?b.entregadores.map(Number):[];if(drivers.length!==data.rotas.length||drivers.some(x=>!Number.isInteger(x)||x<1)||new Set(drivers).size!==drivers.length)bad('Escolha um entregador diferente para cada viagem.');const users=await query('SELECT id FROM usuarios WHERE id=ANY($1::bigint[])',[drivers]);if(users.rowCount!==drivers.length)bad('Entregador não encontrado.');const client=await pool.connect();try{await client.query('BEGIN');const trips=[];for(let i=0;i<data.rotas.length;i++){const group=data.rotas[i],driver=drivers[i];const t=(await client.query('INSERT INTO mr_viagens(entregador_id,veiculo,origem_nome,origem_endereco,origem_lat,origem_lon,distancia_metros,duracao_segundos,calculo,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[driver,b.veiculo==='carro'?'carro':'moto',data.origem.nome_origem,data.origem.endereco_origem,data.origem.lat,data.origem.lon,group.distancia_metros,group.duracao_segundos,group.calculo,req.user.id])).rows[0];for(let j=0;j<group.items.length;j++){const p=group.items[j];const upd=await client.query("UPDATE mr_pedidos SET status='em_rota',atualizado_em=NOW() WHERE id=$1 AND status='pronto' RETURNING id",[p.id]);if(!upd.rowCount)bad('Outro usuário já atribuiu um dos pedidos a uma rota.');await client.query('INSERT INTO mr_paradas(viagem_id,pedido_id,ordem) VALUES($1,$2,$3)',[t.id,p.id,j+1])}await log(client,'viagem',t.id,'CRIAR',req.user.id,{quantidade:group.items.length,driver});trips.push(t)}await client.query('COMMIT');res.status(201).json({viagens:trips})}catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}}));
// Cancelar uma viagem confirmada libera APENAS pedidos ainda pendentes; preserva entregas e auditoria.
router.post('/viagens/:id/cancelar',safe(async(req,res)=>{
 if(!canManage(req))bad('Somente responsáveis podem cancelar viagens.',403);
 const id=num(req.params.id,1,Number.MAX_SAFE_INTEGER);
 const client=await pool.connect();try{await client.query('BEGIN');
 const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!trip)bad('Viagem não encontrada.',404);
 if(!['planejada','em_rota'].includes(trip.status))bad('Somente viagens planejadas ou em andamento podem ser canceladas.');
 const linked=(await client.query('SELECT * FROM mr_paradas WHERE viagem_id=$1 ORDER BY ordem FOR UPDATE',[id])).rows;
 let returned=0,kept=0;
 for(const stop of linked){
  if(['pendente','aguardando_cliente'].includes(stop.status)){
   await client.query("UPDATE mr_paradas SET status='cancelada',observacao=CASE WHEN observacao='' THEN 'Viagem cancelada pela central' ELSE observacao END,concluida_em=NOW(),concluida_por=$2 WHERE id=$1",[stop.id,req.user.id]);
   const update=await client.query("UPDATE mr_pedidos SET status='pronto',atualizado_em=NOW() WHERE id=$1 AND status='em_rota' RETURNING id",[stop.pedido_id]);returned+=update.rowCount;
  }else kept++;
 }
 const updated=(await client.query("UPDATE mr_viagens SET status='cancelada',encerrado_em=NOW(),arquivada=TRUE WHERE id=$1 RETURNING *",[id])).rows[0];
 await client.query('DELETE FROM mr_localizacoes WHERE viagem_id=$1',[id]);
 await log(client,'viagem',id,'CANCELAR',req.user.id,{pedidos_reliberados:returned,paradas_preservadas:kept});
 await client.query('COMMIT');res.json({viagem:updated,pedidos_reliberados:returned,paradas_preservadas:kept});
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.patch('/viagens/:id/arquivar',safe(async(req,res)=>{
 if(!canManage(req))bad('Somente responsáveis podem arquivar viagens.',403);
 const id=num(req.params.id,1,Number.MAX_SAFE_INTEGER),archived=req.body?.arquivada===true;
 const client=await pool.connect();try{await client.query('BEGIN');
 const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!trip)bad('Viagem não encontrada.',404);
 if(!['cancelada','concluida'].includes(trip.status))bad('Cancele a viagem ativa antes de arquivá-la.');
 const updated=(await client.query('UPDATE mr_viagens SET arquivada=$1 WHERE id=$2 RETURNING *',[archived,id])).rows[0];
 await log(client,'viagem',id,archived?'ARQUIVAR':'DESARQUIVAR',req.user.id);
 await client.query('COMMIT');res.json(updated);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.get('/viagens/:id',safe(async(req,res)=>{const r=await query(`SELECT v.*,u.nome AS entregador_nome FROM mr_viagens v LEFT JOIN usuarios u ON u.id=v.entregador_id WHERE v.id=$1`,[req.params.id]);if(!r.rowCount)bad('Viagem não encontrada.',404);res.json({viagem:r.rows[0],paradas:await stops(req.params.id)})}));
router.post('/viagens/:id/iniciar',safe(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const t=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!t)bad('Viagem não encontrada.',404);if(!canControl(req,t))bad('Esta viagem está atribuída a outro entregador.',403);if(t.status!=='planejada')bad('Viagem não está planejada.');const updated=(await client.query("UPDATE mr_viagens SET status='em_rota',iniciado_em=NOW() WHERE id=$1 RETURNING *",[t.id])).rows[0];await log(client,'viagem',t.id,'INICIAR',req.user.id);await client.query('COMMIT');res.json(updated)}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
// Etapas individuais por parada: iniciar deslocamento -> aguardar cliente -> concluir.
router.post('/viagens/:id/paradas/:stopId/deslocamento',safe(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!trip)bad('Viagem não encontrada.',404);if(!canControl(req,trip))bad('Esta viagem pertence a outro entregador.',403);
 if(trip.status!=='em_rota')bad('Inicie a viagem para navegar.');
 const stop=(await client.query('SELECT * FROM mr_paradas WHERE id=$1 AND viagem_id=$2 FOR UPDATE',[req.params.stopId,trip.id])).rows[0];
 if(!stop||stop.status!=='pendente')bad('Parada não está pendente.');
 // Reabrir o aplicativo de navegação não reinicia a contagem.
 const result=(await client.query('UPDATE mr_paradas SET deslocamento_iniciado_em=COALESCE(deslocamento_iniciado_em,NOW()) WHERE id=$1 RETURNING *',[stop.id])).rows[0];
 if(!stop.deslocamento_iniciado_em)await log(client,'pedido',stop.pedido_id,'INICIAR_DESLOCAMENTO',req.user.id,{viagem_id:trip.id});
 await client.query('COMMIT');res.json(result);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.post('/viagens/:id/paradas/:stopId/chegada',safe(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
 if(!trip)bad('Viagem não encontrada.',404);if(!canControl(req,trip))bad('Esta viagem pertence a outro entregador.',403);
 if(trip.status!=='em_rota')bad('Inicie a viagem antes de registrar chegada.');
 const stop=(await client.query('SELECT * FROM mr_paradas WHERE id=$1 AND viagem_id=$2 FOR UPDATE',[req.params.stopId,trip.id])).rows[0];
 if(!stop||stop.status!=='pendente')bad('Parada já finalizada ou aguardando cliente.');
 if(!stop.deslocamento_iniciado_em)bad('Primeiro clique em Navegar para iniciar o deslocamento.');
 const result=(await client.query("UPDATE mr_paradas SET status='aguardando_cliente',chegada_em=NOW() WHERE id=$1 RETURNING *",[stop.id])).rows[0];
 await log(client,'pedido',stop.pedido_id,'CHEGADA_AGUARDANDO_CLIENTE',req.user.id,{viagem_id:trip.id});
 await client.query('COMMIT');res.json(result);
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}));
router.post('/viagens/:id/paradas/:stopId/concluir',safe(async(req,res)=>{const status=s(req.body.status);if(!['entregue','nao_entregue'].includes(status))bad('Situação inválida.');if(status==='nao_entregue'&&!s(req.body.observacao))bad('Informe o motivo da entrega não realizada.');const client=await pool.connect();try{await client.query('BEGIN');const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!trip)bad('Viagem não encontrada.',404);if(!canControl(req,trip))bad('Viagem de outro entregador.',403);if(trip.status!=='em_rota')bad('Inicie a viagem antes de registrar entregas.');const stop=(await client.query('SELECT * FROM mr_paradas WHERE id=$1 AND viagem_id=$2 FOR UPDATE',[req.params.stopId,trip.id])).rows[0];if(!stop||!['aguardando_cliente','pendente'].includes(stop.status))bad('Parada já finalizada ou inexistente.');if(status==='entregue'&&stop.status!=='aguardando_cliente')bad('Registre a chegada e a espera pelo cliente antes de confirmar a entrega.');await client.query('UPDATE mr_paradas SET status=$1,observacao=$2,concluida_em=NOW(),concluida_por=$3 WHERE id=$4',[status,s(req.body.observacao,1000),req.user.id,stop.id]);await client.query('UPDATE mr_pedidos SET status=$1,atualizado_em=NOW() WHERE id=$2',[status,stop.pedido_id]);await log(client,'pedido',stop.pedido_id,status.toUpperCase(),req.user.id,{viagem_id:trip.id,motivo:s(req.body.observacao,1000)});await client.query('COMMIT');res.json({ok:true})}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.post('/viagens/:id/encerrar',safe(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const trip=(await client.query('SELECT * FROM mr_viagens WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!trip)bad('Viagem não encontrada.',404);if(!canControl(req,trip))bad('Sem permissão para finalizar esta viagem.',403);if(trip.status!=='em_rota')bad('A viagem precisa estar em andamento.');const pending=(await client.query("SELECT COUNT(*)::int AS total FROM mr_paradas WHERE viagem_id=$1 AND status IN ('pendente','aguardando_cliente')",[trip.id])).rows[0].total;if(pending)bad(`Ainda existem ${pending} entregas pendentes. Finalize cada uma.`);const done=(await client.query("UPDATE mr_viagens SET status='concluida',encerrado_em=NOW() WHERE id=$1 RETURNING *",[trip.id])).rows[0];await client.query('DELETE FROM mr_localizacoes WHERE viagem_id=$1',[trip.id]);await log(client,'viagem',trip.id,'ENCERRAR',req.user.id);await client.query('COMMIT');res.json(done)}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}));
router.post('/viagens/:id/gps',safe(async(req,res)=>{const trip=(await query('SELECT * FROM mr_viagens WHERE id=$1',[req.params.id])).rows[0];if(!trip)bad('Viagem não encontrada.',404);if(Number(trip.entregador_id)!==Number(req.user.id))bad('GPS autorizado somente ao entregador atribuído.',403);if(trip.status!=='em_rota')bad('O GPS só pode ser compartilhado durante viagem iniciada.');const lat=num(req.body.lat,-90,90),lon=num(req.body.lon,-180,180),accuracy=req.body.precisao_m==null?null:Math.round(num(req.body.precisao_m,0,50000));await query(`INSERT INTO mr_localizacoes(viagem_id,entregador_id,lat,lon,precisao_m,atualizado_em) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(viagem_id) DO UPDATE SET lat=EXCLUDED.lat,lon=EXCLUDED.lon,precisao_m=EXCLUDED.precisao_m,atualizado_em=NOW()`,[trip.id,req.user.id,lat,lon,accuracy]);res.json({ok:true})}));
router.get('/eventos',safe(async(req,res)=>res.json((await query(`SELECT e.*,u.nome AS usuario FROM mr_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id ORDER BY e.criado_em DESC LIMIT 300`)).rows)));
// Mensagens genéricas para falhas inesperadas; validadores de negócio mantêm mensagem específica.
router.use((err,req,res,next)=>{if(err.code==='23505')return res.status(409).json({error:'Pedido já cadastrado ou atribuído a outra viagem.'});if(err.status)return res.status(err.status).json({error:err.message});console.error('[Manaíra Rotas]',err);res.status(500).json({error:'Não foi possível completar a operação. Consulte o log do servidor.'})});
module.exports=router;
