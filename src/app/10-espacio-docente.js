/* ======================================================================
   ESPACIO DOCENTE
   - Una materia de docente es un temario con tipo:'docente' (Firestore: temarios/{id}).
   - El docente es el único que escribe. Cada tema tiene publicado:true/false.
   - Los estudiantes entran por INVITACIÓN a su correo (colección invitaciones/{sid}_{correo}),
     ven solo los temas publicados y el contenido es de solo lectura para ellos.
   - En el cuaderno de cada persona: m.rol = 'docente' | 'estudiante'.
     Las materias de docente viven en un semestre oculto ('sem-docente') para no mezclarse
     con las materias del estudiante.
   ====================================================================== */
const invitMap={};        // sid -> invitaciones que envié como docente
let invitesPend=[];       // invitaciones pendientes dirigidas a mi correo
let invitesUnsub=null;

function esDocenteMat(materiaId){const m=state.materias.find(x=>x.id===materiaId);return !!(m&&m.rol==='docente')}
function nombreDocente(m){const x=sharedMeta[m.sharedId];return x?((x.memberNames||{})[x.ownerUid]||'tu docente'):'tu docente'}
function semDocente(s){
  let x=s.semesters.find(y=>y.id==='sem-docente');
  if(!x){x={id:'sem-docente',name:'Docente',oculto:true};s.semesters.push(x)}
  return x;
}
function semVisible(s){
  const v=s.semesters.filter(x=>!x.oculto);
  if(v.length)return v[v.length-1];
  const n={id:uid(),name:'Semestre 1'};s.semesters.push(n);return n;
}
/* Deja de estar enlazada al grupo pero se conserva como materia normal y editable */
function hacerLocal(m){
  delete m.sharedId;delete m.rol;
  if(state.semesters.some(x=>x.id===m.semesterId&&x.oculto))m.semesterId=semVisible(state).id;
}

