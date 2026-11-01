# DEV-003B — Propuesta de reglas de pagos y cobertura

- **Estado:** propuesta técnica; las reglas de negocio no están aprobadas.
- **Base de inspección:** rama `development`, `db944e5d4139cba185cd46aa330793046667db46`, más la corrección FIX-001 local.
- **Persistencia vigente:** clave `pastillas-v1`; no se propone cambiarla.

## 1. Resumen

El código actual registra enfermeros por ficha, asignaciones por fecha, una modalidad global `time`, pagos con conteo de días `n`, importe opcional `a`, fecha de registro `d` y marca `old`, además de una tarifa `rate` y fecha base `base`. Sin embargo, no enlaza un pago a fechas o turnos concretos. La cobertura consume fechas con asignaciones en orden cronológico hasta sumar el conteo de días pagados. La tarifa y los desgloses se estiman aparte.

Esta separación deja sin resolver si se cobra por día calendario, persona o turno, cómo afectan las medias jornadas y cómo aplicar un abono monetario. El cambio FIX-001 elimina únicamente la poda automática de asignaciones de más de 400 días; no altera el significado actual de pagos ni los cálculos.

La recomendación es decidir primero ejemplos numéricos y fecha efectiva. Si se elige cobertura por fracciones, reparto por persona o conciliación de dinero, el modelo actual no basta para representar sin ambigüedad todas las decisiones. No se deben reconstruir importes o asignaciones históricas por inferencia.

## 2. Reglas y comportamiento comprobados

| Tema | Regla actual observada | Evidencia |
|---|---|---|
| Enfermeros | Cada ficha mantiene nombres y colores; un nombre repetido no se admite dentro de la misma ficha. | `care-ui.js`, `nurseForm()`; `app.js`, `nurList()` |
| Turno completo/medio | `cfg.time` es un valor global por ficha (`full`/`half`) y se muestra junto a la configuración; no está en cada asignación. | `care-ui.js`, `payForm()` y `dayForm()` |
| Asignación | `pay.v[fecha][índiceFicha]` contiene cero o más `{n}`; una fecha permite más de una persona y evita duplicar el mismo nombre. | `care-ui.js`, `dayForm()` |
| Días cubiertos | `cover()` cuenta fechas únicas con asignación desde `base`. Cada fecha ocupa una unidad, sin consultar `time`, el número de enfermeros o una duración. | `payments.js`, `cover()` |
| Pagos registrados | El formulario añade `{d,n,a,old:false}`; `n` debe ser entero de 1 a 366. `a` es opcional. | `care-ui.js`, `payRegForm()` |
| Aplicación del pago | `cover()` suma `n` de pagos no antiguos y asigna esa cantidad a las primeras fechas cronológicas. No consulta `d` ni `a`. | `payments.js`, `cover()` |
| Periodo | No hay entidad de periodo ni relación pago-fecha. `base` establece desde cuándo entran fechas a la lista. | `app.js`, `cfg()`; `payments.js`, `cover()` |
| Pago antiguo | `resetForm()` marca todos los pagos existentes `old=true` y cambia `base`; el historial sigue visible pero deja de entrar en la cobertura calculada. | `care-ui.js`, `resetForm()` |
| Tarifa | `rate` se aplica a conteos de días y resúmenes; cada asignación de enfermero en una fecha puede sumar una tarifa completa al desglose. | `payments.js`, `oweSummary()` y `lastPay()` |
| Ediciones | Cambiar `base`, `rate` o `time`, renombrar/borrar asignaciones o quitar un pago puede cambiar cálculos derivados actuales. No se congelan periodos ni importes calculados. | `care-ui.js`, `payForm()`/`nurseForm()`; `app.js`, `payAction()` |
| Conservación | FIX-001 suprime la eliminación por edad de `pay.v`. No recupera entradas eliminadas anteriormente ni cambia el historial `pays`. | `care-ui.js`, `dayForm()`; caso QA-003 |

`compatibility.js` normaliza los elementos de `pays` y convierte un formato anterior de asignaciones a `pay.v`; no introduce asociaciones entre pagos y fechas. No se encontró otra poda por antigüedad en las funciones administrativas revisadas de enfermería/pagos. El diagnóstico no afirma cuál es el acuerdo económico real de la familia.

## 3. Alternativas funcionales

### 3.1 Cobertura de jornadas

