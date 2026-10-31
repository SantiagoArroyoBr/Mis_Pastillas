# DEV-003A — Diagnóstico de pagos, turnos y cobertura

- **Fecha:** 2026-10-31
- **Rama y base inspeccionada:** `development`, `db944e5d4139cba185cd46aa330793046667db46`
- **Tipo de trabajo:** inspección estática y propuesta; no se cambió código ni se ejecutaron pruebas de aplicación.
- **Propósito:** recabar decisiones explícitas antes de autorizar DEV-003B.

## Resumen

El área Pagos es un registro local de asignaciones de enfermería y conteo de días pagados. No procesa transferencias, no concilia importes y no mantiene un mayor monetario. La cobertura actual se obtiene como una cantidad acumulada de días pagados aplicada, en orden cronológico, a fechas desde una fecha base que tienen al menos una asignación.

El formulario guarda `Tiempo completo` o `Medio tiempo`, pero el cálculo de cobertura no usa esa opción. Dos o más enfermeros asignados a una fecha cuentan como una fecha cubierta en `cover()`, mientras que los resúmenes monetarios por enfermero suman la tarifa diaria una vez por cada asignación de esa fecha. Esto produce una diferencia visible entre la deuda agregada y el desglose cuando coinciden varios enfermeros. Los pagos guardan fecha e importe opcional, pero esos campos no deciden cuántas fechas cubren ni cuánto se debe.

También se encontró que guardar una asignación elimina de `pay.v` todas las asignaciones anteriores a 400 días antes de la fecha actual. No hay aviso ni historial inmutable para recuperar esas asignaciones desde la aplicación. Cambiar la fecha base, la tarifa o la lista de asignaciones puede alterar retrospectivamente la cobertura resultante.

Son comportamientos comprobados en el código; no se infiere cuál es la regla correcta para esta familia. En particular, DEV-003B debe esperar a que el responsable defina cómo valorar medio turno, varias personas en una fecha, pagos parciales, periodos y correcciones históricas.

## Estado del repositorio y alcance revisado

- `development` estaba activa en `db944e5d4139cba185cd46aa330793046667db46`; el árbol estaba limpio al comenzar la inspección. El remoto configurado es `origin` hacia `SantiagoArroyoBr/Mis_Pastillas`.
- Se consultaron `README.md`, `PLAN_DESARROLLO.md`, `ARQUITECTURA.md`, `HISTORIAL_CAMBIOS.md`, FUNC-001 y PLAN-002.
- Se inspeccionaron `payments.js`, `care-ui.js`, `app.js`, `compatibility.js` y los casos de `tests/persistence.spec.js` relacionados con migración de pagos.
- No se usaron datos reales. No se ejecutó la suite: este trabajo documenta el comportamiento por lectura de código y no modifica lógica.

## Modelo persistido observado

La persistencia general conserva el estado bajo `localStorage`/`pastillas-v1`; DEV-003A no la modificó. La forma vigente observada es:

```text
pay.cfg[i] = {
  who, note, lead, base, pays: [{ d, n, a, old }], time, rate
}
pay.nurses[i] = [{ n, c }]
pay.v[YYYY-MM-DD][i] = [{ n }]
```

`i` es la posición de la ficha. El registro diario de asignación solo identifica el nombre del enfermero; no registra ID, duración, hora, tipo de turno, tarifa aplicada ni autor. Los pagos tampoco contienen una lista de fechas cubiertas: guardan la fecha de registro, un entero de días, un importe opcional y una bandera de conteo anterior.

## Reglas implementadas y evidencia

### Enfermeros y asignaciones

- `care-ui.js:nurseForm()` agrega o edita nombre y color. Impide nombres duplicados dentro de una ficha sin distinguir mayúsculas. Al cambiar el nombre, recorre `pay.v` y cambia toda asignación histórica con el nombre anterior. Quitar a alguien de la lista solo elimina el elemento de `pay.nurses[i]`; no elimina las asignaciones de `pay.v`.
- `care-ui.js:dayForm()` guarda una asignación como `{n}` bajo fecha ISO y posición de ficha. Se puede registrar una vez o repetir en el mismo día de semana hasta el fin del mes actual. La repetición crea entradas concretas para las fechas calculadas; no guarda una regla recurrente.
- Se pueden asignar varios enfermeros en la misma fecha. Se evita duplicar el mismo nombre en esa fecha. No hay campos de hora/duración ni una entidad de turno por persona.
- Al guardar una asignación, `dayForm()` elimina todas las claves de `pay.v` anteriores al corte de 400 días (`care-ui.js:178-187`). Esta depuración opera sobre el mapa entero, que incluye las fichas; no solicita confirmación.

