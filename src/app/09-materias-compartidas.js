/* ======================================================================
   MATERIAS COMPARTIDAS
   Una materia compartida vive en Firestore como  temarios/{sharedId}
     - documento:           nombre, icono, dueño, miembros
     - subcolección temas:  un documento por tema (con sus tarjetas dentro)
   Cada persona conserva su propia copia local (m.sharedId la enlaza con el grupo).
   Es PERSONAL de cada quien: cortes, notas, calendario y si "sabía" una tarjeta.
   Es COMPARTIDO: temas, secciones, tarjetas y el autor / archivo de origen.
   ====================================================================== */
const SESION=uid();        // distingue mis escrituras de las de otras personas o dispositivos
const sharedLast={};       // temaId -> {sid,k}: último contenido sincronizado (evita reenviar lo que no cambió)
const sharedMeta={};       // sharedId -> datos del documento del grupo
const sharedUnsub={};      // sharedId -> funciones para dejar de escuchar
const sharedFirst={};      // sharedId -> true cuando ya llegó la primera lectura de temas
let pendingRender=false;

const refTemario=sid=>db.collection('temarios').doc(sid);
function miNombre(){
  const u=auth.currentUser;
  return String((state.profile&&state.profile.name)||(u&&u.displayName)||(u&&u.email&&u.email.split('@')[0])||'Alguien').trim();
}
function sharedMateria(materiaId){const m=state.materias.find(x=>x.id===materiaId);return m&&m.sharedId?m:null}
function nMiembros(m){const x=sharedMeta[m.sharedId];return x&&x.members?x.members.length:1}
function msgDelTema(id){
  const t=state.temas.find(x=>x.id===id);
  return t&&sharedMateria(t.materiaId)
    ?'Esta materia es compartida: el tema se eliminará para TODAS las personas del grupo. ¿Continuar?'
    :'¿Eliminar este tema y sus tarjetas?';
}

/* Contenido compartible de un tema (sin nada personal como corteId o "known") */
function contenidoTema(t){
  return{
    publicado:esDocenteMat(t.materiaId)?!!t.publicado:true,
    title:t.title||'',body:t.body||'',
    secciones:Array.isArray(t.secciones)?t.secciones:null,
    by:t.by||'',fuente:t.fuente||'',
    archivo:tieneOriginal(t.archivo)?t.archivo:null,
    medios:Array.isArray(t.medios)?t.medios:[],
    ...(esDocenteMat(t.materiaId)?{corte:((state.cortes.find(c=>c.id===t.corteId)||{}).name||'')}:{}),
    cards:state.cards.filter(c=>c.temaId===t.id).map(c=>{const o={id:c.id,front:c.front||'',back:c.back||''};if(Array.isArray(c.dist)&&c.dist.length)o.dist=c.dist;if(c.falsa)o.falsa=c.falsa;if(c.hueco)o.hueco=c.hueco;if(c.dif)o.dif=c.dif;if(c.exp)o.exp=c.exp;return o})
  };
}

