/* ================= UTILIDADES ================= */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const fmtDateLong=s=>new Date(s+'T00:00').toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long'});
const relDate=s=>{const n=Math.round((new Date(s+'T00:00')-new Date(ymd(new Date())+'T00:00'))/864e5);return n==0?'hoy':n==1?'mañana':n>1?`en ${n} días`:`hace ${-n} días`};
const TY={ex:'📝 Examen',en:'📤 Entrega',ac:'🎯 Actividad',ot:'📌 Otro'};
const AV=['🎓','📚','🦉','🐱','🦊','🐼','🌸','⭐','🔥','🌙'];

/* ================= ESTADO ================= */
function defaultState(){return{
  profile:{name:'',career:'',avatar:'🎓',examDate:'',scale:5,goal:4,notes:'',rol:''},
  theme:null,
  fx:null,
  semesters:[{id:uid(),name:'Semestre 1'}],
  materias:[],
  temas:[],
  cortes:[],
  cards:[],
  attempts:[],
  events:[],
  progress:{days:[],badges:{},sellos:{},exams:0,sembrado:true}
}}
/* Hecho por Sebastián Poveda y Santiago Romero. 2026 · estado y cortes */
const CORTES_DEFECTO=[['Corte 1',30],['Corte 2',30],['Corte 3',40]];
/* Garantiza: escala de notas, al menos un corte por materia y que cada tema esté dentro de un corte. */
function ensureCortes(){
  let changed=false;
  const pf=state.profile=state.profile||{};
  if(pf.scale==null){const g=+pf.goal;pf.scale=g>10?100:(g>5?10:5);changed=true}
  if(!(+pf.goal>=0)){pf.goal=pf.scale===100?80:(pf.scale===10?8:4);changed=true}
  state.cortes=state.cortes||[];state.temas=state.temas||[];
  (state.materias||[]).forEach(m=>{
    let cs=state.cortes.filter(c=>c.materiaId===m.id);
    if(!cs.length){
      CORTES_DEFECTO.forEach(([name,weight])=>state.cortes.push({id:uid(),materiaId:m.id,name,weight,score:null}));
      cs=state.cortes.filter(c=>c.materiaId===m.id);changed=true;
    }
    const ids=new Set(cs.map(c=>c.id));
    state.temas.forEach(t=>{if(t.materiaId===m.id&&!ids.has(t.corteId)){t.corteId=cs[0].id;changed=true}});
  });
  return changed;
}
function normalizeState(){
  if(ensureCortes())scheduleCloud();
  state.cards=state.cards||[];
  state.attempts=state.attempts||[];
  state.events=state.events||[];
  (state.materias||[]).forEach(m=>{if(m.refs==null)m.refs=''});
  state.cards.forEach(c=>{if(c.known===undefined)c.known=null});
  sembrarProgreso();
}
let state=defaultState();
let currentUid=null;
let route={view:'materias',materiaId:null};
let calView={y:new Date().getFullYear(),m:new Date().getMonth(),sel:null};
let toolState=null;
let repasoTimer=null;
function clearRepasoTimer(){if(repasoTimer){clearInterval(repasoTimer);repasoTimer=null}}

function localKey(){return 'cuaderno_'+(currentUid||'anon')}
function saveLocal(){try{localStorage.setItem(localKey(),JSON.stringify(state))}catch(e){}}
function loadLocal(){try{const raw=localStorage.getItem(localKey());return raw?JSON.parse(raw):null}catch(e){return null}}

/* ======================= Diálogos propios =======================
   Reemplazan alert/confirm/prompt del navegador (que en la app instalada muestran la dirección del sitio y se ven fuera de lugar).
   Se encolan: si salen varios seguidos, se muestran de a uno. Funcionan con teclado (Enter acepta, Esc cancela). */
const dlgCola=[];let dlgActivo=false;
function dialogo(op){return new Promise(res=>{dlgCola.push({op,res});if(!dlgActivo)dlgSiguiente()})}
function dlgSiguiente(){
  const it=dlgCola.shift();
  if(!it){dlgActivo=false;return}
  dlgActivo=true;
  const op=it.op,res=it.res,conCampos=!!(op.campos&&op.campos.length);
  let d=document.getElementById('dlg');
  if(!d){d=document.createElement('dialog');d.id='dlg';document.body.appendChild(d)}
  const campo=f=>{
    const lab=f.l?esc(f.l):'';
    if(f.t==='select')return `<label>${lab}<select name="${esc(f.k)}">${(f.o||[]).map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(f.v)?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`;
    if(f.area)return `<label>${lab}<textarea name="${esc(f.k)}" placeholder="${esc(f.ph||'')}">${esc(f.v==null?'':f.v)}</textarea></label>`;
    return `<label>${lab}<input name="${esc(f.k)}" type="${esc(f.t||'text')}" value="${esc(f.v==null?'':f.v)}" placeholder="${esc(f.ph||'')}" ${f.max?'maxlength="'+f.max+'"':''} ${f.step?'step="'+f.step+'"':''} autocomplete="off"></label>`;
  };
  d.innerHTML=`<form class="dform" novalidate><h3 id="dlgT">${esc(op.titulo||'')}</h3>${op.mensaje?`<p class="dmsg">${esc(op.mensaje).replace(/\n/g,'<br>')}</p>`:''}${op.html||''}${(op.campos||[]).map(campo).join('')}
    <div class="dbtns">${op.sinCancelar?'':`<button type="button" class="sec" data-x>${esc(op.cancelar||'Cancelar')}</button>`}<button type="submit" class="pr ${op.peligro?'peligro':''}">${esc(op.ok||'Aceptar')}</button></div></form>`;
  d.setAttribute('aria-labelledby','dlgT');
  let hecho=false;
  const cerrar=v=>{
    if(hecho)return;hecho=true;
    d.onclose=null;d.onclick=null;
    try{d.close()}catch(e){}
    d.removeAttribute('open');
    res(v);dlgSiguiente();
  };
  const cancelado=conCampos?null:false;
  const form=d.querySelector('form');
  form.onsubmit=e=>{e.preventDefault();cerrar(conCampos?Object.fromEntries(new FormData(form)):true)};
  const x=d.querySelector('[data-x]');if(x)x.onclick=()=>cerrar(cancelado);
  d.onclose=()=>{if(d.open)return;cerrar(op.sinCancelar?true:cancelado)};   // Esc (se ignora el 'close' atrasado del diálogo anterior cuando se abre uno seguido de otro)
  d.onclick=e=>{if(e.target===d)cerrar(op.sinCancelar?true:cancelado)};   // clic fuera
  if(typeof d.showModal==='function'){try{d.showModal()}catch(e){d.setAttribute('open','')}}else d.setAttribute('open','');
  const primero=d.querySelector('input,textarea,select')||d.querySelector('.pr');
  if(primero)primero.focus();
}
const VERBOS_PELIGRO=['Eliminar','Quitar','Salir','Rechazar','Cerrar','Borrar'];
const UI={
  alerta:m=>dialogo({titulo:'Aviso',mensaje:String(m),ok:'Entendido',sinCancelar:true}),
  confirmar:(m,ok)=>{
    const v=((String(m).match(/^¿\s*([A-Za-zÁÉÍÓÚáéíóúñ]+)/)||[])[1]||'');
    const verbo=v?v.charAt(0).toUpperCase()+v.slice(1):'';
    const etiqueta=ok||(verbo&&/^(Eliminar|Quitar|Salir|Rechazar|Cerrar|Borrar|Publicar|Entregar|Permitir|Unirte|Cambiar)$/i.test(verbo)?(verbo==='Cerrar'?'Cerrar sesión':verbo):'Aceptar');
    return dialogo({titulo:'¿Seguro?',mensaje:String(m).replace(/^¿\s*/,'¿'),ok:etiqueta,peligro:VERBOS_PELIGRO.includes(verbo)}).then(r=>!!r);
  },
  prompt:(m,def)=>dialogo({titulo:String(m),campos:[{k:'v',l:'',v:def==null?'':def}],ok:'Aceptar'}).then(r=>r?String(r.v):null),
  preguntar:(titulo,campos,opts)=>dialogo(Object.assign({titulo,campos},opts||{}))
};

