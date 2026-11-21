/* ======================================================================
   RACHAS DE LOS ESTUDIANTES PARA PROFESORES Y ADMIN
   La racha vive en el cuaderno privado de cada estudiante (users/{uid}), que nadie más puede leer. Para que su
   profesor y los admin la vean, el propio estudiante publica un resumen pequeño:
     rachas/{uid}                    → lo leen el estudiante y los admin (los admin ven a todos)
     temarios/{sid}/rachas/{uid}     → una copia por cada materia de docente en la que está; la lee el docente dueño
   Las reglas de Firestore exigen que solo el propio estudiante escriba su resumen, que sea miembro de la materia y
   que el correo sea el de su sesión. El docente solo puede leer los de SUS materias; un admin, todos.
   Campos: nombre, email, dias (últimos 400 días con racha, AAAA-MM-DD), mejor, totalDias, xp, nivel, actualizado.
   La racha actual se calcula al mostrarla (con el día de gracia), así no queda vieja si el estudiante deja de entrar.
   ====================================================================== */
const RACHA_DIAS_MAX=400;
let rachaSesion=false;                 // true cuando ya se sabe el rol de la cuenta (evita publicar con un rol viejo)
const rachaPub=new Map();              // ruta → JSON ya publicado en esta sesión
let rachaPublicando=false,rachaOtraVez=false;

function resumenRacha(){
  const p=state.progress||{},dias=[...new Set(p.days||[])].sort();
  let nv={xp:0,nivel:1};try{nv=nivelDe()}catch(e){}
  return{
    nombre:miNombre().slice(0,120),
    email:String((auth.currentUser&&auth.currentUser.email)||''),
    dias:dias.slice(-RACHA_DIAS_MAX),
    mejor:Math.round(Math.max(mejorRacha(dias),rachaActual(dias))||0),
    totalDias:dias.length,
    xp:Math.max(0,Math.round(nv.xp||0)),
    nivel:Math.max(1,Math.round(nv.nivel||1))
  };
}
/* Publica el resumen solo si cambió (o si es la primera vez en esta sesión). Solo lo hacen los estudiantes. */
async function publicarRacha(){
  if(!rachaSesion||!currentUid||esProfesor()||!auth.currentUser)return;
  if(rachaPublicando){rachaOtraVez=true;return}
  rachaPublicando=true;
  const uidAhora=currentUid;
  try{
    const r=resumenRacha(),json=JSON.stringify(r);
    const destinos=[db.collection('rachas').doc(uidAhora)];
    state.materias.filter(m=>m.sharedId&&m.rol==='estudiante').forEach(m=>destinos.push(refTemario(m.sharedId).collection('rachas').doc(uidAhora)));
    const datos={...r,actualizado:firebase.firestore.FieldValue.serverTimestamp()};
    await Promise.all(destinos.filter(ref=>rachaPub.get(ref.path)!==json).map(ref=>
      ref.set(datos).then(()=>rachaPub.set(ref.path,json)).catch(e=>console.warn('No se pudo publicar la racha en',ref.path,e))));
  }finally{
    rachaPublicando=false;
    if(rachaOtraVez&&currentUid===uidAhora){rachaOtraVez=false;publicarRacha()}
  }
}
function iniciarRachaPublica(){rachaSesion=true;rachaPub.clear();publicarRacha()}
function detenerRachaPublica(){rachaSesion=false;rachaPub.clear();Object.keys(rachasMat).forEach(k=>delete rachasMat[k]);adminRachas=null;adminTab='cuentas'}
/* Al salirse de una materia de docente, el estudiante borra su resumen de esa materia */
async function borrarRachaMateria(sid){
  if(!currentUid||!sid)return;
  const ref=refTemario(sid).collection('rachas').doc(currentUid);
  rachaPub.delete(ref.path);
  try{await ref.delete()}catch(e){console.warn('No se pudo borrar la racha de la materia:',e)}
}