/* ---------- Subir mis cambios ---------- */
let pushingShared=false,repushShared=false;
async function pushShared(){
  if(!currentUid)return;
  if(pushingShared){repushShared=true;return}
  pushingShared=true;
  try{
    let huboFallo=false;
    for(const m of state.materias.filter(x=>x.sharedId)){
      try{await pushSharedMateria(m,false)}
      catch(e){console.error('No se pudo sincronizar "'+m.name+'":',e);huboFallo=true;sync.falloMateria='⚠️ No se pudo sincronizar la materia compartida "'+esc(m.name)+'": '+esc(textoFalloSync(e));pintarBanner()}
    }
    if(!huboFallo&&sync.falloMateria){sync.falloMateria='';pintarBanner()}
  }finally{
    pushingShared=false;
    if(repushShared){repushShared=false;pushShared()}
  }
}
/* force=true solo al compartir una materia que ya existía: sube todo lo que hay antes de escuchar */
async function pushSharedMateria(m,force){
  const sid=m.sharedId;
  if(m.rol==='estudiante')return;              // el estudiante nunca escribe contenido
  if(!force&&!sharedFirst[sid])return;       // hasta no ver lo que ya hay en la nube, no se escribe nada
  if(m.rol==='docente'&&sharedMeta[sid]&&(sharedMeta[sid].name!==m.name||(sharedMeta[sid].icon||'')!==(m.icon||'')||(sharedMeta[sid].semestre||0)!==(m.semestre||0)||(sharedMeta[sid].curso||'')!==(m.curso||'')))
    await refTemario(sid).update({name:m.name,icon:m.icon||'📘',semestre:m.semestre||1,curso:m.curso||''});
  const base=refTemario(sid).collection('temas');
  const temas=state.temas.filter(t=>t.materiaId===m.id);
  const ids=new Set(temas.map(t=>t.id));
  const ops=[],hechos={},borrados=[];
  temas.forEach(t=>{
    const c=contenidoTema(t),k=JSON.stringify(c);
    if(sharedLast[t.id]&&sharedLast[t.id].k===k)return;
    const data=JSON.parse(JSON.stringify({...c,updatedAt:t.updatedAt||Date.now(),sess:SESION,editor:currentUid}));
    ops.push(b=>b.set(base.doc(t.id),data));
    hechos[t.id]=k;
  });
  Object.keys(sharedLast).forEach(id=>{
    if(sharedLast[id].sid===sid&&!ids.has(id)){ops.push(b=>b.delete(base.doc(id)));borrados.push(id)}
  });
  for(let i=0;i<ops.length;i+=400){
    const batch=db.batch();
    ops.slice(i,i+400).forEach(f=>f(batch));
    await batch.commit();
  }
  Object.keys(hechos).forEach(id=>{sharedLast[id]={sid,k:hechos[id]}});
  borrados.forEach(id=>delete sharedLast[id]);
}

/* ---------- Recibir cambios de otras personas ---------- */
function corteConNombre(materiaId,nombre){
  const n=String(nombre||'').trim().toLowerCase();
  let c=state.cortes.find(x=>x.materiaId===materiaId&&String(x.name||'').trim().toLowerCase()===n);
  if(!c){c={id:uid(),materiaId,name:String(nombre).trim(),weight:0,score:null};state.cortes.push(c)}
  return c.id;
}
function aplicarTemaRemoto(m,id,d){
  let t=state.temas.find(x=>x.id===id);
  if(!t){t={id,materiaId:m.id,corteId:null};state.temas.unshift(t)}
  t.materiaId=m.id;
  t.title=d.title||'';t.body=d.body||'';t.by=d.by||'';t.fuente=d.fuente||'';
  if(tieneOriginal(d.archivo))t.archivo=d.archivo;else delete t.archivo;
  t.medios=Array.isArray(d.medios)?d.medios:[];
  /* Materia de docente: el tema queda en el corte que el docente le puso (se busca por nombre; si no existe, se crea) */
  if(m.rol==='estudiante'&&d.corte)t.corteId=corteConNombre(m.id,d.corte);
  if(typeof d.publicado==='boolean')t.publicado=d.publicado;else delete t.publicado;
  if(Array.isArray(d.secciones))t.secciones=d.secciones;else delete t.secciones;
  t.updatedAt=d.updatedAt||Date.now();
  const viejas=new Map(state.cards.filter(c=>c.temaId===id).map(c=>[c.id,c]));
  state.cards=state.cards.filter(c=>c.temaId!==id);
  (d.cards||[]).forEach(c=>{
    const v=viejas.get(c.id)||{},n={id:c.id,temaId:id,materiaId:m.id,front:c.front||'',back:c.back||'',known:v.known===undefined?null:v.known};
    ['box','due','last','lastOk','fails'].forEach(k=>{if(v[k]!==undefined)n[k]=v[k]});      // mi progreso de repaso es solo mío: no se pierde cuando el profesor cambia el tema
    if(Array.isArray(c.dist)&&c.dist.length)n.dist=c.dist;if(c.falsa)n.falsa=c.falsa;if(c.hueco)n.hueco=c.hueco;if(c.dif)n.dif=c.dif;if(c.exp)n.exp=c.exp;
    state.cards.push(n);
  });
  sharedLast[id]={sid:m.sharedId,k:JSON.stringify(contenidoTema(t))};
}
function quitarTemaLocal(id){
  state.temas=state.temas.filter(t=>t.id!==id);
  state.cards=state.cards.filter(c=>c.temaId!==id);
  delete sharedLast[id];
}
/* Repinta sin interrumpir: si estoy escribiendo, espera a que suelte el campo */
function renderSeguro(){
  if(!['materias','materiaDetail','perfil','docente','logros','docResultados','examenDoc','calendario'].includes(route.view))return;
  const a=document.activeElement;
  if(a&&a.matches&&a.matches('textarea,input,select')&&$('view').contains(a)){pendingRender=true;return}
  render(true);
}
document.addEventListener('focusout',()=>{
  if(!pendingRender)return;
  setTimeout(()=>{
    const a=document.activeElement;
    if(a&&a.matches&&a.matches('textarea,input,select')&&$('view').contains(a))return;
    pendingRender=false;renderSeguro();
  },150);
});