/* ---------- Crear materia como docente ---------- */
async function crearDocente(){
  if(!esProfesor())return;
  const f=await formMateria('Nueva materia',null,'Ej. Ética profesional – Grupo A',true);
  if(!f)return;
  const name=f.name,icon=f.icon;
  const ref=db.collection('temarios').doc();
  try{
    await ref.set({tipo:'docente',name:name.trim(),icon,semestre:f.semestre,curso:f.curso,ownerUid:currentUid,members:[currentUid],
      memberNames:{[currentUid]:miNombre()},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){console.error(e);UI.alerta('No se pudo crear la materia'+detalleError(e)+'. Revisa las reglas de Firestore y tu conexión.');return}
  mutate(s=>s.materias.push({id:uid(),name:name.trim(),icon,color:f.color||undefined,semestre:f.semestre,curso:f.curso,semesterId:semDocente(s).id,refs:'',sharedId:ref.id,rol:'docente'}));
  const m=state.materias.find(x=>x.sharedId===ref.id);
  escucharCompartida(m);
  route={view:'materiaDetail',materiaId:m.id};render();
}

/* ---------- Invitaciones (docente) ---------- */
function escucharInvitaciones(sid){
  return db.collection('invitaciones').where('sid','==',sid).where('ownerUid','==',currentUid).onSnapshot(snap=>{
    invitMap[sid]=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderSeguro();
  },err=>console.error('Invitaciones:',err));
}
async function invitarEstudiantes(m){
  const box=$('invEmails');if(!box)return;
  const crudos=[...new Set(box.value.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
  const valido=e=>/^[^\s@\/\\]+@[^\s@\/\\]+\.[^\s@\/\\]+$/.test(e);
  const buenos=crudos.filter(valido),malos=crudos.filter(e=>!valido(e));
  const yo=(auth.currentUser.email||'').toLowerCase();
  const existentes=new Set((invitMap[m.sharedId]||[]).map(i=>i.email));
  const nuevos=buenos.filter(e=>e!==yo&&!existentes.has(e));
  if(!nuevos.length){UI.alerta(malos.length?'Estos correos no son válidos: '+malos.join(', '):'No hay correos nuevos para invitar.');return}
  try{
    for(let i=0;i<nuevos.length;i+=400){
      const b=db.batch();
      nuevos.slice(i,i+400).forEach(email=>b.set(db.collection('invitaciones').doc(m.sharedId+'_'+email),{
        sid:m.sharedId,email,materia:m.name,icon:m.icon||'📘',docente:miNombre(),ownerUid:currentUid,
        estado:'pendiente',createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
      await b.commit();
    }
    box.value='';
    UI.alerta('Invitaciones enviadas a '+nuevos.length+' persona'+(nuevos.length==1?'':'s')+'.'+(malos.length?'\nNo válidos (se omitieron): '+malos.join(', '):''));
  }catch(e){console.error(e);UI.alerta('No se pudieron enviar las invitaciones'+detalleError(e)+'. Si dice permission-denied, falta publicar las reglas nuevas de Firestore.')}
}
async function quitarInvitacion(m,invId){
  const inv=(invitMap[m.sharedId]||[]).find(x=>x.id===invId);if(!inv)return;
  if(!await UI.confirmar(inv.uid?'¿Quitar a '+(inv.nombre||inv.email)+' de la materia? Conservará una copia de lo que ya tenía, pero ya no recibirá más cambios.':'¿Cancelar la invitación a '+inv.email+'?'))return;
  try{
    if(inv.uid){const F=firebase.firestore.FieldValue;
      await refTemario(m.sharedId).update({members:F.arrayRemove(inv.uid),['memberNames.'+inv.uid]:F.delete()})}
    await db.collection('invitaciones').doc(invId).delete();
  }catch(e){console.error(e);UI.alerta('No se pudo completar la acción.')}
}
/* Quitar a un estudiante que entró con código (no tiene invitación) */
async function quitarMiembro(m,u){
  const meta=sharedMeta[m.sharedId]||{};
  if(!u||u===meta.ownerUid)return;
  if(!await UI.confirmar('¿Quitar a '+((meta.memberNames||{})[u]||'este estudiante')+' de la materia? Conservará una copia de lo que ya tenía, pero ya no recibirá más cambios.'))return;
  try{const F=firebase.firestore.FieldValue;
    await refTemario(m.sharedId).update({members:F.arrayRemove(u),['memberNames.'+u]:F.delete()})}
  catch(e){console.error(e);UI.alerta('No se pudo quitar al estudiante'+detalleError(e)+'.')}
}
async function borrarInvitaciones(sid){
  const qs=await db.collection('invitaciones').where('sid','==',sid).where('ownerUid','==',currentUid).get();
  for(let i=0;i<qs.docs.length;i+=400){
    const b=db.batch();qs.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();
  }
}

/* ---------- Código de clase (docente) ----------
   Código corto (sin letras que se confundan, como O/0 o I/1) que el docente le da a su clase. Vive en
   codigosClase/{código} → {sid, ownerUid} y en el campo "codigo" de la materia. Cambiarlo o desactivarlo
   hace que el código anterior deje de servir; quienes ya entraron siguen en la materia. */
const LETRAS_CODIGO='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuevoCodigoClase(){
  const r=new Uint32Array(7);crypto.getRandomValues(r);
  return Array.from(r,n=>LETRAS_CODIGO[n%LETRAS_CODIGO.length]).join('');
}
function codigoClaseDe(m){const x=sharedMeta[m.sharedId];return x&&typeof x.codigo==='string'?x.codigo:''}
async function generarCodigoClase(m){
  const viejo=codigoClaseDe(m);
  if(viejo&&!await UI.confirmar('¿Cambiar el código de clase? El código '+viejo+' dejará de servir. Quienes ya entraron siguen en la materia.'))return;
  const F=firebase.firestore.FieldValue;
  try{
    let codigo='';
    for(let i=0;i<5&&!codigo;i++){                // si el código ya existe (muy raro), las reglas no dejan crearlo: se prueba otro
      const c=nuevoCodigoClase();
      try{await db.collection('codigosClase').doc(c).set({sid:m.sharedId,ownerUid:currentUid,creado:F.serverTimestamp()});codigo=c}
      catch(e){if(e.code!=='permission-denied')throw e}
    }
    if(!codigo)throw new Error('sin código');
    await refTemario(m.sharedId).update({codigo});
    if(viejo)await db.collection('codigosClase').doc(viejo).delete().catch(e=>console.error(e));
    toast('🔑 Código de clase: '+codigo);
  }catch(e){console.error(e);UI.alerta('No se pudo crear el código de clase'+detalleError(e)+'. Si dice permission-denied, falta publicar las reglas nuevas de Firestore.')}
}
async function desactivarCodigoClase(m){
  const viejo=codigoClaseDe(m);if(!viejo)return;
  if(!await UI.confirmar('¿Desactivar el código '+viejo+'? Nadie más podrá entrar con él. Quienes ya entraron siguen en la materia.'))return;
  try{
    await refTemario(m.sharedId).update({codigo:''});
    await db.collection('codigosClase').doc(viejo).delete();
  }catch(e){console.error(e);UI.alerta('No se pudo desactivar el código'+detalleError(e)+'.')}
}
/* Estudiante: entra a la materia de un docente con el código de clase */
async function unirseConCodigoClase(codigo){
  let paso='buscar el código';
  try{
    const c=await db.collection('codigosClase').doc(codigo).get();
    if(!c.exists){UI.alerta('No existe ninguna clase con el código '+codigo+'. Revisa que esté bien escrito o pídeselo de nuevo a tu profesor.');return}
    const sid=c.data().sid;
    const ya=state.materias.find(x=>x.sharedId===sid);
    if(ya){route={view:'materiaDetail',materiaId:ya.id};render();return}
    const ref=refTemario(sid),F=firebase.firestore.FieldValue;
    if(!await yaSoyMiembro(ref)){
      paso='entrar a la materia';
      await db.collection('codigosClase').doc(codigo).collection('usos').doc(currentUid).set({creado:F.serverTimestamp()});
      await ref.update({members:F.arrayUnion(currentUid),['memberNames.'+currentUid]:miNombre().slice(0,120)});
    }
    paso='abrir la materia';
    await abrirMateriaDocenteUnida(sid);
    toast('✅ Entraste a la clase');
  }catch(e){
    console.error(e);
    UI.alerta(e&&e.code==='permission-denied'&&paso==='entrar a la materia'
      ?'Ese código ya no está activo. Pídele a tu profesor el código nuevo.'
      :'No se pudo entrar a la clase (falló al '+paso+detalleError(e).replace(' (',': ').replace(/\)$/,'')+'). Inténtalo de nuevo.');
  }
}

/* ---------- Publicar / borrador ---------- */
function avisoPublicado(){toast('📣 Publicado. Tus estudiantes verán un aviso 🔔 cuando abran Auren.')}
function publicarTema(id){
  mutate(s=>{const t=s.temas.find(x=>x.id===id);if(t)t.publicado=!t.publicado});
  const t=state.temas.find(x=>x.id===id);if(t&&t.publicado&&esDocenteMat(t.materiaId))avisoPublicado();
}
async function publicarTodos(m){
  const borradores=state.temas.filter(t=>t.materiaId===m.id&&!t.publicado);
  if(!borradores.length)return;
  if(!await UI.confirmar('¿Publicar '+borradores.length+' tema'+(borradores.length==1?'':'s')+' a todos tus estudiantes?'))return;
  mutate(s=>s.temas.forEach(t=>{if(t.materiaId===m.id)t.publicado=true}));
  avisoPublicado();
}

/* ---------- Invitaciones recibidas (estudiante) ---------- */
function escucharMisInvitaciones(){
  if(invitesUnsub){invitesUnsub();invitesUnsub=null}
  const u=auth.currentUser;
  if(!u||!u.email||!u.emailVerified){invitesPend=[];return}
  invitesUnsub=db.collection('invitaciones').where('email','==',u.email.toLowerCase()).where('estado','==','pendiente')
    .onSnapshot(snap=>{
      invitesPend=snap.docs.map(d=>({id:d.id,...d.data()}));
      renderSeguro();
    },err=>console.error('Mis invitaciones:',err));
}
/* ¿Ya soy miembro de esta materia? (si no lo soy, las reglas no me dejan leerla y eso también cuenta como "no") */
async function yaSoyMiembro(ref){
  try{const snap=await ref.get();return !!(snap.exists&&(snap.data().members||[]).includes(currentUid))}
  catch(e){return false}
}
/* Agrega a mi cuaderno la materia del docente a la que acabo de entrar (invitación o código) y la abre */
async function abrirMateriaDocenteUnida(sid){
  const d=(await refTemario(sid).get()).data()||{};
  if(!state.materias.some(x=>x.sharedId===sid)){
    mutate(s=>{
      const sm=(d.tipo==='docente'&&d.semestre)?semPorNumero(s,d.semestre):semVisible(s);       // la materia queda en el semestre que definió el profesor
      s.materias.push({id:uid(),name:d.name||'Materia',icon:d.icon||'📘',semestre:d.semestre,curso:d.curso,semesterId:sm.id,refs:'',sharedId:sid,rol:d.tipo==='docente'?'estudiante':undefined});
    });
  }
  const m=state.materias.find(x=>x.sharedId===sid);
  escucharCompartida(m);
  route={view:'materiaDetail',materiaId:m.id};render();
}
async function aceptarInvitacion(invId){
  const inv=invitesPend.find(x=>x.id===invId);if(!inv)return;
  let paso='entrar a la materia';
  try{
    const ref=refTemario(inv.sid),F=firebase.firestore.FieldValue;
    if(!await yaSoyMiembro(ref))                  // si ya estaba dentro (por ejemplo, entró con código), solo falta marcar la invitación
      await ref.update({members:F.arrayUnion(currentUid),['memberNames.'+currentUid]:miNombre().slice(0,120)});
    paso='marcar la invitación como aceptada';
    await db.collection('invitaciones').doc(invId).update({estado:'aceptada',uid:currentUid,nombre:miNombre().slice(0,120)});
    paso='abrir la materia';
    await abrirMateriaDocenteUnida(inv.sid);
  }catch(e){console.error(e);UI.alerta('No se pudo aceptar la invitación (falló al '+paso+detalleError(e).replace(' (',': ').replace(/\)$/,'')+'). Inténtalo de nuevo.')}
}
async function rechazarInvitacion(invId){
  if(!await UI.confirmar('¿Rechazar esta invitación?'))return;
  try{await db.collection('invitaciones').doc(invId).update({estado:'rechazada',nombre:miNombre()})}
  catch(e){console.error(e);UI.alerta('No se pudo rechazar la invitación.')}
}

/* ---------- Interfaz ---------- */
function invitacionesHTML(){
  const u=auth.currentUser;if(!u)return'';
  if(!u.emailVerified){
    return `<div class="card shareBox" style="margin-bottom:14px"><p class="meta" style="margin:0">📨 ¿Te invitó un docente a una materia? Verifica tu correo para ver sus invitaciones.</p>
      <div class="row"><button class="sec" data-action="verifyEmail">Enviar correo de verificación</button><button class="sec" data-action="recheckVerified">Ya verifiqué</button></div></div>`;
  }
  if(!invitesPend.length)return'';
  return `<div class="card shareBox" style="margin-bottom:14px"><b style="font-size:.9em">📨 Invitaciones de docentes</b>
    ${invitesPend.map(i=>`<div style="margin-top:10px"><div>${esc(i.icon||'📘')} <b>${esc(i.materia)}</b> <span class="meta">· ${esc(i.docente||'Docente')}</span></div>
      <div class="row"><button class="pr" data-action="acceptInvite" data-inv="${esc(i.id)}">✓ Aceptar</button><button class="sec" data-action="declineInvite" data-inv="${esc(i.id)}">Rechazar</button></div></div>`).join('')}
  </div>`;
}
function estudianteDocenteBoxHTML(m){
  return `<div class="card shareBox" style="margin-top:14px">
    <b style="font-size:.9em">👩‍🏫 Materia de ${esc(nombreDocente(m))}</b>
    <p class="meta" style="margin:4px 0 0">El contenido lo publica tu docente y se actualiza solo. Es de solo lectura. Tus cortes, notas y tu progreso en las tarjetas son solo tuyos.</p>
    <div class="row"><button class="sec" data-action="leaveShared" data-id="${m.id}">🚪 Salir de la materia</button></div>
  </div>`;
}
function docenteCard(m){
  const temas=state.temas.filter(t=>t.materiaId===m.id);
  const pub=temas.filter(t=>t.publicado).length;
  const unidos=nEstudiantes(m);
  const nEx=Object.keys(exMap[m.sharedId]||{}).length;
  return `<div class="card matCard">
    <h3>${esc(m.icon||'📘')} ${esc(m.name)}</h3>
    <p class="meta">${temas.length} tema${temas.length==1?'':'s'} · ${pub} publicado${pub==1?'':'s'} · ${unidos} estudiante${unidos==1?'':'s'} · ${nEx} examen${nEx==1?'':'es'}</p>
    <div class="row">
      <button class="sec" data-action="openMateria" data-id="${m.id}">Abrir →</button>
      <button class="icon-btn" data-action="renameMateria" data-id="${m.id}" title="Editar materia" aria-label="Editar materia ${esc(m.name)}">✏️</button>
      <button class="icon-btn" data-action="delMateria" data-id="${m.id}" title="Eliminar materia para todos" aria-label="Eliminar materia ${esc(m.name)} para todos">🗑️</button>
    </div>
  </div>`;
}
function viewDocenteHTML(){
  const mats=state.materias.filter(m=>m.rol==='docente');
  return `<div class="viewhead"><h1>👩‍🏫 Espacio docente</h1><button class="pr" data-action="createDocente">+ Crear materia</button></div>
    ${guiaHTML()}
    ${mats.length?`<div class="grid">${mats.map(docenteCard).join('')}</div>`
    :`<div class="empty">Aquí creas tus materias como docente: subes un PDF, la IA genera el tema y las tarjetas, tú los revisas y los publicas, e invitas a tus estudiantes por correo. Ellos las ven en su cuaderno, en solo lectura.</div>`}`;
}
/* ---------- Guía de primeros pasos ----------
   Una lista corta según el rol, que se marca sola a medida que la persona usa la app. Desaparece al completarla
   o al pulsar "Ocultar" (se guarda en el perfil, así no vuelve a salir en otro equipo). */
function pasosGuia(){
  if(esProfesor()){
    const mats=state.materias.filter(m=>m.rol==='docente'),ids=new Set(mats.map(m=>m.id));
    const temas=state.temas.filter(t=>ids.has(t.materiaId));
    return[
      {ok:mats.length>0,t:'Crea tu primera materia',d:'Con el botón «+ Crear materia» de arriba.'},
      {ok:temas.length>0,t:'Sube un PDF y deja que la IA arme el tema',d:'Dentro de la materia, en «Contenido». La IA hace el resumen, el esquema y las tarjetas.'},
      {ok:temas.some(t=>t.publicado),t:'Revisa y publica los temas',d:'Tus estudiantes solo ven los temas publicados (botón ✅ en cada tema).'},
      {ok:mats.some(m=>nEstudiantes(m)>0||(invitMap[m.sharedId]||[]).length>0),t:'Invita a tus estudiantes',d:'En la pestaña «Estudiantes»: con sus correos o con un código de clase.'},
      {ok:mats.some(m=>Object.keys(exMap[m.sharedId]||{}).length>0),t:'Crea tu primer examen',d:'En «Exámenes»: eliges los temas, revisas las preguntas y lo publicas.'}
    ];
  }
  return[
    {ok:state.materias.length>0,t:'Entra a la materia de tu profesor',d:'Acepta su invitación (te llega aquí arriba) o únete con el código que te dé.',accion:'joinSharedPrompt',btn:'🔗 Unirme con código'},
    {ok:state.cards.some(c=>c.last),t:'Repasa tus primeras tarjetas',d:'Abre una materia y entra a «Flashcards». Auren te recordará cuándo repasar cada una.'},
    {ok:(state.attempts||[]).length>0,t:'Pon a prueba lo que sabes',d:'Haz un quiz o un examen de práctica: si fallas, verás por qué.'},
    {ok:(state.progress.days||[]).length>0,t:'Cumple tu primer día de racha',d:'Responde '+META_RACHA+' preguntas en un día para encender la racha 🔥.'}
  ];
}
function guiaHTML(){
  if(state.profile.guiaOculta)return '';
  const pasos=pasosGuia(),hechos=pasos.filter(p=>p.ok).length;
  if(hechos===pasos.length)return '';
  const sig=pasos.findIndex(p=>!p.ok);
  const cuerpo=`<div class="guia"><div class="bar mini" style="margin:0 0 4px"><i style="width:${Math.round(hechos/pasos.length*100)}%"></i></div>
    <ol class="guiaPasos">${pasos.map((p,i)=>`<li class="${p.ok?'ok':i===sig?'sig':''}"><span class="gIco" aria-hidden="true">${p.ok?'✅':i===sig?'👉':'○'}</span><div><b>${esc(p.t)}</b>${p.ok?'<span class="sr">(hecho)</span>':''}${i===sig?`<div class="meta" style="margin:2px 0 0">${esc(p.d)}</div>${p.accion?`<button type="button" class="sec sm" style="margin-top:6px" data-action="${p.accion}">${p.btn}</button>`:''}`:''}</div></li>`).join('')}</ol>
    <button type="button" class="sec sm" data-action="guiaOcultar" style="margin-top:6px">Ocultar esta guía</button></div>`;
  return dwHTML('guia','Primeros pasos en Auren',hechos+' de '+pasos.length+' hechos · sigue: '+esc(pasos[sig].t),cuerpo,'👋');
}

/* En materias de docente, el estudiante no puede editar el contenido compartido */
function aplicarSoloLectura(){
  const m=route.view==='materiaDetail'?state.materias.find(x=>x.id===route.materiaId):null;
  if(!m||m.rol!=='estudiante')return;
  $('view').querySelectorAll('input[data-action^="editTema"],textarea[data-action^="editTema"],input[data-action^="editSec"],textarea[data-action^="editSec"],input[data-action^="editCard"],textarea[data-action^="editCard"]')
    .forEach(el=>{el.readOnly=true});
}

document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  const m=b.dataset.id?state.materias.find(x=>x.id===b.dataset.id):null;
  if(a==='createDocente')crearDocente();
  else if(a==='backDocente')goToView('docente');
  else if(a==='inviteStudents'&&m)invitarEstudiantes(m);
  else if(a==='classCodeNew'&&m)generarCodigoClase(m);
  else if(a==='classCodeOff'&&m)desactivarCodigoClase(m);
  else if(a==='classCodeCopy'&&m&&codigoClaseDe(m))copiar(codigoClaseDe(m),b);
  else if(a==='removeInvite'&&m)quitarInvitacion(m,b.dataset.inv);
  else if(a==='removeMember'&&m)quitarMiembro(m,b.dataset.uid);
  else if(a==='togglePublicar')publicarTema(b.dataset.id);
  else if(a==='publishAll'&&m)publicarTodos(m);
  else if(a==='acceptInvite')aceptarInvitacion(b.dataset.inv);
  else if(a==='declineInvite')rechazarInvitacion(b.dataset.inv);
  else if(a==='verifyEmail'){
    try{await auth.currentUser.sendEmailVerification();UI.alerta('Te enviamos un correo de verificación. Ábrelo y luego pulsa "Ya verifiqué".')}
    catch(err){console.error(err);UI.alerta('No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.')}
  }
  else if(a==='recheckVerified'){
    try{
      await auth.currentUser.reload();await auth.currentUser.getIdToken(true);
      if(auth.currentUser.emailVerified){escucharMisInvitaciones();render()}
      else UI.alerta('Todavía no aparece verificado. Abre el enlace del correo y vuelve a intentarlo.');
    }catch(err){console.error(err)}
  }
});


