# Solicitudes y aprobaciones — Acompaña

> **Lee primero [REGLAS_GENERALES.md](REGLAS_GENERALES.md).** Ninguna propuesta se considera autorizada hasta que el propietario apruebe explícitamente su alcance.
>
> El estado compartido aprobado se consulta en [CENTRO_DE_COORDINACION.md](CENTRO_DE_COORDINACION.md). Las tareas autorizadas se registran en [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md).

## Objetivo

Registrar propuestas de los chats especializados antes de modificar documentación compartida, código, arquitectura, datos o infraestructura.

Los chats presentan sus propuestas al propietario en la conversación. El propietario decide si se aprueban, rechazan o devuelven para corrección. Este archivo se actualiza únicamente después de una autorización explícita.

## Estados

- Pendiente de aprobación.
- Aprobada.
- Requiere cambios.
- Rechazada.
- Incorporada.
- Cancelada.

## Registro de solicitudes

| ID | Fecha | Área / chat | Resumen | Archivos o sistemas afectados | Estado |
|---|---|---|---|---|---|
| CSS-001 | 2026-10-30 | Dirección general | Extraer el CSS actual a un archivo externo y precargarlo para uso offline, con actualización de caché | `index.html`, `styles.css` (nuevo), `sw.js` | Incorporada en `development`; no desplegada |
| MOD-001 | 2026-10-30 | Dirección general / Arquitectura y planificación («Direccion general») | Formalizar el diagnóstico arquitectónico y extraer literalmente el JavaScript en línea de `index.html` a `app.js`; actualizar la carga y precarga offline | `docs/arquitectura/diagnostico-modularizacion.md`, `README.md`, `index.html`, `app.js` (nuevo), `sw.js`, `tests/persistence.spec.js` solo para MIME; documentos de coordinación | Incorporada en `development` mediante PR #2, merge `327ad8d5a16434095948a84d1ca49a00207f0429`; no desplegada
| COORD-001 | 2026-10-30 | Dirección general («Direccion general») | Añadir un flujo obligatorio para comprobar solicitudes equivalentes y registrar nuevas solicitudes/tareas antes de modificar archivos, distinguiendo registro de aprobación | REGLAS_GENERALES.md, CENTRO_DE_COORDINACION.md, SOLICITUDES.md, TRABAJO_ACTIVO.md, DECISIONES_TECNICAS.md | Incorporada en `development`; no despliegue |

## Solicitud aprobada — COORD-001: registro previo de solicitudes y tareas

- **ID:** COORD-001.
- **Fecha:** 2026-10-30.
- **Área / chat de origen:** Dirección general («Direccion general»).
- **Tipo:** documentación / coordinación.
- **Estado:** incorporada en `development`; no despliegue.
- **Objetivo:** evitar bloqueos y trabajo sin autorización mediante una revisión obligatoria de solicitudes y tareas al inicio de cada encargo.
- **Problema que resuelve:** se inició MOD-001 sin que existiera su entrada en TRABAJO_ACTIVO.md de development; el control documental detuvo la integración.
- **Propuesta concreta:** exigir la lectura de los cinco documentos operativos; comprobar entradas equivalentes en SOLICITUDES.md y TRABAJO_ACTIVO.md; evitar duplicados; si no existe solicitud equivalente, registrarla con el formato existente antes de editar archivos; distinguir el registro de una solicitud de su aprobación; esperar aprobación explícita cuando corresponda; registrar una tarea aprobada en TRABAJO_ACTIVO.md antes de editar sus archivos.
- **Archivos afectados:** los cinco documentos de coordinación listados arriba. Sin cambios de código de la aplicación.
- **Rama prevista:** development.
- **Impacto en otras áreas:** aplica a todas las áreas y chats.
- **Dependencias:** autorización del propietario para los cambios documentales; revisión de tareas concurrentes y del estado remoto.
- **Riesgos y reversión:** cambio documental reversible mediante commit revert; no modifica datos ni comportamiento de la aplicación.
- **Pruebas o validaciones necesarias:** comprobar coherencia de referencias, estados, flujo y diferencias; no requiere pruebas de aplicación.
- **Aprobación solicitada / resolución:** el propietario autorizó la integración del PR #2 y la actualización de las reglas en esta conversación. La autorización para COORD-001 cubre documentos de coordinación en `development`; no autoriza `main` ni despliegue.

## Plantilla para presentar una solicitud

### Solicitud: [título breve]

- **ID:** asignado por Dirección general.
- **Fecha:**
- **Área / chat de origen:**
- **Tipo:** documentación / código / arquitectura / datos / infraestructura / pruebas.
- **Estado:** pendiente de aprobación.
- **Objetivo:**
- **Problema que resuelve:**
- **Propuesta concreta:**
- **Archivos, módulos o sistemas afectados:**
- **Rama prevista:**
- **Impacto en otras áreas:**
- **Dependencias:**
- **Riesgos y posibilidad de reversión:**
- **Pruebas o validaciones necesarias:**
- **Aprobación solicitada:** describir exactamente qué se autoriza.

## Registro de resolución