### Tipo de turno y cálculo de cobertura

- La configuración inicial (`app.js:77`) establece `lead:2`, `time:'full'` y `rate:null` por ficha. `payForm()` guarda un único `time` para todas las personas de esa ficha: completo o medio (`care-ui.js:58-77`). La interfaz usa el valor para describir el turno y rotular el control de asignación.
- `payments.js:4-21`, `cover(i)`: toma todas las claves de fecha `pay.v` iguales o posteriores a `base` que tengan una o más asignaciones para esa ficha, las ordena lexicográficamente y forma `dates`. El número `total` es la suma de `n` de todos los pagos donde `old` es falso. Las primeras `total` fechas quedan en `covered`; las restantes, en `unpaid`.
- Cada fecha es una unidad, aunque contenga varios enfermeros. No se pondera `time`, no se cuenta por enfermero y no se distinguen medio turno y día completo.
- Una fecha sin asignación no forma parte de `dates`. Las fechas vencidas no cubiertas forman `unpaidDue`; `owed` es su número. Las fechas futuras no cubiertas forman `future`. `unused` cuenta los días pagados que aún exceden las fechas asignadas; `remaining` suma esos días y las fechas ya cubiertas que no han pasado.
- Solo existe deuda monetaria calculada si hay `rate`: la tarjeta usa `owed × rate` (`care-ui.js:23-27`). No se calcula un saldo de dinero a partir de importes pagados.

### Pagos e historial visible

- `payRegForm()` propone como `n` los días vencidos y, si existe tarifa, propone `owed × rate` como importe (`care-ui.js:79-100`). Acepta `n` entero de 1 a 366 y un importe opcional no negativo. Si aún no hay fecha base, pide una y la establece. Registra `{d: hoy, n, a, old:false}`.
- `cover()` suma `n`; ignora `d` y `a`. Un importe parcial no reduce una deuda monetaria calculada y un importe que no corresponda a `n × rate` tampoco cambia la cobertura. Si se aumenta `n` por pago adelantado, el importe inicial del formulario sigue derivándose de la deuda que había al abrir el formulario.
- `lastPay()` usa el último registro activo por posición para elegir un tramo de `dates`; presenta un total **estimado** según la tarifa actual y las asignaciones actuales de esas fechas. No usa el importe real `a`.
- Se muestran como máximo los cinco pagos más recientes, con acción para quitar un registro (`care-ui.js:32,47`; `app.js:173-175`). Quitar un pago reduce `total` y puede mover la frontera entre fechas cubiertas y no cubiertas.
- `resetForm()` marca todos los pagos existentes con `old:true` y cambia `base`; conserva las entradas de pago como historial visible, pero las excluye del cálculo actual (`care-ui.js:102-110`).

### Importe por enfermero y avisos

- `oweSummary()` itera las fechas vencidas no cubiertas y cada asignación de enfermero de esas fechas. Suma una unidad y una tarifa a cada persona en cada fecha (`payments.js:24-32`). Con dos personas en una fecha, cada fila puede mostrar una tarifa completa aunque la deuda agregada de la tarjeta sea solo una tarifa por esa fecha.
- `lastPay()` hace una suma similar por enfermero y asignación y suma cada tarifa en el total (`payments.js:35-47`). Con varios enfermeros en el mismo día, el total estimado puede superar `lp.n × rate`, que sería el importe si cada día pagado se valorara una sola vez.
- `lead` se inicializa y normaliza entre 1 y 14 días, pero no se ofrece en el formulario ni participa en `cover()`/`due()`. `cover()` solo devuelve `red`, `green` o `gray`; `due()` filtra `red` o `amber`, por lo que el estado `amber` no se genera desde este cálculo. La notificación de `app.js:218` dice “pagos de cuidado próximos”, aunque en la ruta actual `due()` incluye la deuda `red` (y no una anticipación calculada).

## Campos guardados y participación actual

