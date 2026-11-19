/* Auren · aplica el modo claro u oscuro guardado en este dispositivo ANTES de pintar la página, para que no parpadee.
   Si no hay nada guardado, se sigue el del sistema (lo resuelve el CSS con prefers-color-scheme). */
(function () {
  try {
    var t = localStorage.getItem('auren_tema');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
