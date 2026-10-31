# AUD-011 — Revisión independiente de las correcciones de seguridad y privacidad

**Dictamen original (AUD-011): REQUIERE CORRECCIONES.** La revisión confirmó que AUD-007 dejaba dos riesgos en el service worker. El seguimiento AUD-012, al final de este informe, registra la corrección y las pruebas que cierran esos hallazgos. AUD-010 permanece pendiente.

## 1. Objetivo y alcance

Se contrastaron directamente las correcciones AUD-004–AUD-009 con el código y sus pruebas, se evaluó AUD-010 y se buscaron regresiones de persistencia, restauración, avisos, enlaces externos y comportamiento PWA. Se usaron fixtures sintéticos existentes; no se usaron datos familiares ni se accedió a producción.

La auditoría es estática más la ejecución de la suite local. No es una prueba de penetración, una prueba en dispositivos físicos ni una validación del deployment publicado.

## 2. Verificación inicial

- **Raíz:** `C:\Users\santi\Documents\Mis_Pastillas`
- **Rama:** `development`
- **SHA HEAD:** `23d16139f80dc33c68841baa610fd6c57814f927`
- **Estado inicial:** sin archivos staged; cambios unstaged conocidos de AUD-003 en `ARQUITECTURA.md`, `HISTORIAL_CAMBIOS.md`, `PLAN_DESARROLLO.md`, `README.md`, `app.js`, `docs/GUIA_INSTALACION_USO.md`, `styles.css`, `sw.js`, `tests/persistence.spec.js`; archivo sin seguimiento `docs/auditorias/AUD-003-seguridad-privacidad.md`.
- **Procedencia:** esos cambios corresponden al trabajo AUD-003 de la conversación inmediatamente anterior y coinciden con el historial registrado. No se observaron archivos adicionales ajenos a esa lista al inicio.
- **Avance local:** `development` está 3 commits por delante y 0 por detrás de `origin/development` según los datos locales. No se hizo `fetch` ni otra operación remota.
- **Remoto configurado:** `origin` apunta a `https://github.com/SantiagoArroyoBr/Mis_Pastillas.git` para fetch y push; solo se leyó la configuración local.

## 3. Archivos revisados

Código y pruebas: `app.js`, `sw.js`, `index.html`, `styles.css`, `manifest.json`, `tests/persistence.spec.js`.

Documentación: `README.md`, `PLAN_DESARROLLO.md`, `ARQUITECTURA.md`, `HISTORIAL_CAMBIOS.md`, `docs/GUIA_INSTALACION_USO.md`, `docs/auditorias/AUD-003-seguridad-privacidad.md`, `docs/auditorias/AUD-001-inventario-funcional.md` y `docs/arquitectura/PWA-002-evaluacion-notificaciones-push.md`.

## 4. Revisión de las correcciones

### AUD-004 — Notificaciones

**Comportamiento correcto.** `app.js:963–973` conserva el permiso concedido, la marca diaria `S.last`, el requisito de que existan pendientes y la llamada a la notificación. El cuerpo ahora usa únicamente categorías generales: reposición, pagos de cuidado y citas; no inserta nombres ni detalles. El test de `tests/persistence.spec.js:325–334` sustituye `Notification` y verifica que el cuerpo no contiene el nombre ficticio de paciente ni de medicamento.

El aviso comunica que existen asuntos de cuidado pendientes, pero el texto no identifica a una persona ni un tratamiento. No se encontró una regresión demostrada en su condición diaria de generación.

### AUD-005 — Importación JSON

**Comportamiento correcto con límite definido.** `app.js:84` establece `10*1024*1024`; `app.js:1309–1315` compara `file.size` antes de crear o ejecutar `FileReader`, limpia el control y muestra el límite sin escribir almacenamiento. JSON inválido y error de lectura tienen rutas separadas en `app.js:1316–1329`; la validación y preparación ocurren antes de mostrar el diálogo de restauración.

La suite comprueba rechazo de un archivo de 10 MiB + 1 byte y conservación del valor local (`tests/persistence.spec.js:290–298`), y prueba JSON inválido y restauración válida/cancelada. No hay una prueba del borde exacto de 10 MiB ni del error de `FileReader`; esos casos no cambian el hallazgo porque la rama y el manejo se ven en el código. El límite no elimina el riesgo de presión de memoria por un JSON de hasta 10 MiB.

### AUD-006 — Vista previa y restauración