/* ---------- Cálculos para mostrar y exportar ---------- */
function filaRacha(uid,nombre,email,d){
  const hoyN=numDia(fechaLocal(new Date()));
  if(!d)return{uid,nombre:nombre||'Estudiante',email:email||'',sinDatos:true,racha:0,mejor:0,total:0,ult7:0,ult30:0,ultimo:'',hoy:false,xp:0,nivel:0,dias:new Set()};
  const dias=Array.isArray(d.dias)?d.dias.filter(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)):[];
  const nums=dias.map(numDia),racha=rachaActual(dias),ultimo=dias.length?dias.slice().sort().pop():'';
  return{uid,nombre:d.nombre||nombre||'Estudiante',email:d.email||email||'',sinDatos:false,racha,
    mejor:Math.max(+d.mejor||0,racha),total:Math.max(+d.totalDias||0,dias.length),
    ult7:nums.filter(n=>n>hoyN-7&&n<=hoyN).length,ult30:nums.filter(n=>n>hoyN-30&&n<=hoyN).length,
    ultimo,hoy:dias.includes(fechaLocal(new Date())),xp:+d.xp||0,nivel:+d.nivel||1,dias:new Set(dias),
    actualizado:ms(d.actualizado)};
}
const ordenRachas=(a,b)=>(a.sinDatos-b.sinDatos)||(b.racha-a.racha)||(b.ult30-a.ult30)||String(a.nombre).localeCompare(String(b.nombre));
function fmtDia(s){if(!s)return '';const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})}
function ultimosDias(n){const out=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);out.push({s:fechaLocal(d),dia:d.toLocaleDateString('es',{weekday:'narrow'}),corto:d.toLocaleDateString('es',{day:'numeric',month:'short'})})}return out}

function tablaRachasHTML(filas,vacio){
  if(!filas.length)return `<p class="meta">${vacio}</p>`;
  const semana=ultimosDias(7);
  const conDatos=filas.filter(f=>!f.sinDatos),activos=conDatos.filter(f=>f.racha>0).length,hoy=conDatos.filter(f=>f.hoy).length;
  const prom=conDatos.length?Math.round(conDatos.reduce((s,f)=>s+f.racha,0)/conDatos.length*10)/10:0;
  return `<div class="pgs rachaRes"><div><b>${activos}</b>con racha activa</div><div><b>${hoy}</b>estudiaron hoy</div><div><b>${prom.toLocaleString('es')}</b>racha promedio</div></div>
  <div class="rachaScroll" tabindex="0" role="region" aria-label="Rachas de los estudiantes"><table class="rachaTabla">
    <thead><tr><th scope="col">Estudiante</th><th scope="col">Racha</th><th scope="col">Mejor</th><th scope="col">Últimos 7 días</th><th scope="col" title="Días con racha en los últimos 30 días">30 días</th><th scope="col">Total</th><th scope="col">Último día</th></tr></thead>
    <tbody>${filas.map(f=>`<tr class="${f.sinDatos?'sinDatos':''}"><th scope="row"><b>${esc(f.nombre)}</b>${f.email?`<span class="meta">${esc(f.email)}</span>`:''}</th>
      ${f.sinDatos?`<td colspan="6" class="meta">Sin datos todavía: aparecerán cuando abra Auren con la versión nueva.</td>`
      :`<td><b>🔥 ${f.racha}</b>${f.hoy?' <span class="chip chipOk">hoy ✓</span>':''}</td><td>${f.mejor}</td>
      <td><span class="miniStrip" aria-label="${semana.filter(d=>f.dias.has(d.s)).length} de 7 días">${semana.map(d=>`<span class="dot ${f.dias.has(d.s)?'on':''}" title="${d.corto}">${d.dia}</span>`).join('')}</span></td>
      <td>${f.ult30}</td><td>${f.total}</td><td>${f.ultimo?esc(fmtDia(f.ultimo)):'—'}</td>`}</tr>`).join('')}</tbody>
  </table></div>
  <p class="meta" style="margin-top:8px">La racha cuenta los días en que el estudiante respondió ${META_RACHA} preguntas (Quiz, Modo examen o tus exámenes), con 1 día de gracia por semana.</p>`;
}

