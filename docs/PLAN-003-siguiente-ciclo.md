# PLAN-003 — Propuesta del siguiente ciclo funcional

**Estado:** BACKUP-001, NOTIF-001, QA-005 y PREVIEW-003 cerradas funcionalmente según declaración del responsable del 2026-10-31. DEV-003B y cambios de cálculos/pagos siguen pendientes y no autorizados. Código inspeccionado para PLAN-003 en `development` a partir del commit `12fa3a70dc4989957a2d5a22057b78bd07fbfdb8`.

## Estado comprobado

- La aplicación conserva una arquitectura frontend modular: `app.js` compone estado, eventos y persistencia; módulos locales especializados incluyen `appointments.js`, `inventory.js`, `payments.js`, `care-ui.js`, `forms.js`, `domain.js`, `compatibility.js` y `sharing.js`. No se observó backend ni sincronización multi-dispositivo en la arquitectura documentada.
- La persistencia sigue en `localStorage` con clave `pastillas-v1`. La restauración JSON tiene validación/confirmación y rutas de recuperación; cualquier cambio debe preservar datos anteriores.
- DEV-001 selecciona paciente de cita por índice de ficha y mantiene `a.i`; DEV-002 aclara el inventario compartido por pauta dentro de cada ficha. ADMIN-001 añade tarifas/snapshots y libros de pagos separados, conservando los datos legados. Estas etapas se consideran cerradas para su alcance aprobado y la publicación en `development`.
- PREVIEW-002: hay 42/42 pruebas automatizadas documentadas para ejecución local anterior. El responsable declaró que ADMIN-001 y PREVIEW-002 fueron probadas manualmente y aprobadas para continuar. No se entregaron resultados caso por caso; la revisión previa no pudo acceder funcionalmente a la Preview protegida. La declaración no prueba la configuración de producción ni autoriza su publicación.
- Las reglas de cobertura de enfermería de DEV-003A/DEV-003B siguen pendientes de decisión funcional; cálculos monetarios y periodos tienen riesgo alto y no deben inferirse.

## Backlog propuesto

| Orden | Propuesta | Utilidad / UX | Complejidad | Dependencias | Riesgo de datos | Verificación |
|---|---|---|---|---|---|---|
| 1 | **DEV-003B: acordar y después corregir cobertura/pagos de enfermería.** Resolver si media jornada cuenta como fracción, cómo se cuentan varios enfermeros el mismo día, fechas cubiertas y efecto de pagos anticipados/cancelaciones. | Alta / alta: hoy los conceptos de servicio y los días cubiertos no son equivalentes y pueden confundir el saldo. | Alta | Decisión explícita del responsable con matriz de ejemplos y resultados monetarios esperados. | Alto; puede cambiar deuda percibida e interpretación histórica. Mantener datos previos sin reinterpretación automática. | Casos sintéticos para turnos completos/parciales, múltiples asignaciones, pagos, cancelaciones, fechas límite y roundtrip JSON; aprobación de valores esperados antes de codificar. |
| 2 | **QA/UX incremental de respaldo y restauración.** Mejorar mensajes de éxito/error y claridad del alcance del archivo manteniendo doble confirmación y recuperación actual. | Alta / media: los respaldos son la vía principal de portabilidad y recuperación. | Media | Definir textos y estados de error; reutilizar pruebas de fallos simulados existentes en `tests/persistence.spec.js`. | Alto si se cambia orden de escritura; bajo/moderado si el cambio es informativo y no altera transacción. | Archivo inválido, mayor a límite, lectura fallida, escritura fallida, cancelación y restauración válida con fixtures; comprobar conservación del estado previo. |
| 3 | **Claridad de notificaciones de pagos.** Distinguir deuda vencida de pagos próximos y hacer comprensible el límite actual de aviso diario al abrir la aplicación. | Media / media: reduce avisos ambiguos y repetidos. | Baja | Confirmar texto y semántica en `payments.js`/`app.js`; mantener categorías sin incluir información médica sensible. | Bajo si solo cambia presentación; moderado si se alteran condiciones o deduplicación. | Reloj controlado y escenarios sin deuda, vencidos, por vencer y reapertura el mismo día; verificar cantidad y contenido sin PII. |

## Recomendación

Antes de cualquier corrección de cálculo, ejecutar una sesión de decisión DEV-003B con ejemplos numéricos aprobados por el responsable. Es el problema con mayor impacto familiar, pero también el de mayor riesgo. Si se desea un ciclo de riesgo menor mientras se acuerdan esas reglas, elegir primero la propuesta 2 y limitar el cambio a mensajes, conservando intactas la validación, la secuencia de escritura, `pastillas-v1` y el formato JSON.

## Resultado del ciclo aprobado — 2026-10-31

CONS-005 consolidó BACKUP-001, NOTIF-001 y QA-005 como trabajo autorizado. Los tres se implementaron localmente y la regresión pasó 45/45. La claridad de avisos y respaldo se completó sin cambiar persistencia ni reglas de negocio. DEV-003B y cambios al modelo/cálculos de pagos quedan fuera de este ciclo y requieren decisión/autorización futura.

CIERRE-002 registra que el propietario probó PREVIEW-003 y aprobó el cierre funcional del alcance. No hay resultados detallados comunicados. La aprobación no autoriza producción.

## Decisiones pendientes del responsable

1. ¿La cobertura representa días calendario con algún turno, fracciones de día o servicios facturables? ¿Cómo se trata a dos enfermeros en una fecha?
2. ¿Qué periodo cubre cada pago y cómo afecta un pago adelantado, reembolso o cancelación al historial ya mostrado?
3. DEV-003B no forma parte del ciclo autorizado; requerirá autorización futura después de aprobar sus reglas.
4. Para notificaciones, ¿se deben mostrar vencidos, próximos o ambos, y con qué frecuencia se permite avisar?

## Salvaguardas para el ciclo

- No cambiar `pastillas-v1`, formato persistido, ni introducir migraciones sin una propuesta separada y aprobación.
- No alterar ni borrar registros históricos; usar fixtures ficticios y respaldos de prueba.
- Mantener módulos acotados y sumar pruebas de regresión al módulo responsable.
- No tratar la aprobación manual declarada como autorización de despliegue productivo.

## Base documental y técnica

Consultados: `PLAN_DESARROLLO.md`, `ARQUITECTURA.md`, `docs/auditorias/FUNC-001-inventario-funcional.md`, `docs/PLAN-002-backlog-funcional.md`, además de los módulos JavaScript citados y los documentos de ADMIN-001/PAG-001. Este documento solo planifica; no cambia código ni reglas de negocio.
