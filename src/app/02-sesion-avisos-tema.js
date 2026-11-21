/* ================= AUTENTICACIÓN ================= */
let authMode='login';
document.querySelectorAll('[data-authtab]').forEach(b=>b.onclick=()=>{
  authMode=b.dataset.authtab;
  document.querySelectorAll('[data-authtab]').forEach(x=>x.classList.toggle('on',x===b));
  $('authSubmit').textContent=authMode==='login'?'Iniciar sesión':'Crear cuenta';
  $('authPass').autocomplete=authMode==='login'?'current-password':'new-password';   // el navegador propone una contraseña fuerte al registrarse
  $('authError').hidden=true;
});
function mapAuthError(err){
  const c=err&&err.code||'';
  const M={
    'auth/invalid-email':'Ese correo no es válido.',
    'auth/user-not-found':'No existe una cuenta con ese correo.',
    'auth/wrong-password':'Contraseña incorrecta.',
    'auth/invalid-credential':'Correo o contraseña incorrectos.',
    'auth/email-already-in-use':'Ya existe una cuenta con ese correo. Prueba iniciar sesión.',
    'auth/weak-password':'La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números.',
    'auth/too-many-requests':'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    'auth/network-request-failed':'Sin conexión a internet.',
    'auth/unauthorized-domain':'Este dominio no está autorizado en Firebase (Authentication > Settings > Authorized domains).',
    'auth/operation-not-allowed':'El acceso con Google no está activado en Firebase (Authentication > Sign-in method).',
    'auth/account-exists-with-different-credential':'Ya existe una cuenta con ese correo usando otro método de acceso.',
    'auth/popup-blocked':'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.'
  };
  return M[c]||'Ocurrió un error. Inténtalo de nuevo.';
}
$('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('authEmail').value.trim(),pass=$('authPass').value;
  $('authError').hidden=true;
  /* Al crear la cuenta se pide una contraseña de al menos 8 caracteres con letras y números.
     La contraseña nunca se guarda en Auren: Firebase Authentication la guarda cifrada con hash (scrypt). */
  if(authMode!=='login'&&(pass.length<8||!/[A-Za-z]/.test(pass)||!/[0-9]/.test(pass))){
    $('authError').textContent='La contraseña debe tener al menos 8 caracteres, con letras y números.';$('authError').hidden=false;return;
  }
  $('authSubmit').disabled=true;
  try{
    if(authMode==='login') await auth.signInWithEmailAndPassword(email,pass);
    else{
      const cred=await auth.createUserWithEmailAndPassword(email,pass);
      try{await cred.user.sendEmailVerification()}catch(e){console.warn('No se pudo enviar el correo de verificación:',e)}   // confirma que el correo es suyo
    }
  }catch(err){
    $('authError').textContent=mapAuthError(err);$('authError').hidden=false;
  }finally{
    $('authSubmit').disabled=false;
  }
});
$('logoutBtn').onclick=async()=>{
  if(!await UI.confirmar('¿Cerrar sesión?'))return;
  await auth.signOut();
  /* La caché offline de Firestore guarda tus datos en este equipo: al salir se borra para que no queden en computadores compartidos */
  try{await db.terminate();await db.clearPersistence()}catch(e){console.warn('No se pudo limpiar la caché local:',e)}
  location.reload();
};

/* Acceso con Google (ventana emergente; si el navegador la bloquea, se usa redirección) */
$('googleBtn').addEventListener('click',async()=>{
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  $('authError').hidden=true;$('googleBtn').disabled=true;
  try{
    await auth.signInWithPopup(provider);
  }catch(err){
    const c=err&&err.code||'';
    if(c==='auth/popup-blocked'){try{await auth.signInWithRedirect(provider);return}catch(e2){err=e2}}
    if(c!=='auth/popup-closed-by-user'&&c!=='auth/cancelled-popup-request'){
      console.error('Google:',err);
      $('authError').textContent=mapAuthError(err);$('authError').hidden=false;
    }
  }finally{
    $('googleBtn').disabled=false;
  }
});

