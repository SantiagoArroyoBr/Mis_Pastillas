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
| — | — | — | No hay solicitudes registradas | — | — |

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
| — | — | — | — |

## Reglas

1. Aprobar una idea no autoriza cambios fuera del alcance descrito.
2. Una solicitud aprobada para documentación no autoriza modificar código.
3. Una solicitud aprobada para desarrollo no autoriza desplegar a producción.
4. Si cambian los archivos afectados, el alcance o los riesgos, presentar una nueva solicitud o pedir ampliación de autorización.
5. Tras la aprobación, registrar la tarea en [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md).
6. Tras incorporar el cambio, registrar la evidencia y actualizar el estado.
7. No borrar solicitudes rechazadas o canceladas; conservar el historial.
