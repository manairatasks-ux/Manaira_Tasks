const service = require('./modulo.service');
function error(res, e, message) { return res.status(e.status || 500).json({ error: e.status ? e.message : message, ...(e.status ? {} : { details: e.message }) }); }
async function me(req, res) { try { res.json({ modulos: await service.myModules(req.user) }); } catch (e) { error(res, e, 'Erro ao buscar módulos do usuário.'); } }
async function adminData(req, res) { try { res.json(await service.adminData(req.user)); } catch (e) { error(res, e, 'Erro ao carregar acessos aos módulos.'); } }
async function updateUserModules(req, res) { try { res.json(await service.updateUserModules(req.params.id, req.body.modulos, req.user)); } catch (e) { error(res, e, 'Erro ao atualizar acessos aos módulos.'); } }
module.exports = { me, adminData, updateUserModules };
