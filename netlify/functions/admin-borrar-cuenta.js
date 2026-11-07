/* Auren · borrar la cuenta de OTRA persona (solo admin)
   Borrar un usuario de Firebase Authentication y sus datos exige permisos de servidor. Esta función:
     1. comprueba quién llama (token de Firebase) y que sea admin (correo semilla verificado, o rol "admin" en usuarios/{uid});
     2. con la cuenta de servicio (variable FIREBASE_SERVICE_ACCOUNT) borra el usuario de Authentication y sus datos personales.
   Variables de Netlify: FIREBASE_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT (el JSON completo), ADMIN_EMAIL (opcional). */
const crypto = require('crypto');

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';
const PROYECTO = process.env.FIREBASE_PROJECT_ID || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'santiagoromerov2008@gmail.com').toLowerCase();
const json = (statusCode, o) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(o) });
const b64u = x => Buffer.from(x).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const DOCS = () => 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents';

async function verificarUsuario(token) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  if (!r.ok) return null;
  const d = await r.json();
  const u = d.users && d.users[0];
  return u && !u.disabled ? u : null;
}
async function esAdmin(usuario, token) {
  if (String(usuario.email || '').toLowerCase() === ADMIN_EMAIL && usuario.emailVerified === true) return true;
  const r = await fetch(DOCS() + '/usuarios/' + usuario.localId, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) return false;
  const d = await r.json();
  return !!(d.fields && d.fields.rol && d.fields.rol.stringValue === 'admin');
}
async function tokenDeServicio(cuenta) {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64u(JSON.stringify({
    iss: cuenta.client_email, sub: cuenta.client_email, aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
    iat: ahora, exp: ahora + 3000
  }));
  const firma = crypto.createSign('RSA-SHA256').update(cab + '.' + cuerpo).sign(cuenta.private_key);
  const jwt = cab + '.' + cuerpo + '.' + b64u(firma);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt)
  });
  if (!r.ok) throw new Error('No se obtuvo el token de servicio (' + r.status + ')');
  return (await r.json()).access_token;
}
async function borrarDoc(ruta, tok) {
  const r = await fetch(DOCS() + '/' + ruta, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } });
  if (!r.ok && r.status !== 404) throw new Error('No se pudo borrar ' + ruta + ' (' + r.status + ')');
}
async function borrarSubcoleccion(ruta, tok) {
  let n = 0, pagina = '';
  for (let i = 0; i < 50; i++) {                                  // tope de seguridad: 50 páginas
    const r = await fetch(DOCS() + '/' + ruta + '?pageSize=100' + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''), { headers: { authorization: 'Bearer ' + tok } });
    if (r.status === 404) return n;
    if (!r.ok) throw new Error('No se pudo listar ' + ruta + ' (' + r.status + ')');
    const d = await r.json();
    for (const doc of (d.documents || [])) {
      await borrarDoc(doc.name.split('/documents/')[1], tok); n++;
    }
    pagina = d.nextPageToken || '';
    if (!pagina) break;
  }
  return n;
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido.' });
  if (!FIREBASE_API_KEY || !PROYECTO) return json(500, { error: 'Falta configurar FIREBASE_API_KEY y FIREBASE_PROJECT_ID en Netlify.' });
  const cab = (event.headers || {}).authorization || (event.headers || {}).Authorization || '';
  const m = cab.match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { error: 'Debes iniciar sesión.' });
  const token = m[1];

  let usuario;
  try { usuario = await verificarUsuario(token); } catch (e) { return json(503, { error: 'No se pudo verificar tu sesión.' }); }
  if (!usuario) return json(401, { error: 'Sesión no válida. Cierra sesión y vuelve a entrar.' });
  let admin = false;
  try { admin = await esAdmin(usuario, token); } catch (e) { return json(503, { error: 'No se pudo comprobar tu rol.' }); }
  if (!admin) return json(403, { error: 'Solo un administrador puede borrar cuentas.' });

  let uid = '';
  try { uid = String(JSON.parse(event.body || '{}').uid || ''); } catch (e) { return json(400, { error: 'Solicitud no válida.' }); }
  if (!/^[A-Za-z0-9]{10,40}$/.test(uid)) return json(400, { error: 'Identificador de cuenta no válido.' });
  if (uid === usuario.localId) return json(400, { error: 'Para borrar tu propia cuenta usa el botón de tu Perfil.' });

  let cuenta;
  try { cuenta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); } catch (e) { cuenta = null; }
  if (!cuenta || !cuenta.client_email || !cuenta.private_key) {
    return json(501, { error: 'Falta configurar FIREBASE_SERVICE_ACCOUNT en Netlify (el JSON de la cuenta de servicio). Ver LEEME-V2.md.' });
  }
  try {
    const tok = await tokenDeServicio(cuenta);
    const aut = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROYECTO + '/accounts:delete', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ localId: uid })
    });
    if (!aut.ok) {
      const txt = await aut.text();
      if (!/USER_NOT_FOUND/.test(txt)) return json(502, { error: 'Firebase no pudo borrar el acceso de esa cuenta (' + aut.status + ').' });
    }
    const borrados = {
      anotaciones: await borrarSubcoleccion('anotaciones/' + uid + '/items', tok),
      banco: await borrarSubcoleccion('bancoPreguntas/' + uid + '/items', tok)
    };
    await borrarDoc('users/' + uid, tok);
    await borrarDoc('usuarios/' + uid, tok);
    await borrarDoc('iaUso/' + uid, tok);
    return json(200, { ok: true, borrados });
  } catch (e) {
    console.error('Borrado de cuenta:', e);
    return json(502, { error: 'No se pudo completar el borrado: ' + e.message });
  }
};
