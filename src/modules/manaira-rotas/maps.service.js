'use strict';
// V72.2: Geoapify (plano gratuito com cadastro próprio, sem Google Cloud).
const {optimize,length}=require('./optimizer');
const key=()=>String(process.env.GEOAPIFY_API_KEY||'').trim();
const hasKey=()=>Boolean(key());
const address=o=>[o.rua,o.numero_endereco,o.complemento,o.bairro,o.cidade,o.uf,o.cep,'Brasil'].filter(Boolean).join(', ');
const finite=n=>Number.isFinite(Number(n));
async function getJSON(url, timeout=15000){
 const response=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'Accept':'application/json','User-Agent':'ManairaBoard-Rotas/72.2'}});
 if(!response.ok){const raw=await response.text().catch(()=>'');throw new Error('Serviço de mapas indisponível (HTTP '+response.status+'). '+raw.slice(0,90));}
 return response.json();
}
async function geocode(o){
 if(!hasKey())return {ok:false,reason:'Configure GEOAPIFY_API_KEY gratuita no Render para localizar endereços.'};
 const url=new URL('https://api.geoapify.com/v1/geocode/search');
 url.searchParams.set('text',address(o));url.searchParams.set('filter','countrycode:br');url.searchParams.set('lang','pt');url.searchParams.set('limit','3');url.searchParams.set('apiKey',key());
 const data=await getJSON(url);const features=Array.isArray(data.features)?data.features:[];
 if(!features.length)return {ok:false,reason:'Endereço não encontrado. Confira o CEP, a rua e o número.'};
 const requestedCity=String(o.cidade||'').trim().toLocaleLowerCase('pt-BR');
 const hit=features.find(f=>!requestedCity||String(f.properties?.city||f.properties?.county||'').toLocaleLowerCase('pt-BR')===requestedCity);
 if(!hit)return {ok:false,reason:'O serviço encontrou apenas resultados fora da cidade informada. Confirme o endereço manualmente.'};
 const prop=hit.properties||{},lon=hit.geometry?.coordinates?.[0],lat=hit.geometry?.coordinates?.[1];
 if(!finite(lat)||!finite(lon))return {ok:false,reason:'Resultado sem coordenadas válidas.'};
 const requestedNumber=String(o.numero_endereco||'').trim();
 const foundNumber=String(prop.housenumber||'').trim();
 // A posição de uma rua/CEP não é a posição comprovada da residência.
 const precise=Boolean(requestedNumber && foundNumber && requestedNumber===foundNumber && (prop.rank?.confidence||0)>=0.8 && (prop.result_type==='building'||prop.result_type==='amenity'));
 return {ok:true,lat:Number(lat),lon:Number(lon),preciso:precise,endereco:prop.formatted||address(o),provedor:'geoapify'};
}
async function roadRoute(origin,items){
 if(!hasKey()||!items.length)return null;
 // Geoapify calcula trajeto viário para a ordem já proposta por nosso otimizador.
 // Não declarar essa ordem como ótimo global de tráfego ou veículos.
 const points=[origin,...items,origin].map(p=>Number(p.lat)+','+Number(p.lon)).join('|');
 const url=new URL('https://api.geoapify.com/v1/routing');
 url.searchParams.set('waypoints',points);url.searchParams.set('mode','drive');
 url.searchParams.set('details','polyline5');url.searchParams.set('lang','pt-BR');url.searchParams.set('apiKey',key());
 const data=await getJSON(url,22000);const hit=data.features?.[0],props=hit?.properties;
 if(!props)return null;
 const distance=Number(props.distance),duration=Number(props.time);
 return {items,distancia_metros:Number.isFinite(distance)?Math.round(distance):null,duracao_segundos:Number.isFinite(duration)?Math.round(duration):null,calculo:'geoapify_ruas',polyline:props.polyline5||null};
}
async function route(origin,items){
 const ordered=optimize(origin,items);
 try{const result=await roadRoute(origin,ordered);if(result)return result;}
 catch(e){console.warn('[Manaíra Rotas] Trajeto viário indisponível:',e.message)}
 return {items:ordered,distancia_metros:null,duracao_segundos:null,distancia_geografica_metros:Math.round(length(origin,ordered)),calculo:'estimativa_geografica',polyline:null};
}
module.exports={geocode,route,address,hasKey,provider:()=>hasKey()?'geoapify':'sem_chave'};
