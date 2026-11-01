# PAG-001 — Servicios, pagos individuales y saldos

**Estado:** implementación local en `development`, pendiente de validación manual del responsable y revisión final.
**Alcance:** PAG-001A a PAG-001D en aplicación offline; no se cambió `pastillas-v1` ni se añadieron dependencias.

## Modelo anterior y compatibilidad

El estado anterior se conserva: `pay.v[fecha][índiceDeFicha]` contiene asignaciones `{n}` y `pay.cfg[i].pays[]` contiene registros globales `{d,n,a,old}`. Esos registros no tienen tarifas por servicio ni destinatario inequívoco. Permanecen intactos y excluidos del libro nuevo; no se distribuyen entre enfermeros ni se convierten en costos o pagos conciliados. La tarifa `cfg.rate` sigue siendo una estimación diaria histórica y no se usa como tarifa de servicio.

La ampliación es aditiva bajo la misma clave:

- Una asignación nueva agrega `service: { id, nurseId, type, amountCents }` al elemento existente `{n}` en `pay.v`. La fecha sigue en la clave exterior; el ID del servicio, el ID estable de la persona, la jornada y el costo en centavos quedan congelados en esa asignación.
- El objeto de enfermero puede llevar `id` además de `n` y `c`. Los registros previos sin ID no reciben identificadores al cargar. Se genera uno al crear su primer servicio nuevo.
- `pay.ledger[]` contiene movimientos `{id, patientIndex, nurseId, date, amountCents, concept, allocations:[{serviceId,amountCents}]}`. Los importes nuevos se almacenan como centavos enteros.
- `migrate()` añade `ledger: []` si no existe. No cambia la clave `pastillas-v1`, no elimina asignaciones antiguas ni reescribe movimientos globales anteriores. La validación de importación comprueba IDs, destinatario, ficha, aplicaciones y límites de costos; un libro inconsistente se rechaza antes de escribir.

Los respaldos anteriores continúan siendo legibles. Los respaldos ampliados incluyen el libro y los servicios y se restauran por la misma ruta confirmada de importación. La aplicación nunca accede al almacenamiento de dispositivos familiares durante las pruebas.

## Reglas implementadas

1. Cada alta desde el calendario pide el costo del servicio y tipo de jornada. La tarifa queda fija por asignación; cambiar la estimación global diaria no la modifica.
2. Una ficha puede tener varios servicios el mismo día, con costos y personas diferentes. El conteo de cobertura actual continúa basado en fechas únicas.
3. Un abono selecciona enfermero/a, fecha e importe; el ID del destinatario no depende del orden del arreglo.
4. Un abono se asigna en orden de fecha de servicio (y luego ID) a los saldos pendientes de esa persona hasta la fecha del pago. La asignación exacta queda en `allocations`, por lo que movimientos posteriores no redistribuyen pagos anteriores.
5. Se admiten abonos parciales y múltiples movimientos. El excedente sobre servicios pendientes hasta la fecha indicada se rechaza; no se crean anticipos ni saldo negativo.
6. No se puede quitar un servicio que ya tiene abonos aplicados ni retirar de la lista un enfermero con servicios nuevos. Los servicios legados se pueden quitar como antes porque no están conciliados con movimientos nuevos.
7. El saldo individual suma únicamente costos y movimientos nuevos validados para ese ID. Los pagos `{d,n,a,old}` continúan mostrados como historial global separado.

## Límites y riesgos

- No hay edición de servicios ni eliminación de movimientos nuevos; esta primera versión conserva el historial y evita recálculos retroactivos, pero un error de captura requiere un flujo correctivo futuro y no debe resolverse editando el JSON manualmente.
- No hay anticipos. Los pagos sin saldo elegible o posteriores al costo pendiente se rechazan.
- La fecha del pago impide aplicar un abono a servicios futuros. No se administra un período contractual o comprobante externo.
- La identidad de ficha en la estructura actual continúa usando índices, como las demás referencias existentes; no hay reordenamiento de pacientes en la UI actual. Enfermeros, servicios y movimientos sí usan IDs estables.
- La tarifa global `rate` permanece como estimación diaria; no se propone borrarla ni reutilizarla.
- `localStorage` sigue sin cifrado propio. Exportaciones JSON contienen datos de cuidado y pagos y deben custodiarse privadamente.

