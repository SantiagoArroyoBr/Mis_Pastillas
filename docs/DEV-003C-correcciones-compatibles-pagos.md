# DEV-003C — Correcciones compatibles de pagos

Fecha: 2026-10-31. Trabajo local en development, base fc5f74d0ad46967d3cd65f762a92d274ebf38863.

## Autorización y alcance

El responsable delegó criterio técnico para corregir problemas compatibles y conservar datos históricos, con validación manual a su cargo. Esta instrucción posterior permite superar la pausa general de DEV-003B exclusivamente para cambios justificables sin reinterpretar registros ni migración. Las alternativas incompatibles permanecen como propuestas.

## Revisión previa

Árbol inicialmente limpio; development cuatro commits delante de origin/development (db944e5). main y origin/main: 92c4034085e13bb38fd0a7ff2622c46ef797873d. No se consultó la red: estas referencias remotas son las locales.

- cc3da163: seis documentos de diagnóstico; sin código.
- 65fd7ad2 / FIX-001: retira únicamente la poda de 400 días y añade regresión de conservación/exportación/restauración. Se conserva; no recupera datos perdidos previamente.
- 55b9fb78: propuesta DEV-003B, sin implementación.
- fc5f74d: registro documental de validación, sin código.

Se contrastaron DEV-003A, DEV-003B, README, plan, arquitectura, historial, modelo/validación de compatibilidad y consumidores de payments.js. No se reescribieron ni publicaron los commits anteriores.

## Reglas conservadas y presentación corregida

1. Una fecha asignada desde base equivale a una unidad, independientemente de personas o modalidad. Se conserva cover() íntegro: pagos activos por n entero, orden cronológico de fechas y exclusión de old. d y a no asignan cobertura.
2. La tarifa global solo produce una estimación actual por fecha única. No se afirma que sea una deuda monetaria conciliada. Ejemplo ficticio: una fecha, dos personas y tarifa 100 producen estimación 100, no 200. No se divide dinero entre personas sin un acuerdo representado en datos.
3. Los desgloses por enfermero conservan nombres y conteos de asistencia, sin importes atribuidos. Esas asistencias pueden sumar más que las fechas de la ficha.
4. El último registro muestra cobertura calculada actual y crédito aún sin fecha asignada. Su estimación usa únicamente fechas asignadas de ese tramo; no incluye crédito sin servicio. No es comprobante histórico, período cerrado ni reconstrucción del importe a.
5. El monto pagado se captura vacío, sin rellenarlo con una estimación que podría convertirse accidentalmente en dato histórico. Sigue siendo opcional; se conservan valores existentes, incluido cero. El formulario explica que no concilia abonos.
6. Modalidad es descriptiva. Editar tarifa o base conserva el comportamiento actual de recálculo, ahora advertido en el formulario. No se congelan resultados anteriores ni se inventan tarifas históricas.
7. La notificación genérica describe días sin cubrir en lugar de pagos próximos. No se implementa anticipación lead ni un nuevo umbral.

## Compatibilidad y límites

Sin modificación de pastillas-v1, esquema, migración, validadores, exportación o restauración. Las consultas de pagos no escriben en el estado. Se eliminó únicamente el campo derivado interno amt de filas por persona; se revisaron todos sus consumidores locales y se adaptó care-ui.js. lastPay.total ahora es una estimación por fecha, o null si falta tarifa; no es dato persistido. No se accedió a perfiles ni respaldos familiares.

Riesgos que permanecen: editar asignaciones, base o tarifa cambia vistas derivadas; borrar un pago cambia cobertura; no existe bitácora ni cierre contable. El historial visible conserva el límite previo de cinco registros, aunque el JSON mantiene todos. FIX-001 aumenta el volumen local con el tiempo; no se añade poda. El service worker conserva su estrategia de red primero y fallback offline, sin cambio de caché ni almacenamiento.

## Propuesta diferida

Pagos parciales monetarios, fracciones, períodos explícitos, tarifas por turno y cierre histórico requieren información que el modelo no guarda. No convertir a/rate a días, no inferir turnos desde time global ni vincular fechas desde d. Mantener las alternativas de DEV-003B: especificar unidad, moneda, redondeo, aplicación del abono, referencias de servicios y fecha efectiva; diseñar extensión compatible con legado y respaldo/restauración verificados antes de implementarla. No se autoriza aquí una migración.

## Archivos y validación

Código: payments.js (estimaciones y asistencia), care-ui.js (etiquetas/formularios), app.js (aviso). Pruebas: tests/payments.spec.js (cuatro casos deterministas con fecha fija) y tests/persistence.spec.js (integración nueva y suite existente). Documentos: este informe, README, PLAN_DESARROLLO, HISTORIAL_CAMBIOS y nota de continuidad en DEV-003B.

Comando: node --test tests/payments.spec.js tests/persistence.spec.js. Resultado: 33/33 aprobadas (4 de motor + 29 de navegador), cero fallos, omisiones o cancelaciones; salida 0. Microsoft Edge 156.0.4314.50. Incluye retención FIX-001, exportación/restauración, errores de almacenamiento, migración, responsive y offline. También pasaron node --check en los 11 scripts de aplicación y ambos archivos de prueba, validación JSON de manifest.json y git diff --check. Fixtures ficticios y navegador con perfil temporal aislado. La validación manual pertenece al responsable y no se afirma ejecutada.

Sin nuevos commits, push, merge ni despliegue. Los cambios quedan sin preparar para revisión; development conserva los cuatro commits locales anteriores.

## Seguimiento FIX-002/FIX-003 — 2026-10-31

La reproducción posterior con fixtures (A y B en la misma fecha, tarifa global `100`, un pago global de una unidad) observó una fecha cubierta, dos servicios y un total estimado por fecha de `100`. El modelo no registra tarifa por persona ni por servicio, así que no prueba ni permite calcular `$200` de costo por servicios. No se reinterpretó `rate` para multiplicarlo por asignaciones.

El registro de pago persistido sigue siendo `{d,n,a,old}` dentro de la configuración de la ficha y carece de destinatario. La cobertura de la fecha incluye a ambos servicios en el resumen de asistencia, pero no implica pago a ninguno. Se hizo más explícita la distinción y se expone el conteo de servicios en `lastPay()` como dato aparte del número de fechas; no se agrega estado individual pagado/pendiente.

FIX-002 queda implementado solo en su parte compatible: separar y presentar conteos de fecha/servicio, manteniendo el costo estimado por tarifa global diaria. El costo total verificable por servicio queda pendiente de tarifas por servicio inequívocas. FIX-003 no se implementó; requiere destinatario/ID en un modelo persistido. La [propuesta FIX-003](FIX-003-propuesta-pagos-individuales.md) define una extensión aditiva, retención de legados no conciliados y pruebas de respaldo/restauración para aprobación aparte. No se alteraron pagos anteriores, `pastillas-v1`, migración ni reglas de cobertura.

## Seguimiento posterior: PAG-001 — 2026-10-31

La limitación descrita arriba corresponde al estado FIX-002/FIX-003 antes de autorizar PAG-001. Ahora hay costos por nuevas asignaciones y pagos individuales en un libro aditivo; el historial anterior sigue sin destinatario ni conciliación. Consultar [PAG-001](PAG-001-sistema-pagos-individuales.md) para el estado vigente, reglas, pruebas y riesgos.