function escucharCompartida(m){
  const sid=m.sharedId;
  if(!sid||sharedUnsub[sid])return;
  const fallo=err=>{
    console.error('Materia compartida:',err);
    if(err&&(err.code==='permission-denied'||err.code==='not-found'))
      desvincularCompartida(sid,'Ya no tienes acceso a la materia compartida "'+m.name+'". Conservas una copia en tu cuaderno que ya no se sincroniza.');
  };
  const u1=refTemario(sid).onSnapshot(snap=>{
    if(!snap.exists||(snap.data()||{}).eliminado){
      desvincularCompartida(sid,'La materia compartida "'+m.name+'" fue eliminada por quien la creó. Conservas una copia en tu cuaderno que ya no se sincroniza.');
      return;
    }
    sharedMeta[sid]=snap.data();
    const loc=state.materias.find(x=>x.sharedId===sid);
    if(loc&&loc.rol==='estudiante'&&(loc.name!==sharedMeta[sid].name||loc.icon!==sharedMeta[sid].icon||(loc.semestre||0)!==(sharedMeta[sid].semestre||0)||(loc.curso||'')!==(sharedMeta[sid].curso||''))){loc.name=sharedMeta[sid].name;loc.icon=sharedMeta[sid].icon||'📘';loc.semestre=sharedMeta[sid].semestre;loc.curso=sharedMeta[sid].curso;saveLocal()}
    renderSeguro();
  },fallo);
  const colTemas=refTemario(sid).collection('temas');
  const u2=(m.rol==='estudiante'?colTemas.where('publicado','==',true):colTemas).onSnapshot(snap=>{
    const mat=state.materias.find(x=>x.sharedId===sid);
    if(!mat)return;
    let cambio=false;
    if(!sharedFirst[sid]){
      /* Primera lectura: lo que hay en la nube manda. Se descarta lo local que ya no existe allá. */
      const remotos=new Set(snap.docs.map(d=>d.id));
      const viejos=state.temas.filter(t=>t.materiaId===mat.id&&!remotos.has(t.id)).map(t=>t.id);
      viejos.forEach(quitarTemaLocal);
      snap.docs.forEach(d=>aplicarTemaRemoto(mat,d.id,d.data()));
      sharedFirst[sid]=true;cambio=true;
    }else{
      snap.docChanges().forEach(ch=>{
        if(ch.doc.metadata.hasPendingWrites)return;                    // es mi propio cambio todavía en camino
        if(ch.type==='removed'){
          if(sharedMeta[sid]&&sharedMeta[sid].eliminado)return;        // el grupo se está borrando: conservo mi copia
          quitarTemaLocal(ch.doc.id);cambio=true;
        }else{
          const d=ch.doc.data();
          if(d.sess===SESION)return;                                   // lo escribí yo en esta sesión
          aplicarTemaRemoto(mat,ch.doc.id,d);cambio=true;
        }
      });
    }
    if(cambio){ensureCortes();saveLocal();renderSeguro()}
    if(mat.rol==='estudiante')anunciarNuevos(mat,'tema',snap.docs.map(d=>({id:d.id,titulo:d.data().title||'Sin título'})));
  },fallo);
  sharedUnsub[sid]=[u1,u2];
  if(m.rol==='docente')sharedUnsub[sid].push(escucharInvitaciones(sid));
  if(m.rol==='docente'||m.rol==='estudiante')escucharExamenes(m).forEach(f=>sharedUnsub[sid].push(f));
  if(m.rol==='docente'||m.rol==='estudiante')sharedUnsub[sid].push(escucharEventos(m));
}
function detener(sid){
  (sharedUnsub[sid]||[]).forEach(f=>{try{f()}catch(e){}});
  delete sharedUnsub[sid];delete sharedFirst[sid];delete sharedMeta[sid];delete invitMap[sid];limpiarExamenes(sid);
}
function olvidarTemas(sid){Object.keys(sharedLast).forEach(id=>{if(sharedLast[id].sid===sid)delete sharedLast[id]})}
function startShared(){stopShared();state.materias.filter(m=>m.sharedId).forEach(escucharCompartida)}
function stopShared(){
  Object.keys(sharedUnsub).forEach(detener);Object.keys(sharedLast).forEach(k=>delete sharedLast[k]);
  if(invitesUnsub){invitesUnsub();invitesUnsub=null}
  invitesPend=[];
}