| Alternativa | Regla | Ventajas | Desventajas, compatibilidad y datos |
|---|---|---|---|
| A. Días calendario (actual) | Toda fecha con una o más asignaciones equivale a 1. | Cero cambios de estructura; máxima continuidad con pagos `n` enteros. | No distingue medio turno ni varios turnos; deja `time` sin efecto contable. No resuelve el problema funcional actual. |
| B. Fracción por fecha | Una fecha vale 1 para turno completo o 0.5 para medio turno, como máximo una unidad diaria. | Fácil de explicar y puede aprovechar el `time` global existente. | Historial no guarda el `time` efectivo de cada fecha. Aplicarlo hacia atrás reinterpretaría fechas; aplicar solo desde fecha efectiva requiere una regla de corte. Los pagos enteros actuales no expresan fracciones. |
| C. Suma de asignaciones con tope | Cada asignación tiene unidad/duración; sus fracciones se acumulan hasta un tope por fecha acordado. | Representa turnos múltiples y límites diarios explícitos. | No existe duración ni tipo por asignación. Requiere nuevo dato para cada turno; el `time` global no basta y la unidad de pago queda por definir. |
| D. Cobertura por persona-turno | Cada asignación ocupa una unidad independiente, posiblemente con fracción. | Permite contar servicios individuales sin consolidarlos implícitamente. | Puede multiplicar días requeridos y deuda cuando hay reemplazos o solapes. Requiere identificar turnos/personas y clarificar costos. No compatible con la interpretación actual de `n` sin especificación de fecha efectiva. |

### 3.2 Costo y tarifas

1. **Tarifa por fecha de ficha:** un importe por día cubierto, sin importar cuántas personas haya. Conserva la expectativa visual actual de `rate` por día, pero no reparte costo por enfermero.
2. **Tarifa por asignación/turno:** cada servicio tiene importe propio o una tarifa derivada del tipo de turno. Representa reemplazos y varias personas, pero requiere guardar tipo, tarifa efectiva y asignación por turno; editar la tarifa actual no debería revalorar servicios consolidados.
3. **Tarifa global estimada:** mantener `rate` como estimación agregada y rotularla como tal, con cálculo separado de los pagos efectivos. Es la opción transitoria de menor riesgo, pero no concilia costos y abonos.

El responsable debe decidir si un importe debe ser dinero efectivamente pagado, deuda estimada o costo devengado; la interfaz actual mezcla conteo de días con valores estimados.

### 3.3 Pagos parciales

1. **Solo conteo vigente:** conservar `n` como única entrada que afecta cobertura y tratar `a` como nota histórica informativa. Es compatible y mantiene cálculos, pero un abono menor al estimado no reduce saldo monetario.
2. **Libro monetario:** registrar fecha e importe de cada pago y calcular saldo monetario por servicios/tarifas efectivos. Requiere especificar monto adeudado, moneda/redondeo, aplicación FIFO o selección manual, reembolsos y fecha efectiva; los importes legados no están asociados a servicios.
3. **Dos saldos explícitos:** mantener cobertura de días y agregar saldo monetario independiente. Evita equiparar pesos con jornadas, pero añade conceptos, campos y validaciones en formulario, respaldo, restauración y pruebas.

No es seguro deducir un pago parcial en días a partir de `a / rate` sin confirmar tarifa uniforme, periodo de aplicación y redondeo.

### 3.4 Periodos y asignación de pagos

1. **Conteo FIFO desde base (actual):** suma pagos activos y aplica unidades a las primeras fechas sin pago desde `base`. Sin campos nuevos; eliminar o añadir un pago puede desplazar fechas cubiertas.
2. **Periodos explícitos:** definir rangos calendario (semanal/quincenal/mensual) y vincular cada pago a un periodo. Da visibilidad y reduce desplazamientos, pero requiere periodo, límites inclusivos, excepciones y campos o referencia inequívoca en el pago.
3. **Fechas de servicio elegidas:** cada pago cubre fechas/turnos específicos. Máxima trazabilidad, pero no existe relación actualmente; requiere referencias estables, validación de saldos y tratamiento de cambios/cancelaciones.

Un pago adelantado podría cubrir deuda más antigua, fechas futuras o un periodo seleccionado. Es una decisión de negocio, no deducible del `d` de registro actual.

### 3.5 Cambios y registro histórico

1. **Cálculo vivo:** cambios a tarifa, fecha base y asignaciones afectan vistas derivadas actuales. Menor complejidad, pero puede reinterpretar el pasado.
2. **Cierre por fecha efectiva:** conservar pagos ya registrados y aplicar reglas nuevas desde una fecha acordada. Requiere periodos cerrados o una fecha de vigencia por regla y experiencia para correcciones.
3. **Historial de eventos inmutable:** registrar alta, edición, cancelación y corrección como eventos con actor/fecha/motivo; no sobrescribir hechos originales. Alta trazabilidad y complejidad alta; exige nuevos datos y controles de edición/privacidad.

FIX-001 conserva asignaciones por fecha sin crear una bitácora de quién las cambió. No se debe presentar esa mejora como ya resuelta.

## 4. Compatibilidad técnica y riesgos

