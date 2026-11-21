/* ================= ACCIONES (clicks) ================= */
/* "Saltar al contenido": la app usa el # de la dirección para navegar, así que se enfoca el contenido sin cambiarlo */
document.addEventListener('click',e=>{
  const sk=e.target.closest&&e.target.closest('a.skip');if(!sk)return;
  e.preventDefault();const v=$('view');if(v)v.focus();
});
document.addEventListener('keydown',e=>{
  // Elementos que no son <button> pero actúan como tal (carpetas, flashcards): Enter o Espacio los activan
  const f=e.target&&e.target.matches&&e.target.matches('[role="button"][tabindex]:not(button)')?e.target:null;
  if(f&&e.target===f&&(e.key==='Enter'||e.key===' ')){e.preventDefault();f.click()}
});
document.addEventListener('change',async e=>{
  if(!e.target||e.target.id!=='pdfCompInput')return;
  const f=e.target.files&&e.target.files[0];e.target.value='';
  if(!f||!puedeSubir())return;
  const st=$('iaStatus');
  try{
    const res=await comprimirPDF(f,{objetivo:f.size>ARCH_MAX?ARCH_MAX:Math.floor(f.size*0.6),progreso:(i,n)=>{if(st)st.textContent='🗜️ Comprimiendo… página '+i+' de '+n}});
    if(res.despues>=f.size){if(st)st.textContent='ℹ️ Ese PDF ya está muy liviano: no se pudo reducir más.';return}
    bajarBlob(res.file,f.name.replace(/\.pdf$/i,'')+'_comprimido.pdf');
    if(st)st.textContent='✅ De '+fmtTam(res.antes)+' a '+fmtTam(res.despues)+' (−'+Math.round((1-res.despues/res.antes)*100)+' %). La copia no tiene texto seleccionable; guarda también el original.';
  }catch(err){console.error(err);if(st)st.textContent='❌ No se pudo comprimir el PDF'+detalleError(err)+'.'}
});
document.addEventListener('change',e=>{
  if(e.target&&e.target.dataset&&e.target.dataset.action==='exHueco'&&exTom){render(true);return}
  const inp=e.target;
  if(!inp||!inp.matches||!inp.matches('input[data-medio-tema]'))return;
  const f=inp.files&&inp.files[0];inp.value='';
  if(f)agregarImagenTema(inp.dataset.medioTema,f);
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-action]');if(!b)return;
  e.preventDefault();
  const a=b.dataset.action;

  if(a==='addSemester'){
    const f=await formCarpeta('Nueva carpeta');
    if(f)mutate(s=>s.semesters.push({id:uid(),name:f.name,icon:f.icon}));
  }
  else if(a==='renameSemester'){
    const cur=state.semesters.find(x=>x.id===b.dataset.id);
    const f=await formCarpeta('Editar carpeta',cur);
    if(f)mutate(s=>{const x=s.semesters.find(y=>y.id===b.dataset.id);if(x){x.name=f.name;x.icon=f.icon}});
  }
  else if(a==='moverMateria'){moverMateria(b.dataset.id)}
  else if(a==='renameMateria'){
    const cur=state.materias.find(x=>x.id===b.dataset.id);
    const f=await formMateria('Editar materia',cur,undefined,!!(cur&&cur.rol==='docente'));
    if(f)mutate(s=>{const x=s.materias.find(y=>y.id===b.dataset.id);if(x){x.name=f.name;x.icon=f.icon;if(f.color)x.color=f.color;if(f.semestre){x.semestre=f.semestre;x.curso=f.curso}}});
  }
  else if(a==='delSemester'){
    const dest=await destinoAlBorrarCarpeta(b.dataset.id);
    if(dest===null)return;
    if(dest){mutate(s=>{s.materias.forEach(m=>{if(m.semesterId===b.dataset.id)m.semesterId=dest});s.semesters=s.semesters.filter(x=>x.id!==b.dataset.id)});return}
    {
      state.materias.filter(m=>m.semesterId===b.dataset.id&&m.sharedId).forEach(m=>abandonarCompartida(m,{silent:true}));
      mutate(s=>{
        const matIds=s.materias.filter(m=>m.semesterId===b.dataset.id).map(m=>m.id);
        s.materias=s.materias.filter(m=>m.semesterId!==b.dataset.id);
        s.temas=s.temas.filter(t=>!matIds.includes(t.materiaId));
        s.cortes=s.cortes.filter(c=>!matIds.includes(c.materiaId));
        s.cards=s.cards.filter(c=>!matIds.includes(c.materiaId));
        s.attempts=s.attempts.filter(x=>!matIds.includes(x.materiaId));
        s.semesters=s.semesters.filter(x=>x.id!==b.dataset.id);
      });
    }
  }
  else if(a==='addMateria'){
    if(!esProfesor())return;
    if(!esProfesor())return;
    const f=await formMateria('Nueva materia',null,'Ej. Memoria');
    if(f)mutate(s=>s.materias.push({id:uid(),name:f.name,icon:f.icon,color:f.color||undefined,semesterId:b.dataset.sem,refs:''}));
  }
  else if(a==='delMateria'){
    const msh=state.materias.find(x=>x.id===b.dataset.id);
    if(await UI.confirmar(msh&&msh.rol==='docente'?'Vas a eliminar esta materia PARA TODOS: tus estudiantes dejarán de recibirla y se borrará el contenido de la nube (ellos conservan una copia local de lo que ya tenían). ¿Continuar?':msh&&msh.sharedId?'Esta materia es compartida: se eliminará de TU cuaderno y saldrás del grupo. Las demás personas conservan todo. ¿Continuar?':'¿Eliminar esta materia y todo su contenido (temas, tarjetas y cortes)? Esta acción no se puede deshacer.')){
      if(msh&&msh.sharedId)abandonarCompartida(msh,{silent:true,todos:msh.rol==='docente'});
      mutate(s=>{
        s.cards=s.cards.filter(c=>c.materiaId!==b.dataset.id);
        s.attempts=s.attempts.filter(x=>x.materiaId!==b.dataset.id);
        s.temas=s.temas.filter(t=>t.materiaId!==b.dataset.id);
        s.cortes=s.cortes.filter(c=>c.materiaId!==b.dataset.id);
        s.materias=s.materias.filter(m=>m.id!==b.dataset.id);
      });
    }
  }
  else if(a==='openMateria'){route={view:'materiaDetail',materiaId:b.dataset.id};render();}
  else if(a==='openSemester'){route={view:'materias',materiaId:null,semId:b.dataset.id};render()}
  else if(a==='toggleDw'){
    const sec=b.closest('.dw');if(!sec)return;
    const abrir=!sec.classList.contains('open');
    sec.classList.toggle('open',abrir);b.setAttribute('aria-expanded',String(abrir));
    ui.dw=ui.dw||{};ui.dw[b.dataset.k]=abrir;
    if(abrir)requestAnimationFrame(()=>{fitCards(sec);layoutRadials(sec)});
  }
  else if(a==='homeMaterias')goToView('materias');
  else if(a==='backMaterias'){
    const mm=route.materiaId&&state.materias.find(x=>x.id===route.materiaId);
    if(mm&&mm.rol!=='docente'&&state.semesters.some(s=>s.id===mm.semesterId&&!s.oculto)){route={view:'materias',materiaId:null,semId:mm.semesterId};render()}   // se vuelve al semestre de esa materia
    else goToView('materias');
  }
  else if(a==='backMateria'){route={view:'materiaDetail',materiaId:b.dataset.id};render();}
  else if(a==='addTema'){
    mutate(s=>{ui.open[b.dataset.corte]=true;s.temas.unshift({id:uid(),materiaId:b.dataset.mat,corteId:b.dataset.corte,title:'',body:'',by:miNombre(),publicado:((s.materias.find(x=>x.id===b.dataset.mat)||{}).rol==='docente')?false:undefined,updatedAt:Date.now()})});
  }
  else if(a==='temaTab'){
    ui.tab[b.dataset.id]=b.dataset.tab;
    const box=b.closest('.b');
    box.querySelectorAll('.tabsT button').forEach(x=>x.classList.toggle('on',x===b));
    box.querySelectorAll('.tp').forEach(p=>{p.hidden=p.dataset.panel!==b.dataset.tab});
    requestAnimationFrame(()=>{fitCards();layoutRadials()});
  }
  else if(a==='esqMenu'){
    const menu=b.parentElement.querySelector('.esqx-menu'),abrir=menu.hidden;
    esqCerrarMenus(abrir?menu:null);
    menu.hidden=!abrir;b.setAttribute('aria-expanded',String(abrir));
  }
  else if(a==='esqStyle'){
    const id=b.closest('.esqx').dataset.esqtema;
    esqGuardar(b.dataset.estilo);esqRefrescar();
    const nb=document.querySelector('.esqx[data-esqtema="'+id+'"] .esqx-tab');if(nb)nb.focus();
  }
  else if(a==='editSec'){
    const el=b.closest('.secAcc');
    if(el.classList.contains('editing')){
      const t=state.temas.find(x=>x.id===b.dataset.id),sc=t&&t.secciones&&t.secciones.find(x=>x.id===b.dataset.sid);
      if(sc){
        el.querySelector('.secRead').innerHTML=secReadHTML(sc);
        const pan=el.closest('.b').querySelector('[data-panel="esquema"]');
        if(pan){pan.innerHTML=esquemaHTML(t);requestAnimationFrame(()=>layoutRadials(pan))}
      }
      el.classList.remove('editing');
    }else{el.classList.add('editing');el.querySelectorAll('textarea').forEach(fitTA)}
  }
  else if(a==='addSec'){
    mutate(s=>{const t=s.temas.find(x=>x.id===b.dataset.id);if(t){t.secciones=t.secciones||[];t.secciones.push({id:uid(),title:'',body:''});t.updatedAt=Date.now()}});
  }
  else if(a==='delSec'){
    if(await UI.confirmar('¿Eliminar esta sección?'))mutate(s=>{const t=s.temas.find(x=>x.id===b.dataset.id);if(t&&t.secciones)t.secciones=t.secciones.filter(x=>x.id!==b.dataset.sid)});
  }
  else if(a==='descargarOriginal'){descargarOriginal(b.dataset.id)}
  else if(a==='pomoToggle'){pomoAbrir()}
  else if(a==='pomoCerrar'){pomoAbrir(false)}
  else if(a==='pomoGo'){if(pomo.corriendo)pomoPausar();else pomoIniciar()}
  else if(a==='pomoReset'){pomoReiniciar()}
  else if(a==='pomoSkip'){pomoSaltar()}
  else if(a==='borrarCuenta'){borrarMiCuenta()}
  else if(a==='adminRecargar'){adminLista=null;adminError='';if(adminTab==='rachas')adminRachas=null;render(true)}
  else if(a==='adminBorrar'){borrarCuentaAjena(b.dataset.uid)}
  else if(a==='notaEsquema'){const tm=miTema(b.dataset.id),ta=document.querySelector('textarea[data-tema="'+b.dataset.id+'"]');if(tm&&ta){const e=esquemaTexto(tm);if(e){ta.value=(ta.value.trim()?ta.value.replace(/\s+$/,'')+'\n\n':'')+e;programarNota(tm.id,tm.materiaId,ta.value)}}}
  else if(a==='ttsNota'){const tm=miTema(b.dataset.id);if(tm)ttsLeer('Mis apuntes: '+tm.title,textoNota(tm.id))}
  else if(a==='pdfPick'){const pi=$('pdfCompInput');if(pi)pi.click()}
  else if(a==='ttsTema'){const tm=miTema(b.dataset.id);if(tm)ttsLeer(tm.title,textoTema(tm))}
  else if(a==='ttsSec'){const tm=miTema(b.dataset.tema),sc=tm&&(tm.secciones||[]).find(x=>x.id===b.dataset.sec);if(sc)ttsLeer(sc.title,textoSeccion(sc))}
  else if(a==='ttsCard'){const cd=state.cards.find(x=>x.id===b.dataset.id);if(cd)ttsLeer('Tarjeta',cd.front+'.'+(toolState&&toolState.flipped?' '+cd.back:''))}
  else if(a==='ttsToggle'){if(tts.estado==='leyendo')ttsPausar();else ttsContinuar()}
  else if(a==='ttsStop'){ttsParar()}
  else if(a==='addImagen'){const inp=b.parentElement.querySelector('input[data-medio-tema]');if(inp)inp.click()}
  else if(a==='addVideo'){agregarVideoTema(b.dataset.id)}
  else if(a==='delMedio'){quitarMedio(b.dataset.tema,b.dataset.id)}
  else if(a==='descargarCopia'){descargarCopia()}
  else if(a==='avCerrar'){$('avisosPanel').hidden=true}
  else if(a==='avVaciar'){avCargar().lista=[];avGuardar();$('avisosPanel').innerHTML=avisosPanelHTML(new Set())}
  else if(a==='avAbrir'){
    const x=avCargar().lista.find(v=>v.id===b.dataset.av);$('avisosPanel').hidden=true;
    const mm=x&&x.materiaId&&state.materias.find(v=>v.id===x.materiaId);
    if(mm){route={view:'materiaDetail',materiaId:mm.id};document.querySelectorAll('#mainNav button').forEach(v=>v.classList.toggle('on',v.dataset.nav==='materias'));render()}
  }
  else if(a==='avToggle'){mutate(s=>{s.profile.avisos=s.profile.avisos===false});if(avisosActivos())revisarRecordatorios()}
  else if(a==='avPermiso'){
    try{Promise.resolve(Notification.requestPermission()).then(()=>{render(true);if(Notification.permission==='granted')notificarSistemaPrueba()})}catch(err){console.warn(err)}
  }
  else if(a==='syncReintentar'){reintentarSync()}
  else if(a==='liberarEspacio'){liberarEspacio()}
  else if(a==='delTema'){
    if(await UI.confirmar(msgDelTema(b.dataset.id))){
      const t0=state.temas.find(x=>x.id===b.dataset.id);
      if(t0&&t0.archivo){const mm=state.materias.find(x=>x.id===t0.materiaId);if(mm&&mm.sharedId&&mm.rol!=='estudiante')borrarOriginalNube(mm.sharedId,t0.id,t0.archivo.partes,t0.archivo)}
      if(t0&&(t0.medios||[]).length){const mm=state.materias.find(x=>x.id===t0.materiaId);if(mm&&mm.sharedId&&mm.rol!=='estudiante')borrarMediosNube(mm.sharedId,t0)}
      mutate(s=>{s.cards=s.cards.filter(c=>c.temaId!==b.dataset.id);s.temas=s.temas.filter(t=>t.id!==b.dataset.id)});
    }
  }
  else if(a==='addCard'){
    mutate(s=>s.cards.push({id:uid(),temaId:b.dataset.tema,materiaId:b.dataset.mat,front:'',back:'',known:null}));
  }
  else if(a==='delCard'){
    if(await UI.confirmar('¿Eliminar esta tarjeta?'))mutate(s=>s.cards=s.cards.filter(c=>c.id!==b.dataset.id));
  }
  else if(a==='addCorte'){
    const name=await UI.prompt('Nombre del nuevo corte:','Corte '+(state.cortes.filter(c=>c.materiaId===b.dataset.mat).length+1));
    if(name&&name.trim())mutate(s=>{
      const mine=s.cortes.filter(c=>c.materiaId===b.dataset.mat);
      const used=mine.reduce((x,c)=>x+(+c.weight||0),0);
      const id=uid();ui.open[id]=true;ui.corteAb=ui.corteAb||{};ui.corteAb[b.dataset.mat]=id;
      s.cortes.push({id,materiaId:b.dataset.mat,name:name.trim(),weight:Math.max(0,100-used),score:null});
    });
  }
  else if(a==='editCorte'||a==='doneCorte'){
    const el=b.closest('.cPanel,.folder');if(!el)return;
    if(el.classList.contains('editing')){el.classList.remove('editing');render(true);}
    else{el.classList.add('editing');el.open=true;const i=el.querySelector('.corteEdit input');if(i)i.focus();}
  }
  else if(a==='corteTab'){
    /* Pestañas de carpeta: solo un corte abierto a la vez (sin repintar la pantalla) */
    const abrir=!b.classList.contains('on'),zona=b.closest('.zona');if(!zona)return;
    ui.corteAb=ui.corteAb||{};ui.corteAb[b.dataset.mat]=abrir?b.dataset.id:'';
    zona.querySelectorAll('.cTab[data-id]').forEach(x=>{const on=abrir&&x===b;x.classList.toggle('on',on);x.setAttribute('aria-expanded',String(on))});
    zona.querySelectorAll('.cPanel').forEach(p=>{p.hidden=!(abrir&&p.dataset.cpanel===b.dataset.id)});
    const h=zona.querySelector('.cHint');if(h)h.hidden=abrir;
    if(abrir){const p=zona.querySelector('.cPanel:not([hidden])');if(p){requestAnimationFrame(()=>{fitCards(p);layoutRadials(p)});p.scrollIntoView({behavior:reducido()?'auto':'smooth',block:'nearest'})}}
  }
  else if(a==='delCorte'){
    const id=b.dataset.id,c=state.cortes.find(x=>x.id===id);if(!c)return;
    if(state.cortes.filter(x=>x.materiaId===c.materiaId).length<=1){UI.alerta('Cada materia necesita al menos un corte. Puedes editar este en lugar de eliminarlo.');return;}
    const n=state.temas.filter(t=>t.corteId===id).length;
    const msg=n?`¿Eliminar "${c.name}" junto con sus ${n} tema${n==1?'':'s'} y sus tarjetas? Esta acción no se puede deshacer.`:`¿Eliminar "${c.name}"?`;
    const matC=state.materias.find(x=>x.id===c.materiaId);
    if(matC&&matC.sharedId){
      /* Los cortes son personales: borrar uno no debe borrar temas que también son de otras personas. */
      if(await UI.confirmar(`¿Eliminar "${c.name}"? Los ${n} tema${n==1?'':'s'} de esta materia compartida NO se borran: pasan a otro de tus cortes.`))mutate(s=>{
        const otro=s.cortes.find(x=>x.materiaId===c.materiaId&&x.id!==id);
        s.temas.forEach(t=>{if(t.corteId===id)t.corteId=otro.id});
        s.cortes=s.cortes.filter(x=>x.id!==id);
      });
      return;
    }
    if(await UI.confirmar(msg))mutate(s=>{
      const ids=s.temas.filter(t=>t.corteId===id).map(t=>t.id);
      s.cards=s.cards.filter(k=>!ids.includes(k.temaId));
      s.temas=s.temas.filter(t=>t.corteId!==id);
      s.cortes=s.cortes.filter(x=>x.id!==id);
    });
  }
  else if(a==='openTool'){startTool(b.dataset.tool,b.dataset.mat);}
  else if(a==='quizStart'){comenzarQuiz()}
  else if(a==='quizTiposChip'&&toolState&&toolState.setup){toolState.tipos=b.dataset.v;ui.quizCfg[route.materiaId].tipos=toolState.tipos;render(true)}
  else if(a==='quizDifChip'&&toolState&&toolState.setup&&DIF_EST.some(d=>d[0]===b.dataset.v)){toolState.dif=b.dataset.v;ui.quizCfg[route.materiaId].dif=toolState.dif;guardarDifEst(toolState.dif);render(true)}
  else if(a==='redoTool'){startTool(route.tool,route.materiaId);}
  else if(a==='flipCard'){
    toolState.flipped=!toolState.flipped;
    if(b.classList.contains('flashcard'))b.classList.toggle('flip',toolState.flipped);   // sin repintar: así el giro se anima
    else render();
  }
  else if(a==='falleStart'){comenzarFalle(b.dataset.modo,b.dataset.tema)}
  else if(a==='memoVer'){
    const box=b.closest('.memo');if(!box)return;
    const ver=!box.classList.contains('ver');box.classList.toggle('ver',ver);b.setAttribute('aria-expanded',String(ver));
  }
  else if(a==='memoYo'&&toolState){
    const box=b.closest('.memo');if(!box)return;
    const ok=b.dataset.ok==='1';toolState.memo=toolState.memo||{};toolState.memo[b.dataset.i]=ok?1:0;
    box.classList.add('ver');box.classList.toggle('bien',ok);box.classList.toggle('mal',!ok);
    const cu=$('memoCuenta');if(cu)cu.textContent=memoCuentaTxt();
    const br=$('memoBar');if(br)br.style.width=Math.round(Object.keys(toolState.memo).length/toolState.cards.length*100)+'%';
    if(ok&&!reducido())explotar(b);
  }
  else if(a==='conceptoPista'&&toolState&&toolState.qs){toolState.pista=true;render(true)}
  else if(a==='conceptoRevelar'&&toolState&&toolState.qs){toolState.flipped=true;render(true)}
  else if((a==='conceptoOpt'||a==='conceptoAuto')&&toolState&&toolState.qs){
    const q=toolState.qs[toolState.idx];if(!q||q.sel!=null)return;
    const correcta=limpioT(q.card.front);
    const ok=a==='conceptoOpt'?q.opts[+b.dataset.i]===correcta:b.dataset.ok==='1';
    q.sel=a==='conceptoOpt'?q.opts[+b.dataset.i]:(ok?correcta:'');
    if(ok)toolState.score++;
    toolState.combo=ok?(toolState.combo||0)+1:0;toolState.mejor=Math.max(toolState.mejor||0,toolState.combo);
    const real=state.cards.find(x=>x.id===q.card.id);
    if(real){real.known=ok;repasarTarjeta(real,ok);persist()}
    if(a==='conceptoAuto'){toolState.idx++;toolState.pista=false;toolState.flipped=false;if(toolState.idx>=toolState.qs.length){toolState.fxFin=true;toolState.fxPct=toolState.score/toolState.qs.length}}
    else toolState.fx={tipo:ok?'ok':'no'};
    render(a==='conceptoOpt');
  }
  else if(a==='conceptoNext'&&toolState&&toolState.qs){
    toolState.idx++;toolState.pista=false;toolState.flipped=false;
    if(toolState.idx>=toolState.qs.length){toolState.fxFin=true;toolState.fxPct=toolState.score/toolState.qs.length}
    render();
  }
  else if(a==='empPick'){empPick(b)}
  else if(a==='cardAnswer'){
    const know=b.dataset.know==='1';
    const c=toolState.cards[toolState.idx%toolState.cards.length];
    const real=c&&state.cards.find(x=>x.id===c.id);
    if(real){real.known=know;repasarTarjeta(real,know,b.dataset.cal||'bien');persist();avisarLogros(evaluarLogros());}
    toolState.seen++;if(know)toolState.known++;
    toolState.combo=know?(toolState.combo||0)+1:0;toolState.mejor=Math.max(toolState.mejor||0,toolState.combo);
    toolState.idx++;toolState.flipped=false;
    if(route.tool!=='repaso'&&toolState.idx>=toolState.cards.length){toolState.fxFin=true;toolState.fxPct=toolState.seen?toolState.known/toolState.seen:0}
    render();
  }
  else if((a==='answerQuiz'||a==='answerHueco')&&route.tool==='tablero'){tabResponder(a==='answerHueco'?limpioT(($('huecoInput')||{}).value)||'(sin respuesta)':b.dataset.opt)}
  else if(a==='answerQuiz'||a==='answerHueco'){
    const q=toolState.questions[toolState.idx];
    if(q.selected)return;
    if(a==='answerHueco')q.selected=limpioT(($('huecoInput')||{}).value)||'(sin respuesta)';
    else q.selected=b.dataset.opt;
    const acierto=esAcierto(q);
    if(acierto)toolState.score++;
    const realQ=state.cards.find(x=>x.id===q.card.id);
    if(realQ){repasarTarjeta(realQ,acierto);persist()}      // el repaso espaciado también aprende de los quiz
    /* Combo y XP cuentan siempre; en el Modo examen sin "ver al instante" se muestran recién al final */
    toolState.combo=acierto?(toolState.combo||0)+1:0;toolState.mejor=Math.max(toolState.mejor||0,toolState.combo);
    q.xp=acierto?xpAcierto(toolState.combo):0;q.combo=toolState.combo;toolState.xp=(toolState.xp||0)+q.xp;
    if(route.tool!=='examen'||examInstantaneo)toolState.fx={tipo:acierto?'ok':'no'};
    render();
  }
  else if(a==='nextQuestion'){
    toolState.idx++;
    if(toolState.idx>=toolState.questions.length)cerrarSesionPractica();
    else render();
  }
  else if(a==='escRevelar'&&toolState&&toolState.escrito){
    const q=toolState.questions[toolState.idx];
    q.text=($('escText')||{}).value||'';q.rev=true;render();
  }
  else if((a==='escOk'||a==='escNo')&&toolState&&toolState.escrito){
    const q=toolState.questions[toolState.idx];
    if(!q.rev)return;
    q.ok=(a==='escOk');if(q.ok)toolState.score++;
    const realE=state.cards.find(x=>x.id===q.card.id);if(realE){repasarTarjeta(realE,q.ok);persist()}
    toolState.idx++;
    if(toolState.idx>=toolState.questions.length)cerrarSesionPractica();
    else render();
  }
  else if(a==='calPrev'){calView.m--;if(calView.m<0){calView.m=11;calView.y--}render();}
  else if(a==='calNext'){calView.m++;if(calView.m>11){calView.m=0;calView.y++}render();}
  else if(a==='miniCalNav'){ui.calM=(ui.calM||0)+(+b.dataset.d||0);render(true)}
  else if(a==='toggleRepasoHoy'){
    /* Solo se cambia ese cajón (sin repintar la pantalla) y se recuerda la elección */
    const caja=b.closest('.repasoHoy');if(!caja)return;
    const abrir=!caja.classList.contains('open');
    caja.classList.toggle('open',abrir);b.setAttribute('aria-expanded',String(abrir));
    guardarRepasoHoyAbierto(abrir);
  }
  else if(a==='semDlg'){abrirPromediosSemestre()}
  else if(a==='selDay'){calView.sel=b.dataset.date;render();}
  else if(a==='addEvent'){
    const r=await UI.preguntar('Nuevo evento',[
      {k:'t',l:'Título',ph:'Ej. Examen final de Ética',max:100},
      {k:'ty',l:'Tipo',t:'select',v:'ex',o:[['ex','📝 Examen'],['en','📦 Entrega'],['ot','📌 Otro']]},
      {k:'d',l:'Fecha',t:'date',v:b.dataset.date}
    ],{ok:'Agregar'});
    if(r&&String(r.t).trim()&&/^\d{4}-\d{2}-\d{2}$/.test(r.d))mutate(s=>s.events.push({id:uid(),date:r.d,title:String(r.t).trim(),type:['ex','en','ot'].includes(r.ty)?r.ty:'ot'}));
  }
  else if(a==='delEvent'){
    if(await UI.confirmar('¿Eliminar este evento?'))mutate(s=>s.events=s.events.filter(x=>x.id!==b.dataset.id));
  }
  else if(a==='setAvatar'){mutate(s=>s.profile.avatar=b.dataset.a);}
  else if(a==='colAcento'){setColores({acento:b.dataset.v||null},true);}
  else if(a==='colFondo'){setColores({fondo:b.dataset.c?{claro:b.dataset.c,oscuro:b.dataset.o}:null},true);}
  else if(a==='colReset'){state.colors=null;applyColors();persist();render(true);toast('🎨 Colores originales');}
  else if(a==='logout'){if(await UI.confirmar('¿Cerrar sesión?'))auth.signOut();}
});

