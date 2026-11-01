# FIX-003 — Propuesta de pagos individuales compatibles

- **Estado actual:** propuesta original superada por la implementación local PAG-001; se conserva como diagnóstico histórico de la estructura previa.
- **Base inspeccionada:** `development`, `fc5f74d0ad46967d3cd65f762a92d274ebf38863`, con DEV-003C local.
- **Restricción:** no migrar, no asignar pagos históricos a personas y no modificar `pastillas-v1` en esta propuesta.

## 1. Diagnóstico comprobado

El estado actual no puede representar que un pago fue entregado a un enfermero específico:

- `pay.cfg[i].pays[]` contiene objetos `{d,n,a,old}`. `i` identifica la ficha; no hay `nurseId`, destinatario ni asignaciones de dinero.
- `care-ui.js`, `payRegForm(i)`, valida los días e importe opcional y agrega `{d:ymd(new Date()),n,a,old:false}` al historial de la ficha. El formulario no elige un enfermero.
- `pay.cfg[i].who` es un solo valor configurado para la ficha, no un vínculo entre cada pago y cada integrante del padrón.
- `pay.v[fecha][i]` contiene asignaciones `{n}` por nombre. No tienen ID estable, tarifa ni vínculo con un pago.
- `payments.js`, `cover(i)`, suma los días `n` no antiguos y los aplica a fechas únicas en orden. Si una fecha tiene dos asignaciones, la fecha sigue siendo una unidad de cobertura.
- `payments.js`, `lastPay(i)`, muestra las asignaciones presentes en las fechas que el cálculo actual considera dentro del tramo del último registro. Esa lista describe asistencia; el pago no tiene destinatario para justificar un estado pagado por enfermero.
- `compatibility.js`, `migrate()`, normaliza los campos de pago admitidos y no tiene una estructura de pagos individuales.

Reproducción sintética en DEV-003C: una ficha con una fecha, asignaciones de A y B, un registro global `n:1,a:100` y `rate:100` produce una fecha cubierta, dos servicios observables y estimación actual de `$100` por fecha. El registro no contiene tarifa individual; el sistema no puede demostrar que sean `$100` por servicio para concluir `$200`. La misma fecha cubierta incluye las asistencias de A y B en `lastPay`; no es posible identificar a cuál se entregaron `$100`.

## 2. Por qué no es seguro corregir FIX-003 solo con presentación

Agregar un selector visual de enfermero sin guardar su destinatario crearía una falsa garantía: tras recargar, exportar o restaurar, el historial seguiría siendo global. Añadir el nombre textual directamente tampoco daría identidad estable, porque el nombre puede cambiar y la lista puede quitarlo. No debe mostrarse un enfermero como pagado basándose solo en que estuvo asignado en una fecha cubierta.

FIX-003 queda pendiente de una extensión persistida compatible. Los registros legados sin `recipientId` deben conservarse intactos y mostrarse como “pago histórico sin destinatario / no conciliado”; no se repartirán ni atribuirán automáticamente.

## 3. Extensión aditiva propuesta

Diseñar una versión opcional y aditiva del formato existente, manteniendo `pastillas-v1` solo si se aprueba y se demuestra que los lectores legados no descartan campos nuevos. No transformar ni eliminar los arrays actuales.

### 3.1 Identidad estable

Agregar a nuevas fichas de enfermero un `id` estable. La etiqueta `n` y el color `c` continúan siendo datos de presentación. Renombrar no cambia el ID. Las asignaciones históricas que solo contienen nombre permanecen sin vínculo cuando no exista una correspondencia inequívoca.

### 3.2 Servicios con costo verificable

Para nuevas asignaciones, permitir un registro aditivo con `serviceId`, `nurseId` y un importe o tarifa efectiva capturada para ese servicio, junto con la fecha ya usada por `pay.v`. No convertir el `cfg.rate` global existente en tarifas individuales. Si no hay importe verificable, el costo del servicio se presenta como desconocido, no como cero ni como la tarifa diaria multiplicada sin base aprobada.

### 3.3 Pagos individuales

Agregar una lista separada de movimientos, cada uno con ID estable, fecha de registro, `nurseId` inequívoco e importe efectivamente pagado. Mantener aparte `pays[]` como registro legado de cobertura por ficha. La relación del movimiento con servicios o saldos pendientes debe usar IDs estables si se aprueba conciliación por servicio; sin esa decisión, el pago solo puede sumarse por persona y el saldo por servicio no se afirmará.

La aplicación debe rechazar un nuevo pago individual sin destinatario seleccionado y validar importe, fecha y formato. Un abono parcial no se convierte automáticamente en días. El orden de aplicación (FIFO, periodo o selección manual), sobrepago, reembolso y redondeo requieren reglas antes de mostrar saldo pendiente.

