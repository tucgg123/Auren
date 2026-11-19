/* ================= VISTA: CALENDARIO ================= */
function viewCalendarioHTML(){
  const{y,m}=calView;
  const monthNames=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const first=new Date(y,m,1),startOff=(first.getDay()+6)%7,daysInMonth=new Date(y,m+1,0).getDate();
  const todayStr=ymd(new Date());
  const todosEv=eventosTodos();
  const evByDate={};todosEv.forEach(e=>{(evByDate[e.date]=evByDate[e.date]||[]).push(e)});
  let cells='';
  for(let i=0;i<startOff;i++)cells+='<div class="dcell empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ds=ymd(new Date(y,m,d));
    const has=evByDate[ds];
    cells+=`<button class="dcell ${ds===todayStr?'today':''} ${ds===calView.sel?'sel':''}" data-action="selDay" data-date="${ds}">${d}${has?(has.some(x=>!x.docente)?'<i class="dot"></i>':'')+(has.some(x=>x.docente)?'<i class="dot doc"></i>':''):''}</button>`;
  }
  const sel=calView.sel;
  const selEvents=sel?(evByDate[sel]||[]).slice().sort(sortEv):[];
  const soyDoc=state.materias.some(x=>x.rol==='docente'&&x.sharedId);
  const upcoming=todosEv.filter(e=>e.date>=todayStr).sort(sortEv).slice(0,8);
  return `
    <div class="viewhead"><h1>🗓️ Calendario</h1></div>
    <div class="calNav">
      <button class="icon-btn" data-action="calPrev" aria-label="Mes anterior" title="Mes anterior">‹</button>
      <b>${monthNames[m]} ${y}</b>
      <button class="icon-btn" data-action="calNext" aria-label="Mes siguiente" title="Mes siguiente">›</button>
    </div>
    <div class="calGrid">${['L','M','X','J','V','S','D'].map(x=>`<i class="dh">${x}</i>`).join('')}${cells}</div>
    ${sel?`<div class="card">
      <h3>${fmtDateLong(sel)}</h3>
      ${selEvents.length?selEvents.map(e=>e.docente?evDocFilaHTML(e,true):`<div class="li"><span>${TY[e.type]||'📌'} ${esc(e.title)}</span><button class="icon-btn" data-action="delEvent" data-id="${e.id}" aria-label="Eliminar evento ${esc(e.title)}" title="Eliminar evento">🗑️</button></div>`).join(''):'<p class="meta">Sin eventos este día.</p>'}
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="sec" data-action="addEvent" data-date="${sel}">+ Agregar evento</button>${soyDoc?`<button class="pr" data-action="newEvDocCal" data-date="${sel}">👩‍🏫 Evento para mis estudiantes</button>`:''}</div>
    </div>`:'<p class="meta">Toca un día para ver o agregar eventos.</p>'}
    <h3>Próximos</h3>
    ${upcoming.length?upcoming.map(e=>`<div class="li"><span><b>${e.docente?tipoEv(e.type):(TY[e.type]||'📌')}</b> ${esc(e.title)}${e.hora?` · 🕒 ${esc(e.hora)}`:''}<br><small>${e.docente?esc(e.icon)+' '+esc(e.materia)+' · ':''}${fmtDateLong(e.date)} · ${relDate(e.date)}</small></span></div>`).join(''):'<p class="meta">No tienes eventos próximos.</p>'}
  `;
}

