const { get } = require('../config/database');
function cleanDate(value){ return value && value !== '' ? value : null; }
function cleanId(value){ if(value===undefined || value===null || value==='') return null; const n=parseInt(value,10); return Number.isFinite(n)&&n>0?n:null; }
async function getNextOrder(table, whereColumn, whereValue){ const result=await get(`SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima_ordem FROM ${table} WHERE ${whereColumn} = $1`,[whereValue]); return result?.proxima_ordem || 1; }
async function getUserNameById(id){ const userId=cleanId(id); if(!userId) return ''; const usuario=await get('SELECT nome FROM usuarios WHERE id = $1 AND ativo = TRUE',[userId]); return usuario?.nome || ''; }
module.exports={cleanDate,cleanId,getNextOrder,getUserNameById};
