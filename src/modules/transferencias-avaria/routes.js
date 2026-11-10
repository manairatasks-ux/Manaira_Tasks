 'use strict';
const router=require('express').Router();
const bcrypt=require('bcryptjs');
const gz=require('../produtos-gz/produtos-gz.service');
const {pool,query}=require('../../db');
const {auth}=require('../../middlewares/auth.middleware');
const {requireModuleAccess}=require('../../middlewares/module-access.middleware');
router.use(auth,requireModuleAccess('transferencias_avaria'));
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e};
const manager=req=>['administrador_principal','administrador','gerente'].includes(String(req.user.perfil||'').toLowerCase());
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
const pinValid=v=>/^\d{4,8}$/.test(String(v??''));
async function profile(req,client=pool){return (await client.query('SELECT setor,pin_hash FROM ta_perfis WHERE usuario_id=$1',[req.user.id])).rows[0]||null}
async function gate(req,role,client=pool){const p=await profile(req,client);if(!p||!(p.setor===role||p.setor==='ambos'))fail(`Seu usuário não está autorizado no setor ${role}.`,403);return p}
async function pin(req,role,client=pool){const p=await gate(req,role,client);if(!p.pin_hash)fail('Cadastre seu PIN pessoal antes de confirmar movimentações.',403);if(!pinValid(req.body.pin)||!await bcrypt.compare(String(req.body.pin),p.pin_hash))fail('PIN inválido.',403)}
async function event(client,id,req,acao,detalhes={}){await client.query('INSERT INTO ta_eventos(remessa_id,usuario_id,acao,detalhes) VALUES($1,$2,$3,$4::jsonb)',[id,req.user.id,acao,JSON.stringify(detalhes)])}
async function row(client,id){const r=(await client.query('SELECT * FROM ta_remessas WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!r)fail('Remessa não encontrada.',404);return r}
async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
// Consulta de EAN no mesmo serviço GZ utilizado pelo Pit Stop.
router.get('/produto/:ean',safe(async(req,res)=>{
  const ean=clean(req.params.ean,20);
  if(!/^\d{8,14}$/.test(ean))fail('Informe EAN de 8 a 14 dígitos.');
  const consulta=await gz.consultarProduto({codigoBarras:ean});
  const lista=consulta.produtos||[];
  const item=lista.find(x=>String(x.codigoEan||x.codigoBarras||x.codigo_barras||x.ean||x.codigobarras||'')===ean)||lista[0];
  if(!item)fail('Produto não encontrado no GZ. Você pode cadastrá-lo avulso.',404);
  const descricao=clean(item.descricao||item.descpdv||item.descricaoProduto||item.nome||item.nomeProduto||item.produto,240);
  if(!descricao)fail('Produto sem descrição retornada pelo GZ.',502);
  res.set('Cache-Control','no-store');res.json({codigo:ean,descricao,unidade:'UN'});
}));
router.get('/bootstrap',safe(async(req,res)=>{const [me,users,remessas]=await Promise.all([profile(req),manager(req)?query('SELECT u.id,u.nome,p.setor FROM usuarios u LEFT JOIN ta_perfis p ON p.usuario_id=u.id WHERE u.ativo=TRUE ORDER BY u.nome'):Promise.resolve({rows:[]}),query(`SELECT r.*,u.nome AS criado_nome,s.nome AS enviado_nome,t.nome AS recebido_nome,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id) AS total_itens,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id AND i.quantidade_recebida IS NOT NULL) AS itens_conferidos,(SELECT COUNT(*)::int FROM ta_itens i WHERE i.remessa_id=r.id AND i.quantidade_recebida IS NOT NULL AND i.quantidade_enviada<>i.quantidade_recebida) AS divergencias FROM ta_remessas r LEFT JOIN usuarios u ON u.id=r.criado_por LEFT JOIN usuarios s ON s.id=r.enviado_por LEFT JOIN usuarios t ON t.id=r.recebido_por ORDER BY r.id DESC LIMIT 250`)]);res.set('Cache-Control','no-store');res.json({perfil:me?{setor:me.setor,pin_configurado:!!me.pin_hash}:null,gerente:manager(req),usuarios:users.rows,remessas:remessas.rows})}));
router.put('/usuarios/:id',safe(async(req,res)=>{if(!manager(req))fail('Somente a gerência pode definir os setores.',403);const id=Number(req.params.id),setor=clean(req.body.setor,20);if(!Number.isInteger(id)||id<=0)fail('Usuário inválido.');if(!['prevencao','avaria','ambos','nenhum'].includes(setor))fail('Setor inválido.');if(setor==='nenhum'){await query('DELETE FROM ta_perfis WHERE usuario_id=$1',[id]);return res.json({ok:true})}const r=await query('INSERT INTO ta_perfis(usuario_id,setor) SELECT id,$2 FROM usuarios WHERE id=$1 AND ativo=TRUE ON CONFLICT(usuario_id) DO UPDATE SET setor=EXCLUDED.setor,atualizado_em=NOW() RETURNING usuario_id',[id,setor]);if(!r.rowCount)fail('Usuário não encontrado.',404);res.json({ok:true})}));
router.put('/me/pin',safe(async(req,res)=>{const {novo_pin,pin_atual}=req.body||{};if(!pinValid(novo_pin))fail('PIN deve conter de 4 a 8 números.');const p=await profile(req);if(!p)fail('Solicite à gerência acesso a um setor antes de cadastrar PIN.',403);if(p.pin_hash&&(!pinValid(pin_atual)||!await bcrypt.compare(String(pin_atual),p.pin_hash)))fail('PIN atual incorreto.',403);await query('UPDATE ta_perfis SET pin_hash=$1,atualizado_em=NOW() WHERE usuario_id=$2',[await bcrypt.hash(String(novo_pin),11),req.user.id]);res.json({ok:true})}));
router.post('/remessas',safe(async(req,res)=>{await gate(req,'prevencao');const r=await query('INSERT INTO ta_remessas(observacao,criado_por) VALUES($1,$2) RETURNING *',[clean(req.body.observacao,1000),req.user.id]);await event(pool,r.rows[0].id,req,'CRIAR');res.status(201).json(r.rows[0])}));
router.get('/remessas/:id',safe(async(req,res)=>{const id=Number(req.params.id);const [r,itens,eventos]=await Promise.all([query('SELECT r.*,u.nome AS criado_nome,s.nome AS enviado_nome,t.nome AS recebido_nome FROM ta_remessas r LEFT JOIN usuarios u ON u.id=r.criado_por LEFT JOIN usuarios s ON s.id=r.enviado_por LEFT JOIN usuarios t ON t.id=r.recebido_por WHERE r.id=$1',[id]),query('SELECT * FROM ta_itens WHERE remessa_id=$1 ORDER BY id',[id]),query('SELECT e.*,u.nome AS usuario_nome FROM ta_eventos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE remessa_id=$1 ORDER BY e.id',[id])]);if(!r.rows.length)fail('Remessa não encontrada.',404);res.json({remessa:r.rows[0],itens:itens.rows,eventos:eventos.rows})}));
router.put('/remessas/:id/itens',safe(async(req,res)=>{await gate(req,'prevencao');const itens=req.body.itens;if(!Array.isArray(itens)||!itens.length||itens.length>200)fail('Informe entre 1 e 200 produtos.');const seen=new Set(),valid=itens.map(x=>{const codigo=clean(x.codigo,80),descricao=clean(x.descricao,240),unidade=clean(x.unidade||'UN',10).toUpperCase(),quantidade=Number(x.quantidade);if(!descricao||!Number.isFinite(quantidade)||quantidade<=0||quantidade>1000000)fail('Confira código, descrição e quantidade dos produtos.');if(codigo){if(seen.has(codigo))fail(`Código duplicado: ${codigo}`);seen.add(codigo);}return {codigo:codigo||null,descricao,unidade,quantidade}});await tx(async c=>{const r=await row(c,Number(req.params.id));if(r.status!=='rascunho')fail('Remessa já enviada: não é possível alterar produtos.');if(Number(r.criado_por)!==Number(req.user.id)&&!manager(req))fail('Somente o criador pode editar o rascunho.',403);await c.query('DELETE FROM ta_itens WHERE remessa_id=$1',[r.id]);for(const x of valid)await c.query('INSERT INTO ta_itens(remessa_id,codigo,descricao,unidade,quantidade_enviada) VALUES($1,$2,$3,$4,$5)',[r.id,x.codigo,x.descricao,x.unidade,x.quantidade]);await event(c,r.id,req,'ATUALIZAR_ITENS',{total:valid.length})});res.json({ok:true})}));
router.post('/remessas/:id/enviar',safe(async(req,res)=>{await tx(async c=>{await pin(req,'prevencao',c);const r=await row(c,Number(req.params.id));if(r.status!=='rascunho')fail('Somente rascunhos podem ser enviados.');const n=(await c.query('SELECT COUNT(*)::int n FROM ta_itens WHERE remessa_id=$1',[r.id])).rows[0].n;if(!n)fail('Adicione produtos antes de enviar.');await c.query("UPDATE ta_remessas SET status='enviada',enviado_por=$2,enviado_em=NOW() WHERE id=$1",[r.id,req.user.id]);await event(c,r.id,req,'ENVIAR',{total_itens:n})});res.json({ok:true})}));
// Apenas um recebimento aberto por vez; retomada pelo próprio conferente.
router.post('/remessas/:id/iniciar-recebimento',safe(async(req,res)=>{
  await tx(async c=>{
    await gate(req,'avaria',c);
    const r=await row(c,Number(req.params.id));
    if(Number(r.enviado_por)===Number(req.user.id))fail('Quem enviou não pode receber a própria remessa.',403);
    if(r.status==='em_conferencia'){
      if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('Esta conferência já foi iniciada por outro operador. Solicite à gerência uma transferência de responsabilidade.',409);
      return;
    }
    if(r.status!=='enviada')fail('Esta remessa não está disponível para recebimento.',409);
    await c.query("UPDATE ta_remessas SET status='em_conferencia',conferencia_iniciada_por=$2,conferencia_iniciada_em=NOW() WHERE id=$1",[r.id,req.user.id]);
    await event(c,r.id,req,'INICIAR_RECEBIMENTO');
  });res.json({ok:true});
}));
router.put('/remessas/:id/conferencia',safe(async(req,res)=>{
  const itens=req.body?.itens;
  if(!Array.isArray(itens))fail('Informe os itens conferidos.');
  await tx(async c=>{
    await gate(req,'avaria',c);
    const r=await row(c,Number(req.params.id));
    if(r.status!=='em_conferencia')fail('Inicie o recebimento antes de salvar a conferência.',409);
    if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('Somente o responsável pode salvar esta conferência.',403);
    const orig=(await c.query('SELECT id FROM ta_itens WHERE remessa_id=$1 FOR UPDATE',[r.id])).rows;
    const valid=new Set(orig.map(x=>String(x.id))),seen=new Set();
    for(const x of itens){
      const id=String(x.id),n=Number(x.quantidade);
      if(!valid.has(id)||seen.has(id)||x.quantidade===null||x.quantidade===undefined||String(x.quantidade).trim()===''||!Number.isFinite(n)||n<0||n>1000000)fail('Itens ou quantidades inválidas.');
      seen.add(id);
    }
    // A tela envia só o que foi contado. Itens não informados continuam pendentes.
    await c.query('UPDATE ta_itens SET quantidade_recebida=NULL WHERE remessa_id=$1',[r.id]);
    for(const x of itens)await c.query('UPDATE ta_itens SET quantidade_recebida=$1 WHERE id=$2 AND remessa_id=$3',[Number(x.quantidade),x.id,r.id]);
    await event(c,r.id,req,'SALVAR_CONFERENCIA',{conferidos:itens.length,total:orig.length});
  });res.json({ok:true});
}));
router.post('/remessas/:id/receber',safe(async(req,res)=>{const itens=req.body.itens;if(!Array.isArray(itens))fail('Informe a conferência dos produtos.');await tx(async c=>{await pin(req,'avaria',c);const r=await row(c,Number(req.params.id));if(r.status!=='em_conferencia')fail('Inicie a conferência antes de finalizar o recebimento.');
if(Number(r.conferencia_iniciada_por)!==Number(req.user.id))fail('A conferência está atribuída a outro operador.',403);if(Number(r.enviado_por)===Number(req.user.id))fail('Quem enviou não pode confirmar o próprio recebimento.',403);const orig=(await c.query('SELECT * FROM ta_itens WHERE remessa_id=$1 ORDER BY id FOR UPDATE',[r.id])).rows;if(itens.length!==orig.length)fail('Confira todos os itens da remessa.');const quant=new Map();for(const x of itens){const id=Number(x.id),n=Number(x.quantidade);if(!Number.isSafeInteger(id)||quant.has(id)||x.quantidade==null||String(x.quantidade).trim()===''||!Number.isFinite(n)||n<0||n>1000000)fail('Quantidade recebida inválida.');quant.set(id,n)}let divergencias=0;for(const x of orig){if(!quant.has(Number(x.id)))fail('Há itens não conferidos.');const n=quant.get(Number(x.id));if(Number(x.quantidade_enviada)!==n)divergencias++;await c.query('UPDATE ta_itens SET quantidade_recebida=$1 WHERE id=$2',[n,x.id])}await c.query('UPDATE ta_remessas SET status=$2,recebido_por=$3,recebido_em=NOW() WHERE id=$1',[r.id,divergencias?'divergente':'conferida',req.user.id]);await event(c,r.id,req,'RECEBER',{divergencias})});res.json({ok:true})}));
router.post('/remessas/:id/resolver',safe(async(req,res)=>{await tx(async c=>{await pin(req,'avaria',c);if(!manager(req))fail('Apenas a gerência pode encerrar divergências.',403);const r=await row(c,Number(req.params.id));if(r.status!=='divergente')fail('Não há divergências pendentes nesta remessa.');const justificativa=clean(req.body.justificativa,1500);if(justificativa.length<10)fail('Informe justificativa com pelo menos 10 caracteres.');await c.query("UPDATE ta_remessas SET status='resolvida',resolvido_em=NOW() WHERE id=$1",[r.id]);await event(c,r.id,req,'RESOLVER_DIVERGENCIA',{justificativa})});res.json({ok:true})}));
router.use((err,req,res,next)=>{console.error('Transferências:',err.message);res.status(err.status||500).json({error:err.status?err.message:'Erro ao processar a operação.'})});
module.exports=router;
