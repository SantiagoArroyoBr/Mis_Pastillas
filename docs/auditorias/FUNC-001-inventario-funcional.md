# FUNC-001 — Inventario funcional y mejoras propuestas

**Estado:** inspección estática del código en `development`, commit `f381219e31e515ba34096446d5c7109d8ae73937` (2026-10-31). Este informe reemplaza como referencia vigente al inventario AUD-001, que describe un estado anterior del código. No se cambiaron código, reglas, persistencia ni datos.

## Alcance y niveles de evidencia

Se inspeccionaron `index.html`, `app.js`, `compatibility.js`, `domain.js`, `payments.js`, `inventory.js`, `care-ui.js`, `appointments.js`, `forms.js`, `sharing.js`, `sw.js`, `manifest.json` y `tests/persistence.spec.js`. La suite local registrada en VAL-002 pasó 25/25 en Microsoft Edge 156.0.4314.50 con datos ficticios y perfil aislado; su cobertura se concentra en persistencia, restauración, seguridad de notificaciones, integraciones interceptadas y PWA/offline. No se repitió en esta tarea porque no hubo cambios de código. La prueba de la Preview que reportó el responsable se registra separadamente como una declaración manual sin resultados detallados disponibles.

“Implementado” significa que el código contiene la función; no afirma que cada caso de uso se haya probado manualmente. Los riesgos y mejoras propuestos no describen fallos confirmados fuera de la evidencia indicada.

## Inventario por área

### Pacientes

- **Estado:** parcialmente implementado como fichas locales. Hay dos fichas iniciales; se puede cambiar el nombre y cambiar la ficha seleccionada. No hay alta, baja, reordenamiento, cuentas ni perfiles autenticados.
- **Módulos:** `app.js` (estado, navegación y selección), `care-ui.js` (presentación de pagos/enfermería), `appointments.js` (referencia de citas), `compatibility.js` (estado y migración).
- **Reglas:** las fichas viven en `S.p`; citas y partes del estado de pagos se relacionan con la posición numérica de la ficha.
- **Límites:** el modelo no tiene ID estable de paciente; usa índices de ficha. No existe UI para crear, eliminar ni reordenar pacientes. La referencia por posición requeriría revisión si en el futuro se introduce reordenamiento o eliminación.
- **Mejora aplicada en DEV-001:** la lista usa el índice de ficha como valor interno y muestra “Ficha N” cuando hay nombres repetidos; conserva `a.i` y el formato de respaldo actual. Citas anteriores siguen editables y no se reasocian automáticamente.
- **Dependencias/riesgo:** no requiere backend ni migración. DEV-001 agrega regresión con nombres duplicados, recarga y JSON para evitar nuevas asociaciones erróneas.
- **Evidencia:** `compatibility.js` (`defaultState`, validación/migración); `app.js` (carga del estado y pestañas); `appointments.js` (`apptForm`); `forms.js` (campo `select`).

**Seguimiento DEV-001 (2026-10-31):** la selección por nombre se reemplazó por un selector cuyo valor es el índice de ficha ya utilizado en `cita.i`. Las opciones con nombres iguales se distinguen como “Ficha N”; citas anteriores continúan leyendo y editando su mismo índice. No se añadió un ID ni se migró el formato. La suite final pasó 26/26 en Edge 156.0.4314.50.

### Medicamentos y consumos independientes

- **Estado:** implementado. Cada ficha permite alta, edición, corrección de saldo, compra adicional y eliminación. Una ficha de medicamento admite varias pautas de consumo; cada pauta tiene dosis, horarios y modalidad diaria, días fijos o intervalo.
- **Módulos:** `inventory.js` (formularios y operaciones), `domain.js` (normalización, eventos, calendario y cálculo), `compatibility.js` (validación/migración), `app.js` (persistencia y coordinación).
- **Reglas:** `domain.js` suma los eventos de todas las pautas asociadas a una ficha y descuenta las dosis posteriores a `t0`; no permite que el saldo calculado sea menor que cero. La proyección busca eventos hasta 365 días adelante.
- **Límites:** no se registran tomas reales; el cálculo estima consumo según horarios configurados y tiempo transcurrido. La cobertura automatizada actual no constituye una matriz completa de frecuencias, solapamientos y límites de calendario.
- **Mejora posible:** ampliar la explicación visible y la cobertura determinista para casos con varias pautas concurrentes, frecuencias y saldo próximo a cero.
- **Dependencias/riesgo:** cambio de presentación y pruebas puede conservar datos y esquema; cambiar el motor de cálculo puede alterar saldos proyectados y fechas de compra. Riesgo medio para continuidad y confianza en inventario.
- **Evidencia:** `inventory.js` (`medForm`); `domain.js` (`dayMatches`, `evs`, `calc`, `consText`).