| Campo | Uso comprobado | ¿Interviene en el cálculo de cobertura/deuda? |
|---|---|---|
| `cfg.who` | Se muestra y hace que `due()` considere esa ficha. | No altera días ni importe. |
| `cfg.note` | Nota mostrada en la tarjeta. | No. |
| `cfg.time` | Muestra completo/medio y etiqueta la asignación. Es único para toda la ficha. | No en `cover()`, deuda o importe. |
| `cfg.lead` | Valor por defecto y normalización/migración. No se edita desde UI. | No; no hay cálculo de aviso anticipado. |
| `cfg.base` | Límite inferior de las fechas que entran en `cover()`. | Sí; editarlo puede cambiar la cobertura histórica. |
| `cfg.rate` | Tarifa diaria mostrada y multiplicada por deuda/detalles estimados. | Sí para los importes mostrados, con las inconsistencias descritas para varias personas por fecha. |
| `pays[].n` | Entero de días pagados activos; la suma cubre primero las fechas elegibles más antiguas, por fecha de servicio. | Sí. |
| `pays[].d` | Fecha de registro mostrada en historial. | No; no determina el periodo cubierto. |
| `pays[].a` | Importe opcional mostrado en historial. | No; no compensa deuda ni gobierna cobertura. |
| `pays[].old` | Etiqueta de historial antiguo y exclusión del cálculo vigente. | Sí, como filtro de `n`. |
| `nurses[].n` | Identidad por nombre para listar, elegir y asociar a una asignación. | La presencia de `{n}` hace que una fecha cuente; el número de personas no cambia `cover()`. |
| `nurses[].c` | Color visible en calendario/lista. | No. |
| `pay.v[fecha][i][].n` | Asignación con nombre por fecha. | Sí, como condición de existencia; los nombres se usan para agrupar importes por persona. |

`compatibility.js:migrate()` conserva pagos con `n` entero, normaliza `d`, `a` y `old`, convierte nombres históricos a objetos y transforma el formato anterior `pay.w` en asignaciones. También elimina campos anteriores como `pay.shifts`. La validación de estado exige `pays[].n` entero positivo (`compatibility.js:112-129`); `migrate()` también filtra registros cuyo `n` no es entero (`:55-68`). La prueba existente comprueba una migración histórica de enfermero/asignación (`tests/persistence.spec.js:320-326`), pero no hay un caso de prueba directo de `cover()`, deuda por tarifa, `time`, `lead`, pagos parciales o dos enfermeros en la misma fecha.

## Problemas comprobados y riesgos

1. **Medio turno sin efecto contable:** la opción guardada `time:'half'` no cambia la unidad de cobertura ni el monto. El usuario puede interpretar que sí lo hace porque se muestra en la tarjeta y en el formulario de asignación.
2. **Varios enfermeros por fecha, semántica ambigua y totales divergentes:** la cobertura es por fecha única, pero los subtotales por enfermero multiplican la tarifa por persona asignada. Con dos personas el desglose puede sumar el doble de la deuda agregada.
3. **Pagos parciales no concilian:** `a` se conserva y se presenta, pero no disminuye deuda ni determina qué servicio cubre. `n` siempre es entero; un importe pagado parcialmente y un pago adelantado quedan desacoplados.
4. **Cambios retroactivos:** editar `base` o `rate` vuelve a aplicar la configuración actual a fechas y pagos previos. Agregar/quitar una asignación puede desplazar la frontera de las fechas cubiertas más antiguas; renombrar enfermeros cambia también nombres históricos; quitar un enfermero de la lista no borra asignaciones.
5. **Retención de asignaciones:** una asignación nueva puede borrar registros de más de 400 días sin advertencia. Con un `total` de pagos que ya no encuentra todas sus fechas, `unused` y la deuda pueden cambiar; se pierde detalle de calendario para comprobar el historial antiguo.
6. **Avisos incongruentes o inactivos:** `lead` y `amber` están preparados en la estructura/UI, pero la ruta calculada no los produce; el texto de notificación habla de pagos próximos aunque la deuda seleccionada es vencida.
7. **Pruebas insuficientes de reglas de pago:** la suite actual verifica una forma de migración histórica, pero no caracteriza el motor de cobertura ni los casos de importe, duplicidad de asignaciones, edición retroactiva y retención.

Estos puntos documentan limitaciones funcionales y riesgos de interpretación/continuidad de datos; no se presentan como vulnerabilidades de seguridad. No se comprobó cómo entiende o aplica estos registros la familia ni cuál es el acuerdo real con sus enfermeros.