auth.onAuthStateChanged(async user=>{
  if(user){
    $('authLoading').hidden=false;
    await hydrateFromCloud(user.uid);
    if(!state.profile.name&&user.displayName){state.profile.name=user.displayName;persist()}
    await cargarRolServidor(user);                                   // el rol sale de Firestore, no de lo que la persona elija
    $('authLoading').hidden=true;
    $('authScreen').hidden=true;
    $('appRoot').hidden=false;
    if(!state.theme&&temaLocal()){state.theme=temaLocal();persist()}   // lo elegido antes de iniciar sesión pasa a la cuenta
    applyTheme();updateThemeBtn();
    route={view:esProfesor()?'docente':'materias',materiaId:null};
    rutaInicialDesdeHash();
    marcarNavSegunRuta();
    render();
    startShared();
    iniciarAvisos();
    escucharNotas();
    escucharMisInvitaciones();
    try{avisarLogros(evaluarLogros())}catch(e){console.error('Logros:',e)}
    procesarUnirsePendiente();
  }else{
    const ovRol=document.getElementById('rolOverlay');if(ovRol)ovRol.remove();
    stopShared();
    currentUid=null;
    sync.fallo='';sync.falloMateria='';sync.aviso='';sync.tamAlto=false;sync.soloLocal=false;pintarBanner();
    avisos=null;ttsParar();detenerNotas();adminLista=null;{const ap=$('avisosPanel');if(ap)ap.hidden=true}
    state=defaultState();
    $('appRoot').hidden=true;
    $('authScreen').hidden=false;
  }
});

/* ======================= AVISOS: novedades del docente y recordatorios =======================
   - Cuando el docente publica un tema, un examen o un evento, el estudiante recibe un aviso (campana 🔔).
     La primera vez que se sincroniza una materia solo se toma nota de lo que ya existía, para no llenarte de avisos viejos.
   - Los recordatorios avisan de lo que pasa hoy o mañana en el calendario y de los exámenes que cierran en las próximas 24 h.
   - Si das permiso al navegador, además se muestran como notificaciones del sistema cuando Auren no está a la vista.
   Límite: los avisos se generan mientras Auren está abierta (o instalada y viva en segundo plano). Avisar con la app
   totalmente cerrada exige un servidor de notificaciones push, que esta versión no incluye. */
