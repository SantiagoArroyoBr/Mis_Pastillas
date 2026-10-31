# PLAN-002 — Backlog del siguiente ciclo funcional

**Estado:** propuesta técnica preparada en `development` a partir de FUNC-001 (commit inspeccionado `f381219e31e515ba34096446d5c7109d8ae73937`). Las prioridades son recomendaciones revisables, no decisiones del propietario ni autorización para implementar.

## Backlog priorizado

Escala: utilidad/impacto/verificabilidad se expresan como alto, medio o bajo; complejidad y riesgo de datos son relativos al repositorio actual.

| Prioridad | Mejora | Utilidad familiar | Impacto UX | Complejidad | Dependencias | Riesgo para datos | Facilidad de verificación |
|---|---|---|---|---|---|---|---|
| P1 | Seleccionar paciente de la cita por identidad de ficha, no por nombre, para evitar colisión de nombres. | Alta | Alta | Baja | Añadir prueba sintética con nombres iguales. | Bajo si se mantiene el índice persistido; moderado mientras no se arreglen registros antiguos. | Alta: comprobar que el selector identifica el segundo registro aunque el nombre coincida. |
| P2 | Hacer visible la regla de saldo compartido por ficha y reforzar pruebas para varias pautas concurrentes. | Alta | Media/alta | Baja/media | Definir texto claro; pruebas deterministas de `domain.js`. | Bajo si solo se cambia presentación y test; alto si se agrega saldo compartido entre fichas. | Alta con fixtures de dos pautas y dos fichas. |
| P3 | Alinear pagos, días cubiertos, tipo de turno y plazo de aviso con una regla de negocio confirmada. | Alta | Alta | Media/alta | Decisión del responsable sobre medio turno, varios enfermeros, anticipación y pago adelantado. | Alto: influye en deuda y montos mostrados. | Media/alta tras acordar ejemplos esperados y probarlos en fixtures. |
| P4 | Corregir el mensaje genérico de notificación de pago y documentar el límite de un aviso diario al abrir la app. | Media | Media | Baja | Ninguna para el texto; validar el comportamiento actual en suite. | Bajo; el texto no cambia cálculos ni almacenamiento. | Alta con prueba de texto y deduplicación. |
| P5 | Aumentar pruebas deterministas de calendario de consumo, insumos fraccionarios, compras y fechas límite. | Media/alta | Indirecta | Media | Diseñar casos frontera y fixtures sin datos reales. | Bajo; añadir pruebas no cambia la app. | Alta: resultados esperados fijos con tiempo controlado. |
| P6 | Mejorar mensajes de resultado/error de respaldo y restauración sin reducir las confirmaciones actuales. | Alta | Media | Media | Especificar escenarios de éxito, fallo, descarga bloqueada y recuperación. | Alto si se altera el orden de escritura; bajo si solo se aclaran mensajes. | Alta usando los fallos simulados existentes y perfil temporal. |

## Propuestas de implementación pendientes

### P1 — Identidad de paciente en selector de citas (DEV-001, completada)

- **Problema:** `appointments.js` encuentra la ficha usando el nombre escrito/seleccionado. Dos fichas pueden tener el mismo nombre; la búsqueda devuelve la primera coincidencia y puede vincular una cita nueva a otra ficha.
- **Solución aplicada:** usar el índice de ficha como valor interno del control; renderizar el nombre como etiqueta y validar que el índice siga dentro de `S.p` antes de guardar. Si hay nombres coincidentes se muestra el número de ficha.
- **Módulos afectados:** `appointments.js` para selección/validación; `forms.js` para el control nativo reutilizable; `tests/persistence.spec.js` para aceptación.
- **Reglas de negocio:** no cambiar personas ni identificadores del estado persistido; mantener el índice actual `a.i`; el formulario de edición conserva la ficha originalmente asociada.
- **Interfaz aplicada:** mostrar nombres en un selector nativo; cuando coinciden, agregar “Ficha N” para distinguirlos. No se añaden datos médicos.
- **Riesgos:** no reasocia automáticamente citas existentes. Reordenar/eliminar fichas sigue sin estar disponible en la UI. Cambiar `a.i` o migrar datos queda fuera.
- **Pruebas de aceptación:** cumplidas en la suite local con datos ficticios: nombres únicos y duplicados, creación en ambas fichas, edición de cita anterior, guardado/recarga, exportación/restauración, eliminación y selector a 320 px. La suite total pasó 26/26 en Edge 156.0.4314.50.
- **Complejidad relativa:** baja. Sin ID de paciente nuevo y sin cambio al esquema.

