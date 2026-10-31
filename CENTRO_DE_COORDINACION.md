# Centro de coordinación — Acompaña

> **Antes de utilizar este documento, lee obligatoriamente [REGLAS_GENERALES.md](REGLAS_GENERALES.md).** Sus reglas de seguridad, aprobación y trabajo simultáneo aplican a todas las áreas.
>
> Documentos relacionados: [Solicitudes](SOLICITUDES.md) · [Trabajo activo](TRABAJO_ACTIVO.md) · [Decisiones técnicas](DECISIONES_TECNICAS.md). Al iniciar cualquier tarea, sigue el flujo obligatorio de lectura y registro de la sección 4 de [REGLAS_GENERALES.md](REGLAS_GENERALES.md).

## Propósito

Este documento contiene información compartida y aprobada que las distintas áreas necesitan conocer. No es un historial de conversaciones ni sustituye la documentación técnica específica.

**El propietario del proyecto controla qué aportaciones se incorporan.** Los chats especializados presentan sus propuestas en la conversación; no deben editar este documento directamente sin autorización explícita.

## Datos del proyecto

- Producto: Acompaña — Gestión del cuidado familiar.
- Repositorio: https://github.com/SantiagoArroyoBr/Mis_Pastillas
- Producción: https://pastillas-1.vercel.app/
- Rama de producción: `main`.
- Rama de desarrollo: `development`.
- Commit estable de referencia: `92c4034085e13bb38fd0a7ff2622c46ef797873d`.

## Estado general

- La aplicación parte de una PWA con frontend principalmente monolítico en HTML, CSS y JavaScript.
- El almacenamiento actual es local mediante `localStorage`.
- No se ha confirmado backend centralizado ni sincronización multiusuario.
- La auditoría técnica integral debe marcarse como pendiente hasta que exista un informe completo y verificable.
- La identidad visual está definida como propuesta; su implementación debe comprobarse.
- La evolución hacia Supabase/PostgreSQL/Auth/RLS y sincronización es una alternativa en evaluación, no una implementación confirmada.

## Áreas de trabajo

| Área | Responsabilidad |
|---|---|
| Dirección general | Prioridades, alcance, decisiones e integración entre áreas |
| Auditoría técnica | Estado real del repositorio, riesgos y deuda técnica |
| Arquitectura y planificación | Arquitectura objetivo, dependencias y fases |
| Frontend y diseño | Interfaz, componentes, responsive y accesibilidad |
| Backend y datos | Persistencia, autenticación, permisos y sincronización |
| Funcionalidades | Reglas de negocio y comportamiento de módulos |
| Infraestructura | GitHub, Vercel, PWA y despliegues |
| Documentación y pruebas | Documentación, casos de prueba y regresiones |

## Información compartida aprobada

Agregar aquí únicamente información que el propietario haya aprobado para compartir entre áreas.

| Fecha | Área de origen | Información | Estado / referencia |
|---|---|---|---|
| 2026-10-30 | Dirección general / Arquitectura y planificación | MOD-001 integrada en `development` mediante PR #2; merge commit `327ad8d5a16434095948a84d1ca49a00207f0429`. Extracción literal a `app.js`, sin refactorización; clave `pastillas-v1` preservada. Validaciones 13/13 y comprobaciones Chromium descritas en `SOLICITUDES.md` se realizaron en la rama de tarea, no se repitieron tras el merge. | Integrada; no desplegada |
| 2026-10-30 | Dirección general | COORD-001 establece la lectura de los cinco documentos, la búsqueda de solicitudes/tareas equivalentes y la secuencia solicitud pendiente → aprobación explícita cuando se requiera → tarea registrada antes de editar. Registrar no concede permiso de implementación. | Aprobada e incorporada en `development`; ver `REGLAS_GENERALES.md`, `SOLICITUDES.md`, `TRABAJO_ACTIVO.md` y `DECISIONES_TECNICAS.md` |

