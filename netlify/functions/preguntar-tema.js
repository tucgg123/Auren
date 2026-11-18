// Auren · "Pregúntale a la IA" sobre un tema
//
// El estudiante escribe una duda sobre un tema que está estudiando y la IA le responde usando SOLO el contenido
// de ese tema (lo manda el navegador). Lo puede usar cualquier persona con sesión iniciada (no solo profesores),
// con un cupo diario pequeño por persona guardado en Firestore (iaChat/{uid}), igual que el cupo de archivos.
// Cambia el cupo con la variable de entorno LIMITE_CHAT_DIARIO en Netlify (por defecto 15 preguntas al día).
const { util } = require('./generar-tema.js');
const { llamarGemini, verificarUsuario, tokenDe, json } = util;

const PROYECTO = process.env.FIREBASE_PROJECT_ID || '';
const LIMITE_CHAT = Number(process.env.LIMITE_CHAT_DIARIO) || 15;
const LIMITE_MS = 25000;
const MAX_TEMA = 30000, MAX_PREGUNTA = 500, MAX_HISTORIAL = 6, MAX_MSG = 1200;
const diaColombia = () => Math.floor((Date.now() - 5 * 3600 * 1000) / 86400000);
const urlChat = uid => 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents/iaChat/' + uid;

async function leerCupo(uid, token) {
  const r = await fetch(urlChat(uid), { headers: { authorization: 'Bearer ' + token } });
  if (r.status === 404) return 0;
  if (!r.ok) throw new Error('Firestore respondió ' + r.status);
  const f = (await r.json()).fields || {};
  return Number(f.dia && f.dia.integerValue) === diaColombia() ? (Number(f.n && f.n.integerValue) || 0) : 0;
}
async function sumarCupo(uid, token, n) {
  const r = await fetch(urlChat(uid), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ fields: { dia: { integerValue: String(diaColombia()) }, n: { integerValue: String(n + 1) } } })
  });
  if (!r.ok) throw new Error('Firestore respondió ' + r.status);
}

const ESQUEMA = { type: 'OBJECT', properties: { respuesta: { type: 'STRING' } }, required: ['respuesta'] };
const corta = (v, n) => String(v == null ? '' : v).slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  if (!PROYECTO || !process.env.FIREBASE_API_KEY) return json(500, { error: 'Falta configurar FIREBASE_API_KEY y FIREBASE_PROJECT_ID en Netlify.' });
  const apiKey = process.env.APIKEYGEMINIS;
  if (!apiKey) return json(500, { error: 'Falta configurar APIKEYGEMINIS en Netlify.' });

  const usuario = await verificarUsuario(event);
  if (!usuario) return json(401, { error: 'Debes iniciar sesión para preguntarle a la IA.' });
  const token = tokenDe(event);

  let titulo, texto, pregunta, historial;
  try {
    const b = JSON.parse(event.body || '{}');
    titulo = corta(b.titulo, 200).trim();
    texto = corta(b.texto, MAX_TEMA).trim();
    pregunta = corta(b.pregunta, MAX_PREGUNTA).trim();
    historial = (Array.isArray(b.historial) ? b.historial : []).slice(-MAX_HISTORIAL)
      .filter(m => m && (m.r === 'u' || m.r === 'ia'))
      .map(m => ({ r: m.r, t: corta(m.t, MAX_MSG).trim() })).filter(m => m.t);
  } catch (e) { return json(400, { error: 'Cuerpo de la petición inválido.' }); }
  if (!pregunta) return json(400, { error: 'Escribe tu pregunta.' });
  if (!texto) return json(400, { error: 'Este tema no tiene contenido para responder preguntas.' });

  let usados;
  try { usados = await leerCupo(usuario.localId, token); }
  catch (e) {
    console.error('No se pudo leer el cupo del chat:', e);
    return json(503, { error: 'No se pudo comprobar tu cupo de preguntas. Si administras la página, revisa que las reglas de Firestore (iaChat) estén publicadas.' });
  }
  if (usados >= LIMITE_CHAT) {
    return json(429, { error: 'Ya hiciste tus ' + LIMITE_CHAT + ' preguntas de hoy. El cupo se renueva a la medianoche (hora de Colombia).', cupo: { usados, limite: LIMITE_CHAT, restantes: 0 } });
  }

  const conversacion = historial.map(m => (m.r === 'u' ? 'ESTUDIANTE: ' : 'TUTOR: ') + m.t).join('\n');
  const prompt = `Eres un tutor universitario paciente que ayuda a un estudiante a entender un tema. Respondes en español, en texto plano (sin asteriscos ni markdown), con frases claras y cortas.

REGLAS:
- Usa como fuente el CONTENIDO DEL TEMA de abajo. Si la respuesta no está ahí, dilo con honestidad ("Esto no aparece en el tema") y, si puedes, da una orientación general breve dejando claro que no viene del material.
- Responde lo que se pregunta, en máximo 150 palabras. Si piden un ejemplo, da uno concreto. Si piden explicarlo de otra forma, usa una analogía sencilla.
- Si la pregunta no tiene nada que ver con el tema o con estudiar, redirige amablemente al tema.
- No hagas tareas ni exámenes completos por el estudiante: explica el razonamiento para que lo pueda hacer solo.

TEMA: "${titulo || 'sin título'}"
CONTENIDO DEL TEMA:
"""
${texto}
"""
${conversacion ? '\nCONVERSACIÓN HASTA AHORA:\n' + conversacion + '\n' : ''}
NUEVA PREGUNTA DEL ESTUDIANTE: ${pregunta}

Devuelve EXCLUSIVAMENTE un JSON: {"respuesta":"tu respuesta"}`;

  try {
    const resp = await llamarGemini(apiKey, prompt, LIMITE_MS, null, { esquema: ESQUEMA, maxTokens: 1024, temperatura: 0.5 });
    if (!resp || !resp.ok) {
      if (resp && resp.status === 429) return json(429, { error: 'La IA está ocupada ahora mismo. Espera un minuto y vuelve a preguntar.' });
      return json(502, { error: 'La IA respondió con un error. Inténtalo de nuevo.' });
    }
    const data = await resp.json();
    const c = data.candidates && data.candidates[0];
    const raw = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || '').join('').trim() : '';
    let respuesta = '';
    try { respuesta = String(JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')).respuesta || ''); }
    catch (e) { respuesta = raw; }
    respuesta = respuesta.replace(/\*\*/g, '').trim().slice(0, 3000);
    if (!respuesta) return json(502, { error: 'La IA no devolvió una respuesta. Prueba a preguntar de otra forma.' });

    let n = usados;
    try { await sumarCupo(usuario.localId, token, usados); n = usados + 1; }
    catch (e) { console.error('No se pudo registrar el uso del chat:', e); }
    return json(200, { respuesta, cupo: { usados: n, limite: LIMITE_CHAT, restantes: Math.max(0, LIMITE_CHAT - n) } });
  } catch (err) {
    if (err.message === 'TIMEOUT') return json(504, { error: 'La IA tardó demasiado. Inténtalo de nuevo.' });
    console.error('Error inesperado en el chat:', err);
    return json(500, { error: 'Error inesperado: ' + err.message });
  }
};
