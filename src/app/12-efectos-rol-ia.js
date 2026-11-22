/* ======================================================================
   ANIMACIONES Y EFECTOS
   - Las animaciones CSS están dentro de @media (prefers-reduced-motion:no-preference):
     si el dispositivo pide menos movimiento, no se mueve nada.
   - Los efectos en JavaScript (chispas, confeti, contador) también lo respetan.
   - El Modo examen NO revela aciertos mientras respondes (es un examen).
     Quien quiera feedback inmediato puede activar "Ver si acerté al instante".
   ====================================================================== */
let examInstantaneo=false;
let ultimaVista=null;

const FRASES_OK=['¡Correcto!','¡Muy bien!','¡Exacto!','¡Así se hace!','¡Perfecto!','¡Sigue así!'];
const FRASES_NO=['Casi…','Esta vez no, ¡pero así se aprende!','Ups, a repasar esta 🌱','No pasa nada, ya la sabrás'];

function reducido(){
  try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){return false}
}
function feedbackHTML(acierto,q,idx){
  return acierto
    ?`<div class="fb fbOk" role="status">🎉 ${FRASES_OK[idx%FRASES_OK.length]}${q.xp?` <b class="xpMas">+${q.xp} XP</b>${q.combo>1?' · combo x'+q.combo:''}`:''}</div>`
    :`<div class="fb fbNo" role="status">😕 ${FRASES_NO[idx%FRASES_NO.length]}<span>La correcta: <b>${esc(q.correcta)}</b></span>${explicacionHTML(q.card&&q.card.exp)}</div>`;
}
/* Explicación de por qué la respuesta correcta es esa: la escribe la IA al crear la tarjeta o el profesor a mano */
function explicacionHTML(t){
  t=String(t||'').trim();
  return t?`<span class="fbExp">💡 ${esc(t)}</span>`:'';
}

/* Cada pantalla distinta (o cada pregunta nueva) entra con una animación suave */
function claveVista(){
  let k=route.view+':'+(route.materiaId||'')+':'+(route.tool||'')+':'+(route.examId||'');
  if(route.view==='materiaDetail')k+=':'+docTab;
  if(route.view==='tool'&&toolState&&typeof toolState.idx==='number')k+=':'+toolState.idx;
  if(route.view==='logros')k+=':'+logrosTab+':'+(logrosMat||'');
  return k;
}
function animarVista(){
  const v=$('view');if(!v)return;
  const k=claveVista(),nueva=k!==ultimaVista;
  ultimaVista=k;
  const enTool=route.view==='tool'&&toolState;
  if(reducido()){
    v.classList.remove('vIn');
    if(enTool){toolState.fx=null;toolState.fxFin=false}
    return;
  }
  if(nueva){
    v.classList.remove('vIn');void v.offsetWidth;v.classList.add('vIn');
    v.querySelectorAll('.grid>*,.badgeGrid>*,.path>.stage').forEach((el,i)=>el.style.setProperty('--i',Math.min(i,12)));
    setTimeout(()=>v.classList.remove('vIn'),1400);
  }else{
    v.classList.remove('vIn');      // un repintado dentro de la misma pantalla no repite la entrada
  }
  v.querySelectorAll('.countUp').forEach(contar);
  if(enTool&&toolState.fx){
    const fx=toolState.fx;toolState.fx=null;
    if(fx.tipo==='ok'){const b=v.querySelector('.optBtn.ok');if(b)explotar(b)}
  }
  if(enTool&&toolState.fxFin){
    toolState.fxFin=false;
    const qs=toolState.questions;
    const p=qs?(toolState.idx>=qs.length&&qs.length?toolState.score/qs.length:0):(toolState.fxPct||0);
    if(p>=0.7)lluvia();
  }
}