/* ================= ACCIONES (edición en vivo, sin repintar) ================= */
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target&&e.target.id==='huecoInput'){e.preventDefault();const b=document.querySelector('[data-action="answerHueco"]');if(b)b.click()}
});
document.addEventListener('input',e=>{
  const a=e.target.dataset.action;if(!a)return;
  const id=e.target.dataset.id;

  if(a==='editTemaTitle'){
    const t=state.temas.find(x=>x.id===id);if(!t)return;
    t.title=e.target.value;t.updatedAt=Date.now();persist();
    const sum=e.target.closest('details')?.querySelector('summary span');
    if(sum)sum.textContent='📝 '+(t.title||'(tema sin título)');
  }
  else if(a==='editTemaBody'){
    const t=state.temas.find(x=>x.id===id);if(!t)return;
    t.body=e.target.value;t.updatedAt=Date.now();persist();
  }
  else if(a==='iaCorteSel'){ui.iaCorte=e.target.value}
  else if(a==='quizCorte'&&toolState&&toolState.setup){toolState.corteId=e.target.value;toolState.temaId='';toolState.error='';ui.quizCfg[route.materiaId].corteId=e.target.value;ui.quizCfg[route.materiaId].temaId='';render(true)}
  else if(a==='quizTipos'&&toolState&&toolState.setup){toolState.tipos=e.target.value;ui.quizCfg[route.materiaId].tipos=toolState.tipos}
  else if(a==='quizN'&&toolState&&toolState.setup){toolState.n=+e.target.value||0;ui.quizCfg[route.materiaId].n[route.tool]=toolState.n}
  else if(a==='editSecPuntos'){
    const t=state.temas.find(x=>x.id===id);
    const sc=t&&t.secciones&&t.secciones.find(x=>x.id===e.target.dataset.sid);if(!sc)return;
    const pr=ideasParse(e.target.value);sc.puntos=pr.puntos;sc.tipos=pr.tipos;
    t.updatedAt=Date.now();persist();
  }
  else if(a==='editSecRel'){
    const t=state.temas.find(x=>x.id===id);if(!t||!t.secciones)return;
    const sc=t.secciones.find(x=>x.id===e.target.dataset.sid);if(!sc)return;
    sc.rel=e.target.value;t.updatedAt=Date.now();persist();
  }
  else if(a==='editSecTitle'||a==='editSecBody'){
    const t=state.temas.find(x=>x.id===id);if(!t||!t.secciones)return;
    const sc=t.secciones.find(x=>x.id===e.target.dataset.sid);if(!sc)return;
    if(a==='editSecTitle'){
      sc.title=e.target.value;
      const sn=e.target.closest('details')?.querySelector('summary .st');
      if(sn)sn.textContent=sc.title||'(sección sin título)';
    }else{sc.body=e.target.value;const sp=e.target.closest('details')?.querySelector('summary .sp');if(sp)sp.textContent=prevSec(sc.body)}
    t.updatedAt=Date.now();persist();
  }
  else if(a==='editCorteName'){
    const c=state.cortes.find(x=>x.id===id);if(!c)return;
    c.name=e.target.value;persist();
    const ft=e.target.closest('.cPanel,.folder')?.querySelector('.ft');if(ft)ft.textContent=c.name||'(corte sin nombre)';
    const tn=document.querySelector('.cTab[data-id="'+id+'"] .cTabN');if(tn)tn.textContent=c.name||'(corte sin nombre)';
  }
  else if(a==='editCorteWeight'){
    const c=state.cortes.find(x=>x.id===id);if(!c)return;
    c.weight=clamp(+e.target.value||0,0,100);persist();refreshCorteAvg(route.materiaId);
  }
  else if(a==='editCorteScore'){
    const c=state.cortes.find(x=>x.id===id);if(!c)return;
    c.score=e.target.value===''?null:clamp(+e.target.value,0,scaleMax());persist();refreshCorteAvg(route.materiaId);
  }
  else if(a==='profileField'){
    const f=e.target.dataset.f;
    state.profile[f]=f==='goal'?clamp(+e.target.value||0,0,scaleMax()):e.target.value;
    persist();
  }
  else if(a==='editCardFront'){
    const c=state.cards.find(x=>x.id===id);if(!c)return;
    c.front=e.target.value;persist();
  }
  else if(a==='editCardBack'){
    const c=state.cards.find(x=>x.id===id);if(!c)return;
    c.back=e.target.value;persist();
  }
  else if(a==='editCardExp'){
    const c=state.cards.find(x=>x.id===id);if(!c)return;
    const v=e.target.value.slice(0,400);if(v.trim())c.exp=v;else delete c.exp;persist();
  }
  else if(a==='editMateriaRefs'){
    const m=state.materias.find(x=>x.id===id);if(!m)return;
    m.refs=e.target.value;persist();
  }
});
document.addEventListener('change',e=>{
  if(e.target.dataset.action==='setCompareMateria'){
    toolState.materiaId2=e.target.value;persist();render();
  }
});

