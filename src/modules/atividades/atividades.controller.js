const router=require('express').Router();
const PDFDocument=require('pdfkit');
const {query,get,all}=require('./atividades.model');
const {auth,authPdf}=require('../../middlewares/auth.middleware');
const {requireModuleAccess,requireModuleAccessPdf}=require('../../middlewares/module-access.middleware');
const {isPrincipal,canCreateSector}=require('../../shared/profile.service');
const {cleanDate,cleanId,getNextOrder,getUserNameById}=require('../../shared/utils');
const {PERMISSAO_NIVEL,exigirAcessoSetor,setorIdPorGrupo,setorIdPorTarefa}=require('./atividades.service');

router.get('/api/minhas-tarefas', auth, requireModuleAccess('atividades'), async (req, res) => {
  try {
    const tarefas = await all(`
      SELECT
        t.*,
        COALESCE(u.nome, NULLIF(TRIM(t.responsavel), ''), 'Sem responsável') AS responsavel_nome,
        g.nome AS grupo_nome,
        s.nome AS setor_nome,
        s.cor AS setor_cor
      FROM tarefas t
      JOIN grupos g ON g.id = t.grupo_id
      JOIN setores s ON s.id = g.setor_id
      LEFT JOIN usuarios u ON u.id = t.responsavel_id
      WHERE t.responsavel_id = $1
      ORDER BY
        CASE t.status WHEN 'Em andamento' THEN 1 WHEN 'Não iniciado' THEN 2 WHEN 'Parado' THEN 3 WHEN 'Feito' THEN 4 ELSE 5 END,
        t.prazo ASC NULLS LAST,
        t.id DESC
    `, [req.user.id]);

    res.json(tarefas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar suas tarefas.', details: err.message });
  }
});

router.patch('/api/minhas-tarefas/:id', auth, requireModuleAccess('atividades'), async (req, res) => {
  try {
    const { status, observacoes } = req.body;
    const tarefa = await get(`
      UPDATE tarefas SET
        status = COALESCE($1, status),
        observacoes = COALESCE($2, observacoes),
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $3 AND responsavel_id = $4
      RETURNING *
    `, [status || null, observacoes ?? null, req.params.id, req.user.id]);

    if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada para este usuário.' });
    res.json(tarefa);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar sua tarefa.', details: err.message });
  }
});

router.get('/api/minhas-os', auth, requireModuleAccess('atividades'), async (req, res) => {
  try {
    const itens = await all(`
      SELECT o.*, u.nome AS responsavel_nome
      FROM ordens_servico o
      LEFT JOIN usuarios u ON u.id = o.responsavel_principal_id
      WHERE o.responsavel_principal_id = $1
      ORDER BY
        CASE o.status WHEN 'Recebido' THEN 1 WHEN 'Em análise' THEN 2 WHEN 'Em execução' THEN 3 WHEN 'Aguardando material' THEN 4 WHEN 'Aguardando mão de obra' THEN 5 WHEN 'Pausado' THEN 6 WHEN 'Concluído' THEN 7 ELSE 8 END,
        o.criado_em DESC
    `, [req.user.id]);

    res.json(itens);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar suas OS.', details: err.message });
  }
});

router.patch('/api/minhas-os/:id/status', auth, requireModuleAccess('atividades'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

    const existente = await get('SELECT * FROM ordens_servico WHERE id = $1 AND responsavel_principal_id = $2', [req.params.id, req.user.id]);
    if (!existente) return res.status(404).json({ error: 'OS não encontrada para este usuário.' });

    let dataInicioFinal = existente.data_inicio;
    let dataConclusaoFinal = existente.data_conclusao;
    if (status === 'Em execução' && !dataInicioFinal) dataInicioFinal = new Date();
    if (status === 'Concluído' && !dataConclusaoFinal) dataConclusaoFinal = new Date();

    const os = await get(`
      UPDATE ordens_servico SET
        status = $1,
        data_inicio = $2,
        data_conclusao = $3,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = $4 AND responsavel_principal_id = $5
      RETURNING *
    `, [status, dataInicioFinal, dataConclusaoFinal, req.params.id, req.user.id]);

    res.json(os);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar sua OS.', details: err.message });
  }
});



