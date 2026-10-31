# Guía de instalación y uso de Acompaña

**Alcance:** guía inicial basada en la interfaz y el código revisados en `development`; no sustituye una prueba guiada con usuarios. No contiene datos médicos de ejemplo.

## Abrir e instalar

1. Abre la dirección oficial de la aplicación desde un navegador compatible: https://pastillas-1.vercel.app/.
2. Si el navegador ofrece instalar o agregar la aplicación a la pantalla de inicio, puedes usar esa opción. El nombre del menú cambia según navegador, sistema operativo y versión; si no aparece, abre la aplicación en una pestaña normal. La instalación no sincroniza datos entre dispositivos.
3. Usa el mismo navegador y perfil donde ya guardas los datos. El contenido local de un perfil no se comparte automáticamente con otro navegador, otro perfil ni otro dispositivo.

## Organización básica

- La aplicación inicia con dos fichas locales de personas. Selecciona la ficha correspondiente antes de añadir o editar información; cambiar de ficha cambia el contexto de las vistas.
- En **Inicio** se muestran resúmenes y pendientes derivados de la información capturada.
- En **Medicinas** se administran medicinas e insumos, existencias, consumos, compras y precios según los controles disponibles. Revisa los datos antes de guardar; los avisos de reposición son estimaciones de inventario.
- En **Pagos** se consultan asignaciones, citas y cobertura administrativa según los registros guardados.
- Las notificaciones disponibles dependen de que la aplicación se abra, del navegador y de un permiso previamente concedido. No equivalen a un servicio de alertas que funcione siempre en segundo plano.
- WhatsApp y Calendar se abren como servicios externos cuando se usan sus accesos; la aplicación no sincroniza automáticamente calendarios ni mensajes.

## Respaldar y restaurar

1. Usa la opción de exportar respaldo desde la aplicación y guarda el JSON en una ubicación privada que controles.
2. Conserva una copia original sin editar. No publiques ni envíes el archivo por chats o correo; puede contener información de cuidado.
3. Para restaurarlo, elige el JSON desde la opción de importación y revisa la confirmación. Restaurar reemplaza toda la información local del perfil actual por el contenido del archivo.
4. Si no estás seguro de que el archivo sea correcto, cancela. No uses una importación para combinar datos de dispositivos distintos.

## Privacidad y seguridad local

La información de Acompaña se guarda en el perfil local del navegador mediante `localStorage`. `localStorage` no cifra los datos por sí mismo: una persona con acceso al perfil o código ejecutándose en el mismo origen podría leerlos. En dispositivos compartidos, usa perfiles separados y bloqueo de pantalla; cierra el perfil cuando termines y mantén actualizado el navegador y el sistema operativo.

El respaldo JSON contiene la información de cuidado guardada en la aplicación y tampoco está cifrado por Acompaña. Guárdalo en una ubicación privada que controles, conserva una copia protegida y evita carpetas compartidas, chats, correo o sincronización ajena a tu control. La descarga del respaldo actual antes de restaurar puede ayudarte a recuperar los datos que ya estaban en ese perfil.

Las notificaciones muestran avisos generales; abre la aplicación para consultar los detalles. WhatsApp y Google Calendar son servicios externos: antes de continuar, revisa y edita el mensaje o evento. Solo el contenido que confirmes se abrirá en el servicio seleccionado.

La exportación y restauración sintéticas se probaron en el navegador aislado descrito en DAT-003. Eso no demuestra que un respaldo particular de una familia esté completo ni sustituye una copia custodiada por sus responsables.

## Uso sin conexión y límites

La PWA precarga recursos de la aplicación para uso sin conexión, pero no hay sincronización entre dispositivos ni copia remota confirmada. El navegador puede limitar almacenamiento local; no uses el funcionamiento offline como único respaldo. Si cambias de dispositivo o perfil, restaura únicamente desde un respaldo que controles y hayas verificado.

## Despliegue: evidencia y verificación del propietario

### Configuración comprobada

- El repositorio público es `SantiagoArroyoBr/Mis_Pastillas`. GitHub reporta `main` como su rama predeterminada.
- Los metadatos públicos de GitHub y el README registran `https://pastillas-1.vercel.app/` como homepage/aplicación. Los documentos del proyecto identifican Vercel como proveedor previsto.
- El commit `92c4034085e13bb38fd0a7ff2622c46ef797873d` es la punta observada de la rama Git `main` durante esta revisión. Es un SHA de Git; no es evidencia de que ese commit esté desplegado.
- En el checkout revisado no hay `vercel.json`, `.vercel/project.json`, directorio `.github` ni workflows de GitHub versionados. No hay configuración local que identifique un proyecto Vercel, su rama de producción o el proceso de publicación.

