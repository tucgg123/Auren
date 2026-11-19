/* ======================================================================
   JUEGO DE TABLERO (Estudiar → 🎮 Juega)
   Lanzas el dado (1 a 3) y avanzas por 24 casillas:
     ❓ Pregunta: sale de las tarjetas reales de la materia (o del corte/tema elegido en "Practicar con").
                 Acertar da XP y suma combo; fallar te hace retroceder 1 casilla y la pregunta va a "Para repasar".
     📖 Lección:  una sección de los temas de esas tarjetas (o una tarjeta, si el tema no tiene secciones). +5 XP.
     🎁 Cofre:    +15 XP y un dato para recordar (la explicación de una tarjeta).
     🌀 Trampa:   retrocedes 2 casillas y se pierde el combo.
     🏁 Meta:     +30 XP. Las preguntas cuentan para la racha del día como en el Quiz.
   ====================================================================== */
const TAB_CASILLAS=['s','q','q','l','q','c','q','q','t','q','l','q','c','q','q','t','q','l','q','q','c','q','q','f'];
const TAB_ICO={s:'🚩',q:'❓',l:'📖',c:'🎁',t:'🌀',f:'🏁'},TAB_NOM={s:'Inicio',q:'Pregunta',l:'Lección',c:'Cofre',t:'Trampa',f:'Meta'};
const TAB_COLS=6;
function armarTablero(materiaId){
  const cards=getCards(materiaId);
  const poolDe=c=>{const t=state.temas.find(x=>x.id===c.temaId);return t?tarjetasDelCorte(materiaId,t.corteId):cards};   // opciones solo del mismo corte
  const qs=armarPreguntas(cards,0,{poolDe,tipos:'mixto'})||[];
  let lecc=[];
  [...new Set(cards.map(c=>c.temaId))].forEach(id=>{
    const t=state.temas.find(x=>x.id===id);
    if(t&&Array.isArray(t.secciones))t.secciones.forEach(sc=>{const x=String(sc.body||'').replace(/^#{2,3}\s+/gm,'').replace(/\s+/g,' ').trim();if(limpioT(sc.title)&&x)lecc.push({t:sc.title,x:esqCorto(x,360),tema:t.title||''})});
  });
  if(!lecc.length)lecc=cards.map(c=>({t:c.front,x:c.back,tema:''}));
  const datos=cards.map(c=>limpioT(c.exp)?{t:c.front,x:c.exp}:{t:c.front,x:c.back});
  return{tablero:true,qs,lecc:shuffle(lecc),datos:shuffle(datos),pos:0,qi:0,li:0,fi:0,ok:0,asked:[],vistas:0,combo:0,mejor:0,xp:0,fase:'roll',dado:0,cur:null,fallo:false};
}
function tabCeldasHTML(ts){
  return TAB_CASILLAS.map((k,i)=>{
    const r=Math.floor(i/TAB_COLS),c=r%2?TAB_COLS-1-i%TAB_COLS:i%TAB_COLS;
    return `<div class="tCel k-${k}${i<ts.pos?' past':''}${i===ts.pos?' cur':''}" style="grid-row:${r+1};grid-column:${c+1}"><em>${i+1}</em>${i===ts.pos?'<span class="tok" aria-hidden="true">🧑‍🎓</span>':''}<span class="tIco" aria-hidden="true">${TAB_ICO[k]}</span><small>${TAB_NOM[k]}</small></div>`;
  }).join('');
}
function tabHudHTML(ts){
  return `<span class="chip">📍 Casilla ${ts.pos+1} de ${TAB_CASILLAS.length}</span><span class="chip">${ts.combo>1?'🔥 Combo x'+ts.combo:'⚡ Sin combo'}</span><span class="chip">✅ ${ts.ok} ${ts.ok==1?'acierto':'aciertos'}</span><span class="chip">⭐ ${ts.xp} XP</span>`;
}
function tabRefrescar(){
  const ts=toolState,b=$('tabBoard'),h=$('tabHud');
  if(b){b.innerHTML=tabCeldasHTML(ts);b.setAttribute('aria-label','Tablero: estás en la casilla '+(ts.pos+1)+' de '+TAB_CASILLAS.length)}
  if(h)h.innerHTML=tabHudHTML(ts);
}
const TIPO_NOM={mc:'Opción múltiple',vf:'Verdadero o falso',hueco:'Completar'};
function tabActHTML(ts){
  const dado=n=>n?'⚀⚁⚂'[n-1]:'🎲';
  if(ts.fase==='roll'||ts.fase==='mov')return `<div class="tabTurno"><span class="dado${ts.fase==='mov'&&!ts.dado?' gira':''}" id="tabDado" aria-hidden="true">${dado(ts.dado)}</span><b>${ts.fase==='mov'?(ts.dado?'Sacaste '+ts.dado+'…':'Lanzando…'):'Tu turno'}</b><button class="pr" data-action="tabLanzar" ${ts.fase==='mov'?'disabled':''}>Lanzar el dado</button></div>
    ${ts.aviso?`<p class="meta tabAviso">${ts.aviso}</p>`:''}`;
  if(ts.fase==='q'){
    const q=ts.cur,contesto=!!q.selected,acierto=contesto&&esAcierto(q);
    const opts=q.tipo==='hueco'?huecoHTML(q,true,contesto,acierto):q.options.map(o=>{
      let cls='sec optBtn';
      if(contesto){if(o===q.correcta)cls+=' ok '+(acierto?'pop':'reveal');else if(o===q.selected)cls+=' no shake'}
      return `<button class="${cls}" data-action="answerQuiz" data-opt="${esc(o)}" ${contesto?'disabled':''}>${esc(o)}</button>`}).join('');
    return `<span class="tag">❓ ${TIPO_NOM[q.tipo]||'Pregunta'}</span><h3 class="tabQ">${enunciadoHTML(q)}</h3><div class="qCard ${contesto?'answered':''}">${opts}</div>
      ${contesto?(acierto?feedbackHTML(true,q,ts.asked.length):`<div class="fb fbNo" role="status">😕 Todavía no. Retrocedes 1 casilla.<span>La correcta: <b>${esc(q.correcta)}</b></span>${explicacionHTML(q.card&&q.card.exp)}</div>`)+'<button class="pr nextBtn" data-action="tabSeguir">Seguir →</button>':''}`;
  }
  if(ts.fase==='l'){const l=ts.cur;return `<span class="tag">📖 Lección${l.tema?' · '+esc(l.tema):''}</span><h2 class="tabT">${esc(l.t)}</h2><p class="tabX">${esc(l.x)}</p><button class="pr nextBtn" data-action="tabSeguir">Entendido · +5 XP</button>`}
  if(ts.fase==='c'){const d=ts.cur;return `<span class="tag">🎁 Cofre</span><h2 class="tabT">+15 XP</h2><p class="tabX">Para recordar: <b>${esc(d.t)}</b> ${esc(d.x)}</p><button class="pr nextBtn" data-action="tabSeguir">Seguir →</button>`}
  if(ts.fase==='t')return `<span class="tag tagNo">🌀 Trampa</span><h2 class="tabT">Retrocedes 2 casillas</h2><p class="tabX meta">Es una oportunidad de pasar otra vez por las lecciones y preguntas del camino.</p><button class="pr nextBtn" data-action="tabSeguir">Seguir →</button>`;
  return '';
}
function tableroHTML(){
  const ts=toolState;
  if(!ts.qs.length)return `<div class="viewhead"><h1>🎲 Juego de tablero</h1></div><div class="empty">No hay suficiente material para armar preguntas con lo que elegiste en «Practicar con». Hacen falta al menos ${MIN_MATERIAL} tarjetas con respuestas distintas en el mismo corte (o tarjetas con opciones incorrectas de la IA).</div>`;
  if(ts.fase==='end'){
    const n=ts.asked.length,p=n?ts.ok/n:1;
    return `<div class="empty resultado tabFin"><h2>🏁 ¡Llegaste a la meta!</h2>${estrellasHTML(estrellasDe(p))}
      <p class="meta">+30 XP por completar el recorrido.</p>
      <div class="tabStats"><div><b>${ts.ok}/${n}</b><span>aciertos</span></div><div><b>${ts.vistas}</b><span>lecciones vistas</span></div><div><b>x${ts.mejor}</b><span>mejor combo</span></div></div>
      ${premiosHTML()}${paraRepasarHTML(ts.asked)}
      <div class="row finBtns"><button class="pr" data-action="redoTool">Jugar otra vez</button><button class="sec" data-action="backMateria" data-id="${route.materiaId}">Elegir otra actividad</button></div></div>`;
  }
  return `<div class="viewhead"><h1>🎲 Juego de tablero</h1></div>
  <div class="tabJuego">
    <div class="tabBoard" id="tabBoard" role="img" aria-label="Tablero: estás en la casilla ${ts.pos+1} de ${TAB_CASILLAS.length}">${tabCeldasHTML(ts)}</div>
    <div class="tabLado"><div class="marcador tabHud" id="tabHud">${tabHudHTML(ts)}</div><div class="card tabAct" id="tabAct" aria-live="polite">${tabActHTML(ts)}</div></div>
  </div>`;
}
/* Los pasos con espera se cancelan solos si la persona sale del juego (toolState cambia) */
function tabLuego(ts,ms,fn){setTimeout(()=>{if(toolState===ts&&route.view==='tool'&&route.tool==='tablero')fn()},reducido()?Math.min(ms,60):ms)}
function tabPintarAct(){const a=$('tabAct');if(a)a.innerHTML=tabActHTML(toolState)}
function tabLanzar(){
  const ts=toolState;if(!ts||!ts.tablero||ts.fase!=='roll')return;
  ts.fase='mov';ts.dado=0;ts.aviso='';tabPintarAct();
  tabLuego(ts,650,()=>{ts.dado=1+Math.floor(Math.random()*3);tabPintarAct();tabLuego(ts,350,()=>tabAvanzar(ts,ts.dado))});
}
function tabAvanzar(ts,k){
  if(k<=0||ts.pos>=TAB_CASILLAS.length-1)return tabCaer(ts);
  ts.pos++;tabRefrescar();tabLuego(ts,300,()=>tabAvanzar(ts,k-1));
}
function tabCaer(ts){
  let k=TAB_CASILLAS[ts.pos];
  if(k==='q'&&ts.qi>=ts.qs.length)k='c';                 // si se acaban las preguntas, la casilla da un cofre
  if(k==='q'){ts.cur=ts.qs[ts.qi++];ts.fase='q'}
  else if(k==='l'){ts.cur=ts.lecc[ts.li++%ts.lecc.length];ts.vistas++;ts.fase='l'}
  else if(k==='c'){ts.cur=ts.datos[ts.fi++%ts.datos.length];ts.xp+=15;ts.fase='c'}
  else if(k==='t'){ts.pos=Math.max(ts.pos-2,0);ts.combo=0;ts.fase='t'}
  else if(k==='f'){tabMeta(ts);return}
  else ts.fase='roll';
  ts.dado=0;
  render(true);
  if(k==='c'&&!reducido()){const a=$('tabAct');if(a)explotar(a)}
}
function tabResponder(sel){
  const ts=toolState;if(!ts||!ts.tablero||ts.fase!=='q')return;
  const q=ts.cur;if(!q||q.selected)return;
  q.selected=sel;
  const ok=esAcierto(q);ts.asked.push(q);
  const real=state.cards.find(x=>x.id===q.card.id);
  if(real){repasarTarjeta(real,ok);persist()}               // el repaso espaciado también aprende del tablero
  if(ok){ts.ok++;ts.combo++;ts.mejor=Math.max(ts.mejor,ts.combo);q.combo=ts.combo;q.xp=xpAcierto(ts.combo);ts.xp+=q.xp;ts.fx={tipo:'ok'}}
  else{ts.combo=0;ts.pos=Math.max(ts.pos-1,0)}
  render(true);
}
function tabSeguir(){
  const ts=toolState;if(!ts||!ts.tablero)return;
  if(ts.fase==='l')ts.xp+=5;
  ts.fase='roll';ts.cur=null;
  render(true);
  const b=document.querySelector('[data-action="tabLanzar"]');if(b)b.focus({preventScroll:true});
}
function tabMeta(ts){
  ts.xp+=30;ts.meta=true;ts.fase='end';
  ts.questions=ts.asked;ts.score=ts.ok;ts.idx=ts.asked.length;           // así se guarda como cualquier sesión de preguntas (racha, XP y misiones)
  cerrarSesionPractica();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  if(b.dataset.action==='tabLanzar')tabLanzar();
  else if(b.dataset.action==='tabSeguir')tabSeguir();
});
