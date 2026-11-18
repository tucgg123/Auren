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
async function borrarInvitaciones(sid){
  const qs=await db.collection('invitaciones').where('sid','==',sid).where('ownerUid','==',currentUid).get();
  for(let i=0;i<qs.docs.length;i+=400){
    const b=db.batch();qs.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();
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
async function aceptarInvitacion(invId){
  const inv=invitesPend.find(x=>x.id===invId);if(!inv)return;
  try{
    const ref=refTemario(inv.sid),F=firebase.firestore.FieldValue;
    await ref.update({members:F.arrayUnion(currentUid),['memberNames.'+currentUid]:miNombre()});
    await db.collection('invitaciones').doc(invId).update({estado:'aceptada',uid:currentUid,nombre:miNombre()});
    const d=(await ref.get()).data();
    if(!state.materias.some(x=>x.sharedId===inv.sid)){
      mutate(s=>s.materias.push({id:uid(),name:d.name,icon:d.icon||'📘',semesterId:semVisible(s).id,refs:'',sharedId:inv.sid,rol:'estudiante'}));
    }
    const m=state.materias.find(x=>x.sharedId===inv.sid);
    escucharCompartida(m);
    route={view:'materiaDetail',materiaId:m.id};render();
  }catch(e){console.error(e);UI.alerta('No se pudo aceptar la invitación'+detalleError(e)+'. Inténtalo de nuevo.')}
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
  const invs=invitMap[m.sharedId]||[];
  const unidos=invs.filter(i=>i.estado==='aceptada').length;
  const nEx=Object.keys(exMap[m.sharedId]||{}).length;
  return `<div class="card matCard">
    <h3>${esc(m.icon||'📘')} ${esc(m.name)}</h3>
    <p class="meta">${temas.length} tema${temas.length==1?'':'s'} · ${pub} publicado${pub==1?'':'s'} · ${unidos} estudiante${unidos==1?'':'s'} · ${nEx} examen${nEx==1?'':'es'}</p>
    <div class="row">
      <button class="sec" data-action="openMateria" data-id="${m.id}">Abrir →</button>
      <button class="icon-btn" data-action="renameMateria" data-id="${m.id}" title="Editar materia">✏️</button>
      <button class="icon-btn" data-action="delMateria" data-id="${m.id}" title="Eliminar materia para todos">🗑️</button>
    </div>
  </div>`;
}
function viewDocenteHTML(){
  const mats=state.materias.filter(m=>m.rol==='docente');
  return `<div class="viewhead"><h1>👩‍🏫 Espacio docente</h1><button class="pr" data-action="createDocente">+ Crear materia</button></div>
    ${mats.length?`<div class="grid">${mats.map(docenteCard).join('')}</div>`
    :`<div class="empty">Aquí creas tus materias como docente: subes un PDF, la IA genera el tema y las tarjetas, tú los revisas y los publicas, e invitas a tus estudiantes por correo. Ellos las ven en su cuaderno, en solo lectura.</div>`}`;
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
  else if(a==='removeInvite'&&m)quitarInvitacion(m,b.dataset.inv);
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


