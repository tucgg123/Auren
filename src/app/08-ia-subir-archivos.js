/* ================= IA: SUBIR PDF/PPTX Y GENERAR TEMA + TARJETAS ================= */
/* Caché de resultados de IA: si subes otra vez el mismo archivo, se reutiliza el resultado
   y NO se gasta una petición del límite diario de Gemini (que cuenta peticiones, no tokens). */
const IA_CACHE_VER='v8';   // súbela cada vez que cambies las instrucciones de la IA, para no reutilizar resultados viejos
const IA_LIMITE_DIARIO=20;   // archivos (PDF o PPTX) por persona y por día. Debe coincidir con LIMITE_DIARIO en netlify/functions/generar-tema.js
const IA_MAX_CHARS=60000;   // texto máximo que se manda a la IA (antes 20 000: el resto se ignoraba en silencio)
const IA_CACHE_MAX=15;     // cuántos resultados se recuerdan en este navegador
async function iaHash(texto){
  try{
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(IA_CACHE_VER+'|'+String(texto).trim().slice(0,IA_MAX_CHARS)));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){return null}
}
function iaCacheLeer(){try{return JSON.parse(localStorage.getItem('iaCache')||'{}')||{}}catch(e){return{}}}
async function iaCacheGet(texto){
  const k=await iaHash(texto);if(!k)return null;
  const e=iaCacheLeer()[k];
  return e&&e.d&&e.v===IA_CACHE_VER?e.d:null;
}
async function iaCacheSet(texto,data){
  const k=await iaHash(texto);if(!k)return;
  const c=iaCacheLeer();c[k]={t:Date.now(),v:IA_CACHE_VER,d:data};
  Object.keys(c).sort((a,b)=>c[b].t-c[a].t).slice(IA_CACHE_MAX).forEach(x=>delete c[x]);
  try{localStorage.setItem('iaCache',JSON.stringify(c))}catch(e){/* sin espacio: no pasa nada */}
}
/* ---------- Cupo diario de archivos ---------- */
const diaColombia=()=>Math.floor((Date.now()-18000000)/86400000);    // el día cambia a medianoche de Colombia (UTC-5)
function iaRestantes(){const u=ui.iaUso;return u&&u.ok?Math.max(0,IA_LIMITE_DIARIO-u.usados):null}
function textoRenueva(){const min=Math.max(1,Math.ceil((86400000-((Date.now()-18000000)%86400000))/60000)),h=Math.floor(min/60),m=min%60;return h?h+' h'+(m?' '+m+' min':''):m+' min'}
function cupoIAHTML(){
  const u=ui.iaUso;
  if(!u||(!u.ok&&u.cargando))return '<span class="meta">Consultando cuántos archivos te quedan hoy…</span>';
  if(!u.ok)return `<span class="meta">No pude consultar tu cupo ahora. El límite es de <b>${IA_LIMITE_DIARIO} archivos (PDF o PPTX) por día</b>.</span>`;
  const rest=Math.max(0,IA_LIMITE_DIARIO-u.usados),cls=rest===0?'cupo0':rest<=3?'cupoBajo':'';
  return `<div class="cupoIA ${cls}"><b>📎 Te quedan ${rest} de ${IA_LIMITE_DIARIO} archivos hoy</b><div class="bar"><i style="width:${Math.round(rest/IA_LIMITE_DIARIO*100)}%"></i></div><small class="meta">${rest===0?'Ya usaste todos los de hoy. ':''}Se renuevan a la medianoche (hora de Colombia), en ${textoRenueva()}. Si subes un archivo que ya analizaste antes en este navegador, no gasta cupo. Si la IA falla, tampoco.</small></div>`;
}
function actualizarCupoUI(){const el=$('iaCupo');if(el)el.innerHTML=cupoIAHTML()}
async function cargarUsoIA(){
  if(!currentUid||(ui.iaUso&&ui.iaUso.cargando))return;
  ui.iaUso={...(ui.iaUso||{}),cargando:true};
  try{
    const d=await db.collection('iaUso').doc(currentUid).get(),x=d.exists?d.data():null;
    ui.iaUso={ok:true,usados:(x&&x.dia===diaColombia())?(+x.n||0):0,t:Date.now()};
  }catch(e){console.warn('No se pudo leer el cupo de IA:',e);ui.iaUso={ok:false,t:Date.now()}}
  actualizarCupoUI();
}
/* pdf.js y JSZip pesan bastante: se descargan solo la primera vez que alguien sube un archivo, no al abrir la app */
const PDFJS_VER='5.4.54';
let pdfjsPromise=null,jszipPromise=null;
function cargarPdfJs(){
  if(!pdfjsPromise)pdfjsPromise=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VER+'/build/pdf.min.mjs').then(m=>{
    m.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VER+'/build/pdf.worker.min.mjs';
    return m;
  }).catch(e=>{pdfjsPromise=null;throw new Error('No se pudo cargar el lector de PDF (¿sin internet?)')});
  return pdfjsPromise;
}
function cargarJSZip(){
  if(window.JSZip)return Promise.resolve(window.JSZip);
  if(!jszipPromise)jszipPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload=()=>res(window.JSZip);
    s.onerror=()=>{jszipPromise=null;rej(new Error('No se pudo cargar el lector de PPTX (¿sin internet?)'))};
    document.head.appendChild(s);
  });
  return jszipPromise;
}
async function extraerPDF(file){
  const buf=await file.arrayBuffer();
  const pdfjs=await cargarPdfJs();
  const pdf=await pdfjs.getDocument({data:buf}).promise;
  let texto='';
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    texto+=content.items.map(it=>it.str).join(' ')+'\n\n';
  }
  return{texto:texto.trim(),paginas:pdf.numPages};
}
const IA_PDF_MAX=8*1024*1024;      // tamaño máximo de un PDF escaneado que se le manda a la IA
function archivoABase64(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error||new Error('No se pudo leer el archivo'));r.readAsDataURL(file)});
}
async function extraerTextoPPTX(file){
  const JSZ=await cargarJSZip();
  const zip=await JSZ.loadAsync(file);
  const slideFiles=Object.keys(zip.files)
    .filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a,b)=>{
      const na=+a.match(/slide(\d+)\.xml/)[1], nb=+b.match(/slide(\d+)\.xml/)[1];
      return na-nb;
    });
  let texto='';
  for(const name of slideFiles){
    const xml=await zip.files[name].async('text');
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    const nodes=doc.getElementsByTagName('a:t');
    texto+=Array.from(nodes).map(n=>n.textContent).join(' ')+'\n\n';
  }
  return texto.trim();
}

