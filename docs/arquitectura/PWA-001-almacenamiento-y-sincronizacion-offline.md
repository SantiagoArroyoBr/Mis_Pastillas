# PWA-001 — Evaluación de almacenamiento local y sincronización offline

**Estado:** evaluación documental completada; sin implementación de almacenamiento ampliado, backend ni sincronización.  
**Base:** `pastillas-v1`, DAT-001–DAT-003 y AUD-001.  
**Recomendación:** conservar la persistencia local actual hasta confirmar una necesidad multi-dispositivo. Si esa necesidad aparece, diseñar un prototipo aislado con datos sintéticos antes de cambiar producción.

## 1. Situación y alcance

La aplicación guarda el estado completo en `localStorage` bajo `pastillas-v1`; DAT-003 valida el ciclo JSON local con datos sintéticos. El funcionamiento actual no tiene una cola de operaciones remotas, cuenta, API ni sincronización. Esta evaluación no recomienda convertir automáticamente el almacenamiento ni alterar el formato exportado.

IndexedDB ofrece transacciones asíncronas y almacenes indexados adecuados para objetos estructurados y colas locales de mayor tamaño; sus transacciones pueden abortarse y los navegadores aplican cuotas y reglas de desalojo propias. Por ello no equivale a un respaldo durable controlado por la aplicación. Una futura implementación tendría que manejar abortos, límites, espacio insuficiente, exportación/restauración y pruebas por navegador. [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [transacciones y cierres](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [cuotas y desalojo](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## 2. Almacenamiento local ampliado

No hay evidencia de que el tamaño o el patrón síncrono actual requiera más almacenamiento. Adoptar IndexedDB ahora aumentaría la complejidad de inicio, consistencia, copias, recuperación, compatibilidad entre versiones y convivencia con `pastillas-v1` sin resolver una necesidad confirmada.

Si mediciones futuras justifican IndexedDB, mantener `pastillas-v1` como fuente de recuperación hasta completar una conversión transaccional, exportación independiente, restauración de vuelta y validación de conteos/referencias con fixtures sintéticos. No borrar el origen ni cambiar la fuente de verdad en una sola operación. La política del navegador puede evictar datos; solicitar persistencia puede mejorar la protección en ciertos navegadores, pero no sustituye copias externas ni garantiza conservación absoluta.

## 3. Modelo de cola si se confirma sincronización

La cola debe representar **intenciones de dominio**, no snapshots completos que se sobrescriben. Cada operación pendiente tendría, como mínimo, un identificador aleatorio estable, versión de esquema de la operación, tipo, referencia local, secuencia por dispositivo, fecha de creación, estado y contador/fecha del siguiente intento. No debe copiar contenido médico a logs de diagnóstico.

- Guardar operación y cambio local visible en una transacción local indivisible; si uno falla, no afirmar éxito al usuario.
- Mantener estados distinguibles: pendiente, en envío, confirmada, reintento programado y requiere resolución. El envío en curso debe recuperarse como pendiente tras reinicio.
- Respetar orden causal para una misma entidad o inventario; operaciones independientes pueden agruparse, con límites de tamaño y tiempo.
- Retrasar reintentos con backoff exponencial y variación aleatoria; reiniciar en errores transitorios, pero poner errores permanentes o de validación en una bandeja visible para resolución. No reintentar en bucle desde el service worker.
- Usar sincronización en primer plano como ruta base. Background Sync es una mejora opcional: `SyncManager` tiene disponibilidad limitada y no debe ser requisito para que el usuario pueda enviar/recuperar cambios. [Compatibilidad de SyncManager](https://developer.mozilla.org/en-US/docs/Web/API/SyncManager/register).
- Mostrar fecha de última sincronización y operaciones pendientes; permitir exportar los datos locales y explicar errores sin revelar valores sensibles.

## 4. Idempotencia y consistencia de inventario

Cada operación debe conservar la misma clave de idempotencia en todos los reintentos. El servidor necesitaría imponer unicidad de esa clave dentro del ámbito familiar y guardar el resultado aceptado, para que una respuesta perdida no aplique dos veces el mismo movimiento. La cola local elimina una operación únicamente tras confirmación durable que pueda reconciliarse después de reabrir la app.

Para inventario, enviar movimientos con cantidad/delta, medicamento objetivo y contexto necesario, no el saldo absoluto del cliente. La API debe aceptar el movimiento una sola vez y devolver el saldo autoritativo; validar que no viole reglas de negocio. Dos dispositivos que registran movimientos distintos no deben colapsarse bajo “última escritura gana”. Una operación duplicada se reconoce por clave; dos operaciones distintas se conservan ambas y se aplican en orden definido.

## 5. Resolución de conflictos

El protocolo debe incluir revisión/versión de entidad o cursor de servidor y diferenciar conflictos por campo de operaciones aditivas. Para texto administrativo editable podría presentarse comparación y elección explícita. Para movimientos de inventario, citas, pagos o asignaciones históricas, conservar eventos y pedir conciliación cuando la semántica no permita combinación segura. Nunca resolver registros sensibles por coincidencia de nombre.

La revocación de acceso y el dispositivo offline requieren una regla de producto: una copia local no puede retirarse de forma remota mientras no se conecte. No iniciar sesión ni crear cola con datos de familias hasta definir membresías, revocación, roles, retención, cifrado y comportamiento posterior a la revocación, además de pruebas negativas de autorización (CAL-001).

## 6. Escenarios de aceptación para un prototipo futuro

Con dos familias sintéticas y dos clientes ficticios, comprobar desconexión prolongada, cierre inesperado durante escritura, respuesta perdida tras aceptar una operación, reintento repetido, expiración/revocación, cambio concurrente del mismo registro, movimientos distintos simultáneos, cola grande, cuota agotada, restauración local y downgrade/actualización. Conciliar conteos y relaciones antes y después; confirmar que la repetición del mismo lote no duplica nada y que los movimientos independientes no desaparecen ni se duplican.

Esta lista es un diseño de pruebas, no resultado de ejecución: no existe servidor ni cola implementados. La suite local 14/14 de DAT-003 solo cubre exportación/restauración JSON sintética en un navegador aislado; no demuestra sincronización, almacenamiento duradero ante fallos del dispositivo o resolución multiusuario.

## 7. Decisión y puertas

1. Mantener ahora `localStorage` y respaldo JSON, sin migración.
2. Reabrir la decisión solo ante un requisito concreto de uso compartido y roles definidos.
3. Medir volumen y fallos observados antes de elegir IndexedDB.
4. Diseñar API, identidad, permisos, claves idempotentes y conflictos antes de prototipar.
5. Ejecutar CAL-001 y estos escenarios en staging aislado, con datos inventados, copias y restauración comprobada.
6. No trasladar datos familiares ni activar servicio remoto sin decisión y autorización explícitas.
