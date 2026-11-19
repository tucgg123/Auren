/* ======================================================================
   RACHAS, ESTAMPILLAS Y CAMINO AL ÉXITO  (Etapa 4)
   Todo vive en state.progress, que ya se guarda y sincroniza con la cuenta:
     days:    días (AAAA-MM-DD, hora local) con una sesión válida de Modo examen
     badges:  insignias y estampillas desbloqueadas  { id: fecha }
     sellos:  etapas del Camino al éxito completadas { corteId: {t,materia,corte} }
     exams:   total de sesiones válidas (se conserva aunque borres una materia)
     xp:      XP ganada respondiendo (aciertos, combos, misiones y metas del Juego de tablero)
     dia:     lo de hoy: preguntas de racha, práctica extra, mejor combo y misiones cumplidas
   Sesión válida = terminar el Modo examen con al menos MIN_PREGUNTAS preguntas.
   ====================================================================== */
const MIN_PREGUNTAS=5;     // mínimo de preguntas para que un examen cuente en el Camino al éxito y en las insignias de rendimiento
const META_RACHA=10;       // preguntas al día (Quiz o Modo examen) que aseguran la racha. Las demás son práctica extra.
const HITOS_RACHA=[3,10,15,30];
const NIVELES=['Novato','Aprendiz','Estudioso','Constante','Experto','Maestro','Leyenda'];
let logrosTab='racha';
/* XP por acierto: 10 y, con combo (aciertos seguidos), 5 más por cada uno hasta +20 (x2 → 15, x3 → 20 … x5 o más → 30) */
const xpAcierto=combo=>10+Math.min(Math.max((combo||1)-1,0),4)*5;
/* Misiones diarias: se cumplen con lo que haces hoy en Quiz, Modo examen, Lo que fallé y Juego de tablero */
const MISIONES=[
  {id:'preg',ico:'🎯',txt:'Responde '+META_RACHA+' preguntas',xp:20,meta:META_RACHA,val:d=>(d.racha||0)+(d.extra||0)},
  {id:'combo',ico:'⚡',txt:'Logra un combo de 3',xp:30,meta:3,val:d=>d.combo||0},
  {id:'tablero',ico:'🎲',txt:'Llega a la meta del Juego de tablero',xp:25,meta:1,val:d=>d.tablero||0}
];
function misionesHTML(){
  const d=progresoHoy(),hechas=d.mis||{};
  return `<div class="misiones"><b class="misT">Misiones de hoy</b>${MISIONES.map(mi=>{const v=Math.min(mi.val(d),mi.meta),ok=!!hechas[mi.id];
    return `<div class="mision${ok?' ok':''}"><span class="misIco" aria-hidden="true">${ok?'✅':mi.ico}</span><div class="misTx"><span>${esc(mi.txt)}</span><div class="bar mini"><i style="width:${Math.round(v/mi.meta*100)}%"></i></div></div><b class="misXp">${ok?'Hecha':'+'+mi.xp+' XP'}</b></div>`}).join('')}</div>`;
}
let logrosMat=null;

function fechaLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function numDia(s){const[y,m,d]=s.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000)}   // sin problemas de cambio de hora
function progresoHoy(){const p=state.progress||{},f=fechaLocal(new Date());return(p.dia&&p.dia.f===f)?p.dia:{f,racha:0,extra:0}}
function esValida(a){return !!(a&&a.type==='examen'&&a.total>=MIN_PREGUNTAS)}

/* Día de gracia: 1 por semana (lunes a domingo). Si te saltas UN día y estudiaste el anterior, ese hueco se cubre solo
   y la racha sigue. El día cubierto no suma a la racha, solo evita que se rompa. */
function semanaDe(n){return Math.floor((n+3)/7)}       // n = numDia; el día 0 (1-ene-1970) fue jueves
function rachaInfo(days){
  const set=new Set((days||[]).map(numDia));
  const hoy=numDia(fechaLocal(new Date()));
  let d=hoy,n=0;
  const usadas=new Set(),congelados=[];
  if(!set.has(d))d--;                               // si hoy todavía no estudias, la racha sigue viva hasta que acabe el día
  for(;;){
    if(set.has(d)){n++;d--;continue}
    if(set.has(d-1)&&!usadas.has(semanaDe(d))){usadas.add(semanaDe(d));congelados.push(d);d--;continue}
    break;
  }
  return{racha:n,congelados,graciaDisponible:!usadas.has(semanaDe(hoy)),hoy};
}
function rachaActual(days){return rachaInfo(days).racha}
function mejorRacha(days){
  const ds=[...new Set((days||[]).map(numDia))].sort((a,b)=>a-b);
  let mejor=0,run=0,prev=null,usadas=new Set();
  ds.forEach(d=>{
    if(prev===null){run=1;usadas=new Set()}
    else if(d===prev+1)run++;
    else if(d===prev+2&&!usadas.has(semanaDe(prev+1))){usadas.add(semanaDe(prev+1));run++}
    else{run=1;usadas=new Set()}
    prev=d;if(run>mejor)mejor=run;
  });
  return mejor;
}

