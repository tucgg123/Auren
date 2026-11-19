/* ================= HERRAMIENTAS DE ESTUDIO ================= */
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function getCardsTodas(materiaId){return state.cards.filter(c=>c.materiaId===materiaId && c.front.trim() && c.back.trim())}
/* "Practicar con": toda la materia, un corte o un solo tema (se elige en la materia). El repaso de hoy y lo fallado siempre miran todas. */
function getCards(materiaId){
  const al=(ui.alcance||{})[materiaId]||{};
  let cs=getCardsTodas(materiaId);
  if(al.temaId)cs=cs.filter(c=>c.temaId===al.temaId);
  else if(al.corteId){const ids=new Set(state.temas.filter(t=>t.materiaId===materiaId&&t.corteId===al.corteId).map(t=>t.id));cs=cs.filter(c=>ids.has(c.temaId))}
  return cs;
}
function alcanceHTML(materiaId){
  const al=(ui.alcance||{})[materiaId]||{},todas=getCardsTodas(materiaId);
  const nT=tid=>todas.filter(c=>c.temaId===tid).length;
  const temasDe=cid=>state.temas.filter(t=>t.materiaId===materiaId&&t.corteId===cid);
  const val=al.temaId?'t:'+al.temaId:al.corteId?'c:'+al.corteId:'all';
  const opts=[`<option value="all" ${val==='all'?'selected':''}>Toda la materia (${todas.length})</option>`];
  state.cortes.filter(c=>c.materiaId===materiaId).forEach(c=>{
    opts.push(`<option value="c:${c.id}" ${val==='c:'+c.id?'selected':''}>📁 ${esc(c.name)||'(corte sin nombre)'} (${temasDe(c.id).reduce((s,x)=>s+nT(x.id),0)})</option>`);
    temasDe(c.id).forEach(x=>opts.push(`<option value="t:${x.id}" ${val==='t:'+x.id?'selected':''}>— 📄 ${esc(x.title)||'(tema sin título)'} (${nT(x.id)})</option>`));
  });
  return `<div class="practice"><label class="lbl" for="alcanceSel" style="margin:0">Practicar con</label><select class="fld" id="alcanceSel" data-action="alcanceSel" style="max-width:420px">${opts.join('')}</select></div>
    <p class="meta" style="margin:0 0 10px">Se aplica a flashcards, memorizar, repaso y comparar. El Quiz y el Modo examen se arman por corte (y tema) en su propia pantalla.</p>`;
}

/* ---------- Estudiar: actividades agrupadas como juegos, con un reto del día ---------- */
const ACTIVIDADES=[
  {g:'aprende',t:'flashcards',ico:'🔄',n:'Flashcards',d:'Voltea la tarjeta y di si te la sabías'},
  {g:'aprende',t:'memorizar',ico:'🙈',n:'Memorizar',d:'Tapa la respuesta, recuérdala y destápala'},
  {g:'aprende',t:'concepto',ico:'💡',n:'¿Qué concepto?',d:'Lee la pista y adivina el término'},
  {g:'juega',t:'emparejar',ico:'🧩',n:'Emparejar',d:'Une cada término con su definición'},
  {g:'juega',t:'repaso',ico:'⏱️',n:'Contrarreloj',d:'¿Cuántas sabes en 5 minutos?'},
  {g:'juega',t:'quiz',ico:'❓',n:'Quiz',d:'Preguntas con combos y confeti'},
  {g:'juega',t:'tablero',ico:'🎲',n:'Juego de tablero',d:'Lanza el dado: preguntas, lecciones, cofres y trampas'},
  {g:'prueba',t:'examen',ico:'📝',n:'Modo examen',d:'Como el de verdad: la nota al final'},
  {g:'prueba',t:'escrito',ico:'✍️',n:'Examen escrito',d:'Responde con tus palabras y compara'},
  {g:'repasa',t:'hoy',ico:'📅',n:'Repaso de hoy',d:'Las que te tocan hoy para no olvidarlas'},
  {g:'repasa',t:'falle',ico:'🎯',n:'Lo que fallé',d:'Vuelve a las que se te resistieron'},
  {g:'organiza',t:'progreso',ico:'📊',n:'Mi progreso',d:'Tarjetas dominadas e historial'},
  {g:'organiza',t:'comparar',ico:'⚖️',n:'Comparar',d:'Dos materias lado a lado'},
  {g:'organiza',t:'referencias',ico:'📚',n:'Referencias',d:'Tu bibliografía de la materia'}
];
const GRUPOS_ACT=[['aprende','🌱 Aprende','#8ED1A4'],['juega','🎮 Juega','#A99BE8'],['prueba','🏁 Ponte a prueba','#E8C27A'],['repasa','🔁 Repasa','#7FB3E6'],['organiza','🗂️ Organiza','#E9A58C']];
const nombreAct=t=>(ACTIVIDADES.find(x=>x.t===t)||{}).n||'';
function rachaHoyN(){const dh=progresoHoy();return state.progress.days.includes(fechaLocal(new Date()))?Math.max(dh.racha,META_RACHA):dh.racha}
/* Sugiere UNA actividad según lo que le conviene hoy a la persona */
function retoHoy(materiaId){
  const nC=getCardsTodas(materiaId).length,nH=sesionHoy(materiaId).length,nF=tarjetasFalladas(materiaId).length,hoyN=rachaHoyN();
  if(!nC)return{t:'',txt:'Agrega tarjetas en tus temas (pestaña «Tarjetas») y aquí aparecerán tus retos.'};
  if(nH)return{t:'hoy',txt:'Tienes '+pluralMv(nH,'tarjeta','tarjetas')+' para repasar hoy. ¡No dejes que se te olviden!'};
  if(nF)return{t:'falle',txt:'Hay '+pluralMv(nF,'tarjeta que se te resistió','tarjetas que se te resistieron')+'. ¡Es tu revancha!'};
  if(hoyN<META_RACHA)return{t:'quiz',txt:'Responde '+(META_RACHA-hoyN)+' preguntas más en un quiz para asegurar tu racha 🔥.'};
  return{t:'emparejar',txt:'¡Racha de hoy asegurada! Juega a emparejar para afianzar lo aprendido.'};
}
const IC_DIANA='<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
/* Estudiar es la tarjeta principal de la materia: el botón "Empezar" va directo al repaso de hoy (o al reto del día)
   y al tocar la tarjeta se abren todas las actividades. */
