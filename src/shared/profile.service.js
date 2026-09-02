const HIERARQUIA = {
  colaborador: 1,
  encarregado: 2,
  gerente: 3,
  administrador: 4,
  administrador_principal: 5
};
const PERFIS_VALIDOS = new Set(Object.keys(HIERARQUIA));
function perfilValido(perfil){ return PERFIS_VALIDOS.has(String(perfil || '').toLowerCase()); }
function nivelPerfil(perfil){ return HIERARQUIA[String(perfil || '').toLowerCase()] || 0; }
function canManage(req){ return nivelPerfil(req.user?.perfil) >= HIERARQUIA.encarregado; }
function canCreateSector(req){ return nivelPerfil(req.user?.perfil) >= HIERARQUIA.encarregado; }
function isPrincipal(req){ return String(req.user?.perfil || '').toLowerCase() === 'administrador_principal'; }
function requireManager(req,res,next){ if(!canManage(req)) return res.status(403).json({error:'Seu perfil não permite gerenciar usuários.'}); next(); }
function requireManagerPdf(req,res,next){ if(!canManage(req)) return res.status(403).send('Seu perfil não permite acessar este relatório.'); next(); }
module.exports={HIERARQUIA,perfilValido,nivelPerfil,canManage,canCreateSector,isPrincipal,requireManager,requireManagerPdf};
