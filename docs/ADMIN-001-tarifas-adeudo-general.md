# ADMIN-001 — Tarifas, jornadas y adeudo general

Estado: implementación local en `development`, sin publicación remota. La validación automatizada descrita abajo se ejecutó el 2026-10-31 en Microsoft Edge 156.0.4314.50 mediante Chromium DevTools, servidor loopback local y perfil temporal aislado. Todos los nombres y registros de prueba fueron ficticios.

## Modelo funcional

### Tarifas por enfermero

La administración se realiza en Pagos. Cada enfermero nuevo requiere al menos una tarifa en centavos: `ratesCents.full` y/o `ratesCents.half`. Una modalidad vacía (`null`) no se ofrece; el valor `0` es una tarifa configurada válida. Las dos cantidades son independientes. Enfermeros anteriores sin tarifas se conservan sin precio inventado y no aparecen como opción para nuevas jornadas hasta configurar una modalidad.

Cambiar o retirar una tarifa afecta solo futuras asignaciones. Para retirar una modalidad se solicita confirmación y se conserva la otra modalidad. El formulario permite seguir cambiando nombre/color de una ficha histórica sin agregar una tarifa inventada.

### Jornadas y cobertura

En Calendario se selecciona el enfermero, una modalidad que ofrece y, si tiene ambas, la jornada. Una modalidad única se preselecciona y el importe se muestra desde Pagos. El servicio conserva `id`, `nurseId`, `type` y `amountCents` como snapshot. No se cambia el conteo temporal de `cover()`: media jornada no equivale a media fecha. Dos personas distintas pueden quedar asignadas a la misma fecha; no se duplica una asignación repetida de la misma persona para ese día.

Las asignaciones antiguas continúan contándose como antes, pero no se les asigna costo en retrospectiva. La retirada/cambio de tarifas no reescribe servicios históricos. Los servicios con abonos individuales aplicados no se pueden quitar. Mientras haya abonos generales activos, no se permite quitar ningún servicio porque los recibos no se aplican a una jornada concreta.

### Saldo general de la administradora

El resumen suma los costos de servicios nuevos con snapshot válido y resta únicamente los recibos activos del nuevo libro general. El excedente se rechaza; no se admiten anticipos. Importes y sumas se manejan en centavos seguros.

El libro se almacena en `pay.generalLedger` y admite:

- Recibo: `{id, type:'receipt', date, amountCents, concept}`.
- Cancelación: `{id, type:'cancellation', originalId, date, amountCents, concept}`.

La cancelación es un evento agregado, conserva el recibo original, referencia su identificador e importe, no puede duplicarse ni tener fecha anterior al recibo. Para corregir un importe se cancela el recibo y se agrega otro. La validación de JSON rechaza referencias inexistentes, importes distintos, cancelaciones repetidas, identificadores duplicados y recibos activos que excedan el costo verificable.

### Convivencia con información anterior

El resumen no descuenta:

- Pagos de PAG-001 en `pay.ledger`, aunque conserven asignaciones individuales a servicios.
- Pagos históricos por ficha `pay.cfg[].pays`, que no acreditan destinatario ni conciliación inequívoca.
- Asignaciones anteriores sin objeto `service` y costo verificable.

La interfaz conserva el historial individual y los pagos legados en secciones identificadas como no conciliadas. Muestra conteos de datos excluidos y advierte que el saldo es verificable, no una conciliación completa de toda la historia. No crea pagos individuales a enfermeros ni transforma los registros anteriores.

## Persistencia, respaldo y recuperación

Se conserva la clave `pastillas-v1` y el formato JSON. `compatibility.js` añade valores predeterminados aditivos (`generalLedger: []`) y conserva tarifas opcionales; valida las relaciones y límites monetarios de los registros nuevos antes de aceptar almacenamiento o restauración. No se transforma ningún pago histórico ni se añade una migración destructiva.