## Recuperación

1. Antes de restaurar, exportar un respaldo JSON y guardarlo en un lugar privado.
2. Revisar que el archivo sea la copia correcta; la interfaz actual muestra conteos y requiere confirmación explícita.
3. Importar únicamente un JSON válido. La validación ocurre antes de reemplazar el estado; errores de lectura, estructura o escritura no deben sobrescribir los datos anteriores.
4. Después de restaurar, comprobar servicios, destinatarios, importes y saldos con fixtures o datos autorizados localmente. No usar este procedimiento para editar el JSON a mano.

## Verificación automatizada local

El 2026-10-31 se ejecutó `node --test tests/payments.spec.js tests/persistence.spec.js`: 39/39 aprobadas en Microsoft Edge 156.0.4314.50 mediante Chromium DevTools, perfil temporal aislado y datos ficticios. Incluye compatibilidad del historial de más de 400 días, una a tres personas en la misma fecha, tarifas diferentes por servicio, abonos parciales a una persona y pagos independientes a otras personas, rechazo del excedente, protección de servicio pagado, recarga, exportación/restauración JSON, viewport de 320 px y regresiones existentes de inventario, citas y offline. `node --check` pasó en scripts de aplicación/pruebas y `git diff --check` al cierre de esta intervención.

No se probó Firefox ni dispositivo físico/Preview. El responsable debe verificar visualmente el flujo nuevo en una Preview aislada antes de publicarlo; la lista de comprobación manual está a continuación.

## Pruebas manuales para Preview

En un perfil/navegador aislado, con una ficha y personas ficticias:

1. Registra tres enfermeros en la misma fecha con tarifas distintas; comprueba que cada servicio y saldo aparece bajo el destinatario correcto.
2. Cambia la estimación global diaria y verifica que los costos de los servicios existentes no cambian.
3. Registra dos abonos parciales a una persona, y un pago independiente a otra; revisa fecha, concepto, aplicación y saldo.
4. Intenta abonar más del saldo hasta la fecha indicada y confirma que no se guarda.
5. Recarga, activa el modo offline desde DevTools y comprueba que el resumen local sigue disponible; luego vuelve online.
6. Exporta el JSON, restáuralo en ese perfil y compara IDs, servicios, movimientos, costos y saldos. Comprueba que los pagos globales legados siguen separados.
7. Repite la lectura a 320 px y navega los formularios con teclado. Confirma el servicio pagado bloqueado contra eliminación.

No reutilizar el perfil familiar ni datos reales. La prueba automatizada local no reemplaza esta validación visual o en dispositivos físicos.

## Continuidad del modelo — ADMIN-001, 2026-10-31

PAG-001 documenta el libro individual histórico y las relaciones de abono asociadas. En la evolución ADMIN-001, la experiencia principal de pagos cambia a un adeudo general del cliente con la administradora. Los movimientos ya guardados en `pay.ledger` siguen intactos, conservan sus aplicaciones y se muestran en el archivo histórico; no se descuentan del nuevo saldo general ni se transforman en pagos administrativos. No se ofrece conciliación individual nueva desde el flujo principal.

Las tarifas ahora se configuran por enfermero y modalidad en Pagos; una jornada nueva fija su costo al asignarse desde Calendario. El nuevo libro administrativo `pay.generalLedger` permanece separado del individual. Para el comportamiento vigente, compatibilidad, riesgos y pruebas, consultar [ADMIN-001](ADMIN-001-tarifas-adeudo-general.md). Automatización integrada local: 42/42 aprobada en Edge 156.0.4314.50 con fixtures ficticios; revisión manual del responsable pendiente. `pastillas-v1` no cambió.
