# FIX-FECHA-002 · Integridad de recibos históricos

Implementación local del 13 de noviembre de 2026 en `development`. PREVIEW-011 sigue pendiente de revisión y autorización del propietario.

## Reproducción y decisión DATA-006

En un perfil aislado, restaura un respaldo ficticio que incluya un recibo activo con `date: "2020-02-30"`, ID único e importe entero positivo en centavos. El libro general admitía esa cadena por su formato y aplicaba el importe al saldo. La presentación sustituía el texto original por un mensaje genérico y el orden del historial comparaba la fecha imposible con fechas reales. Eliminar o corregir el movimiento durante la restauración podía perder evidencia o alterar el saldo.

La captura reutiliza `isValidDateOnly` de `compatibility.js` para comprobar mes, día y año bisiesto. `forms.js` enfoca la fecha si falta o es imposible, la marca con `aria-invalid` y vincula el mensaje con `aria-describedby`. El importe y la nota siguen en el formulario. `saveGeneralMovement` valida antes de intentar guardar. Los anticipos con fecha futura válida siguen permitidos. Los recibos generales se corrigen mediante cancelación y nueva captura.

La carga, exportación y restauración JSON preservan `pastillas-v1` y el libro original. Se comprueban estructura, IDs, importe en centavos y vínculo único entre cancelación y recibo. La comparación de fechas de cancelación se aplica cuando ambas son válidas. Con una fecha histórica imposible, la referencia al recibo y su posición anterior en el libro sostienen la trazabilidad. Una nueva cancelación exige una fecha válida y solo se agrega por confirmación explícita.

Para restaurar una copia con una cancelación nueva cuya fecha ordenaba antes del texto inválido del recibo, usa FIX-FECHA-002 o posterior. Las versiones anteriores pueden rechazar esa combinación al comparar las cadenas.

## Historial y saldo

Los movimientos fechados se muestran de más reciente a más antiguo. Los movimientos con fecha imposible aparecen al final en orden de almacenamiento, con el texto original y la advertencia visible **Fecha histórica inválida**. La explicación dice «Este registro conserva su importe original, pero la fecha necesita revisión». Se comprobó el contraste del texto ámbar sobre el fondo del historial, apertura con teclado, reflujo a 320, 390, 768 y 1280 px y ocultación de importes en el historial y la confirmación.

El motor mantiene el corte de jornadas en hoy y aplica los recibos activos por ID. Una cancelación retira el efecto de su recibo y conserva ambos movimientos. El prepago de la ficha y las aplicaciones individuales PAG-001 mantienen sus reglas y registros propios. La comparación usa el mismo respaldo ficticio en v13 y v14.

| Dato | v13 | v14 |
| --- | ---: | ---: |
| Jornadas devengadas | $50.00 | $50.00 |
| Abonos activos | $931.25 | $931.25 |
| Saldo pendiente | $0.00 | $0.00 |
| Saldo a favor | $881.25 | $881.25 |
| Movimientos generales | 4 | 4 |
| Movimientos con fecha histórica imposible | 3 | 3 |

El caso incluye una jornada futura de $400, un recibo activo válido de $300, uno activo con fecha imposible de $631.25 y un recibo de $700 con su cancelación. Incluye también un prepago de un día y una aplicación individual de $10. La exportación y la restauración conservan el libro y el saldo. Al cancelar expresamente el recibo de $631.25 quedan $250.00 a favor y cinco movimientos.

## QA-021 y PWA-005

La suite incluye captura de un bisiesto y límites de mes, futuro válido, fechas imposibles o vacías, conservación del borrador, fallo de escritura, restauración, cancelación, recarga, exportación, contraste, teclado y privacidad. Las regresiones existentes cubren concurrencia entre pestañas, los tres estados de saldo, jornadas de hoy y futuras, asignaciones, modalidades, tarifa cero y ausente, repetición e historial de costos guardados.

El service worker precarga los recursos locales en `acompanha-v14`. La prueba de actualización usa los archivos exactos de `6f82eff` para v13 mediante `ACOMPANHA_PREVIOUS_ASSETS` y el escenario `la PWA abre y recarga offline` de `tests/persistence.spec.js`. Comprueba la espera con un borrador abierto, activación al cerrar el cliente anterior, recursos nuevos, conservación del JSON, lectura del historial y registro de un abono válido offline.

La suite completa pasó **78/78** en Microsoft Edge 157.0.4341.46 y Node.js 24.20.0 con `node --test tests/payments.spec.js tests/persistence.spec.js`. Conserva las 76 pruebas anteriores y agrega dos. La actualización real v13 a v14 pasó **1/1** en una ejecución separada. Los flujos instrumentados comprobaron la ausencia de errores del navegador. Se validaron la sintaxis de los scripts, el JSON de `manifest.json` y `git diff --check`.

## PREVIEW-011 · Validación pendiente del propietario

- [ ] En un perfil aislado, abrir una futura Preview autorizada y verificar rama y SHA del paquete.
- [ ] Con una ficha ficticia, asignar jornadas completas y medias con tarifa cero y ausente. Revisar repetición, costos guardados y acciones de teclado.
- [ ] Abrir Pagos a 320, 390, 768 y 1280 px. Revisar los tres estados del saldo y ocultar montos antes de abrir historial y cancelación.
- [ ] Restaurar un JSON ficticio con fecha histórica imposible, confirmar fecha original, advertencia y saldo, exportar y recargar. Intentar capturar esa misma fecha y corregirla con el foco en el campo.
- [ ] En un dispositivo de prueba, conservar un borrador mientras espera la actualización. Guardar o cancelar antes de cerrar los clientes anteriores, reabrir y probar consulta y captura offline.
- [ ] Revisar con lector de pantalla la fecha histórica, la explicación y el foco del formulario.

La revisión automatizada usa Edge de escritorio con perfil temporal y datos ficticios. Quedan pendientes lectores de pantalla, dispositivos físicos y la revisión en Vercel Preview.

**PLAN-010, PLAN-011 y FIX-FECHA-002 están preparados para revisión del propietario. No se ha realizado push ni despliegue. Se necesita autorización explícita para publicar en development.**
