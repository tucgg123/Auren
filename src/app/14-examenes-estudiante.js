/* ======================= ESTUDIANTE: exámenes de su profesor ======================= */
/* ---------- Orden distinto para cada estudiante ----------
   La mezcla sale de (examen + estudiante), así es la misma si recarga la página. Las respuestas se guardan con el
   número de opción ORIGINAL, por eso la calificación y los resultados del docente no cambian. */
function semillaTxt(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function prng(seed){return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function barajarCon(arr,rnd){const x=arr.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
function ordenExamen(ex,uidEst){
  const qs=preguntasDe(ex,uidEst),llenas=q=>[0,1,2,3].filter(j=>String((q.opciones||[])[j]||'').trim());
  if(ex.mezclar===false)return qs.map(q=>({q,ops:llenas(q)}));
  const rnd=prng(semillaTxt(ex.id+'|'+uidEst));
  return barajarCon(qs,rnd).map(q=>({q,ops:barajarCon(llenas(q),rnd)}));
}
/* ---------- Tiempo límite: hora de inicio y reloj ---------- */
const iniMap={};      // sid -> {exId_uid: {inicio,...}}
let exTimer=null;
function clearExTimer(){if(exTimer){clearInterval(exTimer);exTimer=null}}
const exKeyLocal=exId=>'auren_ex_'+currentUid+'_'+exId;
function cargarRespLocal(exId){try{return JSON.parse(localStorage.getItem(exKeyLocal(exId))||'{}')||{}}catch(e){return{}}}
function guardarRespLocal(){try{if(exTom&&route.examId)localStorage.setItem(exKeyLocal(route.examId),JSON.stringify(exTom.respuestas))}catch(e){}}
function borrarRespLocal(exId){try{localStorage.removeItem(exKeyLocal(exId))}catch(e){}}
function miInicio(m,exId){const d=(iniMap[m.sharedId]||{})[exId+'_'+currentUid];return d?ms(d.inicio):0}
function exRestanteMs(ex){return exTom&&exTom.inicio?exTom.inicio+(ex.duracion||0)*60000-(Date.now()+(exTom.skew||0)):Infinity}
function fmtRestante(r){const s=Math.max(0,Math.ceil(r/1000)),h=Math.floor(s/3600),mi=Math.floor(s%3600/60),se=s%60;return(h?h+':'+String(mi).padStart(2,'0'):String(mi))+':'+String(se).padStart(2,'0')}
function iniciarRelojExamen(m){
  clearExTimer();
  const ex=(exMap[m.sharedId]||{})[route.examId];
  if(!ex||!(ex.duracion>0)||!exTom||!exTom.inicio)return;
  const tic=()=>{
    const r=exRestanteMs(ex),el=$('exReloj');
    if(el){el.textContent='⏱️ '+fmtRestante(r);el.classList.toggle('urgente',r<=60000)}
    if(r<=0){clearExTimer();entregarExamenEst(m,true)}
  };
  tic();exTimer=setInterval(tic,1000);
}
async function comenzarExamenEst(m){
  const ex=(exMap[m.sharedId]||{})[route.examId];if(!ex||!exTom||exTom.comenzando)return;
  exTom.comenzando=true;exTom.error='';render(true);
  const id=ex.id+'_'+currentUid,ref=baseDe(m).collection('inicios').doc(id);
  try{
    try{await ref.set({examId:ex.id,uid:currentUid,nombre:miNombre(),inicio:firebase.firestore.FieldValue.serverTimestamp()})}
    catch(e){if(!(e&&e.code==='permission-denied'))throw e}      // si ya había empezado antes, se lee su hora de inicio
    const d=await ref.get({source:'server'});
    if(!d.exists)throw new Error('No se pudo registrar la hora de inicio');
    const t=ms(d.data().inicio);
    (iniMap[m.sharedId]=iniMap[m.sharedId]||{})[id]={id,...d.data()};
    exTom.inicio=t;exTom.skew=t-Date.now();
  }catch(e){console.error(e);exTom.error='No se pudo comenzar el examen'+detalleError(e)+'. Si eres tú quien administra la página, revisa que las reglas de Firestore estén publicadas.'}
  exTom.comenzando=false;render(true);iniciarRelojExamen(m);
}
function miIntento(m,exId){return (inMap[m.sharedId]||{})[exId+'_'+currentUid]}
function examenesEstudianteHTML(m){
  const exs=examenesDe(m);
  if(!exs.length)return '';
  const sid=m.sharedId;
  return `<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">📝 Exámenes de tu profesor</b>
    ${exs.map(ex=>{
      const it=miIntento(m,ex.id);
      let estado='',accion='';
      if(it){
        asegurarClave(m,ex.id);
        const cl=(clMap[sid]||{})[ex.id];
        const r=cl?calificar(ex,cl,it.respuestas||{},currentUid):null;
        estado=r?`<span class="chip chipOk">✅ ${r.ok}/${r.total} · nota ${fmtN(r.nota)}/${r.escala}</span>`:'<span class="chip chipOk">✅ Entregado</span>';
        accion=`<button class="sec" data-action="exPresentar" data-id="${m.id}" data-ex="${ex.id}">Ver resultado</button>`;
      }else if(examAbierto(ex)){
        estado=ex.cierre?`<span class="chip">⏰ hasta ${fmtFechaHora(ex.cierre)}</span>`:'<span class="chip">Pendiente</span>';
        accion=`<button class="pr" data-action="exPresentar" data-id="${m.id}" data-ex="${ex.id}">Presentar examen</button>`;
      }else estado='<span class="chip">🔒 Cerrado sin entregar</span>';
      return `<div style="margin-top:12px"><div><b>${esc(ex.titulo||'Examen')}</b> <span class="meta">· ${(ex.preguntas||[]).length} preguntas</span></div><div class="row" style="flex-wrap:wrap">${estado}${accion}</div></div>`;
    }).join('')}
  </div>`;
}
async function abrirExamenEst(m,exId){
  const exx=(exMap[m.sharedId]||{})[exId];
  if(!miIntento(m,exId)&&(!exx||!examAbierto(exx))){UI.alerta('Este examen ya no está disponible.');return}
  clearExTimer();
  exTom={respuestas:miIntento(m,exId)?{}:cargarRespLocal(exId),resultado:null,cargando:false,error:'',inicio:0,skew:0};
  const ini=miInicio(m,exId);if(ini&&!miIntento(m,exId))exTom.inicio=ini;       // retoma un examen que ya había empezado
  route={view:'examenDoc',materiaId:m.id,examId:exId};
  render();
  if(miIntento(m,exId))await cargarResultadoEst(m,exId);
  else iniciarRelojExamen(m);
}
async function cargarResultadoEst(m,exId){
  exTom.cargando=true;render(true);
  try{
    const d=await baseDe(m).collection('claves').doc(exId).get();
    if(!d.exists)throw new Error('sin-clave');
    (clMap[m.sharedId]=clMap[m.sharedId]||{})[exId]={id:exId,...d.data()};
    const ex=(exMap[m.sharedId]||{})[exId],it=miIntento(m,exId);
    exTom.resultado=calificar(ex,clMap[m.sharedId][exId],(it&&it.respuestas)||exTom.respuestas,currentUid);
    exTom.error='';
  }catch(e){console.error(e);exTom.error='No se pudieron cargar tus resultados'+detalleError(e)+'.'}
  exTom.cargando=false;render(true);
}
async function entregarExamenEst(m,forzado){
  const ex=(exMap[m.sharedId]||{})[route.examId];if(!ex||!exTom||exTom.enviando)return;
  const faltan=preguntasDe(ex,currentUid).filter(q=>exTom.respuestas[q.id]===undefined||exTom.respuestas[q.id]==='').length;
  if(!forzado){
    if(faltan&&!(ex.duracion>0)){UI.alerta('Te faltan '+faltan+' pregunta'+(faltan==1?'':'s')+' por responder.');return}
    if(faltan){if(!await UI.confirmar('Te faltan '+faltan+' pregunta'+(faltan==1?'':'s')+' sin responder. ¿Entregar de todos modos?'))return}
    else if(!await UI.confirmar('¿Entregar el examen? No podrás cambiar tus respuestas.'))return;
  }
  clearExTimer();
  exTom.enviando=true;exTom.error='';render(true);
  try{
    const u=auth.currentUser;
    await baseDe(m).collection('intentos').doc(ex.id+'_'+currentUid).set({
      examId:ex.id,uid:currentUid,nombre:miNombre(),email:(u&&u.email)||'',
      respuestas:exTom.respuestas,enviado:firebase.firestore.FieldValue.serverTimestamp()});
    exTom.enviando=false;borrarRespLocal(ex.id);
    (inMap[m.sharedId]=inMap[m.sharedId]||{})[ex.id+'_'+currentUid]={id:ex.id+'_'+currentUid,examId:ex.id,uid:currentUid,respuestas:{...exTom.respuestas}};
    await cargarResultadoEst(m,ex.id);
    registrarExamenProfesor(m,ex);
    render(true);
  }catch(e){
    console.error(e);exTom.enviando=false;
    exTom.error=(e&&e.code==='permission-denied')?'No se pudo entregar: el examen ya cerró, se acabó tu tiempo o no tienes permiso. Avisa a tu profesor.':'No se pudo entregar'+detalleError(e)+'. Inténtalo de nuevo.';
    render(true);
  }
}
function viewExamenDocHTML(){
  const m=materiaRuta(),ex=m&&(exMap[m.sharedId]||{})[route.examId];
  if(!m||!ex||!exTom)return '<div class="empty">No se encontró el examen. <button class="sec" data-action="backMaterias">Volver</button></div>';
  const volver=`<button class="sec" data-action="backMateria" data-id="${m.id}">← ${esc(m.name)}</button>`;
  const err=exTom.error?`<div class="fb fbNo" role="alert">${esc(exTom.error)}</div>`:'';
  if(exTom.resultado){
    const r=exTom.resultado,tono=r.pct>=70?'alto':r.pct>=40?'medio':'bajo';
    const msg=r.pct===100?'¡Perfecto! 🤩':r.pct>=70?'¡Excelente trabajo! 🎉':r.pct>=40?'Vas bien, repasa lo que fallaste 💪':'Cada intento cuenta. ¡Repasa y sigue! 🌱';
    return `${volver}
    <div class="empty resultado" style="margin-top:14px"><h2>📝 ${esc(ex.titulo||'Examen')}</h2>
      <div class="ringWrap ${tono}"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="rbg" cx="60" cy="60" r="52"/><circle class="rfg" cx="60" cy="60" r="52" style="--p:${r.pct}"/></svg>
        <div class="ringTxt"><b class="countUp" data-to="${r.ok}">${r.ok}</b><span>/ ${r.total}</span></div></div>
      <p class="resMsg">${msg}</p>
      <p class="meta">Nota: <b>${fmtN(r.nota)} / ${r.escala}</b> · ${r.pct}%</p>
      ${(c=>c&&c.texto?`<div class="card shareBox" style="text-align:left;margin:10px 0"><b style="font-size:.9em">💬 Comentario de tu docente</b><p style="margin:4px 0 0;white-space:pre-wrap">${esc(c.texto)}</p></div>`:'')(comentarioDe(m,ex.id,currentUid))}
      ${exTom.racha?`<p class="meta" id="exRacha">🔥 Este examen sumó <b>${exTom.racha.aporte}</b> pregunta${exTom.racha.aporte==1?'':'s'} a tu racha de hoy (${exTom.racha.hoyRacha}/${META_RACHA})${exTom.racha.diaNuevo?' · ¡día de racha cumplido!':''}${exTom.racha.extra?' · '+exTom.racha.extra+' de práctica extra':''}.</p>`:''}
      <div class="resList">${r.det.map((d,i)=>`<div class="resRow ${d.acierto?'bien':'mal'}" style="--i:${Math.min(i,14)};margin-top:10px"><b>${i+1}. ${esc(d.q.enunciado)}</b>
        <div class="meta" style="margin:2px 0 0">${d.acierto?'✅':'❌'} Tu respuesta: <b>${esc(textoRespuesta(d.q,d.elegido)||'(sin responder)')}</b>${d.acierto?'':' · Correcta: <b>'+esc(textoRespuesta(d.q,d.correcta))+'</b>'}</div>${d.acierto?'':explicacionHTML(d.exp)}</div>`).join('')}</div>
    </div>`;
  }
  if(exTom.cargando||miIntento(m,ex.id))return `${volver}<div class="empty" style="margin-top:14px">${err||'Cargando tus resultados…'}</div>`;
  if(ex.duracion>0&&!exTom.inicio)return `${volver}
  <div class="card" style="margin-top:14px"><h2 style="margin-top:0">📝 ${esc(ex.titulo||'Examen')}</h2>
    <p>Este examen tiene <b>${ex.duracion} minuto${ex.duracion==1?'':'s'}</b> de tiempo límite y <b>${preguntasDe(ex,currentUid).length} pregunta${preguntasDe(ex,currentUid).length==1?'':'s'}</b>.</p>
    <p class="meta">El reloj empieza cuando pulses <b>Comenzar</b> y no se detiene aunque salgas de la página. Tu hora de inicio queda registrada. Si se acaba el tiempo, se entrega lo que lleves respondido.</p>
    ${err}
    <button class="pr" data-action="exComenzar" ${exTom.comenzando?'disabled':''}>${exTom.comenzando?'Comenzando…':'▶️ Comenzar'}</button></div>`;
  const orden=ordenExamen(ex,currentUid),conTiempo=ex.duracion>0;
  const total=orden.length,hechas=orden.filter(({q})=>exTom.respuestas[q.id]!==undefined&&exTom.respuestas[q.id]!=='').length;
  return `${volver}
  <div class="viewhead" style="margin-top:14px"><h1>📝 ${esc(ex.titulo||'Examen')}</h1><span class="meta">${hechas} / ${total}</span></div>
  ${conTiempo?`<div class="exRelojWrap"><span id="exReloj" class="chip exReloj">⏱️ ${fmtRestante(exRestanteMs(ex))}</span><small class="meta">Tiempo límite: ${ex.duracion} min. Al acabarse se entrega lo que lleves.</small></div>`:''}
  <div class="bar qbar"><i style="width:${total?Math.round(hechas/total*100):0}%;--from:${total?Math.round(hechas/total*100):0}%"></i></div>
  ${ex.cierre?`<p class="meta">Cierra ${fmtFechaHora(ex.cierre)}</p>`:''}
  ${orden.map(({q,ops},i)=>`<div class="card qCard" style="margin-bottom:12px"><h3 style="margin-top:0">${i+1}. ${esc(q.enunciado)}</h3>
    ${esHueco(q)?`<input class="fld" data-action="exHueco" data-q="${q.id}" value="${esc(exTom.respuestas[q.id]||'')}" placeholder="Escribe tu respuesta" maxlength="80" autocomplete="off">`:ops.map(j=>`<button class="sec optBtn ${exTom.respuestas[q.id]===j?'chosen':''}" data-action="exResp" data-q="${q.id}" data-i="${j}">${esc(q.opciones[j])}</button>`).join('')}</div>`).join('')}
  ${err}
  <button class="pr nextBtn" data-action="exEntregar" ${(hechas<total&&!conTiempo)||exTom.enviando?'disabled':''}>${exTom.enviando?'Entregando…':'Entregar examen'}</button>
  ${hechas<total&&!conTiempo?'<p class="meta">Responde todas las preguntas para poder entregar.</p>':''}`;
}

/* ======================= Menús y pantallas por rol ======================= */
function aplicarRolMenu(){
  const prof=esProfesor();
  document.body.classList.toggle('modoProfe',prof);
  const visibles=esAdmin()?['docente','admin','perfil','ayuda']:prof?['docente','perfil','ayuda']:['materias','calendario','logros','perfil','ayuda'];
  document.querySelectorAll('#mainNav [data-nav]').forEach(b=>{b.style.display=visibles.includes(b.dataset.nav)?'':'none'});
  const d=document.querySelector('#mainNav [data-nav="docente"]');if(d)d.textContent='🏫 Mis materias';
  const ct=$('ctTxt');if(ct)ct.textContent=esAdmin()?'Auren · Admin':prof?'Auren · Docente':'Auren';
  const sw=$('searchWrap');if(sw)sw.style.display=prof?'none':'';
  const mj=$('menuJoin');if(mj)mj.style.display=prof?'none':'';     // el docente nunca tuvo este botón (no ve "Mis materias" de estudiante)
  pintarCampana();
}
/* Cada rol solo entra a sus propias pantallas */
function guardarRuta(){
  const m=route.materiaId?state.materias.find(x=>x.id===route.materiaId):null;
  if(route.view==='admin'&&!esAdmin())route={view:esProfesor()?'docente':'materias',materiaId:null};
  if(esProfesor()){
    const personal=['materias','calendario','logros'].includes(route.view)||(['materiaDetail','tool'].includes(route.view)&&!(m&&m.rol==='docente'));
    if(personal)route={view:'docente',materiaId:null};
  }else if(['docente','docExamen','docResultados'].includes(route.view)){
    route={view:'materias',materiaId:null};
  }
}
function viewPerfilDocenteHTML(){
  const p=state.profile;
  const mats=state.materias.filter(m=>m.rol==='docente');
  const nEx=mats.reduce((a,m)=>a+Object.keys(exMap[m.sharedId]||{}).length,0);
  return `
    <div class="viewhead"><h1>👤 Mi perfil</h1></div>
    <div class="card">
      <div class="pfhero"><div class="pfav">${esc(p.avatar)}</div><div><h2 style="margin:0">${esc(p.name)||'Profesor'}</h2><p class="meta" style="margin:2px 0 0">${esc(p.career)||'Agrega tu institución'}</p></div></div>
      <div class="pgs"><div><b>${mats.length}</b>materias</div><div><b>${nEx}</b>exámenes</div></div>
    </div>
    ${dwHTML('pf:av','Avatar','Elige el emoji que te representa',`<div class="avatarPicker">${AV.map(a=>`<button class="avBtn ${a===p.avatar?'on':''}" data-action="setAvatar" data-a="${a}" aria-label="Avatar ${a}" aria-pressed="${a===p.avatar}">${a}</button>`).join('')}</div>`,esc(p.avatar))}
    ${dwHTML('pf:ed','Editar perfil','Nombre, institución y escala de notas',`
      <label class="lbl" style="margin-top:0">Nombre (lo verán tus estudiantes)</label><input class="fld" data-action="profileField" data-f="name" value="${esc(p.name)}" maxlength="40">
      <label class="lbl">Institución</label><input class="fld" data-action="profileField" data-f="career" value="${esc(p.career)}" maxlength="80">
      <label class="lbl">Escala de notas de tus exámenes</label><select class="fld" data-action="setScale" style="max-width:220px">${[5,10,100].map(n=>`<option value="${n}" ${scaleMax()===n?'selected':''}>0 a ${n}</option>`).join('')}</select>
      <p class="meta" style="margin:6px 0 0">Se aplica a los exámenes nuevos. Los ya creados conservan su escala.</p>`,'✏️')}
    ${dwHTML('pf:col','Colores','Color de acento y fondo de la página',coloresCardHTML(),'🎨')}
    ${dwHTML('pf:fx','Efectos visuales','Fondo animado y ahorro de batería',fxCardHTML(),'✨')}
    ${dwHTML('pf:datos','Tus datos','Descarga una copia de respaldo',datosCardHTML(),'💾')}
    ${dwHTML('pf:rol','Tu rol',esc(nombreRol(p.rol||'estudiante')),rolCardHTML(),'🎓')}
    ${dwHTML('pf:legal','Términos y privacidad','Lo que aceptaste y cómo usamos tus datos',terminosCardHTML(),'📄')}
    ${dwHTML('pf:cuenta','Cuenta',esc(auth.currentUser&&auth.currentUser.email||''),`
      <p class="meta" style="margin-top:0">Conectado como <b>${esc(auth.currentUser&&auth.currentUser.email||'')}</b></p>
      <button class="sec" data-action="logout">🚪 Cerrar sesión</button> <button class="sec" data-action="borrarCuenta" style="color:var(--no)">🗑️ Eliminar mi cuenta</button>`,'🔑')}`;
}

/* ======================= Acciones ======================= */
document.addEventListener('input',e=>{
  const ea=e.target.dataset&&e.target.dataset.action;
  if(ea==='pomoCfg'){pomoConfig(e.target.dataset.k,e.target.value);return}
  if(ea==='adminFiltro'){adminFiltro=e.target.value;render(true);return}
  if(ea==='adminRol'){cambiarRolAdmin(e.target.dataset.uid,e.target.value);return}
  if(ea==='notaEdit'){programarNota(e.target.dataset.tema,e.target.dataset.mat,e.target.value);return}
  if(ea==='exHueco'&&exTom){const v=e.target.value;if(v.trim())exTom.respuestas[e.target.dataset.q]=v;else delete exTom.respuestas[e.target.dataset.q];guardarRespLocal();return}
  if(ea==='ttsRate'){ttsVelocidad(e.target.value);return}
  if(ea==='ttsVoz'){tts.voz=e.target.value;ttsGuardar();if(tts.estado==='leyendo'){ttsSeq++;try{speechSynthesis.cancel()}catch(x){}ttsSiguiente()}return}
  if(ea==='colAcentoLibre'||ea==='colFondoLibre'){
    const v=normHex(e.target.value);if(!v)return;                     // en el campo de texto, se espera a que el código esté completo
    const caja=e.target.closest('.colorLibre');                         // sincroniza la rueda y el campo de texto sin repintar
    if(caja)caja.querySelectorAll('input').forEach(i=>{if(i!==e.target)i.value=v});
    const rueda=caja&&caja.querySelector('.colorRueda');if(rueda)rueda.style.setProperty('--sw',v);
    if(ea==='colAcentoLibre')setColores({acento:v});
    else{const f=Object.assign({},(state.colors&&state.colors.fondo)||FONDO_DEF);f[e.target.dataset.m]=v;setColores({fondo:f})}
    return;
  }
  if(ea==='fxSel'){state.fx=e.target.value||null;try{if(state.fx)localStorage.setItem('auren_fx',state.fx);else localStorage.removeItem('auren_fx')}catch(err){}applyFx();persist();return}
  if(ea==='alcanceSel'){
    const v=String(e.target.value||'all'),mid=route.materiaId;ui.alcance=ui.alcance||{};
    ui.alcance[mid]=v.startsWith('t:')?{temaId:v.slice(2)}:v.startsWith('c:')?{corteId:v.slice(2)}:{};
    render(true);return;
  }
  if(ea==='quizTema'&&toolState&&toolState.setup){toolState.temaId=e.target.value;ui.quizCfg[route.materiaId].temaId=toolState.temaId;render(true);return}
  if(ea==='bancoCorte'){bancoFiltro.corte=e.target.value;render(true);return}
  if(ea==='bancoTexto'){bancoFiltro.texto=e.target.value;render(true);return}
  if(ea==='bancoSel'){const id=e.target.dataset.bid;if(e.target.checked)bancoSel.add(id);else bancoSel.delete(id);render(true);return}
  const el=e.target,k=el.dataset&&el.dataset.ex;
  if(!k||!exBuf||exBuf.estado!=='borrador')return;
  if(k==='titulo')exBuf.titulo=el.value;
  else if(k==='cierre')exBuf.cierre=el.value?new Date(el.value).getTime():0;
  else if(k==='duracion')exBuf.duracion=Math.max(0,Math.min(600,parseInt(el.value)||0));
  else if(k==='mezclar')exBuf.mezclar=!!el.checked;
  else if(k==='porEstudiante')exBuf.porEstudiante=Math.max(0,Math.min(200,parseInt(el.value)||0));
  else if(k==='dificultad'){if(DIFICULTADES.some(d=>d[0]===el.value))exBuf.dificultad=el.value}
  else{
    const q=exBuf.preguntas.find(x=>x.id===el.dataset.q);if(!q)return;
    if(k==='enun')q.enunciado=el.value;
    else if(k==='opt')q.opciones[+el.dataset.i]=el.value;
    else if(k==='qdif'){if(['facil','media','dificil'].includes(el.value))q.dif=el.value}
    else if(k==='hueco')q.correcta=el.value;
    else if(k==='exp')q.exp=el.value.slice(0,400);
  }
  exGuardarLuego();
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  const m=b.dataset.id?state.materias.find(x=>x.id===b.dataset.id):null;
  if(a==='docTab'){docTab=b.dataset.tab;render(true)}
  else if(a==='newExam'&&m)crearExamen(m);
  else if(a==='exEditar'&&m)abrirEditor(m,b.dataset.ex);
  else if(a==='exResultados'&&m&&m.rol==='docente'){docResSel=null;docResFiltro='todas';route={view:'docResultados',materiaId:m.id,examId:b.dataset.ex};render()}
  else if(a==='exEstado'&&m){
    try{await baseDe(m).collection('examenes').doc(b.dataset.ex).update({estado:b.dataset.to})}
    catch(err){console.error(err);UI.alerta('No se pudo cambiar el estado'+detalleError(err)+'.')}
  }
  else if(a==='exEliminarLista'&&m){
    if(await UI.confirmar('¿Eliminar este examen y todas las entregas de tus estudiantes? No se puede deshacer.'))exEliminarExamen(m,b.dataset.ex);
  }
  else if(a==='exVolver'){
    await exGuardarYa();exBuf=null;
    const mm=materiaRuta();
    if(mm){docTab='examenes';docTabMat=mm.id;route={view:'materiaDetail',materiaId:mm.id};render()}
  }
  else if(a==='exBancoAbrir'){bancoAbierto=true;render(true)}
  else if(a==='exBancoCerrar'){bancoAbierto=false;bancoSel.clear();render(true)}
  else if(a==='exBancoGuardar'&&exBuf){
    const mm=materiaRuta();if(!mm)return;
    try{const n=await guardarEnBanco(mm,exBuf.preguntas);toast(n?'📚 '+n+' pregunta'+(n==1?'':'s')+' guardada'+(n==1?'':'s')+' en tu banco':'No hay preguntas completas para guardar')}
    catch(err){console.error(err);UI.alerta('No se pudo guardar en el banco'+detalleError(err)+'. ¿Publicaste las reglas nuevas de Firestore?')}
  }
  else if(a==='exBancoAgregar'&&exBuf&&exBuf.estado==='borrador'){
    const ya=new Set(exBuf.preguntas.map(p=>normTxt(p.enunciado)));let n=0;
    (bancoCache||[]).filter(x=>bancoSel.has(x.id)&&!ya.has(normTxt(x.enunciado))).forEach(x=>{
      exBuf.preguntas.push({id:uid(),enunciado:x.enunciado,opciones:[0,1,2,3].map(i=>(x.opciones||[])[i]||''),correcta:Number(x.correcta)||0,temaId:'',temaTitulo:x.temaTitulo||''});n++;
    });
    bancoSel.clear();if(n){exGuardarLuego();toast('📥 '+n+' pregunta'+(n==1?'':'s')+' agregada'+(n==1?'':'s'))}
    render(true);
  }
  else if(a==='bancoDel'){
    if(await UI.confirmar('¿Quitar esta pregunta de tu banco? (No se borra de los exámenes donde ya la usaste.)')){
      try{await bancoRef().doc(b.dataset.bid).delete();bancoCache=(bancoCache||[]).filter(x=>x.id!==b.dataset.bid);bancoSel.delete(b.dataset.bid);render(true)}
      catch(err){console.error(err);UI.alerta('No se pudo quitar'+detalleError(err)+'.')}
    }
  }
  else if(a==='guiaOcultar')mutate(s=>{s.profile.guiaOculta=true});
  else if(a==='anuncioPublicar'&&m)publicarAnuncio(m);
  else if(a==='anuncioBorrar'&&m)borrarAnuncio(m,b.dataset.an);
  else if(a==='comGuardar'){const mm=materiaRuta();if(mm&&route.examId)guardarComentario(mm,route.examId,b.dataset.u)}
  else if(a==='segToggle'){segAbierto=!segAbierto;render(true)}
  else if(a==='exAddQ'&&exBuf){
    exBuf.preguntas.push({id:uid(),enunciado:'',opciones:['','','',''],correcta:0,tipo:'mc',dif:'media',temaId:'',temaTitulo:''});
    exGuardarLuego();render(true);
  }
  else if(a==='exDelQ'&&exBuf){
    // Se guarda solo (sin botón de deshacer): si la pregunta ya tiene texto, se confirma antes de borrarla
    const q=exBuf.preguntas.find(x=>x.id===b.dataset.q);
    const conTexto=q&&(String(q.enunciado||'').trim()||(q.opciones||[]).some(o=>String(o||'').trim()));
    if(conTexto&&!await UI.confirmar('¿Eliminar esta pregunta del examen?'))return;
    if(!exBuf)return;
    exBuf.preguntas=exBuf.preguntas.filter(q=>q.id!==b.dataset.q);exGuardarLuego();render(true);
  }
  else if(a==='exCorrecta'&&exBuf&&exBuf.estado==='borrador'){
    const q=exBuf.preguntas.find(x=>x.id===b.dataset.q);if(q){q.correcta=+b.dataset.i;exGuardarLuego();render(true)}
  }
  else if(a==='exGenerar'&&exBuf){
    const mm=materiaRuta();if(!mm)return;
    const ids=[...document.querySelectorAll('.exTema:checked')].map(x=>x.value);
    const n=Math.max(1,Math.min(40,parseInt($('exN').value)||10));
    if(!ids.length){UI.alerta('Elige al menos un tema.');return}
    const nuevas=generarPreguntas(mm,ids,n,{tipos:($('exTipos')||{}).value||'mc',dificultad:($('exDif')||{}).value||'mixta'});
    if(!nuevas.length){UI.alerta('No se pudieron generar preguntas. Los temas elegidos necesitan tarjetas, y la materia necesita al menos 2 respuestas distintas.');return}
    exBuf.preguntas=exBuf.preguntas.concat(nuevas);exGuardarLuego();render(true);
  }
  else if(a==='exPublicar'&&exBuf){
    const err=validarExamen(exBuf);if(err){UI.alerta(err);return}
    if(!await UI.confirmar('¿Publicar el examen? Tus estudiantes lo verán de inmediato y ya no podrás editarlo.'))return;
    exBuf.estado='publicado';exBuf.publicadoEn=Date.now();
    await exGuardarYa();render(true);avisoPublicado();
  }
  else if(a==='exABorrador'&&exBuf){
    const mm=materiaRuta();
    if(Object.values(inMap[mm.sharedId]||{}).some(i=>i.examId===exBuf.id)){UI.alerta('Ya hay estudiantes que lo presentaron, así que no se puede volver a borrador. Puedes cerrarlo.');return}
    exBuf.estado='borrador';await exGuardarYa();render(true);
  }
  else if(a==='exEliminar'&&exBuf){
    const mm=materiaRuta();
    if(mm&&await UI.confirmar('¿Eliminar este examen? No se puede deshacer.')){
      const id=exBuf.id;exBuf=null;clearTimeout(exGuardarT);
      await exEliminarExamen(mm,id);
      docTab='examenes';docTabMat=mm.id;route={view:'materiaDetail',materiaId:mm.id};render();
    }
  }
  else if(a==='resFila'){docResSel=docResSel===b.dataset.u?null:b.dataset.u;render(true)}
  else if(a==='exRepetir'){
    const mm=materiaRuta();
    if(mm&&await UI.confirmar('¿Permitir que este estudiante vuelva a presentar el examen? Se borra su entrega actual.')){
      try{
        await baseDe(mm).collection('intentos').doc(route.examId+'_'+b.dataset.u).delete();
        try{await baseDe(mm).collection('inicios').doc(route.examId+'_'+b.dataset.u).delete()}catch(e2){}      // también su hora de inicio, para que empiece de cero
      }
      catch(err){console.error(err);UI.alerta('No se pudo borrar la entrega'+detalleError(err)+'.')}
    }
  }
  else if(a==='exCsv'){const mm=materiaRuta(),ex=mm&&(exMap[mm.sharedId]||{})[route.examId];if(ex&&mm.rol==='docente')descargarCsv(mm,ex)}
  else if(a==='exCsvDet'){const mm=materiaRuta(),ex=mm&&(exMap[mm.sharedId]||{})[route.examId];if(ex&&mm.rol==='docente')descargarCsvDetalle(mm,ex)}
  else if(a==='resFiltro'){docResFiltro=b.dataset.f;render(true)}
  else if(a==='exXlsx'){const mm=materiaRuta(),ex=mm&&(exMap[mm.sharedId]||{})[route.examId];if(ex&&mm.rol==='docente')descargarXlsx(mm,ex).catch(err=>UI.alerta('No se pudo crear el Excel'+detalleError(err)+'.'))}
  else if(a==='libroNotas'&&m&&m.rol==='docente'){descargarLibroNotas(m).catch(err=>UI.alerta('No se pudo crear el Excel'+detalleError(err)+'.'))}
  else if(a==='exPresentar'&&m)abrirExamenEst(m,b.dataset.ex);
  else if(a==='exResp'&&exTom){exTom.respuestas[b.dataset.q]=+b.dataset.i;guardarRespLocal();render(true)}
  else if(a==='exComenzar'){const mm=materiaRuta();if(mm)comenzarExamenEst(mm)}
  else if(a==='exEntregar'){const mm=materiaRuta();if(mm)entregarExamenEst(mm)}
});

