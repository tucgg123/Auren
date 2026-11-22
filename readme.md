# Auren · versión 2 (profesores, roles y administración)

Esta versión es un proyecto **aparte** de la que ya funciona para los estudiantes: usa su **propio repositorio, su propio sitio de Netlify y su propio proyecto de Firebase**. No toca nada de la versión anterior.

## Qué cambió
- **Tres roles**: estudiante, profesor y admin. El rol vive en Firestore (`usuarios/{uid}`) y solo un admin puede cambiarlo. Las cuentas nuevas nacen como estudiante.
- **Solo profesores suben archivos** y usan la IA (lo exige la pantalla, las reglas de Firestore y la función de Netlify). Los estudiantes no crean materias: entran con código o invitación.
- **Profesor**: semestre y curso al crear la materia; imágenes y videos (enlace) en los temas; comprimir PDF pesados; exámenes dinámicos (cada estudiante recibe un subconjunto distinto del banco) con dificultad y preguntas de opción múltiple, verdadero/falso y completar; Excel con fórmulas y formato.
- **Estudiante**: lector de voz, "Mis apuntes" privados, reloj Pomodoro (25/5 editable), los exámenes del profesor suman a la racha, cronómetro fijo en los exámenes con tiempo. La sección "Estudiar" está arriba de los cortes.
- **Rachas de los estudiantes**: el profesor ve, en la pestaña «🔥 Rachas» de cada materia suya, la racha actual, la mejor racha y los últimos días de estudio de sus estudiantes, y lo descarga en Excel. El admin ve las de todos los estudiantes en Admin → «🔥 Rachas de estudiantes». Cada estudiante publica un resumen pequeño (`rachas/{uid}` y `temarios/{id}/rachas/{uid}`); las reglas de Firestore solo dejan leerlo a su profesor (en sus materias) y a los admin. **Hay que publicar las reglas nuevas de `firestore.rules`.**
- **Admin**: panel para asignar roles y borrar cuentas. Cualquiera puede borrar su propia cuenta desde el Perfil.
- **Inicio con carpetas de semestre**: cada semestre es una carpeta (promedio, materias y apuntes); al abrirla se ve una página del semestre con dos cajones: 1 Materias y 2 Mis apuntes por materia. La dirección es `#/semestre/ID`.
- Logo nuevo.
- **Términos de servicio y privacidad**: páginas `terminos.html` y `privacidad.html`. Al crear una cuenta con correo hay que marcar la casilla; con Google o con una cuenta que ya existía, Auren pide aceptarlos al entrar y no deja seguir sin hacerlo. La versión y la fecha aceptadas se guardan en `usuarios/{uid}` (`terminosVersion`, `terminosAceptados`) y se ven en Perfil → «Términos y privacidad». Si cambias los textos de forma importante, sube la versión en las dos páginas y en `TERMINOS_VERSION` (`src/app/17-terminos.js`): todos tendrán que aceptar de nuevo. **Hay que publicar las reglas nuevas de `firestore.rules`.**
- **Cookies**: Auren no usa cookies de analítica, publicidad ni rastreo; solo guarda en el navegador la sesión, la caché para usarla sin internet y las preferencias, que son necesarias. Por eso no hay banner de cookies (está explicado en `privacidad.html#cookies`). Si algún día se agrega analítica, hay que pedir consentimiento antes de cargarla.

## Puesta en marcha (en este orden)
1. **Repositorio nuevo en GitHub** y sube esta carpeta (sin `node_modules`).
2. **Proyecto de Firebase nuevo** (gratis): Authentication → activa *Google* y *Correo/contraseña*; Firestore Database → créala en modo producción.
3. En *Configuración del proyecto → Tus apps → Web* copia las llaves y pégalas en **`firebase-init.js`** (reemplaza los textos `PEGA_AQUI`).
4. **Firestore → Reglas**: pega el contenido de **`firestore.rules`** y pulsa *Publicar*. (Si quieres otro primer admin, cambia el correo en `auren.config.json` y ejecuta `npm run build`.)
5. **Netlify**: crea un sitio nuevo desde el repositorio nuevo. En *Environment variables* define:
   - `APIKEYGEMINIS`: tu llave de Gemini.
   - `FIREBASE_API_KEY` y `FIREBASE_PROJECT_ID`: los del proyecto nuevo.
   - `FIREBASE_SERVICE_ACCOUNT` *(solo para que el admin borre cuentas de otras personas)*: Firebase → Configuración → Cuentas de servicio → *Generar nueva clave privada* y pega **el JSON completo**. Sin esto todo funciona, pero ese botón avisará que falta configurarlo.
   - `ADMIN_EMAIL` *(opcional, por defecto el de `auren.config.json`)*.
6. En Firebase → Authentication → Configuración → **Dominios autorizados** agrega el dominio del sitio de Netlify.
7. Entra con `santiagoromerov2008@gmail.com` **con el correo verificado** (con Google ya lo está): nace como admin. Desde 🛡️ Admin asignas el rol *Profesor* a quien corresponda.

## Cómo se actualiza el código
El código de la página está repartido por secciones en `src/app/` (`01-base.js`, `02-sesion-avisos-tema.js`, … `14-examenes-estudiante.js`). El build las une en ese orden dentro de una sola función, así que todas comparten sus variables como si fueran un solo archivo. Los estilos están en `src/styles.src.css`.
```
npm install
npm run build        # regenera assets/ (un solo app.*.js y un solo styles.*.css) y actualiza index.html
git add -A && git commit -m "mensaje" && git push
```
Netlify también ejecuta `npm run build` en cada despliegue, así que lo publicado siempre sale de `src/`.

