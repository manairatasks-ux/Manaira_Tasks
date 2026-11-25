const router = require('express').Router();
const { auth } = require('../../middlewares/auth.middleware');
const { get, all, query } = require('../../config/database');
const crypto = require('crypto');
const { detailed } = require('./consultas-galpao');

const safeNum = n => Number(n)||0;
const fmt = n => new Intl.NumberFormat('pt-BR').format(safeNum(n));
const maxDays = n => [7,30,90].includes(Number(n)) ? Number(n) : 30;

async function collect(days=30){
  days=maxDays(days);
  const [summary, movements, topMovements, expiration, recent, trend] = await Promise.all([
    get(`SELECT (SELECT COUNT(*)::int FROM galpao_produtos WHERE ativo=TRUE) produtos,
      (SELECT COALESCE(SUM(e.quantidade),0)::bigint FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE) embalagens,
      (SELECT COALESCE(SUM(e.quantidade::bigint*e.unidades_por_embalagem),0)::bigint FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE) unidades,
      (SELECT COUNT(*)::int FROM galpao_produtos p WHERE p.ativo=TRUE AND NOT EXISTS(SELECT 1 FROM galpao_estoque e WHERE e.produto_id=p.id AND e.quantidade>0)) sem_estoque,
      (SELECT COUNT(*)::int FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE AND e.quantidade>0 AND e.validade<CURRENT_DATE) lotes_vencidos,
      (SELECT COUNT(*)::int FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id WHERE p.ativo=TRUE AND e.quantidade>0 AND e.validade BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days') lotes_vencem_30d`),
    all(`SELECT m.tipo,COUNT(*)::int registros,COALESCE(SUM(m.quantidade),0)::bigint embalagens
         FROM galpao_movimentacoes m WHERE COALESCE(m.estornado,FALSE)=FALSE
         AND m.data_movimento >= CURRENT_DATE-$1::int+1 GROUP BY m.tipo ORDER BY m.tipo`,[days]),
    all(`SELECT p.codigo_barra,p.descricao,m.tipo,
          COALESCE(SUM(m.quantidade),0)::bigint embalagens,COUNT(*)::int operacoes
         FROM galpao_movimentacoes m JOIN galpao_produtos p ON p.id=m.produto_id
         WHERE COALESCE(m.estornado,FALSE)=FALSE AND m.data_movimento>=CURRENT_DATE-$1::int+1
         GROUP BY p.codigo_barra,p.descricao,m.tipo ORDER BY embalagens DESC LIMIT 12`,[days]),
    all(`SELECT p.codigo_barra,p.descricao,e.validade::text,e.quantidade,e.unidades_por_embalagem,
          CASE WHEN e.validade<CURRENT_DATE THEN 'vencido' ELSE 'vence_30d' END alerta
         FROM galpao_estoque e JOIN galpao_produtos p ON p.id=e.produto_id
         WHERE p.ativo=TRUE AND e.quantidade>0 AND e.validade IS NOT NULL
         AND e.validade<=CURRENT_DATE+INTERVAL '30 days'
         ORDER BY e.validade ASC,p.descricao LIMIT 25`),
    all(`SELECT m.tipo,m.data_movimento::text,p.descricao,m.quantidade,m.unidades_por_embalagem
         FROM galpao_movimentacoes m JOIN galpao_produtos p ON p.id=m.produto_id
         WHERE COALESCE(m.estornado,FALSE)=FALSE ORDER BY m.criado_em DESC,m.id DESC LIMIT 8`),
    all(`SELECT TO_CHAR(m.data_movimento,'YYYY-MM-DD') AS dia,m.tipo,COALESCE(SUM(m.quantidade),0)::bigint AS embalagens
         FROM galpao_movimentacoes m WHERE COALESCE(m.estornado,FALSE)=FALSE
         AND m.data_movimento>=CURRENT_DATE-$1::int+1 GROUP BY 1,2 ORDER BY 1`,[days])
  ]);
  return { periodDays:days, generatedAt:new Date().toISOString(), summary:summary||{}, movements,
    topMovements, expiration, recent, trend,
    sources:['galpao_produtos','galpao_estoque','galpao_movimentacoes'],
    notes:['Movimentações estornadas excluídas.', 'Quantidade de movimentações apresentada em embalagens, não em unidades.', 'Validades do estoque incluem somente lotes com saldo positivo e produto ativo.'] };
}
function advise(data){
  const s=data.summary||{};const entries=data.movements.find(x=>x.tipo==='ENTRADA');const exits=data.movements.find(x=>x.tipo==='SAIDA');
  const recommendations=[];
  if(safeNum(s.lotes_vencidos)) recommendations.push({priority:'Alta',title:'Conferir lotes vencidos',reason:`Há ${fmt(s.lotes_vencidos)} lote(s) com saldo e validade vencida.`,action:'Conferir fisicamente e seguir a política de produtos vencidos.'});
  if(safeNum(s.lotes_vencem_30d)) recommendations.push({priority:'Média',title:'Planejar consumo dos próximos vencimentos',reason:`Há ${fmt(s.lotes_vencem_30d)} lote(s) com vencimento nos próximos 30 dias.`,action:'Verificar giro, validade e prioridade de utilização.'});
  if(safeNum(s.sem_estoque)) recommendations.push({priority:'Média',title:'Revisar cadastro sem saldo',reason:`Há ${fmt(s.sem_estoque)} produto(s) ativo(s) sem estoque.`,action:'Conferir necessidade de reposição e consistência dos cadastros.'});
  if(!recommendations.length) recommendations.push({priority:'Rotina',title:'Acompanhar a movimentação',reason:`No período, foram registradas ${fmt(entries?.embalagens||0)} embalagens de entrada e ${fmt(exits?.embalagens||0)} de saída.`,action:'Monitorar novas movimentações e próximas validades.'});
  return recommendations;
}
function localAnswer(q,d){
  const question=q.toLocaleLowerCase('pt-BR'), s=d.summary, mv=d.movements;
  const en=mv.find(x=>x.tipo==='ENTRADA');const sa=mv.find(x=>x.tipo==='SAIDA');
  if(/venc|validade/.test(question)){
    const rows=d.expiration.slice(0,10).map(x=>`${x.descricao}: ${x.quantidade} embalagem(ns), validade ${x.validade?.slice(0,10)}`).join('\n');
    return `Há ${fmt(s.lotes_vencidos)} lotes vencidos com saldo e ${fmt(s.lotes_vencem_30d)} que vencem nos próximos 30 dias.\n${rows||'Nenhum lote listado nesse recorte.'}`;
  }
  if(/sa[ií]da|retirada/.test(question)) return `Nos últimos ${d.periodDays} dias houve ${fmt(sa?.embalagens||0)} embalagens de saída em ${fmt(sa?.registros||0)} operações. Os valores excluem estornos.`;
  if(/entrada|receb/.test(question)) return `Nos últimos ${d.periodDays} dias houve ${fmt(en?.embalagens||0)} embalagens de entrada em ${fmt(en?.registros||0)} operações. Os valores excluem estornos.`;
  if(/mais moviment|ranking|produto.*mais|top/.test(question)) return `Produtos e tipos com mais embalagens movimentadas nos últimos ${d.periodDays} dias:\n${d.topMovements.slice(0,8).map((x,i)=>`${i+1}. ${x.descricao} — ${x.tipo}: ${fmt(x.embalagens)} embalagens`).join('\n')||'Sem movimentações no período.'}`;
  if(/recomenda|melhor|risco|problema|an[aá]lis/.test(question)) return advise(d).map(x=>`${x.priority}: ${x.title}. ${x.reason} Recomendação: ${x.action}`).join('\n');
  return `Resumo do Galpão: ${fmt(s.produtos)} produtos ativos, ${fmt(s.embalagens)} embalagens em estoque (${fmt(s.unidades)} unidades), ${fmt(s.sem_estoque)} produtos sem saldo, ${fmt(s.lotes_vencidos)} lotes vencidos e ${fmt(s.lotes_vencem_30d)} lotes vencendo em 30 dias. Nos últimos ${d.periodDays} dias: ${fmt(en?.embalagens||0)} embalagens de entrada e ${fmt(sa?.embalagens||0)} de saída.\nVocê também pode perguntar por validades, ranking de produtos, entradas, saídas e recomendações.`;
}
// Integração V74.33: o PC faz conexões SAINTES por HTTPS ao Render.
// O Ollama nunca fica acessível diretamente pela Internet.
const workerEnabled = () => String(process.env.MANAIRA_IA_WORKER_KEY || '').length >= 32;
const safeEqual = (a,b) => {
  const x=Buffer.from(String(a||'')), y=Buffer.from(String(b||''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x,y);
};
function workerAuth(req,res,next){
  if(!workerEnabled())return res.status(503).json({error:'Agente local não configurado.'});
  if(!safeEqual(req.get('x-manaira-ia-worker-key'),process.env.MANAIRA_IA_WORKER_KEY))return res.status(401).json({error:'Não autorizado.'});
  next();
}
async function initIaJobs(){
  await query(`CREATE TABLE IF NOT EXISTS manaira_ia_jobs (
    id UUID PRIMARY KEY, user_id INTEGER NOT NULL, question TEXT NOT NULL,
    context JSONB NOT NULL, fallback TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    lease_id UUID, attempts INTEGER NOT NULL DEFAULT 0,
    answer TEXT, error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes')
  )`);
  await query('CREATE INDEX IF NOT EXISTS manaira_ia_jobs_pending_idx ON manaira_ia_jobs (status,created_at)');
}
// Rotas do agente ANTES da autenticação JWT dos usuários; protegidas por chave exclusiva.
router.post('/worker/claim',workerAuth,async(req,res)=>{
  try {
    // Remover tarefas antigas sem interferir em perguntas em andamento.
    await query("DELETE FROM manaira_ia_jobs WHERE created_at < NOW() - INTERVAL '2 days'");
    // Só uma instância pode reivindicar cada pergunta: atualização atômica.
    const row=await get(`WITH next_job AS (
      SELECT id FROM manaira_ia_jobs
      WHERE expires_at > NOW()
      AND (status='pending' OR (status='processing' AND claimed_at < NOW()-INTERVAL '150 seconds'))
      AND attempts < 3
      ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE manaira_ia_jobs j
      SET status='processing',attempts=j.attempts+1,claimed_at=NOW(),lease_id=$1
      FROM next_job WHERE j.id=next_job.id
      RETURNING j.id,j.question,j.context,j.lease_id`,[crypto.randomUUID()]);
    if(!row)return res.json({job:null});
    res.json({job:{id:row.id,question:row.question,context:row.context,leaseId:row.lease_id}});
  }catch(e){console.error('[Manaíra IA worker claim]',e.message);res.status(500).json({error:'Não foi possível obter a tarefa.'});}
});
router.post('/worker/complete',workerAuth,async(req,res)=>{
  try{
    const id=String(req.body?.id||'');const lease=String(req.body?.leaseId||'');
    if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(lease))return res.status(400).json({error:'Identificação inválida.'});
    const answer=String(req.body?.answer||'').replace(/<think>[\s\S]*?<\/think>/g,'').trim().slice(0,6000);
    const err=String(req.body?.error||'').slice(0,300);
    const done=await get(`UPDATE manaira_ia_jobs
      SET status=$3,answer=$4,error=$5,finished_at=NOW()
      WHERE id=$1 AND lease_id=$2 AND status='processing' AND expires_at>NOW()
      RETURNING id`,[id,lease,answer?'done':'failed',answer||null,answer?null:(err||'Falha no motor local')]);
    if(!done)return res.status(409).json({error:'Tarefa expirada ou já processada.'});
    res.json({ok:true});
  }catch(e){console.error('[Manaíra IA worker complete]',e.message);res.status(500).json({error:'Não foi possível concluir a tarefa.'});}
});
router.get('/worker/health',workerAuth,(req,res)=>res.json({ok:true,model:process.env.MANAIRA_IA_OLLAMA_MODEL||'qwen3.5:4b'}));