/* ---------- Documento original (PDF/PPTX del docente) ----------
   Se guarda en Firestore troceado en base64:  temarios/{sid}/temas/{temaId}/archivo/{0..n}
   (Firestore limita cada documento a 1 MiB). El tema guarda solo la ficha: tema.archivo={nombre,tipo,tam,partes}.
   Es independiente de lo que genera la IA (resumen, esquema, tarjetas, exámenes). */
const ARCH_MAX=8*1024*1024;      // tamaño máximo del original (8 MB)
const ARCH_PARTE=600000;         // caracteres base64 por trozo (múltiplo de 4: cada trozo se decodifica solo)
const ARCH_STORAGE_MAX=50*1024*1024;   // con Firebase Storage activado: hasta 50 MB
const usaStorage=()=>typeof USAR_STORAGE!=='undefined'&&USAR_STORAGE===true;
const tieneOriginal=a=>!!(a&&(a.partes||a.ruta));
let storagePromise=null;
function cargarStorage(){
  if(!storagePromise)storagePromise=new Promise((res,rej)=>{
    const listo=()=>{try{res(firebase.storage())}catch(e){storagePromise=null;rej(e)}};
    if(firebase.storage)return listo();
    const s=document.createElement('script');
    s.src='https://www.gstatic.com/firebasejs/11.10.0/firebase-storage-compat.js';
    s.onload=listo;s.onerror=()=>{storagePromise=null;rej(new Error('No se pudo cargar Firebase Storage'))};
    document.head.appendChild(s);
  });
  return storagePromise;
}
async function guardarEnStorage(m,temaId,file,avisar){
  const st=await cargarStorage();
  const seguro=file.name.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g,'_');
  const ruta='originales/'+m.sharedId+'/'+temaId+'/'+seguro;
  /* contentDisposition hace que el navegador lo descargue con el nombre original sin pedir permisos CORS */
  const tarea=st.ref(ruta).put(file,{contentType:file.type||archivoMime(file.name),contentDisposition:"attachment; filename*=UTF-8''"+encodeURIComponent(file.name)});
  await new Promise((res,rej)=>{tarea.on('state_changed',s=>{if(avisar)avisar('📎 Subiendo el original… '+Math.round(s.bytesTransferred/s.totalBytes*100)+' %')},rej,res)});
  return{nombre:file.name,tipo:file.type||archivoMime(file.name),tam:file.size,en:'storage',ruta,subido:Date.now()};
}
function archivoMime(n){const x=String(n||'').toLowerCase();return x.endsWith('.pdf')?'application/pdf':x.endsWith('.pptx')?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/octet-stream'}
function fmtTam(b){b=+b||0;return b>=1048576?(b/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(b/1024))+' KB'}
async function guardarOriginal(m,temaId,file,avisar){
  if(!m||!m.sharedId||m.rol==='estudiante'||!temaId)return{ok:false,mensaje:'El original solo se guarda en materias compartidas o de docente.'};
  if(file.size>ARCH_MAX){
    if(usaStorage()&&file.size<=ARCH_STORAGE_MAX){
      try{return{ok:true,meta:await guardarEnStorage(m,temaId,file,avisar)}}
      catch(err){console.error('Storage:',err);return{ok:false,mensaje:'No se pudo subir el original grande a Firebase Storage'+detalleError(err)+'. El tema sí se creó, pero sin el original descargable.'}}
    }
    const tope=usaStorage()?ARCH_STORAGE_MAX:ARCH_MAX;
    return{ok:false,mensaje:'El archivo pesa '+fmtTam(file.size)+' y el máximo para guardar el original es '+fmtTam(tope)+'. El tema sí se creó, pero sin el original descargable.'};
  }
  try{
    const b64=await archivoABase64(file);
    const partes=Math.ceil(b64.length/ARCH_PARTE);
    const col=refTemario(m.sharedId).collection('temas').doc(temaId).collection('archivo');
    for(let i=0;i<partes;i++){
      if(avisar)avisar('📎 Guardando el original… '+(i+1)+'/'+partes);
      await col.doc(String(i)).set({i,data:b64.slice(i*ARCH_PARTE,(i+1)*ARCH_PARTE)});
    }
    return{ok:true,meta:{nombre:file.name,tipo:file.type||archivoMime(file.name),tam:file.size,partes,subido:Date.now()}};
  }catch(err){
    console.error('Guardar original:',err);
    borrarOriginalNube(m.sharedId,temaId,Math.ceil(ARCH_MAX*1.4/ARCH_PARTE));
    return{ok:false,mensaje:'No se pudo guardar el original'+detalleError(err)+'. ¿Publicaste las reglas nuevas de Firestore? El tema sí se creó.'};
  }
}
async function borrarOriginalNube(sid,temaId,partes,meta){
  if(meta&&meta.en==='storage'&&meta.ruta){
    try{const st=await cargarStorage();await st.ref(meta.ruta).delete()}catch(e){console.warn('No se pudo borrar el original de Storage:',e)}
    return;
  }
  if(!sid||!temaId||!partes)return;
  try{
    const col=refTemario(sid).collection('temas').doc(temaId).collection('archivo');
    const b=db.batch();for(let i=0;i<partes;i++)b.delete(col.doc(String(i)));await b.commit();
  }catch(e){console.warn('No se pudo limpiar el original de la nube:',e)}
}
const descargando=new Set();
async function descargarOriginal(temaId){
  const t=state.temas.find(x=>x.id===temaId);if(!t||!t.archivo)return;
  const m=state.materias.find(x=>x.id===t.materiaId);
  if(!m||!m.sharedId){UI.alerta('Este documento no está disponible en este dispositivo.');return}
  if(descargando.has(temaId))return;
  descargando.add(temaId);
  toast('⬇️ Preparando '+esc(t.archivo.nombre||'el documento')+'…');
  try{
    if(t.archivo.en==='storage'){
      const st=await cargarStorage();
      const url=await st.ref(t.archivo.ruta).getDownloadURL();
      const a=document.createElement('a');a.href=url;a.rel='noopener';document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1500);
      return;
    }
    const snap=await refTemario(m.sharedId).collection('temas').doc(temaId).collection('archivo').orderBy('i').get();
    const partes=snap.docs.map(d=>d.data());
    if(partes.length!==t.archivo.partes||partes.some((p,i)=>p.i!==i))throw new Error('El documento está incompleto en la nube. Pídele a tu docente que lo vuelva a subir.');
    const trozos=partes.map(p=>{const bin=atob(p.data),u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);return u});
    const blob=new Blob(trozos,{type:t.archivo.tipo||archivoMime(t.archivo.nombre)});
    if(t.archivo.tam&&blob.size!==t.archivo.tam)throw new Error('El archivo descargado no coincide con el original (tamaño distinto).');
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=t.archivo.nombre||'documento';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
  }catch(e){
    console.error(e);
    UI.alerta('No se pudo descargar el documento original'+(e&&e.code?detalleError(e):': '+(e&&e.message||'error'))+'.');
  }finally{descargando.delete(temaId)}
}
function docsOriginalesHTML(m){
  const items=state.temas.filter(x=>x.materiaId===m.id&&x.archivo);
  if(!items.length)return '';
  const cortes=state.cortes.filter(c=>c.materiaId===m.id);
  return `<div class="card shareBox" style="margin-top:12px"><b style="font-size:.9em">📎 Documentos originales de tu docente</b>
    <p class="meta" style="margin:4px 0 0">Los archivos tal como los subió tu docente. Son independientes de los resúmenes, esquemas, tarjetas y exámenes generados con IA.</p>
    ${cortes.map(c=>{const ts=items.filter(x=>x.corteId===c.id);if(!ts.length)return '';
      return `<div style="margin-top:10px"><span class="chip">📁 ${esc(c.name)||'(corte sin nombre)'}</span>${ts.map(x=>`<div class="li"><span>📝 ${esc(x.title)||'(tema sin título)'}<br><small class="meta">${esc(x.archivo.nombre||'')} · ${fmtTam(x.archivo.tam)}</small></span><button class="sec" data-action="descargarOriginal" data-id="${x.id}">⬇️ Descargar</button></div>`).join('')}</div>`}).join('')}
  </div>`;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action="iaPickFile"]');
  if(b)$('iaFileInput').click();
});