**Comportamiento correcto, con comprobaciones limitadas a las listas que valida la carga.** `app.js:1267–1307` calcula los conteos después de `prepareMigratedState`; la fecha opcional se muestra solo si el formato y la fecha calendario son válidos. El exportador no agrega `exportedAt`, por lo que los respaldos normales indican que la fecha no está incluida. La vista previa ofrece una exportación del estado actual cuando `persistenceReady` es verdadero. `app.js:1284–1307` conserva una confirmación distinta y actualiza `S` solo después de escribir correctamente.

La suite cubre que la vista previa no escribe, la exportación previa conserva los datos, cancelar no cambia almacenamiento y un fallo de escritura conserva estado/localStorage (`tests/persistence.spec.js:217–278`, `300–324`). Los conteos son longitudes de arreglos aceptados por el validador; no representan una verificación semántica independiente de cada campo descriptivo de cada registro.

### AUD-007 — Service worker

**Requiere correcciones.** La lista explícita reduce la captura de rutas imprevistas, y la suite verifica precarga, exclusión de `/private-data`, lectura offline de `/index.html` y una actualización sintética (`sw.js:2–10, 29–41`; `tests/persistence.spec.js:356–374`). No obstante, la estrategia de activación y la ruta raíz tienen los defectos confirmados AUD-011-01 y AUD-011-02 indicados abajo.

El manifiesto usa `start_url: ./index.html` y `scope: ./` (`manifest.json:5–6`). La raíz `/` sigue siendo la URL pública de la aplicación según el README, pero no aparece en `ASSETS`. No hay un fallback de navegación general. Las rutas estáticas que se añadan en el futuro tampoco estarán disponibles offline hasta agregarlas expresamente a `ASSETS` y `ASSET_URLS`; esta es una restricción de diseño, no una vulnerabilidad por sí sola.

### AUD-008 — WhatsApp y Google Calendar

**Comportamiento correcto en el código; una brecha de cobertura para Calendar.** El clic de compartir crea una vista editable antes de llamar a `window.open` (`app.js:1178–1182, 1231–1252`). Los enlaces de Calendar se interceptan en el listener delegado (`app.js:1254–1261`), y el diálogo permite cambiar título y detalles antes de abrir el URL actualizado. Cancelar solo cierra el diálogo.

El test de WhatsApp parte del botón real y comprueba que el texto editado se codifica en la URL (`tests/persistence.spec.js:336–343`), pero no prueba cancelación. El test de Calendar llama directamente a `externalPreview` (`tests/persistence.spec.js:345–354`): no prueba que un clic en un enlace Calendar real active el listener ni que cancelar mantenga cerrado el servicio. Se registra como mejora de cobertura AUD-011-03; no se encontró defecto de ejecución en el listener.

### AUD-009 — Documentación de privacidad

**Comportamiento correcto.** La guía (`docs/GUIA_INSTALACION_USO.md:27–33`) explica que `localStorage` no cifra, que el perfil o código del mismo origen puede leer los datos y que los respaldos JSON contienen información de cuidado y deben guardarse de forma privada. También aclara que continuar a un proveedor externo comparte el contenido revisado. No promete aislamiento, cifrado ni recuperación garantizada.

## 5. Evaluación de AUD-010 — Nunito

No hay fuente alojada en el repositorio ni archivo OFL local: `index.html:11` aún solicita Nunito a `fonts.googleapis.com`; no existe `@font-face` en `styles.css` ni archivo TTF/WOFF/OFL en el inventario del proyecto. Si el recurso no está disponible offline, las reglas de `styles.css` caen a `system-ui`/`sans-serif`; esto mantiene la lectura, aunque puede variar el aspecto y el ajuste de texto.

