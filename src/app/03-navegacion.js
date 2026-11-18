/* ================= NAVEGACIÓN PRINCIPAL ================= */
document.querySelectorAll('#mainNav [data-nav]').forEach(b=>b.onclick=()=>{
  route={view:b.dataset.nav,materiaId:null};
  document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('on',x===b));
  render();
});
/* ======================= Navegación con URL =======================
   Cada pantalla tiene su dirección (#/materia/ID, #/estudio/quiz/ID …). Así el botón "atrás" del celular o del navegador
   vuelve a la pantalla anterior en vez de cerrar la app, y se puede recargar o compartir el enlace de una materia. */
const HERRAMIENTAS=['flashcards','memorizar','quiz','examen','escrito','concepto','hoy','falle','repaso','comparar','progreso','referencias'];
function rutaAHash(r){
  const v=r.view;
  if(v==='materias'&&r.semId)return '#/semestre/'+r.semId;
  if(v==='materiaDetail'&&r.materiaId)return '#/materia/'+r.materiaId;
  if(v==='tool'&&r.materiaId&&r.tool)return '#/estudio/'+r.tool+'/'+r.materiaId;
  if(v==='docExamen'&&r.materiaId&&r.examId)return '#/examen/'+r.materiaId+'/'+r.examId;
  if(v==='docResultados'&&r.materiaId&&r.examId)return '#/resultados/'+r.materiaId+'/'+r.examId;
  if(v==='examenDoc'&&r.materiaId&&r.examId)return '#/presentar/'+r.materiaId+'/'+r.examId;
  if(['calendario','logros','perfil','docente','admin'].includes(v))return '#/'+v;
  return '#/';
}
function hashARuta(h){
  const p=String(h||'').replace(/^#\/?/,'').split('/');
  const a=p[0]||'',b=p[1],c=p[2];
  if(a==='')return{view:'materias',materiaId:null};
  if(['calendario','logros','perfil','docente','admin'].includes(a))return{view:a,materiaId:null};
  if(a==='semestre'&&b)return{view:'materias',materiaId:null,semId:b};
  if(a==='materia'&&b)return{view:'materiaDetail',materiaId:b};
  if(a==='estudio'&&b&&c&&HERRAMIENTAS.includes(b))return{view:'tool',tool:b,materiaId:c};
  if(a==='examen'&&b&&c)return{view:'docExamen',materiaId:b,examId:c};
  if(a==='resultados'&&b&&c)return{view:'docResultados',materiaId:b,examId:c};
  if(a==='presentar'&&b&&c)return{view:'examenDoc',materiaId:b,examId:c};
  return null;
}
let reemplazarHash=false;
function sincronizarHash(){
  if(!currentUid||typeof history==='undefined'||!history.pushState)return;
  const h=rutaAHash(route),actual=location.hash||'#/';
  if(actual===h||(h==='#/'&&(location.hash===''||location.hash==='#'))){reemplazarHash=false;return}     // la pantalla inicial ya coincide: el siguiente cambio sí agrega una entrada al historial
  try{if(reemplazarHash){history.replaceState(null,'',h);reemplazarHash=false}else history.pushState(null,'',h)}catch(e){}
}
function marcarNavSegunRuta(){
  const top=['materias','docente','admin','calendario','logros','perfil'].includes(route.view)?route.view:(esProfesor()?'docente':'materias');
  document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('on',x.dataset.nav===top));
}
/* Al abrir la app con un enlace (por ejemplo #/materia/ID) se entra directo a esa pantalla, si existe y puedes verla */
function rutaInicialDesdeHash(){
  reemplazarHash=true;
  const r=hashARuta(location.hash);
  if(r&&r.view==='materias'&&r.semId&&state.semesters.some(s=>s.id===r.semId&&!s.oculto)&&!esProfesor()){route={view:'materias',materiaId:null,semId:r.semId};return}
  if(!r||r.view==='materias')return;
  if(['calendario','logros','perfil','docente','admin'].includes(r.view)){route={view:r.view,materiaId:null};return}
  const m=r.materiaId&&state.materias.find(x=>x.id===r.materiaId);
  if(m)route={view:'materiaDetail',materiaId:m.id};
}
/* Botón "atrás" / "adelante" o cambio manual de la dirección */
async function aplicarHash(){
  if(!currentUid||$('appRoot').hidden)return;
  let r=hashARuta(location.hash);
  if(!r){reemplazarHash=true;r={view:'materias',materiaId:null}}
  const m=r.materiaId?state.materias.find(x=>x.id===r.materiaId):null;
  if(r.materiaId&&!m){reemplazarHash=true;r={view:esProfesor()?'docente':'materias',materiaId:null}}
  if(r.view==='materias'&&r.semId&&!state.semesters.some(s=>s.id===r.semId&&!s.oculto)){reemplazarHash=true;r={view:'materias',materiaId:null}}
  if(r.view==='tool'){route={view:'tool',tool:r.tool,materiaId:r.materiaId};marcarNavSegunRuta();startTool(r.tool,r.materiaId);return}
  const ex=m&&r.examId?(exMap[m.sharedId]||{})[r.examId]:null;
  if(r.examId&&!ex){reemplazarHash=true;r={view:'materiaDetail',materiaId:r.materiaId}}
  if(r.view==='docExamen'){abrirEditor(m,r.examId);marcarNavSegunRuta();render();return}
  if(r.view==='examenDoc'){marcarNavSegunRuta();await abrirExamenEst(m,r.examId);return}
  if(r.view==='docResultados'){docResSel=null;docResFiltro='todas'}
  route=r;marcarNavSegunRuta();render();
}
window.addEventListener('popstate',aplicarHash);
function goToView(v){
  route.view=v;route.materiaId=null;delete route.semId;
  document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('on',x.dataset.nav===v));
  render();
}

