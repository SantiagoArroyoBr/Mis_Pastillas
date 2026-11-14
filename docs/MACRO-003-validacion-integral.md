# MACRO-003 · Validación integral y preparación de RC 1.0

**Clasificación B · Candidata condicionada.** MACRO-003 queda en `development` local para revisión. Los criterios de salida y la decisión pendiente están en [RC 1.0](RC-1.0-criterios-lanzamiento.md).

## Coordinación y PREVIEW-M002

El checkout inicial estaba en `development` con HEAD `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4`. El índice estaba vacío y había un solo worktree. Se conservaron cuatro documentos ajenos. COB-001 y UX-004 tenían modificaciones, y PLAN-005 y QA-008 seguían sin seguimiento. Se consultaron los informes anteriores, la guía, el plan y la arquitectura.

`git fetch origin` confirmó que `6896774545a4deab9526c78f0353cbcb032dd65e` era antecesor directo del tramo autorizado, con cuatro commits por delante y cero por detrás. Se revisaron el diff y la evidencia de **92/92** pruebas y actualización v16 → v17 del mismo paquete. El push avanzó `development` a `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4`. Los commits enviados fueron `09fb695654a865590b4ccbcbcc8bbd14b22c3213`, `c5eb18eacad45505e07585fc3104ac7f4ade5a66`, `f208ef6eadce482b36cf14e8c37b1ad134eb58e6` y `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4`. `main` permaneció en `92c4034085e13bb38fd0a7ff2622c46ef797873d`.

