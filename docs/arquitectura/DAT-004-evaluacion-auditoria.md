# DAT-004 — Evaluación de trazabilidad administrativa

**Estado:** evaluación conceptual completada; no implementada.  
**Base:** AUD-001, DAT-001 y DAT-002 en `development`.  
**Resultado:** conservar el registro actual sin añadir auditoría hasta definir permisos, alcance y retención con requisitos de producto y privacidad.

## 1. Situación comprobada

La aplicación vigente usa datos locales en `pastillas-v1`; no se confirmó backend, cuenta autenticada, bitácora central ni sincronización. AUD-001 describe operaciones administrativas como cambios de inventario, pagos, asignaciones, citas, compras y restauración JSON, pero no una auditoría persistente append-only con actor autenticado. DAT-001 propuso conceptualmente eventos por familia y advirtió que no se deben copiar valores médicos completos a la bitácora.

Una vez que el historial se comparte entre dispositivos o cuentas, saber quién cambió qué puede ayudar a investigar errores y mantener trazabilidad. También crea datos sensibles nuevos sobre actividad familiar y no reemplaza las copias de seguridad. No hay requisitos confirmados sobre quién puede consultar ese historial, cuánto conservarlo o cómo exportarlo/eliminarlo.

## 2. Objetivos y límites recomendados

Si se decide implementar en el futuro, el historial debería:

- Registrar operaciones sensibles confirmadas, no cada render, navegación o tecla.
- Identificar el actor desde una sesión verificada; los eventos de sistema deben usar un origen explícito, no una persona ficticia.
- Relacionar el evento con familia, tipo de entidad e identificador técnico, y registrar fecha/hora UTC.
- Distinguir acción intentada, éxito y fallo cuando aporte valor de seguridad; evitar guardar cuerpos completos de solicitudes.
- Ser de solo anexado para clientes ordinarios; correcciones se registrarían como nuevos eventos, con privilegios administrativos restringidos.
- Evitar valores anteriores/nuevos de notas médicas, credenciales, tokens, respaldos completos y contenido innecesario. Preferir campos afectados y cambios resumidos sin datos de cuidado.
- No usarse para tomar decisiones clínicas, calcular inventario ni reconstruir el estado principal de la aplicación. El registro de dominio y la bitácora de auditoría son propósitos diferentes.
- Mantener acceso y almacenamiento limitados. Consultar o exportar la bitácora también podría ser un evento sensible.

## 3. Eventos candidatos

La lista debe fijarse con el alcance de producto; como conjunto inicial a evaluar se proponen:

| Grupo | Ejemplos de evento | Datos mínimos a evaluar |
| --- | --- | --- |
| Familia y membresía | Invitación, aceptación, revocación, cambio de rol, transferencia de propietario, archivo. | Actor, membresía afectada, rol anterior/nuevo, resultado y hora. No registrar enlaces de invitación ni secretos. |
| Acceso | Inicio/cierre de sesión y fallos relevantes de autenticación. | Identificador técnico de cuenta y resultado; evitar IP o agente completo salvo requisito y retención justificados. Auth puede registrar sus propios eventos, que no deben duplicarse sin propósito. |
| Datos de cuidado | Alta, edición, archivo o restauración de paciente, medicamento, cita o asignación. | Tipo e ID de registro, paciente/familia, operación, actor y hora; nunca copiar nota, diagnóstico ni snapshot íntegro. |
| Inventario y pagos | Compra, ajuste de existencia, registro/corrección de pago, cobertura. | Tipo de movimiento, referencia técnica y resultado; conservar el detalle de negocio en su entidad de origen, no duplicarlo sin necesidad. |
| Respaldo y exportación | Exportación, importación, restauración y descarga de datos. | Actor, familia, operación, resultado, versión de formato y lote; no almacenar archivo, contenido, nombre del archivo ni hash publicable del respaldo. |

Eventos automáticos como reintentos offline, tareas programadas o reconciliaciones necesitan un identificador de proceso y de operación idempotente si se implementaran. No atribuirlos a la última persona que inició sesión.

## 4. Propuesta de esquema mínimo (no listo para implementar)

Un evento conceptual podría contener:

- `id`: UUID de evento.
- `family_id`: tenant asociado cuando corresponda.
- `actor_user_id`: cuenta autenticada, nullable solo para origen de sistema explícito.
- `action` y `entity_type`: vocabulario controlado y versionado.
- `entity_id`: referencia técnica, sin nombre de persona en texto.
- `occurred_at`: fecha/hora UTC del servidor.
- `result`: éxito, rechazo o error clasificado; sin stack trace o datos personales.
- `request_id` / `operation_id`: correlación e idempotencia cuando haya API o cola.
- `metadata`: lista permitida y pequeña, con versión de esquema; rechazar secretos y texto libre.

