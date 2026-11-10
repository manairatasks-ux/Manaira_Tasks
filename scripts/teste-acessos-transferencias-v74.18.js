// Teste isolado do contrato de salvamento de permissões (sem banco real).
const assert = require('node:assert/strict');
const path = require('node:path');
const modelPath = require.resolve('../src/modules/modulos/modulo.model');
let armazenados = ['atividades'];
const modelMock = {
  userById: async () => ({ id: 20, perfil: 'colaborador', administrador_principal: false }),
  listActive: async () => ['atividades','os','administracao','transferencias_avaria'].map(codigo => ({codigo})),
  userModuleCodes: async () => [...armazenados],
  replaceUserModules: async (_id, codigos) => { armazenados = [...codigos]; }
};
require.cache[modelPath] = {id:modelPath, filename:modelPath, loaded:true, exports:modelMock};
const service = require('../src/modules/modulos/modulo.service');
(async () => {
  const admin = { id:1, perfil:'administrador_principal', administrador_principal:true };
  const r1 = await service.updateUserModules(20, ['atividades','transferencias_avaria'], admin);
  assert.deepEqual(r1.modulos, ['atividades','transferencias_avaria']);
  assert.deepEqual(armazenados, ['atividades','transferencias_avaria']);
  await assert.rejects(() => service.updateUserModules(20, ['atividades','codigo_inexistente'], admin), /Módulo não reconhecido/);
  assert.deepEqual(armazenados, ['atividades','transferencias_avaria'], 'Falha de validação não deve apagar acessos');
  console.log('OK: permissão de transferências salva; código inválido é rejeitado sem apagar acessos.');
})().catch(e => { console.error(e); process.exitCode = 1; });
