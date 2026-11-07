# Auren · versión 2 (profesores, roles y administración)

Esta versión es un proyecto **aparte** de la que ya funciona para los estudiantes: usa su **propio repositorio, su propio sitio de Netlify y su propio proyecto de Firebase**. No toca nada de la versión anterior.

## Qué cambió
- **Tres roles**: estudiante, profesor y admin. El rol vive en Firestore (`usuarios/{uid}`) y solo un admin puede cambiarlo. Las cuentas nuevas nacen como estudiante.
- **Solo profesores suben archivos** y usan la IA (lo exige la pantalla, las reglas de Firestore y la función de Netlify). Los estudiantes no crean materias: entran con código o invitación.
- **Profesor**: semestre y curso al crear la materia; imágenes y videos (enlace) en los temas; comprimir PDF pesados; exámenes dinámicos (cada estudiante recibe un subconjunto distinto del banco) con dificultad y preguntas de opción múltiple, verdadero/falso y completar; Excel con fórmulas y formato.
- **Estudiante**: lector de voz, "Mis apuntes" privados, reloj Pomodoro (25/5 editable), los exámenes del profesor suman a la racha, cronómetro fijo en los exámenes con tiempo. La sección "Estudiar" está arriba de los cortes.
- **Admin**: panel para asignar roles y borrar cuentas. Cualquiera puede borrar su propia cuenta desde el Perfil.
- **Inicio con carpetas de semestre**: cada semestre es una carpeta (promedio, materias y apuntes); al abrirla se ve una página del semestre con dos cajones: 1 Materias y 2 Mis apuntes por materia. La dirección es `#/semestre/ID`.
- Logo nuevo.

## Puesta en marcha (en este orden)
1. **Repositorio nuevo en GitHub** y sube esta carpeta (sin `node_modules`).
2. **Proyecto de Firebase nuevo** (gratis): Authentication → activa *Google* y *Correo/contraseña*; Firestore Database → créala en modo producción.
3. En *Configuración del proyecto → Tus apps → Web* copia las llaves y pégalas en **`firebase-init.js`** (reemplaza los textos `PEGA_AQUI`).
4. **Firestore → Reglas**: pega el contenido de **`firestore.rules`** y pulsa *Publicar*. (Si quieres otro primer admin, cambia el correo en las reglas, en `src/app.src.js` (`ADMIN_SEMILLA`) y en las dos funciones de Netlify.)
5. **Netlify**: crea un sitio nuevo desde el repositorio nuevo. En *Environment variables* define:
   - `APIKEYGEMINIS`: tu llave de Gemini.
   - `FIREBASE_API_KEY` y `FIREBASE_PROJECT_ID`: los del proyecto nuevo.
   - `FIREBASE_SERVICE_ACCOUNT` *(solo para que el admin borre cuentas de otras personas)*: Firebase → Configuración → Cuentas de servicio → *Generar nueva clave privada* y pega **el JSON completo**. Sin esto todo funciona, pero ese botón avisará que falta configurarlo.
   - `ADMIN_EMAIL` *(opcional, por defecto santiagoromerov2008@gmail.com)*.
6. En Firebase → Authentication → Configuración → **Dominios autorizados** agrega el dominio del sitio de Netlify.
7. Entra con `santiagoromerov2008@gmail.com` **con el correo verificado** (con Google ya lo está): nace como admin. Desde 🛡️ Admin asignas el rol *Profesor* a quien corresponda.

## Cómo se actualiza el código
Se edita `src/app.src.js` y `src/styles.src.css`, luego:
```
npm install
npm run build        # regenera assets/ (un solo app.*.js y un solo styles.*.css) y actualiza index.html
git add -A && git commit -m "mensaje" && git push
```
Netlify publica la carpeta tal cual (no ejecuta el build).

## Si la IA da error al subir un archivo
- Si sale "La función de IA no respondió…", la propia página te dice qué falta (por ejemplo `FIREBASE_PROJECT_ID`) o a qué proyecto apunta Netlify. Corrígelo en *Site configuration → Environment variables* y **vuelve a desplegar** (*Deploys → Trigger deploy*): las funciones solo leen las variables al desplegarse.
- Para comprobarlo a mano abre `https://TU-SITIO.netlify.app/.netlify/functions/generar-tema?diagnostico=1`: muestra qué variables existen (sí/no, nunca sus valores) y el proyecto al que apunta.

## Cosas que conviene saber
- En cada materia, el estudiante tiene un tablero de apuntes tipo post-it (con título) y, dentro de cada tema, una pestaña "Mis apuntes". Ambos son privados.
- Las imágenes de los temas se guardan comprimidas en Firestore (hasta ~700 KB cada una, máximo 12 imágenes o videos por tema). Los videos son enlaces; se incrustan los de YouTube y Vimeo.
- El PDF comprimido pierde el texto seleccionable (la IA siempre lee el original). Es una copia para guardar o descargar.
- Los apuntes de los estudiantes son privados: ni el profesor ni un admin pueden leerlos (las reglas no lo permiten).
- Al borrar una cuenta de estudiante, sus entregas de exámenes quedan en la materia del profesor (registro académico).
- El lector de voz usa las voces del dispositivo; su calidad depende del equipo. No se envía texto a ningún servidor.
- Las notificaciones del Pomodoro suenan/avisan con la app abierta o en segundo plano; con el navegador cerrado no hay aviso (haría falta un servidor de notificaciones push).
- La política de contenido (CSP) sigue en modo de solo reporte.

## Lo que NO se pudo probar aquí
Se probó con simulaciones del navegador y de la base de datos (cientos de comprobaciones automáticas), pero **no** contra Firebase ni un navegador reales. Hay que confirmar a mano: las reglas de Firestore publicadas, el inicio de sesión y la recarga del rol, la compresión de imágenes y de PDF (dibujan en un canvas real), la voz, el aspecto en celular y escritorio, y el borrado real de cuentas con la cuenta de servicio.
