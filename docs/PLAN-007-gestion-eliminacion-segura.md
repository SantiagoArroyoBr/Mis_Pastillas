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