## Alternativas a decidir

No se elige ninguna como regla vigente. La combinación elegida debe ser coherente: unidad de cobertura, forma de contar varias personas, tarifa, pago aplicado y periodo no pueden definirse aisladamente.

### A. Unidad de cobertura para días completos y parciales

| Alternativa | Regla | Ventajas | Desventajas y complejidad | Compatibilidad |
|---|---|---|---|---|
| A1 — Día calendario (actual) | Cualquier fecha con al menos una asignación vale 1. `time` no cambia el conteo. | Mantiene los resultados actuales; baja complejidad. | Medio turno sigue sin diferencia; debe corregirse el texto para no sugerir cálculo parcial. No resuelve la necesidad si la familia liquida medios días. | Máxima; no requiere cambios de datos.
| A2 — Fracción fija por ficha | `full=1`, `half=0.5` por cada fecha asignada; varias personas en una fecha siguen siendo una sola fracción de esa ficha. | Usa un ajuste existente; evita duplicar fecha por varios nombres; no pide horas por turno. | No permite mezclar turno completo y medio para distintas personas el mismo día; requiere aceptar redondeos/unidades fraccionarias y decidir monto. Complejidad media. | La configuración ya se guarda, pero pagos `n` enteros y la validación/migración actuales no admiten fracciones. Requiere compatibilidad explícita; reinterpretaría registros `half` existentes.
| A3 — Unidad por asignación/turno | Cada asignación tiene su duración/tipo; se suma la fracción de cada turno. | Representa turnos mixtos y varias personas con más detalle. | Se debe definir si dos personas cubren dos servicios, comparten una tarifa o se distribuye el costo; mayor superficie de UI, pruebas e historial. Complejidad alta. | Las asignaciones `{n}` carecen de duración/ID. Requiere ampliar datos y tratar registros antiguos sin inventar su duración.

### B. Varios enfermeros en el mismo día

- **B1 — La ficha genera como máximo una unidad diaria (actual):** dos o más asignaciones del mismo día no aumentan `cover()`. Para subtotales, habría que definir si dividir el valor entre las personas o mostrar solo asistencia sin importe. Menor cambio y mayor continuidad con el indicador diario actual.
- **B2 — Una unidad por persona:** cada asignación genera un servicio independiente. Aclara pagos por persona si esa es la regla real, pero el calendario/pagos actuales, `pays[].n` y la deuda agregada cuentan fechas únicas; necesitaría identificación estable de turno/asignación y reprocesar deuda. Complejidad alta y riesgo alto de recalcular historia.
- **B3 — Fracción o tarifa explícita por asignación:** sumar importes/duraciones configuradas por persona/turno. Más flexible, pero requiere campos y decisiones sobre solapamiento, tarifas, cancelaciones y correcciones; opción con mayor costo de compatibilidad.

### C. Pagos parciales y adelantos

- **C1 — Mantener conteo de días:** `n` sigue siendo el único dato que cubre; `a` es solo un comprobante informativo sin conciliación. Es la opción más compatible, pero no satisface un saldo monetario de abonos parciales; hay que rotularlo claramente.
- **C2 — Contabilidad monetaria por saldo:** calcular servicio devengado hasta una fecha/periodo y restar importes pagados. `a` podría convertirse en importe efectivamente pagado solo después de aclarar datos antiguos y decidir cómo aplicar pagos. Permite abonos, pero exige orden de aplicación, saldo acumulado, redondeo, tarifa efectiva y trazabilidad. Si la tarifa histórica cambió, no existe una tarifa por asignación/periodo para reconstruir el pasado con certeza.
- **C3 — Conservar dos saldos separados:** mantener días de cobertura y añadir conciliación monetaria independiente. Reduce el riesgo de reinterpretar `n`, pero exige que la interfaz explique dos conceptos y que se defina si una cantidad pagada puede coexistir con días aún descubiertos. Complejidad media/alta; probablemente añade campos/entidades.

En cualquiera de B/C debe decidirse si los días pagados cubren fechas de servicio en orden cronológico —como hace actualmente la suma total de `n`, sin enlazar cada transacción con fechas—, se asignan a un periodo seleccionado o se asocian a fechas/servicios elegidos. El importe `a` actual no contiene esa asignación.

### D. Periodos y límites de cobertura

