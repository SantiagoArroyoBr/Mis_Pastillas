# MACRO-004 · Preparación de la validación de RC 1.0

El propietario aprobó la revisión local documentada en `90a15be1e6cb5801e0c9825f884020076337c143` y autorizó continuar con la publicación de la candidata y su validación. El lote agrupa Preview, dispositivos, accesibilidad y recuperación de la misma candidata. La ejecución de cada recorrido depende del acceso a su entorno. La clasificación sigue en [B · Candidata condicionada](RC-1.0-criterios-lanzamiento.md).

## Paquete de publicación

La consulta de solo lectura a GitHub devolvió `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4` para `development` y `92c4034085e13bb38fd0a7ff2622c46ef797873d` para `main`. El primero es ancestro directo del paquete propuesto para `origin/development`, que contiene estos cuatro commits:

| SHA | Contenido |
| --- | --- |
| `d31b2892fe74fa353deb000c36c61e48ff5dc8ee` | Protección de compras y proyección de existencias. |
| `c75e3364cb405f0baf5cba63719be3e737e09e4f` | Accesibilidad de formularios y revisión previa de Calendar. |
| `d59b4f9b8f7692af105afc4c8f57bb9e0a91cf0c` | Regresión integral, escala y cuota. |
| `6b0d84c046e82c05eb0a7910d296b50811d88817` | Evidencia de MACRO-003 y criterios de la candidata. |

El 15 de noviembre de 2026 se publicó el paquete de cuatro commits hasta `6b0d84c` en `origin/development`, tras comprobar que la [validación local](QA-RC-LOCAL-001-candidata.md) pasó 101/101 pruebas y la actualización exacta v17 → v18. El SHA remoto se verificó después del push. `origin/main` seguía en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. Los commits posteriores de coordinación y QA quedaron en el checkout local.

