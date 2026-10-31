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
| DAT-002 | Evaluar backend, autenticación, autorización y aislamiento por familia. | — (completada) | DAT-001 | Completada | Evaluación documentada y recomendación sustentada; se conserva por ahora el modelo local, sin adoptar backend/Auth. Cualquier prototipo o servicio real queda sujeto a requisitos y puertas de DAT-003/CAL-001; ver [DAT-002](docs/arquitectura/DAT-002-evaluacion-backend-auth-aislamiento.md) y [registro](HISTORIAL_CAMBIOS.md). |
| DAT-003 | Diseñar migración progresiva de datos locales y operación entre dispositivos. | — (evaluación local completada) | AUD-001, DAT-001, DAT-002 | Completada como validación sintética | Ciclo de exportación/restauración probado con fixture inventado, en perfil de navegador aislado; el respaldo familiar no se solicitó ni comprobó. Esa comprobación sigue siendo puerta obligatoria antes de migración real. Ver [DAT-003](docs/arquitectura/DAT-003-respaldo-restauracion-migracion.md). |
| CAL-001 | Consolidar estrategia de pruebas de respaldo, restauración e aislamiento entre familias, si se adopta backend multi-familia. | **P2 — Alta** | DAT-002, DAT-003 | Bloqueada | Matriz de casos preparada en [CAL-001](docs/arquitectura/CAL-001-matriz-pruebas-aislamiento.md); no se puede comprobar aislamiento sin backend, roles y staging decididos. No crear servicios ni usar datos reales. |
| PWA-001 | Evaluar almacenamiento local ampliado y sincronización offline segura. | — (evaluación documental completada) | AUD-001, DAT-001, DAT-002, DAT-003 | Completada como evaluación | Estrategia propuesta para almacenamiento, cola, reintentos, idempotencia y conflictos en [PWA-001](docs/arquitectura/PWA-001-almacenamiento-y-sincronizacion-offline.md). No se implementó ni validó comportamiento de sincronización; cualquier prototipo requiere decisión y entorno aislado. |
| DAT-004 | Evaluar historial administrativo con trazabilidad y permisos adecuados. | — (completada) | DAT-001, DAT-002 | Completada | Evaluación de campos candidatos, actores, acceso, retención y controles documentada; las decisiones finales y pruebas de implementación siguen pendientes. Ver [DAT-004](docs/arquitectura/DAT-004-evaluacion-auditoria.md) y [registro](HISTORIAL_CAMBIOS.md). |
| PWA-002 | Evaluar notificaciones push de reposición. | — (evaluación documental completada) | AUD-001, DAT-002, PWA-001 | Completada como evaluación | Se compararon avisos locales y push, permisos, privacidad y requisitos de backend en [PWA-002](docs/arquitectura/PWA-002-evaluacion-notificaciones-push.md). Compatibilidad real debe verificarse por navegador/dispositivo antes de implementar; no se habilitó servicio ni se modificaron permisos. |
| DOC-002 | Preparar guías de instalación, uso y despliegue conforme a la arquitectura finalmente vigente. | **P4 — Posterior** | AUD-001, decisión de arquitectura aplicable | En curso | [Guía inicial](docs/GUIA_INSTALACION_USO.md) cubre instalación, uso local, límites y respaldos con hechos del código. Falta verificar el proceso real de despliegue y una revisión guiada con responsables; no desplegar. |

Las tareas pendientes describen trabajo futuro registrado; no significan que una tecnología o función propuesta ya esté decidida o implementada. La secuencia P1–P4 es una propuesta técnica revisable, no una decisión atribuida al usuario. DAT-001 documenta una opción arquitectónica y deja explícitas las decisiones de producto abiertas; no adopta Supabase ni autoriza implementación o migración. DAT-002 recomienda conservar el almacenamiento local hasta confirmar una necesidad multi-dispositivo; no selecciona proveedor ni autoriza implementación. DAT-003 validó el ciclo sintético local; comprobar el respaldo familiar sigue siendo condición previa a una migración real y no se hizo ni se pidió en este trabajo. CAL-001 queda bloqueada sin backend, roles y staging aprobados. PWA-001 y PWA-002 son evaluaciones documentales, no implementaciones ni pruebas de sincronización o push. Los trabajos completados constan aquí para trazabilidad; su integración en `development` no equivale a publicación en producción. El usuario puede cambiar las prioridades actualizando esta tabla.

## Siguiente trabajo de Dirección general

**DOC-002 — completar la guía de instalación, uso y despliegue** es el siguiente trabajo documental útil. El proyecto puede contrastar la guía con el flujo versionado y con evidencia pública verificable; el propietario debe confirmar proveedor, proyecto, rama de producción, pasos de publicación y procedimiento de reversión. Sin esa evidencia, DOC-002 permanece como guía inicial.

**Criterios de término:** registrar evidencia revisable del flujo vigente; comprobar qué commit/rama publica producción y cómo verificar el resultado sin iniciar un despliegue; documentar reversión y responsable solo si están confirmados; marcar cualquier paso sin evidencia. No abrir ni modificar producción.

**Acciones externas al proyecto:** la familia verifica en privado que conserva un respaldo exportado y sabe restaurarlo en su dispositivo; no compartir el archivo. El propietario decide si configura protección para `main`. GitHub reportó `protected: false`; la cuenta conectada no pudo leer el endpoint detallado de protección (403), por lo que se recomienda al propietario revisar Settings. No se cambió configuración.

CAL-001 continúa bloqueada por backend, roles y entorno aislado aún no decididos.

## Cierre de DOC-001

La reorganización documental quedó terminada el 2026-10-31 en `development`. Se conservaron los antecedentes técnicos comprobables y se retiraron los procedimientos duplicados. El detalle, los archivos, las comprobaciones y el commit están en [HISTORIAL_CAMBIOS.md](HISTORIAL_CAMBIOS.md).
