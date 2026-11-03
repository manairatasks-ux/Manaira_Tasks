'use strict';
// Planejamento multi-veículo inicial (geográfico): distribui por custo marginal,
// otimiza ordem por 2-opt e retorna ao depósito. Não simula distância por ruas.
const R = 6371000;
function hav(a,b){const rad=Math.PI/180,d1=(b.lat-a.lat)*rad,d2=(b.lon-a.lon)*rad,x=Math.sin(d1/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(d2/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function length(origin,list){let total=0,last=origin;for(const p of list){total+=hav(last,p);last=p}return total+hav(last,origin)}
function optimize(origin,points){let rest=[...points],ordered=[],at=origin;while(rest.length){let bi=0;for(let i=1;i<rest.length;i++)if(hav(at,rest[i])<hav(at,rest[bi]))bi=i;at=rest.splice(bi,1)[0];ordered.push(at)}
 let changed=true,steps=0;while(changed&&steps++<100){changed=false;for(let i=0;i<ordered.length-1;i++)for(let j=i+1;j<ordered.length;j++){const a=i?ordered[i-1]:origin,b=ordered[i],c=ordered[j],d=j+1<ordered.length?ordered[j+1]:origin;if(hav(a,b)+hav(c,d)>hav(a,c)+hav(b,d)+0.01){ordered.splice(i,j-i+1,...ordered.slice(i,j+1).reverse());changed=true}}}
 return ordered}
function distribute(origin,orders,vehicles,maxStops=15){const routes=Array.from({length:vehicles},()=>[]);const remaining=[...orders].sort((a,b)=>hav(origin,b)-hav(origin,a));for(const item of remaining){let best=0,cost=Infinity;for(let i=0;i<vehicles;i++){if(routes[i].length>=maxStops)continue;const old=routes[i].length?length(origin,routes[i]):0;const inc=length(origin,[...routes[i],item])-old;const penalty=routes[i].length===0?0:routes[i].length*200;const score=inc+penalty;if(score<cost){cost=score;best=i}}
 routes[best].push(item)}return routes.map(r=>optimize(origin,r)).filter(r=>r.length)}
module.exports={hav,length,optimize,distribute};