La fuente oficial mantiene una metadata verificable que identifica `Nunito[wght].ttf`, el eje de peso 200–1000, el repositorio fuente y `OFL.txt`; el repositorio de Nunito declara SIL Open Font License 1.1. La OFL permite distribuir la fuente con software manteniendo aviso de copyright y licencia. [Metadata oficial en Google Fonts](https://github.com/google/fonts/blob/main/ofl/nunito/METADATA.pb), [licencia oficial de Nunito](https://github.com/googlefonts/nunito/blob/main/OFL.txt). El repositorio fuente figura archivado y de solo lectura desde el 30 de abril de 2026.

La verificación web confirma la ubicación oficial del archivo candidato, pero no se descargó ni verificó el binario localmente: el entorno no pudo resolver `raw.githubusercontent.com`. El repositorio fuente informa que fue archivado y quedó de solo lectura el 30 de abril de 2026 ([repositorio oficial de Nunito](https://github.com/googlefonts/nunito)). Por tanto **AUD-010 queda pendiente**, tal como requiere el criterio si el archivo no puede verificarse e incorporarse con su licencia. Para completarla falta obtener por un canal disponible el archivo variable oficial y `OFL.txt`, comprobar su hash/procedencia contra el repositorio oficial, incluir el aviso y licencia, definir subset/formatos compatibles, añadir `@font-face` y precaché, y comprobar visualmente la interfaz y el uso offline. No se modificó ningún archivo de fuente ni la carga remota.

## 6. Hallazgos clasificados

### AUD-011-01 — Activación elimina cachés ajenas del mismo origen

- **Prioridad:** P2 — media.
- **Clasificación:** defecto confirmado en el alcance de limpieza; el impacto requiere que exista otra caché en ese origen.
- **Ubicación:** `sw.js:18–20`.
- **Evidencia:** se enumeran todas las cachés disponibles (`caches.keys()`) y se borran todas salvo `cuidados-v8`, sin comprobar que el nombre pertenezca a Acompaña.
- **Riesgo e impacto:** activar/actualizar Acompaña puede borrar recursos offline de otro componente o aplicación del mismo origen. La suite actual usa un perfil limpio con una sola aplicación, así que no detecta el efecto sobre otra caché.
- **Recomendación:** usar un prefijo de caché propio de Acompaña y eliminar únicamente versiones obsoletas que cumplan ese prefijo; preservar las demás.
- **Autorización:** requiere una fase de corrección autorizada. No se modificó código en AUD-011.

### AUD-011-02 — La ruta pública `/` no tiene fallback offline

- **Prioridad:** P2 — media.
- **Clasificación:** defecto confirmado por el flujo de solicitudes; no se simuló específicamente la ruta raíz offline.
- **Ubicación:** `sw.js:2–10, 29–41`; `manifest.json:5–6`; URL pública enlazada en `README.md`.
- **Evidencia:** se precachea `./index.html`, que se resuelve como `/index.html`, pero no `/`. El manejador responde únicamente por URLs exactas en `ASSET_URLS`; para `/` retorna sin `respondWith`. Al activar, también se eliminan entradas de la caché actual que no estén en esa lista. La suite prueba offline solo con `/index.html` (`tests/persistence.spec.js:356–374`).
- **Riesgo e impacto:** una persona que acceda a la URL raíz publicada y luego abra/recargue sin conexión puede no recibir la aplicación desde caché. El `start_url` de la PWA usa `/index.html`, por lo que la prueba de instalación cubre esa ruta, no el acceso web raíz.
- **Recomendación:** incluir y mantener el recurso raíz en el caché o implementar un fallback de navegación `/` a `index.html`; probar offline tanto `/` como `/index.html` antes de cerrar el arreglo.
- **Autorización:** requiere una fase de corrección autorizada. No se modificó código en AUD-011.

### AUD-011-03 — Prueba de Calendar no cubre la integración del clic

- **Prioridad:** INFO.
- **Clasificación:** cobertura insuficiente, no defecto confirmado.
- **Ubicación:** `tests/persistence.spec.js:345–354`; listener real en `app.js:1254–1261`.
- **Evidencia:** el test invoca la función de preview directamente y verifica parámetros, pero no hace clic sobre un enlace Calendar renderizado ni verifica cancelación.
- **Riesgo e impacto:** una futura regresión que desconecte el listener podría pasar la prueba actual.
- **Recomendación:** en una fase de pruebas, añadir un caso sintético que active el enlace renderizado, compruebe cancelación sin apertura y verifique que continuar usa exactamente los campos editados.
- **Autorización:** cualquier cambio a tests queda fuera de AUD-011; no se hicieron modificaciones.

### AUD-011-04 — Subconjunto visual de Nunito no verificado localmente

- **Prioridad:** INFO.
- **Clasificación:** limitación de verificación, no defecto confirmado.
- **Ubicación:** `index.html:11`, `styles.css`.
- **Evidencia:** no hay fuente local ni licencia en el árbol. Se confirmó la licencia y ruta oficial en metadata, pero no se pudo descargar el binario en este entorno.
- **Riesgo e impacto:** Acompaña continúa dependiendo de una solicitud a un tercero para mostrar Nunito; offline cae a fuentes del sistema y puede cambiar la composición visual.
- **Recomendación:** mantener AUD-010 pendiente hasta poder verificar binario y licencia, y luego realizar comparación visual y prueba de caché offline.
- **Autorización:** requiere una fase de implementación autorizada; sin descarga o copia de fuente en esta auditoría.

## 7. Persistencia, compatibilidad y regresiones

- `app.js:83` mantiene exactamente `STORAGE_KEY='pastillas-v1'`.
- El diff de AUD-003 no cambia funciones de migración ni agrega campos a las escrituras normales/exportación; `exportedAt` solo se consulta si ya existe en un respaldo entrante. No hay cambio de esquema implementado.
- La ruta de escritura de restauración sigue serializando el candidato, escribiéndolo y solo entonces reemplazando `S`; los fallos mantienen el estado previo según el test existente.
- No se modificaron CRUD de pacientes/medicinas, cálculos de inventario, consumos, citas, pagos ni asignaciones en el diff revisado. No se encontró eliminación de esas funciones.
- La suite pasa, pero cubre principalmente persistencia/restauración y las adiciones AUD-003; no es una regresión funcional integral de cada módulo, todos los navegadores ni instalación física en pantalla de inicio.

## 8. Pruebas ejecutadas

- `node --check app.js` — pasó.
- `node --check sw.js` — pasó.
- `node --check tests/persistence.spec.js` — pasó.
- `node --test tests/persistence.spec.js` — **20/20 pasó**, Chromium headless, perfil temporal y fixtures ficticios. El caso PWA verifica precarga, exclusión de ruta, `/index.html` offline y una actualización sintética del script del service worker.
- `git diff --check` — pasó; Git mostró una advertencia de conversión LF/CRLF para `docs/GUIA_INSTALACION_USO.md`, sin errores de whitespace.

No se modificaron tests. No se probaron la ruta raíz `/` offline ni la eliminación de una caché de otro componente; esos dos hallazgos se derivan de las ramas exactas del código y la cobertura actual no los ejercita. No se probaron dispositivos físicos, la instalación desde el menú del sistema, el deployment, fallos físicos de almacenamiento ni datos reales.

## 9. Riesgos pendientes y recomendaciones

1. Corregir la limpieza de cachés para limitarla a nombres propios de Acompaña.
2. Definir fallback/precache para la URL raíz y comprobar offline en `/` y `/index.html`.
3. Ampliar las pruebas de Calendar con clic/cancelación del enlace real.
4. Mantener AUD-010 pendiente hasta disponer del binario y la licencia oficial localmente; luego comprobar contraste visual y caché offline.
5. Mantener presente que `localStorage` y respaldos JSON no están cifrados por la aplicación.

Las recomendaciones 1 y 2 requieren una fase de corrección de código autorizada, que no forma parte de esta auditoría.

## 10. Dictamen final

**REQUIERE CORRECCIONES.** AUD-004, AUD-005, AUD-006, AUD-008 y AUD-009 muestran correspondencia entre objetivo, código y pruebas relevantes. AUD-007 cumple el filtrado de solicitudes y la suite demuestra offline para `/index.html`, pero incumple el requisito de no borrar cachés ajenas y deja sin respaldo offline la ruta raíz pública. AUD-010 permanece pendiente. Los hallazgos P2 deben atenderse antes de declarar la revisión aprobada.

## 11. Cambios de esta auditoría

Este informe es el único archivo nuevo de AUD-011. Para registrar su existencia y dictamen se actualizan el enlace de `README.md`, la tarea/estado en `PLAN_DESARROLLO.md` y la fila cronológica de `HISTORIAL_CAMBIOS.md`. No se editó código, tests ni documentación arquitectónica durante AUD-011.

## 12. Seguimiento de corrección — AUD-012

El 2026-10-31, AUD-012 corrigió y probó los dos defectos P2 de AUD-011 y cerró la brecha de prueba de Calendar:

- **Cachés:** la caché vigente usa el prefijo exclusivo `acompanha-` (`acompanha-v9`). La activación elimina versiones antiguas con ese prefijo y reconoce únicamente `cuidados-v8` como caché legada de esta aplicación. Las demás cachés del origen se preservan.
- **Compatibilidad de transición:** al instalar `acompanha-v9`, se precargan recursos nuevos antes de activar y retirar `cuidados-v8`; si la precarga falla, la instalación nueva falla y el service worker anterior sigue activo.
- **Offline:** se precargan por separado `./` y `./index.html`; ambos URLs forman parte de la lista estática permitida y reciben fallback de su propia caché. No se amplió el almacenamiento a rutas dinámicas.
- **Calendar:** la prueba usa una cita ficticia renderizada, hace clic en el enlace visible, comprueba la vista previa, cancela sin abrir servicio, vuelve a hacer clic, edita título/detalles y confirma. `window.open` se intercepta, así que no se navega ni se solicita Google Calendar.
- **Pruebas:** `node --test tests/persistence.spec.js` pasó 20/20; incluye cachés legadas/propias/ajenas, navegación offline a `/` y `/index.html`, exclusión de ruta no prevista, Calendar y regresiones previas.

Los hallazgos AUD-011-01 y AUD-011-02 quedan **corregidos y verificados** en este checkout; AUD-011-03 queda **cubierto por la nueva prueba de integración**. El dictamen inicial queda como registro de la revisión antes de AUD-012. No se cambió persistencia, esquema, clave, `main`, ni producción. AUD-010 sigue pendiente.

## 13. Revisión de cierre integral — AUD-003 a AUD-012 (2026-10-31)

La revisión independiente se repitió contra el checkout actual, incluidos `app.js`, `sw.js`, `index.html`, `styles.css`, `manifest.json`, pruebas y documentos centrales. El dictamen inicial `REQUIERE CORRECCIONES` se conserva como registro histórico; con AUD-012, los defectos P2 de caché y ruta raíz quedaron corregidos y ejercitados. AUD-010 queda completada: Nunito variable y su licencia se obtuvieron del repositorio oficial en el commit fijado por la metadata de Google Fonts, se alojan en `fonts/`, se precargan y se verificaron en navegador offline. El test ahora prueba carga tipográfica local y ausencia de recursos de Google Fonts.

### Revisión acotada adicional

- Las inserciones `innerHTML` de vistas interpolan nombres con `esc(...)` en los lugares de datos variables comprobados; títulos/mensajes de importación son constantes internos. No se halló `eval`, `new Function` ni creación dinámica de scripts en `app.js`, `index.html` o `sw.js`.
- Las notificaciones usan título genérico y cuerpo por categorías, sin tag, data ni acciones que incluyan información personal; se conserva el permiso concedido, el requisito de pendientes y la marca diaria.
- Los enlaces externos WhatsApp/Calendar muestran contenido revisable, requieren confirmación expresa y se interceptan en la suite; las pruebas no navegan a los proveedores.
- El SW aplica allowlist exacta a GET estáticos y guarda solo respuestas exitosas `basic`; no cachea rutas no listadas. La instalación usa `addAll`: si falla la precarga, la instalación falla, por lo que la versión previa permanece activa. El test verifica actualización simulada y preservación de cachés ajenas.
- Importación valida antes de escribir, rechaza más de 10 MiB antes de `FileReader`, y restauración requiere confirmación; las pruebas comprueban JSON inválido, cancelación y preservación ante errores. Las escrituras normales/restauración conservan el manejo protegido.
- No se identificaron dependencias externas de scripts; Nunito ya no se solicita a Google Fonts. La aplicación requiere HTTPS en deployment para Service Worker, pero no se inspeccionó el deployment; HTTPS de producción no fue verificado en esta auditoría.

### Riesgos residuales que requieren decisión

`localStorage` bajo `pastillas-v1` carece de cifrado propio y cualquier persona con acceso al perfil desbloqueado, o código ejecutándose en el mismo origen, podría leer o alterar datos personales y de cuidado. Los respaldos JSON son legibles por quien obtenga una copia. Los datos enviados mediante WhatsApp o Google Calendar los recibe el proveedor cuando la persona confirma; el diálogo solo hace visible y editable la información, no cifra ni controla retención posterior. La arquitectura offline no tiene cuentas, autorización, aislamiento entre familiares ni sincronización/backend. El navegador y el sistema operativo protegen el acceso al perfil según sus mecanismos (bloqueo, cuentas, cifrado de disco); Acompaña no añade una capa criptográfica.

Estos puntos no son hallazgos corregidos ni se consideran aceptados por el equipo auditor. Su tratamiento con cifrado, autenticación o cambio estructural requiere decisión independiente y estrategia de compatibilidad/respaldo. Por las instrucciones de alcance, no se alteraron persistencia, esquema ni arquitectura. La etapa puede considerarse **técnicamente completa, pendiente de aceptación de riesgos**; no se declara cierre administrativo.

### Pruebas de cierre

`node --check app.js`, `node --check sw.js` y `node --check tests/persistence.spec.js` pasaron. `node --test tests/persistence.spec.js` pasó **20/20** en Chromium headless con perfil temporal y datos ficticios. Se probó offline en `/` y `/index.html`, carga de Nunito desde caché y ausencia de solicitudes a Google Fonts, actualización simulada del SW, cachés propias/legada/ajena, enlace real renderizado de Calendar, edición y cancelación. El primer intento restringido falló por `EACCES` al loopback y limpieza de perfil temporal; la ejecución repetida con permiso local de loopback pasó 20/20. No se realizaron pruebas contra producción ni dispositivos físicos. `git diff --check` pasó tras la documentación; Git solo avisó conversión futura LF/CRLF en `docs/GUIA_INSTALACION_USO.md`.