**Correo del primer admin**: está en un solo lugar, `auren.config.json`. `npm run build` lo pone en la página y en `firestore.rules` (luego hay que volver a publicar las reglas en Firebase); las funciones de Netlify lo leen de ahí si no existe la variable `ADMIN_EMAIL`.

## Si la IA da error al subir un archivo
- Si sale "La función de IA no respondió…", la propia página te dice qué falta (por ejemplo `FIREBASE_PROJECT_ID`) o a qué proyecto apunta Netlify. Corrígelo en *Site configuration → Environment variables* y **vuelve a desplegar** (*Deploys → Trigger deploy*): las funciones solo leen las variables al desplegarse.
- Para comprobarlo a mano abre `https://TU-SITIO.netlify.app/.netlify/functions/generar-tema?diagnostico=1`: muestra qué variables existen (sí/no, nunca sus valores) y el proyecto al que apunta.

## Cosas que conviene saber
- El dibujo de circuitos del fondo está en `fondo-circuito.svg` y solo se descarga en pantallas de más de 760 px con los efectos activados; en celulares no se carga.
- Accesibilidad: enlace "Saltar al contenido" para teclado, foco visible en todos los botones y las flashcards se voltean con Enter o Espacio.
- **Pregúntale a la IA**: en cada tema, los estudiantes tienen una pestaña de chat que responde con el contenido de ese tema (función `preguntar-tema`). Tiene un cupo diario por persona en Firestore (`iaChat/{uid}`), que se cambia con la variable `LIMITE_CHAT_DIARIO` (por defecto 15).
- El docente puede dejar un **comentario** en la entrega de cada estudiante (solo lo ve ese estudiante) y publicar **anuncios** para toda la materia (pestaña 📣 Anuncios; llegan como aviso a la campana).
- Flashcards: además de "No la sé" y "La sé" hay "Me costó" (vuelve pronto) y "Fácil" (tarda más en volver).
- El cuaderno de cada estudiante se guarda por partes: lo general en `users/{uid}` y cada materia en `users/{uid}/materias/{id}`. Solo se sube lo que cambió, así estudiar en dos equipos ya no borra lo del otro (salvo que se edite la **misma** materia en ambos a la vez). Las cuentas antiguas se pasan solas al formato nuevo.
- El límite de archivos por hora para la IA se guarda en Firestore (`iaHora/{uid}`), igual que el cupo diario. Se cambia con la variable `LIMITE_IA_HORA` en Netlify (por defecto 30).
- En cada materia, el estudiante tiene un tablero de apuntes tipo post-it (con título) y, dentro de cada tema, una pestaña "Mis apuntes". Ambos son privados.
- Las imágenes de los temas se guardan comprimidas en Firestore (hasta ~700 KB cada una, máximo 12 imágenes o videos por tema). Los videos son enlaces; se incrustan los de YouTube y Vimeo.
- El PDF comprimido pierde el texto seleccionable (la IA siempre lee el original). Es una copia para guardar o descargar.
- Los apuntes de los estudiantes son privados: ni el profesor ni un admin pueden leerlos (las reglas no lo permiten).
- Al borrar una cuenta de estudiante, sus entregas de exámenes quedan en la materia del profesor (registro académico).
- El lector de voz usa las voces del dispositivo; su calidad depende del equipo. No se envía texto a ningún servidor.
- Las notificaciones del Pomodoro suenan/avisan con la app abierta o en segundo plano; con el navegador cerrado no hay aviso (haría falta un servidor de notificaciones push).
- La política de contenido (CSP) ya se aplica (está en `netlify.toml`). Si agregas una librería o servicio de otro dominio, hay que añadir ese dominio a la política o el navegador lo bloqueará.

## Límites de gasto (hay que ponerlos a mano)
El código ya limita a cada persona (archivos por hora y por día, preguntas del chat por día; el cupo se reserva antes de llamar a Gemini, así que mandar muchas peticiones a la vez no lo salta). Pero eso no frena a alguien que cree muchas cuentas. El freno final está en las consolas:
- **Google Cloud / AI Studio (Gemini)**: Billing → Budgets & alerts, un presupuesto mensual con avisos al 50 %, 90 % y 100 %. En APIs & Services → Generative Language API → Quotas, baja las peticiones por minuto y por día a lo que Auren necesita.
- **Firebase**: el mismo presupuesto cubre Firestore y Storage (el proyecto de Firebase es un proyecto de Google Cloud). En Firestore → Usage revisa lecturas y escrituras de vez en cuando.
- **Netlify**: Team settings → Billing → Usage, activa los avisos de uso de funciones y de ancho de banda, y deja apagado el aumento automático de plan si no lo quieres.

## Lo que NO se pudo probar aquí
Se probó con simulaciones del navegador y de la base de datos (cientos de comprobaciones automáticas), pero **no** contra Firebase ni un navegador reales. Hay que confirmar a mano: las reglas de Firestore publicadas, el inicio de sesión y la recarga del rol, la compresión de imágenes y de PDF (dibujan en un canvas real), la voz, el aspecto en celular y escritorio, y el borrado real de cuentas con la cuenta de servicio.