router.get('/api/dashboard', auth, requireModuleAccess('atividades'), async (req, res) => {
  try {
    const { setor_id, periodo = '90' } = req.query;
    const periodoDias = Math.max(7, Math.min(parseInt(periodo, 10) || 90, 365));
    const acessoSql = isPrincipal(req)
      ? 'TRUE'
      : '(s.proprietario_id = $1 OR EXISTS (SELECT 1 FROM setor_compartilhamentos sc WHERE sc.setor_id=s.id AND sc.usuario_id=$1))';
    const baseParams = isPrincipal(req) ? [] : [req.user.id];
    let extra = '';
    const params = [...baseParams];
    if (setor_id) { params.push(setor_id); extra = ` AND s.id = $${params.length}`; }
    const totalizadores = await get(`SELECT COUNT(t.*)::int total,
      COUNT(t.*) FILTER(WHERE t.status<>'Feito')::int abertas,
      COUNT(t.*) FILTER(WHERE t.status='Feito')::int concluidas,
      COUNT(t.*) FILTER(WHERE t.status<>'Feito' AND t.prazo<CURRENT_DATE)::int atrasadas,
      COUNT(t.*) FILTER(WHERE t.status<>'Feito' AND t.prazo=CURRENT_DATE)::int vencem_hoje,
      COUNT(t.*) FILTER(WHERE t.status<>'Feito' AND t.prazo BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '7 days')::int proximos_7_dias,
      COUNT(t.*) FILTER(WHERE t.status='Feito' AND t.atualizado_em>=date_trunc('week',CURRENT_DATE))::int concluidas_semana,
      COUNT(DISTINCT t.responsavel_id)::int responsaveis_ativos,
      ROUND(CASE WHEN COUNT(t.*)=0 THEN 0 ELSE COUNT(t.*) FILTER(WHERE t.status='Feito')::numeric/COUNT(t.*)*100 END)::int taxa_conclusao
      FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra}`, params);
    const porSetor=await all(`SELECT s.id,s.nome,s.cor,COUNT(t.id)::int total,COUNT(t.id) FILTER(WHERE t.status<>'Feito')::int abertas,COUNT(t.id) FILTER(WHERE t.status='Feito')::int concluidas,COUNT(t.id) FILTER(WHERE t.status<>'Feito' AND t.prazo<CURRENT_DATE)::int atrasadas,ROUND(CASE WHEN COUNT(t.id)=0 THEN 0 ELSE COUNT(t.id) FILTER(WHERE t.status='Feito')::numeric/COUNT(t.id)*100 END)::int taxa_conclusao FROM setores s LEFT JOIN grupos g ON g.setor_id=s.id LEFT JOIN tarefas t ON t.grupo_id=g.id WHERE ${acessoSql}${extra} GROUP BY s.id ORDER BY abertas DESC,s.nome LIMIT 12`,params);
    const porStatus=await all(`SELECT t.status,COUNT(*)::int total FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} GROUP BY t.status ORDER BY total DESC`,params);
    const porResponsavel=await all(`SELECT COALESCE(NULLIF(TRIM(t.responsavel),''),'Sem responsável') responsavel,COUNT(*)::int total,COUNT(*) FILTER(WHERE t.status<>'Feito')::int abertas,COUNT(*) FILTER(WHERE t.status='Feito')::int concluidas,COUNT(*) FILTER(WHERE t.status<>'Feito' AND t.prazo<CURRENT_DATE)::int atrasadas,ROUND(CASE WHEN COUNT(*)=0 THEN 0 ELSE COUNT(*) FILTER(WHERE t.status='Feito')::numeric/COUNT(*)*100 END)::int taxa_conclusao FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} GROUP BY 1 ORDER BY abertas DESC LIMIT 10`,params);
    const tarefasPorMes=await all(`SELECT to_char(date_trunc('month',t.criado_em),'YYYY-MM') mes,COUNT(*)::int criadas,COUNT(*) FILTER(WHERE t.status='Feito')::int concluidas FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} AND t.criado_em>=CURRENT_DATE-($${params.length+1}::int*INTERVAL '1 day') GROUP BY date_trunc('month',t.criado_em) ORDER BY 1`,[...params,periodoDias]);
    const proximosPrazos=await all(`SELECT t.id,t.titulo,t.responsavel,t.status,t.prioridade,t.prazo,s.nome setor,g.nome grupo FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} AND t.status<>'Feito' AND t.prazo IS NOT NULL ORDER BY t.prazo LIMIT 14`,params);
    const ultimasAtividades=await all(`SELECT t.id,t.titulo,t.status,t.responsavel,t.atualizado_em,s.nome setor,g.nome grupo FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} ORDER BY t.atualizado_em DESC LIMIT 12`,params);
    const calendario=await all(`SELECT t.id,t.titulo,t.responsavel,t.status,t.prioridade,t.prazo,s.nome setor FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} AND t.prazo BETWEEN date_trunc('month',CURRENT_DATE)::date AND (date_trunc('month',CURRENT_DATE)+INTERVAL '1 month - 1 day')::date ORDER BY t.prazo`,params);
    const quickBase=`FROM tarefas t JOIN grupos g ON g.id=t.grupo_id JOIN setores s ON s.id=g.setor_id WHERE ${acessoSql}${extra} AND t.status<>'Feito'`;
    const [atrasadas,hoje,semana,alta,semResponsavel]=await Promise.all([
      all(`SELECT t.*,s.nome setor,g.nome grupo ${quickBase} AND t.prazo<CURRENT_DATE ORDER BY t.prazo LIMIT 30`,params),
      all(`SELECT t.*,s.nome setor,g.nome grupo ${quickBase} AND t.prazo=CURRENT_DATE ORDER BY t.id LIMIT 30`,params),
      all(`SELECT t.*,s.nome setor,g.nome grupo ${quickBase} AND t.prazo BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '7 days' ORDER BY t.prazo LIMIT 30`,params),
      all(`SELECT t.*,s.nome setor,g.nome grupo ${quickBase} AND t.prioridade='Alta' ORDER BY t.prazo NULLS LAST LIMIT 30`,params),
      all(`SELECT t.*,s.nome setor,g.nome grupo ${quickBase} AND t.responsavel_id IS NULL ORDER BY t.prazo NULLS LAST LIMIT 30`,params)
    ]);
    res.json({filtros:{setor_id:setor_id||'',periodo:periodoDias},totalizadores:totalizadores||{},porSetor,porStatus,porResponsavel,tarefasPorMes,proximosPrazos,ultimasAtividades,calendario,quickLists:{atrasadas,hoje,semana,alta,semResponsavel}});
  } catch(err){res.status(500).json({error:'Erro ao carregar dashboard.',details:err.message});}
});

router.get('/api/setores', auth, requireModuleAccess('atividades'), async (req,res)=>{
  try{
    const setores=await all(`SELECT s.*,u.nome AS proprietario_nome,
      CASE WHEN s.proprietario_id=$1 THEN 'proprietario' ELSE sc.permissao END AS permissao
      FROM setores s LEFT JOIN usuarios u ON u.id=s.proprietario_id
      LEFT JOIN setor_compartilhamentos sc ON sc.setor_id=s.id AND sc.usuario_id=$1
      WHERE $2::boolean=TRUE OR s.proprietario_id=$1 OR sc.usuario_id=$1 ORDER BY s.nome`,[req.user.id,isPrincipal(req)]);
    res.json(setores);
  }catch(err){res.status(500).json({error:'Erro ao listar setores.',details:err.message});}
});

router.post('/api/setores',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  if(!canCreateSector(req))return res.status(403).json({error:'Seu perfil não permite criar setores.'});
  const {nome,descricao,cor}=req.body;if(!nome)return res.status(400).json({error:'Nome do setor é obrigatório.'});
  const setor=await get('INSERT INTO setores(nome,descricao,cor,proprietario_id) VALUES($1,$2,$3,$4) RETURNING *',[nome,descricao||'',cor||'#2563eb',req.user.id]);
  await query('INSERT INTO grupos(setor_id,nome,cor,ordem) VALUES($1,$2,$3,1)',[setor.id,'Prioridades da semana','#2563eb']);
  res.status(201).json({...setor,permissao:'proprietario'});
}catch(err){res.status(500).json({error:'Erro ao criar setor.',details:err.message});}});

router.put('/api/setores/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  if(!await exigirAcessoSetor(req,res,req.params.id,'gerenciar'))return;
  const {nome,descricao,cor}=req.body;const setor=await get('UPDATE setores SET nome=$1,descricao=$2,cor=$3 WHERE id=$4 RETURNING *',[nome,descricao||'',cor||'#2563eb',req.params.id]);res.json(setor);
}catch(err){res.status(500).json({error:'Erro ao atualizar setor.',details:err.message});}});

router.delete('/api/setores/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  const setor=await get('SELECT * FROM setores WHERE id=$1',[req.params.id]);
  if(!setor)return res.status(404).json({error:'Setor não encontrado.'});
  if(!isPrincipal(req)&&String(setor.proprietario_id)!==String(req.user.id))return res.status(403).json({error:'Somente o proprietário pode excluir o setor.'});
  await query('DELETE FROM setores WHERE id=$1',[req.params.id]);res.json({ok:true});
}catch(err){res.status(500).json({error:'Erro ao excluir setor.',details:err.message});}});

router.get('/api/setores/:id/quadro',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  const acesso=await exigirAcessoSetor(req,res,req.params.id,'visualizar');if(!acesso)return;
  const setor=await get('SELECT s.*,u.nome proprietario_nome FROM setores s LEFT JOIN usuarios u ON u.id=s.proprietario_id WHERE s.id=$1',[req.params.id]);
  const grupos=await all('SELECT * FROM grupos WHERE setor_id=$1 ORDER BY ordem,id',[req.params.id]);
  for(const grupo of grupos){grupo.tarefas=await all(`SELECT t.*,COALESCE(u.nome,NULLIF(TRIM(t.responsavel),''),'Sem responsável') responsavel_nome FROM tarefas t LEFT JOIN usuarios u ON u.id=t.responsavel_id WHERE t.grupo_id=$1 ORDER BY t.ordem,t.id`,[grupo.id]);}
  res.json({setor:{...setor,permissao:acesso.permissao},grupos});
}catch(err){res.status(500).json({error:'Erro ao carregar quadro.',details:err.message});}});

