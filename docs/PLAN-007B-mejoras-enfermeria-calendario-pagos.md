# PLAN-007B — Enfermería, calendario y pagos

## Objetivos y base

Mejorar la organización y lectura de datos existentes. Base local en development, d0efb1e8fef58f4ca5e4f37323a27700beed4ac7, cinco commits de PLAN-007 sobre origin/development 972a856. Fetch confirmó ausencia de divergencias. main estaba en 92c4034085e13bb38fd0a7ff2622c46ef797873d. El índice estaba vacío. COB-001 y UX-004 estaban modificados, QA-008 y PLAN-005 sin seguimiento. Los cuatro permanecen fuera de este ciclo. No se encontraron documentos de coordinación ni instrucciones AGENTS en el repositorio.

## UX-007 y ENF-003

Pagos presenta grupos Activos e Inactivos con contadores y estados vacíos. Cada fila conserva el índice original en sus acciones. La agrupación se aplica a la representación y mantiene el orden relativo. Las tarjetas inactivas usan gris neutro, texto oscuro, etiqueta textual y acción Reactivar. Editar conserva el acceso al retiro confirmado de PLAN-007.

Cada enfermero tiene un panel expandible de asignaciones e historial, de más reciente a más antiguo, incluidas las futuras y los datos legados. Los recuentos operativos de jornadas conservan su cálculo previo. Las listas históricas siguen ordenadas por fecha. El selector de nuevas asignaciones conserva el orden de los activos elegibles.

## ENF-004 y CAL-002

El detalle de fecha separa las asignaciones existentes de la nueva captura. Muestra nombre, modalidad, inactividad y costo guardado o condición legada. Los campos conservan jornada completa, media y repetición semanal existente. La aplicación dispone de alta y de la acción Quitar con sus bloqueos existentes. No existe un editor independiente de una jornada guardada.

El calendario usa C, M y ? junto al nombre. La leyenda explica las abreviaturas. El nombre accesible del botón de fecha incluye todas las asignaciones, su modalidad y estado, incluso cuando la celda resume las primeras tres. El detalle del día permite consultar la información completa. Las marcas de prepago y conteo pendiente siguen usando cover.

## PAG-002 y UX-008

Cada modalidad indica su tarifa o Sin configurar. El valor cero conserva formato monetario y participa en la protección de visibilidad de montos existente. El saldo identifica a la administradora. El historial explica que reúne movimientos sin cierre mensual automático, conservando el orden de abonos y cancelaciones.

Los estados vacíos explican que una nueva asignación necesita personal activo con tarifa. Las confirmaciones de PLAN-007 y su guardado previo a la actualización siguen siendo los puntos de gestión. La reactivación directa utiliza esa misma confirmación. Los paneles de asignaciones, errores y confirmaciones tienen superficies sólidas.

## Compatibilidad y límites

La presentación usa objetos derivados con los índices originales. Las fórmulas, IDs, tarifas, importes históricos, arrays persistidos y clave pastillas-v1 conservan su comportamiento. Los registros legados sin modalidad permanecen identificados como desconocidos. Se conserva exportación, restauración y protección preventiva DATA-001.

Los avisos exitosos se limitan a los cambios de estado visibles después del guardado. La interfaz mantiene la privacidad de montos existente. El render periódico puede cerrar paneles expandibles, una característica previa del render completo. Mejorar la conservación del estado expandido queda como propuesta futura.

## QA-012

La suite combinada pasó **62/62** (8 unitarias y 54 de navegador) con fixtures ficticios y perfil aislado de Edge. Tres pruebas nuevas comprueban orden visual estable, referencias y cambios de estado, calendario/modalidades/costos y reflujo/foco. Se verificó que renderizar conserva el JSON y que exportación, restauración y recarga conservan los índices originales.

Las pruebas de tarifa muestran cero y un importe positivo, distinguiéndolos de Sin configurar. La revisión móvil cubre 320, 360, 390, 430, 768 y 1280 px. Se inspeccionó una captura de inactivos a 390 px. El texto principal sobre el fondo gris tiene contraste calculado 10.39 a 1 y el secundario 5.95 a 1. La opacidad de la tarjeta es 1. Pasaron sintaxis de 12 scripts, manifest JSON y revisión del diff. domain.js, payments.js y compatibility.js coinciden con la base.

La primera corrida dio 61/62 por un selector de prueba que encontraba un botón de reactivación fuera del diálogo abierto. Se acotó la selección al diálogo y la segunda corrida completa pasó. La regresión conserva pruebas de fallos de almacenamiento, conflictos, historial, accesibilidad, movimiento/transparencia reducidos, PWA y offline.

El zoom real del navegador y lectores de pantalla quedan pendientes. El contraste calculado de los textos nuevos y los casos de teclado no acreditan conformidad integral WCAG 2.2 AA. La distribución de nombres largos y preferencias de sistema se incluyen en la revisión manual.

## Checklist del propietario

1. Revisar activos primero e inactivos al final, con orden relativo estable.
2. Editar un enfermero en cada grupo y confirmar que se abre la persona elegida.
3. Desactivar y reactivar, observando el cambio de grupo y la conservación de datos.
4. Registrar jornadas completas y medias con datos ficticios y revisar sus costos guardados.
5. Consultar varios enfermeros en una fecha, incluidos inactivos y registros legados.
6. Revisar C, M y ?, la leyenda, prepago y pendiente en el calendario.
7. Comparar tarifa ausente, cero y positiva mediante Ver montos.
8. Consultar asignaciones, abonos, cancelaciones e historial legado.
9. Probar confirmaciones y cancelación mediante teclado.
10. Revisar móvil, escritorio y zoom real de 200 %.
11. Exportar y restaurar JSON, recargar y comprobar índices y estados.
12. Comprobar apertura offline y preferencias de movimiento reducido.

La aprobación manual del propietario y la publicación conjunta con PLAN-007 siguen pendientes.