| Cambio eventual | ¿Es posible sin ampliar esquema? | Riesgo y precaución |
|---|---|---|
| Mantener la regla de día completo actual y aclarar su explicación | Sí. | Menor riesgo; no cambia saldos. |
| Aplicar medio turno a fechas ya guardadas | No sin reinterpretar, pues `pay.v` no guarda el tipo vigente por fecha. | Puede cambiar periodos cubiertos; requiere corte aprobado o captura por fecha y comparación contra respaldo. |
| Sumar múltiples turnos o calcular por servicio | No con `{n}` solamente; hoy la asignación contiene nombre y las fechas agrupan la lista. | Se necesitan datos de duración/tipo y una identidad estable si se desea editar un turno específico, además de estrategia de convivencia con legado. |
| Conciliar pagos parciales en dinero | No de forma inequívoca; `a` existe, pero no referencia tarifas, periodo ni servicios. | Podría reinterpretar dinero legado. No reconstruir ni migrar hasta definir destino y conservar los bytes exportados originales. |
| Periodos explícitos/fecha de servicio | No; `pays[]` carece de asignaciones o rango de cobertura. | Una extensión requiere validación de imports/exports/migraciones y pruebas de datos anteriores. |
| No borrar asignaciones por edad (FIX-001) | Sí; no altera el formato. | Conserva datos futuros y existentes; aumenta el tamaño local/exportado con el paso del tiempo. Gestionar tamaño solo mediante política separada, explícita y aprobada. |

Para cualquier futura extensión de persistencia, usar el flujo actual `validateStoredState` → `validateMigrationInput` → `prepareMigratedState` y `assertMigrationIntegrity`; añadir pruebas de ida y vuelta JSON, rechazo sin sobreescritura, respaldo previo y comparación de fixtures anteriores. No cambiar la clave `pastillas-v1` ni hacer migración en DEV-003B sin aprobación explícita para alcance y respaldo.

## 5. Riesgos principales

- **Alto — cambios retrospectivos:** alterar `time`, `rate` o `base` sin fecha efectiva puede cambiar días y montos mostrados para datos existentes.
- **Alto — confundir dinero y días:** el formulario actual registra ambos campos pero el cálculo solo usa `n`; asignar automáticamente `a` a jornadas podría inventar equivalencias.
- **Alto — varias personas:** el resumen por enfermero puede multiplicar tarifa mientras el indicador de deuda cuenta fechas únicas.
- **Medio — conservar indefinidamente:** eliminar la poda evita pérdida por edad y preserva historial, pero aumenta `localStorage` y respaldos. No reintroducir poda silenciosa.
- **Medio — correcciones manuales:** renombrar y quitar asignaciones cambia representación/cálculos; no se conserva historial de edición.
- **Medio — avisos:** `lead` no se aplica en `due()` y el texto puede llamar “próximo” a deuda vencida; no modificar en DEV-003B sin acordar umbral y semántica.

## 6. Plan de implementación propuesto

Cada etapa requiere regla firmada con ejemplos y pruebas antes del código. No hay autorización funcional implícita en esta propuesta.

1. **DEV-003B.1 — Especificación de cobertura:** decidir unidad, medio turno, múltiples asignaciones, tope, fechas efectivas y solapes. Especificar tabla de entradas/salidas con fechas congeladas.
2. **DEV-003B.2 — Costos:** definir tarifa por día/persona/turno, variaciones, tarifa vigente y redondeo. Determinar si lo actual es estimación o deuda contable.
3. **DEV-003B.3 — Pagos parciales:** decidir saldo monetario frente a cobertura de jornadas, aplicación del pago, anticipos, cero, reembolsos y discrepancias históricas.
4. **DEV-003B.4 — Periodos:** elegir FIFO desde base, periodos explícitos o fechas vinculadas; fijar inclusividad y comportamiento al eliminar/editar.
5. **DEV-003B.5 — Integridad histórica:** elegir cierre por fecha efectiva o bitácora; definir correcciones/cancelaciones, exportación y retención. Eliminar cualquier limpieza silenciosa por edad permanece prohibido.
6. **DEV-003B.6 — Interfaz y reportes:** rotular por separado cobertura, deuda estimada y pagos efectuados; separar información por persona y ficha; conservar ocultamiento de importes.

La primera entrega debe ser un motor de cálculo puro aislado de la UI, usando las reglas aprobadas y fixtures inventados. La integración a persistencia se diseña después de comprobar si hacen falta nuevos campos. No crear código provisional mientras las reglas sigan abiertas.

## 7. Pruebas de aceptación propuestas