document.addEventListener('change',async e=>{
  if(e.target.id!=='iaFileInput')return;
  if(!puedeSubir()){e.target.value='';UI.alerta('Solo los profesores pueden subir archivos.');return}
  const file=e.target.files[0];
  if(!file)return;
  const materiaId=e.target.dataset.mat;
  const statusEl=$('iaStatus');
  const btn=$('iaUploadBtn');
  const nombre=file.name.toLowerCase();
  let archivoGuardar=file;                         // la copia que se guarda como "original" (puede ser la comprimida)

  try{
    btn.disabled=true;
    if(nombre.endsWith('.pdf')&&file.size>ARCH_MAX){
      if(await UI.confirmar('¿Comprimir este PDF? Pesa '+fmtTam(file.size)+' y el máximo para guardarlo es '+fmtTam(ARCH_MAX)+'. Se crea una copia más liviana (sin texto seleccionable) para guardarla; la IA seguirá leyendo el texto del original.','Comprimir')){
        const res=await comprimirPDF(file,{objetivo:ARCH_MAX,progreso:(i,n)=>{statusEl.textContent='🗜️ Comprimiendo… página '+i+' de '+n}});
        if(res.ok)archivoGuardar=res.file;
        else UI.alerta('No se pudo comprimir por debajo de '+fmtTam(ARCH_MAX)+'. El tema se creará sin el original descargable.');
      }
    }
    statusEl.textContent='📄 Leyendo el archivo…';
    let texto='',pdfEscaneado=null;
    if(nombre.endsWith('.pdf')){
      const r0=await extraerPDF(file);texto=r0.texto;
      /* Casi sin texto seleccionable = escaneo o fotos de hojas: se lo manda la IA directamente para que lo lea (tipo OCR) */
      if(r0.texto.trim().length<Math.max(40,r0.paginas*25)){
        if(archivoGuardar.size>IA_PDF_MAX){
          statusEl.textContent='❌ Este PDF parece escaneado (sin texto) y pesa '+fmtTam(archivoGuardar.size)+'. Para que la IA lo lea el máximo es '+fmtTam(IA_PDF_MAX)+': comprímelo o divídelo en partes.';
          btn.disabled=false;return;
        }
        pdfEscaneado=archivoGuardar;
      }
    }
    else if(nombre.endsWith('.pptx')) texto=await extraerTextoPPTX(file);
    else{ statusEl.textContent='❌ Solo se admiten archivos .pdf o .pptx.'; btn.disabled=false; return; }

    if(!pdfEscaneado&&(!texto||texto.trim().length<40)){
      statusEl.textContent='❌ No pude sacar texto de ese archivo. Revisa que no esté vacío ni protegido con contraseña.';
      btn.disabled=false; return;
    }
    const claveCache=pdfEscaneado?('PDF-ESCANEADO|'+file.name+'|'+file.size+'|'+file.lastModified):texto;

    const materia=state.materias.find(m=>m.id===materiaId);
    if(state.temas.some(t=>t.materiaId===materiaId&&t.fuente===file.name)&&!await UI.confirmar('Ya hay un tema creado a partir de un archivo llamado "'+file.name+'". ¿Subirlo de todos modos?')){statusEl.textContent='';return}
    let data=await iaCacheGet(claveCache);
    const desdeCache=!!data;
    if(desdeCache){
      statusEl.textContent='♻️ Ya había analizado este archivo: reutilicé el resultado sin gastar IA.';
    }else{
      if(iaRestantes()===0){
        statusEl.textContent='❌ Ya usaste tus '+IA_LIMITE_DIARIO+' archivos de hoy. Se renuevan a la medianoche (hora de Colombia), en '+textoRenueva()+'. Los archivos que ya analizaste antes en este navegador sí puedes volver a subirlos sin gastar cupo.';
        btn.disabled=false;return;
      }
      statusEl.textContent=pdfEscaneado?'🔍 Este PDF parece escaneado (no tiene texto seleccionable): la IA lo leerá directamente. Puede tardar unos minutos…':'🤖 La IA está armando el tema y las tarjetas… puede tardar hasta un minuto.';
      const r=await pedirIA(texto,materia?materia.name:'',statusEl,pdfEscaneado);
      if(!r.ok){statusEl.textContent='❌ '+r.error;btn.disabled=false;ui.iaUso=null;cargarUsoIA();return}
      data=r.data;
      if(data&&data.cupo){ui.iaUso={ok:true,usados:+data.cupo.usados||0,t:Date.now()}}else{ui.iaUso=null;cargarUsoIA()}
      if(data)delete data.cupo;     // el cupo no es parte del tema ni debe quedar en la caché
    }
    if(!data.titulo||!Array.isArray(data.tarjetas)){
      statusEl.textContent='❌ La IA no devolvió un resultado válido. Probá de nuevo.';
      btn.disabled=false; return;
    }
    if(!desdeCache)iaCacheSet(claveCache,data);

    let temaIdNuevo=null;
    mutate(s=>{
      const temaId=uid();temaIdNuevo=temaId;
      const secs=Array.isArray(data.secciones)?data.secciones.filter(x=>x&&x.titulo&&x.contenido).map(x=>({id:uid(),title:String(x.titulo),body:String(x.contenido),rel:String(x.relacion||'').trim(),...(()=>{const pr=(Array.isArray(x.puntos)?x.puntos:[]).map((p,i)=>({p:String(p).trim(),t:Array.isArray(x.tipos)?x.tipos[i]:null})).filter(o=>o.p).slice(0,6);return{puntos:pr.map(o=>o.p),tipos:pr.map(o=>ESQ_TIPOS.includes(o.t)?o.t:null)}})()})):[];
      const sel=$('iaCorte');const corteId=(sel&&sel.value)||(s.cortes.find(c=>c.materiaId===materiaId)||{}).id;
      ui.open[corteId]=true;ui.open[temaId]=true;ui.corteAb=ui.corteAb||{};ui.corteAb[materiaId]=corteId;
      const tema={id:temaId,materiaId,corteId,title:data.titulo,body:data.resumen||'',by:miNombre(),fuente:file.name,publicado:(materia&&materia.rol==='docente')?false:undefined,updatedAt:Date.now()};
      if(secs.length)tema.secciones=secs;
      s.temas.unshift(tema);
      (data.tarjetas||[]).forEach(t=>{
        if(t.frente&&t.reverso){
          const c={id:uid(),materiaId,temaId,front:t.frente,back:t.reverso,known:null};
          const dist=(Array.isArray(t.distractores)?t.distractores:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,3);
          if(dist.length>=3)c.dist=dist;                                   // opciones incorrectas hechas por la IA
          if(String(t.falsa||'').trim())c.falsa=String(t.falsa).trim();    // afirmación falsa (verdadero/falso)
          if(String(t.hueco_oracion||'').includes('____')&&String(t.hueco_respuesta||'').trim())c.hueco={o:String(t.hueco_oracion).trim(),r:String(t.hueco_respuesta).trim()};
          if(['facil','media','dificil'].includes(t.dificultad))c.dif=t.dificultad;                  // qué tan difícil es, según la IA
          if(String(t.explicacion||'').trim())c.exp=String(t.explicacion).trim().slice(0,400);       // por qué la respuesta es esa (se muestra al fallar)
          s.cards.push(c);
        }
      });
    });
    const avisoRecorte=pdfEscaneado?' 🔍 Era un PDF escaneado: revisa el contenido por si alguna parte no se leyó bien.':texto.length>IA_MAX_CHARS?` ⚠️ El archivo es muy largo: la IA analizó solo los primeros ${IA_MAX_CHARS.toLocaleString('es')} caracteres.`:'';
    const setEstado=txt=>{const st=$('iaStatus');if(st)st.textContent=txt};
    const base_ok=`✅ Listo — se creó el tema "${data.titulo}" con ${(data.tarjetas||[]).length} tarjetas.${desdeCache?' (resultado reutilizado, sin gastar IA ni cupo)':''}${avisoRecorte}${(!desdeCache&&iaRestantes()!=null)?' Te quedan '+iaRestantes()+' de '+IA_LIMITE_DIARIO+' archivos hoy.':''}`;
    setEstado(base_ok);
    /* Documento original: se guarda aparte de lo que genera la IA (solo en materias compartidas / de docente) */
    if(materia&&materia.sharedId&&materia.rol!=='estudiante'){
      const r=await guardarOriginal(materia,temaIdNuevo,archivoGuardar,txt=>setEstado(base_ok+' '+txt));
      if(r.ok){
        mutate(s=>{const tm=s.temas.find(x=>x.id===temaIdNuevo);if(tm)tm.archivo=r.meta});
        setEstado(base_ok+' 📎 Original guardado: los estudiantes podrán descargarlo.');
      }else{
        setEstado(base_ok+' ⚠️ '+r.mensaje);
        toast('⚠️ '+esc(r.mensaje));
      }
    }
  }catch(err){
    console.error(err);
    const st=$('iaStatus');
    if(st) st.textContent='❌ Algo falló: '+err.message;
  }finally{
    const bt=$('iaUploadBtn'); if(bt)bt.disabled=false;
    e.target.value='';
  }
});
/* Hecho por Sebastián Poveda y Santiago Romero. 2026 */
