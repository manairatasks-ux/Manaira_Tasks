const model=require('./rh.model');
const STATUS=['Recebido','Em análise','Aguardando colaborador','Em andamento','Concluído','Cancelado'];
const PRIORIDADES=['Baixa','Normal','Alta','Urgente'];
function fail(msg,status=400){const e=new Error(msg);e.status=status;throw e;}
function text(v){return String(v??'').trim();}
async function dashboard(){return model.dashboard();}
async function types(ativos=false){return model.listTypes({ativos});}
async function createType(body){const nome=text(body.nome);if(!nome)fail('Informe o nome do tipo.');return model.createType({nome,descricao:text(body.descricao),ordem:body.ordem});}
async function updateType(id,body){const nome=text(body.nome);if(!nome)fail('Informe o nome do tipo.');return model.updateType(id,{nome,descricao:text(body.descricao),ordem:body.ordem,ativo:body.ativo !== false && body.ativo !== 'false'});}
async function requests(q){return model.listRequests({busca:text(q.busca),status:text(q.status),tipoId:text(q.tipo_id)});}
async function detail(id){const d=await model.getRequest(id);if(!d)fail('Solicitação não encontrada.',404);return d;}
async function create(body,user=null,origem='PUBLICO'){
  const solicitanteNome=text(body.solicitante_nome), descricao=text(body.descricao), tipoId=Number(body.tipo_id);
  if(!solicitanteNome)fail('Informe o nome do solicitante.');
  if(!tipoId)fail('Selecione o tipo da solicitação.');
  if(!descricao)fail('Descreva a solicitação.');
  const tipos=await model.listTypes({ativos:true});
  if(!tipos.some(t=>Number(t.id)===tipoId))fail('Tipo de solicitação inválido.');
  const prioridade=PRIORIDADES.includes(body.prioridade)?body.prioridade:'Normal';
  return model.createRequest({tipoId,solicitanteNome,identificacao:text(body.identificacao),contato:text(body.contato),descricao,prioridade,responsavelId:body.responsavel_id?Number(body.responsavel_id):null,criadoPor:user?.id||null,origem});
}
async function status(id,body,user){if(!STATUS.includes(body.status))fail('Status inválido.');return model.updateStatus(id,body.status,user.id);}
async function assign(id,body,user){return model.assign(id,body.responsavel_id?Number(body.responsavel_id):null,user.id);}
async function comment(id,body,user){const msg=text(body.mensagem);if(!msg)fail('Digite um comentário.');await detail(id);return model.addComment(id,user.id,msg);}
async function responsibles(){return model.responsibles();}
module.exports={dashboard,types,createType,updateType,requests,detail,create,status,assign,comment,responsibles,STATUS,PRIORIDADES};