La suite verificó exportación y restauración de los libros general e individual coexistentes, conservación de pagos legados, rechazo de una cancelación duplicada sin escritura, cancelación de la restauración y conservación del valor anterior ante error de escritura. Si un respaldo de datos nuevos no pasa validación, no se confirma y el contenido local previo se mantiene.

## Módulos

- `care-ui.js`: formularios de tarifas, asignaciones, resumen, recibos y cancelaciones.
- `app.js`: composición, acciones, extracción de servicios y bloqueo de eliminaciones que afectarían saldos.
- `payments.js`: cálculo puro del resumen general y los recibos cancelados.
- `compatibility.js`: normalización aditiva y validación de servicios, tarifas y libro general.
- `styles.css`: jerarquía compacta para el saldo general, personal y tarifas.
- `tests/payments.spec.js`, `tests/persistence.spec.js`: cálculos y regresión de navegador.

## Riesgos y límites conocidos

- El saldo cubre únicamente nuevos costos verificables y abonos generales nuevos; no resuelve la deuda histórica completa.
- Un servicio representa una asignación registrada, no evidencia independiente de asistencia efectiva.
- El recibo general no se reparte por enfermero ni por servicio; por eso el producto evita presentar adeudos monetarios individuales.
- Un abono general activo bloquea la eliminación de cualquier servicio, una restricción conservadora necesaria porque no existe asignación del recibo a cargos concretos.
- Cancelar un recibo puede elevar el saldo, pero no crea una cuenta negativa: el recibo original se excluye del total recibido y el saldo queda limitado al costo verificable.
- `localStorage` no cifra información; conservar respaldos privados y proteger el dispositivo sigue siendo responsabilidad del usuario.
- La suite automatizada no sustituye revisión manual del responsable, prueba con lector de pantalla, Firefox/dispositivos físicos ni una validación en Preview/producción.

## Validación automatizada

Comando: `node --test tests/payments.spec.js tests/persistence.spec.js`.

Resultado: **42/42 aprobadas**, 8 pruebas puras de pagos y 34 pruebas de navegador en Edge 156.0.4314.50, perfil temporal aislado. Casos nuevos: saldo general/cancelación, no doble descuento de pagos individuales ni pagos legados, tarifas independientes y cero explícito, asignaciones de dos enfermeros en una fecha, cambio no retroactivo, abonos múltiples/parciales, rechazo de excedente, cancelación append-only, reabono corregido, restauración y rechazo de cancelación duplicada. La suite también mantuvo las regresiones existentes de citas, medicamentos/inventario, persistencia, exportación/restauración, accesibilidad básica, responsive y PWA offline.

`node --check` pasó en los módulos y pruebas modificados; `git diff --check` no encontró errores de espacios. Git informó únicamente que algunos archivos con LF pueden convertirse a CRLF en una operación futura.

## Validación manual del responsable

Usar un perfil aislado y registros ficticios; no copiar datos familiares reales.

1. En Pagos, crear “Enfermera A prueba” con jornada completa `$100.00` y media jornada `$60.00`; crear “Enfermero B prueba” con solo jornada completa `$200.00`.
2. En la misma fecha asignar A media jornada y B jornada completa. Deben mostrarse `$60.00` y `$200.00`; ambos servicios deben aparecer y el total subir `$260.00`.
3. Cambiar A a `$120.00`; las asignaciones anteriores deben seguir en `$60.00` y las próximas usar `$120.00`.
4. Registrar abonos generales de `$100.00` y `$50.00`; el saldo debe reducirse `$150.00` y el formulario no debe pedir enfermero.
5. Cancelar el recibo de `$100.00`: el historial debe conservar recibo y cancelación, y el saldo debe aumentar `$100.00`. La segunda cancelación no debe estar disponible.
6. Exportar y restaurar el JSON; confirmar que servicios, tarifas, recibos, cancelación y movimientos PAG-001 permanecen.
7. Revisar Pagos en una pantalla de 320 px y comprobar que no hay desplazamiento horizontal.
