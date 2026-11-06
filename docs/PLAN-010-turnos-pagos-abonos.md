# PLAN-010 · Asignaciones, jornadas devengadas y estado de cuenta

Implementación local en `development` del 6 de noviembre de 2026. Pendiente de validación manual del propietario y autorización de publicación.

## Punto de partida

El checkout comenzó en `6968fec78c6c2944d54cdc69e1569d92aab3c6fd`. Después de `git fetch origin`, `development` y `origin/development` coincidían. El cierre documental de PLAN-009 (`1901dd3`), sus cambios funcionales y UX-013 (`6968fec`) estaban en la rama remota. La referencia de `main` era `92c4034085e13bb38fd0a7ff2622c46ef797873d`. Se excluyeron los cambios locales previos de COB-001, UX-004, PLAN-005 y QA-008.

El diálogo anterior tenía selectores compactos y un campo de repetición con texto duplicado. El estado de cuenta sumaba también las jornadas futuras y el formulario general rechazaba excedentes.

## TURN-001 · Asignaciones

El encabezado muestra la fecha local completa y la ficha. El panel de asignaciones registradas muestra modalidad, inactividad o legado, y el costo guardado si existe. Quitar está disponible para registros permitidos. Cuando hay un abono individual aplicado o un abono general activo, se explica el bloqueo existente.

El selector nativo estilizado permite elegir enfermeros activos. Las tarjetas de modalidad usan radios nativos, foco visible y tarifas independientes. Una tarifa ausente deshabilita su modalidad y una tarifa explícita de cero sigue disponible. El resumen muestra el costo unitario y respeta la preferencia de montos. Asignar guarda directamente. Cancelar o Escape descarta la captura.

La repetición selecciona la fecha inicial y, cuando se solicita, cada fecha del mismo día de la semana hasta terminar ese mes. Se conserva la regla de omitir al mismo enfermero por nombre cuando ya existe en la fecha y ficha. Cada asignación nueva conserva su propio costo e ID. El estado candidato se guarda en una operación antes de actualizar la vista.

## PAG-003 y ABO-001 · Cálculo y cambio de día

El saldo en centavos es la suma de costos guardados de servicios con fecha local válida hasta hoy inclusive, menos la suma de abonos generales activos. Cada servicio cuenta por separado aunque comparta fecha. Una cancelación excluye el recibo referenciado del total activo y conserva ambos movimientos.

Un resultado positivo se presenta como **Saldo pendiente**, cero como **Sin saldo pendiente** y un resultado negativo como **Saldo a favor** con su valor absoluto. El formulario admite registrar un importe recibido superior a lo devengado, incluso sin jornadas programadas. El excedente compensa los costos que entren al cálculo en fechas posteriores sin crear movimientos adicionales ni persistir un saldo derivado.

Las jornadas futuras permanecen en el calendario con sus costos y referencias. Se incorporan al estado de cuenta al llegar su fecha. Se reutiliza el intervalo de 60 segundos y se comprueba el cambio de día al volver a la pestaña o cerrar un diálogo. Un formulario abierto conserva su captura. El renderizado omite reemplazos con contenido idéntico y restaura la apertura de los historiales si cambia el contenido.

## UX-015 · Estado de cuenta

Pagos presenta un encabezado dinámico, importe principal, dos renglones de desglose, **Registrar abono** e historial. El estado a favor tiene una superficie verde suave. El resumen indica si hay conceptos históricos excluidos. El estado dinámico se anuncia sin cifras y **Ver montos** controla la presentación de los importes, también en el historial. El estado de cuenta muestra los abonos activos, mientras el historial lista además los cancelados y sus referencias.

## DATA-005 · Historial, prepagos y respaldo

- `cover()` sigue imputando fechas de atención a la cobertura administrativa según la configuración histórica de cada ficha. Los días prepagados y sus importes informativos en `pay.cfg[].pays` quedan fuera del saldo monetario. No existe una relación fiable que permita atribuir esos importes a jornadas monetarias específicas.
- `pay.ledger` conserva los movimientos individuales PAG-001 con sus aplicaciones originales. Los pagos globales anteriores, los servicios con fecha inválida y las asignaciones sin costo verificable se conservan fuera del cálculo general. Un costo histórico de cero sí es verificable.
- La clave `pastillas-v1`, la estructura JSON y los identificadores existentes se conservan. La validación permite que los abonos generales activos superen el costo de todos los servicios guardados. Los respaldos con ese excedente requieren una versión con PLAN-010 para superar esa validación. El guardado sigue comprobando conflictos con otras pestañas antes de escribir.
- La PWA usa `acompanha-v12` para distribuir los recursos del mismo conjunto. La activación sigue esperando el cierre de los clientes anteriores.

## QA-018 · Verificación

`node --test tests/payments.spec.js tests/persistence.spec.js` pasó **73/73** (9 de motor y 64 de navegador). La regresión usó un servidor loopback, datos ficticios y un perfil temporal de Microsoft Edge 156.0.4314.58. Las pruebas nuevas cubren cambio local de día y de año, fechas inválidas, crédito sin jornadas, recuperación de respaldo, historial abierto, privacidad, foco y repetición sin duplicados. Se comprobó el reflujo del diálogo y del estado a favor a 320, 360, 390, 430, 768 y 1280 px, además del contraste del importe a favor y la consola en ambos flujos.

La suite existente pasó con las expectativas actualizadas para los controles de modalidad, la notificación que espera al devengo y la validación de anticipos. La PWA abrió y recargó offline, y la actualización de prueba respetó el formulario abierto y conservó los datos. Pasaron `node --check` en 12 scripts, el parseo de `manifest.json` y `git diff --check`.

El diseño se implementó a partir de la descripción aprobada en el plan. La comparación visual con el mockup, el lector de pantalla, el zoom en equipo habitual y la revisión en dispositivos físicos quedan para la validación manual del propietario.

## Checklist del propietario

- [ ] Con datos ficticios, abre una fecha en Calendario. Elige un enfermero, cambia de modalidad y compara los costos. Comprueba una tarifa ausente y una de cero.
- [ ] Prueba una asignación única y otra semanal hasta fin de mes. Cancela un tercer intento y verifica que las asignaciones previas conservan sus costos.
- [ ] Confirma una jornada futura y comprueba que aparece en Calendario sin aumentar el saldo. Registra una de hoy y revisa el aumento.
- [ ] Registra un abono parcial y revisa el saldo pendiente. Registra un excedente y revisa el saldo a favor. Oculta los montos y comprueba el historial.
- [ ] Cancela el abono y comprueba la referencia en el historial. Exporta el JSON ficticio, restáuralo y verifica importes, asignaciones y cobertura.
- [ ] Recorre el formulario con teclado y lector de pantalla, comprueba la presentación móvil y abre y recarga la PWA offline.