| 2026-10-30 | Dirección general | CSS-001 implementada y probada en la rama `task/css-001-external-stylesheet` (SHA `d1d295ad6ac705a20b6338b27bea341a800f8622`; commits `a491cf3`, `773be22`, `f6b1ef8`, `d1d295a`). Archivos de aplicación: `index.html`, `styles.css` y `sw.js`. Pasaron 13/13 pruebas existentes; Chromium verificó caché/offline, navegación, alta ficticia de insumo, exportación JSON y persistencia; comparación visual a 390×844 sin diferencias visibles. La validación visual solo cubre ese tamaño y los flujos enumerados. Integrada en `development` mediante merge normal del PR #1; commit de merge `4d3ee998f7ec94d49fc858d1834c2202489053d6`. No desplegada. | Resultado de tarea; detalles en `SOLICITUDES.md` y `TRABAJO_ACTIVO.md` |
| 2026-10-31 | Dirección general / Arquitectura y planificación | MOD-002 aprobada e implementada en `task/mod-002-independent-utilities`, basada en `development` `d39c054d9a39477b552346241df0b28328b4e1a3`. Se extrajeron `esc`, `parseTimes`, `pos`, `num` y `money`; la utilidad se carga y precarga offline con caché `cuidados-v9`. Suite Chromium 15/15, comparación de resultados, seguridad de `esc`, formulario, MIME y recarga offline con datos ficticios. Sin integración, PR ni despliegue hasta autorización posterior. | Resultado MOD-002; `SOLICITUDES.md`, `TRABAJO_ACTIVO.md`, `DECISIONES_TECNICAS.md` |
| 2026-10-30 | Dirección general / Arquitectura y planificación | Se formalizó como referencia el diagnóstico basado en `fa78806b53f601ce6aa070e75573df065043f4d3`: arquitectura monolítica, dependencias, estado/persistencia, PWA, riesgos, etapas y validación. MOD-001 extrajo literalmente el JavaScript a `app.js`, cambió la caché a `cuidados-v8` y preservó clave/esquema. Suite 13/13; Chromium comprobó MIME, alta ficticia, persistencia y carga offline. Commits `d0f0055` y `e8f9501`. | PR #2 en borrador contra `development`; pendiente revisión e integración; no desplegada. Ver `docs/arquitectura/diagnostico-modularizacion.md`, `SOLICITUDES.md`, `TRABAJO_ACTIVO.md`, `DECISIONES_TECNICAS.md` |

## Dependencias entre áreas

| Dependencia | Área solicitante | Área responsable | Estado |
|---|---|---|---|
| — | — | — | Sin dependencias registradas |

## Riesgos y asuntos transversales

| Riesgo o asunto | Impacto | Responsable | Estado |
|---|---|---|---|
| Protección de datos locales durante futuras migraciones | Alto | Backend / Arquitectura | Abierto |
| Cambios simultáneos en archivos compartidos | Medio/alto | Todas las áreas | Control documental requerido |
| Funcionalidades aún no verificadas mediante auditoría integral | Alto | Auditoría técnica | Pendiente |

## Registro de cambios del centro

| Fecha | Cambio aprobado | Incorporado por |
|---|---|---|
| 2026-10-30 | Creación del sistema documental de coordinación | Dirección general |
| 2026-10-30 | Registro de la aprobación CSS-001 para extracción acotada de CSS y precarga offline | Dirección general |
| 2026-10-30 | Integración de CSS-001 en `development` mediante PR #1; merge `4d3ee998f7ec94d49fc858d1834c2202489053d6`; pruebas reportadas en la rama de tarea | Dirección general |
| 2026-10-30 | Integración de MOD-001 mediante PR #2 en `development`, merge `327ad8d5a16434095948a84d1ca49a00207f0429`; no desplegada | Dirección general |
| 2026-10-30 | Aprobación e incorporación de COORD-001: verificación obligatoria de solicitudes y tareas y flujo de registro previo | Dirección general |
| 2026-10-31 | Registro de aprobación y resultados probados de MOD-002 en rama de tarea; integración y despliegue pendientes de autorización explícita | Dirección general |

## Cómo proponer una aportación

Usar la plantilla de [SOLICITUDES.md](SOLICITUDES.md). Indicar con precisión qué sección se propone modificar y proporcionar el texto sugerido. Esperar aprobación del propietario antes de incorporarlo.
