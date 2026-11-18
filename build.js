/* Auren · build
   1. Une las partes de src/app/ (en orden por nombre: 01-…, 02-…) dentro de una sola función, como era antes
      src/app.src.js, y la minifica. También minifica src/styles.src.css.
   2. Les pone un hash en el nombre (así el navegador los guarda en caché "para siempre" y se actualizan solos
      cuando cambian) y apunta index.html a los archivos nuevos.
   3. Pone el correo del primer admin (auren.config.json → adminEmail) en el código y en firestore.rules,
      para que esté escrito en un solo lugar.

   Uso:  npm install   y luego   npm run build      (Netlify lo ejecuta solo en cada despliegue)
   Si esbuild no está disponible, no hace nada y se quedan los archivos que ya están en assets/. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let esbuild;
try { esbuild = require('esbuild'); }
catch (e) { console.warn('[build] esbuild no está instalado: se usan los archivos que ya están en assets/.'); process.exit(0); }

const raiz = __dirname, assets = path.join(raiz, 'assets');
fs.mkdirSync(assets, { recursive: true });
const hash = txt => crypto.createHash('sha256').update(txt).digest('hex').slice(0, 8);

const config = JSON.parse(fs.readFileSync(path.join(raiz, 'auren.config.json'), 'utf8'));
const adminEmail = String(config.adminEmail || '').trim().toLowerCase();
if (!/^[^@\s'"]+@[^@\s'"]+$/.test(adminEmail)) { console.error('[build] auren.config.json: adminEmail no es un correo válido.'); process.exit(1); }

function escribir(fuente, min, prefijo, ext) {
  const nombre = prefijo + '.' + hash(min) + '.' + ext;
  for (const f of fs.readdirSync(assets)) {
    if (f.startsWith(prefijo + '.') && f.endsWith('.' + ext) && f !== nombre) fs.unlinkSync(path.join(assets, f));
  }
  fs.writeFileSync(path.join(assets, nombre), min);
  console.log('[build]', nombre, (fuente.length / 1024).toFixed(0) + ' KB →', (min.length / 1024).toFixed(0) + ' KB');
  return nombre;
}

// JavaScript: las partes van dentro de una sola función para que compartan variables sin volverse globales
const dirApp = path.join(raiz, 'src', 'app');
const partes = fs.readdirSync(dirApp).filter(f => f.endsWith('.js')).sort();
const fuenteJs = '/*! Hecho por Sebastián Poveda y Santiago Romero. 2026 — Auren · lógica principal */\n(()=>{\n'
  + partes.map(f => '/* ---- ' + f + ' ---- */\n' + fs.readFileSync(path.join(dirApp, f), 'utf8')).join('')
  + '})();\n';
const minJs = esbuild.transformSync(fuenteJs, {
  loader: 'js', minify: true, legalComments: 'inline',
  define: { __ADMIN_EMAIL__: JSON.stringify(adminEmail) }
}).code;
const js = escribir(fuenteJs, minJs, 'app', 'js');

const fuenteCss = fs.readFileSync(path.join(raiz, 'src', 'styles.src.css'), 'utf8');
const css = escribir(fuenteCss, esbuild.transformSync(fuenteCss, { loader: 'css', minify: true, legalComments: 'inline' }).code, 'styles', 'css');

const ruta = path.join(raiz, 'index.html');
let html = fs.readFileSync(ruta, 'utf8');
html = html.replace(/assets\/app\.[0-9a-f]{8}\.js/, 'assets/' + js).replace(/assets\/styles\.[0-9a-f]{8}\.css/, 'assets/' + css);
fs.writeFileSync(ruta, html);

// Reglas de Firestore: el correo del primer admin sale de auren.config.json
const rutaReglas = path.join(raiz, 'firestore.rules');
const reglas = fs.readFileSync(rutaReglas, 'utf8');
const nuevas = reglas.replace(/(request\.auth\.token\.get\('email', ''\) == ')[^']*(')/, '$1' + adminEmail + '$2');
if (nuevas !== reglas) { fs.writeFileSync(rutaReglas, nuevas); console.log('[build] firestore.rules: correo del admin actualizado (publícalas de nuevo en Firebase).'); }