const AV_MAX=40;
let avisos=null,avTimer=null;
const avKey=()=>'auren_avisos_'+currentUid;
const avisosActivos=()=>!state.profile||state.profile.avisos!==false;
function avCargar(){
  if(avisos&&avisos._uid===currentUid)return avisos;
  let x=null;try{x=JSON.parse(localStorage.getItem(avKey())||'null')}catch(e){}
  avisos=Object.assign({lista:[],vistos:{},base:{}},x||{},{_uid:currentUid});
  return avisos;
}
function avGuardar(){
  const a=avCargar();
  a.lista=a.lista.slice(0,AV_MAX);
  const ks=Object.keys(a.vistos);if(ks.length>800)ks.slice(0,ks.length-800).forEach(k=>delete a.vistos[k]);
  try{localStorage.setItem(avKey(),JSON.stringify({lista:a.lista,vistos:a.vistos,base:a.base}))}catch(e){}
  pintarCampana();
}
function notificarSistema(titulo,texto,tag){
  try{
    if(!document.hidden){toast(esc(texto));return}                                  // si Auren está a la vista basta el aviso interno
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    const opts={body:texto,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:tag||undefined,data:{url:'/'}};
    if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification(titulo,opts)).catch(()=>{try{new Notification(titulo,opts)}catch(e){}});
    else new Notification(titulo,opts);
  }catch(e){}
}
function avAgregar(av){
  const a=avCargar();
  a.lista.unshift(Object.assign({id:uid(),leido:false,fecha:Date.now()},av));
  avGuardar();
  notificarSistema('Auren',av.texto,av.clave);
}
function anunciarNuevos(m,tipo,items){
  if(!currentUid||!m||m.rol!=='estudiante'||!m.sharedId)return;
  const a=avCargar(),bk=m.sharedId+'|'+tipo,pre=tipo+'|'+m.sharedId+'|';
  if(!a.base[bk]){items.forEach(x=>{a.vistos[pre+x.id]=1});a.base[bk]=1;avGuardar();return}     // primera lectura: sin avisos
  const nuevos=items.filter(x=>!a.vistos[pre+x.id]);
  if(!nuevos.length)return;
  const ico={tema:'📖',examen:'📝',evento:'🗓️',anuncio:'📣'}[tipo]||'🔔',que={tema:'tema',examen:'examen',evento:'evento',anuncio:'anuncio'}[tipo]||'aviso';
  nuevos.forEach(x=>{
    a.vistos[pre+x.id]=1;
    if(avisosActivos())avAgregar({tipo,materiaId:m.id,texto:ico+' Nuevo '+que+' en '+m.name+': '+x.titulo,clave:pre+x.id});
  });
  avGuardar();
}
/* Lo que pasa hoy o mañana, y los exámenes que cierran en las próximas 24 horas */
function avisablesProximos(){
  const hoy=hoyStr(),man=sumarDias(hoy,1),out=[];
  eventosTodos().forEach(e=>{
    if(e.date!==hoy&&e.date!==man)return;
    out.push({clave:'ev|'+e.id+'|'+e.date,materiaId:e.materiaId||null,
      texto:'🔔 '+(e.date===hoy?'Hoy':'Mañana')+': '+String(TY[e.type]||tipoEv(e.type)||'📌').split(' ')[0]+' '+e.title+(e.hora?' a las '+e.hora:'')+(e.materia?' · '+e.materia:'')});
  });
  state.materias.filter(m=>m.rol==='estudiante'&&m.sharedId).forEach(m=>{
    examenesDe(m).forEach(ex=>{
      if(!ex.cierre||!examAbierto(ex)||miIntento(m,ex.id))return;
      const falta=ex.cierre-Date.now();
      if(falta>0&&falta<=24*3600*1000)out.push({clave:'exc|'+ex.id,materiaId:m.id,texto:'⏰ El examen «'+(ex.titulo||'Examen')+'» de '+m.name+' cierra '+fmtFechaHora(ex.cierre)});
    });
  });
  return out;
}
function revisarRecordatorios(){
  if(!currentUid||esProfesor()||!avisosActivos())return;
  const a=avCargar();let n=0;
  avisablesProximos().forEach(x=>{
    if(a.vistos[x.clave])return;
    a.vistos[x.clave]=1;n++;
    avAgregar({tipo:'recordatorio',materiaId:x.materiaId,texto:x.texto,clave:x.clave});
  });
  if(n)avGuardar();
}
function iniciarAvisos(){
  pintarCampana();
  if(avTimer)return;
  setTimeout(revisarRecordatorios,2500);
  avTimer=setInterval(revisarRecordatorios,15*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)revisarRecordatorios()});
}
function pintarCampana(){
  const n=$('bellN'),b=$('bellBtn');if(!b)return;
  b.style.display=(esProfesor()||!currentUid)?'none':'';
  const k=currentUid?avCargar().lista.filter(x=>!x.leido).length:0;
  if(n){n.hidden=!k;n.textContent=k>9?'9+':String(k)}
  b.setAttribute('aria-label',k?'Avisos: '+k+' sin leer':'Avisos');
}
function avisosPanelHTML(sinLeer){
  const a=avCargar();
  if(!a.lista.length)return `<div class="avHead"><b>🔔 Avisos</b><button class="icon-btn" data-action="avCerrar" aria-label="Cerrar">✕</button></div><p class="meta" style="padding:12px 14px">Aquí verás cuando tu docente publique algo y los recordatorios de lo que viene en el calendario.</p>`;
  return `<div class="avHead"><b>🔔 Avisos</b><span class="row" style="margin:0"><button class="sec" data-action="avVaciar">Vaciar</button><button class="icon-btn" data-action="avCerrar" aria-label="Cerrar">✕</button></span></div>
    <div class="avLista">${a.lista.map(x=>`<button class="avItem ${sinLeer.has(x.id)?'nuevo':''}" data-action="avAbrir" data-av="${x.id}"><span>${esc(x.texto)}</span><small class="meta">${relTime(x.fecha)}${sinLeer.has(x.id)?' · nuevo':''}</small></button>`).join('')}</div>`;
}
function abrirAvisos(){
  const p=$('avisosPanel');if(!p)return;
  if(!p.hidden){p.hidden=true;return}
  const a=avCargar(),sinLeer=new Set(a.lista.filter(x=>!x.leido).map(x=>x.id));
  p.innerHTML=avisosPanelHTML(sinLeer);p.hidden=false;
  a.lista.forEach(x=>{x.leido=true});avGuardar();
}
function notificarSistemaPrueba(){
  try{
    const opts={body:'Listo: te avisaremos de lo que publique tu docente y de lo que viene en tu calendario.',icon:'/icons/icon-192.png',tag:'auren-prueba'};
    if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification('Auren',opts));else new Notification('Auren',opts);
  }catch(e){}
}
function avisosCardHTML(){
  const act=avisosActivos(),soporta=typeof Notification!=='undefined',perm=soporta?Notification.permission:'no';
  return `<div class="card"><h3>🔔 Avisos y recordatorios</h3>
    <p class="meta" style="margin-top:0">Te avisamos cuando tu docente publica un tema, un examen o un evento, y te recordamos lo que pasa hoy o mañana en tu calendario.</p>
    <div class="row" style="flex-wrap:wrap"><button class="${act?'pr':'sec'}" data-action="avToggle">${act?'✅ Avisos activados':'Avisos desactivados'}</button>
    ${soporta?(perm==='granted'?'<span class="chip chipOk">Notificaciones del navegador activadas</span>':perm==='denied'?'<span class="chip">Notificaciones bloqueadas en el navegador</span>':'<button class="sec" data-action="avPermiso">Activar notificaciones del navegador</button>'):'<span class="chip">Este navegador no admite notificaciones</span>'}</div>
    <p class="meta" style="margin:8px 0 0">Los avisos aparecen mientras Auren está abierta o instalada en tu dispositivo. Con la aplicación totalmente cerrada no se pueden enviar sin un servidor de notificaciones push.${perm==='denied'?' Para recibirlas, permítelas desde el candado de la barra de direcciones.':''}</p></div>`;
}
$('bellBtn').onclick=e=>{e.stopPropagation();abrirAvisos()};
document.addEventListener('click',e=>{
  const p=$('avisosPanel');
  if(p&&!p.hidden&&!e.target.closest('#avisosPanel')&&!e.target.closest('#bellBtn'))p.hidden=true;
});

