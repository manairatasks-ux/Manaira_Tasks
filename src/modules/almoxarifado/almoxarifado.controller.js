const service = require('./almoxarifado.service');
function error(res, e, fallback) { return res.status(e.status || 500).json({ error: e.status ? e.message : fallback, ...(e.status ? {} : { details: e.message }) }); }
async function dashboard(req, res) { try { res.json(await service.dashboard()); } catch (e) { error(res, e, 'Erro ao carregar o almoxarifado.'); } }
async function listItems(req, res) { try { res.json(await service.listItems(req.query)); } catch (e) { error(res, e, 'Erro ao listar itens.'); } }
async function createItem(req, res) { try { res.status(201).json(await service.createItem(req.body, req.user)); } catch (e) { error(res, e, 'Erro ao cadastrar item.'); } }
async function updateItem(req, res) { try { res.json(await service.updateItem(req.params.id, req.body)); } catch (e) { error(res, e, 'Erro ao atualizar item.'); } }
async function entry(req, res) { try { res.status(201).json(await service.movement('ENTRADA', req.body, req.user)); } catch (e) { error(res, e, 'Erro ao registrar entrada.'); } }
async function exit(req, res) { try { res.status(201).json(await service.movement('SAIDA', req.body, req.user)); } catch (e) { error(res, e, 'Erro ao registrar saída.'); } }
async function history(req, res) { try { res.json(await service.history(req.query)); } catch (e) { error(res, e, 'Erro ao carregar histórico.'); } }
module.exports = { dashboard, listItems, createItem, updateItem, entry, exit, history };
