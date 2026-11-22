/* ======================= Ayuda: preguntas frecuentes, dudas y reporte de fallos =======================
   Pantalla «❓ Ayuda» (#/ayuda), para todos los roles:
     · Preguntas frecuentes con buscador (cada rol ve las que le sirven).
     · «Reportar un fallo» y «Enviar una duda»: se guardan en Firestore (reportes/{uid}_{n}). Las reglas solo dejan
       crear uno por minuto por cuenta (contador reportesUso/{uid}) y con campos y tamaños conocidos.
     · «Mis reportes»: lo que la persona envió, su estado y la respuesta del equipo.
   Los admin los ven en Admin → «📨 Reportes», donde cambian el estado, responden o los borran.
   Cuando el equipo responde, la persona ve un aviso 🔔 (estudiantes) o un mensaje al abrir Auren (profesores). */
var ayudaTab='faq',ayudaBuscar='',ayudaPantallaPrevia='#/',ayudaEnviando=false;
var misReportes=null,misReportesCargando=false,misReportesError='';
var adminReportes=null,adminReportesCargando=false,adminReportesError='',adminRepEstado='abiertos',adminRepTipo='todos';

const REP_ESTADOS={nuevo:'🆕 Nuevo',revisando:'🔎 En revisión',resuelto:'✅ Resuelto'};
const REP_CAT_FALLO=['Iniciar sesión o cuenta','Materias y temas','Subir PDF o PPTX / IA','Resúmenes y flashcards','Quiz y exámenes','Calendario','Racha y logros','Colores y apariencia','Notificaciones','Otro'];
const REP_CAT_DUDA=['Cómo usar Auren','Materias y códigos','IA y archivos','Estudio y exámenes','Racha y logros','Mi cuenta y mis datos','Otra'];
const REP_MIN=10,REP_MAX=2000,REP_ESPERA=60000;

/* ---------- Preguntas frecuentes ----------
   r: a qué roles se muestra ('e' estudiante, 'p' profesor/admin). Sin r: a todos. */