/* ---------- Insignias y estampillas ---------- */
const BADGES=[
  {id:'primer_examen',icon:'📝',nombre:'Primer examen',tipo:'meta',desc:'Termina tu primer Modo examen (mínimo '+MIN_PREGUNTAS+' preguntas).',test:c=>c.p.exams>=1},
  {id:'racha_3',icon:'🌱',nombre:'Insignia de inicio',tipo:'constancia',desc:'3 días seguidos completando tus '+META_RACHA+' preguntas diarias.',test:c=>c.mejor>=3},
  {id:'racha_10',icon:'🔥',nombre:'Estampilla de constancia',tipo:'constancia',desc:'10 días seguidos de estudio.',test:c=>c.mejor>=10},
  {id:'racha_15',icon:'⭐',nombre:'Estampilla especial',tipo:'constancia',desc:'15 días seguidos de estudio.',test:c=>c.mejor>=15},
  {id:'racha_30',icon:'🏆',nombre:'Insignia de disciplina',tipo:'constancia',desc:'30 días seguidos de estudio.',test:c=>c.mejor>=30},
  {id:'perfecto',icon:'💯',nombre:'Examen perfecto',tipo:'rendimiento',desc:'Responde todas las preguntas bien en un Modo examen.',
    test:c=>!!c.att&&esValida(c.att)&&c.att.score===c.att.total},
  {id:'mejora',icon:'📈',nombre:'Estampilla de mejora',tipo:'rendimiento',desc:'Supera en 10 puntos o más tu mejor resultado anterior en la misma materia.',
    test:c=>{
      if(!c.att||!esValida(c.att))return false;
      const prev=state.attempts.filter(a=>a.materiaId===c.att.materiaId&&a.id!==c.att.id&&esValida(a));
      if(!prev.length)return false;
      const mejorPrev=Math.max(...prev.map(a=>a.score/a.total));
      return c.att.score/c.att.total>=mejorPrev+0.1;
    }},
  {id:'dominio',icon:'🧠',nombre:'Dominio',tipo:'rendimiento',desc:'Domina el 80% de las tarjetas de una materia (con al menos 10 tarjetas).',
    test:()=>state.materias.some(m=>{
      if(m.rol==='docente')return false;
      const cs=getCards(m.id);
      return cs.length>=10&&cs.filter(k=>k.known===true).length/cs.length>=0.8;
    })},
  {id:'meta_nota',icon:'🎯',nombre:'Meta alcanzada',tipo:'rendimiento',desc:'Asegura tu nota meta en una materia con las notas de tus cortes.',
    test:()=>state.materias.some(m=>{
      if(m.rol==='docente')return false;
      const k=corteStats(state.cortes.filter(c=>c.materiaId===m.id));
      return k.W>0&&k.Ws>0&&k.goal>0&&k.acum>=k.goal;
    })}
];

function sembrarProgreso(){
  const p=state.progress=state.progress||{};
  p.days=p.days||[];p.badges=p.badges||{};p.sellos=p.sellos||{};p.exams=p.exams||0;
  if(p.sembrado)return;
  /* Primera vez con esta función: se cuenta lo que ya habías hecho para no empezar de cero */
  const validos=(state.attempts||[]).filter(esValida);
  validos.forEach(a=>{const d=fechaLocal(new Date(a.date));if(!p.days.includes(d))p.days.push(d)});
  p.days.sort();
  p.exams=Math.max(p.exams,validos.length);
  p.sembrado=true;
  try{evaluarLogros(null,true)}catch(e){console.error('Logros:',e)}   // los logros nunca deben impedir iniciar sesión
}