/* La materia deja de estar enlazada al grupo pero la copia local se conserva */
function desvincularCompartida(sid,aviso){
  detener(sid);olvidarTemas(sid);
  state.materias.forEach(m=>{if(m.sharedId===sid)hacerLocal(m)});
  saveLocal();scheduleCloud();renderSeguro();
  if(aviso)setTimeout(()=>UI.alerta(aviso),50);
}

/* ---------- Crear, compartir, unirse, salir ---------- */
/* Formulario único para crear o editar una materia: nombre, emoji y color */
/* ---------- Carpetas del estudiante: crear, editar, mover materias y borrar sin perder nada ---------- */
async function formCarpeta(titulo,cur){
  const r=await UI.preguntar(titulo,[
    {k:'n',l:'Nombre',v:cur?cur.name:'',ph:'Ej. Primer semestre, 2026-1, Electivas',max:60},
    {k:'i',l:'Emoji (opcional)',v:cur?iconCarpeta(cur):'📁',max:4}
  ],{ok:'Guardar'});
  if(!r||!String(r.n).trim())return null;
  return {name:String(r.n).trim().slice(0,60),icon:String(r.i||'').trim()||'📁'};
}
async function moverMateria(materiaId){
  const m=state.materias.find(x=>x.id===materiaId);
  if(!m||m.rol==='docente')return;
  const sems=state.semesters.filter(x=>!x.oculto);
  const NUEVA='__nueva__';
  const r=await UI.preguntar('Mover «'+m.name+'»',[
    {k:'d',l:'Carpeta de destino',t:'select',v:m.semesterId,o:sems.map(x=>[x.id,iconCarpeta(x)+' '+x.name]).concat([[NUEVA,'＋ Nueva carpeta…']])}
  ],{ok:'Mover'});
  if(!r)return;
  let destino=r.d;
  if(destino===NUEVA){
    const f=await formCarpeta('Nueva carpeta');
    if(!f)return;
    destino=uid();
    const nueva={id:destino,name:f.name,icon:f.icon};
    mutate(s=>{s.semesters.push(nueva);const x=s.materias.find(y=>y.id===materiaId);if(x)x.semesterId=destino});
    return;
  }
  if(destino===m.semesterId||!sems.some(x=>x.id===destino))return;
  mutate(s=>{const x=s.materias.find(y=>y.id===materiaId);if(x)x.semesterId=destino});
}
/* Devuelve: null = cancelar · '' = borrar la carpeta con todo su contenido · id = mover sus materias a esa carpeta */
async function destinoAlBorrarCarpeta(semId){
  const sem=state.semesters.find(x=>x.id===semId);if(!sem)return null;
  const n=state.materias.filter(m=>m.semesterId===semId).length;
  const otras=state.semesters.filter(x=>!x.oculto&&x.id!==semId);
  if(!n)return (await UI.confirmar('¿Eliminar la carpeta «'+sem.name+'»? Está vacía.'))?'':null;
  if(!otras.length)return (await UI.confirmar('¿Eliminar la carpeta «'+sem.name+'» y '+(n===1?'su materia':'sus '+n+' materias')+' (con temas, cortes y tarjetas)? Esta acción no se puede deshacer.'))?'':null;
  const BORRAR='__borrar__',una=n===1,sus=una?'su materia':'sus '+n+' materias';
  const r=await UI.preguntar('Eliminar «'+sem.name+'»',[
    {k:'d',l:'¿Qué hacemos con '+sus+'?',t:'select',v:otras[0].id,
      o:otras.map(x=>[x.id,(una?'Moverla':'Moverlas')+' a '+iconCarpeta(x)+' '+x.name]).concat([[BORRAR,(una?'Eliminarla':'Eliminarlas')+' también (no se puede deshacer)']])}
  ],{ok:'Eliminar carpeta',peligro:true});
  if(!r)return null;
  if(r.d!==BORRAR)return otras.some(x=>x.id===r.d)?r.d:null;
  return (await UI.confirmar('¿Eliminar también '+sus+' con temas, cortes y tarjetas? Esta acción no se puede deshacer.'))?'':null;
}
async function formMateria(titulo,cur,ph,docente){
  const campos=[
    {k:'n',l:'Nombre',v:cur?cur.name:'',ph:ph||'',max:80},
    {k:'i',l:'Emoji (opcional)',v:cur?cur.icon:'📘',max:4},
    {k:'c',l:'Color',t:'color',v:cur?matColor(cur):MAT_COLORS[state.materias.length%MAT_COLORS.length]}
  ];
  /* Materia de un profesor: a qué semestre y curso va dirigida (no es lo mismo un estudiante de 5.º que uno de 2.º) */
  if(docente)campos.push(
    {k:'sem',l:'Semestre al que va dirigida',t:'select',v:String((cur&&cur.semestre)||1),o:Array.from({length:12},(_,i)=>[String(i+1),'Semestre '+(i+1)])},
    {k:'curso',l:'Curso o grupo',v:cur&&cur.curso||'',ph:'Ej. A, Grupo 2, Nocturno',max:40});
  const r=await UI.preguntar(titulo,campos,{ok:'Guardar'});
  if(!r||!String(r.n).trim())return null;
  const base={name:String(r.n).trim(),icon:String(r.i||'').trim()||'📘',color:/^#[0-9a-f]{6}$/i.test(r.c)?r.c:null};
  if(docente){base.semestre=Math.max(1,Math.min(12,parseInt(r.sem)||1));base.curso=String(r.curso||'').trim().slice(0,40)}
  return base;
}
function semPorNumero(s,n){
  const nombre='Semestre '+n;
  let x=s.semesters.find(v=>String(v.name).trim().toLowerCase()===nombre.toLowerCase());
  if(!x){x={id:uid(),name:nombre};s.semesters.push(x)}
  return x;
}
async function crearCompartida(semId){
  if(!esProfesor()){UI.alerta('Por ahora solo los profesores pueden crear materias.');return}
  const f=await formMateria('Nueva materia compartida',null,'Ej. Ética con Santiago');
  if(!f)return;
  const name=f.name,icon=f.icon;
  const ref=db.collection('temarios').doc();
  try{
    await ref.set({name:name.trim(),icon,ownerUid:currentUid,members:[currentUid],
      memberNames:{[currentUid]:miNombre()},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){console.error(e);UI.alerta('No se pudo crear la materia compartida. Revisa las reglas de Firestore y tu conexión.');return}
  mutate(s=>s.materias.push({id:uid(),name:name.trim(),icon,color:f.color||undefined,semesterId:semId,refs:'',sharedId:ref.id}));
  const m=state.materias.find(x=>x.sharedId===ref.id);
  escucharCompartida(m);
  route={view:'materiaDetail',materiaId:m.id};render();
}
async function compartirMateria(m){
  if(m.sharedId)return;
  const ref=db.collection('temarios').doc();
  try{
    await ref.set({name:m.name,icon:m.icon||'📘',ownerUid:currentUid,members:[currentUid],
      memberNames:{[currentUid]:miNombre()},createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    m.sharedId=ref.id;
    await pushSharedMateria(m,true);            // sube los temas que ya tenías antes de empezar a escuchar
  }catch(e){
    console.error(e);delete m.sharedId;olvidarTemas(ref.id);
    UI.alerta('No se pudo compartir la materia. Revisa las reglas de Firestore y tu conexión.');return;
  }
  persist();escucharCompartida(m);render(true);
}
async function unirseCompartida(codigo){
  codigo=String(codigo||'').trim();
  const enlace=codigo.match(/[?&]unirse=([A-Za-z0-9]+)/);if(enlace)codigo=enlace[1];
  if(!/^[A-Za-z0-9]{10,40}$/.test(codigo)){UI.alerta('Ese código no es válido. Pídele a tu compañero que te lo envíe de nuevo.');return}
  const ya=state.materias.find(x=>x.sharedId===codigo);
  if(ya){route={view:'materiaDetail',materiaId:ya.id};render();return}
  try{
    const ref=refTemario(codigo),F=firebase.firestore.FieldValue;
    await ref.update({members:F.arrayUnion(currentUid),['memberNames.'+currentUid]:miNombre()});
    const d=(await ref.get()).data();
    mutate(s=>{
      const sm=(d.tipo==='docente'&&d.semestre)?semPorNumero(s,d.semestre):semVisible(s);       // la materia queda en el semestre que definió el profesor
      s.materias.push({id:uid(),name:d.name,icon:d.icon||'📘',semestre:d.semestre,curso:d.curso,semesterId:sm.id,refs:'',sharedId:codigo});
    });
    const m=state.materias.find(x=>x.sharedId===codigo);
    escucharCompartida(m);
    route={view:'materiaDetail',materiaId:m.id};render();
  }catch(e){
    console.error(e);
    UI.alerta('No encontré esa materia compartida o no tienes permiso para entrar. Revisa que el código esté completo.');
  }
}
async function abandonarCompartida(m,opts){
  opts=opts||{};
  const sid=m.sharedId;if(!sid)return;
  const eraDocente=m.rol==='docente';
  const meta=sharedMeta[sid]||{};
  const soyDueno=meta.ownerUid===currentUid;
  const soyUltimo=Array.isArray(meta.members)&&meta.members.length<=1;
  detener(sid);olvidarTemas(sid);
  hacerLocal(m);                                // desde aquí ya no se sincroniza nada de esta materia
  try{
    if((opts.todos&&soyDueno)||soyUltimo){
      const ref=refTemario(sid);
      if(!soyUltimo){                           // avisa primero para que los demás conserven su copia
        await ref.update({eliminado:true});
        await new Promise(r=>setTimeout(r,1500));
      }
      const qs=await ref.collection('temas').get();
      for(const d of qs.docs){const ar=(d.data()||{}).archivo;if(tieneOriginal(ar))await borrarOriginalNube(sid,d.id,ar.partes,ar);const md=(d.data()||{}).medios;if(Array.isArray(md)&&md.length)await borrarMediosNube(sid,{id:d.id,medios:md})}
      for(let i=0;i<qs.docs.length;i+=400){
        const b=db.batch();qs.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();
      }
      if(eraDocente)await borrarInvitaciones(sid);
      await ref.delete();
    }else{
      const F=firebase.firestore.FieldValue;
      await refTemario(sid).update({members:F.arrayRemove(currentUid),['memberNames.'+currentUid]:F.delete()});
    }
  }catch(e){
    console.error(e);
    if(!opts.silent)UI.alerta('Saliste de la materia en tu cuaderno, pero no se pudo avisar a la nube: '+e.message);
  }
}
async function procesarUnirsePendiente(){
  let c=null;
  try{c=sessionStorage.getItem('unirse');sessionStorage.removeItem('unirse')}catch(e){}
  if(c&&await UI.confirmar('Te invitaron a una materia compartida. ¿Quieres unirte?'))unirseCompartida(c);
}
/* Enlace de invitación: tuapp.netlify.app/?unirse=CODIGO (se guarda hasta que la persona inicie sesión) */
try{
  const p=new URLSearchParams(location.search).get('unirse');
  if(p){sessionStorage.setItem('unirse',p);history.replaceState(null,'',location.pathname)}
}catch(e){}

/* ---------- Interfaz ---------- */
function compartidoBoxHTML(m){
  if(!m.sharedId){
    return `<div class="card shareBox" style="margin-top:14px">
      <b style="font-size:.9em">🤝 Estudiar con otras personas</b>
      <p class="meta" style="margin:4px 0 0">Comparte esta materia con tus compañeros: todos pueden subir archivos y editar temas y tarjetas, y el grupo ve los cambios al instante. Tus cortes y notas siguen siendo solo tuyos.</p>
      <button class="sec" style="margin-top:10px" data-action="shareMateria" data-id="${m.id}">🤝 Compartir esta materia</button>
    </div>`;
  }
  const meta=sharedMeta[m.sharedId];
  if(!meta)return `<div class="card shareBox" style="margin-top:14px"><b style="font-size:.9em">🤝 Materia compartida</b><p class="meta" style="margin:4px 0 0">Conectando con el grupo…</p></div>`;
  const dueno=meta.ownerUid===currentUid;
  const nombres=(meta.members||[]).map(id=>{
    const n=(meta.memberNames||{})[id]||'Alguien';
    return `<span class="chip">${id===currentUid?'⭐ Tú':'👤 '+esc(n)}${id===meta.ownerUid?' · creó':''}</span>`;
  }).join('');
  return `<div class="card shareBox" style="margin-top:14px">
    <b style="font-size:.9em">🤝 Materia compartida · ${(meta.members||[]).length} persona${(meta.members||[]).length==1?'':'s'}</b>
    <div class="members">${nombres}</div>
    <p class="meta" style="margin:0">Para invitar a alguien, envíale el enlace (o el código). Tiene que iniciar sesión para entrar. Quien tenga el código puede unirse, así que compártelo solo con tu grupo.</p>
    <p class="meta" style="margin:6px 0 0">Código: <code>${esc(m.sharedId)}</code></p>
    <div class="row">
      <button class="sec" data-action="copyInvite" data-id="${m.id}">🔗 Copiar enlace</button>
      <button class="sec" data-action="copyCode" data-id="${m.id}">📋 Copiar código</button>
      <button class="sec" data-action="leaveShared" data-id="${m.id}">🚪 Salir del grupo</button>
      ${dueno?`<button class="sec" data-action="deleteShared" data-id="${m.id}">🗑️ Eliminar para todos</button>`:''}
    </div>
  </div>`;
}
async function copiar(texto,btn){
  const viejo=btn.textContent;
  try{await navigator.clipboard.writeText(texto);btn.textContent='✓ Copiado';setTimeout(()=>{btn.textContent=viejo},1500)}
  catch(e){await UI.prompt('Copia esto:',texto)}
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  const m=b.dataset.id?state.materias.find(x=>x.id===b.dataset.id):null;
  if(a==='createShared')crearCompartida(b.dataset.sem);
  else if(a==='joinSharedPrompt'){const c=await UI.prompt('Pega el código o el enlace de invitación:');if(c)unirseCompartida(c)}
  else if(a==='shareMateria'&&m)compartirMateria(m);
  else if(a==='copyInvite'&&m)copiar(location.origin+location.pathname+'?unirse='+m.sharedId,b);
  else if(a==='copyCode'&&m)copiar(m.sharedId,b);
  else if(a==='leaveShared'&&m){
    if(await UI.confirmar('¿Salir de esta materia compartida? Conservas una copia en tu cuaderno, pero ya no se sincroniza con el grupo.')){
      await abandonarCompartida(m);persist();render();
    }
  }
  else if(a==='deleteShared'&&m){
    if(await UI.confirmar('¿Eliminar la materia compartida para TODAS las personas? Cada quien conservará una copia en su cuaderno, pero el grupo dejará de existir.')){
      await abandonarCompartida(m,{todos:true});persist();render();
    }
  }
});


