// The globe (ADR 0051): a real Earth drawn on a canvas, in an orthographic projection, that turns by itself, follows a
// drag, zooms with a pinch or the wheel, and flies down to an area like a maps app. Land is a dot grid sampled from
// Natural Earth (public domain, core/shared/geo/land-dots.json); the Lagos coast is drawn when close. Power cells are the
// hexagons of the map, drawn on the sphere. No library, no tile server, no request to another origin.
// The phone draws the same globe with the same maths and data (android/.../ui/Globe.kt).
// Orthographic projection: https://mathworld.wolfram.com/OrthographicProjection.html
import coast from '@outage/shared/geo/lagos-coast.json' with { type: 'json' };
import dots from '@outage/shared/geo/land-dots.json' with { type: 'json' };
import type { Rendered } from '../../site/headers.ts';

export const GLOBE_JS_PATH = '/globe.js';
const TTL_SECONDS = 86_400;

import tokens from '@outage/shared/design/tokens.json' with { type: 'json' };

/** Map colours by state and the ground (tokens `map.*` and Midnight's paper, ink and rule). */
const COLOURS = {
  NORMAL: tokens.map.normal,
  POSSIBLE: tokens.map.possible,
  CONFIRMED: tokens.map.confirmed,
  RESTORED: tokens.map.restored,
  NO_DATA: tokens.map.nodata,
  ocean: tokens.colors['paper-2'],
  rim: tokens.colors['rule-2'],
  ink: tokens.colors.ink,
  paper: tokens.colors.paper,
};

