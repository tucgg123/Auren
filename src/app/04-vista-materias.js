/* ================= VISTA: MIS MATERIAS ================= */
/* ===== Rediseño: colores por materia, iconos y panel de estadísticas ===== */
const MAT_COLORS=['#7FB3E6','#A99BE8','#8ED1A4','#E8C27A','#E58FA8','#E9A58C'];
function matColor(m){
  if(m.color&&/^#[0-9a-f]{6}$/i.test(m.color))return m.color;       // color elegido por la persona
  let h=0;const k=String(m.id||m.name||'');for(let i=0;i<k.length;i++)h=(h*31+k.charCodeAt(i))>>>0;return MAT_COLORS[h%MAT_COLORS.length]}
const SVG_A='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const IC_EDIT=SVG_A+'<path d="M4.5 19.5l.8-3.8L16.4 4.6a1.6 1.6 0 012.3 0l.7.7a1.6 1.6 0 010 2.3L8.3 18.7z"/></svg>';
const IC_DEL=SVG_A+'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/></svg>';
const IC_MOVE=SVG_A+'<path d="M3 7.5V18a1.5 1.5 0 001.5 1.5h15A1.5 1.5 0 0021 18V9a1.5 1.5 0 00-1.5-1.5h-7.8L9.6 5H4.5A1.5 1.5 0 003 6.5z"/><path d="M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5"/></svg>';
const IC_ARR=SVG_A+'<path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function pluralMv(n,a,b){return n+' '+(n==1?a:b)}

/* ================= VISTA: MIS MATERIAS ================= */
/* ---------- Inicio: carpetas (ej. un semestre) → vista de la carpeta con cajones numerados ----------
   En los datos siguen llamándose state.semesters (cada uno con id, name e icon opcional) para no romper cuadernos ya guardados. */
const iconCarpeta=sem=>sem.icon||'📁';
function folderSemestreHTML(sem){
  const mats=state.materias.filter(m=>m.semesterId===sem.id&&m.rol!=='docente');
  const p=promSemestre(mats),nAp=mats.reduce((s,m)=>s+notasDeMateria(m.id).length,0);
  return `<div class="folder" role="button" tabindex="0" data-action="openSemester" data-id="${sem.id}" aria-label="Abrir ${esc(sem.name)}">
    <span class="fbtns"><button type="button" class="icon-btn" data-action="renameSemester" data-id="${sem.id}" title="Editar carpeta" aria-label="Editar carpeta ${esc(sem.name)}">${IC_EDIT}</button><button type="button" class="icon-btn del" data-action="delSemester" data-id="${sem.id}" title="Eliminar carpeta" aria-label="Eliminar carpeta ${esc(sem.name)}">${IC_DEL}</button></span>
    <h3>${esc(iconCarpeta(sem))} ${esc(sem.name)}</h3>
    <div class="meta">${pluralMv(mats.length,'materia','materias')}${nAp?' · '+pluralMv(nAp,'apunte','apuntes'):''}</div>
    <div class="favg"><b>${p==null?'–':fmtN(p)}</b><span>${p==null?'sin notas':'promedio'}</span></div>
    <div class="fchips">${mats.slice(0,3).map(m=>`<span class="fchip">${esc(m.name)}</span>`).join('')}${mats.length>3?`<span class="fchip">+${mats.length-3}</span>`:''}</div>
  </div>`;
}
/* ---------- Cajones: bloques plegables que empiezan CERRADOS ----------
   Así la pantalla muestra solo los títulos (con un resumen corto) y cada quien abre lo que necesita.
   Lo abierto se recuerda en memoria (ui.dw) mientras la app esté abierta; al volver a entrar, todo empieza cerrado.
   k: clave única · titulo y sub: texto ya escapado · ico: emoji o número · aviso: número opcional que resalta algo pendiente */
const dwAbierto=k=>{ui.dw=ui.dw||{};return !!ui.dw[k]};
function dwHTML(k,titulo,sub,cuerpo,ico,aviso){
  const ab=dwAbierto(k),id='dwB-'+String(k).replace(/[^\w-]/g,'_');
  return `<section class="dw${ab?' open':''}" data-key="dw-${esc(k)}">
    <button type="button" class="dwHead" data-action="toggleDw" data-k="${esc(k)}" aria-expanded="${ab}" aria-controls="${id}"><span class="dnum" aria-hidden="true">${ico}</span><span class="dwT"><b>${titulo}</b>${sub?`<small>${sub}</small>`:''}</span>${aviso?`<span class="dwAviso">${aviso}</span>`:''}<span class="chev" aria-hidden="true">▼</span></button>
    <div class="dwBody" id="${id}"><div class="dwInner"><div class="dwPad">${cuerpo}</div></div></div>
  </section>`;
}
function viewSemestreHTML(sem,sems,todas){
  const mats=state.materias.filter(m=>m.semesterId===sem.id&&m.rol!=='docente');
  const p=promSemestre(mats),nAp=mats.reduce((s,m)=>s+notasDeMateria(m.id).length,0);
  const materias=`<div class="grid">${mats.map(materiaCard).join('')||'<p class="meta">Esta carpeta está vacía. Usa el botón 📁 de una materia para moverla aquí.</p>'}</div>
    ${esProfesor()?`<div class="madd"><button class="sec" data-action="addMateria" data-sem="${sem.id}">+ Agregar materia</button><button class="sec" data-action="createShared" data-sem="${sem.id}">🤝 Materia compartida</button></div>`:''}`;
  const apuntes=mats.length?`<div class="sgrid">${mats.map(m=>{const n=notasDeMateria(m.id).length;return `<button type="button" class="scard" style="--c:${matColor(m)}" data-action="openMateria" data-id="${m.id}"><b>${esc(m.icon||'📘')} ${esc(m.name)}</b><span>${pluralMv(n,'apunte','apuntes')}</span><em aria-hidden="true">→</em></button>`}).join('')}</div>`
    :'<div class="empty">Cuando tengas materias en esta carpeta, aquí verás sus apuntes.</div>';
  return `<div class="mv"><div class="mv-col">
    <nav class="crumbs" aria-label="Ruta"><button type="button" class="linkbtn" data-action="backMaterias">← Mis materias</button><span aria-hidden="true">/</span><span>${esc(sem.name)}</span></nav>
    <div class="viewhead"><div><h1>${esc(iconCarpeta(sem))} ${esc(sem.name)}</h1><p class="sub">${pluralMv(mats.length,'materia','materias')}</p></div><span class="semAvg" title="Promedio de la carpeta">${p==null?'':'⌀ '+fmtN(p)}</span></div>
    ${dwHTML('sem:'+sem.id+':mat','Materias',pluralMv(mats.length,'materia','materias')+' en esta carpeta',materias,'📚')}
    ${dwHTML('sem:'+sem.id+':ap','Mis apuntes por materia','Tus apuntes de los temas (pestaña «Mis apuntes» de cada tema) · '+pluralMv(nAp,'apunte','apuntes')+' en total',apuntes,'📝')}
  </div><aside class="mv-stats" aria-label="Resumen del estudiante">${matStatsHTML(sems.length,todas)}</aside></div>`;
}
function viewMateriasHTML(){
  const sems=state.semesters.filter(x=>!x.oculto);
  const todas=state.materias.filter(m=>m.rol!=='docente'&&sems.some(s=>s.id===m.semesterId));
  if(route.semId){
    const sem=sems.find(s=>s.id===route.semId);
    if(sem)return viewSemestreHTML(sem,sems,todas);
    delete route.semId;                                    // la carpeta ya no existe: se vuelve al inicio
  }
  return `<div class="mv"><div class="mv-col">
    <div class="viewhead"><div><h1>Mis materias</h1><p class="sub">${pluralMv(sems.length,'carpeta','carpetas')} y ${pluralMv(todas.length,'materia','materias')}</p></div>
      <span class="row" style="margin:0"><button class="sec" data-action="semDlg">📈 Promedio por carpeta</button><button class="pr" data-action="addSemester">+ Carpeta</button></span></div>
    ${invitacionesHTML()}
    ${guiaHTML()}
    ${repasoHoyHTML()}
    ${sems.length?'':'<div class="empty">Aún no tienes carpetas. Crea una (por ejemplo, «Primer semestre») para empezar a organizar tus materias.</div>'}
    <div class="folders">${sems.map(folderSemestreHTML).join('')}<button type="button" class="folder add" data-action="addSemester"><span><span class="fplus" aria-hidden="true">＋</span>Nueva carpeta</span></button></div>
  </div><aside class="mv-stats" aria-label="Resumen del estudiante">${matStatsHTML(sems.length,todas)}</aside></div>`;
}
function materiaCard(m){
  const temasCount=state.temas.filter(t=>t.materiaId===m.id).length;
  const avg=weightedAvg(state.cortes.filter(c=>c.materiaId===m.id));
  const mx=scaleMax()||5;
  const tag=m.rol==='estudiante'?`<span class="mtag">👩‍🏫 ${esc(nombreDocente(m))} · solo lectura</span>`
    :m.sharedId?`<span class="mtag">🤝 Compartida · ${pluralMv(nMiembros(m),'persona','personas')}</span>`:'';
  const info=avg==null
    ?`<div class="meta">Sin notas registradas</div><div class="mbar"><i style="width:0"></i></div>`
    :`<div class="avg"><b>${fmtN(avg)}</b><span>/ ${fmtN(mx)} de promedio</span></div><div class="mbar"><i style="width:${Math.max(0,Math.min(100,avg/mx*100))}%"></i></div>`;
  return `<div class="mcard" style="--mc:${matColor(m)}">
    <div class="ttl"><h3>${esc(m.icon||'📘')} ${esc(m.name)}</h3><div class="sub2"><span class="meta">${pluralMv(temasCount,'tema','temas')}</span>${tag}${m.semestre?`<span class="mtag">Sem. ${m.semestre}${m.curso?' · '+esc(m.curso):''}</span>`:''}</div></div>
    <div class="info">${info}</div>
    <div class="macts">
      <button class="mopen" data-action="openMateria" data-id="${m.id}" aria-label="Abrir ${esc(m.name)}"><span class="lb">Abrir</span>${IC_ARR}</button>
      <span class="mpair">
        ${m.rol!=='docente'?`<button class="icon-btn" data-action="moverMateria" data-id="${m.id}" title="Mover a otra carpeta" aria-label="Mover ${esc(m.name)} a otra carpeta">${IC_MOVE}</button><i></i>`:''}
        <button class="icon-btn" data-action="renameMateria" data-id="${m.id}" title="Editar materia" aria-label="Editar ${esc(m.name)}">${IC_EDIT}</button><i></i>
        <button class="icon-btn del" data-action="delMateria" data-id="${m.id}" title="Eliminar materia" aria-label="Eliminar ${esc(m.name)}">${IC_DEL}</button>
      </span>
    </div>
  </div>`;
}
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const promMateria=m=>weightedAvg(state.cortes.filter(c=>c.materiaId===m.id));
function promSemestre(mats){const v=mats.map(promMateria).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
const semsVisibles=()=>state.semesters.filter(x=>!x.oculto).map(s=>({s,mats:state.materias.filter(m=>m.semesterId===s.id&&m.rol!=='docente')}));
function filasSemHTML(mats){
  const mx=scaleMax()||5;
  const rows=mats.map(m=>({m,a:promMateria(m)})).filter(x=>x.a!=null).sort((x,y)=>y.a-x.a);
  if(!rows.length)return '<p class="dm">Aún sin notas en esta carpeta.</p>';
  return `<div class="stRows">${rows.map(x=>`<div class="stRow" style="--mc:${matColor(x.m)}"><span>${esc(x.m.name)}</span><b>${fmtN(x.a)}</b><div class="mbar"><i style="width:${Math.max(0,Math.min(100,x.a/mx*100))}%"></i></div></div>`).join('')}</div>`;
}
function semestresDialogoHTML(){
  const bl=semsVisibles().map(({s,mats})=>{const p=promSemestre(mats);return `<div class="sdl"><div class="sdh"><span>${esc(iconCarpeta(s))} ${esc(s.name)}</span><b>${p==null?'–':fmtN(p)}</b></div>${filasSemHTML(mats)}</div>`}).join('');
  return `<div class="sdlWrap">${bl||'<p class="dm">Aún no hay carpetas.</p>'}</div>`;
}
function abrirPromediosSemestre(){dialogo({titulo:'Promedio por carpeta',html:semestresDialogoHTML(),ok:'Cerrar',sinCancelar:true})}
function miniCalHTML(){
  const ahora=new Date(),off=ui.calM||0,base=new Date(ahora.getFullYear(),ahora.getMonth()+off,1);
  const y=base.getFullYear(),mo=base.getMonth(),pad=n=>String(n).padStart(2,'0');
  const todos=eventosTodos(),evs=new Set(todos.map(e=>e.date)),hoy=ymd(new Date());
  const lead=(base.getDay()+6)%7,dias=new Date(y,mo+1,0).getDate();
  const celdas=['L','M','X','J','V','S','D'].map(w=>`<span class="wd">${w}</span>`).join('')+'<span class="dy out"></span>'.repeat(lead)
    +Array.from({length:dias},(_,i)=>{const d=i+1,k=`${y}-${pad(mo+1)}-${pad(d)}`;return `<span class="dy${k===hoy?' hoy':''}${evs.has(k)?' ev':''}">${d}</span>`}).join('');
  const prox=todos.filter(e=>e.date>=hoy).sort(sortEv)[0];
  const nx=prox?`<b>${esc(prox.title)}</b><span>${esc(fmtDateLong(prox.date))}</span>`:'<span>Sin eventos próximos</span>';
  return `<div class="mcal"><div class="mch"><button class="icon-btn mnav" data-action="miniCalNav" data-d="-1" aria-label="Mes anterior">‹</button><span>${MESES[mo].charAt(0).toUpperCase()+MESES[mo].slice(1)} ${y}</span><button class="icon-btn mnav" data-action="miniCalNav" data-d="1" aria-label="Mes siguiente">›</button></div>
    <div class="mg">${celdas}</div><div class="mfoot"><div class="mnx">${nx}</div><button class="sec sm" data-action="addEvent" data-date="${hoy}">+ Evento</button></div></div>`;
}
function matStatsHTML(nSem,mats){
  const mx=scaleMax()||5;
  const rows=mats.map(m=>({m,a:weightedAvg(state.cortes.filter(c=>c.materiaId===m.id))})).filter(x=>x.a!=null);
  const avg=rows.length?rows.reduce((t,x)=>t+x.a,0)/rows.length:null;
  const temas=mats.reduce((t,m)=>t+state.temas.filter(x=>x.materiaId===m.id).length,0);
  const idsM=new Set(mats.map(m=>m.id)),nTarj=state.cards.filter(c=>idsM.has(c.materiaId)).length;
  const srt=rows.slice().sort((x,y)=>y.a-x.a);
  const best=srt[0],low=srt.length>1?srt[srt.length-1]:null;
  const C=314.16,d=avg==null?0:Math.max(0,Math.min(avg/mx,1))*C;
  const hl=(lbl,x)=>`<div><span>${lbl}</span><b style="--mc:${matColor(x.m)}"><i></i><em>${esc(x.m.name)}</em> ${fmtN(x.a)}</b></div>`;
  const resaltes=(best?hl('Mejor promedio',best):'')+(low?hl('Por reforzar',low):'');
  const prom=`<div class="stRing"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--b)" stroke-width="9"/><circle cx="60" cy="60" r="50" fill="none" stroke="var(--a)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${d.toFixed(1)} ${C}" transform="rotate(-90 60 60)"/></svg>
      <div class="stRc"><b>${avg==null?'—':fmtN(avg)}</b><span>/ ${fmtN(mx)}</span></div></div>
      <p class="stNote">${avg==null?'Aún no hay notas registradas':'Promedio de '+pluralMv(rows.length,'materia con notas','materias con notas')}</p>
      <div class="stHl">${resaltes}</div>`;
  const hoy=ymd(new Date()),prox=eventosTodos().filter(e=>e.date>=hoy).sort(sortEv)[0];
  const carrera=`<div class="stKp">
      <div><b>${nSem}</b><span>${nSem==1?'carpeta':'carpetas'}</span></div><div><b>${mats.length}</b><span>${mats.length==1?'materia':'materias'}</span></div>
      <div><b>${temas}</b><span>${temas==1?'tema':'temas'}</span></div><div><b>${nTarj}</b><span>${nTarj==1?'tarjeta':'tarjetas'}</span></div></div>`;
  return dwHTML('st:prom','Promedio general',avg==null?'Aún sin notas':fmtN(avg)+' de '+fmtN(mx),prom,'📊')
    +dwHTML('st:cal','Calendario',prox?'Próximo: '+esc(prox.title)+' · '+esc(fmtDateLong(prox.date)):'Sin eventos próximos',miniCalHTML(),'📅')
    +dwHTML('st:car','Mi carrera',pluralMv(mats.length,'materia','materias')+' · '+pluralMv(nTarj,'tarjeta','tarjetas'),carrera,'🎓');
}

/* ================= VISTA: DETALLE DE MATERIA ================= */
function viewMateriaDetailHTML(materiaId){
  const m=state.materias.find(x=>x.id===materiaId);
  if(!m){goToView('materias');return'';}
  if(m.rol==='docente'){
    if(docTabMat!==materiaId){docTabMat=materiaId;docTab='contenido'}
    if(docTab!=='contenido')return viewDocenteTabHTML(m);
  }
  const cortes=state.cortes.filter(c=>c.materiaId===materiaId);
  const iaSel=cortes.some(c=>c.id===ui.iaCorte)?ui.iaCorte:(cortes[0]&&cortes[0].id);
  const mk=k=>'m:'+materiaId+':'+k,nTemas=state.temas.filter(x=>x.materiaId===materiaId).length;
  if(m.rol!=='estudiante'&&(!ui.iaUso||(!ui.iaUso.cargando&&Date.now()-(ui.iaUso.t||0)>60000)))setTimeout(cargarUsoIA,0);   // se consulta el cupo al abrir la materia
  return `
    <button class="sec" data-action="${m.rol==='docente'?'backDocente':'backMaterias'}">${m.rol==='docente'?'← Espacio docente':'← '+esc(((state.semesters.find(s=>s.id===m.semesterId&&!s.oculto))||{}).name||'Mis materias')}</button>
    <div class="hero" style="--mc:${matColor(m)}"><div class="heroDot"></div><div><h1>${esc(m.icon||'📘')} ${esc(m.name)}</h1><p class="sub">${esc((state.semesters.find(x=>x.id===m.semesterId)||{}).name||'')}${state.semesters.find(x=>x.id===m.semesterId)?' · ':''}${pluralMv(state.temas.filter(x=>x.materiaId===m.id).length,'tema','temas')} · ${pluralMv(getCardsTodas(m.id).length,'tarjeta','tarjetas')}${m.semestre?` · <span class="chip">Semestre ${m.semestre}${m.curso?' · Curso '+esc(m.curso):''}</span>`:''}</p></div></div>
    ${m.rol==='docente'?docentePanelHTML(m):cajonesMateriaHTML(m)}
    ${estudiarCajonHTML(m)}
    ${m.rol==='docente'?'':dwHTML(mk('prom'),'Mi promedio en esta materia','<span id="corteAvgSub">'+promSubHTML(cortes)+'</span>',`<div id="corteAvgBox">${corteAvgHTML(cortes)}</div>`,'🧮')}
    ${puedeSubir()?dwHTML(mk('ia'),'Generar tema con IA','Sube un PDF o una presentación y la IA arma el tema',`
        <p class="meta" style="margin-top:0">Sube un PDF o una presentación (.pptx), elige en qué corte guardarlo y la IA organiza el contenido en secciones y crea las tarjetas.</p>
        <label class="lbl" for="iaCorte">Guardar en</label>
        <select class="fld" id="iaCorte" data-action="iaCorteSel">${cortes.map(c=>`<option value="${c.id}" ${c.id===iaSel?'selected':''}>${esc(c.name)||'(corte sin nombre)'}</option>`).join('')}</select>
        <input type="file" id="iaFileInput" accept=".pdf,.pptx" data-mat="${materiaId}" style="display:none">
        <button class="sec" id="iaUploadBtn" data-action="iaPickFile" style="margin-top:10px">📎 Subir PDF o PPTX</button>
        <input type="file" id="pdfCompInput" accept=".pdf,application/pdf" style="display:none" aria-hidden="true" tabindex="-1">
        <button class="sec" data-action="pdfPick" style="margin-top:10px">🗜️ Comprimir un PDF</button>
        <div id="iaCupo" style="margin-top:10px">${cupoIAHTML()}</div>
        <div id="iaStatus" class="meta" style="margin-top:8px"></div>`,'🤖'):''}
    <div class="${m.rol==='estudiante'?'docRO':''}">
      ${dwHTML(mk('cortes'),'Cortes y temas',pluralMv(cortes.length,'corte','cortes')+' · '+pluralMv(nTemas,'tema','temas'),
        (cortes.map(c=>corteFolder(c,materiaId)).join('')||'<div class="empty">Esta materia aún no tiene cortes.</div>')
        +`<button class="sec" style="margin-top:4px" data-action="addCorte" data-mat="${materiaId}">+ Agregar corte</button>`,'📁')}
    </div>
  `;
}
/* Cajones de arriba en la materia: lo del profesor (estudiante) o lo de compartir (materia propia) */
function cajonesMateriaHTML(m){
  const mk=k=>'m:'+m.id+':'+k;
  if(m.rol!=='estudiante')return dwHTML(mk('comp'),m.sharedId?'Materia compartida':'Estudiar con otras personas',m.sharedId?'Código, enlace e integrantes del grupo':'Comparte esta materia con tus compañeros',compartidoBoxHTML(m),'🤝');
  let out='';
  const exs=examenesDe(m),pend=exs.filter(ex=>!miIntento(m,ex.id)&&examAbierto(ex)).length;
  const ex=examenesEstudianteHTML(m);
  if(ex)out+=dwHTML(mk('ex'),'Exámenes de tu profesor',pend?pluralMv(pend,'examen por presentar','exámenes por presentar'):pluralMv(exs.length,'examen','exámenes'),ex,'📝',pend||'');
  const nAn=anunciosDe(m).length,an=anunciosEstudianteHTML(m);
  if(an)out+=dwHTML(mk('an'),'Anuncios de tu profesor',pluralMv(Math.min(nAn,3),'anuncio reciente','anuncios recientes'),an,'📣');
  const nDoc=state.temas.filter(x=>x.materiaId===m.id&&x.archivo).length,dc=docsOriginalesHTML(m);
  if(dc)out+=dwHTML(mk('docs'),'Documentos originales',pluralMv(nDoc,'archivo para descargar','archivos para descargar'),dc,'📎');
  out+=dwHTML(mk('prof'),'Materia de '+esc(nombreDocente(m)),'Solo lectura · aquí puedes salir de la materia',estudianteDocenteBoxHTML(m),'👩‍🏫');
  return out;
}
function promSubHTML(cortes){
  const k=corteStats(cortes);
  return k.avg==null?'Sin notas todavía · meta '+fmtN(k.goal):fmtN(k.avg)+' de '+fmtN(k.scale)+' · meta '+fmtN(k.goal)+(k.avg>=k.goal?' ✅':'');
}
function corteFolder(c,materiaId){
  const temas=state.temas.filter(t=>t.corteId===c.id).sort((a,b)=>b.updatedAt-a.updatedAt);
  const hasScore=c.score!=null&&c.score!=='';
  const open=ui.open[c.id]===true;                       // los cortes empiezan cerrados
  return `<details class="folder" data-corte="${c.id}" ${open?'open':''}>
    <summary>
      <span class="fHead"><span class="ft">📁 ${esc(c.name)||'(corte sin nombre)'}</span>
        <span class="chips"><span class="chip">${temas.length} tema${temas.length==1?'':'s'}</span><span class="chip">${fmtN(+c.weight||0)}%</span>${hasScore?`<span class="chip chipOk">Nota ${fmtN(c.score)}</span>`:''}</span></span>
      <span class="fAct">
        <button class="icon-btn" data-action="editCorte" data-id="${c.id}" title="Editar corte">✏️</button>
        <button class="icon-btn" data-action="delCorte" data-id="${c.id}" title="Eliminar corte">🗑️</button>
      </span>
    </summary>
    <div class="b">
      <div class="corteEdit">
        <div class="corteGrid">
          <div><label class="lbl">Nombre del corte</label><input class="fld" data-action="editCorteName" data-id="${c.id}" value="${esc(c.name)}" placeholder="Ej. Corte 1"></div>
          <div><label class="lbl">Peso (%)</label><input class="fld" type="number" min="0" max="100" step="1" data-action="editCorteWeight" data-id="${c.id}" value="${c.weight}"></div>
          <div><label class="lbl">Nota (0 a ${fmtN(scaleMax())})</label><input class="fld" type="number" min="0" max="${scaleMax()}" step="0.1" data-action="editCorteScore" data-id="${c.id}" value="${c.score??''}" placeholder="Sin nota"></div>
        </div>
        <div class="secFoot"><button class="sec" data-action="doneCorte" data-id="${c.id}">✓ Listo</button></div>
      </div>
      <div class="temaList">${temas.map(temaBlock).join('')||'<div class="empty">Este corte aún no tiene temas.</div>'}</div>
      <button class="pr" style="margin-top:12px" data-action="addTema" data-mat="${materiaId}" data-corte="${c.id}">+ Agregar tema</button>
    </div>
  </details>`;
}
function corteAvgHTML(cortes){
  const k=corteStats(cortes);
  const pct=k.avg==null?0:clamp(k.avg/k.scale*100,0,100);
  const gpct=clamp(k.goal/k.scale*100,0,100);
  const ok=k.avg!=null&&k.avg>=k.goal;
  let msg='';
  if(k.W<=0)msg='Asigna un peso (%) a tus cortes para calcular el promedio.';
  else if(k.need==null)msg=k.acum>=k.goal-1e-9?'🎉 Cumpliste tu meta.':'No alcanzaste la meta de '+fmtN(k.goal)+'.';
  else if(k.need<=0)msg='🎉 Ya aseguraste tu meta, aunque sacaras 0 en lo que falta.';
  else if(k.need>k.scale+1e-9)msg='Con lo que falta ya no alcanzas la meta (necesitarías '+fmtN(Math.ceil(k.need*100)/100)+' y el máximo es '+fmtN(k.scale)+').';
  else msg='Necesitas sacar al menos <b>'+fmtN(Math.ceil(k.need*100)/100)+'</b> de promedio en lo que falta ('+Math.round(k.remW*100)+'% restante) para llegar a tu meta.';
  const warn=k.W>0&&Math.abs(k.W-100)>0.01?`<p class="meta" style="color:var(--no)">⚠️ Los pesos suman ${fmtN(k.W)}%, deberían sumar 100%.</p>`:'';
  return `<div class="bar goalBar"><i style="width:${pct}%;background:${ok?'var(--ok)':'var(--a)'}"></i><span class="goalMark" style="left:${gpct}%" title="Meta"></span></div>
  <p class="meta" style="margin:6px 0">${k.avg==null?'Registra la nota de un corte para ver tu promedio.':`Promedio de lo evaluado: <b style="color:${ok?'var(--ok)':'var(--t)'}">${fmtN(k.avg)}</b> / ${fmtN(k.scale)} · meta ${fmtN(k.goal)}`}</p>
  <p class="meta" style="margin:0">${msg}</p>${warn}`;
}
function refreshCorteAvg(materiaId){
  const cortes=state.cortes.filter(c=>c.materiaId===materiaId);
  const box=$('corteAvgBox');
  if(box)box.innerHTML=corteAvgHTML(cortes);
  const sub=$('corteAvgSub');if(sub)sub.innerHTML=promSubHTML(cortes);
}
const ui={open:{},sec:{},tab:{}};
function fmtBody(txt){
  const lines=String(txt||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let out='',list=[];
  const flush=()=>{if(list.length){out+='<ul class="lista">'+list.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';list=[]}};
  lines.forEach(l=>{
    const h=l.match(/^#{2,3}\s+(.*)$/);
    if(h){flush();out+=`<h4 class="subTit">${esc(h[1])}</h4>`;return}
    const m=l.match(/^[-•–*]\s+(.*)$/);if(m)list.push(m[1]);else{flush();out+=`<p>${esc(l)}</p>`}
  });
  flush();
  return out||'<p class="meta">Esta sección todavía no tiene contenido.</p>';
}
function puntosDe(sc){
  if(Array.isArray(sc.puntos)&&sc.puntos.length)return sc.puntos;
  const body=String(sc.body||'').trim();
  const bullets=body.split(/\n+/).map(x=>x.trim()).filter(l=>/^[-•–*]\s+/.test(l)).map(l=>l.replace(/^[-•–*]\s+/,''));
  let base=bullets;
  if(!base.length){base=(body.match(/[^.!?]+[.!?]+/g)||[]).map(x=>x.trim());if(!base.length&&body)base=[body]}
  return base.slice(0,4).map(x=>x.length>110?x.slice(0,107).trim()+'…':x);
}
const prevSec=b=>String(b||'').replace(/^#{2,3}\s+/gm,'').replace(/\s+/g,' ').trim().slice(0,120);
function secReadHTML(sc){
  const p=puntosDe(sc);
  return `<div class="txt">${fmtBody(sc.body)}</div>${sc.rel?`<div class="relIdeas"><small>🔗 Relación con otras ideas</small><p>${esc(sc.rel)}</p></div>`:''}${p.length?`<div class="puntos"><small>Ideas clave</small><ul>${p.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}`;
}
/* Hecho por Sebastián Poveda y Santiago Romero. 2026 · sistema de esquemas */
/* ===== Esquemas: ramificado, radial y matricial ===== */
const ESQ_ESTILOS=[
  {id:'ramificado',nombre:'Ramificado',desc:'Jerarquía con ramas y tarjetas',icono:'<rect x="3" y="4" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="4" rx="1"/><rect x="14" y="16" width="7" height="4" rx="1"/><path d="M6.5 8v10M6.5 12H14M6.5 18H14"/>'},
  {id:'radial',nombre:'Radial',desc:'Tema central y ramas alrededor',icono:'<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="4" r="2"/><circle cx="19" cy="16.5" r="2"/><circle cx="5" cy="16.5" r="2"/><path d="M12 9.5V6M14.2 13.3l3 1.8M9.8 13.3l-3 1.8"/>'},
  {id:'matricial',nombre:'Matricial',desc:'Filas y columnas comparativas',icono:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M9.5 4v16"/>'}
];
const ESQ_COLS={definicion:'Definición',caracteristica:'Características',ejemplo:'Ejemplo'};
const ESQ_TIPOS=Object.keys(ESQ_COLS);
const ESQ_TAGS={def:'definicion',car:'caracteristica',ej:'ejemplo'};
const ESQ_TAGOF={definicion:'def',caracteristica:'car',ejemplo:'ej'};
function esqEstilo(){
  if(ESQ_ESTILOS.some(e=>e.id===ui.esqEstilo))return ui.esqEstilo;
  try{const v=localStorage.getItem('esquema-estilo');if(ESQ_ESTILOS.some(e=>e.id===v)){ui.esqEstilo=v;return v}}catch(e){}
  return 'ramificado';
}
function esqGuardar(id){ui.esqEstilo=id;try{localStorage.setItem('esquema-estilo',id)}catch(e){}}
/* Cada idea tiene un tipo (definición, característica o ejemplo). Lo trae la IA; si falta, se deduce del texto. */
function ideasDe(sc){
  const tp=Array.isArray(sc.tipos)?sc.tipos:[];
  const out=puntosDe(sc).map((texto,i)=>({texto,tipo:ESQ_TIPOS.includes(tp[i])?tp[i]:null}));
  let hayDef=out.some(x=>x.tipo==='definicion');
  out.forEach((x,i)=>{
    if(x.tipo)return;
    if(/^(por ejemplo|ejemplo|p\.\s?ej|e\.g\.)/i.test(x.texto))x.tipo='ejemplo';
    else if(!hayDef&&i===0&&/\b(es|son|se define|se denomina|consiste|se entiende|significa)\b/i.test(x.texto)){x.tipo='definicion';hayDef=true}
    else x.tipo='caracteristica';
  });
  return out;
}
/* Edición: una idea por línea; opcionalmente empieza con [def], [car] o [ej] para fijar su tipo. */
function ideasTexto(sc){
  const pts=Array.isArray(sc.puntos)?sc.puntos:[],tp=Array.isArray(sc.tipos)?sc.tipos:[];
  return pts.map((p,i)=>ESQ_TIPOS.includes(tp[i])?`[${ESQ_TAGOF[tp[i]]}] ${p}`:p).join('\n');
}
function ideasParse(valor){
  const puntos=[],tipos=[];
  String(valor||'').split('\n').forEach(l=>{
    l=l.trim();if(!l)return;
    const m=l.match(/^\[(def|car|ej)\]\s*(.*)$/i);
    if(m){if(!m[2].trim())return;puntos.push(m[2].trim());tipos.push(ESQ_TAGS[m[1].toLowerCase()])}
    else{puntos.push(l);tipos.push(null)}
  });
  return{puntos,tipos};
}
const ESQ_TAGTXT={definicion:'Definición',caracteristica:'Característica',ejemplo:'Ejemplo'};
/* Una idea puede venir como "Término: explicación". El término se resalta para que el esquema use el vocabulario del tema. */
function ideaParts(texto){
  const t=String(texto||'').trim();
  const m=t.match(/^([^:.\n]{2,52}):\s+([\s\S]+)$/);
  if(m&&m[1].trim().split(/\s+/).length<=6){const d=m[2].trim();return{term:m[1].trim(),desc:d.charAt(0).toUpperCase()+d.slice(1)}}
  return{term:'',desc:t};
}
function esqCorto(t,max){if(t.length<=max)return t;const c=t.slice(0,max-1),i=c.lastIndexOf(' ');return (i>12?c.slice(0,i):c).replace(/[\s,;:.]+$/,'')+'…'}
function ideaHTML(i){const p=ideaParts(i.texto);return p.term?`<b class="esqx-term">${esc(p.term)}</b> ${esc(p.desc)}`:esc(p.desc)}
function esqLeyenda(){return `<div class="esqx-leg" aria-hidden="true">${ESQ_TIPOS.map(k=>`<span class="esqx-lg esqx-t-${k}"><i></i>${ESQ_TAGTXT[k]}</span>`).join('')}</div>`}
function esqNodo(sc,n){return `<div class="esqx-catnode"><span class="esqx-num">${n+1}</span>${esc(sc.title)||'(sin título)'}</div>`}
function esqRamificado(t,secs){
  return `${esqLeyenda()}<div class="esqx-ram"><div class="esqx-root">${esc(t.title)||'Tema'}</div><div class="esqx-cats">${secs.map((sc,n)=>{const ids=ideasDe(sc);return `<section class="esqx-cat">${esqNodo(sc,n)}${ids.length?`<div class="esqx-grid">${ids.map(i=>{const p=ideaParts(i.texto);return `<div class="esqx-card esqx-t-${i.tipo}"><span class="esqx-tag">${ESQ_TAGTXT[i.tipo]}</span>${p.term?`<b class="esqx-term">${esc(p.term)}</b>`:''}<span class="esqx-desc">${esc(p.desc)}</span></div>`}).join('')}</div>`:''}</section>`}).join('')}</div></div>`;
}
function esqRadial(t,secs){
  return `${esqLeyenda()}<div class="esqx-scroll"><div class="esqx-fit"><div class="esqx-stage"><svg class="esqx-lines" aria-hidden="true"></svg><div class="esqx-center">${esc(t.title)||'Tema'}</div>${secs.map(sc=>`<article class="esqx-rcard"><div class="esqx-rtitle">${esc(sc.title)||'(sin título)'}</div><div class="esqx-chips">${ideasDe(sc).map(i=>{const p=ideaParts(i.texto);const lbl=p.term||esqCorto(p.desc,40);return `<span class="esqx-chip esqx-t-${i.tipo}" title="${esc(i.texto)}">${esc(lbl)}</span>`}).join('')}</div></article>`).join('')}</div></div></div>`;
}
function esqMatricial(t,secs){
  const lista=it=>it.length===1?`<p>${ideaHTML(it[0])}</p>`:`<ul>${it.map(x=>`<li>${ideaHTML(x)}</li>`).join('')}</ul>`;
  const tabla=`<div class="esqx-tscroll" tabindex="0" role="region" aria-label="Matriz comparativa"><table class="esqx-matriz"><caption>${esc(t.title)||'Tema'}</caption><thead><tr><th scope="col">Concepto</th>${ESQ_TIPOS.map(k=>`<th scope="col">${ESQ_COLS[k]}</th>`).join('')}</tr></thead><tbody>${secs.map(sc=>{const ids=ideasDe(sc);return `<tr><th scope="row">${esc(sc.title)||'(sin título)'}</th>${ESQ_TIPOS.map(k=>{const it=ids.filter(x=>x.tipo===k);return `<td>${it.length?lista(it):'<span class="vacio">—</span>'}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`;
  const tarjetas=`<div class="esqx-mcards">${secs.map((sc,n)=>{const ids=ideasDe(sc);return `<section class="esqx-mc">${esqNodo(sc,n)}${ESQ_TIPOS.map(k=>{const it=ids.filter(x=>x.tipo===k);return it.length?`<div class="esqx-mrow esqx-t-${k}"><span class="esqx-tag">${ESQ_COLS[k]}</span>${lista(it)}</div>`:''}).join('')}</section>`}).join('')}</div>`;
  return tabla+tarjetas;
}
function esquemaHTML(t){
  const secs=Array.isArray(t.secciones)?t.secciones:[];
  if(!secs.length)return'<div class="empty">Este tema no tiene secciones, así que todavía no hay esquema.</div>';
  const est=esqEstilo(),info=ESQ_ESTILOS.find(e=>e.id===est);
  const view=est==='radial'?esqRadial(t,secs):est==='matricial'?esqMatricial(t,secs):esqRamificado(t,secs);
  const items=ESQ_ESTILOS.map(e=>`<li role="none"><button type="button" class="esqx-mi" role="menuitemradio" aria-checked="${e.id===est}" data-action="esqStyle" data-estilo="${e.id}" tabindex="-1"><svg class="esqx-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${e.icono}</svg><span><span class="esqx-nm">${e.nombre}</span><span class="esqx-ds">${e.desc}</span></span></button></li>`).join('');
  return `<div class="esqx" data-esqtema="${t.id}"><div class="esqx-bar"><div class="esqx-tabs"><button type="button" class="esqx-tab" data-action="esqMenu" aria-haspopup="menu" aria-expanded="false"><span>Esquema</span><span class="esqx-cur">${info.nombre}</span><svg class="esqx-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><ul class="esqx-menu" role="menu" aria-label="Estilo de esquema" hidden>${items}</ul></div></div><div class="esqx-view esqx-anim">${view}</div></div>`;
}
/* Vista radial: ramas en círculo, sin superposiciones, y se reduce la escala para que SIEMPRE quepa en el panel. */
function esqChocan(a,b,g){return a.x-g<b.x+b.w&&b.x-g<a.x+a.w&&a.y-g<b.y+b.h&&b.y-g<a.y+a.h}
function layoutRadial(stage){
  const fit=stage.parentElement,wrap=fit.parentElement;
  const svg=stage.querySelector('.esqx-lines'),center=stage.querySelector('.esqx-center'),cards=[...stage.querySelectorAll('.esqx-rcard')];
  while(svg.firstChild)svg.removeChild(svg.firstChild);
  const avail=wrap.clientWidth;
  stage.style.transform='';fit.style.width='';fit.style.height='';
  if(avail&&avail<560){stage.classList.add('stacked','laid');stage.style.width='';stage.style.height='';return}
  stage.classList.remove('stacked');
  const n=cards.length;if(!n){stage.classList.add('laid');return}
  const cw=center.offsetWidth,ch=center.offsetHeight,sizes=cards.map(c=>({w:c.offsetWidth,h:c.offsetHeight})),gap=26,pad=24;
  /* Se prueban varias formas (óvalo ancho, círculo, óvalo alto) y se elige la que menos hay que reducir para que quepa. */
  function resolver(ratio){
    let r=110,pts=[],rects=[];
    for(let it=0;it<900;it++){
      const rx=r*ratio,ry=r;
      pts=cards.map((_,k)=>{const an=(-90+k*360/n)*Math.PI/180;return{x:rx*Math.cos(an),y:ry*Math.sin(an)}});
      rects=pts.map((q,k)=>({x:q.x-sizes[k].w/2,y:q.y-sizes[k].h/2,w:sizes[k].w,h:sizes[k].h}));
      const todos=[{x:-cw/2,y:-ch/2,w:cw,h:ch}].concat(rects);
      let ok=true;
      for(let i=0;i<todos.length&&ok;i++)for(let j=i+1;j<todos.length;j++)if(esqChocan(todos[i],todos[j],gap)){ok=false;break}
      if(ok)break;
      r+=10;
    }
    const all=[{x:-cw/2,y:-ch/2,w:cw,h:ch}].concat(rects);
    const minX=Math.min(...all.map(q=>q.x)),maxX=Math.max(...all.map(q=>q.x+q.w)),minY=Math.min(...all.map(q=>q.y)),maxY=Math.max(...all.map(q=>q.y+q.h));
    return{pts,rects,minX,minY,W:Math.ceil(maxX-minX+pad*2),H:Math.ceil(maxY-minY+pad*2)};
  }
  let mejor=null;
  [1.35,1.1,0.9,0.75].forEach(ratio=>{
    const c=resolver(ratio);
    c.k=avail?Math.min(1,avail/c.W):1;
    if(!mejor||c.k>mejor.k+0.02||(Math.abs(c.k-mejor.k)<=0.02&&c.H<mejor.H))mejor=c;
  });
  const {pts,rects,minX,minY,W,H}=mejor;
  const ox=pad-minX,oy=pad-minY;
  stage.style.width=W+'px';stage.style.height=H+'px';
  svg.setAttribute('width',W);svg.setAttribute('height',H);svg.setAttribute('viewBox','0 0 '+W+' '+H);
  center.style.left=(-cw/2+ox)+'px';center.style.top=(-ch/2+oy)+'px';
  cards.forEach((c,k)=>{
    c.style.left=(rects[k].x+ox)+'px';c.style.top=(rects[k].y+oy)+'px';
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
    ln.setAttribute('x1',ox);ln.setAttribute('y1',oy);ln.setAttribute('x2',pts[k].x+ox);ln.setAttribute('y2',pts[k].y+oy);
    svg.appendChild(ln);
  });
  const k=(avail&&W>avail)?Math.max(0.72,avail/W):1;
  if(k<1)stage.style.transform='scale('+k+')';
  fit.style.width=Math.round(W*k)+'px';fit.style.height=Math.round(H*k)+'px';
  stage.classList.add('laid');
}
function layoutRadials(root){(root||document).querySelectorAll('.esqx-stage').forEach(st=>{if(st.offsetParent!==null)layoutRadial(st)})}
function esqCerrarMenus(except){
  document.querySelectorAll('.esqx-menu:not([hidden])').forEach(m=>{
    if(m===except)return;
    m.hidden=true;const tb=m.parentElement.querySelector('.esqx-tab');if(tb)tb.setAttribute('aria-expanded','false');
  });
}
function esqRefrescar(){
  document.querySelectorAll('.esqx').forEach(h=>{const t=state.temas.find(x=>x.id===h.dataset.esqtema);if(t)h.outerHTML=esquemaHTML(t)});
  requestAnimationFrame(()=>layoutRadials());
}
function temaBlock(t){
  const cards=state.cards.filter(c=>c.temaId===t.id);
  const hasSec=Array.isArray(t.secciones);
  let tab=ui.tab[t.id]||'contenido';
  if(tab==='esquema'&&!hasSec)tab='contenido';
  const conApuntes=!esProfesor()&&(state.materias.find(x=>x.id===t.materiaId)||{}).rol==='estudiante';
  if(tab==='apuntes'&&!conApuntes)tab='contenido';
  const conChat=!esProfesor();
  if(tab==='chat'&&!conChat)tab='contenido';
  const tabs=[['contenido','Contenido'],...(hasSec?[['esquema','Esquema']]:[]),['tarjetas',`Tarjetas <span class="chip">${cards.length}</span>`],...(conApuntes?[['apuntes','📝 Mis apuntes']]:[]),...(conChat?[['chat','🤖 Pregúntale']]:[])];
  return `<details class="s" data-tema="${t.id}" ${ui.open[t.id]?'open':''}>
    <summary><span class="temaHead"><span class="tt">📝 ${esc(t.title)||'(tema sin título)'}</span><span class="chips">${esDocenteMat(t.materiaId)?`<span class="chip ${t.publicado?'chipOk':''}">${t.publicado?'✅ Publicado':'📝 Borrador'}</span>`:''}${t.by&&sharedMateria(t.materiaId)?`<span class="chip" title="${esc(t.fuente||'')}">👤 ${esc(t.by)}</span>`:''}${hasSec?`<span class="chip">${t.secciones.length} sección${t.secciones.length==1?'':'es'}</span>`:''}<span class="chip">${cards.length} tarjeta${cards.length==1?'':'s'}</span></span></span>
      ${t.archivo?`<button class="icon-btn" data-action="descargarOriginal" data-id="${t.id}" title="Descargar documento original" aria-label="Descargar documento original">⬇️</button>`:''}${esDocenteMat(t.materiaId)?`<button class="icon-btn" data-action="togglePublicar" data-id="${t.id}" title="${t.publicado?'Pasar a borrador':'Publicar a los estudiantes'}">${t.publicado?'📝':'✅'}</button>`:''}<button class="icon-btn" data-action="delTema" data-id="${t.id}" title="Eliminar tema">🗑️</button>
    </summary>
    <div class="b">
      <input class="fld tituloTema" data-action="editTemaTitle" data-id="${t.id}" value="${esc(t.title)}" placeholder="Título del tema">
      ${t.fuente?`<p class="meta" style="margin:4px 0 0">📎 ${esc(t.fuente)}${t.by?' · subido por '+esc(t.by):''}</p>`:''}
      ${t.archivo?docOriginalHTML(t):''}
      <div class="tabsT">${tabs.map(([k,l])=>`<button type="button" data-action="temaTab" data-id="${t.id}" data-tab="${k}" class="${tab===k?'on':''}">${l}</button>`).join('')}</div>
      <div class="tp" data-panel="contenido" ${tab==='contenido'?'':'hidden'}>
        <div class="temaTools">${ttsBtn('ttsTema','data-id="'+t.id+'"','🔊 Escuchar el tema')}${controlesMediosHTML(t)}</div>
        ${mediosHTML(t)}
        ${hasSec&&t.body?`<div class="resumenCard"><small>Resumen</small><p>${esc(t.body)}</p></div>`:''}
        ${hasSec
          ? `<div class="secList">${t.secciones.map(sc=>secBlock(t.id,sc)).join('')}</div>
             <button class="sec" data-action="addSec" data-id="${t.id}">+ Agregar sección</button>`
          : `<textarea class="fld" data-action="editTemaBody" data-id="${t.id}" placeholder="Escribe aquí tus apuntes de este tema…">${esc(t.body)}</textarea>`}
      </div>
      ${hasSec?`<div class="tp" data-panel="esquema" ${tab==='esquema'?'':'hidden'}>${esquemaHTML(t)}</div>`:''}
      <div class="tp" data-panel="tarjetas" ${tab==='tarjetas'?'':'hidden'}>
        <p class="meta tarjIntro">Frente = término o pregunta. Reverso = definición o respuesta. Con estas se arman Flashcards, Quiz, etc.</p>
        <div class="cardList">${cards.map(cardRow).join('')||'<p class="meta">Sin tarjetas todavía.</p>'}</div>
        <button class="sec" data-action="addCard" data-tema="${t.id}" data-mat="${t.materiaId}">+ Agregar tarjeta</button>
      </div>
      ${conApuntes?`<div class="tp" data-panel="apuntes" ${tab==='apuntes'?'':'hidden'}>${apuntesHTML(t)}</div>`:''}
      ${conChat?`<div class="tp" data-panel="chat" ${tab==='chat'?'':'hidden'}>${chatHTML(t)}</div>`:''}
    </div>
  </details>`;
}
function secBlock(temaId,sc){
  return `<details class="secAcc" data-sec="${sc.id}" ${ui.sec[sc.id]?'open':''}>
    <summary><span class="sn"><b class="st">${esc(sc.title)||'(sección sin título)'}</b><small class="sp">${esc(prevSec(sc.body))}</small></span></summary>
    <div class="b">
      ${ttsBtn('ttsSec','data-tema="'+temaId+'" data-sec="'+sc.id+'"')}
      <div class="secRead">${secReadHTML(sc)}</div>
      <div class="secEdit">
        <label class="lbl">Título de la sección</label>
        <input class="fld" data-action="editSecTitle" data-id="${temaId}" data-sid="${sc.id}" value="${esc(sc.title)}" placeholder="Título de la sección">
        <label class="lbl">Contenido</label>
        <textarea class="fld" data-action="editSecBody" data-id="${temaId}" data-sid="${sc.id}" placeholder="Contenido de la sección…">${esc(sc.body)}</textarea>
        <label class="lbl">Relación con otras ideas (opcional)</label>
        <textarea class="fld" data-action="editSecRel" data-id="${temaId}" data-sid="${sc.id}" placeholder="Cómo se conecta esta sección con otras del tema…">${esc(sc.rel||'')}</textarea>
        <label class="lbl">Ideas clave (una por línea, alimentan el esquema)</label>
        <textarea class="fld" data-action="editSecPuntos" data-id="${temaId}" data-sid="${sc.id}" placeholder="Una idea corta por línea…">${esc(ideasTexto(sc))}</textarea>
        <small class="meta">Opcional: empieza la línea con [def], [car] o [ej] para ubicarla como definición, característica o ejemplo en el esquema matricial.</small>
      </div>
      <div class="secFoot">
        <button class="sec" data-action="editSec" data-id="${temaId}" data-sid="${sc.id}"><span class="lbRead">✏️ Editar</span><span class="lbEdit">✓ Listo</span></button>
        <button class="sec" data-action="delSec" data-id="${temaId}" data-sid="${sc.id}">🗑️ Eliminar</button>
      </div>
    </div>
  </details>`;
}
function cardRow(c){
  return `<div class="cardRow" data-card="${c.id}">
    <span class="cl">Frente</span><textarea class="fld sm cf" rows="1" data-action="editCardFront" data-id="${c.id}" placeholder="Frente (término / pregunta)">${esc(c.front)}</textarea>
    <span class="cl">Reverso</span><textarea class="fld sm cb" rows="1" data-action="editCardBack" data-id="${c.id}" placeholder="Reverso (definición / respuesta)">${esc(c.back)}</textarea>
    <span class="cl">Por qué</span><textarea class="fld sm ce" rows="1" data-action="editCardExp" data-id="${c.id}" placeholder="Explicación (opcional): se muestra cuando alguien falla esta tarjeta" maxlength="400">${esc(c.exp||'')}</textarea>
    <button class="icon-btn" data-action="delCard" data-id="${c.id}" title="Eliminar tarjeta">🗑️</button>
  </div>`;
}
