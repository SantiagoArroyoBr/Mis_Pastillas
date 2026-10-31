# Plan de desarrollo — Acompaña

Este documento es la fuente única de verdad para tareas, objetivos, prioridades, dependencias y estados. El usuario define prioridades. Las tareas ordinarias se desglosan y ejecutan dentro del plan, con cambios pequeños y verificables.

## Estados

- **Pendiente:** aún no iniciada.
- **En curso:** trabajo iniciado.
- **Completada:** criterios cumplidos y resultado documentado.
- **Bloqueada:** no puede avanzar por una dependencia o impedimento identificado.
- **Descartada:** se decidió no realizarla; conservar el motivo.

## Criterios técnicos permanentes

- Mantener compatibilidad con `localStorage` y la clave `pastillas-v1`, los datos ya guardados y el formato vigente.
- Preservar exportación y restauración JSON, la PWA instalable y el comportamiento offline.
- Una tarea que afecte persistencia, estructura de datos, migraciones o flujos JSON debe incluir una estrategia compatible de respaldo, restauración, recuperación y validación antes de cambiar el código.
- No eliminar funciones o datos existentes como efecto colateral. Usar datos ficticios en pruebas; no compartir información médica real.
- Revisar la rama, el estado Git, la versión remota y el alcance afectado antes de editar. Registrar en el historial pruebas realmente ejecutadas y limitaciones.
- Trabajar en `development`. No modificar `main` ni desplegar a producción como parte del trabajo ordinario.

## Tareas

| ID | Objetivo | Prioridad | Dependencias | Estado | Criterio de término |
|---|---|---|---|---|---|
| DOC-001 | Sustituir la coordinación documental por los cuatro documentos centrales y verificar sus enlaces y consistencia. | Definida por el usuario | Ninguna | Completada | Los cuatro documentos están en `development`, la historia útil fue trasladada y los cinco procedimientos anteriores fueron retirados. |
| AUD-001 | Inventariar las funciones realmente implementadas y sus reglas en el código y pruebas. | Definida por el usuario | Ninguna | Pendiente | Inventario contrastado con el código, con hechos, faltantes y límites de validación claramente separados. |
| DAT-001 | Diseñar el modelo relacional y las reglas de acceso para familias, cuentas, pacientes y registros de cuidado. | Definida por el usuario | AUD-001 | Pendiente | Modelo, relaciones, permisos, riesgos y estrategia de migración documentados; sin migrar datos. |
| DAT-002 | Evaluar backend, autenticación, autorización y aislamiento por familia. | Definida por el usuario | DAT-001 | Pendiente | Decisión sustentada en requisitos, seguridad, costos y mantenimiento; RLS y permisos probados si se implementan. |
| DAT-003 | Diseñar migración progresiva de datos locales y operación entre dispositivos. | Definida por el usuario | AUD-001, DAT-001, DAT-002 | Pendiente | Respaldo JSON exportado, restauración probada, compatibilidad y recuperación definidas antes de cualquier migración. |
| PWA-001 | Evaluar almacenamiento local ampliado y sincronización offline segura. | Definida por el usuario | AUD-001, DAT-001, DAT-002, DAT-003 | Pendiente | Estrategia para colas, reintentos, idempotencia y conflictos documentada y validada sin pérdida ni duplicación de inventario. |
| DAT-004 | Evaluar historial administrativo con trazabilidad y permisos adecuados. | Definida por el usuario | DAT-001, DAT-002 | Pendiente | Campos, actores, retención y acceso documentados y probados si se implementan. |
| PWA-002 | Evaluar notificaciones push de reposición. | Definida por el usuario | AUD-001, DAT-002, PWA-001 | Pendiente | Capacidades del navegador, permisos, backend, duplicados, límites y costos documentados y validados. |
| CAL-001 | Consolidar estrategia de pruebas de respaldo, restauración e aislamiento entre familias, si se adopta backend multi-familia. | Definida por el usuario | DAT-002, DAT-003 | Pendiente | Escenarios de recuperación e intentos de acceso cruzado comprobados con datos ficticios. |
| DOC-002 | Preparar guías de instalación, uso y despliegue conforme a la arquitectura finalmente vigente. | Definida por el usuario | AUD-001, decisión de arquitectura aplicable | Pendiente | Guías verificadas contra la aplicación y procesos reales. |

Las tareas pendientes describen trabajo futuro registrado; no significan que una tecnología o función propuesta ya esté decidida o implementada. El usuario puede cambiar sus prioridades actualizando esta tabla.

## Cierre de DOC-001

La reorganización documental quedó terminada el 2026-10-31 en `development`. Se conservaron los antecedentes técnicos comprobables y se retiraron los procedimientos duplicados. El detalle, los archivos, las comprobaciones y el commit están en [HISTORIAL_CAMBIOS.md](HISTORIAL_CAMBIOS.md).