function estudiarCajonHTML(m){
  const id=m.id,nC=getCardsTodas(id).length,nH=sesionHoy(id).length,nF=tarjetasFalladas(id).length;
  const hoyN=rachaHoyN(),reto=retoHoy(id),nv=nivelDe(),gr=rachaInfo(state.progress.days);
  const cuenta={hoy:nH,falle:nF};
  const retoHTML=`<div class="reto">
      <div class="retoTop"><span class="retoK">⭐ Reto de hoy</span><span class="chip">Nivel ${nv.nivel} · ${esc(nv.nombre)} · ${nv.xp} XP</span></div>
      <p class="retoTxt">${esc(reto.txt)}</p>
      <div class="retoRacha"><span>🔥 Racha de hoy</span><b>${Math.min(hoyN,META_RACHA)}/${META_RACHA}</b></div>
      <div class="bar"><i style="width:${Math.min(100,Math.round(hoyN/META_RACHA*100))}%"></i></div>
      <p class="meta retoGracia">🛡️ ${gr.congelados.includes(gr.hoy-1)?'Ayer usaste tu día de gracia: tu racha sigue viva.':gr.graciaDisponible?'Tienes 1 día de gracia esta semana: si fallas un día, tu racha sigue viva.':'Ya usaste tu día de gracia de esta semana.'}</p>
      ${misionesHTML()}
      ${reto.t?`<button class="pr retoBtn" data-action="openTool" data-tool="${reto.t}" data-mat="${id}">¡Vamos! ${esc(nombreAct(reto.t))} →</button>`:''}
    </div>`;
  const grupos=GRUPOS_ACT.map(([g,tit,col])=>`<div class="actGrupo"><h3 class="actGT">${tit}</h3><div class="actGrid">${ACTIVIDADES.filter(a=>a.g===g).map(a=>`<button type="button" class="act" style="--ac:${col}" data-action="openTool" data-tool="${a.t}" data-mat="${id}"><span class="actIco" aria-hidden="true">${a.ico}</span><b>${a.n}</b><small>${a.d}</small>${cuenta[a.t]?`<em class="actN" aria-label="${cuenta[a.t]} pendientes">${cuenta[a.t]}</em>`:''}</button>`).join('')}</div></div>`).join('');
  const k='m:'+id+':est',ab=dwAbierto(k),bid='dwB-'+k.replace(/[^\w-]/g,'_');
  const go=nH?{t:'hoy',l:'Empezar · '+nH+' para hoy'}:reto.t?{t:reto.t,l:'Empezar · '+nombreAct(reto.t)}:null;
  const hoyS=hoyStr(),hechas=getCardsTodas(id).filter(c=>c.last===hoyS).length,totHoy=hechas+nH;   // repasadas hoy + las que faltan
  const prog=totHoy?`<div class="ehProg"><div class="ehPl"><span>Progreso de hoy</span><span>${hechas} de ${totHoy}${hechas>=totHoy?' ✓':''}</span></div><div class="bar" role="progressbar" aria-label="Progreso de hoy" aria-valuemin="0" aria-valuemax="${totHoy}" aria-valuenow="${hechas}"><i style="width:${Math.round(hechas/totHoy*100)}%"></i></div></div>`:'';
  return `<section class="dw estHero${ab?' open':''}" data-key="dw-${esc(k)}">
    <div class="ehTop">
      <button type="button" class="dwHead ehHead" data-action="toggleDw" data-k="${esc(k)}" aria-expanded="${ab}" aria-controls="${bid}"><span class="dnum ehIco" aria-hidden="true">${IC_DIANA}</span><span class="dwT"><b>Estudiar</b><small>${pluralMv(nC,'tarjeta','tarjetas')} · ${ACTIVIDADES.length} actividades${nH?' · '+nH+' para hoy':''}</small></span><span class="chev" aria-hidden="true">▼</span></button>
      ${go?`<button type="button" class="pr ehGo" data-action="openTool" data-tool="${go.t}" data-mat="${id}">${esc(go.l)}</button>`:''}
    </div>
    ${prog}
    <div class="dwBody" id="${bid}"><div class="dwInner"><div class="dwPad">${retoHTML}${alcanceHTML(id)}${grupos}</div></div></div>
  </section>`;
}
/* Estrellas y pantalla final comunes a los juegos */
const estrellasDe=p=>p>=0.9?3:p>=0.7?2:p>=0.4?1:0;
function estrellasHTML(n){return `<div class="stars" role="img" aria-label="${n} de 3 estrellas">${[0,1,2].map(i=>`<span class="${i<n?'on':''}" style="--i:${i}">★</span>`).join('')}</div>`}
function finJuegoHTML(o){
  const p=o.total?o.ok/o.total:0,tono=p>=0.7?'alto':p>=0.4?'medio':'bajo',n=o.estrellas!=null?o.estrellas:estrellasDe(p);
  const msg=o.msg||(n===3?'¡Perfecto! 🤩':n===2?'¡Excelente trabajo! 🎉':n===1?'Vas bien, un intento más y lo logras 💪':'Cada intento cuenta. ¡Vuelve a probar! 🌱');
  return `<div class="empty resultado"><h2>${o.titulo}</h2>
    <div class="ringWrap ${tono}"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="rbg" cx="60" cy="60" r="52"/><circle class="rfg" cx="60" cy="60" r="52" style="--p:${Math.round(p*100)}"/></svg>
      <div class="ringTxt"><b class="countUp" data-to="${o.ok}">${o.ok}</b><span>/ ${o.total}</span></div></div>
    ${estrellasHTML(n)}<p class="resMsg">${msg}</p>${o.linea?`<p class="meta">${o.linea}</p>`:''}${o.extra||''}
    <div class="row finBtns"><button class="pr" data-action="redoTool">${o.redo||'Jugar otra vez'}</button><button class="sec" data-action="backMateria" data-id="${route.materiaId}">Elegir otra actividad</button></div></div>`;
}
/* Récords por materia (solo en este dispositivo) */
function leerRecord(k){try{return +localStorage.getItem('auren_rec_'+k)||0}catch(e){return 0}}
function guardarRecord(k,v){try{localStorage.setItem('auren_rec_'+k,String(v))}catch(e){}}