### Inventario compartido y alertas de reposición

- **Estado:** implementado con alcance por ficha. Las pautas de consumo de una misma ficha comparten el saldo `base` y el origen temporal `t0`. Fichas separadas, aunque tengan igual nombre o correspondan a la misma medicina en otra persona, mantienen saldos independientes. No existe inventario global compartido entre pacientes.
- **Módulos:** `domain.js` (saldo/proyección/estado); `payments.js` (`pillEvents`, marcadores del calendario); `app.js` (pendientes de Inicio y aviso de reposición); `inventory.js` (presentación de fichas y compra).
- **Reglas:** la proyección estima la última toma completa dentro del horizonte; muestra estados bien, comprar pronto o urgente y sugiere comprar hasta dos días antes. El calendario y el Inicio reflejan esos eventos estimados.
- **Límites:** la palabra “compartido” solo describe varias pautas dentro de una misma ficha; no agrega existencias entre fichas. No hay alerta por toma. El estado depende de los horarios, dosis, fecha base y reloj local.
- **Mejora posible:** aclarar en formularios y tarjetas que una ficha tiene un saldo común a sus pautas; preguntar primero si la familia necesita un inventario común entre fichas antes de proponer almacenamiento global.
- **Dependencias/riesgo:** la aclaración de interfaz no requiere cambio de datos; un inventario transversal requeriría definición de producto y un diseño/migración de datos, por lo que no se recomienda en el siguiente cambio incremental. Riesgo alto si se consolidan saldos automáticamente.
- **Evidencia:** `domain.js` (`calc`, `consText`); `payments.js` (`pillEvents`); `app.js` (`renderHome`, render de Medicinas y `notifyDaily`).

### Insumos, compras y precios

- **Estado:** implementado. Hay fichas de insumo con saldo, consumo diario positivo, compras, registro manual de precios, estimación mensual y comparación de la última anotación por tienda.
- **Módulos:** `inventory.js` (insumos, compras, precios y gasto); `domain.js` (cálculo del saldo y calendario); `app.js` (Inicio/calendario y guardado).
- **Reglas:** el consumo de insumo se modela como una dosis fija cada día a las 08:00. Una compra suma cajas × unidades al saldo disponible. Se conservan hasta 40 precios por ficha; el gasto aproximado usa el precio unitario más reciente y el consumo proyectado de 30 días.
- **Límites:** el costo es una estimación, no transacción; los precios dependen de anotaciones manuales. El texto del formulario describe `0.5` piezas/día como una pieza cada dos días; el motor descuenta media pieza cada día, equivalente en cantidad acumulada pero no en fechas discretas de evento.
- **Mejora posible:** explicar la naturaleza estimada y la granularidad diaria del consumo; añadir pruebas de fracciones y horizonte de gasto.
- **Dependencias/riesgo:** no requiere cambio de esquema si se conserva la representación actual. Riesgo bajo para aclaraciones; medio para alterar cadencia o redondeo porque cambia fechas proyectadas.
- **Evidencia:** `inventory.js` (`supForm`, `supAdd`, `addBuy`, `monthCost`, `bestShop`); `domain.js` (`evs`, `calc`).

### Enfermeros y turnos

- **Estado:** implementado como datos operativos por ficha: alta/edición/quitar enfermero, color, asignación diaria y repetición semanal hasta el fin del mes actual.
- **Módulos:** `care-ui.js` (formularios, listas y calendario diario); `payments.js` (consulta de asignaciones para cobertura); `app.js` (Inicio/calendario y eventos).
- **Reglas:** evita duplicar nombres de enfermero en una ficha ignorando mayúsculas. Las asignaciones guardan nombres; al renombrar un enfermero, el código actualiza las asignaciones guardadas que coincidan. Asignar un patrón semanal evita duplicados por nombre en cada fecha.
- **Límites:** son registros locales, no cuentas de acceso ni calendario de disponibilidad. La repetición semanal termina en el mismo mes. No se registra inicio/fin de turno por enfermero.
- **Mejora posible:** probar asignaciones repetidas, domingos, cambios de nombre y colisiones; mejorar la vista para distinguir disponibilidad de asignación efectiva si el responsable confirma esa necesidad.
- **Dependencias/riesgo:** las mejoras de interfaz/pruebas no requieren backend. Cambiar representación de asignaciones afecta datos y cálculos de pagos; riesgo medio/alto.
- **Evidencia:** `care-ui.js` (`nurseForm`, `dayForm`); `app.js` (`renderHome`, `calHTML`); `payments.js` (`cover`).