// Exclusivo ao administrador principal. Recomenda-se definir MANAIRA_IA_EMAIL
// para restringir a uma única conta, mesmo entre administradores principais.
router.use(auth, (req,res,next)=>{
  const principal = String(req.user?.perfil||'').toLowerCase()==='administrador_principal';
  const emailPermitido = String(process.env.MANAIRA_IA_EMAIL||'').trim().toLowerCase();
  if (!principal) return res.status(403).json({error:'Manaíra IA restrito ao Administrador Principal.'});
  if (!emailPermitido) return next();
  get('SELECT email FROM usuarios WHERE id=$1 AND ativo=TRUE',[req.user.id]).then(row=>{
    if(String(row?.email||'').trim().toLowerCase()!==emailPermitido) return res.status(403).json({error:'Este usuário não está autorizado a utilizar o Manaíra IA.'});
    next();
  }).catch(()=>res.status(500).json({error:'Não foi possível validar o acesso ao Manaíra IA.'}));
});

router.get('/dashboard',async(req,res)=>{
  try{const data=await collect(req.query.periodo);res.json({...data,recommendations:advise(data),engine:process.env.MANAIRA_IA_OLLAMA_URL?'Ollama configurado':'Análises do Board (sem Ollama)'})}
  catch(e){console.error('[Manaira IA dashboard]',e.message);res.status(500).json({error:'Falha ao consultar os dados do Galpão.'});}
});
router.get('/resposta/:id',async(req,res)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).json({error:'ID inválido.'});
  try{
    const row=await get(`SELECT status,answer,fallback,expires_at,created_at FROM manaira_ia_jobs WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);
    if(!row)return res.status(404).json({error:'Pergunta não encontrada.'});
    if(new Date(row.expires_at).getTime()<=Date.now() || row.status==='failed'){
      return res.json({status:'fallback',answer:row.fallback,engine:'Análise por indicadores (Ollama indisponível)'});
    }
    if(row.status==='done')return res.json({status:'done',answer:row.answer,engine:'Qwen3.5 4B · Ollama local'});
    res.json({status:'pending'});
  }catch(e){console.error('[Manaíra IA resposta]',e.message);res.status(500).json({error:'Não foi possível consultar a resposta.'});}
});
router.post('/perguntar',async(req,res)=>{
  const question=String(req.body?.pergunta||'').trim();
  const previous=String(req.body?.perguntaAnterior||'').slice(0,500);
  if(!question||question.length>500)return res.status(400).json({error:'Informe uma pergunta de até 500 caracteres.'});
  try {
    const detail=await detailed(question,previous);
    if(detail)return res.json({...detail,engine:'Consulta direta ao Galpão'});
    const data=await collect(req.body?.periodo);
    const fallback=localAnswer(question,data);
    if(!workerEnabled())return res.json({answer:fallback,engine:'Análise por indicadores · Agente local não configurado',periodDays:data.periodDays,generatedAt:data.generatedAt,sources:data.sources,notes:data.notes});
    const active=await get(`SELECT COUNT(*)::int AS total FROM manaira_ia_jobs WHERE user_id=$1 AND expires_at>NOW() AND status IN ('pending','processing')`,[req.user.id]);
    if(Number(active?.total||0)>=2)return res.status(429).json({error:'Já existem perguntas aguardando a IA. Aguarde a resposta anterior.'});
    const id=crypto.randomUUID();
    // Contexto é preparado pelo servidor, nunca um SQL ou consulta enviada pelo modelo.
    const context={previousQuestion:previous,periodDays:data.periodDays,generatedAt:data.generatedAt,summary:data.summary,movements:data.movements,topMovements:data.topMovements.slice(0,10),expiration:data.expiration.slice(0,15),recent:data.recent.slice(0,6),trend:data.trend.slice(-40),sources:data.sources,notes:data.notes};
    await query(`INSERT INTO manaira_ia_jobs (id,user_id,question,context,fallback) VALUES ($1,$2,$3,$4::jsonb,$5)`,[id,req.user.id,question,JSON.stringify(context),fallback]);
    res.status(202).json({jobId:id,status:'pending',periodDays:data.periodDays,generatedAt:data.generatedAt,sources:data.sources,notes:data.notes});
  }catch(e){console.error('[Manaíra IA pergunta]',e.message);res.status(500).json({error:'Não foi possível consultar os dados do Galpão.'});}
});
router.initIaJobs=initIaJobs;
module.exports=router;
