# PLAN-008 — Estabilidad, accesibilidad y rendimiento

Fecha: 2026-11-06. Rama: `development`. Implementación y commits exclusivamente locales, posteriores a PREVIEW-007. Datos de prueba ficticios en perfil aislado de Microsoft Edge.

## Publicación previa: UX-009 y PREVIEW-007

Se verificó la base `cfed9449f8cd25655e7866d066b36e6b44d6ddeb`, el remoto `972a856909bbc6c73271009a9d7c50dcaa3e382f` y los diez commits pendientes de PLAN-007/007B. UX-009 cambió únicamente `styles.css` y `tests/persistence.spec.js`: cuadrícula acotada a las tarjetas de enfermería, acciones debajo en móvil, botones sin dividir palabras y espaciado uniforme. No cambió el orden de los datos ni los identificadores.

QA-013 pasó **63/63**. El caso añadido comprueba nombres y tarifas extensos, historial abierto, botones dentro de la tarjeta, texto en una línea, altura táctil mínima de 44 px y ausencia de desbordamiento a 320, 360, 390, 430, 768, 1024 y 1280 px. Comprueba Editar y conservación del almacenamiento; las pruebas existentes cubren Reactivar, referencias e historial.

Tras fetch sin divergencia se publicaron los once commits autorizados, sin force. UX-009 y el SHA publicado son `e79a95f98dabab7348deb17e7231c344da6322ef`. El SHA remoto fue confirmado. GitHub registró estado **Vercel: success** y check **Vercel Preview Comments: completed/success**. `main` local y remota permanecieron en `92c4034085e13bb38fd0a7ff2622c46ef797873d`.

