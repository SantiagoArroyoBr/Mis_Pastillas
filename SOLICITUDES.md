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
| CSS-001 | 2026-10-30 | Dirección general | Extraer el CSS actual a un archivo externo y precargarlo para uso offline, con actualización de caché | `index.html`, `styles.css` (nuevo), `sw.js` | Probada en rama de tarea; pendiente de incorporación a `development` |

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
| CSS-001 | Aprobada por el propietario en la conversación «Direccion general» | 2026-10-30 | Extraer sin rediseños ni cambios semánticos; modificar únicamente `index.html`, nuevo `styles.css` y `sw.js`. Incluir CSS en la precarga offline y versionar la caché. Excluye JavaScript, datos, `localStorage`, modelo, importación/exportación, manifiesto, otras funciones, integración y despliegue. Rama de tarea derivada de `development`. |

## Evidencia de implementación y validación — CSS-001

- **Estado:** probada en rama de tarea; pendiente de autorización e incorporación a `development`. No está incorporada ni desplegada.
- **Rama y SHA:** `task/css-001-external-stylesheet`, `d1d295ad6ac705a20b6338b27bea341a800f8622`.
- **Commits de la tarea:** `a491cf3` (aprobación), `773be22` (extracción CSS), `f6b1ef8` (validación) y `d1d295a` (comparación visual).
- **Archivos de aplicación:** `index.html`, `styles.css` y `sw.js`.
- **Pruebas y validaciones registradas:** 13/13 pruebas existentes; sintaxis de `sw.js`; Chromium con caché y carga offline del CSS, navegación, alta de un insumo ficticio, exportación JSON y persistencia tras recargar. Las capturas a 390×844 no muestran diferencias visibles.
- **Alcance y limitaciones:** las pruebas del navegador se limitaron a esos flujos y la comparación visual a 390×844; no se afirma cobertura de otros tamaños, navegadores ni pruebas adicionales. No se modificaron JavaScript, datos, `localStorage`, manifiesto ni otras funciones. La integración requiere autorización aparte.

## Reglas

1. Aprobar una idea no autoriza cambios fuera del alcance descrito.
2. Una solicitud aprobada para documentación no autoriza modificar código.
3. Una solicitud aprobada para desarrollo no autoriza desplegar a producción.
4. Si cambian los archivos afectados, el alcance o los riesgos, presentar una nueva solicitud o pedir ampliación de autorización.
5. Tras la aprobación, registrar la tarea en [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md).
6. Tras incorporar el cambio, registrar la evidencia y actualizar el estado.
7. No borrar solicitudes rechazadas o canceladas; conservar el historial.