/* Revisa qué logros se cumplen ahora y los desbloquea. Devuelve los nuevos (para avisar). */
function evaluarLogros(att,enMutate){
  const p=state.progress,nuevos=[];
  const c={p,att,mejor:mejorRacha(p.days)};
  BADGES.forEach(b=>{
    if(!p.badges[b.id]&&b.test(c)){p.badges[b.id]=Date.now();nuevos.push({id:b.id,icon:b.icon,nombre:b.nombre})}
  });
  state.materias.filter(m=>m.rol!=='docente').forEach(m=>{
    state.cortes.filter(k=>k.materiaId===m.id).forEach(k=>{
      if(p.sellos[k.id])return;
      if(etapaCorte(m,k).completa){
        p.sellos[k.id]={t:Date.now(),materia:m.name,corte:k.name};
        nuevos.push({id:'corte_'+k.id,icon:'🏅',nombre:'Etapa completada: '+(k.name||'corte')+' · '+m.name});
      }
    });
  });
  if(nuevos.length&&!enMutate)persist();
  return nuevos;
}

/* Se llama al terminar un quiz o examen (dentro de mutate, que ya guarda y repinta) */
function registrarSesion(att){
  /* Cada pregunta contestada cuenta primero para la racha del día (hasta META_RACHA) y el resto es práctica extra.
     Se guarda en progress.dia y en el propio intento (att.racha / att.extra), así queda un registro verificable. */
  const p=state.progress,hoy=fechaLocal(new Date(att.date));
  const res={valida:false,diaNuevo:false,nuevos:[],racha:0,aporte:0,extra:0,hoyRacha:0,extraHoy:0,meta:META_RACHA};
  if(!p.dia||p.dia.f!==hoy)p.dia={f:hoy,racha:0,extra:0};
  const falta=Math.max(0,META_RACHA-p.dia.racha);
  res.aporte=Math.min(falta,att.total);res.extra=att.total-res.aporte;
  p.dia.racha+=res.aporte;p.dia.extra+=res.extra;
  att.racha=res.aporte;att.extra=res.extra;
  if(p.dia.racha>=META_RACHA&&!p.days.includes(hoy)){p.days.push(hoy);p.days.sort();res.diaNuevo=true}
  /* XP de la sesión, mejor combo del día y misiones cumplidas (cada misión paga una sola vez por día) */
  res.xp=Math.max(0,Math.round(+att.xp||0));
  p.xp=(+p.xp||0)+res.xp;
  p.dia.combo=Math.max(p.dia.combo||0,att.combo||0);
  if(att.tablero)p.dia.tablero=(p.dia.tablero||0)+1;
  p.dia.mis=p.dia.mis||{};res.misiones=[];
  MISIONES.forEach(mi=>{if(!p.dia.mis[mi.id]&&mi.val(p.dia)>=mi.meta){p.dia.mis[mi.id]=1;p.xp+=mi.xp;res.misiones.push({ico:mi.ico,txt:mi.txt,xp:mi.xp})}});
  res.valida=p.days.includes(hoy);
  if(esValida(att))p.exams++;
  res.hoyRacha=p.dia.racha;res.extraHoy=p.dia.extra;
  res.racha=rachaActual(p.days);
  res.nuevos=evaluarLogros(att,true);
  return res;
}
/* Aciertos por corte de un examen: así el Camino al éxito sabe cómo vas en cada etapa */
function porCorteDe(questions){
  const out={};
  questions.forEach(q=>{
    const card=state.cards.find(c=>c.id===q.card.id)||q.card;
    const t=state.temas.find(x=>x.id===card.temaId);
    if(!t||!t.corteId)return;
    const o=out[t.corteId]=out[t.corteId]||{ok:0,total:0};
    o.total++;if(esAcierto(q))o.ok++;
  });
  return out;
}

function nivelDe(){
  const p=state.progress;
  const xp=p.days.length*20+(Object.keys(p.badges).length+Object.keys(p.sellos).length)*50+Math.max(0,Math.round(+p.xp||0));
  const nivel=Math.floor(Math.sqrt(xp/50))+1;
  const base=50*(nivel-1)*(nivel-1),sig=50*nivel*nivel;
  return{xp,nivel,nombre:NIVELES[Math.min(nivel-1,NIVELES.length-1)],pct:Math.round((xp-base)/(sig-base)*100),faltan:sig-xp};
}