/* ---------- Repintado incremental ----------
   Antes cada cambio reemplazaba toda la pantalla con innerHTML (se perdían el foco, lo escrito y se veía "parpadeo").
   Ahora, cuando es la MISMA pantalla, se compara con lo que ya está y solo se tocan los nodos que cambiaron.
   Las listas se emparejan por data-tema / data-sec / data-corte / data-key / id, así un elemento nuevo
   o movido no "contagia" su estado (desplegado, texto escrito) al de al lado. */
function claveNodo(n){
  if(n.nodeType!==1)return '';
  const d=n.dataset||{};
  return d.key||d.tema||d.sec||d.corte||n.id||'';
}
function morphNodo(padre,o,n){
  if(o.nodeType!==n.nodeType||o.nodeName!==n.nodeName){padre.replaceChild(document.importNode(n,true),o);return}
  if(o.nodeType!==1){if(o.nodeValue!==n.nodeValue)o.nodeValue=n.nodeValue;return}
  if(o.isEqualNode(n))return;                                   // nada que hacer
  const tag=o.nodeName,activo=(o===document.activeElement);
  const abiertoSinGuardar=tag==='DETAILS'&&!(o.dataset.tema||o.dataset.sec||o.dataset.corte);   // su estado abierto/cerrado no vive en la app: se respeta
  const valorAntes=o.getAttribute('value'),checkedAntes=o.hasAttribute('checked');
  const textoAntes=tag==='TEXTAREA'?o.defaultValue:null;
  const selAntes=tag==='SELECT'?Array.from(o.options).findIndex(x=>x.hasAttribute('selected')):-1;
  for(const a of Array.from(o.attributes)){
    if(abiertoSinGuardar&&a.name==='open')continue;
    if(!n.hasAttribute(a.name))o.removeAttribute(a.name);
  }
  for(const a of Array.from(n.attributes)){
    if(abiertoSinGuardar&&a.name==='open')continue;
    if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);
  }
  morphHijos(o,n);
  /* Lo que la persona escribió o eligió solo se pisa si la app cambió el valor de fábrica, y nunca en el campo que tiene el foco */
  if(!activo){
    if(tag==='INPUT'){
      if(o.type==='checkbox'||o.type==='radio'){if(checkedAntes!==o.hasAttribute('checked'))o.checked=o.hasAttribute('checked')}
      else if(valorAntes!==o.getAttribute('value'))o.value=o.getAttribute('value')||'';
    }else if(tag==='TEXTAREA'){
      if(textoAntes!==o.defaultValue)o.value=o.defaultValue;
    }else if(tag==='SELECT'){
      const selDespues=Array.from(o.options).findIndex(x=>x.hasAttribute('selected'));
      if(selDespues!==selAntes&&selDespues>=0)o.selectedIndex=selDespues;
    }
  }
}
function morphHijos(o,n){
  const nuevos=Array.from(n.childNodes),viejos=Array.from(o.childNodes);
  const porClave=new Map();
  viejos.forEach(x=>{const k=claveNodo(x);if(k&&!porClave.has(k))porClave.set(k,x)});
  const usados=new Set();
  let ref=o.firstChild;
  for(const nuevo of nuevos){
    const k=claveNodo(nuevo);
    let cand=null;
    if(k){const c=porClave.get(k);if(c&&!usados.has(c))cand=c}
    else if(ref&&!usados.has(ref)&&!claveNodo(ref))cand=ref;
    if(cand){
      usados.add(cand);
      if(cand===ref)ref=ref.nextSibling;else o.insertBefore(cand,ref);
      morphNodo(o,cand,nuevo);
    }else{
      o.insertBefore(document.importNode(nuevo,true),ref);
    }
  }
  viejos.forEach(x=>{if(!usados.has(x)&&x.parentNode===o)o.removeChild(x)});
}
function morph(destino,html){
  const tpl=document.createElement('template');
  tpl.innerHTML=html;
  morphHijos(destino,tpl.content);
}
const VISTAS_MORPH=['materias','materiaDetail','perfil','docente','logros','docResultados','examenDoc','calendario','docExamen'];