1. Reproducir la tabla de ejemplos aprobada para fechas consecutivas, huecos, hoy y fechas futuras.
2. Casos de un turno completo, uno medio, dos medios, completo más medio y varios enfermeros, según la regla seleccionada.
3. Pagos con cantidad e importe concordantes, menores, mayores, nulos y cero; aplicar regla FIFO/periodo elegida.
4. Cambiar tarifa o modalidad antes y después de la fecha efectiva y comprobar importes históricos invariantes donde así se apruebe.
5. Editar, quitar o cancelar asignación antes/después de cierre y verificar auditoría/saldo conforme a la regla.
6. Confirmar independencia entre fichas, aislamiento de componentes y redondeo monetario.
7. Comparar resultados de fixtures existentes antes/después para los casos donde la regla aprobada no debe cambiar.
8. Verificar roundtrip JSON, restauración compatible de fixtures legados, cancelación sin escritura y fallo de almacenamiento sin pérdida.
9. Verificar `pastillas-v1` sin migración si la solución acordada no la requiere; si sí la requiere, no comenzar implementación hasta aprobarla por separado.
10. Responsive y accesibilidad: etiquetas inequívocas, estados sin color como único indicador y resumen entendible por familiar.

## 8. Decisiones pendientes del responsable

1. ¿Qué unidad se paga: fecha de la ficha, persona asignada o cada turno? ¿Hay un máximo de cobertura por día?
2. ¿Medio turno equivale a 0.5, tarifa separada, o no modifica cobertura? ¿La regla aplica solo desde qué fecha?
3. ¿Qué representa `rate`: monto estimado diario de la ficha, tarifa por persona/turno o acuerdo diferente? ¿Cuándo entra en vigor cada cambio?
4. ¿Se registran pagos parciales monetarios? ¿El saldo es dinero, días o ambos? ¿Cómo se aplica abono, anticipo, reembolso y ajuste?
5. ¿Se usan periodos? Indicar frecuencia, inicio/fin inclusivos, zona horaria y tratamiento de pagos adelantados.
6. ¿Cómo resolver turnos superpuestos, reemplazos, cancelaciones y cambios retrospectivos? ¿Se cierra el periodo o se recalcula con historial visible?
7. ¿Se conservarán todas las asignaciones indefinidamente? Para borrar/archivar se necesitaría una política independiente, explícita y aprobada.
8. ¿Qué significa `lead` y cuándo se debe avisar “por vencer” frente a “vencido”?
9. ¿Qué moneda y redondeo se usa? ¿Qué mostrar si falta tarifa?
10. ¿Se autoriza considerar nuevos campos/migración si la regla elegida no puede representarse con el esquema actual? Aprobarlo como cambio separado y definir copia/restauración.

Hasta recibir esas respuestas, solo están autorizados los cambios de preservación FIX-001 y las pruebas/documentación asociadas; los cálculos de cobertura, tarifas y pagos quedan sin cambios.

## Continuidad posterior — DEV-003C

El responsable delegó criterio para correcciones compatibles. La pausa descrita en este informe corresponde a su fecha original; ver [DEV-003C](DEV-003C-correcciones-compatibles-pagos.md) para el alcance implementado y las decisiones que siguen diferidas. No se introdujeron períodos, fracciones ni conciliación monetaria.

## Continuidad FIX-002/FIX-003 — 2026-10-31

La reproducción sintética confirmó dos límites. Primero, `rate` es global por día y `pay.v` cuenta fechas únicas; un fixture con dos asignaciones y `rate:100` produce una sola fecha y `$100` estimados, aunque muestra dos servicios. No existen tarifas por enfermero/servicio con las que confirmar `$200`; no se cambiará la unidad de `rate` por inferencia. Segundo, el registro `pays[]` es de ficha y no tiene destinatario; la cobertura de una fecha con A y B no prueba que se pagara a ninguno de manera individual.

DEV-003C conserva la estimación diaria y el historial global. FIX-002 amplía el resumen con un conteo de servicios separado e informa el límite de costos; no afirma costo total por servicio cuando las tarifas individuales no existen. FIX-003 queda pendiente porque exige identidad estable y un movimiento persistido con destinatario. Ver [propuesta FIX-003](FIX-003-propuesta-pagos-individuales.md). Pagos legados siguen sin conciliar; no se cambió esquema ni `pastillas-v1`.

### Actualización posterior: PAG-001 — 2026-10-31

El responsable autorizó después una extensión aditiva. PAG-001 implementa costos de asignaciones nuevas, pagos por ID de enfermero, abonos parciales y saldo por aplicaciones explícitas. La decisión adoptada es FIFO por fecha hasta la fecha del pago y rechazo de excedentes; no se crean anticipos. La cobertura por día y las demás opciones de DEV-003B no se reinterpretaron. Ver [modelo, límites y pruebas PAG-001](PAG-001-sistema-pagos-individuales.md).