/* ================= TEMA CLARO/OSCURO ================= */
/* La preferencia se guarda en la cuenta (state.theme) y también en este dispositivo (localStorage), para que
   tema-init.js la aplique antes de pintar, incluso en la pantalla de acceso. Sin preferencia se sigue la del sistema. */
const TEMA_KEY='auren_tema';
const mqOscuro=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
const temaEfectivo=()=>state.theme||(mqOscuro&&mqOscuro.matches?'dark':'light');
function temaLocal(){try{const t=localStorage.getItem(TEMA_KEY);return t==='light'||t==='dark'?t:null}catch(e){return null}}
function applyTheme(){
  if(state.theme)document.documentElement.setAttribute('data-theme',state.theme);
  else document.documentElement.removeAttribute('data-theme');
  try{state.theme?localStorage.setItem(TEMA_KEY,state.theme):localStorage.removeItem(TEMA_KEY)}catch(e){}
  applyColors();
  applyFx();
}
function updateThemeBtn(){
  $('themeBtn').textContent=state.theme==='dark'?'🌙 Tema oscuro':state.theme==='light'?'☀️ Tema claro':'🌗 Tema automático (del sistema)';
  const b=$('themeTgl');if(!b)return;
  const osc=temaEfectivo()==='dark',txt=osc?'Cambiar a modo claro':'Cambiar a modo oscuro';
  b.querySelector('.tgIco').textContent=osc?'☀️':'🌙';
  b.setAttribute('aria-label',txt);b.title=txt;
}
/* Botón del encabezado: alterna claro ↔ oscuro y lo deja guardado */
$('themeTgl').onclick=()=>{
  state.theme=temaEfectivo()==='dark'?'light':'dark';
  applyTheme();updateThemeBtn();if(currentUid)persist();
};
if(mqOscuro){const f=()=>{if(!state.theme){applyTheme();updateThemeBtn()}};mqOscuro.addEventListener?mqOscuro.addEventListener('change',f):mqOscuro.addListener&&mqOscuro.addListener(f)}
/* Efectos visuales (fondo animado y desenfoques). Automático: ligeros en pantallas pequeñas o equipos con poca memoria/procesador, sin efectos si pides reducir movimiento */
function fxAuto(){
  const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce)return 'off';
  const flojo=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||window.innerWidth<=760;
  return flojo?'lite':'full';
}
/* Elección de efectos: la del perfil → la guardada en este dispositivo (sirve en la pantalla de acceso) → ?fx=off|lite|full|auto en la dirección → automática */
function fxGuardado(){
  try{
    const q=new URLSearchParams(location.search).get('fx');
    if(['full','lite','off'].includes(q))localStorage.setItem('auren_fx',q);
    else if(q==='auto')localStorage.removeItem('auren_fx');
    const v=localStorage.getItem('auren_fx');return ['full','lite','off'].includes(v)?v:null;
  }catch(e){return null}
}
function applyFx(){
  const v=['full','lite','off'].includes(state.fx)?state.fx:(fxGuardado()||fxAuto());
  document.documentElement.setAttribute('data-fx',v);
  cargarFondo(v);
}
/* El dibujo de circuitos del fondo (unos 870 trazos) ya no viene dentro de index.html: se descarga aparte y solo
   cuando se va a ver (efectos activados y pantalla de más de 760 px). En celulares no se descarga ni se dibuja. */