- **D1 — Conteo acumulado desde `base` (actual):** los días activos se aplican a la lista ordenada de asignaciones desde la fecha base. Simple, pero la fecha de registro `d` no delimita cobertura y una modificación puede mover retrospectivamente la frontera.
- **D2 — Periodos explícitos** (por ejemplo, semana o mes aprobado por el responsable): cada pago se vincula a un intervalo y el resumen identifica días/importe por intervalo. Hace visible la cobertura, pero exige una regla de calendario, fechas inclusivas, tratamiento de pagos entre periodos y esquema compatible para periodo/ID.
- **D3 — Cobertura elegida por fechas:** cada pago referencia servicios/fechas cubiertos. Máxima trazabilidad, pero mayor carga manual, más validación y esquema nuevo. Los pagos antiguos sin asignación específica quedarían como legado no reconstruible.

### E. Cambios/cancelaciones e historial

- **E1 — Recalcular estado actual** (actual): editar o quitar asignaciones afecta la cobertura calculada. Simple y compatible, pero no conserva evidencia de cómo se veía el acuerdo cuando se registró un pago.
- **E2 — Cerrar periodos pasados y aplicar cambios hacia adelante:** conservar resultados anteriores y fijar una fecha efectiva para cada nueva regla. Protege la historia cotidiana; exige definir qué constituye periodo cerrado y cómo corregirlo.
- **E3 — Historial de eventos inmutable con correcciones reversibles:** guardar altas, cambios, cancelaciones y correcciones como eventos con fecha efectiva; la UI muestra la versión vigente y el historial. Es más auditable, pero añade almacenamiento, UI y política de corrección/retención; requiere diseño de esquema y migración o convivencia explícita con legado.

Un enfoque incremental puede conservar el conteo actual para todas las fichas históricas y empezar un nuevo conteo desde una fecha base aprobada (`resetForm()` ya marca pagos previos como `old`), evitando revalorarlos automáticamente. No conserva por sí solo el detalle que el corte de 400 días ya elimina, ni resuelve importes parciales o pagos asignados a periodos.

## Compatibilidad y conservación de registros

- No se modificó `pastillas-v1`, su estructura ni código. Una solución A1/B1/C1/D1/E1 puede mantener la forma actual si conserva `pays[].n` entero y la interpretación por fecha; aun así, cualquier ajuste de desglose debe tener pruebas para demostrar que no altera `cover()`.
- Usar `half` como `0.5` afecta semántica histórica y no se puede introducir cambiando solamente `cover()`: el formulario restringe `n` a enteros, `migrate()` filtra pagos no enteros y `validateStoredState()` los rechaza. Habría que ampliar validador, migración, integridad y restauración; definir si el valor histórico `half` se reinterpreta, se congela como legado o aplica solo desde una nueva base.
- Añadir duración, tarifa/turno efectivo, asignación de pago por periodo o eventos históricos amplía datos persistidos y probablemente exige una estrategia de migración. Los registros actuales no permiten inferir duración, tarifa histórica ni fecha cubierta exacta; conservarlos como “legado según conteo vigente” es más seguro que fabricar detalle.
- Antes de cualquier cambio debe definirse la retención de `pay.v`: hoy se borran entradas antiguas al guardar una asignación. Protegerlas indefinidamente o moverlas a archivo/resumen cambia volumen de datos y UX; debe ser decisión explícita y probado con respaldo JSON.
- Exportación/restauración usa el estado completo. Cualquier nuevo campo debe sobrevivir un ciclo exportar → validar → restaurar sin perder pagos, enfermeros, fechas y valores originales; probar también copias históricas `pay.w` y formatos `cfg/pays` ya aceptados.

## Matriz propuesta de pruebas DEV-003B

Fixtures completamente ficticios; fechas y hora congeladas para evitar dependencia del reloj. No son pruebas ejecutadas en DEV-003A.

