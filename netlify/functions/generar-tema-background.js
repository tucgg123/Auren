// Hecho por Sebastián Poveda y Santiago Romero. 2026 · generación de temas con IA en segundo plano
//
// Las funciones normales de Netlify tienen un tiempo máximo y un archivo grande puede tardar más
// (error 504). Esta versión corre en segundo plano (hasta 15 minutos): Netlify responde 202 al
// instante y, cuando la IA termina, el resultado se guarda en Firestore (colección iaJobs), donde
// la página lo está esperando. Reutiliza TODO de generar-tema.js: login, límite por hora, Gemini,
// reintentos y validación del resultado.
//
// IMPORTANTE: esta función nunca debe lanzar errores. Si lo hiciera, Netlify la reintentaría
// automáticamente y se volvería a gastar cuota de la IA.
const { handler: generar } = require('./generar-tema.js');

const PROYECTO = process.env.FIREBASE_PROJECT_ID || '';
// Tiempos para la IA (el máximo de la plataforma es 15 minutos). Cada modelo tiene su propio tope: si uno no
// responde, se pasa al siguiente en vez de esperar al mismo hasta agotar todo el tiempo.
// Deben ser menores que lo que espera la página (ESPERA_MAX_IA_MS en src/app/12-efectos-rol-ia.js).
const LIMITE_BACKGROUND_MS = 360000, POR_MODELO_MS = 100000;          // texto: 6 min en total, 100 s por modelo
const LIMITE_PDF_MS = 540000, POR_MODELO_PDF_MS = 180000;             // PDF escaneado: 9 min en total, 3 min por modelo

function tokenDe(event) {
  const h = event.headers || {};
  const m = (h.authorization || h.Authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

const BASE_FS = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/iaJobs/';

// PDF escaneado: el navegador lo deja troceado en iaJobs/{jobId}/entrada/{0..n}; aquí se vuelve a armar.
async function leerEntrada(jobId, token, partes) {
  let b64 = '';
  for (let i = 0; i < partes; i++) {
    const r = await fetch(BASE_FS + jobId + '/entrada/' + i, { headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('No se pudo leer el trozo ' + i + ' del PDF (Firestore ' + r.status + ').');
    const d = await r.json();
    const s = d.fields && d.fields.data && d.fields.data.stringValue;
    if (!s) throw new Error('El trozo ' + i + ' del PDF llegó vacío.');
    b64 += s;
  }
  return b64;
}
async function borrarEntrada(jobId, token, partes) {
  for (let i = 0; i < partes; i++) {
    try { await fetch(BASE_FS + jobId + '/entrada/' + i, { method: 'DELETE', headers: { authorization: 'Bearer ' + token } }); }
    catch (e) { console.error('No se pudo borrar el trozo', i, e); }
  }
}

// Escribe en Firestore con el token de la propia persona (así las reglas de seguridad la protegen).
async function guardar(jobId, token, campos) {
  const mascara = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + k).join('&');
  const fields = {};
  Object.keys(campos).forEach(k => { fields[k] = { stringValue: String(campos[k]) }; });
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO +
    '/databases/(default)/documents/iaJobs/' + jobId + '?' + mascara;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) throw new Error('Firestore respondió ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

exports.handler = async (event) => {
  let jobId = null;
  let token = null;
  let partes = 0;
  try {
    const cuerpo = JSON.parse(event.body || '{}');
    jobId = String(cuerpo.jobId || '');
    token = tokenDe(event);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(jobId) || !token) {
      console.error('Petición sin jobId válido o sin sesión.');
      return;
    }

    // Aviso inmediato de que la función arrancó: así la página sabe que sí llegó y no se queda esperando a ciegas.
    try { await guardar(jobId, token, { estado: 'trabajando' }); } catch (e) { console.error('No se pudo avisar que arrancó (revisa FIREBASE_PROJECT_ID y las reglas de Firestore):', e.message); }

    partes = Number.isInteger(cuerpo.pdfPartes) && cuerpo.pdfPartes >= 1 && cuerpo.pdfPartes <= 20 ? cuerpo.pdfPartes : 0;
    let eventoIA = { ...event, httpMethod: 'POST', _limiteMs: LIMITE_BACKGROUND_MS, _porModeloMs: POR_MODELO_MS };
    if (partes) {
      const pdfBase64 = await leerEntrada(jobId, token, partes);
      eventoIA = { ...eventoIA, body: JSON.stringify({ materia: cuerpo.materia, pdfBase64 }), _limiteMs: LIMITE_PDF_MS, _porModeloMs: POR_MODELO_PDF_MS };
    }
    const r = await generar(eventoIA);
    if (partes) { await borrarEntrada(jobId, token, partes); partes = 0; }

    let datos = null;
    try { datos = JSON.parse(r.body); } catch (e) { /* respuesta sin JSON */ }

    if (r.statusCode === 200 && datos) {
      await guardar(jobId, token, { estado: 'listo', resultado: r.body });
    } else {
      await guardar(jobId, token, {
        estado: 'error',
        mensaje: (datos && datos.error) || ('La IA respondió con el código ' + r.statusCode + '.')
      });
    }
  } catch (err) {
    console.error('Error en la función en segundo plano:', err);
    if (partes && jobId && token) await borrarEntrada(jobId, token, partes);
    try {
      if (jobId && token) await guardar(jobId, token, { estado: 'error', mensaje: 'Error inesperado: ' + err.message });
    } catch (e2) {
      console.error('Tampoco se pudo avisar del error:', e2);
    }
  }
  // Sin "throw" ni valor de retorno útil: en segundo plano nadie lee la respuesta.
};
