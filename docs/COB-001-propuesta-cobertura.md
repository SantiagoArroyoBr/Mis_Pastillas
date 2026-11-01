# COB-001 — Alternativas para cobertura de enfermería

**Estado:** propuesta para decisión del responsable; no modifica cálculos. Elaborada como parte de PLAN-004 sobre `development` después de CONS-006. Datos de ejemplo enteramente ficticios.

## Hechos actuales comprobados

- `payments.js` calcula cobertura en `cover(i)`: obtiene `cfg.pays` y suma `n` de pagos no legados para formar un número de días (`total`).
- Las fechas cubiertas son días con al menos una asignación en `pay.v` desde `cfg.base`. Dos o más asignaciones el mismo día cuentan como **una fecha**; el día no se fracciona por turno.
- Los días cubiertos se asignan en orden cronológico a las primeras fechas con servicio. Las fechas posteriores se presentan como pendientes, con separación entre vencidas y futuras respecto a hoy.
- El pago por número de días no se concilia a un enfermero, turno o servicio. El libro PAG-001 y los costos fijados por servicio aportan datos de costo, pero no definen por sí mismos cómo distribuir la cobertura histórica.
- Las tarifas se configuran independientemente por persona y modalidad; el costo capturado para un servicio nuevo queda como valor histórico. El saldo monetario administrativo es con la administradora. Las jornadas asignadas por enfermero describen servicios operativos y no constituyen, por sí solas, adeudos monetarios individuales.
- Cancelaciones/ediciones de turnos cambian las fechas disponibles para el cálculo actual; no hay una liquidación de cobertura inmutable por periodo.
- `cfg.base` puede cambiar el conjunto de fechas que se cuenta. No se conserva una instantánea histórica de cada cálculo.

## Decisiones que no deben inferirse

No está especificado si medio turno consume media unidad, si dos medios turnos equivalen a un día, si turnos solapados se suman o se limitan, si los pagos parciales cubren fracciones, cómo asignar abonos entre turnos/personas, ni si un cambio de turno debe recalcular un periodo ya cerrado. La interfaz vigente presenta cobertura en días y no una conciliación monetaria por servicio.

## Alternativas

| Área | Opción A: conservar el conteo actual | Opción B: unidades fraccionarias por servicio | Opción C: periodo liquidado con snapshot |
|---|---|---|---|
| Día completo/medio | Cada fecha con cualquier asignación vale 1 día; media jornada no cambia el conteo. | Cada servicio consume una fracción acordada (por ejemplo 1 o 0.5); requiere regla explícita para modalidades personalizadas. | Calcular unidades y costos según una regla aprobada y guardar un cierre con los valores de ese momento. |
| Turnos múltiples | Un mismo día cuenta una vez, aunque haya varios enfermeros o asignaciones. | Sumar fracciones por servicio; el responsable debe decidir si hay tope por día y cómo tratar solapamientos. | Liquidar todas las asignaciones del periodo; correcciones posteriores se reflejan en un ajuste separado, nunca alterando el snapshot. |
| Pagos parciales | El campo actual suma días; el importe no determina fracciones cubiertas. | Aplicar importes a saldos de servicios identificados mediante regla FIFO u otra aprobada. | Registrar abonos y ajustes con fecha/destinatario y cerrar saldo; no asumir que pagos históricos contienen esa atribución. |
| Periodos | El conteo es continuo desde una fecha base; no existe cierre. | Agrupar por calendario o ciclo elegido; hace falta definir límites e inclusión de fechas. | Abrir, cerrar y conservar periodos identificables; reabrir mediante ajuste trazable. |
| Cambio/cancelación | El conteo actual cambia al cambiar/eliminar asignaciones. | Recalcular unidades futuras; el tratamiento de registros ya pagados necesita una regla. | No alterar periodos cerrados; añadir reverso/ajuste vinculado al registro corregido. |
| Historial | No hay saldo cerrado histórico; quedan registros actuales. | Se puede reconstruir solo si los servicios nuevos contienen modalidad, costo y fechas completos. | Mejor auditabilidad, pero requiere nuevo modelo y migración/convivencia del legado. |

## Ejemplo ficticio para decidir

En una semana hay un turno completo el lunes, dos medios turnos de distintas personas el martes (uno simultáneo), ningún servicio el miércoles y un medio turno el jueves. Se registró un pago parcial de 1.5 unidades el viernes.

- Opción A: lunes, martes y jueves son tres fechas de servicio; la cantidad pagada en dinero no convierte automáticamente 1.5 días en cobertura fraccionaria.
- Opción B: salida depende de la equivalencia acordada para cada turno y del tratamiento del solapamiento. Sin esas reglas no existe resultado correcto único.
- Opción C: el cierre requiere acordar fecha de corte, reglas de unidades y cómo se registran el abono parcial y los cambios posteriores.

## Compatibilidad, riesgos y pruebas necesarias

- **Opción A** es compatible sin migración y conserva el comportamiento visible actual; no resuelve fracciones ni conciliación individual.
- **Opción B** probablemente requiere extender cada servicio con unidad cubierta y asociar pagos a servicios. Aunque se preserve la clave `pastillas-v1`, cambiaría el esquema lógico y exige validación de restauración/migración. Riesgo alto de reinterpretar servicios o pagos históricos sin destinatario.
- **Opción C** requiere nuevos registros de periodos/cierres, referencias estables y reglas de reverso. Es el cambio de mayor complejidad y riesgo de integridad; requeriría migración aditiva, fixtures de legados y mecanismo de respaldo/recuperación aprobado.
- Antes de una implementación deben aprobarse ejemplos con: jornada completa, media jornada, dos enfermeros en una fecha, solapamientos, ausencia/cancelación, pago parcial, pago anticipado, cambio de fecha, y ajuste de un periodo cerrado. Por cada escenario se necesita salida numérica esperada.
- Regresión: conservación byte a byte del JSON anterior ante cancelación/error; roundtrip de exportación/restauración; cálculo anterior para datos legados; no duplicación; historial inalterado; recuperación tras fallo de escritura.

## Recomendación

Mantener por ahora el conteo vigente de días y mostrar sus límites con claridad. No cambiar cálculos hasta que el responsable seleccione una alternativa y confirme la matriz de resultados. Si se requiere liquidación individual, diseñarla como extensión aditiva y trazable; no repartir los pagos anteriores por inferencia.