1. Ficha sin configuración, sin base, sin asignaciones y sin pagos.
2. Una persona asignada en día pasado, hoy y futuro; fecha sin asignación intermedia; validar unidad y estado aprobados.
3. `full` y `half` para fechas equivalentes, antes y después de la fecha de entrada en vigor acordada.
4. Dos enfermeros en una fecha; medir por separado unidad de cobertura, deuda total y desglose monetario conforme a la alternativa elegida.
5. Un mismo enfermero repetido en fecha; confirmar la regla de duplicado. Repetición semanal hasta el fin de mes y cambio de mes.
6. Pagos `n=1`, varios pagos acumulados, adelanto superior a asignaciones, pago con `a` ausente, cero y positivo.
7. Pago parcial menor/igual/mayor al devengado; si no se admite, comprobar que se rechaza o se rotula informativo y no cambia la deuda.
8. Pago en fecha distinta de servicio; decidir y verificar cobertura cronológica de fechas, periodo seleccionado o fechas asignadas.
9. Orden de pagos con distinto `d`; editar/eliminar uno y confirmar impacto esperado en cobertura y resumen.
10. Mover, cancelar o quitar una asignación futura y pasada antes/después de tener pagos; validar si la historia se recalcula, queda cerrada o registra una corrección.
11. Cambiar `base`, `rate` y `time`; confirmar aplicación solo futura o el comportamiento retroactivo expresamente elegido.
12. Reiniciar conteo; preservar historial `old` y verificar comienzo del nuevo periodo.
13. Cruce del plazo de aviso `lead`, estados por vencer/vencido y texto/notificación congruentes.
14. Retención justo antes/en el límite/después de 400 días; ninguna eliminación silenciosa si el responsable decide conservar historial.
15. Varias fichas, pagos independientes, cantidades monetarias ocultas, y sin transferencia entre fichas.
16. Migración y restauración de respaldos sintéticos actuales, formato legado `pay.w`, pagos con `n` entero/`d`/`a` opcionales y cualquier nuevo campo aprobado.
17. Assert de clave `pastillas-v1`, roundtrip JSON exacto de campos legados, errores de almacenamiento y no pérdida en fallo de migración.
18. Responsive y accesibilidad del resumen por ficha, persona, periodo y estado; textos distinguen importe real de estimado.

## Decisiones solicitadas al responsable

1. ¿Qué significa `rate`: importe por día calendario de la ficha, por persona asignada, por turno, o solo estimación administrativa?
2. ¿Medio turno vale 0.5, una tarifa diferente, o no cambia el conteo? ¿Se permite variar por enfermero y día?
3. Si hay varias personas el mismo día, ¿la familia paga una cobertura diaria o varios turnos? ¿Cómo se reparte cualquier tarifa entre ellas?
4. ¿Se aceptan pagos parciales en dinero? Si sí, ¿el saldo se reconcilia por dinero, por días, o ambos; y cómo se aplica un abono: a las fechas de servicio más antiguas, a un periodo o a fechas elegidas?
5. ¿Qué periodos se usan y cuáles son los límites inclusivos? ¿Un pago adelantado cubre servicio futuro, deuda más antigua o periodo seleccionado?
6. ¿Cambiar tarifa, tipo/base de turno o cancelar una asignación debe recalcular pasado, aplicar desde fecha efectiva, o conservar un periodo cerrado con corrección visible?
7. ¿Debe conservarse la lista detallada de asignaciones indefinidamente? Hoy se poda al asignar tras 400 días. ¿Es aceptable resumir/archivar, y quién puede corregir errores históricos?
8. ¿`lead` debe avisar antes del vencimiento? Definir días, inclusividad, destinos y texto distinto para “por vencer” y “vencido”.
9. ¿Qué redondeo monetario se debe aplicar y qué se muestra cuando falta la tarifa?
10. ¿El primer DEV-003B debe evitar cambios de estructura y empezar con una nueva fecha base/conteo, o se autoriza diseñar una extensión compatible con migración/convivencia de legado?

## Recomendación de secuencia

1. Aprobar por escrito las respuestas a estas decisiones con ejemplos numéricos, incluyendo dos enfermeros en una fecha, medio turno, pago parcial y cambio de tarifa.
2. Marcar explícitamente qué saldos/periodos históricos se conservan y cuál es la fecha efectiva de cualquier regla nueva; no revalorar registros antiguos por inferencia.
3. Usar esos ejemplos como especificación de pruebas sintéticas deterministas antes de cambiar el motor.
4. Diseñar DEV-003B de menor alcance que satisfaga los ejemplos; tratar cualquier dato adicional y su restauración como parte del mismo cambio y pedir autorización si requiere migración o cambio de esquema.
5. Mantener DEV-003B sin iniciar hasta recibir esas definiciones. DEV-003A no selecciona A/B/C/D/E y no autoriza cambios funcionales.
