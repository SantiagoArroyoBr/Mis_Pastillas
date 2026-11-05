# PLAN-007 — Gestión y eliminación segura

## DATA-002 — Relaciones comprobadas

| Registro | Identidad y referencias | Riesgo de eliminación | Método |
|---|---|---|---|
| Ficha | Posición en p, sel, homeP, citas.i, pay.cfg[i], pay.nurses[i], pay.v[fecha][i], ledger.patientIndex | Desplazar o reutilizar una posición puede atribuir registros a otra persona | Baja lógica mediante archivo existente, incluso vacía |
| Medicamentos e insumos | Anidados en p[i].meds, consumos y compras | Pérdida de inventario e historial | Conservar dentro de la ficha archivada |
| Enfermero | Nombre en asignaciones legadas, ID en servicios y ledger.nurseId; índice solo en controles de UI | Borrar puede romper servicios o esconder identidad histórica | Borrado definitivo solo sin referencias, inactividad reversible en los demás casos |
| Jornadas | ID de servicio, nurseId, fecha y posición de ficha | Romper aplicaciones de abonos e importes históricos | Mantener todas las asignaciones |
| Administración | Ledger individual referenciado y generalLedger global | Inventar atribuciones o alterar conciliación | Conservar movimientos y cálculos |
| Avisos y respaldo | Derivados del estado completo | Omitir registros al exportar o consultar | Exportación íntegra, avisos existentes |

## Decisión de fichas

El retiro de fichas usa el archivo reversible ya implementado. Su posición permanece reservada y la creación sigue añadiendo al final. La interfaz identifica explícitamente esta baja lógica. La eliminación física queda pendiente de un modelo de posiciones vacantes revisado con todos los consumidores. Las dependencias se muestran antes de ofrecer archivo o consulta.

## Decisión de enfermeros

Una marca booleana opcional inactive conserva la identidad y el historial. El selector de nuevas asignaciones excluye inactivos. Las asignaciones futuras se enumeran y permanecen intactas. La eliminación definitiva requiere ausencia de asignaciones por nombre o ID, referencias de pagos y propiedades adicionales desconocidas. Se verifica de nuevo al confirmar. Los cambios se guardan como estado candidato antes de actualizar la interfaz.

## Publicación y límites

PREVIEW-006 publica los seis commits de PLAN-006 hasta 972a856. La validación funcional del propietario en Preview sigue pendiente. PLAN-007 queda en commits locales. Los cuatro documentos anteriores se conservan fuera de estos commits.

GitHub confirmó el SHA 972a856909bbc6c73271009a9d7c50dcaa3e382f y Vercel success. main permanece en 92c4034085e13bb38fd0a7ff2622c46ef797873d.

## Compatibilidad y limitaciones

inactive es opcional, su ausencia significa activo. La normalización vigente conserva esta propiedad y el importador valida su tipo. Respaldos anteriores conservan su comportamiento. Una versión anterior de la aplicación puede ignorar la inactividad. La protección de pestañas detecta cambios observados, con el límite de concurrencia propio de localStorage.

El retiro de fichas siempre reserva su posición mediante archivo, incluso cuando está vacía o ya archivada. El borrado físico de fichas queda pendiente. Las fichas archivadas conservan la consulta, edición y reactivación existentes. Se contabilizan medicamentos/insumos, citas, asignaciones, enfermeros y pagos históricos para explicar el retiro. La conservación íntegra también protege propiedades adicionales desconocidas.

La eliminación definitiva de enfermeros comprueba las asignaciones por nombre en su ficha y por ID en todo el estado, el libro individual y los campos adicionales del enfermero. La presencia de propiedades adicionales impide borrarlo, por precaución ante historia desconocida. Al confirmar se comprueban nuevamente las dependencias y se guarda antes de actualizar la vista.

## Validación manual pendiente

QA-011 pasó **59/59** (8 unitarias y 51 de navegador) en Edge 156.0.4314.58 con perfil aislado. Cuatro casos nuevos ejercitan retiro lógico de fichas, eliminación y desactivación de enfermeros, fallos y conflicto, y confirmaciones accesibles. La regresión conserva los casos de JSON antiguo, pagos, medicamentos, PWA y offline. Pasaron sintaxis de 12 scripts, manifest JSON y revisión del diff.

1. Revisar retiro de una ficha vacía y de otra con datos ficticios. Cancelar y confirmar archivo.
2. Consultar archivadas, reactivar y crear una nueva ficha. Verificar selección y asociaciones.
3. Añadir un enfermero sin turnos, revisar la eliminación definitiva y cancelar. Repetir y confirmar.
4. Retirar un enfermero con servicios anteriores y turnos futuros. Comprobar las fechas mostradas, el estado Inactivo y la conservación de costos.
5. Abrir una nueva asignación, verificar la exclusión del inactivo, reactivarlo y verificar su disponibilidad.
6. Exportar, recargar y restaurar un JSON con fichas archivadas y enfermeros inactivos.
7. Revisar confirmaciones en móvil y con teclado. Verificar foco, cancelación y mensajes.

La revisión automatizada de accesibilidad es acotada. Lectores de pantalla y contraste perceptual de todas las combinaciones quedan pendientes de revisión manual.