const FAQ=[
  {g:'Primeros pasos',q:'¿Qué es Auren?',a:'Auren es una app para organizar tus materias y estudiar mejor con ayuda de inteligencia artificial. Los profesores suben sus documentos, la IA los convierte en temas con resumen y flashcards, y los estudiantes estudian con quiz, modo examen, repaso y más.'},
  {g:'Primeros pasos',q:'¿Puedo instalar Auren en mi celular o computador?',a:'Sí. Auren es una aplicación web que se puede instalar. En Android (Chrome) toca el menú ⋮ y luego «Instalar app» o «Agregar a la pantalla principal». En iPhone (Safari) toca Compartir y luego «Agregar a inicio». En el computador, busca el ícono de instalar en la barra de direcciones.'},
  {g:'Primeros pasos',q:'¿Cuál es la diferencia entre estudiante, profesor y administrador?',a:'Las cuentas nuevas nacen como estudiante: entran a las materias con un código, estudian y llevan su racha. El profesor crea materias, sube archivos para que la IA arme los temas y publica exámenes, eventos y anuncios. El administrador asigna los roles. Nadie puede cambiar su propio rol: si eres profesor, pídele a un administrador que te lo asigne.'},
  {g:'Materias',r:'e',q:'¿Cómo entro a la materia de mi profesor?',a:'Abre el menú (☰) y toca «🔗 Unirme con código». Escribe el código que te dio tu profesor. También puedes entrar con el enlace de invitación que te comparta. Los estudiantes no crean materias: las crea el profesor.'},
  {g:'Materias',r:'p',q:'¿Cómo invito a mis estudiantes a una materia?',a:'Entra a la materia desde «🏫 Mis materias». Ahí verás su código de clase y el enlace de invitación para compartir. Cada estudiante lo escribe en «🔗 Unirme con código».'},
  {g:'Materias',r:'e',q:'El código de la materia no funciona. ¿Qué hago?',a:'Revisa que lo escribiste igual (sin espacios de más) y que tienes conexión. Si sigue sin funcionar, puede que el profesor haya cambiado o cerrado el código: pídele uno nuevo. Si el problema continúa, repórtalo desde «🐞 Reportar un fallo».'},
  {g:'Materias',r:'e',q:'¿Puedo salir de una materia?',a:'Sí, desde la propia materia. Tus entregas de exámenes quedan guardadas en la materia del profesor.'},
  {g:'Archivos e IA',r:'p',q:'¿Qué archivos puedo subir y de qué tamaño?',a:'PDF y PPTX de hasta 8 MB. Si tu PDF pesa más, usa la opción de comprimir PDF antes de subirlo. La IA lee el documento y crea un tema con resumen, secciones y flashcards.'},
  {g:'Archivos e IA',r:'p',q:'¿Cuántos archivos puedo analizar con la IA al día?',a:'Hasta '+IA_LIMITE_DIARIO+' archivos por persona y por día. El cupo se renueva a la medianoche (hora de Colombia). Si vuelves a subir un archivo que ya analizaste en ese navegador, no gasta cupo; si la IA falla, tampoco.'},
  {g:'Archivos e IA',q:'¿Por qué no puedo subir archivos?',a:'Solo los profesores y administradores suben archivos y usan la IA para crear temas. Los estudiantes estudian los temas que publica su profesor y pueden guardar sus propios apuntes.'},
  {g:'Archivos e IA',q:'El resumen o las flashcards tienen un error. ¿Qué hago?',a:'La IA puede equivocarse. El profesor puede editar el tema y sus tarjetas desde la materia. Si es un estudiante quien lo nota, lo mejor es avisarle al profesor. Si crees que es un fallo de la app, repórtalo.'},
  {g:'Archivos e IA',r:'p',q:'La IA tarda mucho o falla con un PDF escaneado.',a:'Los PDF escaneados (fotos de páginas) tardan más porque la IA tiene que leer las imágenes. Espera unos minutos sin cerrar la página. Si falla, intenta con un archivo más liviano o comprimido. Un intento fallido no gasta tu cupo.'},
  {g:'Estudiar',r:'e',q:'¿Qué herramientas de estudio tengo?',a:'Dentro de cada materia, en «Estudiar»: flashcards, memorizar, quiz, modo examen, preguntas escritas, conceptos, emparejar, repaso de lo que fallaste, comparar y tu progreso. También tienes «Mis apuntes» (privados), el lector de voz 🔊 y el reloj Pomodoro 🍅 desde el menú.'},
  {g:'Estudiar',r:'e',q:'¿Mis apuntes los ve mi profesor?',a:'No. «Mis apuntes» son privados: solo tú los puedes leer o editar, ni el profesor ni un administrador.'},
  {g:'Estudiar',r:'e',q:'¿Cómo presento los exámenes de mi profesor?',a:'Entra a la materia y busca «Exámenes de tu profesor». Si el examen tiene tiempo, verás un cronómetro fijo. Cada estudiante puede recibir preguntas distintas del banco del profesor. Al entregarlo, las preguntas respondidas también suman a tu racha.'},
  {g:'Racha y logros',r:'e',q:'¿Cómo funciona la racha?',a:'Cada día que respondes '+META_RACHA+' preguntas (en Quiz, Modo examen o exámenes del profesor) ese día cuenta para tu racha. Las preguntas de más son práctica extra y dan XP. Si hoy todavía no estudias, tu racha sigue viva hasta que termine el día.'},
  {g:'Racha y logros',r:'e',q:'Perdí mi racha por un día. ¿Se puede recuperar?',a:'Una vez por semana Auren cubre automáticamente un día que no estudiaste, para que la racha no se rompa (ese día no suma, solo la protege). Si ya se usó esa semana, la racha vuelve a empezar. Si crees que Auren no contó un día que sí estudiaste, repórtalo indicando la fecha.'},
  {g:'Racha y logros',r:'e',q:'¿Quién ve mi racha?',a:'Tu profesor ve la racha de los estudiantes de sus materias (racha actual, mejor racha y días de estudio) y los administradores ven la de todos. Nadie más.'},
  {g:'Racha y logros',r:'p',q:'¿Dónde veo la racha de mis estudiantes?',a:'En cada materia tuya, pestaña «🔥 Rachas». Ahí ves la racha actual, la mejor racha y los últimos días de estudio, y puedes descargarlo en Excel.'},
  {g:'Calendario',r:'e',q:'¿Cómo agrego un evento al calendario?',a:'Ve a «🗓️ Calendario», toca un día y luego «+ Agregar evento». Los eventos que publica tu profesor aparecen con otro color y te llega un aviso 🔔 cuando se acercan.'},
  {g:'Calendario',r:'p',q:'¿Cómo publico un evento para mis estudiantes?',a:'Desde la materia, en su sección de eventos, o desde el calendario con «👩‍🏫 Evento para mis estudiantes». Tus estudiantes lo ven en su calendario y reciben un aviso.'},
  {g:'Apariencia',q:'¿Cómo cambio los colores o el modo oscuro?',a:'El botón ☀️/🌙 de la barra de arriba cambia entre modo claro y oscuro. En «👤 Perfil» → «Colores» eliges el color de acento y el fondo: hay colores listos o puedes elegir cualquiera con la rueda o escribiendo su código. «Colores originales» vuelve a los de siempre.'},
  {g:'Apariencia',r:'e',q:'No me llegan los avisos 🔔.',a:'Revisa en «👤 Perfil» que los avisos estén activados y que el navegador tenga permiso para mostrar notificaciones. Los avisos llegan mientras Auren está abierta o instalada y activa en segundo plano: con la app completamente cerrada no llegan.'},
  {g:'Cuenta y datos',q:'¿Mis datos se guardan si cambio de celular?',a:'Sí. Todo queda guardado en tu cuenta: entra con el mismo correo o con Google en el otro dispositivo. Desde «👤 Perfil» → «Tus datos» también puedes descargar una copia de respaldo.'},
  {g:'Cuenta y datos',q:'Olvidé mi contraseña.',a:'Si entraste con Google, usa «Continuar con Google». Si creaste la cuenta con correo y contraseña, por ahora Auren no tiene una opción para recuperarla desde la app: escríbele al administrador al correo de contacto que aparece al final de los Términos de servicio.'},
  {g:'Cuenta y datos',q:'¿Cómo elimino mi cuenta?',a:'En «👤 Perfil» → «Cuenta» → «🗑️ Eliminar mi cuenta». Se borran tus datos personales, incluidos tus reportes y dudas. No se puede deshacer.'},
  {g:'Cuenta y datos',q:'¿Qué pasa con lo que envío en Ayuda?',a:'Tus reportes y dudas los leen solo los administradores de Auren para corregir fallos y responderte. Incluyen tu nombre y correo para poder contestarte y, si lo permites, datos técnicos (navegador y pantalla). Puedes borrarlos desde «📨 Mis reportes».'}
];
function faqVisibles(){
  const prof=esProfesor(),f=ayudaBuscar.trim().toLowerCase();
  const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const fn=norm(f);
  return FAQ.filter(x=>(!x.r||(x.r==='p')===prof)&&(!fn||norm(x.q+' '+x.a+' '+x.g).includes(fn)));
}
function faqHTML(){
  const L=faqVisibles(),grupos=[];
  L.forEach(x=>{let g=grupos.find(y=>y.g===x.g);if(!g)grupos.push(g={g:x.g,items:[]});g.items.push(x)});
  return `<input class="fld" type="search" data-action="ayudaBuscar" placeholder="Busca tu duda: racha, código, PDF, colores…" value="${esc(ayudaBuscar)}" aria-label="Buscar en preguntas frecuentes">
    ${grupos.map(g=>`<h3 class="faqG">${esc(g.g)}</h3>${g.items.map(x=>`<details class="card faq" data-key="faq-${esc(x.q)}"><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}`).join('')
      ||`<p class="meta">No encontramos preguntas con «${esc(ayudaBuscar)}».</p>`}
    <div class="card faqMas"><b>¿No encontraste tu respuesta?</b><p class="meta">Escríbenos tu pregunta y el equipo de Auren te responde aquí mismo.</p>
      <div class="row" style="flex-wrap:wrap;gap:8px"><button class="pr" data-action="ayudaTab" data-tab="duda">💬 Enviar una duda</button><button class="sec" data-action="ayudaTab" data-tab="fallo">🐞 Reportar un fallo</button></div></div>`;
}

/* ---------- Formularios ---------- */
function formReporteHTML(tipo){
  const fallo=tipo==='fallo',cats=fallo?REP_CAT_FALLO:REP_CAT_DUDA;
  return `<form class="card repForm" data-ayuda-form="${tipo}" data-key="form-${tipo}" novalidate>
    <p class="meta" style="margin-top:0">${fallo?'Cuéntanos qué salió mal. Mientras más detalles, más rápido lo corregimos.':'Pregunta lo que quieras sobre Auren. Te responderemos en «📨 Mis reportes».'}</p>
    <label class="lbl" for="rep-${tipo}-cat">${fallo?'¿Dónde pasó?':'Tema'}</label>
    <select class="fld" id="rep-${tipo}-cat" name="categoria">${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
    <label class="lbl" for="rep-${tipo}-msg">${fallo?'¿Qué pasó?':'Tu duda'}</label>
    <textarea class="fld" id="rep-${tipo}-msg" name="mensaje" maxlength="${REP_MAX}" required placeholder="${fallo?'Ej. Al subir un PDF se queda cargando y nunca termina.':'Ej. ¿Puedo estudiar una materia sin conexión a internet?'}"></textarea>
    ${fallo?`<label class="lbl" for="rep-fallo-pasos">Pasos para que vuelva a pasar (opcional)</label>
    <textarea class="fld" id="rep-fallo-pasos" name="pasos" maxlength="${REP_MAX}" placeholder="1. Entré a la materia…&#10;2. Toqué «Subir archivo»…&#10;3. …"></textarea>
    <label class="chkLinea"><input type="checkbox" name="tecnico" checked> <span>Incluir datos técnicos (navegador, tamaño de pantalla y la última pantalla que abriste). Nos ayudan a encontrar el fallo.</span></label>`:''}
    <div class="row" style="margin-top:12px"><button type="submit" class="pr" ${ayudaEnviando?'disabled':''}>${ayudaEnviando?'Enviando…':fallo?'🐞 Enviar reporte':'💬 Enviar duda'}</button></div>
  </form>`;
}
function ayudaRecordarPantalla(){try{if(route.view!=='ayuda')ayudaPantallaPrevia=rutaAHash(route)}catch(e){}}
function ultimoEnvioKey(){return 'auren_rep_ultimo_'+currentUid}
async function enviarReporte(form){
  const tipo=form.dataset.ayudaForm==='fallo'?'fallo':'duda';
  if(!currentUid||ayudaEnviando)return;
  const fd=new FormData(form);
  const mensaje=String(fd.get('mensaje')||'').trim().slice(0,REP_MAX);
  const pasos=String(fd.get('pasos')||'').trim().slice(0,REP_MAX);
  const lista=tipo==='fallo'?REP_CAT_FALLO:REP_CAT_DUDA;
  const categoria=lista.includes(String(fd.get('categoria')))?String(fd.get('categoria')):lista[lista.length-1];
  if(mensaje.length<REP_MIN){UI.alerta(tipo==='fallo'?'Describe un poco más el fallo (mínimo '+REP_MIN+' caracteres).':'Escribe tu duda con un poco más de detalle (mínimo '+REP_MIN+' caracteres).');return}
  let ultimo=0;try{ultimo=+localStorage.getItem(ultimoEnvioKey())||0}catch(e){}
  const falta=REP_ESPERA-(Date.now()-ultimo);
  if(falta>0){UI.alerta('Acabas de enviar algo. Espera '+Math.ceil(falta/1000)+' segundos para enviar otro.');return}
  const u=auth.currentUser,p=state.profile||{};
  const datos={
    tipo,categoria,mensaje,uid:currentUid,
    email:String(u&&u.email||'').slice(0,254),
    nombre:String(p.name||u&&u.displayName||'').slice(0,120),
    rol:String(p.rol||'estudiante').slice(0,20),
    estado:'nuevo',creado:firebase.firestore.FieldValue.serverTimestamp()
  };
  if(tipo==='fallo'){
    if(pasos)datos.pasos=pasos;
    if(fd.get('tecnico')){
      datos.navegador=String(navigator.userAgent||'').slice(0,300);
      datos.pantalla=(String(ayudaPantallaPrevia||'#/')+' · '+window.innerWidth+'×'+window.innerHeight+(window.matchMedia&&matchMedia('(display-mode: standalone)').matches?' · instalada':'')).slice(0,200);
      const s=document.querySelector('script[src*="assets/app."]');
      datos.app=String(s&&s.getAttribute('src')||'').replace(/^.*assets\//,'').slice(0,40);
    }
  }
  ayudaEnviando=true;render(true);
  try{
    const usoRef=db.collection('reportesUso').doc(currentUid);
    await db.runTransaction(async tx=>{
      const uso=await tx.get(usoRef);
      const n=(uso.exists&&+uso.data().n||0)+1;
      tx.set(usoRef,{n,ultimo:firebase.firestore.FieldValue.serverTimestamp()});
      tx.set(db.collection('reportes').doc(currentUid+'_'+n),datos);
    });
    try{localStorage.setItem(ultimoEnvioKey(),String(Date.now()))}catch(e){}
    form.reset();
    misReportes=null;ayudaTab='mis';
    toast(tipo==='fallo'?'🐞 ¡Gracias! Recibimos tu reporte.':'💬 ¡Listo! Te responderemos pronto.');
  }catch(e){
    console.error(e);
    UI.alerta(e&&e.code==='permission-denied'
      ?'No se pudo enviar. Si acabas de enviar algo, espera un minuto e inténtalo de nuevo. Si sigue fallando, puede que falte publicar las reglas nuevas de Firestore.'
      :'No se pudo enviar'+detalleError(e)+'. Revisa tu conexión e inténtalo de nuevo.');
  }
  ayudaEnviando=false;
  if(route.view==='ayuda')render(true);
}
document.addEventListener('submit',e=>{
  const f=e.target&&e.target.closest&&e.target.closest('form[data-ayuda-form]');if(!f)return;
  e.preventDefault();enviarReporte(f);
});

/* ---------- Mis reportes ---------- */
const fechaRep=t=>{const d=t&&t.toDate?t.toDate():null;return d?d.toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})+' · '+d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}):'ahora'};
const msRep=t=>t&&t.toMillis?t.toMillis():Date.now();
const repChipEstado=e=>`<span class="chip repEst repEst-${esc(e||'nuevo')}">${REP_ESTADOS[e]||REP_ESTADOS.nuevo}</span>`;
async function cargarMisReportes(){
  if(!currentUid||misReportesCargando)return;
  misReportesCargando=true;misReportesError='';
  try{
    const s=await db.collection('reportes').where('uid','==',currentUid).limit(100).get();
    misReportes=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>msRep(b.creado)-msRep(a.creado));
    marcarRespuestasVistas(misReportes);
  }catch(e){console.error(e);misReportesError='No se pudieron leer tus reportes'+detalleError(e)+'.';misReportes=misReportes||[]}
  misReportesCargando=false;
  if(route.view==='ayuda')render(true);
}
function misReportesHTML(){
  if(misReportes===null&&!misReportesCargando)setTimeout(cargarMisReportes,0);
  if(misReportesError)return `<div class="card shareBox" role="alert">${esc(misReportesError)}</div>`;
  if(!misReportes)return '<p class="meta">Cargando…</p>';
  if(!misReportes.length)return '<div class="empty">Todavía no has enviado reportes ni dudas.</div>';
  return misReportes.map(r=>`<div class="card ayRep" data-key="mis-${esc(r.id)}">
    <div class="repHead"><b>${r.tipo==='fallo'?'🐞 Fallo':'💬 Duda'} · ${esc(r.categoria||'')}</b>${repChipEstado(r.estado)}</div>
    <p class="meta" style="margin:2px 0 8px">${fechaRep(r.creado)}</p>
    <p class="repTxt">${esc(r.mensaje||'')}</p>
    ${r.pasos?`<p class="repTxt meta">${esc(r.pasos)}</p>`:''}
    ${r.respuesta?`<div class="repResp"><b>Respuesta del equipo de Auren</b>${r.respondido?` <span class="meta">· ${fechaRep(r.respondido)}</span>`:''}<p class="repTxt">${esc(r.respuesta)}</p></div>`:'<p class="meta">Aún sin respuesta.</p>'}
    <div class="row" style="justify-content:flex-end;margin-bottom:0"><button class="sec sm" data-action="misRepBorrar" data-rep="${esc(r.id)}">🗑️ Borrar</button></div>
  </div>`).join('');
}

/* Avisa cuando el equipo respondió algo que la persona todavía no ha visto */
const respVistasKey=()=>'auren_rep_vistas_'+currentUid;
function respVistas(){try{return JSON.parse(localStorage.getItem(respVistasKey())||'{}')||{}}catch(e){return{}}}
function marcarRespuestasVistas(lista){
  const v=respVistas();let cambio=false;
  lista.forEach(r=>{if(r.respuesta){const t=msRep(r.respondido);if(v[r.id]!==t){v[r.id]=t;cambio=true}}});
  if(cambio)try{localStorage.setItem(respVistasKey(),JSON.stringify(v))}catch(e){}
}
async function revisarRespuestasReportes(){
  if(!currentUid)return;
  try{
    const s=await db.collection('reportes').where('uid','==',currentUid).limit(100).get();
    const v=respVistas();
    const nuevas=s.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.respuesta&&v[r.id]!==msRep(r.respondido));
    if(!nuevas.length)return;
    nuevas.forEach(r=>{
      const texto='💬 Respondimos tu '+(r.tipo==='fallo'?'reporte':'duda')+' sobre «'+String(r.categoria||'Auren')+'». Míralo en Ayuda → Mis reportes.';
      if(!esProfesor()&&avisosActivos())avAgregar({tipo:'ayuda',texto,clave:'rep|'+r.id+'|'+msRep(r.respondido)});
      else toast(esc(texto));
      v[r.id]=msRep(r.respondido);
    });
    try{localStorage.setItem(respVistasKey(),JSON.stringify(v))}catch(e){}
    misReportes=null;
  }catch(e){console.warn('No se pudieron revisar las respuestas de Ayuda:',e)}
}

/* ---------- Pantalla de Ayuda ---------- */
function viewAyudaHTML(){
  const nResp=(misReportes||[]).filter(r=>r.respuesta).length;
  const tabs=[['faq','❔ Preguntas frecuentes'],['fallo','🐞 Reportar un fallo'],['duda','💬 Enviar una duda'],['mis','📨 Mis reportes'+(misReportes&&misReportes.length?' ('+misReportes.length+')':'')]];
  let cuerpo='';
  if(ayudaTab==='fallo')cuerpo=formReporteHTML('fallo');
  else if(ayudaTab==='duda')cuerpo=formReporteHTML('duda');
  else if(ayudaTab==='mis')cuerpo=misReportesHTML();
  else cuerpo=faqHTML();
  return `<div class="viewhead"><h1>❓ Ayuda</h1></div>
    <p class="meta">Resuelve tus dudas, cuéntanos si algo falla y revisa nuestras respuestas.${nResp?' Tienes '+nResp+' '+(nResp===1?'respuesta':'respuestas')+' en «Mis reportes».':''}</p>
    <div class="tabsT" role="tablist" style="margin:10px 0 14px">${tabs.map(([k,t])=>`<button type="button" role="tab" aria-selected="${ayudaTab===k}" data-action="ayudaTab" data-tab="${k}" class="${ayudaTab===k?'on':''}">${t}</button>`).join('')}</div>
    <div data-key="ayuda-${ayudaTab}">${cuerpo}</div>`;
}

/* ---------- Admin: pestaña «📨 Reportes» ---------- */
async function cargarReportesAdmin(){
  if(!esAdmin()||adminReportesCargando)return;
  adminReportesCargando=true;adminReportesError='';
  try{
    const s=await db.collection('reportes').orderBy('creado','desc').limit(300).get();
    adminReportes=s.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){console.error(e);adminReportesError='No se pudieron leer los reportes'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?';adminReportes=adminReportes||[]}
  adminReportesCargando=false;
  if(route.view==='admin')render(true);
}
function adminReportesAbiertos(){return(adminReportes||[]).filter(r=>r.estado!=='resuelto').length}
function adminReportesHTML(){
  if(adminReportes===null&&!adminReportesCargando)setTimeout(cargarReportesAdmin,0);
  const L=(adminReportes||[]).filter(r=>(adminRepEstado==='todos'||(adminRepEstado==='abiertos'?r.estado!=='resuelto':r.estado===adminRepEstado))&&(adminRepTipo==='todos'||r.tipo===adminRepTipo));
  const sel=(acc,val,ops,lab)=>`<select class="fld" data-action="${acc}" aria-label="${lab}" style="margin:0;width:auto">${ops.map(([v,t])=>`<option value="${v}" ${val===v?'selected':''}>${t}</option>`).join('')}</select>`;
  return `<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:0">
      ${sel('adminRepEstado',adminRepEstado,[['abiertos','Sin resolver'],['nuevo','Nuevos'],['revisando','En revisión'],['resuelto','Resueltos'],['todos','Todos']],'Filtrar por estado')}
      ${sel('adminRepTipo',adminRepTipo,[['todos','Fallos y dudas'],['fallo','Solo fallos'],['duda','Solo dudas']],'Filtrar por tipo')}
      <span class="meta">${L.length} ${L.length===1?'reporte':'reportes'}</span></div>
    ${adminReportesError?`<div class="card shareBox" role="alert">${esc(adminReportesError)}</div>`:''}
    ${adminReportesCargando&&!adminReportes?'<p class="meta">Cargando…</p>':L.map(r=>`<div class="card ayRep" data-key="rep-${esc(r.id)}">
      <div class="repHead"><b>${r.tipo==='fallo'?'🐞 Fallo':'💬 Duda'} · ${esc(r.categoria||'')}</b>${repChipEstado(r.estado)}</div>
      <p class="meta" style="margin:2px 0 8px">${esc(r.nombre||'(sin nombre)')} · ${esc(r.email||'sin correo')} · ${esc(nombreRol(rolInterno(r.rol)))} · ${fechaRep(r.creado)}</p>
      <p class="repTxt">${esc(r.mensaje||'')}</p>
      ${r.pasos?`<p class="lbl" style="margin-top:8px">Pasos</p><p class="repTxt">${esc(r.pasos)}</p>`:''}
      ${r.navegador||r.pantalla?`<details class="repTec"><summary class="meta">Datos técnicos</summary><p class="meta">${esc(r.pantalla||'')}${r.app?' · '+esc(r.app):''}<br>${esc(r.navegador||'')}</p></details>`:''}
      ${r.respuesta?`<div class="repResp"><b>Tu respuesta</b>${r.respondido?` <span class="meta">· ${fechaRep(r.respondido)}</span>`:''}<p class="repTxt">${esc(r.respuesta)}</p></div>`:''}
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:0">
        ${sel('adminRepCambiarEstado" data-rep="'+esc(r.id),r.estado||'nuevo',Object.entries(REP_ESTADOS),'Estado del reporte')}
        <button class="sec sm" data-action="adminRepResponder" data-rep="${esc(r.id)}">✉️ ${r.respuesta?'Editar respuesta':'Responder'}</button>
        <button class="sec sm" data-action="adminRepBorrar" data-rep="${esc(r.id)}">🗑️ Borrar</button></div>
    </div>`).join('')||'<div class="empty">No hay reportes con este filtro. 🎉</div>'}`;
}
async function adminRepActualizar(id,cambio,msg){
  const r=(adminReportes||[]).find(x=>x.id===id);if(!r||!esAdmin())return;
  try{
    await db.collection('reportes').doc(id).update(cambio);
    const s=await db.collection('reportes').doc(id).get();
    if(s.exists)Object.assign(r,s.data());
    if(msg)toast(msg);
  }catch(e){console.error(e);UI.alerta('No se pudo actualizar el reporte'+detalleError(e)+'.')}
  render(true);
}

/* ---------- Acciones ---------- */
document.addEventListener('click',async e=>{
  const b=e.target.closest&&e.target.closest('[data-action]');if(!b)return;
  const a=b.dataset.action;
  if(a==='ayudaTab'){ayudaTab=['faq','fallo','duda','mis'].includes(b.dataset.tab)?b.dataset.tab:'faq';if(route.view!=='ayuda')goToView('ayuda');else render(true)}
  else if(a==='misRepBorrar'){
    const id=b.dataset.rep;
    if(!await UI.confirmar('¿Borrar este reporte? El equipo de Auren ya no podrá verlo.'))return;
    try{await db.collection('reportes').doc(id).delete();misReportes=(misReportes||[]).filter(x=>x.id!==id);toast('🗑️ Reporte borrado')}
    catch(err){console.error(err);UI.alerta('No se pudo borrar'+detalleError(err)+'.')}
    render(true);
  }
  else if(a==='adminRepResponder'&&esAdmin()){
    const r=(adminReportes||[]).find(x=>x.id===b.dataset.rep);if(!r)return;
    const res=await UI.preguntar('Responder a '+(r.nombre||r.email||'la persona'),[
      {k:'t',l:'Respuesta (la verá en Ayuda → Mis reportes)',area:true,v:r.respuesta||''},
      {k:'e',l:'Estado',t:'select',v:r.respuesta?r.estado:'resuelto',o:Object.entries(REP_ESTADOS)}
    ],{ok:'Enviar respuesta'});
    if(!res)return;
    const t=String(res.t||'').trim().slice(0,REP_MAX);
    if(!t){UI.alerta('Escribe una respuesta.');return}
    adminRepActualizar(r.id,{respuesta:t,estado:REP_ESTADOS[res.e]?res.e:'resuelto',respondido:firebase.firestore.FieldValue.serverTimestamp()},'✉️ Respuesta enviada');
  }
  else if(a==='adminRepBorrar'&&esAdmin()){
    if(!await UI.confirmar('¿Borrar este reporte? No se puede deshacer.'))return;
    try{await db.collection('reportes').doc(b.dataset.rep).delete();adminReportes=(adminReportes||[]).filter(x=>x.id!==b.dataset.rep);toast('🗑️ Reporte borrado')}
    catch(err){console.error(err);UI.alerta('No se pudo borrar'+detalleError(err)+'.')}
    render(true);
  }
});
document.addEventListener('input',e=>{
  const a=e.target&&e.target.dataset&&e.target.dataset.action;if(!a)return;
  if(a==='ayudaBuscar'){ayudaBuscar=e.target.value;render(true)}
  else if(a==='adminRepEstado'){adminRepEstado=e.target.value;render(true)}
  else if(a==='adminRepTipo'){adminRepTipo=e.target.value;render(true)}
  else if(a==='adminRepCambiarEstado'&&esAdmin()&&REP_ESTADOS[e.target.value])adminRepActualizar(e.target.dataset.rep,{estado:e.target.value},'Estado actualizado');
});

/* Al eliminar la propia cuenta también se borran sus reportes (llevan nombre y correo) */
async function borrarMisReportes(u){
  const s=await db.collection('reportes').where('uid','==',u).limit(500).get();
  for(let i=0;i<s.docs.length;i+=400){const b=db.batch();s.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit()}
}