/* ======================= Lector de voz ("loquendo") =======================
   Lee en voz alta el contenido (temas, secciones, tarjetas) con las voces del propio dispositivo: no se envía
   ningún texto a un servidor. La pausa detiene la lectura y recuerda por dónde iba (así funciona igual en todos los navegadores). */
const TTS_KEY='auren_voz';
const ttsDisponible=()=>typeof speechSynthesis!=='undefined'&&typeof SpeechSynthesisUtterance!=='undefined';
const tts={cola:[],idx:0,estado:'parado',titulo:'',rate:1,voz:''};
let ttsSeq=0;
try{const a=JSON.parse(localStorage.getItem(TTS_KEY)||'{}');if(a.rate>=0.5&&a.rate<=2)tts.rate=a.rate;if(typeof a.voz==='string')tts.voz=a.voz}catch(e){}
function ttsGuardar(){try{localStorage.setItem(TTS_KEY,JSON.stringify({rate:tts.rate,voz:tts.voz}))}catch(e){}}
function ttsLimpiar(s){
  return String(s||'').replace(/^#{1,3}\s+(.*)$/gm,'$1.').replace(/^[-•–*]\s+/gm,'').replace(/https?:\/\/\S+/g,' enlace ')
    .replace(/[*_`#>]+/g,' ').replace(/\s*\n+\s*/g,'. ').replace(/\.(\s*\.)+/g,'.').replace(/\s{2,}/g,' ').trim();
}
function ttsTrozos(texto,max){
  max=max||190;const out=[];
  String(texto||'').replace(/([.!?…;:])\s+/g,'$1\u0001').split('\u0001').forEach(f=>{
    f=f.trim();
    while(f.length>max){let c=f.lastIndexOf(', ',max);if(c<40)c=f.lastIndexOf(' ',max);if(c<40)c=max;out.push(f.slice(0,c+1).trim());f=f.slice(c+1).trim()}
    if(f)out.push(f);
  });
  return out;
}
function ttsVoces(){try{return speechSynthesis.getVoices().filter(v=>/^es/i.test(v.lang))}catch(e){return[]}}
function ttsVozActual(){const vs=ttsVoces();return vs.find(v=>v.name===tts.voz)||vs.find(v=>/^es[-_](CO|MX|US|419)/i.test(v.lang))||vs[0]||null}
function ttsSiguiente(){
  if(tts.estado!=='leyendo')return;
  if(tts.idx>=tts.cola.length){ttsParar();return}
  const u=new SpeechSynthesisUtterance(tts.cola[tts.idx]),v=ttsVozActual();
  if(v){u.voice=v;u.lang=v.lang}else u.lang='es-ES';
  u.rate=tts.rate;
  const mio=++ttsSeq;
  u.onend=()=>{if(mio===ttsSeq&&tts.estado==='leyendo'){tts.idx++;ttsSiguiente()}};
  u.onerror=e=>{if(mio===ttsSeq&&tts.estado==='leyendo'&&e&&e.error!=='interrupted'&&e.error!=='canceled')ttsParar()};
  speechSynthesis.speak(u);
}
function ttsLeer(titulo,texto){
  if(!ttsDisponible())return false;
  const cola=ttsTrozos(ttsLimpiar(texto));
  if(!cola.length)return false;
  try{speechSynthesis.cancel()}catch(e){}
  ttsSeq++;tts.cola=cola;tts.idx=0;tts.titulo=titulo||'';tts.estado='leyendo';
  ttsPintar();ttsSiguiente();
  return true;
}
function ttsPausar(){if(tts.estado!=='leyendo')return;tts.estado='pausado';ttsSeq++;try{speechSynthesis.cancel()}catch(e){}ttsPintar()}
function ttsContinuar(){if(tts.estado!=='pausado')return;tts.estado='leyendo';ttsPintar();ttsSiguiente()}
function ttsParar(){tts.estado='parado';ttsSeq++;tts.idx=0;try{speechSynthesis.cancel()}catch(e){}ttsPintar()}
function ttsVelocidad(r){
  r=Math.max(0.5,Math.min(2,+r||1));tts.rate=r;ttsGuardar();
  if(tts.estado==='leyendo'){ttsSeq++;try{speechSynthesis.cancel()}catch(e){}ttsSiguiente()}      // reanuda el trozo actual a la nueva velocidad
  ttsPintar();
}
function ttsPintar(){
  let b=document.getElementById('ttsBar');
  if(tts.estado==='parado'){if(b)b.remove();return}
  if(!b){b=document.createElement('div');b.id='ttsBar';b.className='ttsBar';b.setAttribute('role','region');b.setAttribute('aria-label','Lector de voz');document.body.appendChild(b)}
  const vs=ttsVoces(),act=ttsVozActual();
  b.innerHTML=`<span class="ttsT">🔊 ${tts.estado==='leyendo'?'Leyendo':'En pausa'}: <b>${esc(tts.titulo)}</b></span>
    <span class="ttsC"><button type="button" class="sec sm" data-action="ttsToggle">${tts.estado==='leyendo'?'⏸ Pausar':'▶ Seguir'}</button><button type="button" class="sec sm" data-action="ttsStop">⏹ Detener</button>
    <select class="fld" data-action="ttsRate" aria-label="Velocidad de lectura">${[0.75,1,1.25,1.5,2].map(r=>`<option value="${r}" ${r===tts.rate?'selected':''}>${r}×</option>`).join('')}</select>
    ${vs.length>1?`<select class="fld" data-action="ttsVoz" aria-label="Voz">${vs.map(v=>`<option value="${esc(v.name)}" ${act&&v.name===act.name?'selected':''}>${esc(v.name)}</option>`).join('')}</select>`:''}</span>`;
}
if(ttsDisponible()){try{speechSynthesis.addEventListener('voiceschanged',()=>{if(tts.estado!=='parado')ttsPintar()})}catch(e){}}
function textoSeccion(sc){
  const ideas=(typeof puntosDe==='function'?puntosDe(sc):[]).join('. ');
  return [sc.title+'.',sc.body,ideas?'Ideas clave. '+ideas:'',sc.rel?'Relación con otras ideas. '+sc.rel:''].filter(Boolean).join('\n');
}
function textoTema(t){
  const hay=Array.isArray(t.secciones);
  return [t.title+'.',hay&&t.body?'Resumen. '+t.body:'',hay?t.secciones.map(textoSeccion).join('\n'):t.body].filter(Boolean).join('\n');
}
const ttsBtn=(accion,attrs,txt)=>ttsDisponible()?`<button type="button" class="sec sm ttsBtn" data-action="${accion}" ${attrs}>${txt||'🔊 Escuchar'}</button>`:'';

/* ======================= Imágenes y videos en los temas =======================
   Las imágenes se comprimen en el navegador y se guardan en Firestore (temas/{id}/medios/{mid}, hasta ~700 KB cada una).
   Los videos son enlaces (con reproductor incrustado si son de YouTube o Vimeo). Solo el profesor los agrega. */
const MEDIOS_MAX=12,MEDIO_IMG_MAX=700000;
const medioCache={},medioPidiendo=new Set();
const urlSegura=u=>/^https:\/\//i.test(String(u||''))?String(u):'';
function urlVideo(u){
  let x;try{x=new URL(String(u||'').trim())}catch(e){return null}
  if(x.protocol!=='https:')return null;
  const h=x.hostname.replace(/^www\./,'');
  let id=null,embed=null;
  if(h==='youtu.be')id=x.pathname.slice(1).split('/')[0];
  else if(h==='youtube.com'||h==='m.youtube.com'){
    if(x.pathname==='/watch')id=x.searchParams.get('v');
    else{const m=x.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/);if(m)id=m[1]}
  }
  if(id&&/^[\w-]{6,20}$/.test(id))embed='https://www.youtube-nocookie.com/embed/'+id;
  if(h==='vimeo.com'){const m=x.pathname.match(/^\/(\d{5,12})/);if(m)embed='https://player.vimeo.com/video/'+m[1]}
  return{url:x.href,embed};
}
/* Baja el tamaño hasta que quepa en un documento: prueba lados y calidades cada vez menores */
async function renderizarImagen(file,lado,calidad){
  const bmp=typeof createImageBitmap==='function'?await createImageBitmap(file):await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('No se pudo leer la imagen'));i.src=URL.createObjectURL(file)});
  const w0=bmp.width||bmp.naturalWidth,h0=bmp.height||bmp.naturalHeight,k=Math.min(1,lado/Math.max(w0,h0));
  const w=Math.max(1,Math.round(w0*k)),h=Math.max(1,Math.round(h0*k));
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(bmp,0,0,w,h);
  const data=c.toDataURL('image/jpeg',calidad);c.width=0;
  return{data,w,h};
}
async function comprimirImagen(file,renderizar){
  renderizar=renderizar||renderizarImagen;
  for(const [lado,cal] of [[1280,.8],[1100,.7],[900,.6],[720,.5],[560,.45]]){
    const r=await renderizar(file,lado,cal);
    if(r&&r.data&&r.data.length<=MEDIO_IMG_MAX)return r;
  }
  return null;
}
const miTema=id=>state.temas.find(x=>x.id===id);
function puedeEditarMedios(t){return !!(t&&esDocenteMat(t.materiaId)&&puedeSubir())}
async function agregarImagenTema(temaId,file){
  const t=miTema(temaId),m=t&&state.materias.find(x=>x.id===t.materiaId);
  if(!puedeEditarMedios(t)||!m.sharedId)return;
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){UI.alerta('Solo se admiten imágenes JPG, PNG, WebP o GIF.');return}
  if((t.medios||[]).length>=MEDIOS_MAX){UI.alerta('Cada tema admite hasta '+MEDIOS_MAX+' imágenes y videos.');return}
  toast('🖼️ Preparando la imagen…');
  let r;try{r=await comprimirImagen(file)}catch(e){console.error(e);UI.alerta('No se pudo leer esa imagen.');return}
  if(!r){UI.alerta('La imagen es demasiado grande incluso comprimida. Prueba con una más pequeña.');return}
  const id=uid();
  try{await refTemario(m.sharedId).collection('temas').doc(t.id).collection('medios').doc(id).set({data:r.data,tipo:'img',nombre:String(file.name||'imagen').slice(0,80)})}
  catch(e){console.error(e);UI.alerta('No se pudo guardar la imagen'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?');return}
  medioCache[id]=r.data;
  mutate(s=>{const tt=s.temas.find(x=>x.id===temaId);if(tt){tt.medios=(tt.medios||[]).concat([{id,tipo:'img',titulo:String(file.name||'Imagen').replace(/\.[^.]+$/,'').slice(0,60),w:r.w,h:r.h}]);tt.updatedAt=Date.now()}});
}
async function agregarVideoTema(temaId){
  const t=miTema(temaId);if(!puedeEditarMedios(t))return;
  if((t.medios||[]).length>=MEDIOS_MAX){UI.alerta('Cada tema admite hasta '+MEDIOS_MAX+' imágenes y videos.');return}
  const r=await UI.preguntar('Agregar un video',[{k:'t',l:'Título',ph:'Ej. Clase sobre la memoria',max:80},{k:'u',l:'Enlace (debe empezar por https://)',ph:'https://www.youtube.com/watch?v=…',max:300}],{ok:'Agregar'});
  if(!r)return;
  const v=urlVideo(r.u);
  if(!v){UI.alerta('Ese enlace no sirve: debe empezar por https:// y ser una dirección válida.');return}
  mutate(s=>{const tt=s.temas.find(x=>x.id===temaId);if(tt){tt.medios=(tt.medios||[]).concat([{id:uid(),tipo:'video',titulo:String(r.t||'Video').trim().slice(0,80)||'Video',url:v.url,embed:v.embed||''}]);tt.updatedAt=Date.now()}});
}
async function quitarMedio(temaId,medioId){
  const t=miTema(temaId),m=t&&state.materias.find(x=>x.id===t.materiaId),md=t&&(t.medios||[]).find(x=>x.id===medioId);
  if(!md||!puedeEditarMedios(t))return;
  if(!await UI.confirmar('¿Quitar "'+md.titulo+'" de este tema?'))return;
  if(md.tipo==='img'&&m.sharedId){try{await refTemario(m.sharedId).collection('temas').doc(t.id).collection('medios').doc(medioId).delete()}catch(e){console.warn('No se pudo borrar la imagen de la nube:',e)}}
  delete medioCache[medioId];
  mutate(s=>{const tt=s.temas.find(x=>x.id===temaId);if(tt){tt.medios=(tt.medios||[]).filter(x=>x.id!==medioId);tt.updatedAt=Date.now()}});
}
async function borrarMediosNube(sid,t){
  const imgs=(t.medios||[]).filter(x=>x.tipo==='img');if(!imgs.length)return;
  try{const col=refTemario(sid).collection('temas').doc(t.id).collection('medios'),b=db.batch();imgs.forEach(x=>b.delete(col.doc(x.id)));await b.commit()}
  catch(e){console.warn('No se pudieron limpiar las imágenes de la nube:',e)}
}
async function cargarMedio(t,mid){
  if(medioCache[mid]||medioPidiendo.has(mid))return;
  const m=state.materias.find(x=>x.id===t.materiaId);if(!m||!m.sharedId)return;
  medioPidiendo.add(mid);
  try{
    const d=await refTemario(m.sharedId).collection('temas').doc(t.id).collection('medios').doc(mid).get();
    medioCache[mid]=(d.exists&&/^data:image\//.test((d.data()||{}).data||''))?d.data().data:'ERROR';
  }catch(e){medioCache[mid]='ERROR'}
  medioPidiendo.delete(mid);
  if(route.view==='materiaDetail')render(true);
}
function mediosHTML(t){
  const ms=Array.isArray(t.medios)?t.medios:[];
  if(!ms.length)return '';
  const edit=puedeEditarMedios(t);
  return `<div class="medios">${ms.map(md=>{
    const del=edit?`<button type="button" class="icon-btn mdel" data-action="delMedio" data-tema="${t.id}" data-id="${md.id}" aria-label="Quitar" title="Quitar">🗑️</button>`:'';
    if(md.tipo==='img'){
      const src=medioCache[md.id];
      if(!src)setTimeout(()=>cargarMedio(t,md.id),0);
      return `<figure class="medio">${src&&src!=='ERROR'?`<img src="${src}" alt="${esc(md.titulo)}" loading="lazy" decoding="async">`:`<div class="medioPH">${src==='ERROR'?'No se pudo cargar la imagen':'Cargando imagen…'}</div>`}<figcaption>${esc(md.titulo)}${del}</figcaption></figure>`;
    }
    const emb=urlSegura(md.embed),url=urlSegura(md.url);
    const v=emb?`<div class="video"><iframe src="${esc(emb)}" title="${esc(md.titulo)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></div>`
      :url?`<a class="sec videoLink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">▶ Abrir video</a>`:'';
    return `<figure class="medio">${v}<figcaption>🎬 ${esc(md.titulo)}${del}</figcaption></figure>`;
  }).join('')}</div>`;
}
function controlesMediosHTML(t){
  if(!puedeEditarMedios(t))return '';
  return `<button type="button" class="sec sm" data-action="addImagen" data-id="${t.id}">🖼️ Agregar imagen</button><button type="button" class="sec sm" data-action="addVideo" data-id="${t.id}">🎬 Agregar video (enlace)</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-medio-tema="${t.id}" style="display:none" aria-hidden="true" tabindex="-1">`;
}

/* ======================= Comprimir PDF =======================
   Para PDF muy pesados: cada página se vuelve a dibujar como imagen JPEG más liviana y se arma un PDF nuevo, todo en el navegador.
   La copia pierde el texto seleccionable (la IA siempre lee el original), y se baja la calidad por pasos hasta que quepa. */
function ensamblarPDF(paginas){
  const enc=new TextEncoder(),partes=[],offs=[];let largo=0;
  const add=b=>{partes.push(b);largo+=b.length},txt=s=>add(enc.encode(s));
  txt('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  const n=paginas.length,obj=(num,cuerpo)=>{offs[num]=largo;txt(num+' 0 obj\n'+cuerpo+'\nendobj\n')};
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids ['+paginas.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] /Count '+n+' >>');
  paginas.forEach((p,i)=>{
    const pg=3+i*3,ct=pg+1,im=pg+2,w=+p.w.toFixed(2),h=+p.h.toFixed(2),cont='q '+w+' 0 0 '+h+' 0 0 cm /Im0 Do Q';
    obj(pg,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+w+' '+h+'] /Resources << /XObject << /Im0 '+im+' 0 R >> >> /Contents '+ct+' 0 R >>');
    obj(ct,'<< /Length '+cont.length+' >>\nstream\n'+cont+'\nendstream');
    offs[im]=largo;
    txt(im+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+p.pw+' /Height '+p.ph+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.jpeg.length+' >>\nstream\n');
    add(p.jpeg);txt('\nendstream\nendobj\n');
  });
  const total=3+n*3,xref=largo;
  txt('xref\n0 '+total+'\n0000000000 65535 f \n');
  for(let i=1;i<total;i++)txt(String(offs[i]).padStart(10,'0')+' 00000 n \n');
  txt('trailer\n<< /Size '+total+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const out=new Uint8Array(largo);let o=0;partes.forEach(b=>{out.set(b,o);o+=b.length});
  return out;
}
async function renderizarPaginasJPEG(file,escala,calidad,progreso){
  const pdfjs=await cargarPdfJs(),pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,pags=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),base=page.getViewport({scale:1}),vp=page.getViewport({scale:escala});
    const c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:g,viewport:vp}).promise;
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',calidad));
    pags.push({w:base.width,h:base.height,pw:c.width,ph:c.height,jpeg:new Uint8Array(await blob.arrayBuffer())});
    c.width=0;
    if(progreso)progreso(i,pdf.numPages);
  }
  return pags;
}
const PDF_INTENTOS=[[1.5,.72],[1.25,.6],[1.0,.5],[.85,.4],[.7,.3]];
async function comprimirPDF(file,opt){
  opt=opt||{};
  const objetivo=opt.objetivo||ARCH_MAX,renderizar=opt.renderizar||renderizarPaginasJPEG;
  let mejor=null;
  for(let k=0;k<PDF_INTENTOS.length;k++){
    const [esc,cal]=PDF_INTENTOS[k];
    const bytes=ensamblarPDF(await renderizar(file,esc,cal,opt.progreso));
    if(!mejor||bytes.length<mejor.bytes.length)mejor={bytes,k};
    if(bytes.length<=objetivo)break;
  }
  const f=new File([mejor.bytes],file.name,{type:'application/pdf'});
  return{ok:mejor.bytes.length<=objetivo&&mejor.bytes.length<file.size,file:f,antes:file.size,despues:mejor.bytes.length,intentos:mejor.k+1};
}

/* ======================= Pomodoro =======================
   Trabajo y descanso en ciclos (por defecto 25 y 5 minutos, editables). Se calcula con la hora de fin, así sigue bien
   aunque la pestaña esté en segundo plano o se recargue la página. */
const POMO_KEY='auren_pomodoro';
const pomo={fase:'trabajo',restante:1500,corriendo:false,fin:0,ciclos:0,fecha:'',cfg:{trabajo:25,descanso:5},abierto:false};
let pomoTimer=null;
const pomoLim=(v,min,max,def)=>{v=(v===''||v===null||v===undefined)?NaN:Math.round(+v);return isFinite(v)?Math.max(min,Math.min(max,v)):def};
const pomoDur=f=>(f==='trabajo'?pomoLim(pomo.cfg.trabajo,1,120,25):pomoLim(pomo.cfg.descanso,1,60,5))*60;
function pomoGuardar(){try{localStorage.setItem(POMO_KEY,JSON.stringify({cfg:pomo.cfg,fase:pomo.fase,restante:pomo.restante,corriendo:pomo.corriendo,fin:pomo.fin,ciclos:pomo.ciclos,fecha:pomo.fecha,abierto:pomo.abierto}))}catch(e){}}
function pomoCargar(){
  try{
    const a=JSON.parse(localStorage.getItem(POMO_KEY)||'null');if(!a)return;
    pomo.cfg={trabajo:pomoLim(a.cfg&&a.cfg.trabajo,1,120,25),descanso:pomoLim(a.cfg&&a.cfg.descanso,1,60,5)};
    pomo.fase=a.fase==='descanso'?'descanso':'trabajo';
    pomo.restante=pomoLim(a.restante,0,7200,pomoDur(pomo.fase));
    pomo.fin=+a.fin||0;pomo.corriendo=!!a.corriendo&&pomo.fin>0;
    pomo.ciclos=pomoLim(a.ciclos,0,999,0);pomo.fecha=String(a.fecha||'');pomo.abierto=!!a.abierto;
    if(pomo.fecha!==fechaLocal(new Date())){pomo.ciclos=0;pomo.fecha=''}
  }catch(e){}
  if(!pomo.corriendo)pomo.restante=pomo.restante||pomoDur(pomo.fase);
}
const pomoRestante=ahora=>pomo.corriendo?Math.max(0,Math.round((pomo.fin-(ahora||Date.now()))/1000)):pomo.restante;
const pomoFmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
function pomoBip(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.value=.08;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close()},450)}catch(e){}}
function pomoAvisar(termino){
  const msg=termino==='trabajo'?'¡Terminó tu tiempo de trabajo! Descansa '+pomoLim(pomo.cfg.descanso,1,60,5)+' min.':'Se acabó el descanso. ¡A trabajar '+pomoLim(pomo.cfg.trabajo,1,120,25)+' min!';
  try{notificarSistema('🍅 Pomodoro',msg,'pomodoro')}catch(e){}
  if(document.hidden)return;pomoBip();
}
function pomoTerminarFase(ahora){
  const era=pomo.fase;
  if(era==='trabajo'){const hoy=fechaLocal(new Date());if(pomo.fecha!==hoy){pomo.fecha=hoy;pomo.ciclos=0}pomo.ciclos++}
  pomo.fase=era==='trabajo'?'descanso':'trabajo';
  pomo.restante=pomoDur(pomo.fase);pomo.fin=(ahora||Date.now())+pomo.restante*1000;      // la fase siguiente arranca sola
  pomoGuardar();pomoAvisar(era);pomoPintar();
}
function pomoTick(ahora){
  if(!pomo.corriendo)return;
  if(pomoRestante(ahora)<=0)pomoTerminarFase(ahora);
  pomoPintarTiempo(ahora);
}
function pomoArrancarTimer(){if(!pomoTimer)pomoTimer=setInterval(()=>pomoTick(),1000)}
function pomoPararTimer(){if(pomoTimer){clearInterval(pomoTimer);pomoTimer=null}}
function pomoIniciar(){if(pomo.corriendo)return;pomo.fin=Date.now()+pomo.restante*1000;pomo.corriendo=true;pomoArrancarTimer();pomoGuardar();pomoPintar()}
function pomoPausar(){if(!pomo.corriendo)return;pomo.restante=pomoRestante();pomo.corriendo=false;pomoPararTimer();pomoGuardar();pomoPintar();document.title=TITULO_BASE}
function pomoReiniciar(){pomo.corriendo=false;pomoPararTimer();pomo.restante=pomoDur(pomo.fase);pomoGuardar();pomoPintar();document.title=TITULO_BASE}
function pomoSaltar(){pomo.fase=pomo.fase==='trabajo'?'descanso':'trabajo';pomo.restante=pomoDur(pomo.fase);if(pomo.corriendo)pomo.fin=Date.now()+pomo.restante*1000;pomoGuardar();pomoPintar()}
function pomoConfig(k,v){
  if(k!=='trabajo'&&k!=='descanso')return;
  pomo.cfg[k]=k==='trabajo'?pomoLim(v,1,120,25):pomoLim(v,1,60,5);
  if(!pomo.corriendo&&pomo.fase===k)pomo.restante=pomoDur(k);
  pomoGuardar();pomoPintarTiempo();
}
function pomoAbrir(abrir){pomo.abierto=abrir===undefined?!pomo.abierto:!!abrir;pomoGuardar();pomoPintar()}
const TITULO_BASE=document.title;
function pomoPintarTiempo(ahora){
  const el=document.getElementById('pomoT');if(!el)return;
  el.textContent=pomoFmt(pomoRestante(ahora));
  if(pomo.corriendo)document.title='🍅 '+pomoFmt(pomoRestante(ahora))+' · '+TITULO_BASE;
}
function pomoPintar(){
  let p=document.getElementById('pomoPanel');
  if(!pomo.abierto){if(p)p.remove();return}
  if(!p){p=document.createElement('div');p.id='pomoPanel';p.className='pomoPanel';p.setAttribute('role','region');p.setAttribute('aria-label','Reloj Pomodoro');document.body.appendChild(p)}
  const foco=document.activeElement&&p.contains(document.activeElement)?document.activeElement.id:'';
  p.className='pomoPanel '+(pomo.fase==='trabajo'?'pTrab':'pDesc');
  p.innerHTML=`<div class="pomoTop"><b>🍅 ${pomo.fase==='trabajo'?'Trabajo':'Descanso'}</b><button type="button" class="icon-btn" data-action="pomoCerrar" aria-label="Cerrar el reloj Pomodoro">✕</button></div>
    <div id="pomoT" class="pomoT" role="timer" aria-live="off">${pomoFmt(pomoRestante())}</div>
    <div class="row pomoBtns"><button type="button" class="pr" id="pomoGo" data-action="pomoGo">${pomo.corriendo?'⏸ Pausar':'▶ Iniciar'}</button><button type="button" class="sec" data-action="pomoReset" aria-label="Reiniciar">↺</button><button type="button" class="sec" data-action="pomoSkip" aria-label="Saltar a ${pomo.fase==='trabajo'?'descanso':'trabajo'}">⏭</button></div>
    <div class="pomoCfg"><label>Trabajo (min)<input class="fld" type="number" min="1" max="120" data-action="pomoCfg" data-k="trabajo" value="${pomoLim(pomo.cfg.trabajo,1,120,25)}"></label><label>Descanso (min)<input class="fld" type="number" min="1" max="60" data-action="pomoCfg" data-k="descanso" value="${pomoLim(pomo.cfg.descanso,1,60,5)}"></label></div>
    <p class="meta pomoN">Ciclos de hoy: <b>${pomo.fecha===fechaLocal(new Date())?pomo.ciclos:0}</b></p>`;
  if(foco){const f=document.getElementById(foco);if(f)f.focus()}
}
pomoCargar();
if(pomo.corriendo){pomoArrancarTimer();setTimeout(()=>pomoTick(),0)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pomoTick()});

/* ======================= Mis apuntes (privados) =======================
   Cada estudiante escribe sus propios apuntes sobre los temas del profesor. Se guardan en anotaciones/{uid}/items/{temaId}
   y las reglas de Firestore solo dejan leerlos y escribirlos a su dueño: ni el profesor ni nadie más los ve. */
const NOTA_MAX=20000;
const notasMap={},notasPend={},notasTimers={};
let notasUnsub=null;
function detenerNotas(){if(notasUnsub){try{notasUnsub()}catch(e){}notasUnsub=null}Object.keys(notasMap).forEach(k=>delete notasMap[k]);Object.keys(notasPend).forEach(k=>delete notasPend[k])}
function escucharNotas(){
  detenerNotas();
  if(!currentUid||(esProfesor()&&!esAdmin()))return;
  notasUnsub=db.collection('anotaciones').doc(currentUid).collection('items').onSnapshot(snap=>{
    Object.keys(notasMap).forEach(k=>delete notasMap[k]);
    snap.docs.forEach(d=>{notasMap[d.id]=d.data()});
    renderSeguro();
  },e=>console.warn('Anotaciones:',e));
}
const textoNota=id=>notasPend[id]!==undefined?notasPend[id]:((notasMap[id]||{}).texto||'');
function estadoNota(id,txt){const el=document.getElementById('notaSt-'+id);if(el)el.textContent=txt}
async function guardarNota(id,materiaId){
  const texto=notasPend[id];if(texto===undefined||!currentUid)return;
  const ref=db.collection('anotaciones').doc(currentUid).collection('items').doc(id);
  try{
    if(!texto.trim()){await ref.delete();delete notasMap[id]}
    else{const d={materiaId:materiaId||'',texto:texto.slice(0,NOTA_MAX),actualizado:Date.now()};await ref.set(d);notasMap[id]=d}
    if(notasPend[id]===texto)delete notasPend[id];
    estadoNota(id,'Guardado ✓');
  }catch(e){console.error(e);estadoNota(id,'No se pudo guardar'+detalleError(e)+'. Se reintentará al seguir escribiendo.')}
}
function programarNota(id,materiaId,valor){
  notasPend[id]=String(valor).slice(0,NOTA_MAX);
  estadoNota(id,'Escribiendo…');
  clearTimeout(notasTimers[id]);notasTimers[id]=setTimeout(()=>guardarNota(id,materiaId),800);
}
function vaciarNotasPendientes(){Object.keys(notasPend).forEach(id=>{clearTimeout(notasTimers[id]);const t=miTema(id);guardarNota(id,t&&t.materiaId)})}
document.addEventListener('visibilitychange',()=>{if(document.hidden)vaciarNotasPendientes()});
/* ---- Apuntes de una materia: se cuentan los apuntes de sus temas (pestaña "Mis apuntes" de cada tema) ----
   El tablero de notas sueltas por materia se quitó: los apuntes viven en cada tema. Las notas viejas del tablero
   (id "n_…") siguen guardadas en anotaciones/, pero ya no se muestran ni se cuentan. */
const notasDeMateria=mid=>Object.entries(notasMap).filter(([id,d])=>!id.startsWith('n_')&&d&&d.materiaId===mid&&String(d.texto||'').trim()).map(([id,d])=>({id,...d}));
function esquemaTexto(t){
  if(!Array.isArray(t.secciones)||!t.secciones.length)return '';
  return t.secciones.map(sc=>'## '+(sc.title||'Sección')+'\n'+((typeof puntosDe==='function'?puntosDe(sc):[]).map(p=>'- '+p).join('\n'))).join('\n\n');
}
function apuntesHTML(t){
  return `<p class="meta" style="margin:0 0 8px">🔒 <b>Solo tú</b> ves estos apuntes: tu profesor y tus compañeros no pueden leerlos. Se guardan solos.</p>
    <div class="row" style="flex-wrap:wrap;margin:0 0 8px">${Array.isArray(t.secciones)&&t.secciones.length?`<button type="button" class="sec sm" data-action="notaEsquema" data-id="${t.id}">📋 Insertar el esquema del tema</button>`:''}${ttsBtn('ttsNota','data-id="'+t.id+'"','🔊 Escuchar mis apuntes')}</div>
    <textarea class="fld notaTx" data-action="notaEdit" data-tema="${t.id}" data-mat="${t.materiaId}" maxlength="${NOTA_MAX}" rows="10" aria-label="Mis apuntes de ${esc(t.title)}" placeholder="Escribe aquí tus propios apuntes: ideas, ejemplos, dudas para preguntar…">${esc(textoNota(t.id))}</textarea>
    <p class="meta" style="margin:6px 0 0"><span id="notaSt-${t.id}" role="status"></span></p>`;
}

/* ======================= Pregúntale a la IA =======================
   Chat sobre UN tema: la IA responde usando solo el contenido de ese tema (netlify/functions/preguntar-tema.js).
   Lo usan los estudiantes (y el admin, para probarlo), con un cupo diario pequeño. La conversación no se guarda: vive mientras la página esté abierta. */
const chatIA={};                         // temaId -> {msgs:[{r:'u'|'ia',t}], cargando, err, cupo}
const CHAT_SUGERENCIAS=['Explícamelo más fácil','Dame un ejemplo','¿Qué es lo más importante de este tema?','Hazme una pregunta para practicar'];
function chatHTML(t){
  const c=chatIA[t.id]||{msgs:[]};
  const burbujas=c.msgs.map(m=>`<div class="chatMsg ${m.r==='u'?'yo':'ia'}"><small>${m.r==='u'?'Tú':'🤖 Tutor'}</small>${esc(m.t).replace(/\n/g,'<br>')}</div>`).join('');
  return `<p class="meta" style="margin:0 0 8px">Pregunta lo que no entiendas de este tema. La IA responde con el contenido del tema, pero puede equivocarse: compárala con tu material.${c.cupo?` Te quedan <b>${c.cupo.restantes}</b> de ${c.cupo.limite} preguntas hoy.`:''}</p>
    <div class="chatLog" role="log" aria-live="polite" aria-label="Conversación con el tutor">${burbujas||'<p class="meta" style="margin:0">Aún no has preguntado nada. Prueba con una de estas:</p>'}${c.cargando?'<div class="chatMsg ia pensando"><small>🤖 Tutor</small>Pensando…</div>':''}</div>
    ${!c.msgs.length&&!c.cargando?`<div class="row" style="flex-wrap:wrap;margin:8px 0 0">${CHAT_SUGERENCIAS.map(x=>`<button type="button" class="toggleChip" data-chatsug="${esc(x)}" data-id="${t.id}">${esc(x)}</button>`).join('')}</div>`:''}
    ${c.err?`<p class="meta" role="alert" style="color:var(--no);margin:8px 0 0">⚠️ ${esc(c.err)}</p>`:''}
    <div class="chatIn"><input class="fld" id="chatIn-${t.id}" data-chat="${t.id}" maxlength="500" autocomplete="off" aria-label="Tu pregunta sobre ${esc(t.title)}" placeholder="Escribe tu duda…" ${c.cargando?'disabled':''}>
      <button type="button" class="pr" data-chatsend="${t.id}" ${c.cargando?'disabled':''}>Enviar</button></div>`;
}
async function chatEnviar(temaId,texto){
  const t=state.temas.find(x=>x.id===temaId);if(!t||!auth.currentUser)return;
  const c=chatIA[temaId]=chatIA[temaId]||{msgs:[]};
  const pregunta=String(texto||'').trim().slice(0,500);
  if(!pregunta||c.cargando)return;
  const historial=c.msgs.slice(-6);
  c.msgs.push({r:'u',t:pregunta});c.cargando=true;c.err='';
  const inp=$('chatIn-'+temaId);if(inp)inp.value='';
  render(true);
  try{
    const token=await auth.currentUser.getIdToken();
    const r=await fetch('/.netlify/functions/preguntar-tema',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:JSON.stringify({titulo:t.title||'',texto:textoTema(t),pregunta,historial})});
    const d=await r.json().catch(()=>({}));
    if(d.cupo)c.cupo=d.cupo;
    if(!r.ok||!d.respuesta){c.err=d.error||('La IA no respondió (error '+r.status+').');c.msgs.pop()}
    else c.msgs.push({r:'ia',t:d.respuesta});
  }catch(e){console.error(e);c.err='No se pudo contactar a la IA. Revisa tu conexión.';c.msgs.pop()}
  c.cargando=false;
  render(true);
  const log=document.querySelector(`[data-tema="${temaId}"] .chatLog`);if(log)log.scrollTop=log.scrollHeight;
  if(c.err){const i=$('chatIn-'+temaId);if(i&&!i.value)i.value=pregunta}
}
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('[data-chatsend],[data-chatsug]');if(!b)return;
  if(b.dataset.chatsend){const i=$('chatIn-'+b.dataset.chatsend);chatEnviar(b.dataset.chatsend,i&&i.value)}
  else chatEnviar(b.dataset.id,b.dataset.chatsug);
});
document.addEventListener('keydown',e=>{
  const i=e.target;if(!i||!i.dataset||!i.dataset.chat||e.key!=='Enter'||e.isComposing)return;
  e.preventDefault();chatEnviar(i.dataset.chat,i.value);
});

/* ======================= Racha con los exámenes del profesor =======================
   Cada examen del profesor que se entrega suma las preguntas respondidas a la meta diaria, igual que un quiz o un examen propio. */
function registrarExamenProfesor(m,ex){
  if(state.attempts.some(a=>a.type==='examenProf'&&a.examId===ex.id))return null;
  const respondidas=preguntasDe(ex,currentUid).filter(q=>{const v=exTom.respuestas[q.id];return v!==undefined&&v!==''}).length;
  if(!respondidas)return null;
  let res=null;
  mutate(s=>{
    const att={id:uid(),materiaId:m.id,type:'examenProf',examId:ex.id,score:exTom.resultado?exTom.resultado.ok:0,total:respondidas,date:Date.now(),porCorte:[],corteId:null};
    s.attempts.push(att);
    res=registrarSesion(att);
  });
  if(res){exTom.racha=res;if(res.nuevos.length)avisarLogros(res.nuevos)}
  return res;
}
function medirCabecera(){const h=document.querySelector('header');if(h)document.documentElement.style.setProperty('--hdr',Math.round(h.getBoundingClientRect().height)+'px')}
try{const hd=document.querySelector('header');if(hd&&typeof ResizeObserver!=='undefined')new ResizeObserver(medirCabecera).observe(hd);window.addEventListener('resize',medirCabecera);medirCabecera()}catch(e){}

/* ======================= Administración y borrado de cuentas ======================= */
let adminLista=null,adminCargando=false,adminFiltro='',adminError='';
async function cargarUsuariosAdmin(){
  if(!esAdmin()||adminCargando)return;
  adminCargando=true;adminError='';
  try{
    const s=await db.collection('usuarios').limit(500).get();
    adminLista=s.docs.map(d=>({uid:d.id,...d.data()})).sort((a,b)=>String(a.email||'').localeCompare(String(b.email||'')));
  }catch(e){console.error(e);adminError='No se pudo leer la lista de cuentas'+detalleError(e)+'. ¿Publicaste las reglas nuevas de Firestore?';adminLista=adminLista||[]}
  adminCargando=false;
  if(route.view==='admin')render(true);
}
function viewAdminHTML(){
  if(!esAdmin())return '<div class="empty">Solo los administradores ven esta sección.</div>';
  if(adminLista===null&&!adminCargando)setTimeout(cargarUsuariosAdmin,0);
  const L=adminLista||[],f=adminFiltro.trim().toLowerCase();
  const vis=L.filter(u=>!f||String(u.email||'').toLowerCase().includes(f)||String(u.nombre||'').toLowerCase().includes(f));
  const n=r=>L.filter(u=>u.rol===r).length;
  const cab=`<div class="viewhead"><h1>🛡️ Administración</h1><button class="sec" data-action="adminRecargar">↻ Actualizar</button></div>${adminTabsHTML()}`;
  if(adminTab==='rachas')return cab+adminRachasHTML();
  return cab+`
  <p class="meta">${L.length} cuentas · ${n('estudiante')} estudiantes · ${n('profesor')} profesores · ${n('admin')} admin. Aquí asignas roles y borras cuentas.</p>
  <input class="fld" type="search" data-action="adminFiltro" placeholder="Buscar por nombre o correo" value="${esc(adminFiltro)}" aria-label="Buscar cuentas">
  ${adminError?`<div class="card shareBox" role="alert">${esc(adminError)}</div>`:''}
  ${adminCargando&&!L.length?'<p class="meta">Cargando…</p>':''}
  <div class="adminList">${vis.map(u=>{const yo=u.uid===currentUid;return `<div class="card adminRow"><div class="adminWho"><b>${esc(u.nombre||'(sin nombre)')}</b><span class="meta">${esc(u.email||'')}${yo?' · tú':''}</span></div>
    <select class="fld" data-action="adminRol" data-uid="${esc(u.uid)}" aria-label="Rol de ${esc(u.nombre||u.email||'')}" ${yo?'disabled':''}>${ROLES.map(r=>`<option value="${r}" ${u.rol===r?'selected':''}>${nombreRol(rolInterno(r))}</option>`).join('')}</select>
    <button class="sec" data-action="adminBorrar" data-uid="${esc(u.uid)}" ${yo?'disabled':''}>🗑️ Borrar cuenta</button></div>`}).join('')||'<p class="meta">Sin resultados.</p>'}</div>`;
}
async function cambiarRolAdmin(uidObj,rol){
  const u=(adminLista||[]).find(x=>x.uid===uidObj);
  if(!u||!esAdmin()||!ROLES.includes(rol)||uidObj===currentUid)return;
  if(!await UI.confirmar('¿Cambiar el rol de '+(u.email||u.nombre)+' a '+nombreRol(rolInterno(rol)).toLowerCase()+'?')){render(true);return}
  try{await db.collection('usuarios').doc(uidObj).update({rol});u.rol=rol;toast('✅ Rol actualizado')}
  catch(e){console.error(e);UI.alerta('No se pudo cambiar el rol'+detalleError(e)+'.')}
  render(true);
}
async function borrarCuentaAjena(uidObj){
  const u=(adminLista||[]).find(x=>x.uid===uidObj);
  if(!u||!esAdmin()||uidObj===currentUid)return;
  if(!await UI.confirmar('¿Borrar la cuenta de '+(u.email||u.nombre)+'? Se elimina su acceso y sus datos personales. No se puede deshacer.','Borrar'))return;
  try{
    const tok=await auth.currentUser.getIdToken();
    const r=await fetch('/.netlify/functions/admin-borrar-cuenta',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify({uid:uidObj})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){UI.alerta(d.error||'No se pudo borrar la cuenta (error '+r.status+').');return}
    adminLista=(adminLista||[]).filter(x=>x.uid!==uidObj);toast('✅ Cuenta borrada');render(true);
  }catch(e){console.error(e);UI.alerta('No se pudo contactar al servidor para borrar la cuenta.')}
}
async function borrarColeccionPropia(ruta){
  const s=await db.collection(ruta).get();
  for(let i=0;i<s.docs.length;i+=400){const b=db.batch();s.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit()}
}
async function reautenticar(u){
  const prov=(u.providerData||[]).map(p=>p.providerId);
  if(prov.includes('google.com')){await u.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());return true}
  if(prov.includes('password')){
    const r=await UI.preguntar('Confirma tu contraseña',[{k:'p',l:'Contraseña',t:'password',max:200}],{ok:'Continuar'});
    if(!r||!r.p)return false;
    await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,r.p));return true;
  }
  return true;
}
async function borrarMiCuenta(){
  const u=auth.currentUser;if(!u)return;
  if(!await UI.confirmar('Vas a eliminar tu cuenta de Auren. Se borran tus datos personales (cuaderno, apuntes, banco de preguntas) y tu acceso. Si eres profesor, también se eliminan tus materias. Tus entregas de exámenes quedan en la materia de tu profesor. No se puede deshacer. ¿Continuar?','Continuar'))return;
  const c=await UI.preguntar('Confirmar eliminación',[{k:'c',l:'Escribe ELIMINAR para confirmar',max:20}],{ok:'Eliminar mi cuenta'});
  if(!c||String(c.c).trim().toUpperCase()!=='ELIMINAR')return;
  const uidViejo=currentUid;
  try{
    if(!await reautenticar(u))return;                       // Firebase exige una sesión reciente para borrar una cuenta
  }catch(e){console.error(e);UI.alerta('No se pudo confirmar tu identidad'+detalleError(e)+'. No se borró nada.');return}
  try{
    for(const m of state.materias.filter(x=>x.sharedId)){
      try{await abandonarCompartida(m,m.rol==='docente'?{todos:true}:undefined)}catch(e){console.warn('No se pudo salir de una materia:',e)}
    }
    await borrarColeccionPropia('anotaciones/'+uidViejo+'/items');
    await borrarColeccionPropia('bancoPreguntas/'+uidViejo+'/items');
    await borrarColeccionPropia('users/'+uidViejo+'/materias');
    await db.collection('users').doc(uidViejo).delete();
    await db.collection('rachas').doc(uidViejo).delete().catch(e=>console.warn('No se pudo borrar el resumen de racha:',e));
    await db.collection('usuarios').doc(uidViejo).delete();
    await u.delete();
  }catch(e){
    console.error(e);
    UI.alerta('No se pudo eliminar todo'+detalleError(e)+'. Cierra sesión, vuelve a entrar e inténtalo otra vez.');
    return;
  }
  try{Object.keys(localStorage).filter(k=>k.includes(uidViejo)).forEach(k=>localStorage.removeItem(k))}catch(e){}
  toast('Tu cuenta fue eliminada.');
}

/* ---------- Estado de la sincronización: avisa si algo falla (antes solo quedaba en la consola) ---------- */
const FIRESTORE_MAX=1048576;           // límite de Firestore por documento (1 MiB)
const sync={fallo:'',falloMateria:'',aviso:'',tamAlto:false,offline:typeof navigator!=='undefined'&&navigator.onLine===false,soloLocal:false};
function textoFalloSync(e){
  const c=(e&&e.code)||'',msg=String((e&&e.message)||'');
  if(c==='permission-denied')return 'no tienes permiso para guardar (revisa que las reglas de Firestore estén publicadas o vuelve a iniciar sesión).';
  if(c==='unauthenticated')return 'tu sesión venció. Cierra sesión y vuelve a entrar.';
  if(/exceeds the maximum|too large|payload/i.test(msg)||c==='invalid-argument')return 'tu cuaderno es demasiado grande para la nube. Usa "Liberar espacio" o elimina materias que ya no uses.';
  if(c==='resource-exhausted')return 'se alcanzó la cuota diaria de Firebase. Se reintentará más tarde.';
  if(c==='unavailable'||c==='deadline-exceeded')return 'no hay conexión con la nube.';
  return 'error inesperado'+(msg?' ('+msg.slice(0,120)+')':'')+'.';
}
function pintarBanner(){
  let b=document.getElementById('syncBanner');
  const grave=sync.fallo||sync.falloMateria;
  const msg=grave||sync.aviso||(sync.offline?'📴 Sin conexión: tus cambios se guardan en este dispositivo y se subirán a la nube cuando vuelva internet.':'');
  if(!msg||!currentUid){if(b)b.remove();return}
  if(!b){b=document.createElement('div');b.id='syncBanner';b.setAttribute('role','alert');document.body.appendChild(b)}
  b.className='syncBanner'+(grave?' grave':'');
  b.innerHTML=`<span>${msg}</span>${grave?'<button type="button" data-action="syncReintentar">Reintentar</button>':''}${(!grave&&sync.tamAlto)?'<button type="button" data-action="liberarEspacio">Liberar espacio</button>':''}`;
}
function syncFallo(e){sync.fallo='⚠️ No se pudo guardar en la nube: '+esc(textoFalloSync(e))+' Tus cambios siguen guardados en este dispositivo.';pintarBanner()}
function syncOk(){sync.fallo='';pintarBanner()}
function revisarTamano(bytes){
  const pct=Math.round(bytes/FIRESTORE_MAX*100);
  sync.tamAlto=pct>=80;
  sync.aviso=sync.tamAlto?'💾 Una de tus materias ocupa el '+pct+' % del espacio que permite la nube. Si se llena dejará de sincronizarse: libera espacio.':'';
}
async function liberarEspacio(){
  const lim=Date.now()-120*864e5,viejos=(state.attempts||[]).filter(a=>a.date<lim).length;
  if(!viejos){UI.alerta('No hay intentos antiguos que borrar. Para liberar más espacio elimina materias o temas que ya no uses.');return}
  if(await UI.confirmar('Se borrarán '+viejos+' intentos de quiz y examen de hace más de 4 meses. Tu racha, tus insignias y las etapas ya completadas se conservan; las etapas sin completar podrían perder avance de exámenes antiguos. ¿Continuar?'))mutate(s=>{s.attempts=s.attempts.filter(a=>a.date>=lim)});
}
async function reintentarSync(){
  if(!currentUid)return;
  if(sync.soloLocal){
    try{
      const nube=await leerNube(currentUid);
      if(nube){
        if(await UI.confirmar('Se encontró tu cuaderno guardado en la nube.\n\nAceptar = cargar la versión de la nube (se descartan los cambios hechos sin conexión en este dispositivo).\nCancelar = conservar lo de este dispositivo y reemplazar la nube.')){
          state=nube;normalizeState();saveLocal();applyTheme();updateThemeBtn();render();startShared();
        }
      }
      sync.soloLocal=false;sync.fallo='';
    }catch(e){syncFallo(e);return}
  }
  await pushCloudNow();
}
window.addEventListener('online',()=>{sync.offline=false;pintarBanner();pushCloudNow()});
window.addEventListener('offline',()=>{sync.offline=true;pintarBanner()});

/* ---------- Nube por partes ----------
   Antes todo el cuaderno era UN documento (users/{uid}) que se reemplazaba entero: si se estudiaba en dos equipos,
   el último en guardar borraba lo del otro, y Firestore no deja pasar de 1 MB por documento.
   Ahora:  users/{uid}                 -> lo general (perfil, semestres, calendario, racha...) en el campo "global"
           users/{uid}/materias/{id}   -> cada materia con sus temas, cortes, tarjetas e intentos
   Solo se sube lo que cambió desde la última vez, así un equipo no pisa las materias que tocó el otro.
   Las cuentas antiguas (campo "data" con todo junto) se pasan solas al formato nuevo la primera vez que se guarda. */
const PARTES_MATERIA=['temas','cortes','cards','attempts'];
const nubeSubido=new Map();          // id de materia (o '__raiz') -> JSON que ya está en la nube
function partirEstado(s){
  const ids=new Set((s.materias||[]).map(m=>m.id)),mats={},raiz={};
  (s.materias||[]).forEach(m=>{mats[m.id]={materia:m}});
  Object.keys(s).forEach(k=>{
    if(k==='materias')return;
    if(PARTES_MATERIA.includes(k)&&Array.isArray(s[k])){
      raiz[k]=[];
      s[k].forEach(x=>{if(x&&ids.has(x.materiaId))(mats[x.materiaId][k]=mats[x.materiaId][k]||[]).push(x);else raiz[k].push(x)});
      return;
    }
    raiz[k]=s[k];
  });
  raiz.orden=(s.materias||[]).map(m=>m.id);
  return{raiz,mats};
}
function unirEstado(raiz,partes){
  const s=Object.assign({},raiz),orden=s.orden||[];delete s.orden;
  partes=partes.slice().sort((a,b)=>{const i=orden.indexOf(a.materia.id),j=orden.indexOf(b.materia.id);return(i<0?1e9:i)-(j<0?1e9:j)});
  s.materias=partes.map(p=>p.materia);
  PARTES_MATERIA.forEach(k=>{s[k]=(s[k]||[]).slice();partes.forEach(p=>{if(Array.isArray(p[k]))s[k].push(...p[k])})});
  return s;
}
/* Lee el cuaderno de la nube. Devuelve null si la cuenta todavía no tiene nada guardado. */
async function leerNube(u){
  const ref=db.collection('users').doc(u),doc=await ref.get();
  const d=doc.exists?doc.data():null;
  if(d&&d.global){
    const snap=await ref.collection('materias').get();
    nubeSubido.clear();nubeSubido.set('__raiz',d.global);
    const partes=[];
    snap.docs.forEach(x=>{try{const p=JSON.parse(x.data().data);if(p&&p.materia){partes.push(p);nubeSubido.set(x.id,x.data().data)}}catch(e){console.warn('Materia ilegible en la nube:',x.id,e)}});
    return unirEstado(JSON.parse(d.global),partes);
  }
  nubeSubido.clear();
  if(d&&d.data)return JSON.parse(d.data);          // formato antiguo: todo en un solo documento
  return null;
}

let cloudTimer=null,subiendo=false,subirOtraVez=false;
function scheduleCloud(){
  if(!currentUid)return;
  clearTimeout(cloudTimer);
  cloudTimer=setTimeout(pushCloudNow,1000);
}
async function pushCloudNow(){
  if(!currentUid)return;
  if(subiendo){subirOtraVez=true;return}
  pushShared();
  if(sync.soloLocal){sync.fallo='⚠️ No se pudo leer tu cuaderno de la nube al iniciar. Por seguridad no se sube nada para no pisarlo con datos viejos. Tus cambios siguen en este dispositivo.';pintarBanner();return}
  subiendo=true;
  const uidAhora=currentUid;
  try{
    const{raiz,mats}=partirEstado(state),ref=db.collection('users').doc(uidAhora);
    const ahora=()=>firebase.firestore.FieldValue.serverTimestamp();
    let mayor=0;const tareas=[];
    Object.keys(mats).forEach(id=>{
      const data=JSON.stringify(mats[id]);
      mayor=Math.max(mayor,new Blob([data]).size);
      if(nubeSubido.get(id)!==data)tareas.push(ref.collection('materias').doc(id).set({data,updatedAt:ahora()}).then(()=>nubeSubido.set(id,data)));
    });
    [...nubeSubido.keys()].filter(id=>id!=='__raiz'&&!mats[id]).forEach(id=>{
      tareas.push(ref.collection('materias').doc(id).delete().then(()=>nubeSubido.delete(id)));
    });
    const global=JSON.stringify(raiz);
    mayor=Math.max(mayor,new Blob([global]).size);
    revisarTamano(mayor);
    await Promise.all(tareas);
    // La raíz va al final: si algo de arriba falla, no queda apuntando a materias a medio subir
    if(nubeSubido.get('__raiz')!==global){
      await ref.set({global,v:2,updatedAt:ahora()});      // set() sin merge: borra el campo "data" del formato antiguo
      nubeSubido.set('__raiz',global);
    }
    syncOk();
    publicarRacha();                                   // resumen de la racha para el profesor y los admin (solo estudiantes)
  }catch(e){console.error('No se pudo sincronizar con la nube:',e);syncFallo(e)}
  finally{
    subiendo=false;
    if(subirOtraVez&&currentUid===uidAhora){subirOtraVez=false;pushCloudNow()}
  }
}
async function hydrateFromCloud(u){
  currentUid=u;
  try{
    const nube=await leerNube(u);
    if(nube){
      state=nube;
      if(!nubeSubido.size){normalizeState();saveLocal();await pushCloudNow();return}   // cuenta antigua: se pasa al formato nuevo
    }else{
      state=loadLocal()||defaultState();
      await pushCloudNow();
    }
  }catch(e){
    console.error('No se pudo leer la nube, uso datos locales:',e);
    state=loadLocal()||defaultState();
    sync.soloLocal=true;sync.fallo='⚠️ No se pudo leer tu cuaderno de la nube ('+esc(textoFalloSync(e))+') Trabajas con los datos de este dispositivo y no se subirá nada hasta que reintentes.';
    pintarBanner();
  }
  normalizeState();
  saveLocal();
}

/* mutate(): cambio estructural -> guarda + sincroniza + vuelve a pintar */
function mutate(fn){fn(state);ensureCortes();saveLocal();scheduleCloud();render()}
/* persist(): cambio de texto (inputs) -> guarda + sincroniza SIN repintar, para no perder el foco */
function persist(){saveLocal();scheduleCloud()}