| ID | Resolución | Fecha | Condiciones / alcance aprobado |
|---|---|---|---|
| CSS-001 | Aprobada por el propietario en la conversación «Direccion general» | 2026-10-30 | Extraer sin rediseños ni cambios semánticos; modificar únicamente `index.html`, nuevo `styles.css` y `sw.js`. Incluir CSS en la precarga offline y versionar la caché. Excluye JavaScript, datos, `localStorage`, modelo, importación/exportación, manifiesto, otras funciones fuera de esta integración y despliegue. Rama de tarea derivada de `development`. La integración de CSS-001 en `development` fue autorizada explícitamente por el propietario el 2026-10-30. |
| MOD-001 | Aprobada explícitamente por el propietario en «Direccion general» | 2026-10-30 | Basar el diagnóstico histórico en `fa78806b53f601ce6aa070e75573df065043f4d3`; crear `docs/arquitectura/diagnostico-modularizacion.md`; extraer literalmente el JavaScript inline de `index.html` a `app.js`; modificar `index.html` y `sw.js` para carga/precarga y versión de caché; tocar `tests/persistence.spec.js` solo si el MIME lo requiere. Sin separar más módulos ni refactorizar. Preservar lógica, orden de inicialización, `localStorage` `pastillas-v1`, esquema, migraciones, import/export y PWA offline. Ejecutar pruebas de persistencia/regresión, sintaxis y navegador con datos ficticios. Rama de tarea derivada de `development`; integración a `development` solo si las reglas permiten esta aprobación, sin `main` ni despliegue.
| COORD-001 | Aprobada explícitamente por el propietario en esta conversación | 2026-10-30 | Modificar únicamente los cinco documentos de coordinación en `development` para exigir lectura de reglas, centro, solicitudes, trabajo activo y decisiones; comprobar entradas equivalentes en `SOLICITUDES.md` y `TRABAJO_ACTIVO.md`; registrar ausencias como pendientes de aprobación sin tratar el registro como permiso; confirmar aprobación explícita cuando se requiera; crear/actualizar el registro de tarea aprobada antes de editar sus archivos; detectar y coordinar solapamientos. Sin cambios de aplicación, `main` ni despliegue. |

## Evidencia de implementación y validación — CSS-001

- **Estado:** incorporada en `development`; no desplegada.
- **Rama y SHA:** `task/css-001-external-stylesheet`, `d1d295ad6ac705a20b6338b27bea341a800f8622`.
- **Commits de la tarea:** `a491cf3` (aprobación), `773be22` (extracción CSS), `f6b1ef8` (validación) y `d1d295a` (comparación visual).
- **Archivos de aplicación:** `index.html`, `styles.css` y `sw.js`.
- **Pruebas y validaciones registradas:** 13/13 pruebas existentes; sintaxis de `sw.js`; Chromium con caché y carga offline del CSS, navegación, alta de un insumo ficticio, exportación JSON y persistencia tras recargar. Las capturas a 390×844 no muestran diferencias visibles.
- **Alcance y limitaciones:** las pruebas del navegador se limitaron a esos flujos y la comparación visual a 390×844; no se afirma cobertura de otros tamaños, navegadores ni pruebas adicionales. No se modificaron JavaScript, datos, `localStorage`, manifiesto ni otras funciones. Integrada mediante merge normal del PR #1 en el commit `4d3ee998f7ec94d49fc858d1834c2202489053d6` (base `33970417a190317285867621a20df8a9b4e5d738`, HEAD fuente `bfed26dad9e5075b36e29e839abf4a3e0a00e081`). Las pruebas citadas se ejecutaron en la rama de tarea; no se volvieron a ejecutar después del merge.

## Evidencia de implementación y validación — MOD-001

- **Estado:** implementada y probada en rama de tarea; pendiente PR/revisión e integración; no desplegada.
- **Base y rama:** `development` en `fa78806b53f601ce6aa070e75573df065043f4d3`; `task/mod-001-external-javascript`.
- **Archivos de aplicación/documentación:** `docs/arquitectura/diagnostico-modularizacion.md`, `README.md`, `index.html`, nuevo `app.js`, `sw.js`; `tests/persistence.spec.js` solo para MIME. Coordinación: este archivo, `TRABAJO_ACTIVO.md`, `DECISIONES_TECNICAS.md`, `CENTRO_DE_COORDINACION.md`.
- **Cambios:** traslado literal del único bloque JavaScript inline; carga clásica síncrona después del DOM; `app.js` en precarga y caché `cuidados-v8`; servidor de pruebas configurado con `text/javascript; charset=utf-8`.
- **Pruebas:** `node --check` para `app.js`, `sw.js` y `tests/persistence.spec.js`; suite Chromium 13/13; comprobación temporal adicional en Chromium aprobada para MIME, inicialización, alta ficticia guardada en `pastillas-v1`, precarga de `app.js` y recarga offline con el dato visible; `git diff --check` sin errores.
- **Límites:** el smoke test adicional cubrió el alta de un insumo ficticio y recarga offline; no todo el inventario de funciones, navegadores o tamaños de pantalla. La suite cubre persistencia, fallos simulados, migración y restauración. No se alteraron datos de usuarios.
- **Commits de MOD-001:** `d0f0055` (implementación), `e8f9501` (cierre documental y resultados). PR #2 es borrador contra `development`; su SHA de cabeza refleja la versión final publicada de la rama.
- **Integración y producción:** no se integró a `development`; PR pendiente de revisión conforme a las reglas de aprobación. `main` y producción no se modificaron.

## Reglas

1. Aprobar una idea no autoriza cambios fuera del alcance descrito.
2. Una solicitud aprobada para documentación no autoriza modificar código.
3. Una solicitud aprobada para desarrollo no autoriza desplegar a producción.
4. Si cambian los archivos afectados, el alcance o los riesgos, presentar una nueva solicitud o pedir ampliación de autorización.
5. Si no existe una solicitud equivalente, registrarla con la plantilla y estado «Pendiente de aprobación» antes de editar archivos de la tarea; el registro no autoriza implementar.
6. Tras la aprobación explícita requerida, registrar la tarea y sus archivos en [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md) antes de editarlos; comprobar primero equivalencias y coordinar solapamientos.
7. Tras incorporar el cambio, registrar la evidencia y actualizar el estado.
8. No borrar solicitudes rechazadas o canceladas; conservar el historial.