### 3.4 Migración y respaldos

No hay migración automática autorizada. Una futura implementación debe:

1. Conservar sin reescritura cada `pay.cfg[i].pays[]` legado y mostrarlo sin destinatario, no conciliado.
2. No asignar `who`, importes ni días legados a un enfermero.
3. Dejar asignaciones antiguas sin ID/tarifa si la identidad o costo no puede probarse.
4. Añadir validación estricta en `validateStoredState`, `validateMigrationInput`, `migrate` y `assertMigrationIntegrity` para campos opcionales nuevos, sin filtrar campos inesperados silenciosamente.
5. Probar respaldo JSON legado → carga → exportación → restauración y respaldo nuevo → restauración; cancelar y simular errores sin escribir ni reemplazar el original.
6. Definir comportamiento ante importar un respaldo nuevo en una versión anterior que no conozca el formato. Si puede perder campos, bloquear/advertir de forma segura o elegir otro formato versionado antes de publicar.
7. Comparar byte a byte/estructuralmente los pagos históricos originales y los importes, fechas y marcas de antigüedad.

## 4. Alternativas

| Alternativa | Beneficio | Costo/riesgo | Dictamen |
|---|---|---|---|
| Solo selector en UI, sin persistir destinatario | Cambio visual pequeño | Falsa atribución; dato se pierde al recargar | Rechazada |
| Guardar nombre del enfermero en cada pago | Permite una asociación inicial | Renombres, homónimos, y eliminaciones hacen ambigua la identidad; no resuelve tarifas por servicio | No recomendada |
| ID estable de enfermero + ledger individual separado | Permite pagos parciales por persona sin reasignar pagos legados | Extiende esquema, validación, exportación/restauración, UI y reglas de saldo | Requiere aprobación técnica y pruebas específicas |
| ID estable + servicio ID/tarifa snapshot + asignación de pagos a servicios | Trazabilidad y costo/saldo por servicio | Mayor complejidad; requiere decidir tarifas, periodos, FIFO, correcciones y tratamiento histórico | Opción completa si se exige saldo por servicio |

## 5. Casos de aceptación pendientes

1. Alta de A y B con IDs diferentes; renombrar uno conserva el vínculo.
2. Registrar pago completo a A; el saldo de B no cambia.
3. Registrar abono parcial a A; el restante de A y saldo de B siguen separados.
4. Rechazar pago sin destinatario y evitar duplicar ID/movimiento en doble envío o recarga.
5. Dos y tres servicios en una fecha con importes por servicio conocidos: sumar importes de servicio sin multiplicar la fecha de cobertura.
6. Importe de servicio desconocido: mostrar costo desconocido; no inferirlo desde `cfg.rate`.
7. Pago legado sin destinatario: conservar fecha, importe, `n`, `old`; mostrar como no conciliado y no asignarlo a A/B.
8. Cambiar tarifa de un servicio nuevo sin alterar el snapshot de servicios anteriores.
9. Modificar/quitar asignaciones con política aprobada de corrección y conservación.
10. Roundtrip y fallos de respaldo/restauración, clave `pastillas-v1`, persistencia, regresión completa y vista a 320 px.

## 6. Decisiones requeridas

- ¿La tarifa se define por enfermero, servicio/turno, fecha de ficha o combinación? ¿Cuándo entra en vigor?
- ¿Se requiere saldo por persona únicamente o asignar cada pago a servicios/periodos concretos?
- ¿Cómo se aplican pagos parciales y anticipados, sobrepagos, reembolsos y redondeos?
- ¿Qué hacer con asignaciones antiguas sin ID y tarifas no registradas? La recomendación es dejarlas sin costo individual verificable.
- ¿Se autoriza una extensión aditiva/migración de `pastillas-v1`, con respaldos legados conservados y plan de compatibilidad entre versiones?
- ¿Qué ocurre si se abre un respaldo nuevo con una versión anterior de la aplicación?

Hasta resolver estas decisiones, FIX-003 no debe presentarse como implementado y la aplicación no debe afirmar pagos o saldos individuales.

## Resultado posterior — PAG-001 (2026-10-31)

La autorización posterior del responsable dio paso a la extensión aditiva descrita en [PAG-001](PAG-001-sistema-pagos-individuales.md). El esquema nuevo captura tarifa por servicio y movimientos con destinatario estable/aplicaciones explícitas; los pagos anteriores siguen sin conciliación. El diseño de la propuesta sirvió como antecedente, pero los campos y reglas implementados se especifican en PAG-001.