- [Preview de development](https://pastillas-1-git-development-dinamita20.vercel.app/).
- [Deployment asociado al estado Vercel](https://vercel.com/dinamita20/pastillas-1/88xGnRvV1RaaVK1E7tatBqoPzrrH).
- [Commit publicado](https://github.com/SantiagoArroyoBr/Mis_Pastillas/commit/e79a95f98dabab7348deb17e7231c344da6322ef).

No se ejecutó validación funcional manual del deployment ni publicación a producción. PLAN-008 empezó después de concluir esta publicación.

## Diagnóstico y cambios

| Etapa | Problema confirmado y causa | Solución real |
| --- | --- | --- |
| EST-001 | El callback periódico llama a render y Pagos asignaba `innerHTML` siempre. Se perdían los nodos `details`, su apertura y el foco interior. | `updateHTML` conserva el DOM cuando el contenido coincide; si cambia, restaura apertura por `data-panel` y foco identificable. Incluye historial general, pagos anteriores por ficha e historial de enfermería. |
| ACC-002 | Al sustituir un formulario dentro del diálogo abierto, el control enfocado desaparecía sin enfocar el nuevo contenido. Los errores comunes se mostraban sin mover el foco. | Se enfoca el primer control de la nueva pantalla, el error común o el campo de fecha inválida. El formulario común obtiene nombre accesible mediante su título. |
| PERF-001 | Se reconstruían también Inicio, navegación y selector de fichas aunque la cadena generada no cambiara. | Un `WeakMap` por contenedor evita esa sustitución. Se conservan cálculos y actualización de datos; no se añaden dependencias ni temporizadores. |
| UX-010 | Las confirmaciones que reutilizan el diálogo tenían un inicio de navegación por teclado distinto al de una apertura nueva. | Se normaliza el foco en el generador común de formularios. No se encontraron razones verificadas para otro cambio visual general. |

La inspección de eventos encontró delegación en documento y manejadores de formularios asociados a los controles creados. No se encontró acumulación de listeners causada por el render periódico. No se añadió un sistema nuevo de eventos. La acción Reactivar sigue abriendo su confirmación después de actualizaciones repetidas.

Se revisaron foco visible, etiquetas de campos, estados `aria-pressed`, botones táctiles, contraste visual definido, paneles nativos y reglas de movimiento/transparencia reducidos. Se mantienen los estilos y pruebas existentes de GLASS-001 y PLAN-007B. La prueba denominada «contraste» verifica fondo y opacidad de inactivos; no calcula todas las relaciones de contraste. La suite emula preferencias reducidas y comprueba que desaparece el filtro Glass; no demuestra toda experiencia de movimiento reducido con tecnologías de apoyo. No se afirma conformidad WCAG 2.2 AA.

## Evidencia de rendimiento y estabilidad

La prueba nueva invoca veinte veces el callback real registrado por la aplicación para su intervalo de 60 segundos, con contenido de Pagos sin cambios. Observa el subárbol mediante `MutationObserver`: **cero mutaciones estructurales**, los mismos paneles conectados y abiertos y el mismo resumen enfocado. Antes, el código asignaba `innerHTML` en cada render de Pagos; esa comparación previa es por inspección del código, no un benchmark ejecutado sobre la versión anterior.

Después se modifica una tarifa solo en la memoria del fixture y se muestran importes: la nueva cifra aparece, los paneles siguen abiertos y el foco vuelve al resumen equivalente. Al cerrar un historial y volver a actualizar, sigue cerrado. El JSON almacenado no cambia por estas operaciones visuales. El cambio de tarifa pertenece únicamente a la prueba y no es una nueva regla del producto.

No se midieron milisegundos, consumo de memoria, batería, FPS ni tiempos en teléfonos. La generación de HTML y los cálculos siguen ejecutándose; la mejora comprobada es evitar reemplazos estructurales redundantes. Medicinas conserva su renderizador existente. No se modificaron efectos Glass por no contar con evidencia de un costo problemático en dispositivos reales.

## Archivos y validación QA-014

- `app.js`: actualización compartida y uso en Inicio, Pagos por inyección, navegación y selector de fichas.
- `care-ui.js`: claves de panel y uso del actualizador compartido.
- `forms.js`: nombre de formulario y gestión de foco.
- `tests/persistence.spec.js`: captura del callback periódico y dos casos de regresión de estabilidad/foco.
- `README.md`, `PLAN_DESARROLLO.md`, `HISTORIAL_CAMBIOS.md`, `ARQUITECTURA.md`, `docs/GUIA_INSTALACION_USO.md` y este informe: estado, responsabilidades, evidencia y límites.

Comando completo: `node --test tests/payments.spec.js tests/persistence.spec.js`.

Resultado final: **65/65**, 8 pruebas de motor y 57 de navegador. Incluye medicamentos, citas, enfermería, inventario, pagos, referencias, errores de persistencia, exportación/restauración JSON y PWA/offline. Los nuevos casos verifican paneles, actualización de datos, conservación de nodos/foco, acción después de renders repetidos, foco en confirmación reemplazada, nombre del formulario y rechazo de un nombre vacío sin escritura.

La regresión existente verifica Tab, foco visible, Escape/cancelación, estados y reflujo; QA-013 añade los siete anchos indicados. Se pasó comprobación de sintaxis en 12 scripts, parseo del manifest y `git diff --check`. `payments.js`, `domain.js` y `compatibility.js` no difieren de PREVIEW-007. No se modificaron cálculos, historiales, clave `pastillas-v1`, esquema, índices ni identificadores.

## Límites y revisión manual pendiente

La apertura solo vive en el DOM durante la sesión y se reinicia con recarga. Un enfermero legado sin ID usa su nombre como clave: renombrarlo puede reiniciar su historial. La restauración de foco depende de que siga existiendo un control equivalente identificable; no se garantiza para elementos eliminados o todas las vistas de Medicinas. La navegación entre secciones conserva sus paneles mientras los contenedores se mantienen en la página.

El reflujo se automatizó por anchura de viewport. El zoom real del navegador a 200 % y 400 %, el zoom de texto, lectores de pantalla y dispositivos físicos quedan pendientes. No hay medición comparativa de scroll ni rendimiento Glass en móvil. El arnés usa Edge; Firefox y Safari no se ejecutaron.

Checklist del propietario, con datos ficticios:

- En PREVIEW-007: comprobar Editar y Reactivar, textos largos y acciones de tarjetas en teléfono y escritorio; revisar retiro de fichas/enfermeros y turnos futuros.
- En PLAN-008 local: abrir varios historiales, esperar más de un minuto, cambiar de sección y mostrar/ocultar montos; confirmar apertura, datos vigentes y posición de lectura.
- Recorrer formularios con Tab y Shift+Tab, abrir retiro, cancelar con Escape y provocar un error; comprobar foco visible, anuncio del error y facilidad para corregirlo.
- Revisar zoom 200 %/400 %, lector de pantalla y preferencias de movimiento reducido en el equipo habitual.
- Exportar y restaurar un respaldo ficticio y navegar offline en un perfil de prueba; no compartir respaldos familiares.

## Commits y alcance Git

Commits locales: `0e5a952` — estado de paneles y sustitución condicional; `149f11d` — foco y formulario; `8bab21f` — regresión. El commit documental posterior completa el ciclo. Se omiten commits separados de rendimiento y estilo porque la mejora de rendimiento integra la misma solución de estabilidad y no se hizo otro cambio visual.

PLAN-008 no se publica. La referencia remota permanece en `e79a95f`; `main` permanece intacta. Se conservan fuera de los commits los dos documentos modificados `docs/COB-001-propuesta-cobertura.md` y `docs/UX-004-propuesta-gestion-fichas.md`, y los dos sin seguimiento `docs/PLAN-005-cobertura-gestion-fichas.md` y `docs/QA-008-casos-cobertura-fichas.md`.
