/* Auren · aplica el modo claro u oscuro y los colores personalizados guardados en este dispositivo ANTES de pintar
   la página, para que no parpadee. Si no hay modo guardado, se sigue el del sistema (lo resuelve el CSS con
   prefers-color-scheme). La app usa también window.aurenColores para aplicar los colores al cambiarlos. */
(function () {
  var html = document.documentElement;
  try {
    var t = localStorage.getItem('auren_tema');
    if (t === 'light' || t === 'dark') html.setAttribute('data-theme', t);
  } catch (e) {}

  var HEX = /^#[0-9a-f]{6}$/i;
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function mezcla(a, b, p) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * p; }); }
  function lum(c) {
    var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contraste(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /* Acerca el color hacia blanco (modo oscuro) o negro (modo claro) hasta que se lea bien sobre el fondo.
     En oscuro se pide más contraste para que quede en tono pastel, como el acento original. */
  function legible(c, fondo, oscuro, min) {
    var meta = oscuro ? [255, 255, 255] : [0, 0, 0], p = 0, r = c;
    while (contraste(r, fondo) < min && p < 0.9) { p += 0.05; r = mezcla(c, meta, p); }
    return r;
  }
  function modoOscuro() {
    var t = html.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t === 'dark';
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  var VARS = ['--a', '--al', '--glow', '--on', '--bg', '--ubg'];

  /* colores = { acento: '#rrggbb' | null, fondo: { claro: '#rrggbb', oscuro: '#rrggbb' } | null } */
  function aplicar(colores) {
    var s = html.style, osc = modoOscuro();
    VARS.forEach(function (v) { s.removeProperty(v); });
    html.removeAttribute('data-acc'); html.removeAttribute('data-bgc');
    colores = colores || {};
    var fondoBase = osc ? [11, 18, 32] : [255, 255, 255];
    var f = colores.fondo && colores.fondo[osc ? 'oscuro' : 'claro'];
    if (f && HEX.test(f)) {
      fondoBase = rgb(f);
      s.setProperty('--bg', f); s.setProperty('--ubg', f);
      html.setAttribute('data-bgc', '');
    }
    if (colores.acento && HEX.test(colores.acento)) {
      var a = legible(rgb(colores.acento), fondoBase, osc, osc ? 6.5 : 3.5), ac = hex(a), r = a.map(Math.round).join(',');
      s.setProperty('--a', ac);
      s.setProperty('--al', 'rgba(' + r + ',' + (osc ? '.14' : '.1') + ')');
      s.setProperty('--glow', 'rgba(' + r + ',' + (osc ? '.18' : '.14') + ')');
      s.setProperty('--on', contraste(a, [255, 255, 255]) >= 3 ? '#ffffff' : '#14100e');
      html.setAttribute('data-acc', '');
    }
  }
  function guardados() {
    try { return JSON.parse(localStorage.getItem('auren_colores') || 'null'); } catch (e) { return null; }
  }
  window.aurenColores = { aplicar: aplicar, guardados: guardados, contraste: function (a, b) { return contraste(rgb(a), rgb(b)); } };
  try { aplicar(guardados()); } catch (e) {}
})();
