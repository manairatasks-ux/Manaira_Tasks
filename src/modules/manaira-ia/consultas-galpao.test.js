const assert=require('node:assert/strict');
const {classify,dateScope}=require('./consultas-galpao');
assert.deepEqual(classify('consegue listar os códigos de barras das saídas de hoje?'),{type:'SAIDA',scope:dateScope('hoje')});
assert.deepEqual(classify('quais foram as saídas de ontem?'),{type:'SAIDA',scope:dateScope('ontem')});
assert.deepEqual(classify('eu falo as saídas','quais foram os lançamentos de hoje?'),{type:'SAIDA',scope:dateScope('hoje')});
assert.deepEqual(classify('listar entradas de 25/11/2026'),{type:'ENTRADA',scope:{from:'2026-11-25',to:'2026-11-25',label:'25/11/2026'}});
assert.equal(classify('como está o galpão?'),null);
console.log('5 testes de consultas e contexto aprovados');