/* ---------- Camino al éxito: una etapa por corte ---------- */
function etapaCorte(m,c){
  const tids=new Set(state.temas.filter(t=>t.materiaId===m.id&&t.corteId===c.id).map(t=>t.id));
  const cards=state.cards.filter(k=>tids.has(k.temaId)&&String(k.front||'').trim()&&String(k.back||'').trim());
  const dominadas=cards.filter(k=>k.known===true).length;
  const ints=state.attempts.filter(a=>a.materiaId===m.id&&esValida(a)&&a.porCorte&&a.porCorte[c.id]&&a.porCorte[c.id].total>=3);
  const dias=new Set(ints.map(a=>fechaLocal(new Date(a.date)))).size;
  const mejorPct=ints.reduce((mx,a)=>Math.max(mx,a.porCorte[c.id].ok/a.porCorte[c.id].total),0);
  const pctDom=cards.length?dominadas/cards.length:0;
  const objs=[
    {tipo:'material',icon:'📚',titulo:'Reúne tu material',detalle:Math.min(cards.length,5)+' / 5 tarjetas en este corte',hecho:cards.length>=5,prog:Math.min(1,cards.length/5)},
    {tipo:'constancia',icon:'🔥',titulo:'Practica en 2 días distintos',detalle:Math.min(dias,2)+' / 2 días con examen',hecho:dias>=2,prog:Math.min(1,dias/2)},
    {tipo:'rendimiento',icon:'🎯',titulo:'Saca 70% o más en un examen',detalle:ints.length?'Tu mejor resultado: '+Math.round(mejorPct*100)+'%':'Aún sin exámenes de este corte',hecho:mejorPct>=0.7,prog:Math.min(1,mejorPct/0.7)},
    {tipo:'dominio',icon:'🧠',titulo:'Domina el 70% de las tarjetas',detalle:dominadas+' de '+cards.length+' dominadas',hecho:cards.length>=5&&pctDom>=0.7,prog:Math.min(1,pctDom/0.7)}
  ];
  return{objs,hechos:objs.filter(o=>o.hecho).length,completa:objs.every(o=>o.hecho)};
}

/* ---------- Interfaz ---------- */
function toast(html){
  const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.innerHTML=html;document.body.appendChild(t);
  setTimeout(()=>t.classList.add('on'),20);
  setTimeout(()=>{t.classList.remove('on');setTimeout(()=>t.remove(),400)},4200);
}
function avisarLogros(nuevos){
  (nuevos||[]).forEach((b,i)=>setTimeout(()=>toast('🎉 <b>¡Nuevo logro!</b><br>'+b.icon+' '+esc(b.nombre)),i*700));
}
function premiosHTML(){
  const pr=toolState&&toolState.premios;if(!pr)return'';
  const ok=pr.valida,falta=Math.max(0,pr.meta-pr.hoyRacha);
  return `<div class="card premio">${pr.xp||pr.misiones&&pr.misiones.length?`<div class="xpGan"><b>⭐ +${pr.xp+(pr.misiones||[]).reduce((s,m)=>s+m.xp,0)} XP</b><span class="meta">${pr.xp} de la partida${(pr.misiones||[]).length?' · '+pr.misiones.map(m=>m.ico+' '+esc(m.txt)+' +'+m.xp).join(' · '):''}</span></div>`:''}<b>🔥 Racha: ${pr.racha} día${pr.racha==1?'':'s'}</b>
    ${pr.diaNuevo?'<span class="chip chipOk">+1 hoy</span>':ok?'<span class="chip">Racha de hoy asegurada</span>':''}
    <div class="bar"><i style="width:${Math.min(100,Math.round(pr.hoyRacha/pr.meta*100))}%"></i></div>
    <p class="meta" style="margin:6px 0 0">Preguntas de racha hoy: <b>${Math.min(pr.hoyRacha,pr.meta)}/${pr.meta}</b>${ok?'':' · te faltan <b>'+falta+'</b> para asegurar la racha de hoy'}${pr.extraHoy?' · práctica extra de hoy: <b>'+pr.extraHoy+'</b>':''}</p>
    ${pr.nuevos.map(b=>`<div style="margin-top:8px">🎉 Nuevo logro: ${b.icon} <b>${esc(b.nombre)}</b></div>`).join('')}
  </div>`;
}
function fmtFecha(ts){return new Date(ts).toLocaleDateString('es',{day:'numeric',month:'short'})}

