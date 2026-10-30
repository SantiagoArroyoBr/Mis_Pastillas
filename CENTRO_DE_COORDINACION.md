# Centro de coordinación — Acompaña

> **Antes de utilizar este documento, lee obligatoriamente [REGLAS_GENERALES.md](REGLAS_GENERALES.md).** Sus reglas de seguridad, aprobación y trabajo simultáneo aplican a todas las áreas.
>
> Documentos relacionados: [Solicitudes](SOLICITUDES.md) · [Trabajo activo](TRABAJO_ACTIVO.md) · [Decisiones técnicas](DECISIONES_TECNICAS.md).

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
| — | — | Aún no hay aportaciones registradas | — |

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

## Cómo proponer una aportación

Usar la plantilla de [SOLICITUDES.md](SOLICITUDES.md). Indicar con precisión qué sección se propone modificar y proporcionar el texto sugerido. Esperar aprobación del propietario antes de incorporarlo.