document.addEventListener('change',async e=>{
  if(!e.target.dataset||e.target.dataset.action!=='setScale')return;
  const ns=+e.target.value,os=scaleMax();
  if(ns===os)return;
  if(!await UI.confirmar('Cambiar la escala convierte tus notas y tu meta proporcionalmente (por ejemplo, 4,5 sobre 5 pasa a 90 sobre 100). ¿Continuar?')){render();return;}
  const conv=x=>{const v=x*ns/os;return ns>10?Math.round(v*10)/10:Math.round(v*100)/100};
  mutate(s=>{
    s.profile.scale=ns;s.profile.goal=conv(+s.profile.goal||0);
    s.cortes.forEach(c=>{if(c.score!=null&&c.score!=='')c.score=conv(+c.score)});
  });
});

/* Auto-ajuste de altura de las secciones (solo estético) */
function fitTA(t){t.style.height='auto';t.style.height=(t.scrollHeight+4)+'px'}
/* Tarjetas: cada campo crece según su texto. Los campos ocultos (pestaña cerrada) se ajustan al mostrarse. */
function fitCards(root){(root||document).querySelectorAll('.cardRow textarea').forEach(t=>{if(t.offsetParent!==null)fitTA(t)})}
let esqRz;
window.addEventListener('resize',()=>{fitCards();clearTimeout(esqRz);esqRz=setTimeout(()=>layoutRadials(),120)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>layoutRadials());
document.addEventListener('click',e=>{if(!e.target.closest('.esqx-tabs'))esqCerrarMenus()});
document.addEventListener('keydown',e=>{
  const tab=e.target.closest&&e.target.closest('.esqx-tab');
  if(tab&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
    e.preventDefault();const menu=tab.parentElement.querySelector('.esqx-menu');
    esqCerrarMenus(menu);menu.hidden=false;tab.setAttribute('aria-expanded','true');
    const it=[...menu.querySelectorAll('.esqx-mi')];(it.find(x=>x.getAttribute('aria-checked')==='true')||it[0]).focus();return;
  }
  const menu=e.target.closest&&e.target.closest('.esqx-menu');if(!menu)return;
  const it=[...menu.querySelectorAll('.esqx-mi')],i=it.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();it[(i+1)%it.length].focus()}
  else if(e.key==='ArrowUp'){e.preventDefault();it[(i-1+it.length)%it.length].focus()}
  else if(e.key==='Home'){e.preventDefault();it[0].focus()}
  else if(e.key==='End'){e.preventDefault();it[it.length-1].focus()}
  else if(e.key==='Escape'){e.preventDefault();esqCerrarMenus();const tb=menu.parentElement.querySelector('.esqx-tab');if(tb)tb.focus()}
  else if(e.key==='Tab')esqCerrarMenus();
});
document.addEventListener('toggle',e=>{const d=e.target;if(!d.matches||!d.matches('details'))return;
  if(d.dataset.tema)ui.open[d.dataset.tema]=d.open;
  if(d.dataset.sec)ui.sec[d.dataset.sec]=d.open;
  if(d.dataset.corte)ui.open[d.dataset.corte]=d.open;
  if(d.open)requestAnimationFrame(()=>{fitCards(d);layoutRadials(d)});
},true);
document.addEventListener('input',e=>{if(e.target.matches&&e.target.matches('.secAcc textarea, .cardRow textarea'))fitTA(e.target)});

/* Hecho por Sebastián Poveda y Santiago Romero. 2026 · generación de temas con IA */