### P3 — Cobertura y avisos de pago con regla confirmada (propuesta pendiente)

- **Problema:** el turno completo/medio se presenta como opción, pero `payments.js` cuenta cualquier fecha con una o más asignaciones como un día entero. El valor persistido `lead` no se edita ni interviene en `cover()`. La notificación dice “próximos” cuando `due()` selecciona deuda vencida.
- **Solución propuesta:** primero acordar reglas con el responsable; después actualizar los cálculos y textos para que distingan deuda vencida de aviso anticipado. Conservar formato actual mientras no se defina cómo representar fracciones/turnos si hiciera falta.
- **Módulos afectados:** `payments.js`, `care-ui.js`, `app.js`, `compatibility.js` solo si la regla exige cambios compatibles, y pruebas de dominio/UI.
- **Reglas de negocio:** decidir si medio turno afecta conteo/monto; qué pasa con dos enfermeros el mismo día; desde qué fecha aplica pago anticipado; si `lead` significa días de anticipación e inclusividad del límite. No inferir ninguna de estas reglas.
- **Interfaz:** separar claramente “vencido” de “por vencer”; explicar la regla que calcula días pagados y deuda; mantener montos ocultos por defecto.
- **Riesgos:** alto. Puede cambiar deuda o montos percibidos; no modificar saldos/registros históricos sin pruebas de compatibilidad y autorización específica. No cambiar esquema como parte de esta propuesta.
- **Pruebas de aceptación:** tabla de ejemplos aprobados para días asignados, turnos, pago anticipado, límite de aviso y tarifa; incluir un caso con múltiples enfermeros y uno con fecha sin asignación; confirmar que los respaldos existentes siguen válidos.
- **Complejidad relativa:** media/alta; bloqueada hasta definición funcional.

### P2 — Visibilidad de consumo agregado por ficha (DEV-002, completada localmente)

- **Problema:** las pautas independientes comparten el saldo de una ficha, pero la interfaz no explica explícitamente ese alcance; tampoco existe un inventario compartido entre fichas. El término puede llevar a esperar una consolidación global que el código no realiza.
- **Solución aplicada:** cada tarjeta de medicina aclara que sus pautas comparten un inventario y que el saldo y el aviso de reposición consideran el conjunto. No se añadió resumen numérico duplicado.
- **Módulos afectados:** `app.js` (tarjetas y pendientes derivados); `tests/persistence.spec.js` (regresión de texto, saldo y ciclo de respaldo).
- **Reglas de negocio:** no consolidar existencias entre pacientes ni fichas con el mismo nombre; cálculo agregado sigue siendo la suma de eventos de `cons[]`; no alterar `pastillas-v1`.
- **Interfaz:** ayuda junto al saldo y pautas; mostrar las dosis/frecuencias y dejar explícito que la proyección es estimada.
- **Riesgos:** bajo para texto y resumen derivado; alto si se introduce inventario global, se fusionan fichas o se reescriben saldos.
- **Pruebas realizadas:** fixture ficticio con una y dos pautas: mensaje accesible por tarjeta, saldo que coincide con `AcompanaDomain.calc`, una alerta de reposición por ficha, recarga y exportación/restauración. Suite completa 27/27 en navegador Chromium/Edge automatizado. El fixture no simula dos fichas con el mismo medicamento; no hubo cambio en el motor de cálculo.
- **Complejidad realizada:** baja.
- **Estado:** implementada y probada localmente en DEV-002; sin push ni verificación sobre Preview.

## Recomendación

DEV-001 resolvió el problema de asociación de citas con un cambio acotado. DEV-002 aclara el saldo común entre pautas de una ficha sin cambiar el cálculo; las decisiones funcionales de pagos (P3) siguen pendientes y no deben cambiarse hasta acordarlas.