/* ================= VISTA: PERFIL ================= */
function viewPerfilHTML(){
  const p=state.profile;
  const avgsAll=state.materias.filter(m=>m.rol!=='docente').map(m=>weightedAvg(state.cortes.filter(c=>c.materiaId===m.id))).filter(x=>x!=null);
  const globalAvg=avgsAll.length?(avgsAll.reduce((a,b)=>a+b,0)/avgsAll.length):null;
  return `
    <div class="viewhead"><h1>👤 Mi perfil</h1></div>
    <div class="card">
      <div class="pfhero"><div class="pfav">${esc(p.avatar)}</div><div><h2 style="margin:0">${esc(p.name)||(p.rol==='docente'?'Profesor':'Estudiante')}</h2><p class="meta" style="margin:2px 0 0">${esc(p.career)||'Agrega tu carrera y universidad'}</p></div></div>
      <div class="pgs">
        <div><b>${state.materias.filter(m=>m.rol!=='docente').length}</b>materias</div>
        <div><b>${state.temas.filter(t=>!esDocenteMat(t.materiaId)).length}</b>temas</div>
        <div><b>${globalAvg==null?'—':fmtN(globalAvg)}</b>promedio global</div>
      </div>
    </div>
    ${dwHTML('pf:av','Avatar','Elige el emoji que te representa',`<div class="avatarPicker">${AV.map(a=>`<button class="avBtn ${a===p.avatar?'on':''}" data-action="setAvatar" data-a="${a}" aria-label="Avatar ${a}" aria-pressed="${a===p.avatar}">${a}</button>`).join('')}</div>`,esc(p.avatar))}
    ${dwHTML('pf:ed','Editar perfil','Nombre, carrera, escala de notas y meta',`
      <label class="lbl" style="margin-top:0">Nombre</label><input class="fld" data-action="profileField" data-f="name" value="${esc(p.name)}" maxlength="40">
      <label class="lbl">Carrera y universidad</label><input class="fld" data-action="profileField" data-f="career" value="${esc(p.career)}" maxlength="80">
      <div class="two">
        <div><label class="lbl">Próximo examen</label>${proxExamenHTML()}</div>
        <div><label class="lbl">Escala de notas</label><select class="fld" data-action="setScale">${[5,10,100].map(n=>`<option value="${n}" ${scaleMax()===n?'selected':''}>0 a ${n}</option>`).join('')}</select></div>
      </div>
      <div class="two">
        <div><label class="lbl">Meta de promedio (sobre ${scaleMax()})</label><input class="fld" type="number" min="0" max="${scaleMax()}" step="0.1" data-action="profileField" data-f="goal" value="${p.goal}"></div>
        <div></div>
      </div>
      <label class="lbl">Notas personales</label><textarea class="fld" data-action="profileField" data-f="notes" placeholder="Ideas, dudas, recordatorios…">${esc(p.notes)}</textarea>`,'✏️')}
    ${dwHTML('pf:avisos','Avisos y recordatorios',avisosActivos()?'Activados':'Desactivados',avisosCardHTML(),'🔔')}
    ${dwHTML('pf:fx','Efectos visuales','Fondo animado y ahorro de batería',fxCardHTML(),'✨')}
    ${dwHTML('pf:datos','Tus datos','Descarga una copia de respaldo',datosCardHTML(),'💾')}
    ${dwHTML('pf:rol','Tu rol',esc(nombreRol(p.rol||'estudiante')),rolCardHTML(),'🎓')}
    ${dwHTML('pf:cuenta','Cuenta',esc(auth.currentUser&&auth.currentUser.email||''),`
      <p class="meta" style="margin-top:0">Conectado como <b>${esc(auth.currentUser&&auth.currentUser.email||'')}</b></p>
      <button class="sec" data-action="logout">🚪 Cerrar sesión</button> <button class="sec" data-action="borrarCuenta" style="color:var(--no)">🗑️ Eliminar mi cuenta</button>`,'🔑')}
  `;
}

/* ================= BÚSQUEDA ================= */
$('searchBox').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  const box=$('searchResults');
  if(q.length<2){box.innerHTML='';return}
  const results=[];
  state.materias.forEach(m=>{if(m.name.toLowerCase().includes(q))results.push({label:`📘 ${m.name}`,materiaId:m.id})});
  state.temas.forEach(t=>{
    if((t.title||'').toLowerCase().includes(q)||(t.body||'').toLowerCase().includes(q)){
      const mat=state.materias.find(m=>m.id===t.materiaId);
      results.push({label:`📝 ${t.title||'(sin título)'} — ${mat?mat.name:''}`,materiaId:t.materiaId});
    }
  });
  box.innerHTML=results.slice(0,8).map((r,i)=>`<div data-r="${i}">${esc(r.label)}</div>`).join('');
  box.querySelectorAll('[data-r]').forEach((el,i)=>el.onclick=()=>{
    box.innerHTML='';$('searchBox').value='';
    route={view:'materiaDetail',materiaId:results[i].materiaId};
    document.querySelectorAll('#mainNav button').forEach(x=>x.classList.remove('on'));
    render();
  });
});
document.addEventListener('click',e=>{if(!e.target.closest('#searchWrap'))$('searchResults').innerHTML=''});