const JS = `(function(){
var D2R=Math.PI/180,KM=6371,LAGOS=[6.5244,3.3792];
var COL=${JSON.stringify(COLOURS)};
var DOTS=(function(b){var s=atob(b),n=s.length/4,a=new Float32Array(n*3);for(var i=0;i<n;i++){var la=s.charCodeAt(i*4)|s.charCodeAt(i*4+1)<<8,ln=s.charCodeAt(i*4+2)|s.charCodeAt(i*4+3)<<8;if(la>32767)la-=65536;if(ln>32767)ln-=65536;
var p=la/100*D2R;a[i*3]=Math.sin(p);a[i*3+1]=Math.cos(p);a[i*3+2]=ln/100*D2R;}return a;})(${JSON.stringify(dots.data)});
var COAST=${JSON.stringify(coast.lines)}.map(function(l){return l.map(function(p){return[p[0]*D2R,p[1]*D2R];});});
function hex(c,a){var n=parseInt(c.slice(1),16);return'rgba('+(n>>16)+','+(n>>8&255)+','+(n&255)+','+a+')';}

function Globe(canvas,opt){
  opt=opt||{};
  var ctx=canvas.getContext('2d'),w=0,h=0,dpr=1,top=opt.top||0,bottom=opt.bottom||0;
  var lon=(opt.lng!=null?opt.lng:10)*D2R,lat=(opt.lat!=null?opt.lat:12)*D2R,R=0,R0=0;
  var cells=[],back=[],labels=[],state={},spot=null,sel=null,spin=opt.spin!==false,fly=null,drag=null,pinch=null,last=0,t0=performance.now(),listeners={};
  function size(){var r=canvas.getBoundingClientRect();dpr=Math.min(window.devicePixelRatio||1,2);w=r.width;h=r.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    var nr=Math.min(w,h-top-bottom)*0.42;if(!R||R===R0)R=nr;R0=nr;}
  function cy(){return top+(h-top-bottom)/2;}
  var s0,c0;function cam(){s0=Math.sin(lat);c0=Math.cos(lat);}
  function proj(p,l){var sp=Math.sin(p),cp=Math.cos(p),d=l-lon,cd=Math.cos(d);return[w/2+R*cp*Math.sin(d),cy()-R*(c0*sp-s0*cp*cd),s0*sp+c0*cp*cd];}
  function kmToR(km){return w*KM/km;}
  function on(n,f){(listeners[n]=listeners[n]||[]).push(f);}
  function emit(n,a){(listeners[n]||[]).forEach(function(f){f(a);});}

  function setCells(list){cells=list.map(function(c){return{id:c.id,area:c.area,ring:c.ring.map(function(p){return[p[0]*D2R,p[1]*D2R];}),c:[c.ring.reduce(function(s,p){return s+p[0];},0)/c.ring.length*D2R,c.ring.reduce(function(s,p){return s+p[1];},0)/c.ring.length*D2R]};});
    list.forEach(function(c){state[c.id]=c.state;});}
  function cellById(id){for(var i=0;i<cells.length;i++)if(cells[i].id===id)return cells[i];return null;}
  function hexPx(){if(!cells.length||cells[0].ring.length<6)return 0;var c=cells[0],a=c.ring[0],b=c.ring[3];return R*Math.hypot(a[0]-b[0],(a[1]-b[1])*Math.cos(a[0]));}

  function flyTo(la,ln,km,ms){var from={lon:lon,lat:lat,lr:Math.log(R)},tl=ln*D2R,d=tl-lon;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    var dist=Math.acos(Math.max(-1,Math.min(1,Math.sin(lat)*Math.sin(la*D2R)+Math.cos(lat)*Math.cos(la*D2R)*Math.cos(d))));
    fly={from:from,to:{lon:lon+d,lat:la*D2R,lr:Math.log(km?kmToR(km):R0)},bump:Math.min(2.2,dist*1.4+(km&&kmToR(km)>R0*20?1.2:0)),start:performance.now(),ms:ms||2200};spin=false;}
  function zoomBy(k){var t=Math.max(R0*0.8,Math.min(R*k,kmToR(1.2)));fly={from:{lon:lon,lat:lat,lr:Math.log(R)},to:{lon:lon,lat:lat,lr:Math.log(t)},bump:0,start:performance.now(),ms:320};}
  function stepFly(n){if(!fly)return;var k=Math.min(1,(n-fly.start)/fly.ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
    lon=fly.from.lon+(fly.to.lon-fly.from.lon)*e;lat=fly.from.lat+(fly.to.lat-fly.from.lat)*e;R=Math.exp(fly.from.lr+(fly.to.lr-fly.from.lr)*e-fly.bump*Math.sin(Math.PI*e));
    if(k>=1){fly=null;emit('arrive');}}

  var hatch=null;function pattern(col){var c=document.createElement('canvas');c.width=c.height=10*dpr;var x=c.getContext('2d');x.fillStyle=hex(col,.35);x.fillRect(0,0,c.width,c.height);
    x.strokeStyle=hex(col,.95);x.lineWidth=3*dpr;x.beginPath();for(var i=-c.width;i<c.width*2;i+=5*dpr){x.moveTo(i,c.height);x.lineTo(i+c.height,0);}x.stroke();return ctx.createPattern(c,'repeat');}

  function draw(n){
    stepFly(n);cam();
    var dt=Math.min(64,n-last);last=n;if(spin&&!drag&&!fly)lon+=dt*0.00006*(R0/R);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    var Y=cy(),big=R>Math.hypot(w,h)*1.5;
    // The ocean: a flat disc one lightness step above the ground, with a hairline rim. No glow (theme Midnight).
    ctx.fillStyle=COL.ocean;ctx.beginPath();if(big)ctx.rect(0,0,w,h);else ctx.arc(w/2,Y,R,0,7);ctx.fill();
    if(!big){ctx.strokeStyle=COL.rim;ctx.lineWidth=1;ctx.beginPath();ctx.arc(w/2,Y,R,0,7);ctx.stroke();}
    // Land dots, fading out as we come down to street level.
    var z=R/R0,fade=Math.max(0,Math.min(1,1-(z-8)/14));
    if(fade>0){var ds=Math.max(1.1,Math.min(3.2,R*0.0055)),half=ds/2,b=[new Path2D(),new Path2D(),new Path2D()],sl=Math.sin(lat),cl=Math.cos(lat);
      for(var i=0;i<DOTS.length;i+=3){var sp=DOTS[i],cp=DOTS[i+1],d=DOTS[i+2]-lon,cd=Math.cos(d),cz=sl*sp+cl*cp*cd;if(cz<=0.02)continue;
        var x=w/2+R*cp*Math.sin(d),y=Y-R*(cl*sp-sl*cp*cd);if(x<-4||y<-4||x>w+4||y>h+4)continue;b[cz>0.66?2:cz>0.33?1:0].rect(x-half,y-half,ds,ds);}
      [0.26,0.46,0.7].forEach(function(a,k){ctx.fillStyle=hex(COL.ink,fade*a);ctx.fill(b[k]);});}
    // The coast near Lagos, once close enough to need it.
    if(z>6){ctx.strokeStyle=hex(COL.ink,Math.min(.4,(z-6)/20));ctx.lineWidth=1.5;COAST.forEach(function(l){ctx.beginPath();var ok=false;l.forEach(function(p,k){var q=proj(p[0],p[1]);if(q[2]<=0)return;if(!ok){ctx.moveTo(q[0],q[1]);ok=true;}else ctx.lineTo(q[0],q[1]);});ctx.stroke();});}
    var hp=hexPx(),pulse=((n-t0)%1900)/1900;
    if(hp<2.5){
      // Too small to draw blocks: a beacon over the city, coloured by its worst state.
      if(cells.length||opt.beaconState){var wst=cells.length?worst():opt.beaconState,q=proj(LAGOS[0]*D2R,LAGOS[1]*D2R);if(q[2]>0){var c=COL[wst]||COL.NORMAL;
        ctx.strokeStyle=hex(c,.8*(1-pulse));ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(q[0],q[1],6+20*pulse,0,7);ctx.stroke();
        ctx.fillStyle=c;ctx.fillRect(q[0]-4.5,q[1]-4.5,9,9);
        if(opt.beaconLabel!==false){ctx.font='500 13px "Mona Sans",system-ui,sans-serif';ctx.fillStyle=COL.ink;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(opt.beaconLabel||'Lagos',q[0]+11,q[1]);}}}
    }else{
      hatch=hatch||pattern(COL.POSSIBLE);
      if(back.length){ctx.strokeStyle=hex(COL.rim,.45);ctx.lineWidth=1;ctx.beginPath();back.forEach(function(r){var ok=true,q=r.map(function(p){var v=proj(p[0],p[1]);if(v[2]<=0)ok=false;return v;});if(!ok)return;q.forEach(function(v,k){if(k)ctx.lineTo(v[0],v[1]);else ctx.moveTo(v[0],v[1]);});ctx.closePath();});ctx.stroke();}
      var shapes=[];cells.forEach(function(cl2){var pts=[],vis=true;cl2.ring.forEach(function(p){var q=proj(p[0],p[1]);if(q[2]<=0)vis=false;pts.push(q);});if(vis)shapes.push({c:cl2,p:pts});});
      shapes.forEach(function(s){var st=state[s.c.id]||'NO_DATA',col=COL[st];ctx.beginPath();s.p.forEach(function(q,k){if(k)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);});ctx.closePath();
        if(st==='NO_DATA'){ctx.fillStyle=hex(col,.12);ctx.fill();ctx.setLineDash([4,4]);ctx.strokeStyle=hex(col,.7);ctx.lineWidth=1.2;ctx.stroke();ctx.setLineDash([]);return;}
        if(st==='POSSIBLE'){ctx.fillStyle=hatch;ctx.fill();}
        else if(st==='CONFIRMED'){ctx.fillStyle=hex(col,.88);ctx.fill();}
        else if(st==='RESTORED'){ctx.fillStyle=hex(col,.28);ctx.fill();ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.stroke();}
        else{ctx.fillStyle=hex(col,.32);ctx.fill();}
        ctx.strokeStyle=COL.ocean;ctx.lineWidth=2;ctx.stroke();
        if(st==='CONFIRMED'){ctx.strokeStyle=hex(col,(1-pulse)*.7);ctx.lineWidth=2+10*pulse;ctx.stroke();}
        if(s.c.id===sel){ctx.setLineDash([6,4]);ctx.strokeStyle=COL.ink;ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}});
      var sc=spot&&cellById(spot);if(sc){var q2=proj(sc.c[0],sc.c[1]);if(q2[2]>0){ctx.fillStyle=COL.ink;ctx.beginPath();ctx.arc(q2[0],q2[1],8,0,7);ctx.fill();ctx.fillStyle=COL.paper;ctx.beginPath();ctx.arc(q2[0],q2[1],4.5,0,7);ctx.fill();}}
      if(hp>7){ctx.font='500 13px "Mona Sans",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';var placed=[];labels.forEach(function(l){var q=proj(l.lat*D2R,l.lng*D2R);if(q[2]<=0)return;var y=q[1]+(l.below?Math.min(hp*.55,26):0),tw=ctx.measureText(l.name).width+16;
        // Area names that would overlap one already placed are left out; the list order sets who wins.
        if(placed.some(function(b){return Math.abs(b[0]-q[0])<(b[2]+tw)/2+4&&Math.abs(b[1]-y)<26;}))return;placed.push([q[0],y,tw]);
        ctx.fillStyle=hex(COL.paper,.86);ctx.fillRect(q[0]-tw/2,y-11,tw,22);ctx.fillStyle=COL.ink;ctx.fillText(l.name,q[0],y);});}
    }
    requestAnimationFrame(draw);
  }
  function worst(){var r={CONFIRMED:4,POSSIBLE:3,RESTORED:2,NORMAL:1,NO_DATA:0},b='NO_DATA';for(var k in state)if(r[state[k]]>r[b])b=state[k];return b;}

  function inPoly(x,y,p){var c=false;for(var i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;}
  function hit(x,y){cam();if(hexPx()<2.5){if(!cells.length&&!opt.beaconState)return null;var q=proj(LAGOS[0]*D2R,LAGOS[1]*D2R);return q[2]>0&&Math.hypot(q[0]-x,q[1]-y)<28?'beacon':null;}
    for(var i=0;i<cells.length;i++){var pts=cells[i].ring.map(function(p){return proj(p[0],p[1]);});if(pts.every(function(q){return q[2]>0;})&&inPoly(x,y,pts))return cells[i].id;}return null;}
  var pts={};
  canvas.addEventListener('pointerdown',function(e){canvas.setPointerCapture(e.pointerId);pts[e.pointerId]=[e.clientX,e.clientY];var k=Object.keys(pts);
    if(k.length===2){var a=pts[k[0]],b=pts[k[1]];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),R:R};drag=null;}else{drag={x:e.clientX,y:e.clientY,lon:lon,lat:lat,moved:false};fly=null;}});
  canvas.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;pts[e.pointerId]=[e.clientX,e.clientY];var k=Object.keys(pts);
    if(pinch&&k.length===2){var a=pts[k[0]],b=pts[k[1]];R=Math.max(R0*0.8,Math.min(pinch.R*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.d,kmToR(1.2)));return;}
    if(!drag)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;if(!drag.moved)return;
    lon=drag.lon-dx/R;lat=Math.max(-1.3,Math.min(1.3,drag.lat+dy/R));spin=false;});
  function up(e){delete pts[e.pointerId];if(pinch&&Object.keys(pts).length<2){pinch=null;return;}var d=drag;drag=null;if(!d||d.moved)return;var r=canvas.getBoundingClientRect(),id=hit(e.clientX-r.left,e.clientY-r.top);
    if(id==='beacon'){emit('beacon');return;}emit('tap',id);}
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',function(e){delete pts[e.pointerId];drag=null;pinch=null;});
  canvas.addEventListener('wheel',function(e){e.preventDefault();zoomBy(e.deltaY<0?1.35:1/1.35);},{passive:false});
  if(window.ResizeObserver)new ResizeObserver(size).observe(canvas);else window.addEventListener('resize',size);
  size();requestAnimationFrame(function(n){last=n;draw(n);});
  return{setCells:setCells,backdrop:function(l){back=l.map(function(r){return r.map(function(p){return[p[0]*D2R,p[1]*D2R];});});},labels:function(l){labels=l;},setState:function(id,s){state[id]=s;},getState:function(id){return state[id];},states:function(){return state;},
    spot:function(id){spot=id;},select:function(id){sel=id;},insets:function(t,b){top=t;bottom=b;size();},flyTo:flyTo,zoomBy:zoomBy,spin:function(v){spin=v;},
    view:function(){return{lat:lat/D2R,lng:lon/D2R,km:w*KM/R,ready:R>0};},on:on,kmToR:kmToR};
}
window.OutageGlobe=Globe;
// A canvas with data-globe="hero" turns by itself, with a beacon over Lagos. Used on the landing page.
[].forEach.call(document.querySelectorAll('canvas[data-globe=hero]'),function(c){Globe(c,{lat:8,lng:6,beaconState:'CONFIRMED'});});
})();`;

export const renderGlobeJs = (): Rendered => ({ status: 200, contentType: 'text/javascript; charset=utf-8', body: JS, ttlSeconds: TTL_SECONDS });