El estado de Vercel para ese SHA pasó de `pending` a `success`. La URL de rama respondió HTTP 302 sin sesión. Tras iniciar sesión, el panel de Vercel mostró el deployment como **Ready**, en el entorno **Preview**, con origen Git `development` y SHA `6b0d84c`. [Deployment registrado por GitHub](https://vercel.com/dinamita20/pastillas-1/39mivWzhzKtcebkHnBL3teAZV36R) · [Preview de development](https://pastillas-1-git-development-dinamita20.vercel.app/).

## Lote de validación

Ejecutar cada recorrido con datos ficticios en un perfil aislado. Registrar SHA o deployment confirmado, dispositivo, navegador, tecnología de asistencia cuando corresponda, caso, resultado y pasos de reproducción de cualquier fallo.

| Orden | Entorno y dependencia | Recorrido y aceptación |
| --- | --- | --- |
| 1 | Preview autenticada con SHA acreditado. MACRO-002 puede probarse si se recupera acceso al deployment de `6ea578c`. La candidata depende de PUB-M003. | Crear ficha, medicamento con dos pautas, compra, personal con ambas tarifas, cita y abono. Tras recargar, comprobar referencias, existencias e importes. Exportar el JSON, cancelar una restauración y después confirmarla. Comparar el estado restaurado. |
| 2 | Computadora y móvil físicos con instalación desde el navegador. Para oferta de actualización, comprobar versión inicial y final. | Abrir, editar, exportar y recargar offline. Actualizar con un borrador abierto, verificar la espera y volver a exportar tras reconectar. Probar recuperación con el conjunto de escala y registrar tamaño, tiempos y comportamiento ante cuota, con comparación v17/v18 en el mismo equipo cuando esté disponible. |
| 3 | Navegador con teclado, zoom 200 % y 400 % y lector de pantalla. | Recorrer calendario, pautas, estado de cuenta y restauración. Registrar etiquetas y mensajes anunciados, orden del foco, apertura y cierre de diálogos y si se puede completar la acción. |
| 4 | Dos pestañas del mismo origen. | Editar en ambas, guardar en una y comprobar que la otra conserva el borrador al detectar el conflicto. Recargar y verificar cuál estado persiste. Ante pérdida o corrupción, conservar el respaldo ficticio y abrir un defecto de integridad. |

Al cerrar el lote, presentar los resultados frente a los [criterios de salida](RC-1.0-criterios-lanzamiento.md#criterios-de-salida) para la decisión del propietario.

### Verificación autenticada de la candidata

Se probó el dominio propio del deployment `39mivWzhzKtcebkHnBL3teAZV36R` en el navegador integrado de Codex. Ese dominio tiene almacenamiento separado de la URL de rama y de producción. La vista inicial mostró las fichas predeterminadas. Se usaron datos ficticios.

| Caso | Resultado observado |
| --- | --- |
| Alta y recarga | Se creó una ficha, un producto con dos pautas independientes y una compra de dos cajas de cinco unidades por 60 MXN. La existencia pasó de 20 a 30 unidades. La cita de esa ficha seguía visible tras recargar. |
| Enfermería y saldo | Se registraron tarifas de 120 y 65 MXN y un abono de 50 MXN. Tras restaurar, se mostraron ambas tarifas, un único movimiento y 50 MXN a favor. |
| Exportación JSON | Se descargó el respaldo y se inspeccionaron dos pautas, inventario de 30, compra de 10 por 60 MXN, ambas tarifas y abono de 5 000 centavos. El respaldo validado mostró tres fichas, un producto, una cita y una persona de enfermería. |
| Cancelación y restauración | Tras corregir la existencia a 31, cancelar en la confirmación final conservó 31. Confirmar recuperó las 30 unidades exportadas y la interfaz anunció que la restauración había terminado. |

Queda pendiente la recarga offline en Preview. La evidencia offline de la candidata corresponde a la [prueba local](QA-RC-LOCAL-001-candidata.md). [Preview específica de la candidata](https://pastillas-1-q3p9b4vfl-dinamita20.vercel.app/).

### Verificación autenticada de MACRO-002

Vercel mostró el deployment `62wNELnkgumi7b9WT8FHwir2Sbqa` como **Ready** en **Preview** y confirmó el SHA `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4`. En su dominio propio, separado del alias de rama y de producción, se creó una ficha temporal ficticia y se verificó que siguiera visible tras recargar.

Se seleccionó el respaldo ficticio exportado desde la candidata v18. La revisión previa mostró tres fichas, un medicamento, una cita y una persona de enfermería. Cancelar desde la confirmación final conservó la ficha temporal. Tras confirmar, se recuperó la cita de la ficha ficticia y se pudo exportar un nuevo JSON. La comparación verificó igualdad en fichas e inventario, citas, enfermería, asignaciones, libros de pagos y configuración. El respaldo de la candidata fue aceptado por v17 en este conjunto de prueba.

El recorrido fue en línea. El navegador integrado permitió usar la sesión autenticada y restaurar el archivo, pero su control de pestañas no ofreció desconexión de red para comprobar la recarga offline. [Panel del deployment](https://vercel.com/dinamita20/pastillas-1/62wNELnkgumi7b9WT8FHwir2Sbqa) · [Preview histórica](https://pastillas-1-keiu5ycew-dinamita20.vercel.app/).

### Zoom efectivo en flujos críticos

Se repitieron cuatro escenarios existentes de `tests/persistence.spec.js` a cada nivel de zoom en Edge 157.0.4341.60. Un arnés temporal aplicó zoom por origen mediante `chrome.tabs.setZoom` y lo confirmó con `getZoom` y `devicePixelRatio`. Con una ventana inicial de 1320 × 900, Edge reportó 647 CSS px al 200 % y 323 CSS px al 400 %. Pasaron **4/4 en cada nivel**. Se verificaron foco al validar una cita y al cambiar de mes, nombres accesibles y foco al añadir o quitar horas, cancelación de restauración con Escape y confirmación de un solo uso, y conservación de saldo, cancelaciones y recibos históricos tras exportar y restaurar. Quedan pendientes la inspección visual de esos flujos ampliados y la experiencia con lector de pantalla.

## Datos históricos y coexistencia

- **Respaldos ambiguos.** `compatibility.js` detiene la importación de `pay.w` cuando la fecha histórica `paid` de una ficha difiere de la global o cuando otros metadatos o asignaciones entrarían en conflicto. La prueba con `pay.w[0].paid = "2020-02-30"` y sin fecha global comprobó que el estado activo sigue idéntico y que no aparece la confirmación. La decisión pendiente es si mantener el rechazo o definir una representación por ficha con significado explícito. Una regla futura debe verificar el original, índices, fechas, importes, ausencia de duplicados y restauración antes de adoptar el formato.
- **Recibos con fecha imposible.** Sigue vigente [FIX-FECHA-002](FIX-FECHA-002-integridad-recibos.md). El recibo conserva texto, importe y vínculos. Una cancelación explícita mantiene su trazabilidad y el saldo se comprueba por ID.
- **Concurrencia.** La candidata compara el valor esperado y preserva el borrador al detectar una escritura externa. Si el propietario requiere edición simultánea, la especificación debe cubrir escrituras y restauraciones en dos clientes cooperativos, convivencia con v17/v18, pérdida del cliente que posee el bloqueo y navegador sin soporte. La alternativa para la candidata es operar con una sola pestaña editable y someter el riesgo residual a decisión explícita. [Evidencia de concurrencia](MACRO-003-validacion-integral.md#conc-002)

Se repitieron seis casos de `tests/persistence.spec.js` en Edge 157.0.4341.60 con datos ficticios. Pasaron **6/6**: turnos y textos legados, rechazo de metadatos ambiguos, recibos históricos, verificación antes y después de escribir, pestaña obsoleta y retorno a una pestaña con borrador abierto.
