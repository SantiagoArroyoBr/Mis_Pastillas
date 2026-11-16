# Acompaña · Criterios para Release Candidate 1.0

**Clasificación B · Candidata condicionada.** La decisión de lanzamiento queda pendiente de la revisión manual y del propietario. La evidencia técnica y sus límites están en [MACRO-003](MACRO-003-validacion-integral.md).

## Alcance congelado

| Incluido | Límite del alcance |
| --- | --- |
| Fichas, archivo reversible y consulta de relaciones | Los índices existentes identifican las fichas. |
| Medicinas, insumos, compras, precios y reposición | Las pautas independientes consumen del mismo inventario. La reposición estima existencias. |
| Citas, calendario, turnos, enfermería y tarifas | Las jornadas guardadas conservan sus costos históricos y las referencias a personal inactivo. |
| Saldo de la administradora, abonos, cancelaciones e historiales | Las jornadas futuras se excluyen del saldo. Se conserva la semántica de prepagos y fechas legadas. |
| Avisos locales, respaldo, restauración y funcionamiento offline | Se usa el almacenamiento del navegador. Compartir requiere revisión previa. |

Quedan fuera el backend, autenticación, sincronización multidispositivo, cifrado aplicativo, avisos push y conciliación automática de datos ambiguos. Cambiar el almacenamiento o incorporar un protocolo entre versiones requiere una decisión separada.

## Criterios de salida

| Área | Criterio mínimo | Estado |
| --- | --- | --- |
| Estabilidad | Regresión funcional, financiera y de recuperación sin fallos reproducibles P0/P1. | Verificación automatizada local. |
| Integridad | Conservar `pastillas-v1`, índices, IDs, importes guardados y libros históricos. Los fallos verificados preservan el valor anterior o señalan que el resultado quedó incierto. | Verificación automatizada local. |
| Respaldo y recuperación | Exportar, revisar, cancelar y restaurar JSON en el mismo dispositivo. Probar cuota, acceso denegado y colisión con otra pestaña. | Casos probados en Edge con datos ficticios. Falta el recorrido guiado en dispositivos reales. |
| Offline y actualización | Abrir, operar, recargar y exportar offline. Al actualizar, respetar el cierre del cliente anterior y conservar los datos. | Verificación automatizada local. Falta comprobar instalación desde la interfaz del navegador y otros sistemas. |
| Accesibilidad | Usar los flujos críticos con teclado, foco visible, nombres accesibles, contraste y reflujo. Revisar zoom 200 % y 400 % y al menos un lector de pantalla. | Reflujo básico verificado en Edge. También pasaron cuatro escenarios automatizados de calendario, pautas, pagos y restauración en cada nivel de zoom efectivo. Pendientes la inspección visual y el lector de pantalla. [QA local](QA-RC-LOCAL-001-candidata.md) · [Flujos críticos con zoom](MACRO-004-preparacion.md#zoom-efectivo-en-flujos-críticos). |
| Rendimiento | Ejecutar el recorrido con el conjunto de escala documentado y verificar que carga, navegación y restauración resulten utilizables en los dispositivos previstos. Comparar con v17 en el mismo entorno. | Medición en Edge de escritorio. Falta el contraste con móvil físico. |
| Publicación | Revisar el SHA de la candidata en una Preview autenticada con datos ficticios. Registrar el resultado y obtener autorización del propietario. | Pasó el recorrido autenticado en línea de `6b0d84c` y la recarga offline de la Preview vigente `3a1c19b`. Pendiente la decisión de lanzamiento del propietario. [Evidencia en línea](MACRO-004-preparacion.md#verificación-autenticada-de-la-candidata) · [Evidencia offline](MACRO-004-preparacion.md#recarga-offline-en-la-preview-vigente). |

## Riesgos y bloqueadores

- El modelo local admite un riesgo residual de sobrescritura si dos clientes leen el mismo valor antes de escribir. Para un lanzamiento basado en edición de una instalación en una sola pestaña, el propietario debe aceptar este límite. Si necesita edición simultánea segura, hace falta un protocolo cooperativo con evaluación de clientes anteriores.
- Las cuotas varían por entorno. Un archivo que pasa la validación estructural todavía puede exceder el espacio disponible. La aplicación debe conservar el valor anterior frente al fallo y permitir guardar una copia legible.
- Bloquean el lanzamiento cualquier pérdida o corrupción reproducible dentro de los escenarios previstos, diferencias financieras sin explicar, fallo de restauración recuperable sin aviso, interrupción de la actualización con datos en riesgo o una barrera que impida completar una tarea crítica.
- Antes de pasar de B a A, completar los recorridos manuales de Preview, dispositivos, zoom y lector de pantalla. Documentar cualquier riesgo aceptado y obtener el visto bueno del propietario.
