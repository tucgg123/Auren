/* ======================================================================
   PORTAL DOCENTE: exámenes, resultados y menús separados por rol
   Datos (todo dentro de temarios/{sid}, solo en materias de docente):
     examenes/{exId}            título, estado (borrador|publicado|cerrado), cierre, escala y las
                                preguntas SIN la respuesta correcta
     claves/{exId}              {correctas:{preguntaId: índice}}  → el estudiante solo puede leerla
                                DESPUÉS de entregar su examen (lo exigen las reglas de Firestore)
     intentos/{exId}_{uid}      las respuestas del estudiante. Se crea una vez y no se modifica
   La nota "oficial" la calcula el panel del docente a partir de esas respuestas inmutables, así
   que un estudiante no puede inventarse su calificación.
   ====================================================================== */
const exMap={},clMap={},inMap={},comMap={},anMap={};      // sid -> datos en vivo
const pendClave=new Set();
let docTab='contenido',docTabMat=null;
let exBuf=null,exGuardarT=null;        // examen que el docente está editando
let exTom=null;                        // examen que el estudiante está presentando
let docResSel=null;                    // estudiante desplegado en los resultados
let docResFiltro='todas';              // filtro del detalle: todas | mal | bien

const ms=x=>x&&typeof x.toMillis==='function'?x.toMillis():(Number(x)||0);
const fmtFechaHora=t=>t?new Date(t).toLocaleString('es',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const baseDe=m=>refTemario(m.sharedId);
const materiaRuta=()=>state.materias.find(x=>x.id===route.materiaId);
function mezclar(a){const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r}
function examenesDe(m){return Object.values(exMap[m.sharedId]||{}).sort((a,b)=>ms(b.creado)-ms(a.creado))}
function examAbierto(ex){return ex.estado==='publicado'&&(!ex.cierre||Date.now()<=ex.cierre)}
function nEstudiantes(m){const x=sharedMeta[m.sharedId];return x&&x.members?Math.max(0,x.members.length-1):0}
const chipEstado=ex=>ex.estado==='borrador'?'<span class="chip">📝 Borrador</span>':ex.estado==='cerrado'?'<span class="chip">🔒 Cerrado</span>':(examAbierto(ex)?'<span class="chip chipOk">🟢 Publicado</span>':'<span class="chip">⏰ Venció</span>');

/* ---------- Calificación (la usan el docente y el estudiante) ---------- */
/* ======================= Exámenes dinámicos y dificultad =======================
   El banco del examen puede tener más preguntas de las que recibe cada estudiante ("preguntas por estudiante").
   A cada uno le toca un subconjunto distinto, siempre el mismo para esa persona (sale de examen + estudiante).
   La dificultad del examen decide cuántas fáciles, medias y difíciles entran en ese subconjunto. */
const esHueco=q=>!!q&&q.tipo==='hueco';
const textoRespuesta=(q,v)=>(v===undefined||v===null||v==='')?'':esHueco(q)?String(v):String((q.opciones||[])[v]||'');
const DIFICULTADES=[['mixta','Mixta (fáciles, medias y difíciles)'],['facil','Fácil'],['media','Media'],['dificil','Difícil']];
const nombreDif=d=>({facil:'Fácil',media:'Media',dificil:'Difícil'}[d]||'Media');
function preguntasDe(ex,uidEst){
  const qs=ex.preguntas||[],n=+ex.porEstudiante||0;
  if(!n||n>=qs.length)return qs;
  const rnd=prng(semillaTxt('sub|'+ex.id+'|'+uidEst)),mez=a=>barajarCon(a,rnd);
  const por={facil:[],media:[],dificil:[]};
  qs.forEach(q=>por[por[q.dif]?q.dif:'media'].push(q));
  const modo=ex.dificultad||'mixta';
  let el=[];
  if(modo==='mixta'){
    const f=Math.round(n*.3),d=Math.round(n*.3),cuota={facil:f,media:Math.max(0,n-f-d),dificil:d};
    ['facil','media','dificil'].forEach(k=>{el.push(...mez(por[k]).slice(0,cuota[k]))});
  }else el.push(...mez(por[modo]).slice(0,n));
  if(el.length<n){const ya=new Set(el.map(q=>q.id));el.push(...mez(qs.filter(q=>!ya.has(q.id))).slice(0,n-el.length))}     // si faltan de ese nivel, se completa con las demás
  const orden=new Map(qs.map((q,i)=>[q.id,i]));
  return el.sort((a,b)=>orden.get(a.id)-orden.get(b.id));
}
function calificar(ex,clave,resp,uidEst){
  const qs=uidEst?preguntasDe(ex,uidEst):(ex.preguntas||[]);
  const det=qs.map(q=>{
    const c=clave&&clave.correctas?clave.correctas[q.id]:undefined;
    const e=resp?resp[q.id]:undefined;
    const ac=e!==undefined&&c!==undefined&&(esHueco(q)?respuestaHuecoOk(e,c):Number(e)===Number(c));
    return{q,elegido:e,correcta:c,acierto:ac,exp:String(((clave&&clave.explicaciones)||{})[q.id]||'')};
  });
  const ok=det.filter(d=>d.acierto).length,total=det.length||1;
  const escala=ex.escala||5;
  return{ok,total,pct:Math.round(ok/total*100),nota:Math.round(ok/total*escala*10)/10,escala,det};
}

/* ---------- Escuchar exámenes en vivo ---------- */
function escucharExamenes(m){
  const sid=m.sharedId,base=refTemario(sid),prof=m.rol==='docente',aviso=n=>err=>console.warn('Exámenes ('+n+'):',err);
  const u=[];
  const colEx=base.collection('examenes');
  u.push((prof?colEx:colEx.where('estado','in',['publicado','cerrado'])).onSnapshot(snap=>{
    exMap[sid]={};snap.docs.forEach(d=>{exMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
    if(!prof)anunciarNuevos(m,'examen',snap.docs.filter(d=>d.data().estado==='publicado').map(d=>({id:d.id,titulo:d.data().titulo||'Examen'})));
  },aviso('examenes')));
  const colIn=base.collection('intentos');
  u.push((prof?colIn:colIn.where('uid','==',currentUid)).onSnapshot(snap=>{
    inMap[sid]={};snap.docs.forEach(d=>{inMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
  },aviso('intentos')));
  const colIni=base.collection('inicios');
  u.push((prof?colIni:colIni.where('uid','==',currentUid)).onSnapshot(snap=>{
    iniMap[sid]={};snap.docs.forEach(d=>{iniMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
  },aviso('inicios')));
  if(prof)u.push(base.collection('claves').onSnapshot(snap=>{
    clMap[sid]={};snap.docs.forEach(d=>{clMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
  },aviso('claves')));
  // Comentarios del docente sobre cada entrega (el estudiante solo ve los suyos)
  const colCom=base.collection('comentarios');
  u.push((prof?colCom:colCom.where('uid','==',currentUid)).onSnapshot(snap=>{
    comMap[sid]={};snap.docs.forEach(d=>{comMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
  },aviso('comentarios')));
  // Anuncios de la materia (los escribe el docente; todos los miembros los leen)
  u.push(base.collection('anuncios').onSnapshot(snap=>{
    anMap[sid]={};snap.docs.forEach(d=>{anMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
    if(!prof)anunciarNuevos(m,'anuncio',snap.docs.map(d=>({id:d.id,titulo:String(d.data().texto||'').slice(0,60)})));
  },aviso('anuncios')));
  return u;
}
function limpiarExamenes(sid){delete exMap[sid];delete clMap[sid];delete inMap[sid];delete iniMap[sid];delete evMap[sid];delete comMap[sid];delete anMap[sid]}

/* ======================= Comentarios del docente y anuncios =======================
   comentarios/{examId_uid}: lo que el docente le escribe a un estudiante sobre su entrega (solo ellos dos lo leen).
   anuncios/{id}: mensajes del docente para toda la materia. */
const COMENTARIO_MAX=1000,ANUNCIO_MAX=1000;
function comentarioDe(m,exId,u){return (comMap[m.sharedId]||{})[exId+'_'+u]||null}
function anunciosDe(m){return Object.values(anMap[m.sharedId]||{}).sort((a,b)=>ms(b.creado)-ms(a.creado))}
async function guardarComentario(m,exId,u){
  const el=$('comTx-'+u);if(!el)return;
  const texto=el.value.trim().slice(0,COMENTARIO_MAX),ref=baseDe(m).collection('comentarios').doc(exId+'_'+u);
  try{
    if(texto)await ref.set({examId:exId,uid:u,texto,actualizado:firebase.firestore.FieldValue.serverTimestamp()});
    else await ref.delete();
    toast(texto?'💬 Comentario guardado':'Comentario borrado');
  }catch(e){console.error(e);UI.alerta('No se pudo guardar el comentario'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?')}
}
async function publicarAnuncio(m){
  const el=$('anuncioTx');if(!el)return;
  const texto=el.value.trim().slice(0,ANUNCIO_MAX);if(!texto)return;
  try{
    await baseDe(m).collection('anuncios').add({texto,by:miNombre(),creado:firebase.firestore.FieldValue.serverTimestamp()});
    el.value='';toast('📣 Anuncio publicado');
  }catch(e){console.error(e);UI.alerta('No se pudo publicar el anuncio'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?')}
}
async function borrarAnuncio(m,id){
  if(!await UI.confirmar('¿Borrar este anuncio? Tus estudiantes dejarán de verlo.'))return;
  try{await baseDe(m).collection('anuncios').doc(id).delete()}catch(e){console.error(e);UI.alerta('No se pudo borrar'+detalleError(e)+'.')}
}
function anuncioHTML(a,borrable,m){
  return `<div class="anuncio"><div class="row" style="justify-content:space-between;margin:0;align-items:flex-start"><span class="meta" style="margin:0">${a.by?esc(a.by)+' · ':''}${ms(a.creado)?esc(fmtFechaHora(ms(a.creado))):'ahora'}</span>${borrable?`<button class="icon-btn" data-action="anuncioBorrar" data-id="${m.id}" data-an="${a.id}" title="Borrar anuncio" aria-label="Borrar anuncio">🗑️</button>`:''}</div>
    <p style="margin:4px 0 0;white-space:pre-wrap">${esc(a.texto)}</p></div>`;
}
function docenteAnunciosHTML(m){
  const ans=anunciosDe(m);
  return `<div class="card">
    <h3 style="margin-top:0">📣 Nuevo anuncio</h3>
    <p class="meta" style="margin:0 0 8px">Lo verán todos los estudiantes de la materia al entrar, y les llega como aviso en la campana 🔔.</p>
    <textarea class="fld" id="anuncioTx" rows="3" maxlength="${ANUNCIO_MAX}" placeholder="Por ejemplo: mañana la clase es en el laboratorio 3." aria-label="Texto del anuncio"></textarea>
    <div class="row"><button class="pr" data-action="anuncioPublicar" data-id="${m.id}">Publicar anuncio</button></div>
  </div>
  ${ans.length?ans.map(a=>`<div class="card" style="margin-top:8px">${anuncioHTML(a,true,m)}</div>`).join(''):'<div class="empty">Todavía no has publicado anuncios.</div>'}`;
}
function anunciosEstudianteHTML(m){
  const ans=anunciosDe(m).slice(0,3);
  if(!ans.length)return '';
  return `<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">📣 Anuncios de tu docente</b>${ans.map(a=>anuncioHTML(a,false,m)).join('')}</div>`;
}

/* ======================= EVENTOS DEL DOCENTE EN EL CALENDARIO ======================= */
/* Viven en temarios/{sid}/eventos. El docente (dueño) escribe; los estudiantes de la materia solo leen. */
const evMap={};   // sid -> {id: evento}
const TIPOS_EV=[['ex','📝 Examen'],['en','📤 Entrega'],['ac','🎯 Actividad'],['ot','📌 Otro']];
function escucharEventos(m){
  const sid=m.sharedId;
  return refTemario(sid).collection('eventos').onSnapshot(snap=>{
    evMap[sid]={};snap.docs.forEach(d=>{evMap[sid][d.id]={id:d.id,...d.data()}});renderSeguro();
    if(m.rol==='estudiante')anunciarNuevos(m,'evento',snap.docs.map(d=>({id:d.id,titulo:(d.data().title||'Evento')+(d.data().date?' ('+fmtFecha(new Date(d.data().date+'T00:00').getTime())+')':'')})));
  },err=>console.warn('Eventos:',err));
}
function eventosDocentes(){
  const out=[];
  state.materias.forEach(m=>{
    if(!m.sharedId||(m.rol!=='docente'&&m.rol!=='estudiante'))return;
    Object.values(evMap[m.sharedId]||{}).forEach(e=>{
      if(!e.date)return;
      out.push({id:'d:'+m.sharedId+':'+e.id,evId:e.id,sid:m.sharedId,materiaId:m.id,materia:m.name,icon:m.icon||'📘',
        date:e.date,title:e.title||'(sin título)',type:e.type||'ot',hora:e.hora||'',nota:e.nota||'',by:e.by||'',docente:true,editable:m.rol==='docente'});
    });
  });
  return out;
}
const eventosTodos=()=>state.events.concat(eventosDocentes());
const tipoEv=t=>(TIPOS_EV.find(x=>x[0]===t)||['','📌 Otro'])[1];
const sortEv=(a,b)=>a.date.localeCompare(b.date)||(a.hora||'99').localeCompare(b.hora||'99');
/* Perfil: el próximo examen sale del calendario (eventos propios y de los docentes con tipo "Examen") */
function proxExamenHTML(){
  const hoy=ymd(new Date()),ex=eventosTodos().filter(e=>e.type==='ex'&&e.date>=hoy).sort(sortEv)[0];
  if(!ex)return '<div class="pxEx"><span class="meta">Sin exámenes en el calendario</span></div>';
  return `<div class="pxEx"><b>${esc(ex.title)}</b>${ex.hora?` <small>🕒 ${esc(ex.hora)}</small>`:''}<br><small class="meta">${ex.materia?esc(ex.materia)+' · ':''}${esc(fmtDateLong(ex.date))} · ${relDate(ex.date)}</small></div>`;
}

/* Fila de un evento del docente (calendario del estudiante y del docente) */
function evDocFilaHTML(e,conMateria){
  return `<div class="li evDoc"><span><b>${tipoEv(e.type)}</b> · ${esc(e.title)}${e.hora?` <small>🕒 ${esc(e.hora)}</small>`:''}
    <br><small class="meta">${conMateria?`${esc(e.icon)} ${esc(e.materia)} · `:''}${e.editable?'Publicado para tus estudiantes':'👩‍🏫 '+esc(e.by||'Tu docente')}${e.nota?' · '+esc(e.nota):''}</small></span>
    ${e.editable?`<span class="row" style="margin:0"><button class="icon-btn" data-action="editEvDoc" data-sid="${e.sid}" data-ev="${e.evId}" title="Editar evento" aria-label="Editar evento">✏️</button><button class="icon-btn" data-action="delEvDoc" data-sid="${e.sid}" data-ev="${e.evId}" title="Eliminar evento" aria-label="Eliminar evento">🗑️</button></span>`:''}</div>`;
}

/* Pestaña "Calendario" del espacio docente */
function docenteEventosHTML(m){
  const hoy=ymd(new Date());
  const todos=Object.values(evMap[m.sharedId]||{}).filter(e=>e.date).map(e=>({...e,evId:e.id,sid:m.sharedId,editable:true,materia:m.name,icon:m.icon||'📘'})).sort(sortEv);
  const prox=todos.filter(e=>e.date>=hoy),pas=todos.filter(e=>e.date<hoy).reverse();
  const fila=e=>`<div class="li evDoc"><span><b>${tipoEv(e.type)}</b> · ${esc(e.title)}${e.hora?` <small>🕒 ${esc(e.hora)}</small>`:''}
    <br><small class="meta">${fmtDateLong(e.date)} · ${relDate(e.date)}${e.nota?' · '+esc(e.nota):''}</small></span>
    <span class="row" style="margin:0"><button class="icon-btn" data-action="editEvDoc" data-sid="${e.sid}" data-ev="${e.evId}" title="Editar evento" aria-label="Editar evento">✏️</button><button class="icon-btn" data-action="delEvDoc" data-sid="${e.sid}" data-ev="${e.evId}" title="Eliminar evento" aria-label="Eliminar evento">🗑️</button></span></div>`;
  const n=nEstudiantes(m);
  return `<div class="card shareBox">
    <b style="font-size:.9em">🗓️ Calendario de la materia</b>
    <p class="meta" style="margin:4px 0 0">Los eventos que agregues aparecen en el calendario de ${n?`tus <b>${n}</b> estudiante${n==1?'':'s'}`:'tus estudiantes'} (y en el tuyo). Puedes editarlos o eliminarlos cuando quieras y el cambio les llega en vivo.</p>
    <button class="pr" style="margin-top:10px" data-action="newEvDoc" data-id="${m.id}">+ Agregar evento</button>
  </div>
  <h3>Próximos</h3>
  ${prox.length?prox.map(fila).join(''):'<p class="meta">No hay eventos próximos.</p>'}
  ${pas.length?`<details class="evPas"><summary class="meta">Anteriores (${pas.length})</summary>${pas.map(fila).join('')}</details>`:''}`;
}

/* Formulario (ventana) para crear o editar */
function abrirEventoForm({sid=null,ev=null,fecha=''}={}){
  const docs=state.materias.filter(x=>x.rol==='docente'&&x.sharedId);
  if(!docs.length){UI.alerta('Primero crea una materia en tu espacio docente.');return}
  if(document.getElementById('evOverlay'))return;
  const cur=ev?(evMap[sid]||{})[ev]:null;
  if(ev&&!cur)return;
  const selSid=sid||docs[0].sharedId;
  const ov=document.createElement('div');
  ov.id='evOverlay';ov.className='rolOverlay';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','evTitulo');
  ov.innerHTML=`<form class="rolBox evBox" id="evForm" novalidate>
    <h2 id="evTitulo" style="margin:0 0 4px">${cur?'Editar evento':'Nuevo evento'}</h2>
    <p class="meta" style="margin:0 0 6px">Lo verán los estudiantes de la materia en su calendario.</p>
    <label class="lbl" for="evMat">Materia</label>
    <select class="fld" id="evMat" ${cur||docs.length==1?'disabled':''}>${docs.map(x=>`<option value="${x.sharedId}" ${x.sharedId===selSid?'selected':''}>${esc(x.icon||'📘')} ${esc(x.name)}</option>`).join('')}</select>
    <label class="lbl" for="evTit">Título</label>
    <input class="fld" id="evTit" maxlength="120" required placeholder="Ej. Parcial 1 · Unidades 1 a 3" value="${esc(cur?cur.title:'')}">
    <div class="two">
      <div><label class="lbl" for="evTipo">Tipo</label><select class="fld" id="evTipo">${TIPOS_EV.map(([k,t])=>`<option value="${k}" ${(cur?cur.type:'ex')===k?'selected':''}>${t}</option>`).join('')}</select></div>
      <div><label class="lbl" for="evFecha">Fecha</label><input class="fld" type="date" id="evFecha" required value="${esc(cur?cur.date:fecha)}"></div>
    </div>
    <label class="lbl" for="evHora">Hora (opcional)</label>
    <input class="fld" type="time" id="evHora" value="${esc(cur?cur.hora||'':'')}">
    <label class="lbl" for="evNota">Detalle (opcional)</label>
    <textarea class="fld" id="evNota" maxlength="500" placeholder="Salón, temas, material permitido…">${esc(cur?cur.nota||'':'')}</textarea>
    <p id="evErr" class="authError" hidden></p>
    <div class="row evBtns"><button type="button" class="sec" id="evCancel">Cancelar</button><button type="submit" class="pr" id="evSave">${cur?'Guardar cambios':'Agregar al calendario'}</button></div>
  </form>`;
  const cerrar=()=>{ov.remove();document.removeEventListener('keydown',esc_)};
  const esc_=e=>{if(e.key==='Escape')cerrar()};
  document.addEventListener('keydown',esc_);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)cerrar()});
  document.body.appendChild(ov);
  ov.querySelector('#evCancel').onclick=cerrar;
  ov.addEventListener('input',()=>{ov.querySelector('#evErr').hidden=true});
  ov.querySelector('#evForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const q=id=>ov.querySelector('#'+id).value;
    const title=q('evTit').trim(),date=q('evFecha'),err=ov.querySelector('#evErr');
    if(!title){err.textContent='Escribe un título.';err.hidden=false;return}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){err.textContent='Elige una fecha válida.';err.hidden=false;return}
    const btn=ov.querySelector('#evSave');btn.disabled=true;btn.textContent='Guardando…';
    const ok=await guardarEventoDoc(q('evMat'),ev,{title,date,type:q('evTipo'),hora:q('evHora'),nota:q('evNota').trim()});
    if(ok){if(calView)calView.sel=date;cerrar()}else{btn.disabled=false;btn.textContent=cur?'Guardar cambios':'Agregar al calendario'}
  });
  setTimeout(()=>{const t=ov.querySelector('#evTit');if(t)t.focus()},30);
}
async function guardarEventoDoc(sid,evId,d){
  const m=state.materias.find(x=>x.sharedId===sid&&x.rol==='docente');
  if(!m)return false;
  const col=refTemario(sid).collection('eventos'),ref=evId?col.doc(evId):col.doc();
  const ts=firebase.firestore.FieldValue.serverTimestamp();
  const datos={title:d.title,date:d.date,type:d.type,hora:d.hora||'',nota:d.nota||'',by:miNombre(),actualizado:ts};
  if(!evId)datos.creado=ts;
  try{await ref.set(datos,{merge:true});return true}
  catch(e){console.error(e);UI.alerta('No se pudo guardar el evento'+detalleError(e)+'. Si dice permission-denied, publica las reglas nuevas de firestore.rules en Firebase.');return false}
}
async function borrarEventoDoc(sid,evId){
  const m=state.materias.find(x=>x.sharedId===sid&&x.rol==='docente');
  if(!m)return;
  if(!await UI.confirmar('¿Eliminar este evento del calendario de tus estudiantes?'))return;
  try{await refTemario(sid).collection('eventos').doc(evId).delete()}
  catch(e){console.error(e);UI.alerta('No se pudo eliminar el evento'+detalleError(e)+'.')}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  if(a==='newEvDoc'){const m=state.materias.find(x=>x.id===b.dataset.id);if(m&&m.sharedId)abrirEventoForm({sid:m.sharedId,fecha:ymd(new Date())})}
  else if(a==='newEvDocCal')abrirEventoForm({fecha:b.dataset.date||''});
  else if(a==='editEvDoc')abrirEventoForm({sid:b.dataset.sid,ev:b.dataset.ev});
  else if(a==='delEvDoc')borrarEventoDoc(b.dataset.sid,b.dataset.ev);
});

/* El estudiante trae la clave solo cuando ya entregó (las reglas no se la dan antes) */
async function asegurarClave(m,exId){
  const sid=m.sharedId,k=sid+'/'+exId;
  if((clMap[sid]||{})[exId]||pendClave.has(k))return;
  pendClave.add(k);
  try{
    const d=await baseDe(m).collection('claves').doc(exId).get();
    if(d.exists){(clMap[sid]=clMap[sid]||{})[exId]={id:exId,...d.data()};renderSeguro()}
  }catch(e){console.warn('No se pudo leer la clave:',e)}
  pendClave.delete(k);
}

/* ======================= DOCENTE: pestañas de la materia ======================= */
function docenteTabsHTML(m){
  const tabs=[['contenido','📚 Contenido'],['examenes','📝 Exámenes'],['anuncios','📣 Anuncios'],['eventos','🗓️ Calendario'],['estudiantes','👥 Estudiantes']];
  return `<div class="tabsT docTabs" style="margin:14px 0">${tabs.map(([k,t])=>`<button type="button" data-action="docTab" data-tab="${k}" class="${docTab===k?'on':''}">${t}</button>`).join('')}</div>`;
}
function docentePanelHTML(m){
  const temas=state.temas.filter(t=>t.materiaId===m.id);
  const pub=temas.filter(t=>t.publicado).length,bor=temas.length-pub;
  return docenteTabsHTML(m)+`<div class="card shareBox">
    <b style="font-size:.9em">📚 Contenido de la materia</b>
    <p class="meta" style="margin:4px 0 0">Los temas que crees o generes con IA quedan como <b>borrador</b>. Revísalos y edítalos; tus estudiantes solo ven los que publiques (botón ✅/📝 en cada tema). Con los temas publicados puedes armar exámenes en la pestaña <b>Exámenes</b>.</p>
    <div class="members"><span class="chip">${pub} publicado${pub==1?'':'s'}</span><span class="chip">${bor} borrador${bor==1?'':'es'}</span></div>
    ${bor?`<button class="sec" data-action="publishAll" data-id="${m.id}">✅ Publicar todos los borradores</button>`:''}
  </div>`;
}
function docenteEstudiantesHTML(m){
  const invs=invitMap[m.sharedId]||[],meta=sharedMeta[m.sharedId]||{};
  const conInv=new Set(invs.map(i=>i.uid).filter(Boolean));
  const porCodigo=(meta.members||[]).filter(u=>u!==meta.ownerUid&&!conInv.has(u));   // entraron con el código de clase (sin invitación)
  const estado=i=>i.estado==='aceptada'?`<span class="chip chipOk">✅ Se unió</span>`:i.estado==='rechazada'?`<span class="chip">✖ Rechazó</span>`:`<span class="chip">⏳ Pendiente</span>`;
  const cod=codigoClaseDe(m);
  return `<div class="card shareBox">
    <b style="font-size:.9em">🔑 Código de clase</b>
    ${cod?`<p class="meta" style="margin:4px 0 0">Tus estudiantes entran con este código desde «Mis materias» → «🔗 Unirme con código».</p>
      <div class="codigoClase" aria-label="Código de clase">${esc(cod)}</div>
      <div class="row"><button class="sec" data-action="classCodeCopy" data-id="${m.id}">📋 Copiar</button><button class="sec" data-action="classCodeNew" data-id="${m.id}">🔄 Cambiar</button><button class="sec" data-action="classCodeOff" data-id="${m.id}">⛔ Desactivar</button></div>`
    :`<p class="meta" style="margin:4px 0 0">Crea un código corto para que tus estudiantes entren sin tener que invitarlos uno por uno. Puedes cambiarlo o desactivarlo cuando quieras.</p>
      <button class="sec" style="margin-top:8px" data-action="classCodeNew" data-id="${m.id}">🔑 Crear código de clase</button>`}
  </div>
  <div class="card shareBox" style="margin-top:14px">
    <label class="lbl" for="invEmails" style="margin-top:0">Invitar estudiantes por correo</label>
    <textarea class="fld" id="invEmails" placeholder="correo1@ejemplo.com, correo2@ejemplo.com"></textarea>
    <p class="meta" style="margin:4px 0 0">Verán la invitación al iniciar sesión con ese mismo correo (con Google o con correo verificado).</p>
    <button class="pr" style="margin-top:8px" data-action="inviteStudents" data-id="${m.id}">📨 Invitar</button>
    <div style="margin-top:14px"><b style="font-size:.85em">Estudiantes (${invs.length+porCodigo.length})</b></div>
    ${invs.map(i=>`<div class="row estFila"><span>${esc(i.nombre||i.email)} <span class="meta">${i.nombre?esc(i.email):''}</span> ${estado(i)}</span><button class="icon-btn" data-action="removeInvite" data-id="${m.id}" data-inv="${esc(i.id)}" title="Quitar" aria-label="Quitar a ${esc(i.nombre||i.email)}">🗑️</button></div>`).join('')}
    ${porCodigo.map(u=>{const n=(meta.memberNames||{})[u]||'Estudiante';return `<div class="row estFila"><span>${esc(n)} <span class="chip chipOk">🔑 Entró con código</span></span><button class="icon-btn" data-action="removeMember" data-id="${m.id}" data-uid="${esc(u)}" title="Quitar" aria-label="Quitar a ${esc(n)}">🗑️</button></div>`}).join('')}
    ${invs.length+porCodigo.length?'':'<p class="meta" style="margin:6px 0 0">Aún no tienes estudiantes. Invítalos por correo o dales el código de clase.</p>'}
    <div class="row" style="margin-top:14px"><button class="sec" data-action="delMateria" data-id="${m.id}">🗑️ Eliminar materia para todos</button></div>
  </div>`;
}
function viewDocenteTabHTML(m){
  return `<button class="sec" data-action="backDocente">← Mis materias</button>
    <div class="viewhead" style="margin-top:14px"><h1>${esc(m.icon||'📘')} ${esc(m.name)}</h1></div>
    ${docenteTabsHTML(m)}
    ${docTab==='examenes'?docenteExamenesHTML(m):docTab==='anuncios'?docenteAnunciosHTML(m):docTab==='eventos'?docenteEventosHTML(m):docenteEstudiantesHTML(m)}`;
}

/* ---------- Seguimiento del grupo: junta todos los exámenes publicados de la materia ----------
   Por estudiante: cuántos entregó, promedio y la última entrega. Arriba quedan quienes necesitan atención:
   los que no entregaron 2 o más exámenes ya cerrados o vencidos, y los que van con promedio bajo (menos de 60 %). */
let segAbierto=false;
function seguimientoGrupo(m){
  const exs=examenesDe(m).filter(e=>e.estado!=='borrador');
  if(!exs.length)return null;
  const res=exs.map(ex=>({ex,r:resultadosDe(m,ex)}));
  const vencido=ex=>ex.estado==='cerrado'||(ex.cierre&&ex.cierre<Date.now());
  const filas=res[0].r.filas.map(f0=>{
    let entregados=0,faltan=0,ultima=0;const pcts=[];
    res.forEach(({ex,r})=>{
      const f=r.filas.find(x=>x.uid===f0.uid);
      if(f&&f.intento){entregados++;ultima=Math.max(ultima,ms(f.intento.enviado)||0);if(f.res)pcts.push(f.res.pct)}
      else if(vencido(ex))faltan++;
    });
    const prom=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
    const motivos=[];
    if(faltan>=2)motivos.push('no entregó '+faltan+' exámenes');
    else if(faltan===1&&!entregados)motivos.push('no ha entregado ningún examen');
    if(prom!=null&&prom<60)motivos.push('promedio bajo');
    return{uid:f0.uid,nombre:f0.nombre,email:f0.email,entregados,faltan,prom,ultima,motivos};
  });
  filas.sort((a,b)=>(b.motivos.length-a.motivos.length)||((a.prom==null?101:a.prom)-(b.prom==null?101:b.prom))||a.nombre.localeCompare(b.nombre));
  return{filas,total:exs.length,riesgo:filas.filter(f=>f.motivos.length).length};
}
function seguimientoGrupoHTML(m){
  const g=seguimientoGrupo(m);
  if(!g||!g.filas.length)return '';
  return `<div class="card segGrupo" style="margin-bottom:12px">
    <button type="button" class="segCab" data-action="segToggle" aria-expanded="${segAbierto}">
      <b>📈 Seguimiento del grupo</b>
      <span class="meta" style="margin:0">${g.riesgo?`⚠️ ${g.riesgo} estudiante${g.riesgo==1?'':'s'} necesita${g.riesgo==1?'':'n'} atención`:'✅ Nadie se está quedando atrás'} · ${g.total} examen${g.total==1?'':'es'} publicado${g.total==1?'':'s'} ${segAbierto?'▲':'▼'}</span>
    </button>
    ${segAbierto?`<div class="segLista">${g.filas.map(f=>`<div class="segFila ${f.motivos.length?'riesgo':''}">
      <div><b>${esc(f.nombre)}</b><div class="meta" style="margin:0">${esc(f.email)}${f.ultima?' · última entrega '+esc(relTime(f.ultima)):' · sin entregas'}</div>
        ${f.motivos.length?`<div class="meta" style="margin:2px 0 0;color:var(--no)">⚠️ ${esc(f.motivos.join(' · '))}</div>`:''}</div>
      <div style="text-align:right;white-space:nowrap"><b style="color:${f.prom==null?'var(--m)':colorPct(f.prom)}">${f.prom==null?'—':f.prom+'%'}</b><div class="meta" style="margin:0">${f.entregados}/${g.total} entregados</div></div>
    </div>`).join('')}</div>`:''}
  </div>`;
}

/* ---------- Lista de exámenes ---------- */
function docenteExamenesHTML(m){
  const exs=examenesDe(m),nEst=nEstudiantes(m);
  const intentos=Object.values(inMap[m.sharedId]||{});
  const cards=exs.map(ex=>{
    const ints=intentos.filter(i=>i.examId===ex.id);
    const cl=(clMap[m.sharedId]||{})[ex.id];
    let prom='';
    if(ints.length&&cl){const ps=ints.map(i=>calificar(ex,cl,i.respuestas||{},i.uid).pct);prom=` · promedio ${Math.round(ps.reduce((a,b)=>a+b,0)/ps.length)}%`}
    const acciones=ex.estado==='borrador'
      ?`<button class="sec" data-action="exEditar" data-id="${m.id}" data-ex="${ex.id}">✏️ Editar</button>`
      :`<button class="pr" data-action="exResultados" data-id="${m.id}" data-ex="${ex.id}">📊 Resultados</button>
        ${ex.estado==='cerrado'?`<button class="sec" data-action="exEstado" data-id="${m.id}" data-ex="${ex.id}" data-to="publicado">🔓 Reabrir</button>`:`<button class="sec" data-action="exEstado" data-id="${m.id}" data-ex="${ex.id}" data-to="cerrado">🔒 Cerrar</button>`}`;
    return `<div class="card exCard">
      <div class="stHead"><b>${esc(ex.titulo||'Sin título')}</b>${chipEstado(ex)}</div>
      <p class="meta" style="margin:6px 0 0">${(ex.preguntas||[]).length} pregunta${(ex.preguntas||[]).length==1?'':'s'}${ex.cierre?' · cierra '+fmtFechaHora(ex.cierre):''}${ex.duracion?' · ⏱️ '+ex.duracion+' min':''}${ex.estado==='borrador'?'':' · entregas '+ints.length+'/'+nEst+prom}</p>
      <div class="row" style="flex-wrap:wrap">${acciones}<button class="icon-btn" data-action="exEliminarLista" data-id="${m.id}" data-ex="${ex.id}" title="Eliminar examen" aria-label="Eliminar examen">🗑️</button></div>
    </div>`;
  }).join('');
  return `<div class="viewhead"><h2>📝 Exámenes</h2><span class="row" style="margin:0;flex-wrap:wrap">${exs.some(e=>e.estado!=='borrador')?`<button class="sec" data-action="libroNotas" data-id="${m.id}">⬇️ Libro de notas (Excel)</button>`:''}<button class="pr" data-action="newExam" data-id="${m.id}">+ Nuevo examen</button></span></div>
    ${seguimientoGrupoHTML(m)}
    ${exs.length?cards:'<div class="empty">Aún no hay exámenes. Crea uno a partir de los temas de tu materia: generas las preguntas, las revisas y las publicas. Después verás las notas de cada estudiante y en qué preguntas fallaron.</div>'}`;
}

/* ======================= DOCENTE: editor de examen ======================= */
function cierreLocal(t){if(!t)return'';const d=new Date(t-new Date(t).getTimezoneOffset()*60000);return d.toISOString().slice(0,16)}
function exDividir(buf){
  return{
    examen:{titulo:buf.titulo||'',estado:buf.estado,cierre:buf.cierre||0,escala:buf.escala,creado:buf.creado,publicadoEn:buf.publicadoEn||0,duracion:buf.duracion||0,mezclar:buf.mezclar!==false,porEstudiante:buf.porEstudiante||0,dificultad:buf.dificultad||'mixta',
      preguntas:buf.preguntas.map(q=>({id:q.id,enunciado:q.enunciado||'',opciones:[0,1,2,3].map(i=>q.opciones[i]||''),tipo:q.tipo||'mc',dif:['facil','media','dificil'].includes(q.dif)?q.dif:'media',temaId:q.temaId||'',temaTitulo:q.temaTitulo||''}))},
    clave:{correctas:Object.fromEntries(buf.preguntas.map(q=>[q.id,q.tipo==='hueco'?String(q.correcta||''):(Number(q.correcta)||0)])),
      // La explicación va con la clave: el estudiante solo la puede leer después de entregar
      explicaciones:Object.fromEntries(buf.preguntas.filter(q=>String(q.exp||'').trim()).map(q=>[q.id,String(q.exp).trim().slice(0,400)]))}
  };
}
function setGuardado(t){const el=$('exGuardado');if(el)el.textContent=t}
async function exGuardarYa(){
  if(!exBuf)return;
  clearTimeout(exGuardarT);
  const m=materiaRuta();if(!m)return;
  const base=baseDe(m),{examen,clave}=exDividir(exBuf);
  const b=db.batch();
  b.set(base.collection('examenes').doc(exBuf.id),examen);
  b.set(base.collection('claves').doc(exBuf.id),clave);
  setGuardado('Guardando…');
  try{await b.commit();setGuardado('✓ Guardado')}
  catch(e){console.error(e);setGuardado('⚠️ No se pudo guardar'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?')}
}
function exGuardarLuego(){clearTimeout(exGuardarT);setGuardado('Cambios sin guardar…');exGuardarT=setTimeout(exGuardarYa,900)}

async function crearExamen(m){
  const n=examenesDe(m).length+1;
  exBuf={id:uid(),titulo:'Examen '+n,estado:'borrador',cierre:0,duracion:0,mezclar:true,porEstudiante:0,dificultad:'mixta',escala:scaleMax(),creado:Date.now(),publicadoEn:0,preguntas:[]};
  route={view:'docExamen',materiaId:m.id,examId:exBuf.id};
  render();
  await exGuardarYa();
}
function abrirEditor(m,exId){
  const ex=(exMap[m.sharedId]||{})[exId];if(!ex)return;
  const cl=((clMap[m.sharedId]||{})[exId]||{}).correctas||{},cx=((clMap[m.sharedId]||{})[exId]||{}).explicaciones||{};
  exBuf={id:exId,titulo:ex.titulo||'',estado:ex.estado||'borrador',cierre:ex.cierre||0,escala:ex.escala||scaleMax(),creado:ms(ex.creado)||Date.now(),publicadoEn:ex.publicadoEn||0,duracion:ex.duracion||0,mezclar:ex.mezclar!==false,porEstudiante:ex.porEstudiante||0,dificultad:ex.dificultad||'mixta',
    preguntas:(ex.preguntas||[]).map(q=>({id:q.id,enunciado:q.enunciado||'',opciones:[0,1,2,3].map(i=>(q.opciones||[])[i]||''),tipo:q.tipo||'mc',dif:q.dif||'media',
      correcta:cl[q.id]!==undefined?(q.tipo==='hueco'?String(cl[q.id]):Number(cl[q.id])):(q.tipo==='hueco'?'':0),temaId:q.temaId||'',temaTitulo:q.temaTitulo||'',exp:cx[q.id]||''}))};
  route={view:'docExamen',materiaId:m.id,examId:exId};
  render();
}
function generarPreguntas(m,temaIds,n,opts){
  opts=opts||{};
  const limpia=k=>String(k.front||'').trim()&&String(k.back||'').trim();
  const usadas=new Set(exBuf.preguntas.map(q=>q.fuenteId).filter(Boolean));
  let fuente=state.cards.filter(k=>temaIds.includes(k.temaId)&&limpia(k)&&!usadas.has(k.id));
  /* Dificultad: primero las tarjetas de ese nivel y, si no alcanzan, se completa con las demás */
  const dif=opts.dificultad||'mixta',nivel=k=>['facil','media','dificil'].includes(k.dif)?k.dif:'media';
  if(dif!=='mixta')fuente=mezclar(fuente.filter(k=>nivel(k)===dif)).concat(mezclar(fuente.filter(k=>nivel(k)!==dif)));
  else{
    const g={facil:[],media:[],dificil:[]};fuente.forEach(k=>g[nivel(k)].push(k));
    const f=Math.round(n*.3),d=Math.round(n*.3),cu={facil:f,media:Math.max(0,n-f-d),dificil:d},el=[];
    ['facil','media','dificil'].forEach(x=>el.push(...mezclar(g[x]).slice(0,cu[x])));
    const ya=new Set(el.map(k=>k.id));fuente=el.concat(mezclar(fuente.filter(k=>!ya.has(k.id))));
  }
  const cortesSel=new Set(temaIds.map(id=>(state.temas.find(x=>x.id===id)||{}).corteId));
  const enCorte=k=>{const tm=state.temas.find(x=>x.id===k.temaId);return !!tm&&cortesSel.has(tm.corteId)};
  const cardsCorte=state.cards.filter(k=>k.materiaId===m.id&&limpia(k)&&enCorte(k));      // las opciones incorrectas salen solo de los cortes de los temas elegidos
  const pool=[...new Set(cardsCorte.map(k=>String(k.back).trim()))];
  const out=[];
  fuente.forEach(k=>{
    if(out.length>=n)return;
    const t=state.temas.find(x=>x.id===k.temaId)||{},base={id:uid(),temaId:k.temaId,temaTitulo:t.title||'',fuenteId:k.id,dif:nivel(k),exp:String(k.exp||'').trim()};
    const tipo=opts.tipos==='mixto'?tipoPara(k,'mixto'):'mc';
    if(tipo==='hueco'){out.push({...base,tipo:'hueco',enunciado:String(k.hueco.o).trim(),opciones:['','','',''],correcta:String(k.hueco.r).trim()});return}
    if(tipo==='vf'){
      const verdadera=Math.random()<0.5,afirm=verdadera?String(k.back).trim():String(k.falsa).trim();
      out.push({...base,tipo:'vf',enunciado:'Verdadero o falso. '+String(k.front).trim()+': «'+afirm+'»',opciones:['Verdadero','Falso','',''],correcta:verdadera?0:1});return;
    }
    const correcta=fmtOpcion(k.back);
    let otras=distractoresDe(k,cardsCorte,nivel(k)==='dificil'?'dificil':'media');   // de largo parecido a la correcta; en las difíciles, también parecidas en contenido
    if(!otras)otras=mezclar(pool.map(fmtOpcion).filter(b=>b&&normTxt(b)!==normTxt(correcta))).slice(0,3);
    if(!otras.length)return;                       // sin otras respuestas no se puede armar opción múltiple
    const ops=mezclar([correcta,...otras]);
    out.push({...base,tipo:'mc',enunciado:String(k.front).trim(),opciones:[0,1,2,3].map(i=>ops[i]||''),correcta:ops.indexOf(correcta)});
  });
  return out;
}
function validarExamen(b){
  if(!String(b.titulo||'').trim())return 'Ponle un título al examen.';
  if(!b.preguntas.length)return 'Agrega al menos una pregunta.';
  for(let i=0;i<b.preguntas.length;i++){
    const q=b.preguntas[i],ops=q.opciones.map(o=>String(o||'').trim());
    const llenas=ops.filter(Boolean);
    if(!String(q.enunciado||'').trim())return 'La pregunta '+(i+1)+' no tiene enunciado.';
    if(esHueco(q)){
      if(!String(q.enunciado).includes('____'))return 'La pregunta '+(i+1)+' (completar) debe tener ____ donde va la respuesta.';
      if(!String(q.correcta||'').trim())return 'En la pregunta '+(i+1)+' escribe la respuesta esperada.';
      continue;
    }
    if(llenas.length<2)return 'La pregunta '+(i+1)+' necesita al menos 2 opciones.';
    if(new Set(llenas).size!==llenas.length)return 'La pregunta '+(i+1)+' tiene opciones repetidas.';
    if(!ops[q.correcta])return 'En la pregunta '+(i+1)+' marca cuál opción es la correcta.';
  }
  return '';
}
function viewDocExamenHTML(){
  const m=materiaRuta();
  if(!m||!exBuf||exBuf.id!==route.examId)return '<div class="empty">No se pudo abrir el examen. <button class="sec" data-action="backDocente">Volver</button></div>';
  const lock=exBuf.estado!=='borrador';
  const temas=state.temas.filter(t=>t.materiaId===m.id);
  const nCards=t=>state.cards.filter(k=>k.temaId===t.id&&String(k.front||'').trim()&&String(k.back||'').trim()).length;
  const dis=lock?'disabled':'';
  return `<button class="sec" data-action="exVolver">← Exámenes</button>
  <div class="viewhead" style="margin-top:14px"><h1>📝 ${lock?'Examen':'Editar examen'}</h1><span id="exGuardado" class="meta"></span></div>
  ${lock?'<div class="card shareBox" style="margin-bottom:12px">🔒 Este examen ya está publicado, por eso no se edita (así todos los estudiantes responden lo mismo y los resultados son comparables). Si nadie lo ha presentado, puedes volver a pasarlo a borrador.</div>':''}
  <div class="card">
    <label class="lbl" style="margin-top:0">Título</label>
    <input class="fld" data-ex="titulo" value="${esc(exBuf.titulo)}" maxlength="80" ${dis}>
    <div class="two">
      <div><label class="lbl">Fecha límite (opcional)</label><input class="fld" type="datetime-local" data-ex="cierre" value="${cierreLocal(exBuf.cierre)}" ${dis}></div>
      <div><label class="lbl">Escala de notas</label><p class="meta" style="margin:8px 0 0">0 a ${exBuf.escala} (la de tu perfil)</p></div>
    </div>
    <div class="two">
      <div><label class="lbl">Tiempo límite en minutos (0 = sin límite)</label><input class="fld" type="number" min="0" max="600" data-ex="duracion" value="${exBuf.duracion||0}" ${dis}></div>
      <div><label class="lbl">Orden</label><label class="exTemaLbl"><input type="checkbox" data-ex="mezclar" ${exBuf.mezclar!==false?'checked':''} ${dis}> Mezclar preguntas y opciones para cada estudiante</label></div>
    </div>
    <div class="two">
      <div><label class="lbl">Preguntas por estudiante (0 = todas)</label><input class="fld" type="number" min="0" max="200" data-ex="porEstudiante" value="${exBuf.porEstudiante||0}" ${dis}></div>
      <div><label class="lbl">Dificultad del examen</label><select class="fld" data-ex="dificultad" ${dis}>${DIFICULTADES.map(([v,l])=>`<option value="${v}" ${exBuf.dificultad===v?'selected':''}>${l}</option>`).join('')}</select></div>
    </div>
    <p class="meta" style="margin:6px 0 0">${exBuf.porEstudiante>0&&exBuf.porEstudiante<exBuf.preguntas.length?'Cada estudiante recibirá '+exBuf.porEstudiante+' de las '+exBuf.preguntas.length+' preguntas, distintas para cada uno'+(exBuf.dificultad==='mixta'?' (más o menos 30 % fáciles, 40 % medias y 30 % difíciles).':' (priorizando las de nivel '+nombreDif(exBuf.dificultad).toLowerCase()+').'):'Con "preguntas por estudiante" menor que el banco, cada estudiante recibe un examen distinto. Cada pregunta lleva su dificultad (Fácil, Media o Difícil).'}</p>
    <p class="meta" style="margin:6px 0 0">${exBuf.duracion>0?'El reloj de cada estudiante empieza cuando pulsa "Comenzar"; queda registrada su hora de inicio y, si se acaba el tiempo, se entrega lo que lleve.':'Sin tiempo límite, el estudiante lo presenta cuando quiera mientras esté abierto.'}</p>
  </div>
  ${lock?'':`<div class="card shareBox" style="margin-top:12px">
    <b style="font-size:.9em">✨ Generar preguntas desde tus temas</b>
    <p class="meta" style="margin:4px 0 8px">Se crean preguntas de opción múltiple con las tarjetas de los temas que elijas. Después puedes editarlas o agregar las tuyas.</p>
    ${temas.length?temas.map(t=>`<label class="exTemaLbl"><input type="checkbox" class="exTema" value="${t.id}" ${nCards(t)?'':'disabled'}> ${esc(t.title||'Sin título')} <span class="meta">(${nCards(t)} tarjeta${nCards(t)==1?'':'s'})</span></label>`).join(''):'<p class="meta">Todavía no hay temas. Crea uno en la pestaña Contenido.</p>'}
    <div class="row" style="flex-wrap:wrap"><label class="meta" for="exN">Cantidad</label><input class="fld" id="exN" type="number" min="1" max="40" value="10" style="width:90px">
      <select class="fld" id="exTipos" style="width:auto" aria-label="Tipos de pregunta"><option value="mc">Opción múltiple</option><option value="mixto">Variadas (opción múltiple, verdadero o falso y completar)</option></select>
      <select class="fld" id="exDif" style="width:auto" aria-label="Dificultad de las preguntas a generar">${DIFICULTADES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      <button class="pr" data-action="exGenerar">✨ Generar</button></div>
  </div>`}
  ${lock?'':bancoPanelHTML()}
  <div class="viewhead" style="margin-top:18px"><h2>Preguntas (${exBuf.preguntas.length})</h2></div>
  ${exBuf.preguntas.length?exBuf.preguntas.map((q,i)=>`<div class="card exQ" style="margin-bottom:12px">
    <div class="row" style="justify-content:space-between;margin-top:0"><b>Pregunta ${i+1}</b>${q.temaTitulo?`<span class="chip">${esc(q.temaTitulo)}</span>`:''}${lock?'':`<button class="icon-btn" data-action="exDelQ" data-q="${q.id}" title="Eliminar pregunta" aria-label="Eliminar pregunta ${i+1}">🗑️</button>`}</div>
    <textarea class="fld" data-ex="enun" data-q="${q.id}" placeholder="Escribe la pregunta" ${dis}>${esc(q.enunciado)}</textarea>
    <div class="row" style="flex-wrap:wrap;margin:6px 0"><label class="meta">Dificultad</label><select class="fld" data-ex="qdif" data-q="${q.id}" style="width:auto" ${dis}>${['facil','media','dificil'].map(v=>`<option value="${v}" ${(q.dif||'media')===v?'selected':''}>${nombreDif(v)}</option>`).join('')}</select>${esHueco(q)?'<span class="chip">Completar</span>':q.tipo==='vf'?'<span class="chip">Verdadero o falso</span>':''}</div>
    ${esHueco(q)?`<label class="lbl">Respuesta esperada (se acepta sin tildes ni mayúsculas)</label><input class="fld" data-ex="hueco" data-q="${q.id}" value="${esc(q.correcta||'')}" maxlength="80" ${dis}>`:[0,1,2,3].map(j=>`<div class="exOpt"><button type="button" class="exRadio ${q.correcta===j?'on':''}" data-action="exCorrecta" data-q="${q.id}" data-i="${j}" title="Marcar como correcta" aria-label="Marcar la opción ${j+1} como correcta" aria-pressed="${q.correcta===j}" ${dis}>${q.correcta===j?'✓':''}</button><input class="fld" data-ex="opt" data-q="${q.id}" data-i="${j}" value="${esc(q.opciones[j]||'')}" placeholder="Opción ${j+1}${j>1?' (opcional)':''}" ${dis}></div>`).join('')}
    <label class="lbl">💡 Explicación (opcional, el estudiante la ve después de entregar si falló)</label><textarea class="fld" data-ex="exp" data-q="${q.id}" rows="2" maxlength="400" placeholder="Por qué esta es la respuesta correcta" ${dis}>${esc(q.exp||'')}</textarea>
  </div>`).join(''):'<div class="empty">Aún no hay preguntas. Genera algunas desde tus temas o agrega una manualmente.</div>'}
  ${lock?'':'<button class="sec" data-action="exAddQ">+ Agregar pregunta</button>'}
  <div class="row" style="flex-wrap:wrap;margin-top:18px">
    ${lock?'':'<button class="pr" data-action="exPublicar">🚀 Publicar examen</button>'}
    ${lock&&exBuf.estado==='publicado'?'<button class="sec" data-action="exABorrador">📝 Volver a borrador</button>':''}
    <button class="sec" data-action="exEliminar">🗑️ Eliminar examen</button>
  </div>`;
}
/* ======================= DOCENTE: banco de preguntas =======================
   Vive en bancoPreguntas/{uid}/items (solo del docente) y no depende de la materia: sirve para el siguiente semestre. */
let bancoCache=null,bancoAbierto=false,bancoCargando=false,bancoFiltro={corte:'',texto:''};const bancoSel=new Set();
const bancoRef=()=>db.collection('bancoPreguntas').doc(currentUid).collection('items');
function hashPregunta(q){
  const s=[q.enunciado,...(q.opciones||[])].map(x=>normTxt(x)).join('|')+'|'+(Number(q.correcta)||0);
  return 'p'+semillaTxt(s).toString(36)+semillaTxt(s.split('').reverse().join('')).toString(36);
}
async function cargarBanco(){
  if(bancoCargando)return;
  bancoCargando=true;
  try{const snap=await bancoRef().get();bancoCache=snap.docs.map(d=>({id:d.id,...d.data()}))}
  catch(e){console.warn('Banco de preguntas:',e);bancoCache=[];toast('⚠️ No se pudo leer tu banco de preguntas'+esc(detalleError(e)))}
  bancoCargando=false;
  if(route.view==='docExamen')render(true);
}
async function guardarEnBanco(m,qs){
  const b=db.batch();let n=0;
  qs.forEach(q=>{
    const ops=[0,1,2,3].map(i=>limpioT((q.opciones||[])[i]));
    if(!limpioT(q.enunciado)||ops.filter(Boolean).length<2||!ops[Number(q.correcta)])return;
    const t=state.temas.find(x=>x.id===q.temaId),c=t&&state.cortes.find(x=>x.id===t.corteId);
    const item={enunciado:limpioT(q.enunciado),opciones:ops,correcta:Number(q.correcta)||0,temaTitulo:limpioT(q.temaTitulo),corte:c?limpioT(c.name):'',materia:limpioT(m.name),creado:Date.now()};
    b.set(bancoRef().doc(hashPregunta(item)),item);n++;
  });
  if(!n)return 0;
  await b.commit();
  bancoCache=null;cargarBanco();
  return n;
}
function bancoPanelHTML(){
  if(!bancoAbierto)return `<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">📚 Banco de preguntas</b>
    <p class="meta" style="margin:4px 0 8px">Guarda tus mejores preguntas y reutilízalas en otros exámenes y en otros semestres. Es solo tuyo.</p>
    <div class="row" style="flex-wrap:wrap"><button class="sec" data-action="exBancoGuardar">💾 Guardar estas preguntas en mi banco</button><button class="sec" data-action="exBancoAbrir">📥 Traer del banco</button></div></div>`;
  if(bancoCache===null){if(!bancoCargando)cargarBanco();return `<div class="card shareBox" style="margin-top:12px"><b>📚 Banco de preguntas</b><p class="meta">Cargando…</p></div>`}
  const cortes=[...new Set(bancoCache.map(x=>x.corte||''))].sort();
  const q=normTxt(bancoFiltro.texto);
  const lista=bancoCache.filter(x=>(!bancoFiltro.corte||(bancoFiltro.corte==='__sin'?!x.corte:x.corte===bancoFiltro.corte))&&(!q||normTxt(x.enunciado+' '+x.materia+' '+x.temaTitulo).includes(q)))
    .sort((x,y)=>(x.corte||'').localeCompare(y.corte||'')||(y.creado||0)-(x.creado||0));
  const enExamen=new Set(exBuf.preguntas.map(p=>normTxt(p.enunciado)));
  return `<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">📚 Banco de preguntas (${bancoCache.length})</b>
    <div class="two" style="margin-top:8px">
      <div><label class="lbl" style="margin-top:0">Corte</label><select class="fld" data-action="bancoCorte"><option value="">Todos los cortes</option>${cortes.map(c=>`<option value="${c||'__sin'}" ${bancoFiltro.corte===(c||'__sin')?'selected':''}>${esc(c)||'(sin corte)'}</option>`).join('')}</select></div>
      <div><label class="lbl" style="margin-top:0">Buscar</label><input class="fld" data-action="bancoTexto" value="${esc(bancoFiltro.texto)}" placeholder="Palabra, tema o materia" maxlength="60"></div>
    </div>
    ${lista.length?lista.map(x=>{const ya=enExamen.has(normTxt(x.enunciado));return `<div class="li bancoFila"><label class="exTemaLbl" style="flex:1"><input type="checkbox" data-action="bancoSel" data-bid="${x.id}" ${bancoSel.has(x.id)?'checked':''} ${ya?'disabled':''}> ${esc(x.enunciado)}<br><small class="meta">${esc(x.corte||'sin corte')} · ${esc(x.materia||'')}${x.temaTitulo?' · '+esc(x.temaTitulo):''}${ya?' · ya está en este examen':''}</small></label><button class="icon-btn" data-action="bancoDel" data-bid="${x.id}" title="Quitar del banco" aria-label="Quitar del banco">🗑️</button></div>`}).join(''):'<p class="meta">No hay preguntas con ese filtro. Guarda las de un examen con "Guardar estas preguntas en mi banco".</p>'}
    <div class="row" style="flex-wrap:wrap;margin-top:10px"><button class="pr" data-action="exBancoAgregar" ${bancoSel.size?'':'disabled'}>Agregar seleccionadas (${bancoSel.size})</button><button class="sec" data-action="exBancoGuardar">💾 Guardar las de este examen</button><button class="sec" data-action="exBancoCerrar">Cerrar</button></div></div>`;
}
async function exEliminarExamen(m,exId){
  const base=baseDe(m),b=db.batch();
  b.delete(base.collection('examenes').doc(exId));
  b.delete(base.collection('claves').doc(exId));
  Object.values(inMap[m.sharedId]||{}).filter(i=>i.examId===exId).forEach(i=>b.delete(base.collection('intentos').doc(i.id)));
  Object.values(iniMap[m.sharedId]||{}).filter(i=>i.examId===exId).forEach(i=>b.delete(base.collection('inicios').doc(i.id)));
  try{await b.commit()}catch(e){console.error(e);UI.alerta('No se pudo eliminar el examen'+detalleError(e)+'.')}
}

/* ======================= DOCENTE: resultados ======================= */
function resultadosDe(m,ex){
  const sid=m.sharedId,meta=sharedMeta[sid]||{},clave=(clMap[sid]||{})[ex.id],inv=invitMap[sid]||[];
  const intentos=Object.values(inMap[sid]||{}).filter(i=>i.examId===ex.id);
  const uids=(meta.members||[]).filter(u=>u!==meta.ownerUid);
  intentos.forEach(i=>{if(!uids.includes(i.uid))uids.push(i.uid)});
  const filas=uids.map(u=>{
    const it=intentos.find(i=>i.uid===u),inf=inv.find(i=>i.uid===u)||{};
    return{uid:u,nombre:(meta.memberNames||{})[u]||(it&&it.nombre)||inf.nombre||'Estudiante',email:inf.email||(it&&it.email)||'',
      intento:it||null,ini:(iniMap[sid]||{})[ex.id+'_'+u]||null,res:(it&&clave)?calificar(ex,clave,it.respuestas||{},u):null};
  });
  const hechas=filas.filter(f=>f.res),pcts=hechas.map(f=>f.res.pct);
  const stats={entregaron:hechas.length,total:filas.length,
    prom:pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null,
    max:pcts.length?Math.max(...pcts):null,min:pcts.length?Math.min(...pcts):null,aprobaron:pcts.filter(p=>p>=60).length};
  const buckets=[0,0,0,0,0];pcts.forEach(p=>buckets[Math.min(4,Math.floor(p/20))]++);
  const preguntas=(ex.preguntas||[]).map(q=>{
    const dets=hechas.map(f=>f.res.det.find(d=>d.q.id===q.id)).filter(Boolean);
    const aciertos=dets.filter(d=>d.acierto).length,cuentas={};
    dets.filter(d=>!d.acierto&&d.elegido!==undefined).forEach(d=>{cuentas[d.elegido]=(cuentas[d.elegido]||0)+1});
    const top=Object.entries(cuentas).sort((a,b)=>b[1]-a[1])[0];
    return{q,n:dets.length,aciertos,pct:dets.length?Math.round(aciertos/dets.length*100):null,
      peor:top?{texto:esHueco(q)?top[0]:((q.opciones||[])[+top[0]]||''),veces:top[1]}:null};
  });
  const temas={};
  preguntas.forEach(p=>{if(!p.n)return;const k=p.q.temaTitulo||'Sin tema';const t=temas[k]=temas[k]||{titulo:k,ok:0,n:0};t.ok+=p.aciertos;t.n+=p.n});
  const porTema=Object.values(temas).map(t=>({...t,pct:Math.round(t.ok/t.n*100)})).sort((a,b)=>a.pct-b.pct);
  return{filas,stats,buckets,preguntas,porTema,clave};
}
const colorPct=p=>p>=70?'var(--ok)':p>=50?'var(--a)':'var(--no)';
function barraPct(p){return `<div class="bar mini pctBar"><i style="width:${p==null?0:p}%;background:${colorPct(p)}"></i></div>`}

function minutosUsados(f){return(f.ini&&f.intento&&ms(f.ini.inicio)&&ms(f.intento.enviado))?Math.max(0,Math.round((ms(f.intento.enviado)-ms(f.ini.inicio))/60000)):null}
function detalleEstudianteHTML(f,ex){
  const det=f.res.det,ok=det.filter(d=>d.acierto).length,sin=det.filter(d=>d.elegido===undefined).length,mal=det.length-ok-sin;
  const vis=det.map((d,i)=>({d,i})).filter(x=>docResFiltro==='mal'?!x.d.acierto:docResFiltro==='bien'?x.d.acierto:true);
  const chip=(k,txt)=>`<button type="button" class="toggleChip ${docResFiltro===k?'on':''}" data-action="resFiltro" data-f="${k}">${txt}</button>`;
  return `<div class="resDet">
    <p class="meta" style="margin:8px 0 0">${f.intento&&ms(f.intento.enviado)?'Entregó el '+esc(fmtFechaHora(ms(f.intento.enviado)))+' · ':''}<b>${ok}</b> correcta${ok==1?'':'s'} · <b>${mal}</b> incorrecta${mal==1?'':'s'}${sin?' · <b>'+sin+'</b> sin responder':''}</p>
    <div class="row" style="flex-wrap:wrap;margin:8px 0 0">${chip('todas','Todas ('+det.length+')')}${chip('mal','❌ Incorrectas ('+(mal+sin)+')')}${chip('bien','✅ Correctas ('+ok+')')}</div>
    ${vis.length?vis.map(({d,i})=>`<div class="resRow ${d.acierto?'bien':'mal'}" style="margin-top:10px"><b>${i+1}. ${esc(d.q.enunciado)}</b>${d.q.temaTitulo?` <span class="chip">${esc(d.q.temaTitulo)}</span>`:''}
      <ul class="resOps">${esHueco(d.q)?`<li class="${d.acierto?'opC':'opE'}">${esc(textoRespuesta(d.q,d.elegido)||'(sin responder)')} <small>Su respuesta</small></li>${d.acierto?'':`<li class="opC">${esc(textoRespuesta(d.q,d.correcta))} <small>Respuesta esperada</small></li>`}`:(d.q.opciones||[]).map((o,j)=>{
        if(!String(o||'').trim())return '';
        const esC=j===Number(d.correcta),esE=d.elegido!==undefined&&j===Number(d.elegido);
        const tag=esC&&esE?'✅ Su respuesta · correcta':esC?'✔ Respuesta correcta':esE?'❌ Su respuesta':'';
        return `<li class="${esC?'opC':esE?'opE':''}">${esc(o)}${tag?` <small>${tag}</small>`:''}</li>`}).join('')}</ul>
      ${d.elegido===undefined?'<div class="meta" style="margin:2px 0 0">Sin responder</div>':''}</div>`).join(''):'<p class="meta">No hay preguntas en este filtro.</p>'}
    <label class="lbl" for="comTx-${f.uid}">💬 Comentario para ${esc(f.nombre)} (solo lo ve este estudiante)</label>
    <textarea class="fld" id="comTx-${f.uid}" rows="2" maxlength="${COMENTARIO_MAX}" placeholder="Por ejemplo: repasa el tema 2, confundiste los conceptos de…">${esc((comentarioDe(materiaRuta(),ex.id,f.uid)||{}).texto||'')}</textarea>
    <div class="row"><button class="sec" data-action="comGuardar" data-u="${f.uid}">💬 Guardar comentario</button><button class="sec" data-action="exRepetir" data-u="${f.uid}">↩️ Permitir que lo repita</button></div></div>`;
}
function viewDocResultadosHTML(){
  const m=materiaRuta(),ex=m&&(exMap[m.sharedId]||{})[route.examId];
  if(!m||!ex)return '<div class="empty">No se encontró el examen. <button class="sec" data-action="exVolver">Volver</button></div>';
  if(m.rol!=='docente')return '<div class="empty">Solo el docente de la materia puede ver las respuestas de los estudiantes.</div>';
  const r=resultadosDe(m,ex),st=r.stats,esc_=ex.escala||5;
  const notaProm=st.prom==null?'—':fmtN(Math.round(st.prom/100*esc_*10)/10);
  const maxB=Math.max(1,...r.buckets);
  const rangos=['0–19%','20–39%','40–59%','60–79%','80–100%'];
  return `<button class="sec" data-action="exVolver">← Exámenes</button>
  <div class="viewhead" style="margin-top:14px"><h1>📊 ${esc(ex.titulo||'Examen')}</h1></div>
  <div class="row" style="margin:0 0 12px;flex-wrap:wrap">${chipEstado(ex)}<span class="chip">${(ex.preguntas||[]).length} preguntas</span>${ex.cierre?`<span class="chip">cierra ${fmtFechaHora(ex.cierre)}</span>`:''}
    <button class="sec" data-action="exCsv">⬇️ Descargar notas (CSV)</button>
    <button class="sec" data-action="exCsvDet">⬇️ Respuestas detalladas (CSV)</button>
    <button class="pr" data-action="exXlsx">⬇️ Excel (.xlsx)</button>
    ${ex.estado==='cerrado'?`<button class="sec" data-action="exEstado" data-id="${m.id}" data-ex="${ex.id}" data-to="publicado">🔓 Reabrir</button>`:`<button class="sec" data-action="exEstado" data-id="${m.id}" data-ex="${ex.id}" data-to="cerrado">🔒 Cerrar examen</button>`}</div>
  ${r.clave?'':'<p class="meta">Cargando las respuestas correctas…</p>'}
  <div class="statGrid">
    <div class="card statC"><b>${st.entregaron}/${st.total}</b><span>entregaron</span></div>
    <div class="card statC"><b>${st.prom==null?'—':st.prom+'%'}</b><span>promedio · nota ${notaProm}</span></div>
    <div class="card statC"><b>${st.max==null?'—':st.max+'%'}</b><span>más alta</span></div>
    <div class="card statC"><b>${st.min==null?'—':st.min+'%'}</b><span>más baja</span></div>
    <div class="card statC"><b>${st.aprobaron}</b><span>con 60% o más</span></div>
  </div>
  ${st.entregaron?`<div class="card" style="margin-top:12px"><b style="font-size:.9em">Distribución de resultados</b>
    <div class="histo">${r.buckets.map((n,i)=>`<div class="hCol"><span class="hN">${n}</span><div class="hBar" style="height:${Math.round(n/maxB*70)+4}px"></div><span class="hL">${rangos[i]}</span></div>`).join('')}</div></div>`:''}

  <h2 style="margin:22px 0 10px">👥 Estudiantes</h2>
  ${r.filas.length?r.filas.map(f=>{
    const abierto=docResSel===f.uid;
    return `<div class="card resFila" style="margin-bottom:8px">
      <div class="row resCab" style="justify-content:space-between;margin-top:0" data-action="resFila" data-u="${f.uid}" role="button" tabindex="0" aria-expanded="${abierto}">
        <div><b>${esc(f.nombre)}</b><div class="meta" style="margin:0">${esc(f.email)}${f.ini&&ms(f.ini.inicio)?' · inició '+esc(fmtFechaHora(ms(f.ini.inicio))):''}${f.intento&&ms(f.intento.enviado)?' · entregó '+esc(fmtFechaHora(ms(f.intento.enviado))):''}${minutosUsados(f)!=null?' · '+minutosUsados(f)+' min':''}</div></div>
        <div style="text-align:right">${f.res?`<b style="color:${colorPct(f.res.pct)}">${f.res.ok}/${f.res.total} · ${f.res.pct}%</b><div class="meta" style="margin:0">nota ${fmtN(f.res.nota)} / ${f.res.escala}</div>`
          :f.intento?'<span class="chip">Entregó (calculando…)</span>':f.ini?'<span class="chip">⏳ Empezó y no entregó</span>':'<span class="chip">⏳ Sin entregar</span>'}</div>
      </div>
      ${abierto&&f.res?detalleEstudianteHTML(f,ex):''}
    </div>`}).join(''):'<div class="empty">Todavía no hay estudiantes en esta materia.</div>'}

  ${st.entregaron&&r.preguntas.some(p=>p.pct!=null&&p.pct<60)?`<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">🎯 Para repasar en clase</b>
    <p class="meta" style="margin:4px 0 0">Las preguntas que más falló el grupo:</p>
    <ol class="segTop">${r.preguntas.filter(p=>p.pct!=null&&p.pct<60).sort((a,b)=>a.pct-b.pct).slice(0,3).map(p=>`<li><b style="color:${colorPct(p.pct)}">${p.pct}%</b> ${esc(p.q.enunciado)}${p.peor?`<div class="meta" style="margin:0">Error más común: ${esc(p.peor.texto)}</div>`:''}</li>`).join('')}</ol></div>`:''}
  ${st.entregaron?`<h2 style="margin:22px 0 10px">❓ Resultados por pregunta</h2>
  ${r.preguntas.map((p,i)=>`<div class="card" style="margin-bottom:8px"><div class="row" style="justify-content:space-between;margin-top:0;align-items:flex-start">
      <div><b>${i+1}. ${esc(p.q.enunciado)}</b>${p.q.temaTitulo?`<div class="meta" style="margin:2px 0 0">${esc(p.q.temaTitulo)}</div>`:''}</div>
      <div style="text-align:right;white-space:nowrap"><b style="color:${colorPct(p.pct)}">${p.pct==null?'—':p.pct+'%'}</b><div class="meta" style="margin:0">${p.aciertos}/${p.n} acertaron</div></div></div>
      ${barraPct(p.pct)}
      ${p.pct!=null&&p.pct<50?'<span class="chip" style="color:var(--no);border-color:var(--no)">⚠️ Pregunta difícil</span> ':''}
      ${p.peor?`<span class="meta">Error más común: <b>${esc(p.peor.texto)}</b> (${p.peor.veces} estudiante${p.peor.veces==1?'':'s'})</span>`:''}
    </div>`).join('')}
  <h2 style="margin:22px 0 10px">📚 Temas que más cuestan</h2>
  ${r.porTema.map(t=>`<div class="card" style="margin-bottom:8px"><div class="row" style="justify-content:space-between;margin-top:0"><b>${esc(t.titulo)}</b><b style="color:${colorPct(t.pct)}">${t.pct}% de acierto</b></div>${barraPct(t.pct)}<span class="meta">${t.ok} de ${t.n} respuestas correctas</span></div>`).join('')}`:''}`;
}
/* ---------- Excel (.xlsx) sin librerías extra: se arma con JSZip, que ya se usa para leer PPTX ---------- */
const xmlEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const colLetra=n=>{let s='';n++;while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s};
/* ---------- Excel (.xlsx) con fórmulas y formato ----------
   Una celda puede ser un valor o un objeto {v: valor ya calculado, f: fórmula, s: estilo}. Se guardan la fórmula Y su valor,
   así se ve bien en cualquier programa y Excel o Sheets la recalculan al abrir. Estilos: hdr (encabezado), txt, txtc, txtw,
   int, dec, pct y, en el resumen, lbl, sint, sdec, spct. */
const XS={hdr:1,txt:2,int:3,dec:4,pct:5,lbl:6,sdec:7,spct:8,sint:9,txtc:10,txtw:11};
function celdaXML(c,ref,porDefecto){
  const o=(c!==null&&typeof c==='object')?c:{v:c};
  const sid=o.s?XS[o.s]:porDefecto,st=sid?' s="'+sid+'"':'';
  const f=o.f?'<f>'+xmlEsc(o.f)+'</f>':'',v=o.v;
  if(typeof v==='number'&&isFinite(v))return '<c r="'+ref+'"'+st+'>'+f+'<v>'+v+'</v></c>';
  if(o.f)return '<c r="'+ref+'"'+st+' t="str">'+f+'<v>'+xmlEsc(v==null?'':v)+'</v></c>';
  if(v===null||v===undefined||v==='')return st?'<c r="'+ref+'"'+st+'/>':'';
  return '<c r="'+ref+'"'+st+' t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(v)+'</t></is></c>';
}
function hojaXML(h){
  const filas=h.filas.map((fila,i)=>'<row r="'+(i+1)+'"'+(i===0?' ht="24" customHeight="1"':'')+'>'+fila.map((c,j)=>celdaXML(c,colLetra(j)+(i+1),i===0?XS.hdr:XS.txt)).join('')+'</row>').join('');
  const cols=h.anchos?'<cols>'+h.anchos.map((w,j)=>'<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>':'';
  const cz=h.congelar||{x:0,y:1};
  const pane='<pane '+(cz.x?'xSplit="'+cz.x+'" ':'')+'ySplit="'+cz.y+'" topLeftCell="'+colLetra(cz.x||0)+(cz.y+1)+'" activePane="'+(cz.x?'bottomRight':'bottomLeft')+'" state="frozen"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">'+pane+'</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>'+cols+'<sheetData>'+filas+'</sheetData>'+(h.filtro?'<autoFilter ref="'+h.filtro+'"/>':'')+(h.cf||[]).join('')+'<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
}
const XESTILOS='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  +'<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF9C0006"/><name val="Calibri"/></font></fonts>'
  +'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2A44"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF1F7"/><bgColor indexed="64"/></patternFill></fill></fills>'
  +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>'
  +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  +'<cellXfs count="12">'
  +'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  +'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
  +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  +'<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  +'<xf numFmtId="2" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="9" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="1" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  +'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
  +'</cellXfs><dxfs count="1"><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs></styleSheet>';
async function crearXlsx(hojas){
  const JSZ=await cargarJSZip(),z=new JSZ();
  const nombres=hojas.map((h,i)=>xmlEsc(String(h.nombre||'Hoja'+(i+1)).replace(/[\[\]:*?\/\\]/g,' ').slice(0,31)));
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+hojas.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  z.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><calcPr calcId="191029" fullCalcOnLoad="1"/><sheets>'+hojas.map((_,i)=>'<sheet name="'+nombres[i]+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+hojas.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(hojas.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  z.file('xl/styles.xml',XESTILOS);
  hojas.forEach((h,i)=>z.file('xl/worksheets/sheet'+(i+1)+'.xml',hojaXML(h)));
  const bytes=await z.generateAsync({type:'uint8array',compression:'DEFLATE'});
  return new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function bajarBlob(blob,nombre){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nombre;
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
const nombreArchivo=(t,suf)=>(t||'examen').replace(/[^\wáéíóúñÁÉÍÓÚÑ -]+/g,'').trim().replace(/\s+/g,'_')+suf;
const cfRoja=(rango,formula)=>'<conditionalFormatting sqref="'+rango+'"><cfRule type="expression" dxfId="0" priority="1"><formula>'+xmlEsc(formula)+'</formula></cfRule></conditionalFormatting>';
const cfEscala=(rango,prio)=>'<conditionalFormatting sqref="'+rango+'"><cfRule type="colorScale" priority="'+prio+'"><colorScale><cfvo type="num" val="0"/><cfvo type="num" val="0.5"/><cfvo type="num" val="1"/><color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale></cfRule></conditionalFormatting>';
const promedioDe=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:'';
async function descargarXlsx(m,ex){
  const r=resultadosDe(m,ex),hora=t=>t?fmtFechaHora(t):'',n=r.filas.length,fin=n+1,rg=c=>c+'2:'+c+fin;
  const esc=ex.escala||5,notas=[['Estudiante','Correo','Estado','Aciertos','Total','Porcentaje','Nota','Escala','Inició','Entregó','Minutos usados']];
  const vals=[];let entregaron=0;
  r.filas.forEach((f,k)=>{
    const rr=k+2,tiene=!!f.res&&f.res.total>0;
    if(f.res)entregaron++;
    const nota=tiene?Math.round(f.res.ok/f.res.total*esc*10)/10:'';
    if(nota!=='')vals.push(nota);
    notas.push([{v:f.nombre,s:'txt'},{v:f.email,s:'txt'},{v:f.res?'Entregó':f.intento?'Entregó (sin calificar)':f.ini?'Empezó y no entregó':'Sin entregar',s:'txtc'},
      {v:f.res?f.res.ok:'',s:'int'},{v:f.res?f.res.total:'',s:'int'},
      {v:tiene?f.res.ok/f.res.total:'',f:'IF(E'+rr+'>0,D'+rr+'/E'+rr+',"")',s:'pct'},
      {v:nota,f:'IF(E'+rr+'>0,ROUND(D'+rr+'/E'+rr+'*H'+rr+',1),"")',s:'dec'},{v:esc,s:'int'},
      {v:f.ini?hora(ms(f.ini.inicio)):'',s:'txtc'},{v:f.intento?hora(ms(f.intento.enviado)):'',s:'txtc'},{v:minutosUsados(f)==null?'':minutosUsados(f),s:'int'}]);
  });
  if(n){
    const aprob=vals.filter(x=>x>=esc*0.6).length;
    notas.push([]);
    [['Estudiantes',{v:n,f:'COUNTA('+rg('A')+')',s:'sint'}],
     ['Entregaron',{v:entregaron,f:'COUNTIF('+rg('C')+',"Entregó")',s:'sint'}],
     ['Nota promedio',{v:promedioDe(vals),f:'IFERROR(AVERAGE('+rg('G')+'),"")',s:'sdec'}],
     ['Nota máxima',{v:vals.length?Math.max(...vals):'',f:'IF(COUNT('+rg('G')+')>0,MAX('+rg('G')+'),"")',s:'sdec'}],
     ['Nota mínima',{v:vals.length?Math.min(...vals):'',f:'IF(COUNT('+rg('G')+')>0,MIN('+rg('G')+'),"")',s:'sdec'}],
     ['Aprobaron (nota ≥ 60 % de la escala)',{v:aprob,f:'COUNTIF('+rg('G')+',">="&(H2*0.6))',s:'sint'}],
     ['% de aprobados',{v:vals.length?aprob/vals.length:'',f:'IFERROR(COUNTIF('+rg('G')+',">="&(H2*0.6))/COUNT('+rg('G')+'),"")',s:'spct'}]
    ].forEach(x=>notas.push([{v:x[0],s:'lbl'},x[1]]));
  }
  const pf=r.preguntas.length+1,preg=[['N.º','Pregunta','Tema','Dificultad','Respondieron','Acertaron','% de acierto','Opción incorrecta más elegida','Veces']];
  r.preguntas.forEach((p,i)=>{const rr=i+2;preg.push([{v:i+1,s:'int'},{v:p.q.enunciado,s:'txtw'},{v:p.q.temaTitulo||'',s:'txt'},{v:nombreDif(p.q.dif),s:'txtc'},{v:p.n,s:'int'},{v:p.aciertos,s:'int'},
    {v:p.n?p.aciertos/p.n:'',f:'IF(E'+rr+'>0,F'+rr+'/E'+rr+',"")',s:'pct'},{v:p.peor?p.peor.texto:'',s:'txtw'},{v:p.peor?p.peor.veces:'',s:'int'}])});
  if(r.preguntas.length){
    const pp=r.preguntas.filter(p=>p.n).map(p=>p.aciertos/p.n);
    preg.push([]);preg.push([{v:'Acierto promedio',s:'lbl'},{v:promedioDe(pp),f:'IFERROR(AVERAGE(G2:G'+pf+'),"")',s:'spct'}]);
  }
  const resp=[['Estudiante','Correo','N.º','Pregunta','Tema','Respuesta elegida','Respuesta correcta','Resultado']];
  r.filas.forEach(f=>{if(!f.res)return;f.res.det.forEach((d,i)=>resp.push([{v:f.nombre,s:'txt'},{v:f.email,s:'txt'},{v:i+1,s:'int'},{v:d.q.enunciado,s:'txtw'},{v:d.q.temaTitulo||'',s:'txt'},
    {v:d.elegido===undefined?'(sin responder)':textoRespuesta(d.q,d.elegido),s:'txtw'},{v:textoRespuesta(d.q,d.correcta),s:'txtw'},{v:d.acierto?'Correcta':'Incorrecta',s:'txtc'}]))});
  const blob=await crearXlsx([
    {nombre:'Notas',filas:notas,anchos:[28,30,22,10,8,12,9,8,18,18,14],filtro:n?'A1:K'+fin:'',cf:n?[cfRoja('G2:G'+fin,'AND(ISNUMBER(G2),G2<H2*0.6)')]:[]},
    {nombre:'Por pregunta',filas:preg,anchos:[6,58,22,12,13,10,13,36,8],filtro:r.preguntas.length?'A1:I'+pf:'',cf:r.preguntas.length?[cfEscala('G2:G'+pf,2)]:[]},
    {nombre:'Respuestas',filas:resp,anchos:[26,28,6,56,22,34,34,12],filtro:resp.length>1?'A1:H'+resp.length:''}]);
  bajarBlob(blob,nombreArchivo(ex.titulo,'_notas.xlsx'));
}
/* Libro de notas: una fila por estudiante y una columna por examen, con el promedio de cada estudiante y del grupo */
async function descargarLibroNotas(m){
  const exs=examenesDe(m).filter(e=>e.estado!=='borrador').sort((x,y)=>ms(x.creado)-ms(y.creado));
  if(!exs.length){UI.alerta('Todavía no hay exámenes publicados.');return}
  const res=exs.map(ex=>resultadosDe(m,ex)),k=exs.length,ultima=colLetra(1+k),colProm=colLetra(2+k),nEst=res[0].filas.length,fin=nEst+1;
  const filas=[['Estudiante','Correo',...exs.map(e=>e.titulo||'Examen'),'Promedio']];
  const porCol=exs.map(()=>[]);
  res[0].filas.forEach((f0,i)=>{
    const rr=i+2,notas=res.map((r,j)=>{const f=r.filas.find(x=>x.uid===f0.uid);const v=f&&f.res&&f.res.total>0?Math.round(f.res.ok/f.res.total*(exs[j].escala||5)*10)/10:'';if(v!=='')porCol[j].push(v);return v});
    const num=notas.filter(x=>x!=='');
    filas.push([{v:f0.nombre,s:'txt'},{v:f0.email,s:'txt'},...notas.map(v=>({v,s:'dec'})),{v:promedioDe(num),f:'IFERROR(AVERAGE(C'+rr+':'+ultima+rr+'),"")',s:'sdec'}]);
  });
  if(nEst){
    filas.push([]);
    filas.push([{v:'Promedio del grupo',s:'lbl'},{v:'',s:'lbl'},...exs.map((_,j)=>{const c=colLetra(2+j);return{v:promedioDe(porCol[j]),f:'IFERROR(AVERAGE('+c+'2:'+c+fin+'),"")',s:'sdec'}}),
      {v:promedioDe(porCol.flat()),f:'IFERROR(AVERAGE(C2:'+ultima+fin+'),"")',s:'sdec'}]);
  }
  const esc0=exs[0].escala||5;
  const blob=await crearXlsx([{nombre:'Libro de notas',filas,anchos:[28,30,...exs.map(()=>15),12],congelar:{x:2,y:1},filtro:nEst?'A1:'+colProm+fin:'',cf:nEst?[cfRoja('C2:'+colProm+fin,'AND(ISNUMBER(C2),C2<'+esc0+'*0.6)')]:[]}]);
  bajarBlob(blob,nombreArchivo(m.name,'_libro_de_notas.xlsx'));
}
function bajarCsv(titulo,sufijo,filas){
  const celda=v=>{v=String(v==null?'':v);if(/^[=+\-@]/.test(v)&&isNaN(Number(v)))v="'"+v;return /[",\n;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const csv='\ufeff'+filas.map(f=>f.map(celda).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=(titulo||'examen').replace(/[^\wáéíóúñÁÉÍÓÚÑ -]+/g,'').trim().replace(/\s+/g,'_')+sufijo+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
function descargarCsv(m,ex){
  const r=resultadosDe(m,ex);
  const filas=[['Estudiante','Correo','Aciertos','Total','Porcentaje','Nota','Escala','Entregado']];
  r.filas.forEach(f=>filas.push([f.nombre,f.email,f.res?f.res.ok:'',f.res?f.res.total:'',f.res?f.res.pct+'%':'',f.res?f.res.nota:'',f.res?f.res.escala:'',f.intento?fmtFechaHora(ms(f.intento.enviado)):'Sin entregar']));
  bajarCsv(ex.titulo,'_notas',filas);
}
/* Una fila por estudiante y pregunta: respuesta elegida, respuesta correcta y si acertó */
function descargarCsvDetalle(m,ex){
  const r=resultadosDe(m,ex);
  const filas=[['Estudiante','Correo','N.º','Pregunta','Tema','Respuesta elegida','Respuesta correcta','Resultado']];
  r.filas.forEach(f=>{
    if(!f.res){filas.push([f.nombre,f.email,'','','','','',f.intento?'Entregó (sin calificar)':'Sin entregar']);return}
    f.res.det.forEach((d,i)=>filas.push([f.nombre,f.email,i+1,d.q.enunciado,d.q.temaTitulo||'',
      d.elegido===undefined?'(sin responder)':textoRespuesta(d.q,d.elegido),textoRespuesta(d.q,d.correcta),d.acierto?'Correcta':'Incorrecta']));
  });
  bajarCsv(ex.titulo,'_respuestas',filas);
}