function fmtSecs(s){s=Math.max(0,s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function relTime(ts){
  const d=Math.round((Date.now()-ts)/864e5);
  if(d<=0)return'hoy';if(d===1)return'ayer';if(d<30)return`hace ${d} días`;
  const mo=Math.round(d/30);return mo===1?'hace 1 mes':`hace ${mo} meses`;
}
function noCardsMsg(){return'<div class="empty">Esta materia todavía no tiene tarjetas con frente y reverso completos. Agregá algunas desde sus temas.</div>'}

/* ---------- Quiz y Modo examen por corte ----------
   Solo se usan las tarjetas de los temas (documentos) del corte elegido, dentro de la misma materia.
   Las opciones incorrectas salen del mismo corte. Si el corte no tiene material suficiente, se avisa
   y NO se recurre a otros cortes ni a otras materias. */
const MIN_MATERIAL=4;   // respuestas distintas necesarias para armar preguntas de 4 opciones
function tarjetasDelCorte(materiaId,corteId,temaId){
  const tids=new Set(state.temas.filter(x=>x.materiaId===materiaId&&x.corteId===corteId&&(!temaId||x.id===temaId)).map(x=>x.id));
  return state.cards.filter(c=>c.materiaId===materiaId&&tids.has(c.temaId)&&String(c.front||'').trim()&&String(c.back||'').trim());
}
/* ---------- Preguntas: opción múltiple, verdadero/falso y completar ---------- */
const limpioT=s=>String(s==null?'':s).trim();
/* 3 opciones incorrectas: primero las que escribió la IA para esa tarjeta; si faltan, respuestas de otras tarjetas del mismo grupo (corte) */
function distractoresDe(c,pool){
  const correcta=limpioT(c.back);
  const ia=[...new Set((c.dist||[]).map(limpioT).filter(x=>x&&x!==correcta))];
  if(ia.length>=3)return shuffle(ia).slice(0,3);
  const otros=[...new Map((pool||[]).filter(x=>limpioT(x.back)&&limpioT(x.back)!==correcta).map(x=>[limpioT(x.back),limpioT(x.back)])).values()].filter(x=>!ia.includes(x));
  const todos=ia.concat(shuffle(otros));
  return todos.length>=3?todos.slice(0,3):null;
}
/* tipos: 'mixto' (variadas), 'mc' (opción múltiple), 'vf' (verdadero o falso) o 'hueco' (completar).
   Verdadero o falso usa la afirmación falsa de la tarjeta o, si no tiene, una de sus opciones incorrectas.
   Completar solo existe en tarjetas que traen la frase con el hueco; en las demás se pregunta con opción múltiple. */
const tieneHueco=c=>!!(c.hueco&&limpioT(c.hueco.r)&&String(c.hueco.o||'').includes('____'));
function tipoPara(c,tipos){
  if(tipos==='mc')return 'mc';
  if(tipos==='vf')return 'vf';
  if(tipos==='hueco')return tieneHueco(c)?'hueco':'mc';
  const op=['mc','mc','vf'];                                                                // la opción múltiple pesa más
  if(tieneHueco(c))op.push('hueco','hueco');
  return op[Math.floor(Math.random()*op.length)];
}
function preguntaDe(c,d,tipos){
  const tipo=tipoPara(c,tipos);
  const falsa=limpioT(c.falsa)&&limpioT(c.falsa)!==limpioT(c.back)?c.falsa:d[0];
  if(tipo==='vf'){const v=Math.random()<0.5;return{card:c,tipo,enun:c.front,afirm:v?c.back:falsa,correcta:v?'Verdadero':'Falso',options:['Verdadero','Falso'],selected:null}}
  if(tipo==='hueco')return{card:c,tipo,enun:c.hueco.o,correcta:c.hueco.r,options:[],selected:null};
  return{card:c,tipo:'mc',enun:c.front,correcta:c.back,options:shuffle([c.back,...d]),selected:null};
}
function armarPreguntas(cards,n,opts){
  opts=opts||{};
  const validas=cards.filter(c=>limpioT(c.front)&&limpioT(c.back));
  const poolDe=opts.poolDe||(()=>validas);
  const lista=[];
  shuffle(validas).forEach(c=>{const d=distractoresDe(c,poolDe(c));if(d)lista.push(preguntaDe(c,d,opts.tipos))});
  if(!lista.length)return null;
  return n>0?lista.slice(0,n):lista;
}
/* Completar: se acepta sin tildes, mayúsculas ni signos, y con un error de tipeo en palabras largas */
const normTxt=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function distLev(a,b){
  const m=a.length,n=b.length;if(!m)return n;if(!n)return m;
  let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}
  return prev[n];
}
function respuestaHuecoOk(dada,correcta){
  const a=normTxt(dada),b=normTxt(correcta);
  if(!a||!b)return false;
  if(a===b)return true;
  return distLev(a,b)<=(b.length>=9?2:b.length>=5?1:0);
}
const esAcierto=q=>q.tipo==='escrito'?q.ok===true:q.tipo==='hueco'?respuestaHuecoOk(q.selected,q.correcta):q.selected===q.correcta;
function quizCfgDe(materiaId,tool){
  ui.quizCfg=ui.quizCfg||{};
  const cortes=state.cortes.filter(c=>c.materiaId===materiaId);
  const cfg=ui.quizCfg[materiaId]=ui.quizCfg[materiaId]||{};
  if(!cortes.some(c=>c.id===cfg.corteId)){
    const conMaterial=cortes.find(c=>tarjetasDelCorte(materiaId,c.id).length);
    cfg.corteId=((conMaterial||cortes[0])||{}).id||null;
  }
  cfg.n=cfg.n||{};
  if(cfg.n[tool]==null)cfg.n[tool]=tool==='examen'?0:10;   // 0 = todas las tarjetas del corte
  if(cfg.temaId&&!state.temas.some(x=>x.id===cfg.temaId&&x.corteId===cfg.corteId))cfg.temaId='';
  if(!cfg.tipos)cfg.tipos='mixto';                       // mixto = opción múltiple + verdadero/falso + completar
  return{corteId:cfg.corteId,n:cfg.n[tool],tipos:cfg.tipos,temaId:cfg.temaId||''};
}
function comenzarQuiz(){
  if(!toolState||!toolState.setup)return;
  const materiaId=route.materiaId,corteId=toolState.corteId;
  const cards=tarjetasDelCorte(materiaId,corteId,toolState.temaId);
  if(route.tool==='escrito'){
    if(!cards.length){toolState.error='No hay tarjetas en este corte para armar el examen.';render(true);return}
    const lista=shuffle(cards).slice(0,toolState.n>0?toolState.n:cards.length).map(c=>({card:c,tipo:'escrito',enun:c.front,correcta:c.back,text:'',rev:false,ok:null,selected:null}));
    ui.quizCfg[materiaId].corteId=corteId;
    toolState={questions:lista,idx:0,score:0,corteId,escrito:true};
    render();return;
  }
  const questions=armarPreguntas(cards,toolState.n,{tipos:toolState.tipos});
  if(!questions){toolState.error='No hay suficiente material en este corte para armar el examen.';render(true);return}
  ui.quizCfg[materiaId].corteId=corteId;
  toolState={questions,idx:0,score:0,corteId};
  render();
}
const TIPOS_PREG=[['mixto','🎲 Mixto'],['mc','🔠 Opción múltiple'],['vf','✅ Verdadero o falso'],['hueco','✍️ Completar']];
function quizSetupHTML(isExam,escrito){
  const m=state.materias.find(x=>x.id===route.materiaId);
  const cortes=state.cortes.filter(c=>c.materiaId===m.id);
  const cards=tarjetasDelCorte(m.id,toolState.corteId,toolState.temaId);
  const distintas=new Set(cards.map(c=>String(c.back).trim())).size;
  const temas=state.temas.filter(x=>x.materiaId===m.id&&x.corteId===toolState.corteId);
  const hay=escrito?cards.length>0:!!armarPreguntas(cards,1,{tipos:'mc'});     // con opciones incorrectas de la IA basta con menos tarjetas
  const temasCorte=state.temas.filter(x=>x.materiaId===m.id&&x.corteId===toolState.corteId);
  const dh=progresoHoy(),hoyN=state.progress.days.includes(fechaLocal(new Date()))?Math.max(dh.racha,META_RACHA):dh.racha;
  const opcionesN=[10,20,30,50].filter(x=>x<cards.length);
  const cuenta=c=>tarjetasDelCorte(m.id,c.id).length;
  return `<div class="viewhead"><h1>${escrito?'✍️ Examen escrito':isExam?'📝 Modo examen':'❓ Quiz'}</h1></div>
  <div class="card quizSetup">
    <label class="lbl" for="quizCorte" style="margin-top:0">¿De qué corte quieres que sea?</label>
    <select class="fld" id="quizCorte" data-action="quizCorte">${cortes.map(c=>`<option value="${c.id}" ${c.id===toolState.corteId?'selected':''}>${esc(c.name)||'(corte sin nombre)'} · ${cuenta(c)} tarjeta${cuenta(c)==1?'':'s'}</option>`).join('')}</select>
    <p class="meta" style="margin:8px 0 0">${temas.length?`Solo se usan los documentos de este corte (${temas.length}): ${temas.slice(0,4).map(x=>esc(x.title)||'sin título').join(', ')}${temas.length>4?'…':''}. No se mezclan otros cortes ni otras materias.`:'Este corte todavía no tiene documentos.'}</p>
    ${temasCorte.length>1?`<label class="lbl" for="quizTema">¿Todo el corte o un solo tema?</label><select class="fld" id="quizTema" data-action="quizTema"><option value="">Todos los temas del corte (${tarjetasDelCorte(m.id,toolState.corteId).length})</option>${temasCorte.map(x=>`<option value="${x.id}" ${x.id===toolState.temaId?'selected':''}>${esc(x.title)||'(tema sin título)'} (${tarjetasDelCorte(m.id,toolState.corteId,x.id).length})</option>`).join('')}</select>`:''}
    ${hay?'':`<div class="fb fbNo" role="alert">No hay suficiente material en este corte: tiene ${distintas} tarjeta${distintas==1?'':'s'} con respuestas distintas y se necesitan al menos ${MIN_MATERIAL} (o tarjetas con opciones incorrectas generadas por la IA). Sube más documentos a este corte o elige otro; no se usarán documentos de otros cortes.</div>`}
    ${toolState.error&&hay?`<div class="fb fbNo" role="alert">${esc(toolState.error)}</div>`:''}
    <label class="lbl" for="quizN">Número de preguntas</label>
    <select class="fld" id="quizN" data-action="quizN">${opcionesN.map(x=>`<option value="${x}" ${toolState.n===x?'selected':''}>${x}</option>`).join('')}<option value="0" ${toolState.n===0||toolState.n>=cards.length?'selected':''}>Todas (${cards.length})</option></select>
    ${escrito?'':`<label class="lbl" for="quizTipos">Tipos de pregunta</label>
    <div class="tipoChips" role="group" aria-label="Tipos de pregunta">${TIPOS_PREG.map(([k,l])=>`<button type="button" class="tChip${toolState.tipos===k?' on':''}" data-action="quizTiposChip" data-v="${k}" aria-pressed="${toolState.tipos===k}">${l}</button>`).join('')}</div>
    ${toolState.tipos==='hueco'&&!cards.some(tieneHueco)?'<p class="meta" style="margin:6px 0 0">Las tarjetas de este corte no traen frases para completar: se preguntarán con opción múltiple.</p>':''}`}
    <div class="premio" style="margin-top:14px"><b>🔥 Racha de hoy: ${hoyN}/${META_RACHA} preguntas</b>
      <div class="bar"><i style="width:${Math.min(100,Math.round(hoyN/META_RACHA*100))}%"></i></div>
      <p class="meta" style="margin:6px 0 0">Las primeras ${META_RACHA} preguntas del día aseguran tu racha. Las demás cuentan como práctica extra: puedes hacer todas las que quieras y quedan en tu historial.</p></div>
    <button class="pr nextBtn" data-action="quizStart" ${hay?'':'disabled'} style="margin-top:14px">Comenzar</button>
  </div>`;
}

/* ---------- Repaso espaciado (Leitner) ----------
   Cada tarjeta vive en una caja del 1 al 5. Si la aciertas cuando te tocaba, sube de caja y tarda más en volver
   (1, 2, 4, 8 y 16 días). Si la fallas, vuelve a la caja 1 y regresa mañana. Practicar fuera de turno no sube de caja. */
const LEITNER=[0,1,2,4,8,16];
const hoyStr=()=>fechaLocal(new Date());
function sumarDias(f,n){const d=new Date(f+'T00:00');d.setDate(d.getDate()+n);return fechaLocal(d)}
function tarjetaPendiente(c,hoy){return !c.due||c.due<=(hoy||hoyStr())}
/* calidad (solo si acertó): 'dificil' = me costó (no sube de caja y vuelve pronto), 'bien' = normal, 'facil' = salta una caja */
function repasarTarjeta(c,acierto,calidad){
  const hoy=hoyStr(),pendiente=tarjetaPendiente(c,hoy);
  c.lastOk=!!acierto;c.last=hoy;
  if(!acierto){c.box=1;c.due=sumarDias(hoy,1);c.fails=(c.fails||0)+1;return}
  if(!pendiente)return;
  if(calidad==='dificil'){c.box=Math.max(1,c.box||0);c.due=sumarDias(hoy,Math.max(1,Math.round(LEITNER[c.box]/2)));return}
  c.box=Math.min(5,(c.box||0)+(calidad==='facil'?2:1));c.due=sumarDias(hoy,LEITNER[c.box]);
}
/* Sesión de hoy: primero las vencidas (las más atrasadas antes) y luego unas pocas nuevas, hasta 20 en total */
function sesionHoy(materiaId,max){
  max=max||20;
  const hoy=hoyStr(),cs=getCardsTodas(materiaId);
  const vencidas=cs.filter(c=>c.due&&c.due<=hoy).sort((a,b)=>a.due.localeCompare(b.due)||(a.box||0)-(b.box||0));
  const nuevas=cs.filter(c=>!c.due);
  return vencidas.concat(nuevas.slice(0,Math.max(0,Math.min(10,max-vencidas.length)))).slice(0,max);
}
function proximoRepasoTexto(materiaId){
  const hoy=hoyStr(),f=getCardsTodas(materiaId).filter(c=>c.due&&c.due>hoy).map(c=>c.due).sort();
  if(!f.length)return 'Practica con flashcards o quiz y Auren programará tus repasos.';
  const n=f.filter(x=>x===f[0]).length;
  return 'El próximo repaso es '+relDate(f[0])+' ('+n+' tarjeta'+(n==1?'':'s')+').';
}
function hoyVacioHTML(){return `<div class="empty"><h2>🎉 Nada pendiente por hoy</h2><p>${esc(proximoRepasoTexto(route.materiaId))}</p></div>`}
/* "Para repasar hoy" es un cajón. Su estado (abierto/cerrado) vive en localStorage con clave propia, NO dentro de `state`
   (que se sincroniza con la nube). Se lee al dibujar, y si localStorage está bloqueado se recuerda en memoria durante la sesión. */
const REPASO_HOY_KEY='auren_repasoHoy_abierto';
let repasoHoyMem=null;
function repasoHoyAbierto(){
  if(repasoHoyMem!==null)return repasoHoyMem;
  try{const v=localStorage.getItem(REPASO_HOY_KEY);if(v==='0')return false;if(v==='1')return true}catch(e){}
  return false;                                          // por defecto, cerrado (se abre al tocarlo)
}
function guardarRepasoHoyAbierto(abierto){
  repasoHoyMem=abierto;
  try{localStorage.setItem(REPASO_HOY_KEY,abierto?'1':'0')}catch(e){}
}
function repasoHoyHTML(){
  if(esProfesor())return '';
  const filas=state.materias.filter(m=>m.rol!=='docente').map(m=>({m,n:sesionHoy(m.id).length})).filter(x=>x.n>0);
  if(!filas.length)return '';
  const total=filas.reduce((s,x)=>s+x.n,0),abierto=repasoHoyAbierto();
  return `<div class="card shareBox repasoHoy${abierto?' open':''}">
    <button type="button" class="rhHead" id="rhBtn" data-action="toggleRepasoHoy" aria-expanded="${abierto}" aria-controls="rhBody"><b>📅 Para repasar hoy: ${total} tarjeta${total==1?'':'s'}</b><span class="chev" aria-hidden="true">▼</span></button>
    <div class="rhBody" id="rhBody"><div class="rhInner"><p class="meta" style="margin:4px 0 8px">Según tus repasos anteriores, hoy te toca ver estas para que no se te olviden.</p>${filas.map(x=>`<div class="li"><span>${esc(x.m.icon)} ${esc(x.m.name)} <small class="meta">· ${x.n}</small></span><button class="sec" data-action="openTool" data-tool="hoy" data-mat="${x.m.id}">Repasar</button></div>`).join('')}</div></div></div>`;
}
/* ---------- Repasar lo que fallé ---------- */
const tarjetasFalladas=materiaId=>getCardsTodas(materiaId).filter(c=>c.lastOk===false);
async function fallosDeExamenes(m){
  const sid=m.sharedId;if(!sid)return[];
  const porTema={};
  for(const ex of examenesDe(m).filter(x=>miIntento(m,x.id))){
    await asegurarClave(m,ex.id);
    const cl=(clMap[sid]||{})[ex.id];if(!cl)continue;
    calificar(ex,cl,(miIntento(m,ex.id)||{}).respuestas||{},currentUid).det.forEach(d=>{
      const k=d.q.temaId;if(!k||!state.temas.some(t=>t.id===k))return;
      const t=porTema[k]=porTema[k]||{temaId:k,titulo:d.q.temaTitulo||'',n:0,mal:0};
      t.n++;if(!d.acierto)t.mal++;
    });
  }
  return Object.values(porTema).filter(t=>t.mal>0).sort((x,y)=>y.mal/y.n-x.mal/x.n||y.mal-x.mal);
}
async function cargarFallosExamenes(materiaId){
  const m=state.materias.find(x=>x.id===materiaId);
  let lista=[];
  if(m&&m.rol==='estudiante'){try{lista=await fallosDeExamenes(m)}catch(e){console.warn('Fallos de exámenes:',e)}}
  if(toolState&&toolState.setup&&route.tool==='falle'&&route.materiaId===materiaId){toolState.temasEx=lista;render(true)}
}
function falleSetupHTML(m){
  const falladas=tarjetasFalladas(m.id),ex=toolState.temasEx;
  return `<div class="viewhead"><h1>🎯 Repasar lo que fallé</h1></div>
  <div class="card"><b>Tarjetas que fallaste</b>
    <p class="meta">${falladas.length?'Tienes <b>'+falladas.length+'</b> tarjeta'+(falladas.length==1?'':'s')+' que fallaste la última vez. Cuando las aciertes salen de esta lista.':'No tienes tarjetas falladas ahora mismo. Cuando falles alguna en un quiz o en flashcards aparecerá aquí.'}</p>
    <button class="pr" data-action="falleStart" data-modo="tarjetas" ${falladas.length?'':'disabled'}>Practicar las que fallé</button></div>
  ${m.rol==='estudiante'?`<div class="card" style="margin-top:12px"><b>Temas donde más fallaste en los exámenes de tu profesor</b>
    ${ex===null||ex===undefined?'<p class="meta">Calculando…</p>':ex.length?ex.map(t=>`<div class="li"><span>${esc(t.titulo||'Tema')}<br><small class="meta">Fallaste ${t.mal} de ${t.n} (${Math.round(t.mal/t.n*100)} %)</small></span><button class="sec" data-action="falleStart" data-modo="tema" data-tema="${t.temaId}">Practicar</button></div>`).join(''):'<p class="meta">Todavía no hay fallos en exámenes que hayas entregado.</p>'}</div>`:''}
  ${toolState.error?`<div class="fb fbNo" role="alert">${esc(toolState.error)}</div>`:''}`;
}
/* Fin de una sesión de quiz / examen / examen escrito: se guarda el intento y se actualizan racha, insignias y etapas */
function cerrarSesionPractica(){
  toolState.fxFin=true;
  mutate(s=>{
    const att={id:uid(),materiaId:route.materiaId,type:route.tool,score:toolState.score,total:toolState.questions.length,date:Date.now(),porCorte:porCorteDe(toolState.questions),corteId:toolState.corteId||null,
      xp:toolState.xp||0,combo:toolState.mejor||0,tablero:toolState.meta?1:0};
    s.attempts.push(att);
    toolState.premios=registrarSesion(att);
  });
  if(toolState.premios&&toolState.premios.nuevos.length)avisarLogros(toolState.premios.nuevos);
}
function escritoHTML(){
  const{questions,idx,score}=toolState;
  if(idx>=questions.length){
    const pct=questions.length?Math.round(score/questions.length*100):0;
    return `<div class="empty"><h2>✍️ Examen escrito terminado</h2><p class="meta">Te calificaste <b>${score} / ${questions.length}</b> · ${pct}%</p>${estrellasHTML(estrellasDe(score/questions.length))}${premiosHTML()}
      <div class="resList">${questions.map((q,i)=>`<p class="meta resRow ${q.ok?'bien':'mal'}" style="--i:${Math.min(i,14)}">${i+1}. ${esc(q.enun)} — ${q.ok?'✅':'❌'}</p>`).join('')}</div>
      <button class="pr" data-action="redoTool">Repetir</button></div>`;
  }
  const q=questions[idx];
  return `<div class="viewhead"><h1>✍️ Examen escrito</h1><span class="meta">${idx+1} / ${questions.length}</span></div>
  ${corteChipHTML()}
  <div class="card qCard"><h3 style="margin-top:0">${esc(q.enun)}</h3>
    <textarea id="escText" class="fld" placeholder="Escribe tu respuesta con tus propias palabras…" ${q.rev?'disabled':''}>${esc(q.text)}</textarea>
    ${q.rev?`<div class="fb" style="border:1px solid var(--ok)"><b>Respuesta del tema:</b> ${esc(q.correcta)}</div>
      <p class="meta" style="margin:6px 0 10px">Compárala con la tuya y cuéntale a Auren cómo te fue.</p>
      <div class="row"><button class="sec" data-action="escNo">❌ Fallé</button><button class="pr" data-action="escOk">✅ Acerté</button></div>`
      :`<button class="pr" data-action="escRevelar" style="margin-top:8px">Ver respuesta</button>`}
  </div>`;
}
function comenzarFalle(modo,temaId){
  if(!toolState||!toolState.setup||route.tool!=='falle')return;
  const mid=route.materiaId;
  const objetivos=modo==='tema'?state.cards.filter(c=>c.materiaId===mid&&c.temaId===temaId):tarjetasFalladas(mid);
  const poolDe=c=>{const t=state.temas.find(x=>x.id===c.temaId);return t?tarjetasDelCorte(mid,t.corteId):[c]};   // opciones solo del mismo corte
  const qs=armarPreguntas(objetivos,20,{poolDe,tipos:'mixto'});
  if(!qs){toolState.error='No hay suficiente material en el corte de esas tarjetas para armar preguntas (hacen falta respuestas de otras tarjetas del mismo corte).';render();return}
  toolState={questions:qs,idx:0,score:0,corteId:null};
  render();
}

function startTool(tool,materiaId){
  clearRepasoTimer();
  const cards=getCards(materiaId);
  ui.dw=ui.dw||{};ui.dw['m:'+materiaId+':est']=true;          // al volver a la materia, el cajón Estudiar sigue abierto
  if(tool==='flashcards'||tool==='memorizar'||tool==='repaso'){
    toolState={cards:shuffle(cards),idx:0,flipped:false,known:0,seen:0,combo:0,mejor:0};
  }else if(tool==='concepto'){
    toolState=armarConcepto(cards);
  }else if(tool==='emparejar'){
    toolState=armarEmparejar(cards);
  }else if(tool==='quiz'||tool==='examen'||tool==='escrito'){
    /* El examen se arma con UN corte elegido (ver comenzarQuiz): nunca mezcla cortes ni materias */
    const cfg=quizCfgDe(materiaId,tool);
    toolState={setup:true,corteId:cfg.corteId,n:cfg.n,tipos:cfg.tipos,temaId:cfg.temaId,error:''};
  }else if(tool==='hoy'){
    toolState={cards:sesionHoy(materiaId),idx:0,flipped:false,known:0,seen:0};
  }else if(tool==='falle'){
    toolState={setup:true,error:'',temasEx:null};
  }else if(tool==='tablero'){
    toolState=armarTablero(materiaId);
  }else if(tool==='comparar'){
    const other=state.materias.find(m=>m.id!==materiaId);
    toolState={materiaId2:other?other.id:null};
  }else{
    toolState={};
  }
  route={view:'tool',tool,materiaId};
  render();
  if(tool==='falle')cargarFallosExamenes(materiaId);
  if(tool==='repaso'&&cards.length){
    toolState.secondsLeft=REPASO_SEG;
    repasoTimer=setInterval(()=>{
      toolState.secondsLeft--;
      const el=$('repasoTimerText');
      if(el)el.textContent=fmtSecs(toolState.secondsLeft);
      const br=$('repasoBar');if(br)br.style.width=(toolState.secondsLeft/REPASO_SEG*100)+'%';
      if(toolState.secondsLeft<=0){
        clearRepasoTimer();
        const k='repaso_'+materiaId,rec=leerRecord(k);
        toolState.recordAntes=rec;if(toolState.known>rec)guardarRecord(k,toolState.known);
        toolState.fxFin=true;toolState.fxPct=toolState.known>rec&&toolState.known>0?1:0;
        render();
      }
    },1000);
  }
  if(tool==='emparejar'&&toolState.pares&&toolState.pares.length){
    repasoTimer=setInterval(()=>{const el=$('empTime');if(el&&!toolState.fin)el.textContent=fmtSecs(Math.floor((Date.now()-toolState.t0)/1000))},1000);
  }
}

function viewToolHTML(){
  const{tool,materiaId}=route;
  const m=state.materias.find(x=>x.id===materiaId);
  if(!m){goToView('materias');return'';}
  const head=`<button class="sec" data-action="backMateria" data-id="${materiaId}">← ${esc(m.icon)} ${esc(m.name)}</button><div style="margin-top:14px"></div>`;
  let body='';
  if(tool==='flashcards')body=toolFlashcardsHTML();
  else if(tool==='hoy')body=toolFlashcardsHTML('📅 Repaso de hoy');
  else if(tool==='falle')body=toolState.setup?falleSetupHTML(m):toolQuizHTML(false);
  else if(tool==='memorizar')body=toolMemorizarHTML(m);
  else if(tool==='quiz')body=toolQuizHTML(false);
  else if(tool==='examen')body=toolQuizHTML(true);
  else if(tool==='escrito')body=toolState.setup?quizSetupHTML(false,true):escritoHTML();
  else if(tool==='concepto')body=toolConceptoHTML();
  else if(tool==='emparejar')body=toolEmparejarHTML();
  else if(tool==='repaso')body=toolRepasoHTML();
  else if(tool==='tablero')body=tableroHTML();
  else if(tool==='comparar')body=toolCompararHTML(m);
  else if(tool==='progreso')body=toolProgresoHTML(m);
  else if(tool==='referencias')body=toolReferenciasHTML(m);
  return head+body;
}

/* Barra de avance y marcador de los juegos de tarjetas */
function marcadorHTML(idx,total,ok,combo){
  return `<div class="bar qbar"><i style="width:${Math.round(idx/total*100)}%"></i></div>
  <div class="marcador"><span class="chip">✅ ${ok} ${ok==1?'acierto':'aciertos'}</span>${combo>=2?`<span class="comboChip">🔥 ${combo} seguidas</span>`:''}</div>`;
}
function toolFlashcardsHTML(titulo){
  const esHoy=route.tool==='hoy';
  const{cards,idx,flipped,known,seen}=toolState;
  if(!cards.length)return esHoy?hoyVacioHTML():noCardsMsg();
  if(idx>=cards.length)return finJuegoHTML({titulo:esHoy?'📅 ¡Repaso de hoy listo!':'🔄 ¡Terminaste!',ok:known,total:seen,
    linea:'Te sabías '+known+' de '+pluralMv(seen,'tarjeta','tarjetas')+(toolState.mejor>=3?' · mejor racha: '+toolState.mejor+' seguidas 🔥':'')+'.',
    extra:esHoy?`<p class="meta">${esc(proximoRepasoTexto(route.materiaId))}</p>`:'',redo:esHoy?'Ver si queda algo por hoy':'Jugar otra vez'});
  const c=cards[idx];
  return `
  <div class="viewhead"><h1>${titulo||'🔄 Flashcards'}</h1><span class="meta">${idx+1} / ${cards.length}</span></div>
  ${marcadorHTML(idx,cards.length,known,toolState.combo||0)}
  <div class="row" style="justify-content:space-between;margin:0 0 8px">${esHoy?`<span class="chip">${c.box?'Caja '+c.box+' de 5':'Nueva'}</span>`:'<span></span>'}${ttsBtn('ttsCard','data-id="'+cards[idx].id+'"')}</div>
  <div class="flashcard ${flipped?'flip':''}" data-action="flipCard" role="button" tabindex="0" aria-pressed="${flipped}" aria-label="${flipped?'Respuesta':'Pregunta'}: ${esc(flipped?c.back:c.front)}. Pulsa Enter para voltear.">
    <div class="fcInner" aria-hidden="true"><div class="fcFace fcFront"><span class="fcTag">Pregunta</span>${esc(c.front)}</div><div class="fcFace fcBack"><span class="fcTag">Respuesta</span>${esc(c.back)}</div></div>
  </div>
  <p class="meta" style="text-align:center">👆 Primero intenta recordarla, luego toca la tarjeta para voltearla</p>
  <div class="row fcResp" style="justify-content:center;flex-wrap:wrap" role="group" aria-label="¿Qué tan bien te la sabías?">
    <button class="sec" data-action="cardAnswer" data-know="0" title="Vuelve mañana">😕 No la sé</button>
    <button class="sec" data-action="cardAnswer" data-know="1" data-cal="dificil" title="Acertaste, pero vuelve pronto">🤔 Me costó</button>
    <button class="pr" data-action="cardAnswer" data-know="1" data-cal="bien" title="Sube una caja">😊 La sé</button>
    <button class="sec" data-action="cardAnswer" data-know="1" data-cal="facil" title="Salta una caja: tarda más en volver">😎 Fácil</button>
  </div>`;
}

/* Memorizar: la respuesta está tapada. La persona intenta recordarla, la destapa y dice si la recordó. */
function toolMemorizarHTML(m){
  const cards=toolState.cards||[];
  if(!cards.length)return noCardsMsg();
  return `<div class="viewhead"><h1>🙈 Memorizar</h1><span class="meta" id="memoCuenta">${memoCuentaTxt()}</span></div>
  <p class="meta">Lee la pregunta, intenta decir la respuesta en voz alta y toca <b>Destapar</b> para comprobar.</p>
  <div class="bar"><i id="memoBar" style="width:0%"></i></div>
  <div class="memoList">${cards.map((c,i)=>`<div class="memo" data-memo="${i}">
    <b class="memoQ">${esc(c.front)}</b>
    <button type="button" class="memoA" data-action="memoVer" data-i="${i}" aria-expanded="false"><span class="memoTapa">👀 Destapar respuesta</span><span class="memoTxt">${esc(c.back)}</span></button>
    <div class="memoYo" role="group" aria-label="¿La recordaste?"><button type="button" class="sec sm" data-action="memoYo" data-i="${i}" data-ok="1">😊 La recordé</button><button type="button" class="sec sm" data-action="memoYo" data-i="${i}" data-ok="0">😕 No</button></div>
  </div>`).join('')}</div>
  <div class="row" style="justify-content:center;flex-wrap:wrap;margin-top:16px"><button class="sec" data-action="redoTool">🔀 Mezclar de nuevo</button><button class="pr" data-action="openTool" data-tool="flashcards" data-mat="${m.id}">Ponme a prueba →</button></div>`;
}
function memoCuentaTxt(){const r=toolState.memo||{},v=Object.values(r);return v.filter(x=>x===1).length+' / '+(toolState.cards||[]).length+' recordadas'}

/* ¿Qué concepto?: se muestra la definición y se elige el término entre 4 opciones (con pista opcional) */
function armarConcepto(cards){
  const frentes=[...new Set(cards.map(c=>limpioT(c.front)))];
  const conOpc=frentes.length>=4;
  const qs=shuffle(cards).map(c=>({card:c,opts:conOpc?shuffle([limpioT(c.front),...shuffle(frentes.filter(f=>f!==limpioT(c.front))).slice(0,3)]):null,sel:null}));
  return{cards,qs,idx:0,score:0,combo:0,mejor:0,pista:false,flipped:false};
}
function pistaDe(t){
  const pal=String(t).trim().split(/\s+/);
  return pal.map(w=>w.charAt(0)+'·'.repeat(Math.max(0,Math.min(w.length-1,12)))).join(' ')+' ('+pluralMv(pal.length,'palabra','palabras')+')';
}
function toolConceptoHTML(){
  const{qs,idx,score}=toolState;
  if(!qs.length)return noCardsMsg();
  if(idx>=qs.length)return finJuegoHTML({titulo:'💡 ¡Adivinaste los conceptos!',ok:score,total:qs.length,linea:toolState.mejor>=3?'Mejor racha: '+toolState.mejor+' seguidas 🔥':''});
  const q=qs[idx],c=q.card,correcta=limpioT(c.front),contesto=q.sel!=null,acierto=contesto&&q.sel===correcta;
  const pista=`<div class="pistaBox">${toolState.pista?`<span>💡 Pista: <b>${esc(pistaDe(correcta))}</b></span>`:`<button type="button" class="sec sm" data-action="conceptoPista" ${contesto?'disabled':''}>💡 Ver pista</button>`}</div>`;
  let cuerpo;
  if(q.opts){
    cuerpo=q.opts.map((o,i)=>{
      let cls='sec optBtn';
      if(contesto){if(o===correcta)cls+=' ok '+(acierto?'pop':'reveal');else if(o===q.sel)cls+=' no shake'}
      return `<button class="${cls}" data-action="conceptoOpt" data-i="${i}" ${contesto?'disabled':''}>${esc(o)}</button>`;
    }).join('');
  }else{
    cuerpo=contesto?`<div class="fb ${acierto?'fbOk':'fbNo'}">Concepto: <b>${esc(correcta)}</b></div>`
      :(toolState.flipped?`<p class="meta">Concepto:</p><h3>${esc(correcta)}</h3><div class="row" style="justify-content:center"><button class="sec" data-action="conceptoAuto" data-ok="0">😕 Fallé</button><button class="pr" data-action="conceptoAuto" data-ok="1">😊 Acerté</button></div>`
      :`<button class="sec" data-action="conceptoRevelar">Mostrar respuesta</button>`);
  }
  return `
  <div class="viewhead"><h1>💡 ¿Qué concepto?</h1><span class="meta">${idx+1} / ${qs.length}</span></div>
  ${marcadorHTML(idx,qs.length,score,toolState.combo||0)}
  <div class="card qCard ${contesto?'answered':''}">
    <p class="meta" style="margin-top:0">¿A qué concepto se refiere?</p>
    <h3 class="conceptoDef">${esc(c.back)}</h3>
    ${pista}
    ${cuerpo}
  </div>
  ${contesto&&q.opts?feedbackHTML(acierto,{correcta,card:c},idx):''}
  ${contesto?`<button class="pr nextBtn" data-action="conceptoNext">${idx+1>=qs.length?'Ver resultado →':'Siguiente →'}</button>`:''}`;
}

/* Emparejar: columna de términos y columna de definiciones mezcladas. Se toca uno de cada lado. */
const EMP_PARES=6;
function armarEmparejar(cards){
  const vistos=new Set(),pares=[];
  shuffle(cards).forEach(c=>{const k=limpioT(c.front)+'|'+limpioT(c.back);if(!vistos.has(k)&&pares.length<EMP_PARES){vistos.add(k);pares.push({id:c.id,front:limpioT(c.front),back:limpioT(c.back)})}});
  const idx=pares.map((_,i)=>i);
  return{pares,izq:shuffle(idx),der:shuffle(idx),hechos:[],errores:0,t0:Date.now(),fin:false,total:cards.length};
}
function toolEmparejarHTML(){
  const st=toolState,{pares}=st;
  if(pares.length<2)return '<div class="empty">Para emparejar hacen falta al menos 2 tarjetas con frente y reverso en esta materia (o en lo que elegiste en «Practicar con»).</div>';
  if(st.fin){
    const seg=st.seg,rec=st.recordAntes,nuevo=!rec||seg<rec,n=st.errores===0?3:st.errores<=2?2:1;
    return finJuegoHTML({titulo:'🧩 ¡Todas emparejadas!',ok:pares.length,total:pares.length+st.errores,estrellas:n,
      msg:n===3?'¡Sin un solo error! 🤩':n===2?'¡Muy bien! 🎉':'¡Lo lograste! La próxima, con menos errores 💪',
      linea:'Tiempo: <b>'+fmtSecs(seg)+'</b> · '+pluralMv(st.errores,'error','errores')+(nuevo?' · 🏆 ¡Nuevo récord!':' · récord: '+fmtSecs(rec)),
      redo:st.total>pares.length?'Otra ronda con otras tarjetas':'Jugar otra vez'});
  }
  const hecho=i=>st.hechos.includes(i);
  return `<div class="viewhead"><h1>🧩 Emparejar</h1><span class="meta">⏱️ <span id="empTime">${fmtSecs(Math.floor((Date.now()-st.t0)/1000))}</span></span></div>
  <div class="bar qbar"><i id="empBar" style="width:${Math.round(st.hechos.length/pares.length*100)}%"></i></div>
  <div class="marcador"><span class="chip" id="empCuenta">🧩 ${st.hechos.length} / ${pares.length} parejas</span><span class="chip" id="empErr">❌ ${st.errores}</span></div>
  <p class="meta">Toca un término y después su definición. Si aciertas, desaparecen.</p>
  <div class="empGrid">
    <div class="empCol" role="group" aria-label="Términos">${st.izq.map(i=>`<button type="button" class="empT izq${hecho(i)?' ok hecha':''}" data-action="empPick" data-lado="izq" data-i="${i}" ${hecho(i)?'disabled':''}>${esc(pares[i].front)}</button>`).join('')}</div>
    <div class="empCol" role="group" aria-label="Definiciones">${st.der.map(i=>`<button type="button" class="empT der${hecho(i)?' ok hecha':''}" data-action="empPick" data-lado="der" data-i="${i}" ${hecho(i)?'disabled':''}>${esc(pares[i].back)}</button>`).join('')}</div>
  </div>`;
}
/* Se maneja sin repintar la pantalla, para que las animaciones se vean y el reloj siga */
function empPick(b){
  const st=toolState;if(!st||!st.pares||st.fin||b.disabled)return;
  const lado=b.dataset.lado,i=+b.dataset.i;
  const grid=b.closest('.empGrid');if(!grid)return;
  grid.querySelectorAll('.empT.'+lado+'.sel').forEach(x=>x.classList.remove('sel'));
  b.classList.add('sel');
  const L=grid.querySelector('.empT.izq.sel'),R=grid.querySelector('.empT.der.sel');
  if(!L||!R)return;
  const pi=st.pares[+L.dataset.i],pd=st.pares[+R.dataset.i];
  const ok=+L.dataset.i===+R.dataset.i||pi.back===pd.back||pi.front===pd.front;     // tarjetas repetidas también valen
  L.classList.remove('sel');R.classList.remove('sel');
  if(ok){
    const a=+L.dataset.i,d=+R.dataset.i;
    st.hechos.push(a);if(d!==a){st.hechos.push(d)}
    [L,R].forEach(x=>{x.classList.add('ok','pop');x.disabled=true;setTimeout(()=>x.classList.add('hecha'),450)});
    if(d!==a){                                                        // los "gemelos" de texto igual también se marcan
      const L2=grid.querySelector('.empT.izq[data-i="'+d+'"]'),R2=grid.querySelector('.empT.der[data-i="'+a+'"]');
      [L2,R2].forEach(x=>{if(x){x.classList.add('ok','hecha');x.disabled=true}});
    }
    if(!reducido())explotar(R);
  }else{
    st.errores++;
    [L,R].forEach(x=>{x.classList.remove('shake');void x.offsetWidth;x.classList.add('no','shake');setTimeout(()=>x.classList.remove('no','shake'),600)});
  }
  const n=new Set(st.hechos).size;
  const cu=$('empCuenta');if(cu)cu.textContent='🧩 '+n+' / '+st.pares.length+' parejas';
  const er=$('empErr');if(er)er.textContent='❌ '+st.errores;
  const br=$('empBar');if(br)br.style.width=Math.round(n/st.pares.length*100)+'%';
  if(n>=st.pares.length){
    st.fin=true;st.seg=Math.max(1,Math.round((Date.now()-st.t0)/1000));clearRepasoTimer();
    const k='emparejar_'+route.materiaId;st.recordAntes=leerRecord(k);
    if(!st.recordAntes||st.seg<st.recordAntes)guardarRecord(k,st.seg);
    st.fxFin=true;st.fxPct=st.errores<=2?1:0;
    setTimeout(()=>{if(toolState===st&&route.tool==='emparejar')render()},650);
  }
}

const REPASO_SEG=300;
function toolRepasoHTML(){
  const{cards,idx,flipped,secondsLeft,known,seen}=toolState;
  if(!cards.length)return noCardsMsg();
  if(secondsLeft<=0){
    const rec=toolState.recordAntes||0,nuevo=known>rec&&known>0;
    return finJuegoHTML({titulo:'⏱️ ¡Tiempo!',ok:known,total:seen,
      linea:'En 5 minutos te supiste <b>'+known+'</b> de '+pluralMv(seen,'tarjeta','tarjetas')+'. '+(nuevo?'🏆 ¡Nuevo récord!':'Tu récord: '+rec+'.'),
      redo:'Intentar superar mi récord'});
  }
  const c=cards[idx%cards.length],rec=leerRecord('repaso_'+route.materiaId);
  return `
  <div class="viewhead"><h1>⏱️ Contrarreloj</h1><span class="meta reloj">⏱️ <b id="repasoTimerText">${fmtSecs(secondsLeft)}</b></span></div>
  <div class="bar tiempo"><i id="repasoBar" style="width:${secondsLeft/REPASO_SEG*100}%"></i></div>
  <div class="marcador"><span class="chip">✅ ${known} ${known==1?'acierto':'aciertos'}</span>${rec?`<span class="chip">🏆 Récord: ${rec}</span>`:''}${(toolState.combo||0)>=2?`<span class="comboChip">🔥 ${toolState.combo} seguidas</span>`:''}</div>
  <div class="flashcard ${flipped?'flip':''}" data-action="flipCard" role="button" tabindex="0" aria-pressed="${flipped}" aria-label="${flipped?'Respuesta':'Pregunta'}: ${esc(flipped?c.back:c.front)}. Pulsa Enter para voltear.">
    <div class="fcInner" aria-hidden="true"><div class="fcFace fcFront"><span class="fcTag">Pregunta</span>${esc(c.front)}</div><div class="fcFace fcBack"><span class="fcTag">Respuesta</span>${esc(c.back)}</div></div>
  </div>
  <p class="meta" style="text-align:center">¡Rápido! Toca para voltear y di si la sabías</p>
  <div class="row" style="justify-content:center">
    <button class="sec" data-action="cardAnswer" data-know="0">😕 Repasar</button>
    <button class="pr" data-action="cardAnswer" data-know="1">😊 La sé</button>
  </div>`;
}

function enunciadoHTML(q){
  if(q.tipo==='vf')return `${esc(q.enun)}<br><span class="vfAfirm">«${esc(q.afirm)}»</span><br><small class="meta">¿Verdadero o falso?</small>`;
  if(q.tipo==='hueco')return 'Completa:<br>'+esc(q.enun).replace('____','<span class="hueco">____</span>');
  return esc(q.enun);
}
function huecoHTML(q,instante,contesto,acierto){
  if(!contesto)return `<input class="fld" id="huecoInput" autocomplete="off" autocapitalize="off" placeholder="Escribe la palabra o frase que falta" maxlength="80"><button class="pr" data-action="answerHueco" style="margin-top:8px">Comprobar</button>`;
  return `<div class="sec optBtn ${instante?(acierto?'ok pop':'no shake'):'chosen'}" style="cursor:default">${esc(q.selected)}</div>${instante&&!acierto?`<p class="meta" style="margin:6px 0 0">Respuesta esperada: <b>${esc(q.correcta)}</b></p>`:''}`;
}
/* Para repasar: al final, las preguntas falladas con la respuesta correcta y su explicación */
function paraRepasarHTML(questions){
  const mal=questions.filter(q=>!esAcierto(q));
  return `<div class="repasar"><h3>📌 Para repasar</h3>${mal.length?mal.map(q=>`<div class="repItem"><b>${esc(q.enun).replace('____','<span class="hueco">____</span>')}${q.tipo==='vf'?' «'+esc(q.afirm)+'»':''}</b><span>Correcta: <b>${esc(q.correcta)}</b>${q.selected&&q.selected!=='(sin respuesta)'?' · tú: '+esc(q.selected):''}</span>${explicacionHTML(q.card&&q.card.exp)}</div>`).join(''):'<p class="meta" style="margin:0">No fallaste ninguna. ¡Perfecto! 🎉</p>'}</div>`;
}
function corteChipHTML(){
  const c=state.cortes.find(x=>x.id===toolState.corteId);
  return c?`<div class="chips" style="margin:-4px 0 8px"><span class="chip">📁 ${esc(c.name)||'(corte sin nombre)'}</span></div>`:'';
}
function toolQuizHTML(isExam){
  if(toolState.setup)return quizSetupHTML(isExam);
  const{questions,idx,score}=toolState;
  if(!questions.length)return'<div class="empty">Necesitás al menos 2 tarjetas con frente y reverso en esta materia para generar preguntas.</div>';
  const instante=!isExam||examInstantaneo;     // el quiz siempre muestra la respuesta; el examen solo si se activa
  if(idx>=questions.length){
    const pct=Math.round(score/questions.length*100);
    const tono=pct>=70?'alto':pct>=40?'medio':'bajo';
    const msg=pct===100?'¡Perfecto! 🤩':pct>=70?'¡Excelente trabajo! 🎉':pct>=40?'Vas bien, un repaso más y lo logras 💪':'Cada intento cuenta. ¡Repasa y vuelve a probar! 🌱';
    return `<div class="empty resultado">
    <h2>${isExam?'📝':'❓'} ¡Listo!</h2>
    <div class="ringWrap ${tono}"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="rbg" cx="60" cy="60" r="52"/><circle class="rfg" cx="60" cy="60" r="52" style="--p:${pct}"/></svg>
      <div class="ringTxt"><b class="countUp" data-to="${score}">${score}</b><span>/ ${questions.length}</span></div></div>
    ${estrellasHTML(estrellasDe(score/questions.length))}
    <p class="resMsg">${msg}</p>
    <p class="meta">Resultado: <b>${score} / ${questions.length}</b> · ${pct}%${(state.cortes.find(x=>x.id===toolState.corteId)||{}).name?' · '+esc(state.cortes.find(x=>x.id===toolState.corteId).name):''}</p>
    ${premiosHTML()}
    ${isExam?'':paraRepasarHTML(questions)}
    ${isExam?`<div class="resList">${questions.map((q,i)=>`<p class="meta resRow ${esAcierto(q)?'bien':'mal'}" style="--i:${Math.min(i,14)}">${i+1}. ${esc(q.enun)}${q.tipo==='vf'?' «'+esc(q.afirm)+'»':''} — ${esAcierto(q)?'✅':'❌ correcta: '+esc(q.correcta)}${esAcierto(q)?'':explicacionHTML(q.card&&q.card.exp)}</p>`).join('')}</div>`:''}
    <div class="row finBtns"><button class="pr" data-action="redoTool">Jugar otra vez</button><button class="sec" data-action="backMateria" data-id="${route.materiaId}">Elegir otra actividad</button></div></div>`;
  }
  const q=questions[idx];
  const contesto=!!q.selected,acierto=contesto&&esAcierto(q);
  const prog0=Math.round(idx/questions.length*100),prog1=Math.round((idx+(contesto?1:0))/questions.length*100);
  const combo=toolState.combo||0;
  return `
  <div class="viewhead"><h1>${isExam?'📝 Modo examen':'❓ Quiz'}</h1><span class="meta">${idx+1} / ${questions.length}</span></div>
  ${corteChipHTML()}
  <div class="bar qbar"><i style="width:${prog1}%;--from:${prog0}%"></i></div>
  ${isExam?`<button type="button" class="toggleChip ${examInstantaneo?'on':''}" data-action="toggleInstante" ${contesto?'disabled':''}>⚡ Ver si acerté al instante: ${examInstantaneo?'Sí':'No'}</button>`:''}
  ${instante?`<div class="marcador"><span class="chip">⭐ ${toolState.xp||0} XP</span>${combo>=2?`<span class="comboChip">🔥 Combo x${combo}</span>`:''}</div>`:''}
  <div class="card qCard ${contesto?'answered':''}"><h3 style="margin-top:0">${enunciadoHTML(q)}</h3>
    ${q.tipo==='hueco'?huecoHTML(q,instante,contesto,acierto):q.options.map(o=>{
      let cls='sec optBtn';
      if(instante&&contesto){
        if(o===q.correcta)cls+=' ok '+(acierto?'pop':'reveal');
        else if(o===q.selected)cls+=' no shake';
      }else if(!instante&&o===q.selected){
        cls+=' chosen picked';
      }
      return `<button class="${cls}" data-action="answerQuiz" data-opt="${esc(o)}" ${contesto?'disabled':''}>${esc(o)}</button>`;
    }).join('')}
  </div>
  ${instante&&contesto?feedbackHTML(acierto,q,idx):''}
  ${contesto?`<button class="pr nextBtn" data-action="nextQuestion">${idx+1>=questions.length?'Ver resultado →':'Siguiente →'}</button>`:''}`;
}

function toolCompararHTML(m){
  const others=state.materias.filter(x=>x.id!==m.id);
  if(!others.length)return'<div class="empty">Necesitás al menos 2 materias para comparar.</div>';
  if(!toolState.materiaId2)toolState.materiaId2=others[0].id;
  const m2=state.materias.find(x=>x.id===toolState.materiaId2)||others[0];
  const c1=getCards(m.id),c2=getCards(m2.id);
  return `
  <div class="viewhead"><h1>⚖️ Comparar</h1></div>
  <label class="lbl">Comparar con:</label>
  <select class="fld" data-action="setCompareMateria" style="max-width:280px">
    ${others.map(o=>`<option value="${o.id}" ${o.id===m2.id?'selected':''}>${esc(o.icon)} ${esc(o.name)}</option>`).join('')}
  </select>
  <div class="two" style="margin-top:14px">
    <div class="card"><h3 style="margin-top:0">${esc(m.icon)} ${esc(m.name)}</h3>${c1.map(c=>`<p class="meta"><b style="color:var(--t)">${esc(c.front)}:</b> ${esc(c.back)}</p>`).join('')||'<p class="meta">Sin tarjetas.</p>'}</div>
    <div class="card"><h3 style="margin-top:0">${esc(m2.icon)} ${esc(m2.name)}</h3>${c2.map(c=>`<p class="meta"><b style="color:var(--t)">${esc(c.front)}:</b> ${esc(c.back)}</p>`).join('')||'<p class="meta">Sin tarjetas.</p>'}</div>
  </div>`;
}

function toolProgresoHTML(m){
  const cards=getCards(m.id);
  const known=cards.filter(c=>c.known===true).length;
  const attempts=state.attempts.filter(a=>a.materiaId===m.id).sort((a,b)=>b.date-a.date).slice(0,15);
  const pct=cards.length?Math.round(known/cards.length*100):0;
  return `
  <div class="viewhead"><h1>📊 Mi progreso</h1></div>
  <div class="card">
    <p class="meta" style="margin-top:0">Tarjetas dominadas</p>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p class="meta">${known} / ${cards.length} (${pct}%)</p>
  </div>
  <h3>Historial de quiz y exámenes</h3>
  ${attempts.length?attempts.map(a=>`<div class="li"><span>${a.type==='examen'?'📝':a.type==='escrito'?'✍️':'❓'} ${a.score}/${a.total}${(state.cortes.find(c=>c.id===a.corteId)||{}).name?' · '+esc(state.cortes.find(c=>c.id===a.corteId).name):''}${a.extra?` <small class="meta">(${a.extra} de práctica extra)</small>`:''}</span><small>${relTime(a.date)}</small></div>`).join(''):'<p class="meta">Todavía no hiciste ningún quiz o examen en esta materia.</p>'}`;
}

function toolReferenciasHTML(m){
  return `
  <div class="viewhead"><h1>📚 Referencias</h1></div>
  <p class="meta">Guardá acá tu bibliografía o fuentes de esta materia.</p>
  <textarea class="fld" style="min-height:220px" data-action="editMateriaRefs" data-id="${m.id}" placeholder="Ej: Papalia, D. (2012). Desarrollo humano...">${esc(m.refs||'')}</textarea>`;
}