GitHub devolvió el estado combinado de Vercel `success`. El conector de GitHub Actions devolvió cero ejecuciones de pull request para ese SHA. La URL de rama no fue accesible sin sesión desde la herramienta de verificación. La comprobación funcional autenticada queda pendiente. [Preview de development](https://pastillas-1-git-development-dinamita20.vercel.app/) · [Despliegue de Vercel](https://vercel.com/dinamita20/pastillas-1/62wNELnkgumi7b9WT8FHwir2Sbqa).

## Hallazgos y correcciones

| Prioridad | Reproducción y causa | Corrección y prueba |
| --- | --- | --- |
| P0 | Una compra con cantidades finitas de `1e200` por caja y `1e200` cajas desbordaba el producto. JSON podía guardar `null` en lugar de la existencia o cantidad comprada. | `app.js` rechaza el total no finito antes de guardar. Se conserva el estado anterior, el resto del borrador y el foco en cantidad. |
| P1 | Volver a una pestaña podía dejar controles de edición activos si el cambio externo aún no se había reflejado en un evento. | `app.js` compara el valor persistido al recuperar visibilidad y al volver desde la caché de navegación. Protege el guardado y conserva el borrador. |
| P1 | En Medicinas, martes y miércoles tenían el mismo nombre accesible abreviado. Los selectores agrupados carecían de nombre seccional y agregar o quitar una hora podía perder el foco. | `forms.js` incorpora nombres completos y grupos nombrados. Se mantiene el foco al cambiar horas. `inventory.js` enfoca la pauta agregada o la que queda al quitar otra. Se comprobó el árbol de accesibilidad y el teclado de Edge. |
| P1 | Las acciones de Calendar tenían un enlace externo con datos en el destino. Las acciones nativas del enlace podían saltar la vista previa. Los fragmentos Unicode incompletos podían lanzar una excepción al formar el enlace. | Los controles de `app.js`, `appointments.js` e `inventory.js` abren la vista previa desde botones. `domain.js` y `appointments.js` serializan parámetros con `URLSearchParams`. `sharing.js` nombra y enfoca el diálogo. Se probó cancelación y confirmación con salida interceptada. |
| P1 | Un refresco con muchos productos calculaba hasta 1 000 días de tomas futuras aunque el inventario ya se hubiera agotado. Medicinas calculaba el inventario de la ficha seleccionada dos veces. | `domain.js` conserva el horizonte y procesa por tramos hasta la primera toma que no alcanza. `app.js` reutiliza el mismo cálculo durante el render de Medicinas. La prueba compara existencias, número de tomas y última toma con la proyección completa anterior, incluidos horarios coincidentes y límites. |
| P2 | Falta evidencia de instalación desde el navegador en dispositivos físicos, cuota en otros perfiles, zoom real y lector de pantalla. | Quedan en el checklist del propietario y condicionan el RC. |

## QA funcional e integridad

El recorrido de instalación nueva creó una ficha, guardó dos pautas para un medicamento, registró una compra con precio, agregó enfermería con tarifas completa y media y creó una cita asociada a la ficha. Verificó exportación, recarga offline y restauración del mismo contenido.

El conjunto de escala incorporó una ficha archivada, compras históricas y turnos completos y medios. Las regresiones de datos existentes cubrieron enfermería inactiva, citas próximas y anteriores, turnos futuros, saldo pendiente, saldo a favor, cancelaciones, prepagos y recibos legados con fechas inválidas. Se comprobaron referencias, cantidades e importes en guardado, recarga y restauración. Los fallos inyectados cubrieron acceso bloqueado, rechazo de escritura, cancelación y recuperación. Se usaron exclusivamente datos ficticios en Edge 157.0.4341.46 con Node.js 24.20.0.

## STORAGE-002 y PERF-005

Se probó en el mismo equipo y navegador la v17 de `6ea578c` y la candidata. Los conjuntos comparten el generador de datos. Cada tiempo de refresco es la mediana de cinco invocaciones de `render()` con lectura de geometría. Carga inicial usa `DOMContentLoaded`. Validación mide parseo y preparación del estado. Restauración mide desde la selección del archivo hasta el cierre de la confirmación, incluida la automatización CDP. Las mediciones son muestras locales.

El perfil aislado aceptó agregar un campo sintético de 4 MiB a un estado pequeño. El siguiente intento, con 5 MiB más el resto del estado, devolvió `QuotaExceededError` en v17 y en la candidata. Se confirmó que el valor anterior seguía accesible, que su copia se podía exportar y que un guardado posterior de tamaño normal funcionaba. La prueba de importación superior a 10 MiB verifica rechazo previo a la escritura. Estos resultados corresponden a ese navegador y perfil.

Los refrescos con contenido idéntico conservaron los nodos y el foco en las pruebas de regresión. Las muestras de memoria JS son aproximadas y varían con el recolector. Quedaron fuera de medición el costo de composición de `backdrop-filter`, la cantidad total de listeners y la latencia en dispositivos físicos.

| Productos / compras | JSON en bytes | Carga v17 → v18 (ms) | Medicinas (ms) | Inicio y calendario (ms) | Pagos (ms) | Restaurar (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4 / 16 | 4 419 | 196,5 → 196,1 | 12,1 → 2,3 | 10,6 → 4,2 | 1,7 → 2,2 | 32 → 35 |
| 24 / 576 | 48 366 | 201 → 177,5 | 57,9 → 22,4 | 55,9 → 9,5 | 7,8 → 4,5 | 163 → 80 |
| 96 / 19 200 | 1 165 851 | 1 405,1 → 345,1 | 873,5 → 81,8 | 599,9 → 64,3 | 20 → 80,8 | 200 → 552 |

Para el conjunto grande, la serialización midió 8,3 → 28,1 ms, el guardado 10,5 → 43,2 ms y la validación 25,2 → 103,8 ms. El DOM conservó 4 607 nodos tras recorrer las tres secciones. La muestra de heap pasó de 28,7 a 30,3 MB. En la suite final completa, Medicinas midió 213,2 ms, Inicio 87,5 ms, Pagos 54,3 ms y restauración 558 ms con ese conjunto. Las muestras de Pagos, guardado, validación y restauración de la candidata fueron más lentas que la única muestra base grande. Falta repetir la comparación en equipos físicos para caracterizar esas diferencias antes de fijar objetivos de latencia.

## CONC-002

Dos pestañas reprodujeron el conflicto con un formulario abierto, preservaron el borrador y comprobaron la recuperación tras recargar. También se intercalaron cambios antes y después de escribir. La comprobación al volver visible reduce el tiempo en que una vista obsoleta parece editable. Se mantiene la comparación anterior y posterior a `setItem`.

Web Locks permite serializar secciones críticas entre quienes solicitan cooperativamente el mismo bloqueo. Integrarlo exigiría coordinar la escritura asíncrona en formularios y restauraciones. Un cliente v17 no participaría en ese protocolo, incluso si el navegador soporta la API. No se introdujeron claves de bloqueo, marcas de versión, bloqueos de cliente ni cambios del modelo. Sigue existiendo la carrera entre leer y escribir. La propuesta para MACRO-004 debe incluir el tratamiento de clientes antiguos, revisión de compatibilidad y recuperación si una pestaña desaparece. [Web Locks API del W3C](https://www.w3.org/TR/web-locks/).

## ACC-005 y SEC-001

Se revisaron Inicio, Medicinas, fichas, enfermería, calendario, citas, Pagos, historiales, respaldos y diálogos. Las pruebas de Edge cubrieron nombres y grupos en el árbol de accesibilidad, foco visible, teclado, estados expandidos, contraste en historiales, áreas táctiles y preferencias de movimiento y transparencia reducidos. El atajo de zoom no cambió el zoom efectivo en Edge headless. Se simularon ventanas de 640 y 320 CSS px, además del reflujo existente en siete anchuras. Quedan pendientes el zoom real a 200 % y 400 % y el lector de pantalla. El árbol de accesibilidad de Chromium no evalúa la experiencia con lector. [WCAG 2.2 · Reflujo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) · [WCAG 2.2 · Tamaño del objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Se revisaron las plantillas con `innerHTML`, la validación de respaldos, los recursos locales y las salidas de integración. El texto ficticio con etiquetas inofensivas se mostró como texto en nombres, notas, compras, personal y recibos. La vista previa de Calendar y WhatsApp permite cancelar o editar. La salida se interceptó en pruebas y no se enviaron datos a servicios externos. Los datos y respaldos locales requieren custodia privada. La revisión se limita a los casos y rutas descritos.

## PWA-007 y regresión final

La candidata sube a caché v18. La estrategia de precarga, la espera de activación y el manifiesto conservan el diseño anterior. La suite comprueba la señal de instalabilidad de Chromium y los recursos, iconos, fuentes y rutas de apertura offline. Instalar desde la interfaz en un dispositivo físico sigue pendiente.

- `node --test tests/payments.spec.js tests/persistence.spec.js` pasó **101/101**, con nueve pruebas nuevas. La regresión preliminar también pasó **101/101** antes de convertir los enlaces de Calendar en botones. La comprobación final mantuvo la cobertura de edición y cancelación de Calendar y añadió la comprobación de ausencia de enlaces externos directos.
- La actualización exacta **v17 → v18** desde `6ea578c` pasó **1/1**. Comprobó la espera con un borrador abierto, activación tras cerrar el cliente anterior, conservación de `pastillas-v1`, operación y recarga offline, reconexión y exportación. El primer intento falló antes de inicializar la app porque el servidor de prueba comparaba una ruta con barras diagonales contra una ruta de Windows. Pasó con la ruta nativa y volvió a pasar tras normalizar la ruta alternativa en el arnés.
- Pasaron la comprobación de sintaxis, la lectura de `manifest.json` y `git diff --check`.

## Checklist del propietario

1. En un dispositivo móvil y una computadora, usar solo datos ficticios en la Preview de la candidata cuando se autorice su publicación. Completar alta de ficha, medicamento con dos pautas, compra, enfermería con ambas tarifas, cita y abono.
2. Exportar un respaldo, cancelar una restauración y luego confirmarla. Abrir y recargar la PWA offline. Actualizar con un borrador abierto y comprobar el archivo exportado tras reconectar.
3. Usar teclado, zoom 200 % y 400 % y un lector de pantalla para recorrer calendario, edición de pautas, estado de cuenta y restauración.
4. Abrir dos pestañas, guardar en una y comprobar que la otra conserva el borrador y pide recargar. Revisar tiempos y cuota con el conjunto de escala en el móvil.
5. Confirmar o rechazar los riesgos residuales según los [criterios de lanzamiento](RC-1.0-criterios-lanzamiento.md).
