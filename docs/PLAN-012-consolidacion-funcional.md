# PLAN-012 · Consolidación funcional

## PREVIEW-011

GitHub recibió los doce commits autorizados desde `6968fec` hasta `f1511111772e275807aab13e7459fdce177f163c` mediante un avance directo de `development`. `git ls-remote` confirmó ese SHA y `main` en `92c4034085e13bb38fd0a7ff2622c46ef797873d`. La referencia de pruebas del paquete fue 78/78 y la actualización real v13 a v14 pasó 1/1. El check Vercel del SHA devolvió `success`. La consulta de workflows vinculados al commit en el conector no devolvió ejecuciones de PR.

La URL de rama redirige a la pantalla de inicio de sesión de Vercel desde una conexión sin sesión. La verificación funcional de esa URL requiere una sesión con acceso al proyecto. [Preview protegida](https://pastillas-1-git-development-dinamita20.vercel.app/) · [Estado del despliegue](https://vercel.com/dinamita20/pastillas-1/3cctLLwdXgjrJ2y2UB1XHA4gbZ9x).

## Diagnóstico y cambios locales

| Área | Problema y causa | Riesgo | Corrección | Prueba |
| --- | --- | --- | --- | --- |
| Formularios | El aviso común aparecía al pie aunque el error identificara un campo. Agregar una pauta reconstruía los horarios y podía reemplazar una hora borrada por la predeterminada. | Corregir el campo equivocado o guardar una hora accidental. | Mensaje junto al control y foco asociado. Conservar los valores originales de las horas al editar la lista de pautas. Mantener el aviso general para fallos de guardado. | Borrador con hora vacía, foco, corrección y dos pautas. |
| Medicinas, compras e insumos | Guardar modificaba el objeto en memoria antes de escribir. | Una compra fallida podía mostrar existencias actualizadas o un mensaje de éxito. | Preparar el estado candidato, guardarlo y aplicar la actualización solo tras el éxito. Diferenciar agotado, insuficiente y compra próxima con el resultado existente. | Alta, edición, fallo en compra, inventario compartido y pautas abiertas. |
| Inicio | Saldo, reposición y citas compartían prioridad aunque sus plazos fueran diferentes. El pendiente de cita repetía el lugar de la tarjeta de citas. | La lista dificulta identificar lo que requiere atención hoy. | Priorizar faltantes urgentes y citas de hoy. Mostrar el pendiente financiero sin importes y mantener lugar y notas en el detalle. | Orden y mensajes de reposición, citas, privacidad y accesos. |
| Calendario y citas | El día actual se distinguía solo por estilo. La acción de mes perdía el foco al quedar deshabilitada. El día mostraba citas sin acceso directo a edición. | Dificultad para orientarse y repetir pasos con teclado. | Identificar el día actual con `aria-current`, enfocar el mes al llegar a su límite y enlazar al formulario de la cita desde el día. Los nombres duplicados se distinguen por ficha en el listado. | Día actual, edición, fecha requerida, límites mensuales, modalidades y prepago. |
| Pagos, fichas y enfermería | Importe y tarifas admitían errores sin asociación al control. Una edición de enfermería cambiaba en memoria el registro antes de guardar. | Corrección difícil y estado temporal inconsistente. | Asociar los errores que identifican campo y guardar primero el estado candidato de alta o edición de enfermería. Se conservan los flujos verificados de fichas y retiro de personal. | Tarifas cero y ausente, IDs, turnos, altas, archivo, restauración y saldos. |
| Respaldos | La ayuda de exportación era genérica. Escape no anunciaba la cancelación y el botón final se podía volver a invocar. | Incertidumbre sobre contenido y efecto de confirmar. | Detallar qué se exporta y qué instalación se reemplaza. Anunciar cancelación por teclado y consumir la confirmación al primer clic. | Escape, cero escrituras al cancelar, una sola escritura al confirmar y recuperación. |
| Estabilidad | El aviso de persistencia se reconstruía durante cada refresco incluso cuando su contenido coincidía. | Pérdida del nodo y del foco al recargar por conflicto. | Reutilizar `updateHTML`; conservar también la apertura y el foco de las pautas del inventario durante los refrescos. | Refresco con y sin cambios, preservación de interacción y regresiones de renderizado. |

Los cambios de producto están en `app.js`, `appointments.js`, `care-ui.js`, `forms.js`, `inventory.js`, `index.html`, `styles.css` y `sw.js`. La suite está en `tests/persistence.spec.js` y `tests/payments.spec.js`. El modelo, la clave `pastillas-v1`, el JSON de respaldo, las reglas financieras, los umbrales de reposición y el motor de cobertura usan las estructuras y funciones existentes.

## QA-022 y límites

Pruebas con perfil temporal de Microsoft Edge 157.0.4341.46, Node.js 24.20.0 y datos ficticios. La regresión de reflujo incluye 320, 360, 390, 430, 768, 1024 y 1280 px. Se revisaron las reglas existentes de movimiento y transparencia reducidos, el foco visible y las comprobaciones de consola instrumentadas por la suite. La validación de almacenamiento entre pestañas sigue siendo preventiva y conserva la comprobación previa a la escritura.

`node --test tests/payments.spec.js tests/persistence.spec.js` pasó **82/82**, incluidas las 78 pruebas anteriores. También pasaron la sintaxis JavaScript, el JSON de `manifest.json` y `git diff --check`. La actualización real v14 a v15, usando una copia exacta de `f151111` mediante `ACOMPANHA_PREVIOUS_ASSETS`, pasó **1/1**. Verificó espera con borrador abierto, activación tras cerrar el cliente anterior, recursos nuevos, conservación de `pastillas-v1`, apertura y escritura offline y recarga.

Quedan pendientes el zoom real, el lector de pantalla, los dispositivos físicos y la comprobación funcional de la Preview protegida. El alcance de las pruebas no establece conformidad integral WCAG 2.2 AA.

## Checklist del propietario

- [ ] Abrir Inicio con citas de hoy y próximas y productos por reponer. Confirmar prioridades, ficha y accesos.
- [ ] Agregar y editar una medicina ficticia con dos pautas. Borrar una hora, agregar otra pauta y verificar el borrador antes de guardar.
- [ ] Consultar agotamiento, existencias insuficientes y reposición próxima. Registrar una compra e inspeccionar cantidad, pautas y precio.
- [ ] Navegar el calendario por teclado hasta el primer y el último mes. Abrir una fecha con cita y editarla desde el detalle.
- [ ] Crear o editar enfermería con tarifas cero y ausentes. Asignar ambas modalidades, revisar repetición, inactividad y costos guardados.
- [ ] Revisar deuda, saldo cero, saldo a favor, cancelaciones, fechas legadas y ocultación de importes en Pagos.
- [ ] Crear, editar, archivar y reactivar una ficha. Comprobar las referencias de citas y asignaciones.
- [ ] Exportar un respaldo ficticio. Cancelar con Escape y después restaurarlo, recargar y comparar los datos.
- [ ] Revisar reflujo, áreas táctiles, foco y lectura con zoom real, lector de pantalla y dispositivo físico.
- [ ] Probar actualización con un borrador abierto en v14. Tras guardar o cancelar, cerrar los clientes anteriores y comprobar apertura, consulta y escritura offline en v15.

PLAN-012 queda en commits locales a la espera de autorización para publicarlo. Se preservaron los cuatro documentos ajenos de COB-001, UX-004, PLAN-005 y QA-008.