function rachaTabHTML(){
  const p=state.progress,rInfo=rachaInfo(p.days),racha=rInfo.racha,mejor=Math.max(mejorRacha(p.days),racha),nv=nivelDe();
  const hoy=fechaLocal(new Date()),hoyHecho=p.days.includes(hoy),dh=progresoHoy(),hoyN=hoyHecho?Math.max(dh.racha,META_RACHA):dh.racha;
  const sig=HITOS_RACHA.find(h=>h>racha);
  const sigB=sig?BADGES.find(b=>b.id==='racha_'+sig):null;
  const tira=[];
  for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const s=fechaLocal(d);tira.push({s,on:p.days.includes(s),hoy:i===0,dia:d.toLocaleDateString('es',{weekday:'narrow'})})}
  const grupo=(tipo,titulo)=>`<h3 style="margin:22px 0 10px">${titulo}</h3><div class="badgeGrid">${BADGES.filter(b=>b.tipo===tipo).map(b=>{
    const t=p.badges[b.id];
    return `<div class="badgeC ${t?'':'lock'}"><div class="bIcon">${t?b.icon:'🔒'}</div><b>${esc(b.nombre)}</b><small>${esc(b.desc)}</small>${t?`<span class="chip chipOk">${fmtFecha(t)}</span>`:''}</div>`}).join('')}</div>`;
  const sellos=Object.values(p.sellos);
  return `
  <div class="card racha">
    <div class="rTop"><div class="rNum">🔥 ${racha}</div><div><b>${racha==1?'día':'días'} de racha</b><div class="meta">Mejor racha: ${mejor} día${mejor==1?'':'s'}</div></div></div>
    <p class="meta" style="margin:10px 0 0">${hoyHecho?'✅ La racha de hoy ya está asegurada.':racha>0?'⚠️ Responde tus '+META_RACHA+' preguntas de hoy (Quiz o Modo examen) para mantener la racha.':'Responde '+META_RACHA+' preguntas en un Quiz o Modo examen para empezar tu racha.'}</p>
    <div class="bar"><i style="width:${Math.min(100,Math.round(hoyN/META_RACHA*100))}%"></i></div>
    <p class="meta" style="margin:0 0 6px">Preguntas de racha hoy: <b>${hoyN}/${META_RACHA}</b>${dh.extra?' · práctica extra: <b>'+dh.extra+'</b>':''}. Después de las ${META_RACHA} puedes seguir practicando sin límite: se guardan como práctica extra y no cambian tu racha.</p>
    <div class="strip">${tira.map(d=>`<span class="dot ${d.on?'on':''} ${d.hoy?'hoy':''}" title="${d.s}">${d.dia}</span>`).join('')}</div>
    <p class="meta" style="margin:8px 0 0">🧊 ${rInfo.congelados.includes(rInfo.hoy-1)?'Ayer usaste tu <b>día de gracia</b>: tu racha sigue viva.':rInfo.graciaDisponible?'Tienes <b>1 día de gracia</b> esta semana: si un día no alcanzas, tu racha no se rompe.':'Ya usaste tu día de gracia de esta semana.'}</p>
    ${sigB?`<div class="bar"><i style="width:${Math.round(racha/sig*100)}%"></i></div><p class="meta" style="margin:0">Te faltan ${sig-racha} día${sig-racha==1?'':'s'} para ${sigB.icon} <b>${esc(sigB.nombre)}</b>.</p>`:'<p class="meta" style="margin:10px 0 0">🎉 ¡Completaste todos los hitos de racha!</p>'}
  </div>
  <div class="card" style="margin-top:12px">
    <div class="rTop"><div class="rNum" style="font-size:1.6em">⭐ ${nv.nivel}</div><div><b>Nivel ${nv.nivel} · ${esc(nv.nombre)}</b><div class="meta">${nv.xp} XP · faltan ${nv.faltan} para el nivel ${nv.nivel+1}</div></div></div>
    <div class="bar"><i style="width:${nv.pct}%"></i></div>
    <p class="meta" style="margin:0">Ganas XP con cada acierto (10, y hasta 30 si llevas un combo de aciertos seguidos), con las misiones del día, 20 por cada día de racha y 50 por cada insignia o etapa completada. No dependen de tus notas.</p>
  </div>
  <div class="card" style="margin-top:12px">${misionesHTML()}</div>
  <p class="meta" style="margin-top:14px">Una sesión cuenta cuando terminas el <b>Modo examen</b> con al menos ${MIN_PREGUNTAS} preguntas. Cuenta una por día.</p>
  ${grupo('constancia','🔥 Constancia')}
  ${grupo('rendimiento','🎯 Rendimiento y metas')}
  ${grupo('meta','🚀 Primeros pasos')}
  ${sellos.length?`<h3 style="margin:22px 0 10px">🏅 Etapas completadas</h3><div class="badgeGrid">${sellos.map(s=>`<div class="badgeC"><div class="bIcon">🏅</div><b>${esc(s.corte||'Corte')}</b><small>${esc(s.materia||'')}</small><span class="chip chipOk">${fmtFecha(s.t)}</span></div>`).join('')}</div>`:''}`;
}