### Pagos y periodos cubiertos

- **Estado:** implementado como control local auxiliar, no como procesamiento de pagos. Se puede configurar pagador, fecha base, tarifa diaria opcional, tipo de turno, notas y registrar días pagados.
- **Módulos:** `care-ui.js` (formularios/tarjetas), `payments.js` (cobertura, deuda, resúmenes), `compatibility.js` (compatibilidad de configuración), `app.js` (avisos e integración con Inicio/calendario).
- **Reglas:** desde la fecha base se ordenan las fechas con al menos un enfermero asignado. La suma de días pagados cubre las primeras fechas; las vencidas sin cobertura producen deuda; una tarifa se multiplica por días asignados/no cubiertos. El registro de pago suma un número entero de días, de 1 a 366.
- **Límites:** la opción “Tiempo completo/Medio tiempo” se guarda y se muestra, pero `cover()` cuenta una fecha como un día cuando existe al menos una asignación y no pondera el tipo de turno. El plazo `lead` se normaliza y persiste, pero no se edita en la pantalla actual ni afecta el resultado: la cobertura solo clasifica vencido/no vencido. La notificación genérica dice “pagos de cuidado próximos” aunque `due()` selecciona estados vencidos (`red`). La app no mueve dinero ni concilia comprobantes.
- **Mejora posible:** decidir con el responsable las reglas de día completo/medio día, varios enfermeros en una fecha, fecha efectiva del pago y anticipación del aviso. Después alinear textos y cálculos con esa decisión; conservar registros existentes y probar fixtures pequeños.
- **Dependencias/riesgo:** requiere definición funcional antes de alterar cálculos. Riesgo alto por impacto en deuda/tarifa percibida; no cambiar conteos ni esquema hasta aprobar reglas y una estrategia compatible.
- **Evidencia:** `care-ui.js` (`payForm`, `payRegForm`); `payments.js` (`cover`, `oweSummary`, `lastPay`, `due`); `compatibility.js` (`migrate`); `app.js` (`payNotice`, `notifyDaily`).

### Citas y pendientes

- **Estado:** implementado. Permite crear, editar y quitar citas asociadas a ficha; consulta citas futuras y hasta tres recientes. Inicio resume citas de hoy y los siguientes dos días y agrega pendientes derivados de inventario, pagos y asignación de enfermero.
- **Módulos:** `appointments.js` (citas y vencimiento próximo); `app.js` (pendientes, calendario y navegación); `care-ui.js` (detalle del día).
- **Reglas:** la cita almacena posición de ficha, fecha, hora opcional, lugar/profesional y nota; se puede preparar una plantilla de Calendar. Los pendientes se derivan, no se editan como tareas generales.
- **Límites:** selección de paciente por nombre puede asociar una cita a la ficha incorrecta cuando hay nombres duplicados. Las validaciones de fecha de formularios usan forma `YYYY-MM-DD`; no existe una lista editable de tareas. El acceso a Calendar es externo y no sincroniza la cita de vuelta.
- **Mejora posible:** corregir la selección por identidad de ficha y agregar casos de prueba para duplicados y fechas; evaluar tareas editables solo si se demuestra necesidad, definiendo impacto en datos antes.
- **Dependencias/riesgo:** la selección puede mantener el esquema actual. Añadir tareas crea nuevos registros persistidos y requiere especificación y compatibilidad; riesgo bajo para selector, alto para expansión de datos sin diseño.
- **Evidencia:** `appointments.js` (`apptList`, `apptDue`, `apptForm`, `apptCalUrl`); `app.js` (`renderHome`, `calHTML`, `payAction`).

### Notificaciones