### Verificación comunicada por el propietario

El 2026-10-31, el propietario confirmó haber revisado en Vercel los cinco puntos siguientes y que son correctos:

| Punto | Resultado comunicado | Detalle no compartido |
|---|---|---|
| Proyecto Vercel | Identificado | Nombre/ID y equipo/cuenta no incluidos en esta guía. |
| Repositorio conectado | Conexión correcta | GitHub identifica el repositorio como `SantiagoArroyoBr/Mis_Pastillas`. |
| Rama de producción | Configurada correctamente | El nombre exacto de la rama no fue comunicado; no se infiere de la rama predeterminada de GitHub. |
| Deployment actual | Identificado y funcionando | No se proporcionó su SHA ni la etiqueta técnica exacta de estado. |
| Dominio y reversión | Dominio asignado correctamente; opción de reversión disponible | El dominio público indicado por el repositorio es `https://pastillas-1.vercel.app/`; no se compartieron otros aliases ni detalles de elegibilidad. |

Este registro refleja la confirmación del propietario; Codex no tuvo acceso al panel para comprobarla de forma independiente. El SHA de `main` no se usa como sustituto del SHA de producción.

### Inferencia técnica general

La documentación de Vercel indica que `main` suele ser la rama inicial de producción cuando no existe una sobrescritura, y que cada proyecto puede cambiarla en **Settings → Environments → Production → Branch Tracking** ([conexión Git y rama de producción](https://vercel.com/docs/git)). Para este proyecto, la rama se registra como verificada por el propietario; su nombre exacto no se comunicó.

### Datos no registrados y verificación futura

El equipo/cuenta y nombre o ID del proyecto, SHA del deployment y etiqueta técnica exacta del estado no se registraron aquí. El conector de GitHub no permitió consultar Deployments/Environments y la herramienta de lectura web no abrió la URL pública. No se inició sesión ni se cambió configuración.

La confirmación del propietario cierra esta revisión documental de DOC-002. Para futuras auditorías, la evidencia se puede volver a comprobar en modo de solo lectura en el proyecto correcto de Vercel:

1. En **Settings → Git**, verificar que el repositorio conectado sea `SantiagoArroyoBr/Mis_Pastillas`.
2. En **Settings → Environments → Production → Branch Tracking**, anotar la rama que está configurada. No inferirla del default de GitHub.
3. En **Deployments**, identificar la deployment marcada como actual/current para el dominio de producción; registrar URL/dominio, estado, rama y SHA completo del commit de origen. Vercel describe `Current` como la deployment enlazada al dominio que se sirve actualmente ([promoción y estado de deployments](https://vercel.com/docs/deployments/promoting-a-deployment)).
4. Sin iniciar una nueva deployment, comprobar que el dominio señalado corresponda a esa deployment actual y registrar fecha/hora, estado visible y SHA. Mantener esta revisión libre de datos reales de familias.
5. Confirmar con el responsable del proyecto quién verifica el resultado y quién puede autorizar una reversión. No registrar secretos, variables de entorno ni tokens en documentación.

### Reversión documentada; no ejecutada

La documentación oficial de Vercel describe **Instant Rollback** desde la tarjeta de Production Deployment del proyecto o desde el menú de una deployment anterior. El propietario debe comprobar el dominio afectado y seleccionar una deployment que Vercel permita revertir antes de confirmar. La reversión reasigna el dominio a una deployment existente; no revierte commits de Git ni actualiza variables de entorno. Vercel también indica que tras Instant Rollback se desactiva la asignación automática de dominios para nuevos pushes; para restaurarla hay que deshacer el rollback promoviendo una deployment ([Instant Rollback](https://vercel.com/docs/instant-rollback)).

Este es un procedimiento de referencia, no una autorización para ejecutarlo. El propietario debe confirmar acceso, elegibilidad, impacto de dominios/entorno y pasos vigentes en la cuenta del proyecto. No se ejecutaron rollback, promoción ni despliegue durante esta revisión.

### PREVIEW-001 — declaración de validación manual

El responsable informó el 2026-10-31 que terminó las pruebas manuales del Preview. Se registra como **completada según su declaración**. No se proporcionó el detalle de casos, resultados, navegador, dispositivo, datos ficticios utilizados, instalación u operación offline; por tanto, no se atribuyen resultados específicos a esas pruebas.

Evidencia técnica separada:

- GitHub reportó el estado Vercel **“Deployment has completed”** para el commit `f381219e31e515ba34096446d5c7109d8ae73937`. El check de Vercel “Preview Comments” fue exitoso y enlazó un host de rama Preview.
- URL asociada al Preview: https://pastillas-1-git-development-dinamita20.vercel.app/.
- Al abrir esa URL desde la sesión de revisión, Vercel redirigió a su inicio de sesión. No se inspeccionó la interfaz desplegada ni se intentó eludir la protección.
- El dominio de producción `https://pastillas-1.vercel.app/` respondió y mostró la aplicación durante una lectura en navegador. El SHA exacto que sirve el dominio y la asignación actual de dominios no se pudieron verificar en el panel.
- El último estado local automatizado de VAL-002 fue 25/25 en Edge 156.0.4314.50 con perfil y datos ficticios. Es una prueba local previa, no una ejecución sobre la Preview.

La declaración del responsable cierra PREVIEW-001 como validación manual en el alcance que realizó. La ausencia de matriz/resultados impide atribuir aprobaciones individuales de HTTPS, instalación, manifest, navegación, offline, actualización del service worker, persistencia, JSON, responsive o consola. La configuración de Vercel y la versión actualmente asociada al dominio productivo no fueron comprobadas independientemente desde el panel.

### Revisión de Vercel y publicación de DEV-001 — 2026-10-31

En esta sesión se volvió a comprobar el repositorio GitHub `SantiagoArroyoBr/Mis_Pastillas`. El check combinado de GitHub para `f381219e31e515ba34096446d5c7109d8ae73937` devuelve un estado `Vercel` exitoso con enlace a una deployment de Vercel. Para el commit local DEV-001 `f4070022d6c7b71cb6079fe48da1dc0181eed0b0`, GitHub no devuelve checks porque todavía no está publicado.

La sesión no expone herramientas de lectura del complemento Vercel y el checkout no contiene `.vercel/project.json`; tampoco está disponible el ejecutable `vercel`. Por ello no se pudo confirmar directamente el repositorio conectado en la cuenta de Vercel, rama de producción, generación exclusiva de Preview para `development`, aliases/domino actual, variables, ajustes de protección, SHA/URL/fecha completos del deployment enlazado ni salud de construcción. El estado exitoso de un check del commit anterior no prueba esos ajustes ni autoriza concluir que el nuevo push solo generaría Preview.

Se intentó `git fetch origin` primero dentro del entorno restringido, donde el acceso de escritura a `.git/FETCH_HEAD` fue denegado; después se ejecutó con permiso para actualizar referencias. `origin/development` permaneció en `f381219e31e515ba34096446d5c7109d8ae73937`; `origin/main` permaneció en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. De acuerdo con la condición de la tarea, **no se publicó `development`** al no poderse verificar el entorno Preview frente a Production. No hubo cambios ni despliegue en `main`/producción.

La prueba manual de PREVIEW-001 sigue registrada como declaración del responsable y no se volvió a ejecutar desde un navegador sobre la Preview. La validación automatizada local anterior de DEV-001 fue 26/26 en Edge 156.0.4314.50, con datos ficticios; no se presenta como prueba del deployment. DEV-002 no se validó funcionalmente en Preview.

### Actualización posterior: publicación autorizada — 2026-10-31

Después de la revisión anterior, el responsable autorizó expresamente publicar `development` aunque no estuviera disponible el complemento Vercel. Se publicaron los tres commits pendientes hasta `db944e5d4139cba185cd46aa330793046667db46`. El fetch posterior confirmó `origin/development` en ese SHA y `origin/main` sin cambio en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. GitHub muestra para el nuevo SHA un check `Vercel` en estado `success`, enlazado a [la página de la deployment](https://vercel.com/dinamita20/pastillas-1/4gTCpGCCB9oxn6X4DDYgDmd5TyfZ).

El check de GitHub no expuso URL/target público del deployment ni confirmó su ambiente. Las herramientas disponibles no pudieron abrir el panel, el alias Preview conocido ni el dominio de producción. Por eso no se afirma que la deployment generada sea Preview, no se atribuye validación funcional al Preview y no se confirma qué commit sirve actualmente producción. No se usó acceso alterno ni se cambió configuración. El dominio de producción conocido sigue siendo `https://pastillas-1.vercel.app/`; su contenido no se comprobó en esta revisión.
