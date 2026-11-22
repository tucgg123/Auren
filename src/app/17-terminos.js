/* ======================================================================
   TÉRMINOS DE SERVICIO Y POLÍTICA DE PRIVACIDAD
   - Los textos están en terminos.html y privacidad.html (páginas sueltas: se pueden abrir sin iniciar sesión).
   - Al crear la cuenta con correo hay que marcar la casilla; con Google, o si la cuenta ya existía, se pide aquí
     al entrar, en una ventana que no deja usar Auren hasta aceptar.
   - Se guarda en usuarios/{uid}: terminosVersion (texto) y terminosAceptados (hora del servidor). Las reglas de
     Firestore solo dejan escribirlos a la propia persona y con la hora real; un admin no puede marcarlos por otro.
   - Si cambias los términos de forma importante, sube TERMINOS_VERSION (y la versión de las dos páginas):
     todas las cuentas tendrán que aceptar de nuevo la próxima vez que entren.
   - Cookies: Auren no usa cookies de analítica ni publicidad; lo que guarda en el navegador (sesión, caché offline
     y preferencias) es necesario para funcionar, por eso no hay banner de consentimiento. Está explicado en
     privacidad.html#cookies. Si algún día se agrega analítica, hay que pedir consentimiento antes de cargarla.
   ====================================================================== */
const TERMINOS_VERSION='2026-11-22';
let cuentaDatos=null;               // usuarios/{uid} tal como lo leyó cargarRolServidor (null si no se pudo leer)
let terminosAlRegistrar=false;      // true mientras se crea una cuenta con la casilla ya marcada
const terminosKey=uid=>'auren_terminos_'+uid;

/* Versión aceptada: la de la cuenta; si no se pudo leer la cuenta (sin internet), la que se recuerda en este equipo */
function terminosAceptadosVersion(uid){
  if(cuentaDatos)return cuentaDatos.terminosVersion||'';
  try{return localStorage.getItem(terminosKey(uid))||''}catch(e){return ''}
}
async function guardarAceptacionTerminos(user){
  try{localStorage.setItem(terminosKey(user.uid),TERMINOS_VERSION)}catch(e){}
  if(cuentaDatos){cuentaDatos.terminosVersion=TERMINOS_VERSION;cuentaDatos.terminosAceptados=new Date()}
  const escribir=db.collection('usuarios').doc(user.uid).update({
    terminosVersion:TERMINOS_VERSION,
    terminosAceptados:firebase.firestore.FieldValue.serverTimestamp()
  });
  /* Sin internet la escritura queda en cola y se envía al volver la conexión: no se espera más de unos segundos */
  try{await Promise.race([escribir,new Promise(r=>setTimeout(r,8000))])}
  catch(e){console.error('No se pudo guardar la aceptación de los términos (¿publicaste las reglas nuevas de Firestore?):',e)}
}
function cerrarTerminosGate(){const ov=document.getElementById('termsOverlay');if(ov)ov.remove()}

/* Devuelve true si se puede entrar. Si la persona no acepta, cierra la sesión y devuelve false. */
async function asegurarTerminos(user){
  if(terminosAceptadosVersion(user.uid)===TERMINOS_VERSION)return true;
  if(terminosAlRegistrar){terminosAlRegistrar=false;await guardarAceptacionTerminos(user);return true}
  const nueva=!!terminosAceptadosVersion(user.uid);                 // ya había aceptado una versión anterior
  const ok=await new Promise(resolver=>{
    cerrarTerminosGate();
    const ov=document.createElement('div');
    ov.id='termsOverlay';ov.className='rolOverlay';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','termsTitulo');
    ov.innerHTML=`<form class="rolBox termsBox" id="termsForm" novalidate>
      <h2 id="termsTitulo">${nueva?'Actualizamos los términos':'Antes de continuar'}</h2>
      <p class="meta" style="margin:0">${nueva?'Cambiaron los Términos de servicio o la Política de privacidad de Auren. Para seguir usándola tienes que aceptar la versión nueva.':'Para usar Auren tienes que aceptar los Términos de servicio y la Política de privacidad. En resumen:'}</p>
      <ul>
        <li>Auren usa la IA de <b>Google Gemini</b> para procesar documentos y PDF y para responder preguntas. Lo que genera puede tener errores: revísalo.</li>
        <li>No envíes a la IA datos personales sensibles ni documentos confidenciales.</li>
        <li>Tus profesores ven tus entregas y tu racha en sus materias; tus apuntes personales son privados.</li>
        <li>No usamos cookies de analítica ni publicidad. Puedes descargar tus datos o borrar tu cuenta desde tu Perfil.</li>
      </ul>
      <label class="chkLinea"><input type="checkbox" id="termsChk"> <span>He leído y acepto los <a href="terminos.html" target="_blank" rel="noopener">Términos de servicio</a> y la <a href="privacidad.html" target="_blank" rel="noopener">Política de privacidad</a>.</span></label>
      <p id="termsErr" class="authError" hidden></p>
      <div class="row"><button type="button" class="sec" id="termsNo">No acepto · cerrar sesión</button><button type="submit" class="pr" id="termsSi">Aceptar y continuar</button></div>
    </form>`;
    document.body.appendChild(ov);
    const chk=ov.querySelector('#termsChk'),err=ov.querySelector('#termsErr');
    chk.addEventListener('change',()=>{err.hidden=true});
    ov.querySelector('#termsNo').onclick=()=>{ov.remove();resolver(false)};
    ov.querySelector('#termsForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(!chk.checked){err.textContent='Marca la casilla para aceptar.';err.hidden=false;return}
      const b=ov.querySelector('#termsSi');b.disabled=true;b.textContent='Guardando…';
      await guardarAceptacionTerminos(user);
      ov.remove();resolver(true);
    });
    setTimeout(()=>{try{chk.focus()}catch(e){}},30);
  });
  if(ok)return true;
  await auth.signOut();
  try{await db.terminate();await db.clearPersistence()}catch(e){}     // como al cerrar sesión: no deja datos en el equipo
  location.reload();
  return false;
}

/* Tarjeta del Perfil: qué versión aceptaste y cuándo, con los enlaces */
function terminosCardHTML(){
  const v=currentUid?terminosAceptadosVersion(currentUid):'';
  const f=cuentaDatos&&cuentaDatos.terminosAceptados;
  const fecha=f?(typeof f.toDate==='function'?f.toDate():f):null;
  return `<p class="meta" style="margin-top:0">${v?'Aceptaste la versión <b>'+esc(v)+'</b>'+(fecha instanceof Date&&!isNaN(fecha)?' el '+esc(fecha.toLocaleDateString('es',{day:'numeric',month:'long',year:'numeric'})):'')+'.':'Aún no consta tu aceptación.'}</p>
    <p class="legalLinks" style="text-align:left;font-size:.95em"><a href="terminos.html" target="_blank" rel="noopener">📄 Términos de servicio</a> · <a href="privacidad.html" target="_blank" rel="noopener">🔒 Política de privacidad</a> · <a href="privacidad.html#cookies" target="_blank" rel="noopener">🍪 Cookies</a></p>
    <p class="meta" style="margin:6px 0 0">Auren no usa cookies de analítica ni publicidad: solo guarda en tu navegador la sesión, la copia para usarla sin internet y tus preferencias.</p>`;
}