/* ---------- Excel ---------- */
async function descargarRachasXlsx(filas,titulo,archivo){
  const n=filas.length,fin=n+1,dias30=ultimosDias(30);
  const hoja1=[['Estudiante','Correo','Racha actual (días)','Mejor racha','Días con racha (últimos 7)','Días con racha (últimos 30)','Total de días con racha','Último día de estudio','¿Estudió hoy?','Nivel','XP','Estado']];
  filas.forEach(f=>hoja1.push([{v:f.nombre,s:'txt'},{v:f.email,s:'txt'},
    {v:f.sinDatos?'':f.racha,s:'int'},{v:f.sinDatos?'':f.mejor,s:'int'},{v:f.sinDatos?'':f.ult7,s:'int'},{v:f.sinDatos?'':f.ult30,s:'int'},
    {v:f.sinDatos?'':f.total,s:'int'},{v:f.ultimo?fmtDia(f.ultimo):'',s:'txtc'},{v:f.sinDatos?'':(f.hoy?'Sí':'No'),s:'txtc'},
    {v:f.sinDatos?'':f.nivel,s:'int'},{v:f.sinDatos?'':f.xp,s:'int'},
    {v:f.sinDatos?'Sin datos':f.racha>0?'Racha activa':'Sin racha',s:'txtc'}]));
  if(n){
    const cd=filas.filter(f=>!f.sinDatos),rg=c=>c+'2:'+c+fin;
    hoja1.push([]);
    [['Estudiantes',{v:n,f:'COUNTA('+rg('A')+')',s:'sint'}],
     ['Con racha activa',{v:cd.filter(f=>f.racha>0).length,f:'COUNTIF('+rg('L')+',"Racha activa")',s:'sint'}],
     ['Estudiaron hoy',{v:cd.filter(f=>f.hoy).length,f:'COUNTIF('+rg('I')+',"Sí")',s:'sint'}],
     ['Racha promedio',{v:promedioDe(cd.map(f=>f.racha)),f:'IFERROR(AVERAGE('+rg('C')+'),"")',s:'sdec'}],
     ['Racha más alta',{v:cd.length?Math.max(...cd.map(f=>f.racha)):'',f:'IF(COUNT('+rg('C')+')>0,MAX('+rg('C')+'),"")',s:'sint'}],
     ['Promedio de días con racha (últimos 30)',{v:promedioDe(cd.map(f=>f.ult30)),f:'IFERROR(AVERAGE('+rg('F')+'),"")',s:'sdec'}]
    ].forEach(x=>hoja1.push([{v:x[0],s:'lbl'},x[1]]));
  }
  const ultCol=colLetra(1+dias30.length),colTot=colLetra(2+dias30.length);
  const hoja2=[['Estudiante','Correo',...dias30.map(d=>d.corto),'Total']];
  filas.forEach((f,i)=>{const rr=i+2;hoja2.push([{v:f.nombre,s:'txt'},{v:f.email,s:'txt'},...dias30.map(d=>({v:f.dias.has(d.s)?'✓':'',s:'txtc'})),
    {v:dias30.filter(d=>f.dias.has(d.s)).length,f:'COUNTIF(C'+rr+':'+ultCol+rr+',"✓")',s:'int'}])});
  const blob=await crearXlsx([
    {nombre:'Rachas',filas:hoja1,anchos:[28,30,12,10,14,14,13,18,11,8,9,14],congelar:{x:1,y:1},filtro:n?'A1:L'+fin:'',cf:n?[cfRoja('C2:C'+fin,'AND(ISNUMBER(C2),C2=0)')]:[]},
    {nombre:'Últimos 30 días',filas:hoja2,anchos:[28,30,...dias30.map(()=>7),8],congelar:{x:2,y:1},filtro:n?'A1:'+colTot+fin:''}
  ]);
  bajarBlob(blob,nombreArchivo(titulo,archivo));
}