function render(keep){
  const _y=window.scrollY;
  guardarRuta();
  sincronizarHash();
  if(route.view!=='tool')clearRepasoTimer();
  if(route.view!=='examenDoc')clearExTimer();
  const view=$('view');
  let html='';
  if(route.view==='materias')html=viewMateriasHTML();
  else if(route.view==='materiaDetail')html=viewMateriaDetailHTML(route.materiaId);
  else if(route.view==='tool')html=viewToolHTML();
  else if(route.view==='calendario')html=viewCalendarioHTML();
  else if(route.view==='admin')html=viewAdminHTML();
  else if(route.view==='perfil')html=esProfesor()?viewPerfilDocenteHTML():viewPerfilHTML();
  else if(route.view==='docExamen')html=viewDocExamenHTML();
  else if(route.view==='docResultados')html=viewDocResultadosHTML();
  else if(route.view==='examenDoc')html=viewExamenDocHTML();
  else if(route.view==='docente')html=viewDocenteHTML();
  else if(route.view==='logros')html=viewLogrosHTML();
  else html=view.innerHTML;
  /* Misma pantalla → repintado incremental. Pantalla nueva o cuestionario/tarjetas (que dependen de sus animaciones) → completo. */
  if(VISTAS_MORPH.includes(route.view)&&claveVista()===ultimaVista&&view.firstElementChild)morph(view,html);
  else view.innerHTML=html;
  document.querySelectorAll('#mainNav button').forEach(x=>{if(x.classList.contains('on'))x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});
  aplicarSoloLectura();
  aplicarRolMenu();
  animarVista();
  window.scrollTo(0,keep?_y:0);
  requestAnimationFrame(()=>{fitCards();layoutRadials()});
}

/* ================= HELPERS DE DATOS ================= */
const scaleMax=()=>+(state.profile&&state.profile.scale)||5;
function fmtN(n){return(+n).toLocaleString('es',{minimumFractionDigits:0,maximumFractionDigits:scaleMax()>10?1:2})}
function corteStats(cortes){
  const scale=scaleMax(),goal=clamp(+state.profile.goal||0,0,scale);
  const W=cortes.reduce((a,c)=>a+(+c.weight||0),0);
  const scored=cortes.filter(c=>c.score!=null&&c.score!=='');
  const Ws=scored.reduce((a,c)=>a+(+c.weight||0),0);
  const sum=scored.reduce((a,c)=>a+(+c.score)*(+c.weight||0),0);
  const acum=W>0?sum/W:0;
  const avg=Ws>0?sum/Ws:null;
  const remW=W>0?(W-Ws)/W:0;
  const need=remW>0.0001?(goal-acum)/remW:null;
  return{scale,goal,W,Ws,acum,avg,remW,need,n:scored.length};
}
function weightedAvg(cortes){
  const scored=cortes.filter(c=>c.score!=null && c.score!=='');
  const totalW=scored.reduce((a,c)=>a+(+c.weight||0),0);
  if(!scored.length||!totalW)return null;
  const sum=scored.reduce((a,c)=>a+(+c.score)*(+c.weight),0);
  return sum/totalW;
}