- **Estado:** implementado parcialmente. Solicita permiso desde la interfaz; al renderizar, si el permiso ya está concedido, puede emitir un aviso general de reposición, deuda o citas próximas.
- **Módulos:** `app.js` (`notifyDaily`, botón `notif`), `payments.js` (`due`), `appointments.js` (`apptDue`), `domain.js` (`calc`).
- **Reglas:** máximo un aviso por día local; registra el marcador si encontró pendientes; el texto no incluye nombre de paciente o medicina. Depende de abrir/renderizar la app.
- **Límites:** no hay Push API, planificación en segundo plano ni recordatorios de toma. Los avisos no se actualizan durante el día después de emitirse uno. La frase de pagos “próximos” no concuerda con la condición de deuda vencida descrita arriba.
- **Mejora posible:** corregir la descripción de estado y el texto de pagos, conservar el contenido genérico y probar permisos, deduplicación y límites. Push queda fuera de alcance sin decisión de arquitectura/backend.
- **Dependencias/riesgo:** ajuste de texto/pruebas es local, sin esquema; cambiar frecuencia/permisos puede sorprender a familiares. Riesgo bajo/medio según el cambio.
- **Evidencia:** `app.js` (`notifyDaily`); prueba de privacidad de contenido en `tests/persistence.spec.js`.

### WhatsApp y Calendar

- **Estado:** implementado como enlaces externos mediados por una vista de revisión. WhatsApp genera un resumen del paciente seleccionado; Calendar recibe una plantilla de compra o cita.
- **Módulos:** `sharing.js` (vista previa, edición/cancelación y apertura), `app.js` (resumen), `domain.js` (plantilla de compra), `appointments.js` (plantilla de cita).
- **Reglas:** el usuario puede revisar/editar el texto antes de abrir el destino; la aplicación no envía automáticamente ni sincroniza.
- **Límites:** al confirmar, los datos seleccionados se transmiten al servicio externo elegido. La disponibilidad, cuenta y apariencia del servicio dependen del proveedor y red.
- **Mejora posible:** conservar revisión/cancelación y aclarar qué campos se incluyen; mantener interceptación/cancelación en pruebas.
- **Dependencias/riesgo:** no requiere dependencias locales; cualquier cambio de integración puede divulgar más datos. Riesgo alto de privacidad si se altera el contenido.
- **Evidencia:** `sharing.js` (`preview`); `app.js` (acción `share`); `appointments.js` (`apptCalUrl`); pruebas de WhatsApp y Calendar en `tests/persistence.spec.js`.

### Respaldos y restauración

- **Estado:** implementado. Exporta el estado local como JSON y permite seleccionar un archivo para restaurar.
- **Módulos:** `app.js` (exportación, importación, confirmaciones y guardado transaccional en memoria); `compatibility.js` (validación, integridad y migración); `tests/persistence.spec.js` (regresión sintética).
- **Reglas:** rechaza archivos mayores a 10 MiB antes de leerlos; valida estructura/migración; presenta fecha y conteos; requiere dos pasos de confirmación. Antes de restaurar ofrece exportar el estado actual si el almacenamiento está disponible. Una falla de lectura/validación/escritura evita reemplazar el contenido original.
- **Límites:** los JSON son legibles y no están cifrados por la app; el respaldo previo depende de que el usuario lo elija. La suite usa fixtures, no verifica respaldo familiar real.
- **Mejora posible:** mejorar guía y señales de éxito/error alrededor de exportación/restauración; no hacer automático un cambio de flujo destructivo sin decisión y prueba de recuperación.
- **Dependencias/riesgo:** cualquier alteración debe mantener `pastillas-v1`, formato de respaldo y recuperación; riesgo alto de pérdida si se cambia validación o orden de escritura.
- **Evidencia:** `app.js` (`STORAGE_KEY`, `save`, evento `exp`, `confirmRestore`, `showRestoreConfirmation`, `impFile`); `compatibility.js`; pruebas de restauración de `tests/persistence.spec.js`.

## Hallazgos transversales

- La arquitectura modular se conserva: scripts locales síncronos, APIs acotadas en `window.Acompana…`; `app.js` orquesta y mantiene la escritura central a `pastillas-v1`. No hay backend/Auth ni sincronización multi-dispositivo comprobados.
- La suite automatizada **25/25** citada arriba es una verificación previa local; no equivale a prueba manual de Preview ni cubre cada regla de negocio.
- La referencia histórica [AUD-001](AUD-001-inventario-funcional.md) sigue disponible para su fecha/commit originales, pero varias observaciones allí están desactualizadas respecto a módulos, tema, cacheo y cobertura actuales.