/* ---------- Docente: pestaña "Rachas" de una materia ---------- */
const rachasMat={};                    // sid → {cargando, datos:{uid:doc}, error}
async function cargarRachasMateria(m){
  const sid=m.sharedId;if(!sid)return;
  const st=rachasMat[sid]=rachasMat[sid]||{datos:null};
  if(st.cargando)return;
  st.cargando=true;st.error='';
  try{
    const s=await refTemario(sid).collection('rachas').get();
    st.datos={};s.docs.forEach(d=>{st.datos[d.id]=d.data()});
  }catch(e){console.error(e);st.error='No se pudieron leer las rachas'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?';st.datos=st.datos||{}}
  st.cargando=false;
  render(true);
}
function filasRachaMateria(m){
  const sid=m.sharedId,meta=sharedMeta[sid]||{},inv=invitMap[sid]||[],st=rachasMat[sid]||{},datos=st.datos||{};
  const uids=(meta.members||[]).filter(u=>u!==meta.ownerUid);     // solo quienes siguen en la materia
  return uids.map(u=>{const i=inv.find(x=>x.uid===u)||{};return filaRacha(u,(meta.memberNames||{})[u]||i.nombre,i.email,datos[u])}).sort(ordenRachas);
}
function docenteRachasHTML(m){
  const st=rachasMat[m.sharedId];
  if(!st||(st.datos===null&&!st.cargando))setTimeout(()=>cargarRachasMateria(m),0);
  const cargando=!st||st.cargando,filas=filasRachaMateria(m);
  return `<div class="card shareBox">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;margin-top:0;gap:8px"><b style="font-size:.9em">🔥 Rachas de tus estudiantes</b>
      <span class="row" style="margin:0;gap:8px;flex-wrap:wrap"><button class="sec" data-action="rachasRecargar" data-id="${m.id}" ${cargando?'disabled':''}>↻ Actualizar</button><button class="pr" data-action="rachasExcel" data-id="${m.id}" ${filas.length&&!cargando?'':'disabled'}>⬇️ Descargar Excel</button></span></div>
    ${st&&st.error?`<p class="meta" role="alert">${esc(st.error)}</p>`:''}
    ${cargando&&!(st&&st.datos)?'<p class="meta">Cargando…</p>':tablaRachasHTML(filas,'Aún no tienes estudiantes en esta materia.')}
  </div>`;
}

/* ---------- Admin: rachas de todos los estudiantes ---------- */
let adminTab='cuentas',adminRachas=null,adminRachasCargando=false,adminRachasError='';
async function cargarRachasAdmin(){
  if(!esAdmin()||adminRachasCargando)return;
  adminRachasCargando=true;adminRachasError='';
  try{
    const s=await db.collection('rachas').limit(2000).get();
    adminRachas={};s.docs.forEach(d=>{adminRachas[d.id]=d.data()});
  }catch(e){console.error(e);adminRachasError='No se pudieron leer las rachas'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?';adminRachas=adminRachas||{}}
  adminRachasCargando=false;
  if(route.view==='admin')render(true);
}
function filasRachaAdmin(){
  const L=adminLista||[],datos=adminRachas||{},f=adminFiltro.trim().toLowerCase();
  const est=L.filter(u=>(u.rol||'estudiante')==='estudiante');
  const vistos=new Set(est.map(u=>u.uid));
  const filas=est.map(u=>filaRacha(u.uid,u.nombre,u.email,datos[u.uid]));
  Object.keys(datos).forEach(u=>{if(!vistos.has(u)&&!L.some(x=>x.uid===u))filas.push(filaRacha(u,'','',datos[u]))});   // cuentas que no salieron en la lista
  return filas.filter(x=>!f||String(x.email).toLowerCase().includes(f)||String(x.nombre).toLowerCase().includes(f)).sort(ordenRachas);
}
function adminTabsHTML(){
  return `<div class="tabsT" style="margin:10px 0 14px">${[['cuentas','👤 Cuentas'],['rachas','🔥 Rachas de estudiantes']].map(([k,t])=>`<button type="button" data-action="adminTab" data-tab="${k}" class="${adminTab===k?'on':''}">${t}</button>`).join('')}</div>`;
}
function adminRachasHTML(){
  if(adminLista===null&&!adminCargando)setTimeout(cargarUsuariosAdmin,0);
  if(adminRachas===null&&!adminRachasCargando)setTimeout(cargarRachasAdmin,0);
  const cargando=adminRachasCargando||adminCargando,filas=filasRachaAdmin();
  return `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:0">
      <input class="fld" type="search" data-action="adminFiltro" placeholder="Buscar por nombre o correo" value="${esc(adminFiltro)}" aria-label="Buscar estudiantes" style="flex:1;min-width:200px;margin:0">
      <button class="pr" data-action="rachasExcelAdmin" ${filas.length&&!cargando?'':'disabled'}>⬇️ Descargar Excel</button></div>
    ${adminRachasError?`<div class="card shareBox" role="alert">${esc(adminRachasError)}</div>`:''}
    ${cargando&&!adminRachas?'<p class="meta">Cargando…</p>':`<div class="card" style="margin-top:12px">${tablaRachasHTML(filas,'No hay estudiantes con ese filtro.')}</div>`}`;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action,m=b.dataset.id?state.materias.find(x=>x.id===b.dataset.id):null;
  if(a==='rachasRecargar'&&m&&m.rol==='docente')cargarRachasMateria(m);
  else if(a==='rachasExcel'&&m&&m.rol==='docente')
    descargarRachasXlsx(filasRachaMateria(m),m.name,'_rachas.xlsx').catch(err=>{console.error(err);UI.alerta('No se pudo crear el Excel'+detalleError(err)+'.')});
  else if(a==='adminTab'&&esAdmin()){adminTab=b.dataset.tab==='rachas'?'rachas':'cuentas';render(true)}
  else if(a==='rachasExcelAdmin'&&esAdmin())
    descargarRachasXlsx(filasRachaAdmin(),'Auren','_rachas_estudiantes.xlsx').catch(err=>{console.error(err);UI.alerta('No se pudo crear el Excel'+detalleError(err)+'.')});
});