router.get('/api/setores/:id/compartilhamentos',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  const acesso=await exigirAcessoSetor(req,res,req.params.id,'gerenciar');if(!acesso)return;
  const itens=await all(`SELECT sc.usuario_id,sc.permissao,u.nome,u.email,u.perfil FROM setor_compartilhamentos sc JOIN usuarios u ON u.id=sc.usuario_id WHERE sc.setor_id=$1 ORDER BY u.nome`,[req.params.id]);res.json(itens);
}catch(err){res.status(500).json({error:'Erro ao listar compartilhamentos.',details:err.message});}});

router.put('/api/setores/:id/compartilhamentos',auth,requireModuleAccess('atividades'),async(req,res)=>{try{
  const acesso=await exigirAcessoSetor(req,res,req.params.id,'gerenciar');if(!acesso)return;
  const {usuario_id,permissao}=req.body;if(!PERMISSAO_NIVEL[permissao]||permissao==='proprietario')return res.status(400).json({error:'Permissão inválida.'});
  const usuarioId=cleanId(usuario_id);if(!usuarioId)return res.status(400).json({error:'Usuário inválido.'});
  const usuario=await get('SELECT id,ativo FROM usuarios WHERE id=$1',[usuarioId]);if(!usuario||!usuario.ativo)return res.status(400).json({error:'O usuário selecionado não existe ou está inativo.'});
  const setor=await get('SELECT proprietario_id FROM setores WHERE id=$1',[req.params.id]);if(!setor)return res.status(404).json({error:'Setor não encontrado.'});
  if(String(setor.proprietario_id)===String(usuarioId))return res.status(400).json({error:'O proprietário já possui acesso total.'});
  await query(`INSERT INTO setor_compartilhamentos(setor_id,usuario_id,permissao,criado_por) VALUES($1,$2,$3,$4) ON CONFLICT(setor_id,usuario_id) DO UPDATE SET permissao=EXCLUDED.permissao,criado_por=EXCLUDED.criado_por,atualizado_em=CURRENT_TIMESTAMP`,[req.params.id,usuarioId,permissao,req.user.id]);res.json({ok:true});
}catch(err){res.status(500).json({error:'Erro ao compartilhar setor.',details:err.message});}});

router.delete('/api/setores/:id/compartilhamentos/:usuarioId',auth,requireModuleAccess('atividades'),async(req,res)=>{try{if(!await exigirAcessoSetor(req,res,req.params.id,'gerenciar'))return;await query('DELETE FROM setor_compartilhamentos WHERE setor_id=$1 AND usuario_id=$2',[req.params.id,req.params.usuarioId]);res.json({ok:true});}catch(err){res.status(500).json({error:'Erro ao remover acesso.',details:err.message});}});

router.get('/api/admin/setores',auth,requireModuleAccess('administracao'),async(req,res)=>{try{if(!isPrincipal(req))return res.status(403).json({error:'Acesso exclusivo do Administrador Principal.'});const itens=await all(`SELECT s.*,u.nome proprietario_nome,(SELECT COUNT(*)::int FROM setor_compartilhamentos sc WHERE sc.setor_id=s.id) compartilhados FROM setores s LEFT JOIN usuarios u ON u.id=s.proprietario_id ORDER BY s.nome`);res.json(itens);}catch(err){res.status(500).json({error:'Erro ao listar setores administrativos.',details:err.message});}});
router.put('/api/admin/setores/:id/proprietario',auth,requireModuleAccess('administracao'),async(req,res)=>{try{if(!isPrincipal(req))return res.status(403).json({error:'Acesso exclusivo do Administrador Principal.'});const {usuario_id}=req.body;const u=await get('SELECT id FROM usuarios WHERE id=$1 AND ativo=TRUE',[usuario_id]);if(!u)return res.status(400).json({error:'Usuário inválido.'});await query('UPDATE setores SET proprietario_id=$1 WHERE id=$2',[usuario_id,req.params.id]);await query('DELETE FROM setor_compartilhamentos WHERE setor_id=$1 AND usuario_id=$2',[req.params.id,usuario_id]);res.json({ok:true});}catch(err){res.status(500).json({error:'Erro ao transferir propriedade.',details:err.message});}});

