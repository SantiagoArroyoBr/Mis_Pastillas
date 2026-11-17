# RECONST-001 · Evaluación de inicio de la reconstrucción

**Acompaña está lista como referencia funcional para iniciar una reconstrucción local y aislada.** La base tiene contratos observables de inventario, pagos, recuperación y operación offline. El lanzamiento de la PWA actual, el cambio de arquitectura y el traslado de datos son decisiones separadas con sus propios criterios.

## Referencias fijadas

| Referencia | Qué acredita |
| --- | --- |
| `799fac2e859f0564d620981fbd504f5cab5f7454` · `development` local, caché v21 | Referencia funcional para la reconstrucción. Incluye la identificación del archivo en la revisión y confirmación de restauración. La entrega v21 está pendiente de Preview. |
| `3a1c19bab068c6a5da9cfb494f0bf6084ea65356` · `origin/development`, caché v20 | Referencia publicada. Incluye montos independientes, recarga offline en Edge, conflicto entre pestañas observado y aprobación global del recorrido de iPhone. |
| `92c4034085e13bb38fd0a7ff2622c46ef797873d` · `origin/main` | Referencia remota de Git para `main`. La evaluación se centró en `development`. |

Se repitió `node --test tests/payments.spec.js tests/persistence.spec.js` sobre la referencia local con Node.js 24.20.0, Edge 157.0.4341.60, perfil temporal y datos ficticios. Pasaron **102/102** en 50,3 s. La comprobación exacta v20 → v21 registrada en el lote anterior pasó con un borrador abierto durante la espera, cancelación de restauración offline y conservación del registro. La evidencia publicada y los límites del informe de iPhone se documentan en [MACRO-004](MACRO-004-preparacion.md) y el [historial](../HISTORIAL_CAMBIOS.md#2026-11-16--ux-respaldo-001).

## Contrato mínimo de equivalencia

| Área | Comportamiento que debe reproducir la nueva versión | Evidencia actual |
| --- | --- | --- |
| Fichas, citas y enfermería | Preservar índices e IDs, sus relaciones y estados de archivo o inactividad. Los registros históricos se conservan al editar o agregar datos. | `tests/persistence.spec.js`, casos de alta, archivo reversible, retiro, nombres duplicados y respaldo. [Decisiones de fichas y cobertura](../PLAN-005A-DECISIONES.md). |
| Inventario | Varias pautas independientes descuentan del mismo inventario. Compras y precios históricos mantienen sus valores. Un dato inválido o un fallo de escritura deja accesible el valor anterior. | `tests/persistence.spec.js`, casos de pautas, compras, desbordamiento, escritura fallida y exportación. |
| Pagos | Separar cobertura por fecha, aplicaciones individuales y saldo general. Comparar importes en centavos, tarifas históricas, anticipos, cancelaciones y recibos con fecha inválida. | `tests/payments.spec.js`, recorridos de pagos de `tests/persistence.spec.js` y [regla de recibos históricos](FIX-FECHA-002-integridad-recibos.md). |
| Persistencia y recuperación | Validar el JSON antes de sustituir datos, mantener el respaldo original disponible, revisar y confirmar por separado, y conservar el borrador ante fallos o conflictos observados. Preservar `pastillas-v1` en la instalación actual. | Casos de restauración, cuota, concurrencia y escrituras fallidas en `tests/persistence.spec.js`. [Arquitectura vigente](../ARQUITECTURA.md). |
| PWA y accesibilidad | Cargar y operar sin red después de una visita, exportar offline y conservar datos al actualizar. Mantener navegación por teclado, nombres accesibles y foco en formularios y diálogos. | Pruebas de actualización, render del árbol accesible y reflujo. [Validación de escritorio y Preview](MACRO-004-preparacion.md). |

## Lotes de reconstrucción

1. **Equivalencia local.** Usar los SHA registrados como referencias. El primer corte recorre ficha → enfermería → jornada → abono → exportación y restauración. Ejecutar ambos sistemas con el mismo conjunto ficticio y comparar relaciones, movimientos, importes en centavos y resultado de restauración. Agregar desde el principio un caso histórico y un fallo de escritura. Trabajar en un entorno aislado del origen familiar y conservar la versión actual disponible.
2. **Flujos restantes.** Incorporar inventario, calendario, historiales, accesibilidad y PWA offline. Reutilizar el inventario de escenarios de la referencia, con casos de recarga, restauración, cuotas, actualización y dos pestañas. Revisar con dispositivos físicos las diferencias que la automatización de escritorio no cubre.
3. **Transición de datos.** Ensayar importación, exportación, reconciliación y retorno a la instalación anterior con respaldos ficticios representativos. Exigir coincidencia de IDs, relaciones, importes y totales y un plan de recuperación validado antes de tocar datos reales. Si se aprueban cuentas, familias múltiples o sincronización, resolver el modelo de permisos y las escrituras concurrentes y ejecutar CAL-001 en un entorno separado. [Plan de recuperación y migración](arquitectura/DAT-003-respaldo-restauracion-migracion.md) · [Matriz CAL-001](arquitectura/CAL-001-matriz-pruebas-aislamiento.md).

### Equivalencia financiera verificada

RECONST-007 alimenta el módulo `payments.js` de la PWA y las funciones SQL del piloto con las mismas jornadas y movimientos ficticios. Compara las asignaciones en centavos, el rechazo de excedentes y los totales generales en tres fechas de corte antes y después de cancelar un abono. El caso se reproduce con `npm test` desde `backend`. [Prueba de comparación](../backend/tests/database.spec.mjs).

Para completar el primer corte falta reconciliar un respaldo de extremo a extremo entre ambos formatos. Los casos de fecha histórica inválida, relaciones sin correspondencia y campos que el esquema destino todavía no representa deben quedar identificados en esa reconciliación. [Plan de respaldo y restauración](arquitectura/DAT-003-respaldo-restauracion-migracion.md).

### Calendario de Inicio

Mantener la vista mensual por ficha de la PWA como referencia. Debe reunir citas, jornadas de enfermería y fechas estimadas de compra o agotamiento, con una leyenda y un detalle al seleccionar un día. La primera versión debe reutilizar el cálculo de inventario, distinguir fechas reales de estimaciones y respetar los permisos vigentes de enfermería. Inicio conserva avisos resumidos y el calendario concentra la consulta por fecha.

Para verificar la paridad, usar una ficha ficticia con una cita próxima, dos jornadas de distinta modalidad, una compra sugerida y un artículo agotado. Probar dos eventos el mismo día, días con fecha histórica inválida, cambio de mes, ficha archivada, teclado y pantalla de 320 px. El calendario podrá incorporarse después del lote de Configuración.

## Decisiones pendientes

- **Alcance de la reconstrucción.** El primer lote puede definirse sobre la PWA local. Backend, autenticación, sincronización, servicios y cambios del formato requieren una decisión explícita. [Evaluación de alternativas](arquitectura/DAT-002-evaluacion-backend-auth-aislamiento.md).
- **Datos ambiguos y edición simultánea.** Los respaldos ambiguos de `pay.w` conservan la revisión manual. Cualquier regla nueva necesita un caso verificable. La protección vigente detecta conflictos observados, con una ventana de carrera entre comparar y escribir. Una versión que admita edición simultánea necesita un contrato específico de concurrencia y compatibilidad.
- **Cierre de la candidata actual.** La evidencia sigue limitada en instalación de escritorio, respaldo grande móvil y anuncios de VoiceOver. Se mantiene el estado de candidata condicionada. La aprobación del iPhone acredita el recorrido que comunicó el propietario. [Criterios de lanzamiento](RC-1.0-criterios-lanzamiento.md).

El primer lote entregable es la comparación de equivalencia con datos ficticios. Esta evaluación registra sus límites y criterios. La implementación de una nueva arquitectura y su publicación todavía requieren definir el alcance autorizado.