function caminoTabHTML(){
  const mats=state.materias.filter(m=>m.rol!=='docente');
  if(!mats.length)return '<div class="empty">Crea una materia y agrega temas con tarjetas para ver tu camino.</div>';
  const m=mats.find(x=>x.id===logrosMat)||mats[0];
  logrosMat=m.id;
  const cortes=state.cortes.filter(c=>c.materiaId===m.id);
  const etapas=cortes.map(c=>({c,e:etapaCorte(m,c)}));
  const actual=etapas.findIndex(x=>!x.e.completa);
  const todo=etapas.length&&actual===-1;
  const nombreTipo={material:'Material',constancia:'Constancia',rendimiento:'Rendimiento',dominio:'Dominio'};
  return `
  <label class="lbl" for="logrosMat">Materia</label>
  <select class="fld" id="logrosMat" data-action="logrosMat" style="max-width:320px">${mats.map(x=>`<option value="${x.id}" ${x.id===m.id?'selected':''}>${esc(x.icon||'📘')} ${esc(x.name)}</option>`).join('')}</select>
  <p class="meta" style="margin-top:8px">Cada corte es una etapa. Combina constancia (practicar varios días) con rendimiento (aciertos y dominio), así avanzas aunque todavía no tengas notas.</p>
  <div class="path">
    ${etapas.map(({c,e},i)=>{
      const estado=e.completa?'hecha':(i===actual?'actual':'pend');
      const sello=state.progress.sellos[c.id];
      return `<div class="stage ${estado}">
        <div class="node">${e.completa?'✓':(i===actual?'▶':i+1)}</div>
        <div class="card stCard">
          <div class="stHead"><b>${esc(c.name)||'(corte sin nombre)'}</b><span class="chip">${fmtN(+c.weight||0)}%</span>${e.completa?'<span class="chip chipOk">Completada</span>':i===actual?'<span class="chip" style="color:var(--a);border-color:var(--a)">Etapa actual</span>':''}</div>
          <div class="bar"><i style="width:${Math.round(e.hechos/e.objs.length*100)}%"></i></div>
          ${e.objs.map(o=>`<div class="obj ${o.hecho?'ok':''}"><span class="oi">${o.hecho?'✅':o.icon}</span><div><b>${o.titulo}</b> <small class="tipoT">${nombreTipo[o.tipo]}</small><div class="meta" style="margin:0">${o.detalle}</div>${o.hecho?'':`<div class="bar mini"><i style="width:${Math.round(o.prog*100)}%"></i></div>`}</div></div>`).join('')}
          <div class="reward ${sello?'':'lock'}">${sello?'🏅 Estampilla desbloqueada · '+fmtFecha(sello.t):'🔒 Completa los 4 objetivos para ganar la estampilla de esta etapa'}</div>
        </div>
      </div>`;
    }).join('')}
    <div class="stage ${todo?'hecha':'pend'}"><div class="node">🏆</div><div class="card stCard"><b>Meta final</b><div class="meta" style="margin:4px 0 0">${todo?'🎉 ¡Completaste todas las etapas de '+esc(m.name)+'!':'Completa todas las etapas de esta materia.'}</div></div></div>
  </div>`;
}

function viewLogrosHTML(){
  return `<div class="viewhead"><h1>🏆 Mis logros</h1></div>
  <div class="tabsT" style="margin-bottom:14px">
    <button type="button" data-action="logrosTab" data-tab="racha" class="${logrosTab==='racha'?'on':''}">🔥 Racha y estampillas</button>
    <button type="button" data-action="logrosTab" data-tab="camino" class="${logrosTab==='camino'?'on':''}">🗺️ Camino al éxito</button>
  </div>
  ${logrosTab==='camino'?caminoTabHTML():rachaTabHTML()}`;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  if(b.dataset.action==='logrosTab'){logrosTab=b.dataset.tab;render(true)}
});
document.addEventListener('change',e=>{
  if(e.target.matches&&e.target.matches('[data-action="logrosMat"]')){logrosMat=e.target.value;render(true)}
});
/* Al entrar a Logros se revisa si hay algo nuevo (por ejemplo, una nota meta registrada) */
document.querySelectorAll('#mainNav [data-nav="logros"]').forEach(b=>b.addEventListener('click',()=>{
  const nuevos=evaluarLogros();
  if(nuevos.length){avisarLogros(nuevos);render(true)}
}));