let fondoPedido=false;
function cargarFondo(v){
  if(fondoPedido||v==='off'||window.innerWidth<=760||typeof fetch!=='function')return;
  const fx=document.querySelector('.fx');if(!fx||fx.querySelector('.ckt'))return;
  fondoPedido=true;
  fetch('/fondo-circuito.svg').then(r=>r.ok?r.text():'').then(t=>{
    if(!t.trim().startsWith('<svg')||fx.querySelector('.ckt'))return;
    fx.insertAdjacentHTML('afterbegin',t);
  }).catch(()=>{fondoPedido=false});
}
/* ================= COLORES PERSONALIZADOS =================
   Cada usuario elige el color de acento (botones, enlaces, resaltados) y el color de fondo. Se guarda en su cuenta
   (state.colors, viaja con sus datos a la nube) y en este dispositivo (auren_colores) para que tema-init.js lo pinte
   antes de cargar. El fondo tiene un color para el modo claro y otro para el oscuro; el acento es uno solo y
   tema-init.js lo aclara u oscurece lo necesario para que se lea bien en cada modo. */
const COL_KEY='auren_colores',HEXRX=/^#[0-9a-f]{6}$/i;
const ACENTOS=[['#2f66d6','Azul'],['#1a9aa0','Turquesa'],['#2c8a5a','Verde'],['#7a4fd6','Violeta'],['#d14d84','Rosa'],['#c98a12','Ámbar'],['#d9452b','Rojo coral'],['#4a5262','Grafito']];
const FONDOS=[['Cielo','#eaf2ff','#07101f'],['Menta','#eaf7f0','#05140d'],['Lavanda','#f1edfb','#0f0a1c'],['Arena','#f7f1e6','#15110a'],['Rosa','#fbeef3','#180a10'],['Gris','#eef0f3','#0c0d10'],['Blanco','#ffffff','#000000']];
const FONDO_DEF={claro:'#f1f5fa',oscuro:'#060a12'};
function coloresValidos(c){
  if(!c||typeof c!=='object')return null;
  const acento=HEXRX.test(c.acento||'')?c.acento.toLowerCase():null;
  const f=c.fondo&&typeof c.fondo==='object'&&HEXRX.test(c.fondo.claro||'')&&HEXRX.test(c.fondo.oscuro||'')?{claro:c.fondo.claro.toLowerCase(),oscuro:c.fondo.oscuro.toLowerCase()}:null;
  return acento||f?{acento,fondo:f}:null;
}
function applyColors(){
  state.colors=coloresValidos(state.colors);
  try{state.colors?localStorage.setItem(COL_KEY,JSON.stringify(state.colors)):localStorage.removeItem(COL_KEY)}catch(e){}
  try{window.aurenColores&&window.aurenColores.aplicar(state.colors)}catch(e){}
  const osc=temaEfectivo()==='dark',f=state.colors&&state.colors.fondo;
  const mt=document.querySelector('meta[name="theme-color"]');if(mt)mt.setAttribute('content',f?f[osc?'oscuro':'claro']:(osc?FONDO_DEF.oscuro:FONDO_DEF.claro));
}
function colorLocal(){try{return coloresValidos(window.aurenColores&&window.aurenColores.guardados())}catch(e){return null}}
/* Cambia una parte de los colores, los aplica al instante y los guarda en la cuenta */
function setColores(cambio,repintar){
  const c=Object.assign({acento:null,fondo:null},state.colors||{},cambio);
  state.colors=coloresValidos(c);
  applyColors();if(currentUid)persist();
  if(repintar)render(true);
}
function coloresCardHTML(){
  const c=state.colors||{},ac=c.acento||null,fo=c.fondo||null,osc=temaEfectivo()==='dark';
  const swA=(v,n)=>`<button type="button" class="colorSw${v?'':' def'}${(v||null)===ac?' on':''}" ${v?`style="--sw:${v}"`:''} data-action="colAcento" data-v="${v||''}" aria-label="${esc(n)}" aria-pressed="${(v||null)===ac}" title="${esc(n)}"></button>`;
  const fSel=x=>fo&&fo.claro===x[1]&&fo.oscuro===x[2];
  const swF=x=>`<button type="button" class="colorSw fondoSw${fSel(x)?' on':''}" style="--sw:${x[1]};--sw2:${x[2]}" data-action="colFondo" data-c="${x[1]}" data-o="${x[2]}" aria-label="Fondo ${esc(x[0])}" aria-pressed="${fSel(x)}" title="${esc(x[0])} (claro / oscuro)"></button>`;
  const fActual=fo||FONDO_DEF,acHex=ac||(osc?'#f0a68c':'#b9472a');
  /* Aviso si el fondo elegido para el modo que se ve ahora deja el texto difícil de leer */
  let aviso='';
  try{
    const fm=fActual[osc?'oscuro':'claro'],txt=osc?'#e7ebf2':'#1a1c21';
    if(fo&&window.aurenColores&&window.aurenColores.contraste(fm,txt)<4.5)aviso=`<p class="meta" style="color:var(--no);margin:8px 0 0">⚠️ Con este fondo el texto del modo ${osc?'oscuro':'claro'} se lee mal. Prueba un color ${osc?'más oscuro':'más claro'}.</p>`;
  }catch(e){}
  return `<div class="card"><h3>🎨 Colores</h3>
    <p class="meta" style="margin-top:0">Elige el color de los botones y resaltados, y el color de fondo de la página. Se guarda en tu cuenta y te sigue en cualquier dispositivo.</p>
    <label class="lbl">Color de acento</label>
    <div class="colorGrid" role="group" aria-label="Color de acento">${swA(null,'Original (terracota)')}${ACENTOS.map(x=>swA(x[0],x[1])).join('')}</div>
    <div class="colorPick"><label>Otro color <input type="color" data-action="colAcentoLibre" value="${acHex}" aria-label="Elegir otro color de acento"></label></div>
    <label class="lbl" style="margin-top:16px">Color de fondo</label>
    <div class="colorGrid" role="group" aria-label="Color de fondo"><button type="button" class="colorSw fondoSw def${fo?'':' on'}" data-action="colFondo" data-c="" data-o="" aria-label="Fondo original" aria-pressed="${!fo}" title="Original"></button>${FONDOS.map(swF).join('')}</div>
    <div class="colorPick">
      <label>Modo claro <input type="color" data-action="colFondoLibre" data-m="claro" value="${fActual.claro}" aria-label="Color de fondo para el modo claro"></label>
      <label>Modo oscuro <input type="color" data-action="colFondoLibre" data-m="oscuro" value="${fActual.oscuro}" aria-label="Color de fondo para el modo oscuro"></label>
    </div>${aviso}
    <div class="colorPrev"><button type="button" class="pr" tabindex="-1">Botón</button><span class="chip" style="color:var(--a);border-color:var(--a)">Etiqueta</span><span style="color:var(--a);font-weight:600">Texto resaltado</span></div>
    <div class="row"><button class="sec" data-action="colReset" ${state.colors?'':'disabled'}>↺ Volver a los colores originales</button></div></div>`;
}
state.colors=colorLocal();state.theme=temaLocal();applyTheme();updateThemeBtn();   // también en la pantalla de acceso, antes de iniciar sesión (aplica los efectos)
document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('fxPause',document.hidden));
function datosCardHTML(){
  return `<div class="card"><h3>💾 Tus datos</h3>
    <p class="meta" style="margin-top:0">Descarga una copia de tus materias, temas, tarjetas, notas e historial en un archivo. Sirve como respaldo o para llevártelos. No incluye lo que vive solo en la nube del docente (exámenes y entregas de sus estudiantes).</p>
    <button class="sec" data-action="descargarCopia">⬇️ Descargar copia de mis datos</button></div>`;
}
function descargarCopia(){
  const copia={app:'Auren',formato:1,fecha:new Date().toISOString(),datos:JSON.parse(JSON.stringify(state))};
  bajarBlob(new Blob([JSON.stringify(copia,null,2)],{type:'application/json'}),'auren_copia_'+fechaLocal(new Date())+'.json');
  toast('💾 Copia descargada');
}
function fxCardHTML(){
  const v=['full','lite','off'].includes(state.fx)?state.fx:'';
  return `<div class="card"><h3>✨ Efectos visuales</h3>
    <p class="meta" style="margin-top:0">El fondo animado y los desenfoques se ven muy bien, pero gastan batería. En teléfonos y equipos modestos conviene "Ligeros".</p>
    <select class="fld" data-action="fxSel" aria-label="Efectos visuales">
      <option value="" ${v===''?'selected':''}>Automático (según tu dispositivo)</option>
      <option value="full" ${v==='full'?'selected':''}>Completos: fondo animado y cristal</option>
      <option value="lite" ${v==='lite'?'selected':''}>Ligeros: circuito quieto, sin desenfoque</option>
      <option value="off" ${v==='off'?'selected':''}>Sin efectos</option>
    </select></div>`;
}
/* Menú de esquina */
(function(){
  const b=$('menuBtn'),m=$('menu');
  const set=o=>{m.classList.toggle('open',o);b.setAttribute('aria-expanded',String(o));b.setAttribute('aria-label',o?'Cerrar menú':'Abrir menú')};
  b.onclick=e=>{e.stopPropagation();set(!m.classList.contains('open'))};
  m.addEventListener('click',e=>{if(e.target.closest('#mainNav button,#menuJoin,#menuPomo,#logoutBtn'))set(false)});
  document.addEventListener('click',e=>{if(!e.target.closest('.menuwrap'))set(false)});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&m.classList.contains('open')){set(false);b.focus()}
    if(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||'')&&$('searchWrap')&&$('searchWrap').style.display!=='none'&&!$('appRoot').hidden){e.preventDefault();$('searchBox').focus()}
  });
  window.addEventListener('hashchange',()=>set(false));
})();
$('themeBtn').onclick=()=>{
  state.theme=state.theme==='dark'?'light':state.theme==='light'?null:'dark';
  applyTheme();updateThemeBtn();persist();
};
/* Hecho por Sebastián Poveda y Santiago Romero. 2026 — Auren · estilos */
/* Al soltar el selector de color se repinta el perfil para marcar la muestra elegida y revisar el contraste */
document.addEventListener('change',e=>{const a=e.target&&e.target.dataset&&e.target.dataset.action;if(a==='colAcentoLibre'||a==='colFondoLibre')render(true)});