router.post('/api/grupos',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const{setor_id,nome,cor}=req.body;if(!setor_id||!nome)return res.status(400).json({error:'Setor e nome são obrigatórios.'});if(!await exigirAcessoSetor(req,res,setor_id,'gerenciar'))return;const ordem=await getNextOrder('grupos','setor_id',setor_id);const grupo=await get('INSERT INTO grupos(setor_id,nome,cor,ordem) VALUES($1,$2,$3,$4) RETURNING *',[setor_id,nome,cor||'#2563eb',ordem]);res.status(201).json(grupo);}catch(err){res.status(500).json({error:'Erro ao criar grupo.',details:err.message});}});
router.put('/api/grupos/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const sid=await setorIdPorGrupo(req.params.id);if(!sid||!await exigirAcessoSetor(req,res,sid,'gerenciar'))return;const{nome,cor}=req.body;res.json(await get('UPDATE grupos SET nome=$1,cor=$2 WHERE id=$3 RETURNING *',[nome,cor||'#2563eb',req.params.id]));}catch(err){res.status(500).json({error:'Erro ao atualizar grupo.',details:err.message});}});
router.delete('/api/grupos/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const sid=await setorIdPorGrupo(req.params.id);if(!sid||!await exigirAcessoSetor(req,res,sid,'gerenciar'))return;await query('DELETE FROM grupos WHERE id=$1',[req.params.id]);res.json({ok:true});}catch(err){res.status(500).json({error:'Erro ao excluir grupo.',details:err.message});}});

router.post('/api/tarefas',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const{grupo_id,titulo,responsavel_id,responsavel,status,prioridade,prazo,cronograma_inicio,cronograma_fim,observacoes}=req.body;if(!grupo_id||!titulo)return res.status(400).json({error:'Grupo e título são obrigatórios.'});const sid=await setorIdPorGrupo(grupo_id);if(!sid||!await exigirAcessoSetor(req,res,sid,'criar'))return;const respId=cleanId(responsavel_id),respNome=respId?await getUserNameById(respId):(responsavel||''),ordem=await getNextOrder('tarefas','grupo_id',grupo_id);const tarefa=await get(`INSERT INTO tarefas(grupo_id,titulo,responsavel,responsavel_id,status,prioridade,prazo,cronograma_inicio,cronograma_fim,observacoes,ordem,criado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[grupo_id,titulo,respNome||'',respId,status||'Não iniciado',prioridade||'Média',cleanDate(prazo),cleanDate(cronograma_inicio),cleanDate(cronograma_fim),observacoes||'',ordem,req.user.id]);res.status(201).json(tarefa);}catch(err){res.status(500).json({error:'Erro ao criar tarefa.',details:err.message});}});
router.put('/api/tarefas/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const antiga=await get('SELECT t.*,g.setor_id FROM tarefas t JOIN grupos g ON g.id=t.grupo_id WHERE t.id=$1',[req.params.id]);if(!antiga)return res.status(404).json({error:'Tarefa não encontrada.'});const acesso=await exigirAcessoSetor(req,res,antiga.setor_id,'visualizar');if(!acesso)return;const podeEditar=PERMISSAO_NIVEL[acesso.permissao]>=PERMISSAO_NIVEL.editar||(acesso.permissao==='criar'&&String(antiga.criado_por)===String(req.user.id));if(!podeEditar)return res.status(403).json({error:'Você pode editar apenas tarefas criadas por você.'});const{grupo_id,titulo,responsavel_id,responsavel,status,prioridade,prazo,cronograma_inicio,cronograma_fim,observacoes}=req.body;const novoGrupoId=cleanId(grupo_id);if(!novoGrupoId)return res.status(400).json({error:'Grupo inválido.'});const novoSetorId=await setorIdPorGrupo(novoGrupoId);if(!novoSetorId)return res.status(400).json({error:'Grupo não encontrado.'});if(String(novoSetorId)!==String(antiga.setor_id))return res.status(403).json({error:'Não é permitido mover a tarefa para outro setor por esta operação.'});const respId=cleanId(responsavel_id),respNome=respId?await getUserNameById(respId):(responsavel||'');const tarefa=await get(`UPDATE tarefas SET grupo_id=$1,titulo=$2,responsavel=$3,responsavel_id=$4,status=$5,prioridade=$6,prazo=$7,cronograma_inicio=$8,cronograma_fim=$9,observacoes=$10,atualizado_em=CURRENT_TIMESTAMP WHERE id=$11 RETURNING *`,[novoGrupoId,titulo,respNome||'',respId,status||'Não iniciado',prioridade||'Média',cleanDate(prazo),cleanDate(cronograma_inicio),cleanDate(cronograma_fim),observacoes||'',req.params.id]);res.json(tarefa);}catch(err){res.status(500).json({error:'Erro ao atualizar tarefa.',details:err.message});}});
router.delete('/api/tarefas/:id',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const t=await get('SELECT t.criado_por,g.setor_id FROM tarefas t JOIN grupos g ON g.id=t.grupo_id WHERE t.id=$1',[req.params.id]);if(!t)return res.status(404).json({error:'Tarefa não encontrada.'});const acesso=await exigirAcessoSetor(req,res,t.setor_id,'visualizar');if(!acesso)return;const pode=PERMISSAO_NIVEL[acesso.permissao]>=PERMISSAO_NIVEL.gerenciar||(acesso.permissao==='criar'&&String(t.criado_por)===String(req.user.id));if(!pode)return res.status(403).json({error:'Sem permissão para excluir esta tarefa.'});await query('DELETE FROM tarefas WHERE id=$1',[req.params.id]);res.json({ok:true});}catch(err){res.status(500).json({error:'Erro ao excluir tarefa.',details:err.message});}});
router.get('/api/tarefas/:id/comentarios',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const sid=await setorIdPorTarefa(req.params.id);if(!sid||!await exigirAcessoSetor(req,res,sid,'visualizar'))return;res.json(await all(`SELECT c.*,u.nome usuario_nome FROM comentarios c LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE tarefa_id=$1 ORDER BY c.id DESC`,[req.params.id]));}catch(err){res.status(500).json({error:'Erro ao listar comentários.',details:err.message});}});
router.post('/api/tarefas/:id/comentarios',auth,requireModuleAccess('atividades'),async(req,res)=>{try{const sid=await setorIdPorTarefa(req.params.id);if(!sid||!await exigirAcessoSetor(req,res,sid,'criar'))return;const{comentario}=req.body;if(!comentario)return res.status(400).json({error:'Comentário obrigatório.'});res.status(201).json(await get('INSERT INTO comentarios(tarefa_id,usuario_id,comentario) VALUES($1,$2,$3) RETURNING *',[req.params.id,req.user.id,comentario]));}catch(err){res.status(500).json({error:'Erro ao criar comentário.',details:err.message});}});

function brDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const parts = String(value).split('-');
    return parts.length >= 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  }
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function brDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function safeFileName(value) {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function drawPill(doc, x, y, text, bg, fg = '#0f172a', width = null) {
  const label = String(text || '-');
  const w = width || Math.max(58, doc.widthOfString(label) + 20);
  doc.roundedRect(x, y, w, 18, 9).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(7.8).text(label, x, y + 5, { width: w, align: 'center' });
  return w;
}

function statusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('feito') || s.includes('concl')) return ['#dcfce7', '#047857'];
  if (s.includes('andamento')) return ['#ffedd5', '#c2410c'];
  if (s.includes('aguard')) return ['#e0f2fe', '#0369a1'];
  if (s.includes('cancel')) return ['#e5e7eb', '#374151'];
  return ['#f1f5f9', '#334155'];
}

function priorityColor(prioridade) {
  const p = String(prioridade || '').toLowerCase();
  if (p.includes('alta')) return ['#fee2e2', '#b91c1c'];
  if (p.includes('baixa')) return ['#dcfce7', '#047857'];
  return ['#fef3c7', '#92400e'];
}


function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function pdfMode(totalTasks, totalTextLength = 0) {
  const density = totalTasks + Math.ceil(totalTextLength / 380);
  if (density <= 6) return 'visual';
  if (density <= 18) return 'executivo';
  return 'compacto';
}

function taskIsLate(t) {
  if (!t.prazo || t.status === 'Feito') return false;
  return String(t.prazo).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function periodLabel(periodo) {
  return {
    hoje: 'Hoje',
    semana: 'Semana atual',
    mes: 'Mês atual',
    todos: 'Todas as tarefas'
  }[periodo || 'todos'] || 'Todas as tarefas';
}

function periodSql(alias = 't', periodo = 'todos') {
  const field = `${alias}.prazo`;
  if (periodo === 'hoje') return `AND ${field} = CURRENT_DATE`;
  if (periodo === 'semana') return `AND ${field} BETWEEN date_trunc('week', CURRENT_DATE)::date AND (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date`;
  if (periodo === 'mes') return `AND ${field} BETWEEN date_trunc('month', CURRENT_DATE)::date AND (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date`;
  return '';
}

function drawMiniHeader(doc, title, subtitle, userName, pageW, opts = {}) {
  const blue = '#0b2f6b';
  doc.rect(0, 0, pageW, 46).fill('#ffffff');
  doc.roundedRect(28, 13, 32, 24, 7).fill(blue);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text('M', 28, 19, { width: 32, align: 'center' });
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(13).text('SUPERMERCADO MANAÍRA', 70, 13, { width: 230, ellipsis: true });
  doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(6.5).text('GESTÃO INTERNA DE TAREFAS', 72, 30);
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(opts.titleSize || 17).text(title, 268, 9, { width: 310, align: 'center', ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.8).text(subtitle, 268, 30, { width: 310, align: 'center', ellipsis: true });
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7)
    .text(`Data: ${brDate(new Date())}`, 648, 10)
    .text(`Gerado por: ${userName || 'Usuário'}`, 648, 24);
}

function drawPillSmart(doc, x, y, text, bg, fg = '#0f172a', width = null, fontSize = 7.2) {
  const label = String(text || '-');
  const w = width || Math.max(50, Math.min(92, doc.widthOfString(label) + 16));
  doc.roundedRect(x, y, w, 15, 7.5).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(fontSize).text(label, x, y + 4, { width: w, align: 'center', ellipsis: true });
  return w;
}

function drawMetric(doc, x, y, w, label, value, color) {
  doc.roundedRect(x, y, w, 44, 11).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(16).text(String(value), x + 8, y + 8, { width: w - 16, align: 'center' });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.2).text(label, x + 6, y + 27, { width: w - 12, align: 'center', ellipsis: true });
}

function drawTaskVisual(doc, t, index, x, y, w, mode = 'executivo') {
  const compact = mode === 'compacto';
  const h = compact ? 42 : mode === 'executivo' ? 56 : 68;
  const status = statusColor(t.status);
  const priority = priorityColor(t.prioridade);
  const late = t.atrasada || taskIsLate(t);
  doc.roundedRect(x, y, w, h, 10).fill('#ffffff').strokeColor(late ? '#fecaca' : '#dbeafe').lineWidth(1).stroke();
  doc.roundedRect(x, y, 6, h, 3).fill(late ? '#ef4444' : (t.grupo_cor || t.setor_cor || '#2563eb'));
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(compact ? 8.4 : 9.2)
    .text(`${index}. ${t.titulo || '-'}`, x + 13, y + 8, { width: w - 24, height: compact ? 12 : 22, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica').fontSize(compact ? 6.8 : 7.5)
    .text(`Resp.: ${t.responsavel_nome || t.responsavel || 'Sem responsável'}`, x + 13, y + (compact ? 23 : 31), { width: 138, ellipsis: true })
    .text(`Prazo: ${brDate(t.prazo)}`, x + 154, y + (compact ? 23 : 31), { width: 78 });
  drawPillSmart(doc, x + w - 148, y + (compact ? 20 : 27), t.status || '-', status[0], status[1], 76, 6.6);
  drawPillSmart(doc, x + w - 66, y + (compact ? 20 : 27), t.prioridade || '-', priority[0], priority[1], 54, 6.6);
  if (!compact) {
    doc.fillColor('#334155').font('Helvetica').fontSize(7)
      .text(t.observacoes || 'Sem observações.', x + 13, y + 47, { width: w - 26, height: mode === 'visual' ? 15 : 8, ellipsis: true });
  }
  return h;
}

function drawTaskTableRow(doc, t, x, y, widths, rowH, index, fontSize = 7) {
  const late = t.atrasada || taskIsLate(t);
  const priority = priorityColor(t.prioridade);
  const status = statusColor(t.status);
  doc.rect(x, y, widths.reduce((a, b) => a + b, 0), rowH).fill(index % 2 ? '#ffffff' : '#f8fafc').strokeColor('#e2e8f0').stroke();
  doc.fillColor(late ? '#dc2626' : '#0f172a').font('Helvetica-Bold').fontSize(fontSize)
    .text(String(t.titulo || '-'), x + 6, y + 6, { width: widths[0] - 12, height: rowH - 10, ellipsis: true });
  doc.fillColor('#334155').font('Helvetica').fontSize(fontSize)
    .text(String(t.responsavel_nome || t.responsavel || '-'), x + widths[0] + 6, y + 6, { width: widths[1] - 12, ellipsis: true })
    .text(brDate(t.prazo), x + widths[0] + widths[1] + 6, y + 6, { width: widths[2] - 12, align: 'center' });
  drawPillSmart(doc, x + widths[0] + widths[1] + widths[2] + 8, y + 5, t.status || '-', status[0], status[1], widths[3] - 16, 6.2);
  drawPillSmart(doc, x + widths[0] + widths[1] + widths[2] + widths[3] + 8, y + 5, t.prioridade || '-', priority[0], priority[1], widths[4] - 16, 6.2);
  doc.fillColor('#334155').font('Helvetica').fontSize(fontSize - .2)
    .text(String(t.observacoes || ''), x + widths.slice(0, 5).reduce((a, b) => a + b, 0) + 6, y + 6, { width: widths[5] - 12, height: rowH - 10, ellipsis: true });
}

function addSmartPage(doc, pageW, pageH, title, subtitle, userName) {
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
  doc.rect(0, 0, pageW, pageH).fill('#f8fbff');
  drawMiniHeader(doc, title, subtitle, userName, pageW, { titleSize: 14 });
  return 66;
}

function renderGroupPdf(doc, grupo, tarefas, req, options = {}) {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const blue = '#0b2f6b';
  const accent = grupo.cor || grupo.setor_cor || '#2563eb';
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === 'Feito').length;
  const andamento = tarefas.filter(t => String(t.status || '').toLowerCase().includes('andamento')).length;
  const atrasadas = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = tarefas.filter(t => t.prioridade === 'Alta').length;
  const mode = options.mode || pdfMode(total, tarefas.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0));
  const pctDone = pct(concluidas, total);

  doc.rect(0, 0, pageW, pageH).fill('#f8fbff');
  drawMiniHeader(doc, 'MAPA DE TAREFAS DO GRUPO', `${grupo.setor_nome || ''} • ${periodLabel(options.periodo)}`, req.user.nome, pageW);

  let y = 66;
  doc.roundedRect(28, y, 785, 58, 16).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.roundedRect(44, y + 14, 34, 30, 10).fill(accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('G', 44, y + 22, { width: 34, align: 'center' });
  doc.fillColor(blue).font('Helvetica-Bold').fontSize(17).text(grupo.nome, 92, y + 11, { width: 375, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.2).text(`Setor: ${grupo.setor_nome}`, 94, y + 35, { width: 330, ellipsis: true });
  drawMetric(doc, 480, y + 7, 72, 'Total', total, blue);
  drawMetric(doc, 560, y + 7, 72, 'Concluídas', concluidas, '#047857');
  drawMetric(doc, 640, y + 7, 72, 'Atrasadas', atrasadas, '#dc2626');
  drawMetric(doc, 720, y + 7, 72, 'Conclusão', `${pctDone}%`, '#2563eb');
  y += 74;

  if (mode !== 'compacto') {
    doc.roundedRect(28, y, 785, 48, 14).fill('#ffffff').strokeColor('#dbeafe').stroke();
    drawMetric(doc, 44, y + 6, 96, 'Em andamento', andamento, '#f97316');
    drawMetric(doc, 152, y + 6, 96, 'Alta prioridade', alta, '#b91c1c');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('Progresso do grupo', 290, y + 9);
    doc.roundedRect(290, y + 27, 220, 12, 6).fill('#e2e8f0');
    doc.roundedRect(290, y + 27, Math.max(8, 220 * pctDone / 100), 12, 6).fill('#22c55e');
    doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7).text(`${pctDone}% concluído`, 520, y + 26);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('Modo automático', 628, y + 9);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(mode === 'visual' ? 'Visual: poucas tarefas' : 'Executivo: volume médio', 628, y + 27, { width: 150 });
    y += 64;
  }

  doc.fillColor(blue).font('Helvetica-Bold').fontSize(12).text('Tarefas', 34, y);
  y += 18;
  if (!tarefas.length) {
    doc.roundedRect(34, y, 770, 64, 14).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(12).text('Nenhuma tarefa encontrada para este filtro.', 34, y + 24, { width: 770, align: 'center' });
    return;
  }

  if (mode === 'visual') {
    const cardW = 372, leftX = 34, rightX = 432;
    tarefas.forEach((t, i) => {
      const colX = i % 2 === 0 ? leftX : rightX;
      if (i % 2 === 0 && i > 0) y += 78;
      if (y > 505) y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome);
      drawTaskVisual(doc, t, i + 1, colX, y, cardW, 'visual');
    });
  } else if (mode === 'executivo') {
    const cardW = 372, leftX = 34, rightX = 432;
    tarefas.forEach((t, i) => {
      const colX = i % 2 === 0 ? leftX : rightX;
      if (i % 2 === 0 && i > 0) y += 64;
      if (y > 515) y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome);
      drawTaskVisual(doc, t, i + 1, colX, y, cardW, 'executivo');
    });
  } else {
    const widths = [245, 92, 72, 88, 70, 202];
    const x = 34;
    const rowH = 28;
    const header = () => {
      doc.rect(x, y, widths.reduce((a, b) => a + b, 0), 24).fill(blue);
      const heads = ['Tarefa', 'Responsável', 'Prazo', 'Status', 'Prior.', 'Observações'];
      let cx = x;
      heads.forEach((h, i) => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.2).text(h, cx + 5, y + 8, { width: widths[i] - 10, align: i === 2 ? 'center' : 'left' });
        cx += widths[i];
      });
      y += 24;
    };
    header();
    tarefas.forEach((t, i) => {
      if (y > 542) { y = addSmartPage(doc, pageW, pageH, `GRUPO: ${grupo.nome}`, `${grupo.setor_nome || ''} • continuação`, req.user.nome); header(); }
      drawTaskTableRow(doc, t, x, y, widths, rowH, i, 6.8);
      y += rowH;
    });
  }
}

async function getGroupTasks(grupoId, periodo = 'todos', status = '', busca = '', responsavel = '') {
  const params = [grupoId];
  const filters = ['t.grupo_id = $1'];
  if (status) { params.push(status); filters.push(`t.status = $${params.length}`); }
  if (busca) { params.push(`%${busca}%`); filters.push(`(t.titulo ILIKE $${params.length} OR COALESCE(t.observacoes,'') ILIKE $${params.length} OR COALESCE(t.responsavel,'') ILIKE $${params.length})`); }
  if (responsavel) { params.push(`%${responsavel}%`); filters.push(`COALESCE(t.responsavel,'') ILIKE $${params.length}`); }
  const period = periodSql('t', periodo).replace(/^AND /, '');
  if (period) filters.push(period);
  return all(`
    SELECT t.*, COALESCE(u.nome, NULLIF(TRIM(t.responsavel), ''), 'Sem responsável') AS responsavel_nome, g.cor AS grupo_cor,
      CASE WHEN t.status <> 'Feito' AND t.prazo IS NOT NULL AND t.prazo < CURRENT_DATE THEN TRUE ELSE FALSE END AS atrasada
    FROM tarefas t
    JOIN grupos g ON g.id = t.grupo_id
    LEFT JOIN usuarios u ON u.id = t.responsavel_id
    WHERE ${filters.join(' AND ')}
    ORDER BY CASE t.prioridade WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 WHEN 'Baixa' THEN 3 ELSE 4 END,
      t.prazo ASC NULLS LAST, t.ordem ASC, t.id ASC
  `, params);
}



// =========================
// PDF v2.2 - impressão inteligente em A4 retrato
// Evita páginas extras, reduz automaticamente o layout e só quebra página quando necessário.
// =========================
const PDF_PRINT = {
  w: 595.28,
  h: 841.89,
  margin: 28,
  footerY: 802,
  blue: '#0b2f6b',
  soft: '#f8fbff'
};

function pdfDensityMode(totalTasks, totalTextLength = 0) {
  const density = totalTasks + Math.ceil(totalTextLength / 520);
  if (density <= 5) return 'visual';
  if (density <= 18) return 'executivo';
  return 'compacto';
}

function addPrintPage(doc, title, subtitle, userName, compactHeader = false) {
  doc.addPage({ size: 'A4', margin: PDF_PRINT.margin });
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PDF_PRINT.soft);
  const y0 = 18;
  doc.roundedRect(24, y0, 42, 30, 8).fill(PDF_PRINT.blue);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('M', 24, y0 + 8, { width: 42, align: 'center' });
  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(11).text('SUPERMERCADO MANAÍRA', 74, y0 + 1, { width: 190, ellipsis: true });
  doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(6.4).text('GESTÃO INTERNA DE TAREFAS', 75, y0 + 17);
  doc.fillColor('#64748b').font('Helvetica').fontSize(6.6).text(`Gerado em ${brDate(new Date())} • ${userName || 'Usuário'}`, 75, y0 + 29, { width: 230, ellipsis: true });

  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(compactHeader ? 12 : 15)
    .text(title, 285, y0, { width: 280, align: 'right', ellipsis: true });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5)
    .text(subtitle, 285, y0 + (compactHeader ? 17 : 22), { width: 280, align: 'right', ellipsis: true });
  doc.moveTo(24, 58).lineTo(571, 58).strokeColor('#dbeafe').lineWidth(1).stroke();
  return 72;
}

function ensurePrintSpace(doc, y, needed, title, subtitle, userName) {
  if (y + needed <= PDF_PRINT.footerY - 8) return y;
  return addPrintPage(doc, title, subtitle, userName, true);
}

function drawPrintMetric(doc, x, y, w, label, value, color) {
  doc.roundedRect(x, y, w, 42, 10).fill('#ffffff').strokeColor('#dbeafe').lineWidth(1).stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(15).text(String(value), x + 6, y + 8, { width: w - 12, align: 'center' });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.7).text(label, x + 5, y + 28, { width: w - 10, align: 'center', ellipsis: true });
}

function drawPrintSummary(doc, y, items) {
  const x = 28, gap = 8;
  const w = Math.floor((539 - gap * (items.length - 1)) / items.length);
  items.forEach((it, i) => drawPrintMetric(doc, x + i * (w + gap), y, w, it.label, it.value, it.color));
  return y + 54;
}

function truncateText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function drawPrintPill(doc, x, y, text, bg, fg, w) {
  doc.roundedRect(x, y, w, 14, 7).fill(bg);
  doc.fillColor(fg).font('Helvetica-Bold').fontSize(6.1).text(String(text || '-'), x + 3, y + 4, { width: w - 6, align: 'center', ellipsis: true });
}

function drawPrintTaskCard(doc, t, x, y, w, index, mode, accent) {
  const late = t.atrasada || taskIsLate(t);
  const compact = mode === 'compacto';
  const obs = truncateText(t.observacoes || '', compact ? 70 : 140);
  const baseH = compact ? 43 : mode === 'executivo' ? 58 : 76;
  const h = obs && !compact ? baseH + 8 : baseH;
  const status = statusColor(t.status);
  const pri = priorityColor(t.prioridade);
  doc.roundedRect(x, y, w, h, 10).fill('#ffffff').strokeColor(late ? '#fecaca' : '#dbeafe').lineWidth(1).stroke();
  doc.roundedRect(x, y, 6, h, 3).fill(late ? '#ef4444' : accent || '#2563eb');
  doc.fillColor(late ? '#b91c1c' : '#0f172a').font('Helvetica-Bold').fontSize(compact ? 7.6 : 8.7)
    .text(`${index}. ${truncateText(t.titulo || '-', compact ? 70 : 105)}`, x + 12, y + 8, { width: w - 24, height: compact ? 11 : 22, ellipsis: true });
  doc.fillColor('#334155').font('Helvetica').fontSize(compact ? 6.3 : 7)
    .text(`Responsável: ${truncateText(t.responsavel_nome || t.responsavel || 'Sem responsável', 34)}`, x + 12, y + (compact ? 23 : 31), { width: 190, ellipsis: true })
    .text(`Prazo: ${brDate(t.prazo)}`, x + 210, y + (compact ? 23 : 31), { width: 78 });
  drawPrintPill(doc, x + w - 132, y + (compact ? 21 : 29), t.status || '-', status[0], status[1], 72);
  drawPrintPill(doc, x + w - 55, y + (compact ? 21 : 29), t.prioridade || '-', pri[0], pri[1], 46);
  if (obs && !compact) {
    doc.fillColor('#475569').font('Helvetica').fontSize(6.7)
      .text(obs, x + 12, y + 49, { width: w - 24, height: h - 54, ellipsis: true });
  }
  return h;
}

function drawPrintTableHeader(doc, x, y, widths, titleColor = PDF_PRINT.blue) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  doc.roundedRect(x, y, totalW, 22, 7).fill(titleColor);
  const heads = ['Tarefa', 'Resp.', 'Prazo', 'Status', 'Prior.', 'Obs.'];
  let cx = x;
  heads.forEach((h, i) => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.2)
      .text(h, cx + 4, y + 8, { width: widths[i] - 8, align: i === 2 ? 'center' : 'left' });
    cx += widths[i];
  });
  return y + 22;
}

function drawPrintTaskRow(doc, t, x, y, widths, rowH, idx) {
  const status = statusColor(t.status);
  const pri = priorityColor(t.prioridade);
  const late = t.atrasada || taskIsLate(t);
  const totalW = widths.reduce((a, b) => a + b, 0);
  doc.rect(x, y, totalW, rowH).fill(idx % 2 ? '#ffffff' : '#f8fafc').strokeColor('#e2e8f0').lineWidth(.6).stroke();
  doc.fillColor(late ? '#b91c1c' : '#0f172a').font('Helvetica-Bold').fontSize(6.35)
    .text(truncateText(t.titulo || '-', 58), x + 4, y + 6, { width: widths[0] - 8, height: rowH - 8, ellipsis: true });
  let cx = x + widths[0];
  doc.fillColor('#334155').font('Helvetica').fontSize(6.2)
    .text(truncateText(t.responsavel_nome || t.responsavel || '-', 18), cx + 4, y + 6, { width: widths[1] - 8, ellipsis: true });
  cx += widths[1];
  doc.text(brDate(t.prazo), cx + 3, y + 6, { width: widths[2] - 6, align: 'center' });
  cx += widths[2];
  drawPrintPill(doc, cx + 3, y + 5, t.status || '-', status[0], status[1], widths[3] - 6);
  cx += widths[3];
  drawPrintPill(doc, cx + 3, y + 5, t.prioridade || '-', pri[0], pri[1], widths[4] - 6);
  cx += widths[4];
  doc.fillColor('#475569').font('Helvetica').fontSize(6.1)
    .text(truncateText(t.observacoes || '', 68), cx + 4, y + 6, { width: widths[5] - 8, height: rowH - 8, ellipsis: true });
}

function drawFooterPages(doc, footerText) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(24, PDF_PRINT.footerY - 8).lineTo(571, PDF_PRINT.footerY - 8).strokeColor('#dbeafe').lineWidth(1).stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6.5)
      .text(footerText, 28, PDF_PRINT.footerY, { width: 360, ellipsis: true });
    doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(6.5)
      .text(`Página ${i + 1} de ${range.count}`, 470, PDF_PRINT.footerY, { width: 95, align: 'right' });
  }
}

function renderGroupPdfV22(doc, grupo, tarefas, req, options = {}) {
  const totalText = tarefas.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
  const mode = pdfDensityMode(tarefas.length, totalText);
  const title = 'RELATÓRIO DO GRUPO';
  const subtitle = `${grupo.setor_nome || ''} • ${grupo.nome || ''} • ${periodLabel(options.periodo)}`;
  let y = addPrintPage(doc, title, subtitle, req.user.nome);
  const total = tarefas.length;
  const concluidas = tarefas.filter(t => t.status === 'Feito').length;
  const atrasadas = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = tarefas.filter(t => t.prioridade === 'Alta').length;
  y = drawPrintSummary(doc, y, [
    { label: 'Total', value: total, color: PDF_PRINT.blue },
    { label: 'Concluídas', value: concluidas, color: '#047857' },
    { label: 'Atrasadas', value: atrasadas, color: '#dc2626' },
    { label: 'Conclusão', value: `${pct(concluidas, total)}%`, color: '#2563eb' }
  ]);

  doc.roundedRect(28, y, 539, 48, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
  doc.roundedRect(42, y + 10, 26, 26, 8).fill(grupo.cor || grupo.setor_cor || '#2563eb');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('G', 42, y + 17, { width: 26, align: 'center' });
  doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(12).text(truncateText(grupo.nome, 55), 80, y + 9, { width: 300, ellipsis: true });
  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Modo automático: ${mode} • Alta prioridade: ${alta}`, 80, y + 28, { width: 330, ellipsis: true });
  doc.roundedRect(414, y + 20, 120, 9, 4).fill('#e2e8f0');
  doc.roundedRect(414, y + 20, Math.max(6, 120 * pct(concluidas, total) / 100), 9, 4).fill('#22c55e');
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(6.5).text(`${pct(concluidas, total)}%`, 540, y + 18, { width: 20 });
  y += 62;

  if (!tarefas.length) {
    doc.roundedRect(28, y, 539, 58, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text('Nenhuma tarefa encontrada para este filtro.', 28, y + 22, { width: 539, align: 'center' });
    return;
  }

  if (mode === 'visual' || mode === 'executivo') {
    tarefas.forEach((t, i) => {
      const h = mode === 'visual' ? 84 : 65;
      y = ensurePrintSpace(doc, y, h + 8, title, subtitle, req.user.nome);
      const realH = drawPrintTaskCard(doc, t, 28, y, 539, i + 1, mode, grupo.cor || grupo.setor_cor);
      y += realH + 8;
    });
  } else {
    const widths = [180, 64, 50, 64, 50, 131];
    const x = 28, rowH = 24;
    y = drawPrintTableHeader(doc, x, y, widths);
    tarefas.forEach((t, i) => {
      if (y + rowH > PDF_PRINT.footerY - 8) {
        y = addPrintPage(doc, title, subtitle + ' • continuação', req.user.nome, true);
        y = drawPrintTableHeader(doc, x, y, widths);
      }
      drawPrintTaskRow(doc, t, x, y, widths, rowH, i);
      y += rowH;
    });
  }
}

function renderSectorPdfV22(doc, setor, grupos, allTasks, req, options = {}) {
  const totalText = allTasks.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
  const mode = pdfDensityMode(allTasks.length, totalText);
  const title = 'RELATÓRIO DO SETOR';
  const filtro = `${periodLabel(options.periodo)}${options.status ? ' • ' + options.status : ''}${options.responsavel ? ' • ' + options.responsavel : ''}${options.busca ? ' • Busca: ' + options.busca : ''}`;
  const subtitle = `${setor.nome} • ${filtro}`;
  let y = addPrintPage(doc, title, subtitle, req.user.nome);
  const total = allTasks.length;
  const concluidas = allTasks.filter(t => t.status === 'Feito').length;
  const atrasadas = allTasks.filter(t => t.atrasada || taskIsLate(t)).length;
  const alta = allTasks.filter(t => t.prioridade === 'Alta').length;
  y = drawPrintSummary(doc, y, [
    { label: 'Total', value: total, color: PDF_PRINT.blue },
    { label: 'Concluídas', value: concluidas, color: '#047857' },
    { label: 'Atrasadas', value: atrasadas, color: '#dc2626' },
    { label: 'Alta prioridade', value: alta, color: '#b91c1c' },
    { label: 'Conclusão', value: `${pct(concluidas, total)}%`, color: '#2563eb' }
  ]);

  if (!allTasks.length) {
    doc.roundedRect(28, y, 539, 58, 12).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10).text('Nenhuma tarefa encontrada para os filtros aplicados.', 28, y + 22, { width: 539, align: 'center' });
    return;
  }

  for (const grupo of grupos) {
    const tarefas = grupo.tarefas || [];
    if (!tarefas.length) continue;
    y = ensurePrintSpace(doc, y, 54, title, `${setor.nome} • continuação`, req.user.nome);
    doc.roundedRect(28, y, 539, 30, 8).fill('#ffffff').strokeColor('#dbeafe').stroke();
    doc.roundedRect(40, y + 8, 10, 14, 4).fill(grupo.cor || setor.cor || PDF_PRINT.blue);
    doc.fillColor(PDF_PRINT.blue).font('Helvetica-Bold').fontSize(9.5).text(`${truncateText(grupo.nome, 52)} (${tarefas.length})`, 58, y + 9, { width: 285, ellipsis: true });
    const gDone = tarefas.filter(t => t.status === 'Feito').length;
    const gLate = tarefas.filter(t => t.atrasada || taskIsLate(t)).length;
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.8).text(`${gDone} concluídas • ${gLate} atrasadas`, 390, y + 10, { width: 155, align: 'right' });
    y += 38;

    if (mode === 'visual') {
      tarefas.forEach((t, i) => {
        y = ensurePrintSpace(doc, y, 76, title, `${setor.nome} • ${grupo.nome}`, req.user.nome);
        const h = drawPrintTaskCard(doc, t, 38, y, 519, i + 1, 'executivo', grupo.cor || setor.cor);
        y += h + 7;
      });
    } else if (mode === 'executivo') {
      tarefas.forEach((t, i) => {
        y = ensurePrintSpace(doc, y, 58, title, `${setor.nome} • ${grupo.nome}`, req.user.nome);
        const h = drawPrintTaskCard(doc, t, 38, y, 519, i + 1, 'compacto', grupo.cor || setor.cor);
        y += h + 6;
      });
    } else {
      const widths = [174, 62, 48, 60, 48, 107];
      const x = 38, rowH = 22;
      y = drawPrintTableHeader(doc, x, y, widths, grupo.cor || setor.cor || PDF_PRINT.blue);
      tarefas.forEach((t, i) => {
        if (y + rowH > PDF_PRINT.footerY - 8) {
          y = addPrintPage(doc, title, `${setor.nome} • ${grupo.nome} • continuação`, req.user.nome, true);
          y = drawPrintTableHeader(doc, x, y, widths, grupo.cor || setor.cor || PDF_PRINT.blue);
        }
        drawPrintTaskRow(doc, t, x, y, widths, rowH, i);
        y += rowH;
      });
      y += 10;
    }
  }
}

router.get('/api/grupos/:id/relatorio-pdf', authPdf, requireModuleAccessPdf('atividades'), async (req, res) => {
  try {
    const sid = await setorIdPorGrupo(req.params.id);
    if (!sid || !await exigirAcessoSetor(req, res, sid, 'visualizar')) return;
    const { periodo = 'todos', status = '', busca = '', responsavel = '' } = req.query;
    const grupo = await get(`
      SELECT g.*, s.nome AS setor_nome, s.descricao AS setor_descricao, s.cor AS setor_cor
      FROM grupos g JOIN setores s ON s.id = g.setor_id WHERE g.id = $1
    `, [req.params.id]);
    if (!grupo) return res.status(404).send('Grupo não encontrado.');
    const tarefas = await getGroupTasks(req.params.id, periodo, status, busca, responsavel);
    const filename = `grupo-${safeFileName(grupo.setor_nome)}-${safeFileName(grupo.nome)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margin: 28, bufferPages: true });
    doc.pipe(res);
    renderGroupPdfV22(doc, grupo, tarefas, req, { periodo, status, busca, responsavel });
    drawFooterPages(doc, 'Relatório do grupo para execução operacional.');
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar relatório PDF do grupo.');
  }
});

router.get('/api/setores/:id/relatorio-pdf', authPdf, requireModuleAccessPdf('atividades'), async (req, res) => {
  try {
    if (!await exigirAcessoSetor(req, res, req.params.id, 'visualizar')) return;
    const { periodo = 'todos', status = '', busca = '', responsavel = '' } = req.query;
    const setor = await get('SELECT * FROM setores WHERE id = $1', [req.params.id]);
    if (!setor) return res.status(404).send('Setor não encontrado.');
    const grupos = await all('SELECT * FROM grupos WHERE setor_id = $1 ORDER BY ordem, id', [req.params.id]);
    let allTasks = [];
    for (const grupo of grupos) {
      grupo.setor_nome = setor.nome;
      grupo.setor_descricao = setor.descricao;
      grupo.setor_cor = setor.cor;
      grupo.tarefas = await getGroupTasks(grupo.id, periodo, status, busca, responsavel);
      allTasks.push(...grupo.tarefas.map(t => ({ ...t, grupo_nome: grupo.nome })));
    }
    const totalText = allTasks.reduce((n, t) => n + String(t.titulo || '').length + String(t.observacoes || '').length, 0);
    const mode = pdfMode(allTasks.length, totalText);
    const filename = `setor-${safeFileName(setor.nome)}-${safeFileName(periodLabel(periodo))}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margin: 28, bufferPages: true });
    doc.pipe(res);
    renderSectorPdfV22(doc, setor, grupos, allTasks, req, { periodo, status, busca, responsavel, mode });
    drawFooterPages(doc, 'Relatório do setor para impressão e acompanhamento das equipes.');
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao gerar relatório PDF do setor.');
  }
});


// =========================
// Módulo Ordem de Serviço Operacional
// =========================

module.exports=router;