/* Número que sube de 0 al valor final */
function contar(el){
  const fin=+el.dataset.to||0;
  if(!fin||typeof requestAnimationFrame!=='function'){el.textContent=fin;return}
  const t0=performance.now(),dur=850;
  el.textContent='0';
  const paso=t=>{
    const p=Math.min(1,(t-t0)/dur);
    el.textContent=Math.round(fin*(1-Math.pow(1-p,3)));
    if(p<1)requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
/* Chispas que salen de la respuesta correcta */
function explotar(el){
  const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const cols=['#3f7d5c','#e8b04b','#dc9c86','#6fb3d2','#c96f8a'];
  for(let i=0;i<24;i++){
    const s=document.createElement('i');s.className='spark';
    const ang=Math.random()*Math.PI*2,dist=50+Math.random()*80;
    s.style.cssText='left:'+cx+'px;top:'+cy+'px;background:'+cols[i%cols.length]+';--dx:'+(Math.cos(ang)*dist)+'px;--dy:'+(Math.sin(ang)*dist-30)+'px;--rot:'+(Math.random()*540-270)+'deg';
    document.body.appendChild(s);
    setTimeout(()=>s.remove(),1000);
  }
}
/* Lluvia de confeti al terminar con buen resultado */
function lluvia(){
  const cols=['#3f7d5c','#e8b04b','#dc9c86','#6fb3d2','#c96f8a','#7a2e2c'];
  for(let i=0;i<60;i++){
    const c=document.createElement('i');c.className='confetti';
    c.style.cssText='left:'+(Math.random()*100)+'vw;background:'+cols[i%cols.length]+';--d:'+(2.4+Math.random()*1.6)+'s;--w:'+(Math.random()*0.7)+'s';
    document.body.appendChild(c);
    setTimeout(()=>c.remove(),4600);
  }
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  if(b.dataset.action==='toggleInstante'){examInstantaneo=!examInstantaneo;render(true)}
});


/* ======================================================================
   ROL DE LA CUENTA: estudiante, profesor o admin
   El rol vive en Firestore (usuarios/{uid}) y SOLO un admin puede cambiarlo: nadie elige el suyo.
   La pantalla lo usa para mostrar u ocultar secciones; lo que protege de verdad son las reglas de
   Firestore y la función de IA, que vuelven a comprobarlo en el servidor.
   Internamente "docente" es el nombre de siempre para el rol profesor.
   ====================================================================== */
const ADMIN_SEMILLA=__ADMIN_EMAIL__;       // primer admin: se cambia en auren.config.json (npm run build lo pone aquí y en firestore.rules)
const ROLES=['estudiante','profesor','admin'];
const rolInterno=r=>r==='profesor'?'docente':r;
const nombreRol=r=>({admin:'Administrador',docente:'Profesor',estudiante:'Estudiante'}[r]||'Estudiante');
function detalleError(e){return e&&e.code?' ('+e.code+')':''}
function esProfesor(){const r=state.profile&&state.profile.rol;return r==='docente'||r==='admin'}
function esAdmin(){return !!(state.profile&&state.profile.rol==='admin')}
const puedeSubir=()=>esProfesor();                         // solo profesores y admin suben archivos
let rolFalloLectura=false;
async function cargarRolServidor(user){
  const ref=db.collection('usuarios').doc(user.uid);
  const semilla=String(user.email||'').toLowerCase()===ADMIN_SEMILLA&&user.emailVerified===true;
  let rol='estudiante';
  rolFalloLectura=false;cuentaDatos=null;
  try{
    const d=await ref.get();
    if(d.exists&&ROLES.includes((d.data()||{}).rol)){
      cuentaDatos=d.data();                                           // también trae la aceptación de los términos (17-terminos.js)
      rol=d.data().rol;
      if(semilla&&rol!=='admin'){await ref.update({rol:'admin'});rol='admin'}      // el primer admin recupera su rol aunque se haya registrado antes de verificar el correo
    }else{
      rol=semilla?'admin':'estudiante';
      await ref.set({rol,email:user.email||'',nombre:user.displayName||'',creado:firebase.firestore.FieldValue.serverTimestamp()});
      cuentaDatos={rol};
    }
  }catch(e){
    console.error('No se pudo leer el rol de la cuenta:',e);rolFalloLectura=true;
  }
  state.profile.rol=rolInterno(rol);
  return rol;
}
function rolCardHTML(){
  const r=state.profile&&state.profile.rol||'estudiante';
  return `<div class="card"><h3>Tu rol</h3>
    <p class="meta" style="margin-top:0"><span class="chip">${esc(nombreRol(r))}</span> Solo un administrador puede cambiar el rol de una cuenta.${rolFalloLectura?' <b>No se pudo comprobar tu rol con el servidor; se muestra el de estudiante.</b>':''}</p></div>`;
}


/* ======================================================================
   IA EN SEGUNDO PLANO
   Las funciones normales de Netlify tienen un tiempo máximo y un archivo grande puede superarlo
   (error 504). Por eso la subida:
     1. crea un "trabajo" en Firestore (iaJobs/{id}),
     2. lanza generar-tema-background (Netlify responde 202 y la IA sigue sin límite de 504),
     3. espera aquí el resultado, que la función escribe en ese trabajo.
   Si algo de eso no está disponible (la función no existe, las reglas no se publicaron…),
   se usa la función normal como antes.
   ====================================================================== */
const ESPERA_MAX_IA_MS=390000,ESPERA_MAX_PDF_MS=570000;   // un poco más que el tope de generar-tema-background (6 y 9 min), para recibir su mensaje
let ESPERA_ACK_MS=30000;          // si en este tiempo la función no avisa que arrancó, se explica el motivo en vez de esperar 4 minutos
async function diagnosticarIA(){
  const base='La función de IA no respondió: nunca llegó a trabajar en tu archivo. ';
  try{
    const r=await fetch('/.netlify/functions/generar-tema?diagnostico=1');
    const d=await r.json();
    const faltan=Object.entries(d.variables||{}).filter(([k,v])=>!v&&k!=='FIREBASE_SERVICE_ACCOUNT').map(([k])=>k);
    let mio='';try{mio=(firebase.app().options||{}).projectId||''}catch(e){}
    if(faltan.length)return base+'En Netlify faltan estas variables de entorno: '+faltan.join(', ')+'. Agrégalas en Site configuration → Environment variables y vuelve a desplegar el sitio (Deploys → Trigger deploy).';
    if(d.proyecto&&mio&&d.proyecto!==mio)return base+'Netlify usa el proyecto de Firebase "'+d.proyecto+'" pero esta app usa "'+mio+'". Corrige FIREBASE_PROJECT_ID en Netlify y vuelve a desplegar.';
    return base+'Las variables de Netlify parecen bien: revisa Netlify → Logs → Functions → generar-tema-background para ver el error exacto.';
  }catch(e){return base+'Tampoco respondió la función de diagnóstico: comprueba en Netlify → Functions que las funciones estén desplegadas.'}
}

function esperarTrabajoIA(ref,statusEl,limpiar){
  return new Promise(resolver=>{
    const t0=Date.now();
    let terminado=false,reloj=null,tope=null,avisoTope=null,arranco=false,cancelar=()=>{};
    const terminar=r=>{
      if(terminado)return;terminado=true;
      clearInterval(reloj);clearTimeout(tope);clearTimeout(avisoTope);
      try{cancelar()}catch(e){}
      Promise.resolve().then(()=>limpiar&&limpiar()).catch(()=>{}).then(()=>{try{ref.delete()}catch(e){}});   // primero los trozos del PDF, luego el trabajo
      resolver(r);
    };
    const pintar=()=>{
      const seg=Math.round((Date.now()-t0)/1000);
      statusEl.textContent=limpiar?'🔍 La IA está leyendo tu PDF escaneado… '+seg+' s (puede tardar unos minutos)':'🤖 La IA está armando el tema y las tarjetas… '+seg+' s (si el archivo es grande puede tardar un par de minutos)';
    };
    pintar();reloj=setInterval(pintar,1000);
    avisoTope=setTimeout(async()=>{if(terminado||arranco)return;const msg=await diagnosticarIA();if(!terminado&&!arranco)terminar({ok:false,error:msg})},ESPERA_ACK_MS);
    tope=setTimeout(()=>terminar({ok:false,error:'La IA tardó demasiado en responder. Inténtalo de nuevo o prueba con un archivo más corto.'}),limpiar?ESPERA_MAX_PDF_MS:ESPERA_MAX_IA_MS);
    cancelar=ref.onSnapshot(snap=>{
      const d=snap.exists?snap.data():null;
      if(!d)return;
      if(d.estado&&d.estado!=='pendiente')arranco=true;          // la función ya está trabajando
      if(d.estado==='listo'){
        let datos=null;try{datos=JSON.parse(d.resultado)}catch(e){}
        terminar(datos?{ok:true,data:datos}:{ok:false,error:'La IA devolvió un resultado ilegible. Inténtalo de nuevo.'});
      }else if(d.estado==='error'){
        terminar({ok:false,error:d.mensaje||'La IA no pudo completar la petición.'});
      }
    },err=>terminar({ok:false,error:'No se pudo recibir el resultado de la IA'+detalleError(err)+'.'}));
  });
}

async function borrarEntradaIA(ref,partes){
  if(!partes)return;
  try{const b=db.batch();for(let i=0;i<partes;i++)b.delete(ref.collection('entrada').doc(String(i)));await b.commit()}
  catch(e){console.warn('No se pudieron limpiar los trozos del PDF:',e)}
}
async function pedirIA(texto,materiaNombre,statusEl,pdf){
  const token=await auth.currentUser.getIdToken();   // prueba de que hay sesión iniciada
  const cabeceras={'content-type':'application/json','authorization':'Bearer '+token};
  const base=pdf?{materia:materiaNombre}:{texto:texto.slice(0,IA_MAX_CHARS),materia:materiaNombre};   // la función usa hasta IA_MAX_CHARS caracteres
  let partesPdf=0;

  /* 1) En segundo plano: sin el límite de tiempo de las funciones normales */
  const jobId=uid();
  const ref=db.collection('iaJobs').doc(jobId);
  let lanzado=false,motivo='';
  try{
    await ref.set({uid:currentUid,estado:'pendiente',creado:Date.now()});
    if(pdf){
      /* El PDF no cabe en la petición (límite de 256 KB): se sube troceado a Firestore y la función en segundo plano lo lee de ahí */
      const b64=await archivoABase64(pdf);
      partesPdf=Math.ceil(b64.length/ARCH_PARTE);
      for(let i=0;i<partesPdf;i++){
        statusEl.textContent='📤 Enviando el PDF a la IA… '+(i+1)+'/'+partesPdf;
        await ref.collection('entrada').doc(String(i)).set({i,uid:currentUid,data:b64.slice(i*ARCH_PARTE,(i+1)*ARCH_PARTE)});
      }
    }
    const r=await fetch('/.netlify/functions/generar-tema-background',{
      method:'POST',headers:cabeceras,body:JSON.stringify({...base,jobId,...(partesPdf?{pdfPartes:partesPdf}:{})})
    });
    lanzado=r.status===202;
    if(!lanzado){
      motivo=r.status===404?'Netlify no encuentra la función generar-tema-background (revisa que el archivo se llame exactamente así y esté en netlify/functions)'
        :'la función en segundo plano respondió '+r.status+' (mira Logs → Functions en Netlify)';
      console.warn('El modo en segundo plano respondió',r.status,'; uso la función normal.');
    }
  }catch(e){
    motivo=(e&&e.code==='permission-denied')
      ?'faltan publicar las reglas de Firestore (colección iaJobs): Firebase → Firestore Database → Rules → Publish'
      :'no se pudo iniciar ('+((e&&(e.code||e.message))||'error')+')';
    console.warn('Modo en segundo plano no disponible; uso la función normal:',e);
  }
  if(lanzado)return esperarTrabajoIA(ref,statusEl,partesPdf?()=>borrarEntradaIA(ref,partesPdf):null);
  if(pdf){
    /* Un PDF escaneado solo se puede leer en segundo plano (la función normal no acepta archivos tan grandes) */
    await borrarEntradaIA(ref,partesPdf);try{ref.delete()}catch(e){}
    return{ok:false,error:'No se pudo enviar el PDF escaneado a la IA ('+motivo+').'};
  }
  try{ref.delete()}catch(e){}
  statusEl.textContent='🤖 Usando el modo normal (el de segundo plano no está disponible: '+motivo+'). Puede tardar hasta un minuto…';

  /* 2) Respaldo: función normal (con su límite de tiempo) */
  const resp=await fetch('/.netlify/functions/generar-tema',{method:'POST',headers:cabeceras,body:JSON.stringify(base)});
  let data=null;
  try{data=await resp.json()}catch(e){}
  if(!resp.ok||!data){
    return{ok:false,error:((data&&data.error)||('El servidor no pudo completar la petición (código '+resp.status+'). Suele pasar cuando la IA tarda demasiado; prueba con un archivo más corto o inténtalo de nuevo.'))
      +' [Modo en segundo plano no disponible: '+motivo+']'};
  }
  return{ok:true,data};
}


