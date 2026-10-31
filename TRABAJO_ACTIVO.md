# Trabajo activo — Acompaña

> **Lee primero [REGLAS_GENERALES.md](REGLAS_GENERALES.md).** Este registro no sustituye la aprobación del propietario ni crea bloqueos técnicos en Git.
>
> Consulta [SOLICITUDES.md](SOLICITUDES.md) para verificar la autorización y [CENTRO_DE_COORDINACION.md](CENTRO_DE_COORDINACION.md) para información compartida aprobada.

## Objetivo

Dar visibilidad sobre quién (chat o área) está trabajando en cada tarea, qué archivos pretende modificar y qué posibles conflictos existen.

## Registro de tareas

| ID | Área / chat | Tarea | Rama | Archivos previstos | Estado | Inicio | Última actualización |
|---|---|---|---|---|---|---|---|
| BACKEND-001 | Backend y datos | Protección de persistencia inicial, restauración JSON en modo protegido, validación de integridad de migraciones y pruebas de integración en navegador | `development` | `index.html`, `tests/persistence.spec.js`, `package.json` y `package-lock.json` solo si son necesarios; registro: `TRABAJO_ACTIVO.md` | Probada e incorporada en `development`; cierre documental registrado | 2026-10-30 | 2026-10-30 |
| CSS-001 | Frontend y diseño | Extraer el bloque CSS existente a `styles.css` y precargarlo offline con una nueva versión de caché | `task/css-001-external-stylesheet` | `index.html`, `styles.css` (nuevo), `sw.js`; registro: `SOLICITUDES.md`, `CENTRO_DE_COORDINACION.md`, `TRABAJO_ACTIVO.md` | En curso | 2026-10-30 | 2026-10-30 |

## Plantilla para registrar una tarea aprobada

### [ID] — [Nombre de tarea]

- **Área / chat responsable:**
- **Solicitud aprobada:**
- **Objetivo:**
- **Rama de trabajo:**
- **Archivos que puede modificar:**
- **Archivos que debe evitar:**
- **Áreas dependientes:**
- **Criterios de aceptación:**
- **Estado:**
- **Fecha de inicio:**
- **Última actualización:**

## Reglas de asignación de archivos

1. Registrar una tarea solo después de que su alcance haya sido aprobado.
2. Enumerar los archivos concretos que se prevé modificar; evitar asignaciones vagas como “todo el frontend”.
3. No asignar el mismo archivo a dos tareas simultáneas, salvo coordinación explícita.
4. Si una tarea descubre que necesita modificar un archivo asignado a otra, detenerse y solicitar coordinación.
5. Cada chat debe comprobar el estado más reciente de GitHub antes de modificar archivos.
6. No sobrescribir cambios de otra tarea.
7. Al terminar, indicar commit, archivos modificados, pruebas ejecutadas y resultado.
8. Dirección general o el propietario actualiza el estado del registro.

## Conflictos y bloqueos

| Fecha | Archivos / tareas en conflicto | Áreas implicadas | Acción acordada | Estado |
|---|---|---|---|---|
| — | No hay conflictos registrados | — | — | — |

## Historial de tareas cerradas

| ID | Área | Resultado | Commit / referencia | Fecha de cierre |
|---|---|---|---|---|
| BACKEND-001 | Backend y datos | Protección de persistencia, restauración JSON y validación de integridad de migraciones completadas; 13/13 pruebas en Edge. Pruebas con almacenamiento simulado mediante excepciones de `localStorage`; no se probaron fallos físicos del dispositivo. | Implementación en `development`: `6705e34a48014533afa39e06dc48625b3a6f33fe`. Ampliación: `b5db59e`, `cec33bf`, `c4d6982`, `5558b31`, `6705e34` | 2026-10-30 |

## Limitación operativa

Este archivo es un registro manual de coordinación. No bloquea archivos en GitHub ni evita que dos chats hagan commits simultáneamente. Para reducir conflictos:
- Usar ramas de tarea cuando haya trabajo paralelo sobre el mismo repositorio.
- Mantener commits pequeños.
- Revisar diferencias antes de integrar.
- Integrar cambios a `development` de forma controlada.
- No fusionar a `main` sin autorización explícita.
