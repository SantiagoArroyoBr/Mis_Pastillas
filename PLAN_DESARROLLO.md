# Plan de desarrollo — Acompaña

Este documento es la fuente única de verdad para tareas, objetivos, prioridades, dependencias y estados. Las prioridades pendientes de esta tabla son una **propuesta técnica ordenada**, basada en dependencias, protección de datos y secuencia de trabajo; no representan prioridades elegidas por el usuario. Se pueden revisar y ajustar. Las tareas ordinarias se desglosan y ejecutan dentro del plan, con cambios pequeños y verificables.

### Escala de prioridad propuesta

- **P1 — Siguiente:** desbloquea decisiones posteriores o reduce riesgos centrales de datos y arquitectura.
- **P2 — Alta:** necesaria para diseñar o validar con seguridad una decisión de P1.
- **P3 — Media:** depende de decisiones previas y prepara una implementación posterior.
- **P4 — Posterior:** documentación o evaluación que conviene hacer cuando la arquitectura esté aclarada.
- **— (completada):** prioridad no aplicable a un trabajo ya integrado.

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
| DOC-001 | Sustituir la coordinación documental por los cuatro documentos centrales y verificar sus enlaces y consistencia. | — (completada) | Ninguna | Completada | Los cuatro documentos están en `development`, la historia útil fue trasladada y los cinco procedimientos anteriores fueron retirados. |
| BACKEND-001 | Reforzar persistencia local, restauración JSON protegida e integridad de migraciones. | — (completada) | Ninguna | Completada | Integrada en `development`; commit de implementación `6705e34a48014533afa39e06dc48625b3a6f33fe`. No implica despliegue en producción. |
| CSS-001 | Extraer los estilos a una hoja externa y mantener su precarga offline. | — (completada) | Ninguna | Completada | Integrada en `development` por merge `4d3ee998f7ec94d49fc858d1834c2202489053d6`. No implica despliegue en producción. |
| MOD-001 | Extraer el JavaScript embebido a `app.js` y mantener la precarga offline. | — (completada) | Ninguna | Completada | Integrada en `development` por merge `327ad8d5a16434095948a84d1ca49a00207f0429`. No implica despliegue en producción. |
| AUD-002 | Aplicar las cuatro mejoras de la auditoría: ordenar prioridades propuestas, evaluar protección de `main`, registrar integraciones y documentar las pruebas de persistencia. | — (completada) | Ninguna | Completada | Cambios documentales y comprobaciones registrados en [HISTORIAL_CAMBIOS.md](HISTORIAL_CAMBIOS.md); la protección queda como limitación de permisos de la integración, con instrucciones al propietario. |
| AUD-001 | Inventariar las funciones realmente implementadas y sus reglas en el código y pruebas. | — (completada) | Ninguna | Completada | Inventario contrastado con el código, con hechos, faltantes y límites de validación claramente separados; ver [inventario AUD-001](docs/auditorias/AUD-001-inventario-funcional.md) y [registro](HISTORIAL_CAMBIOS.md). |
| DAT-001 | Diseñar el modelo relacional y las reglas de acceso para familias, cuentas, pacientes y registros de cuidado. | — (completada) | AUD-001 | Completada | Propuesta, relaciones, permisos, aislamiento, riesgos, compatibilidad y estrategia de migración documentados sin cambiar código ni datos; ver [diseño DAT-001](docs/arquitectura/DAT-001-modelo-datos-y-acceso.md) y [registro](HISTORIAL_CAMBIOS.md). |
| DAT-002 | Evaluar backend, autenticación, autorización y aislamiento por familia. | **P2 — Alta** | DAT-001 | Pendiente | Decisión sustentada en requisitos, seguridad, costos y mantenimiento; RLS y permisos probados si se implementan. |
| DAT-003 | Diseñar migración progresiva de datos locales y operación entre dispositivos. | **P2 — Alta** | AUD-001, DAT-001, DAT-002 | Pendiente | Respaldo JSON exportado, restauración probada, compatibilidad y recuperación definidas antes de cualquier migración. |
| CAL-001 | Consolidar estrategia de pruebas de respaldo, restauración e aislamiento entre familias, si se adopta backend multi-familia. | **P2 — Alta** | DAT-002, DAT-003 | Pendiente | Escenarios de recuperación e intentos de acceso cruzado comprobados con datos ficticios. |
| PWA-001 | Evaluar almacenamiento local ampliado y sincronización offline segura. | **P3 — Media** | AUD-001, DAT-001, DAT-002, DAT-003 | Pendiente | Estrategia para colas, reintentos, idempotencia y conflictos documentada y validada sin pérdida ni duplicación de inventario. |
| DAT-004 | Evaluar historial administrativo con trazabilidad y permisos adecuados. | **P3 — Media** | DAT-001, DAT-002 | Pendiente | Campos, actores, retención y acceso documentados y probados si se implementan. |
| PWA-002 | Evaluar notificaciones push de reposición. | **P3 — Media** | AUD-001, DAT-002, PWA-001 | Pendiente | Capacidades del navegador, permisos, backend, duplicados, límites y costos documentados y validados. |
| DOC-002 | Preparar guías de instalación, uso y despliegue conforme a la arquitectura finalmente vigente. | **P4 — Posterior** | AUD-001, decisión de arquitectura aplicable | Pendiente | Guías verificadas contra la aplicación y procesos reales. |

Las tareas pendientes describen trabajo futuro registrado; no significan que una tecnología o función propuesta ya esté decidida o implementada. La secuencia P1–P4 es una propuesta técnica revisable, no una decisión atribuida al usuario. DAT-001 documenta una opción arquitectónica y deja explícitas las decisiones de producto abiertas; no adopta Supabase ni autoriza implementación o migración. DAT-002 es la siguiente evaluación propuesta y depende del diseño DAT-001. Los trabajos completados constan aquí para trazabilidad; su integración en `development` no equivale a publicación en producción. El usuario puede cambiar las prioridades actualizando esta tabla.

## Cierre de DOC-001

La reorganización documental quedó terminada el 2026-10-31 en `development`. Se conservaron los antecedentes técnicos comprobables y se retiraron los procedimientos duplicados. El detalle, los archivos, las comprobaciones y el commit están en [HISTORIAL_CAMBIOS.md](HISTORIAL_CAMBIOS.md).
