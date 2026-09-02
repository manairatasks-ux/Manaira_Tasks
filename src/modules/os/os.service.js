const {get}=require('./os.model'); const {osPortalPassword}=require('../../config/env'); const {cleanId,getUserNameById}=require('../../shared/utils');
function cleanDateTime(value){ return value&&value!==''?value:null; }
function normalizeMinutes(value){ const n=parseInt(value,10); return Number.isFinite(n)&&n>=0?n:null; }
async function generateOsNumber(){ const row=await get(`SELECT COALESCE(MAX(CASE WHEN numero ~ '^OS-[0-9]+$' THEN CAST(SUBSTRING(numero FROM 4) AS INTEGER) ELSE 0 END),0)+1 AS proximo FROM ordens_servico`); return `OS-${String(row?.proximo||1).padStart(5,'0')}`; }
function osOpenFilter(alias='o'){ return `${alias}.status <> 'Concluído'`; }
function checkPortalPassword(password){ return String(password||'')===String(osPortalPassword); }
module.exports={cleanDateTime,normalizeMinutes,generateOsNumber,osOpenFilter,checkPortalPassword,cleanId,getUserNameById};