No almacenar una copia generalizada de `old_value/new_value`. Si un requisito justifica un detalle concreto, documentarlo campo por campo y evaluar su sensibilidad, acceso y retención antes de registrar datos.

## 5. Autorización y controles si se elige backend

- El actor se deriva de la identidad autenticada del servidor; un cliente no puede enviar libremente un `actor_user_id` ni elegir el `family_id` del evento.
- Validar que el actor tenga una membresía vigente y que la operación registrada pertenezca al mismo tenant.
- Los usuarios ordinarios no insertan, actualizan ni eliminan directamente eventos de auditoría.
- La escritura confiable ocurre junto a la operación de negocio en una transacción o mecanismo consistente; no generar un evento de éxito si el cambio se revirtió.
- Restringir lectura por rol/alcance definido; acceso de soporte del proveedor requiere política separada y trazable.
- Aplicar grants mínimos y RLS en toda tabla expuesta. Probar explícitamente que una segunda familia no pueda consultar, falsificar ni borrar eventos de la primera.
- Definir respuesta ante fallos: para operaciones críticas, preferir fallar de forma segura si no puede registrarse la auditoría; para acciones no críticas, documentar si se permite la operación y cómo se detecta la pérdida de log.
- Evitar que vistas, funciones privilegiadas o claves del cliente omitan los controles; revisar reglas de acceso en conjunto con CAL-001.
- Mantener un límite de tamaño y conjunto allowlist de metadatos. Sanitizar entradas, no registrar texto arbitrario enviado por usuarios.

En la aplicación local actual no hay actor autenticado confiable; añadir una bitácora que atribuya cambios a “usuarios” antes de resolver Auth sería engañoso. Un historial local por dispositivo podría ser otra solución, pero no se recomienda sin definir quién lo consulta, cómo se exporta y cómo se recupera.

## 6. Retención, acceso y preguntas que siguen abiertas

No fijar un plazo de retención por conveniencia técnica. Antes de implementación hay que decidir y justificar:

1. Qué operaciones requieren trazabilidad y cuáles pueden omitirse.
2. Qué roles pueden leer, exportar y solicitar corrección o eliminación del historial.
3. Si la bitácora tiene retención distinta a datos de cuidado y respaldos.
4. Cómo atender eliminación/archivo de una familia, retiro de consentimiento y obligaciones de conservación.
5. Si se exige almacenamiento inmutable independiente o basta con restricciones de base de datos.
6. Qué metadatos de acceso/red son necesarios para investigar incidentes y cuánto tiempo se retienen.
7. Quién responde por incidentes, consultas de usuarios y restauración.
8. Qué requisitos legales y contractuales aplican según jurisdicción, proveedor y datos efectivamente tratados.

Estas son decisiones de producto, privacidad y operación; DAT-004 no establece una política final ni concluye cumplimiento legal.

## 7. Riesgos y comprobaciones futuras

| Riesgo | Control que se debería validar |
| --- | --- |
| Evento de familia A visible o atribuible por usuario de familia B. | Pruebas RLS de lectura/escritura permitida y denegada por dos familias y todos los roles en CAL-001. |
| Cliente falsifica actor, acción o resultado. | Derivar identidad/acción desde flujo confiable y probar intentos de suplantación. |
| Evento dice “éxito” aunque el cambio falló o se revirtió. | Prueba transaccional de fallo; confirmar correspondencia entre entidad de negocio y evento. |
| Metadata incluye nota médica, credencial o texto libre. | Allowlist de campos, pruebas con cadenas ficticias sensibles y revisión de logs/errores. |
| Bitácora crece sin límite o conserva datos demasiado tiempo. | Métricas de volumen, política de retención aprobada, borrado/exportación controlados y prueba de restauración. |
| Pérdida del log crea falsa sensación de trazabilidad. | Monitoreo, alerta y comportamiento de fallo definido para cada clase de operación. |
| El historial reemplaza backup o se usa como fuente de estado. | Documentar la separación y probar que recuperar backup no dependa del log. |

Estas pruebas corresponden a una implementación futura con datos ficticios. No se han ejecutado porque no existe bitácora ni backend en el estado revisado.

## 8. Resultado

La evaluación define propósito, campos candidatos, clases de eventos, amenazas, controles y decisiones pendientes. DAT-004 queda completada como **evaluación de diseño**, no como funcionalidad. La retención y los roles definitivos permanecen abiertos y deben acordarse antes de implementación. No se añadieron tablas, código, autenticación ni datos persistidos.
