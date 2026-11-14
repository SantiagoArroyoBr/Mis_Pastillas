# MACRO-002 · Estabilidad, integridad y recuperación

## PREVIEW-M001

El checkout inicial estaba en `development` con HEAD `6896774545a4deab9526c78f0353cbcb032dd65e`. Tras `git fetch origin`, la rama local estaba seis commits por delante y cero por detrás de `f1511111772e275807aab13e7459fdce177f163c`. El índice de Git estaba vacío. La revisión del diff y del informe de las 86 pruebas aprobadas correspondió al paquete autorizado. El push por SHA avanzó exclusivamente `origin/development`.

| Paquete | Commits enviados en orden |
| --- | --- |
| PLAN-012 | `fc5839c748a8759eebd852ea232dea12caaa9e6a`, `9c051562b8c28c4958b86c46c324878e55808edd`, `7154612353a0c3bbc20192c6fb4281269ca480fc` |
| MACRO-001 | `265c9ed449ef2595f7f5de8611942f1bbc883320`, `5d4138f887fd791514a00b1d50ff8b4b7e0a06fc`, `6896774545a4deab9526c78f0353cbcb032dd65e` |

Git confirmó `development` en `6896774545a4deab9526c78f0353cbcb032dd65e` y `main` en `92c4034085e13bb38fd0a7ff2622c46ef797873d` después de publicar. El estado combinado de GitHub devolvió Vercel `success`. El conector de GitHub Actions devolvió cero ejecuciones de pull request para ese SHA. La URL de rama no fue accesible con el navegador sin sesión. La revisión funcional de la Preview queda pendiente. [Preview de development](https://pastillas-1-git-development-dinamita20.vercel.app/) · [Despliegue de Vercel](https://vercel.com/dinamita20/pastillas-1/HRLP76Ga8e7hor5TYSoYGjkQabcJ).

Los dos documentos con cambios de COB-001 y UX-004 y los dos sin seguimiento de PLAN-005 y QA-008 quedaron fuera del paquete y de MACRO-002. Se encontró un solo worktree. Los cambios de MACRO-002 son locales y requieren aprobación.

## Matriz de riesgos

Las probabilidades son estimaciones cualitativas para orientar las pruebas.

| ID | Riesgo, causa y datos afectados | Probabilidad e impacto | Reproducción y corrección | Prueba |
| --- | --- | --- | --- | --- |
| BACKUP-01 | La recuperación omitía leer el valor previo cuando la carga inicial fallaba. Podía sustituir una instalación completa a ciegas. | Baja, P0 | Bloquear la lectura y permitir la escritura. Exigir una lectura para revisar el respaldo y compararla otra vez al confirmar. | Fallo de lectura persistente, recuperación del permiso y cambio externo durante la confirmación. |
| STORE-01 | Una excepción al guardar bloqueaba la instalación. El respaldo disponible podía quedar inaccesible para descarga. | Media, P1 | Inyectar cuota, denegación o excepción genérica. Conservar estado, formulario y confirmación. Permitir reintentar y descargar el valor persistido si se puede leer. | Errores inyectados, reintento de alta y restauración, descarga de valor corrupto. |
| CONC-01 | Un segundo cliente puede escribir entre la lectura y la escritura de `localStorage`. Se afecta el estado completo. | Baja, P1 | Intercalar una escritura al serializar o tras guardar. Comparar después de serializar y verificar inmediatamente el valor escrito. Leer el valor vigente al procesar eventos `storage`. | Dos pestañas, edición con conflicto, recarga, escritura posterior y puntos intercalados instrumentados. |
| CONC-02 | Se puede perder la confirmación por un fallo de lectura después de completar `setItem`. | Baja, P1 | Inyectar fallo justo después de guardar. Declarar el resultado incierto, bloquear el reintento directo y permitir exportar o recargar. | Verificar que se escribió una vez y se preserva el texto realmente guardado. |
| LEGACY-01 | La normalización descartaba definiciones históricas de turno y recortaba textos. Afectaba compatibilidad de respaldos. | Baja, P1 | Cargar turnos con importe y metadatos, citas largas y tiendas históricas. Conservar los valores originales y bloquear conversiones de pagos antiguos con significado ambiguo. | Carga, restauración, escritura de otra propiedad, exportación y recarga. |
| BACKUP-02 | Dos lecturas de archivo podían completar en orden inverso y mostrar una copia anterior. | Baja, P1 | Seleccionar dos archivos con distinta latencia. Aceptar el resultado de la selección más reciente. | Completar dos lecturas en orden inverso y confirmar la segunda selección. |
| PWA-01 | Un cambio de caché incompleto o agresivo puede afectar acceso al formulario en curso. | Baja, P1 | Actualizar con un cliente de v16 y un borrador abiertos. Subir el identificador a v17 y conservar la espera y precarga existentes. | Actualización real, cierre del cliente, escritura y recarga offline, reconexión y exportación. |
| BACKUP-03 | Un historial grande puede superar la cuota del navegador o 10 MiB de importación. | Variable, P2 | Usar un archivo grande y simular cuota agotada. Exportar JSON compacto y mantener el límite de importación. | Rechazo de archivo excesivo y restauración con cuota insuficiente. |

## Implementación y límites

- `app.js` concentra escrituras normales y restauraciones en la misma verificación. Distingue cuota, acceso denegado, conflicto, escritura rechazada y resultado sin verificar. El botón de comprobación de acceso solo relee datos y solo se habilita si el estado cargado era utilizable. El reintento explícito desde un formulario vuelve a comparar con el valor esperado.
- La copia de recuperación descarga el valor persistido exacto si está disponible. Usa extensión JSON para contenido JSON y TXT para texto corrupto. Los archivos corruptos quedan disponibles para diagnóstico y requieren reparación antes de restaurarse como JSON. La exportación normal mantiene el formato y usa serialización compacta. La restauración conserva la doble confirmación y compara contra la lectura de la revisión incluso si la carga inicial no pudo leer.
- `compatibility.js` conserva definiciones antiguas de turno, campos globales de prepago presentes y textos legados de citas y compras. `appointments.js` conserva el texto previo si se edita otro campo. Los libros de pagos y abonos, las fechas históricas imposibles, las tarifas guardadas, los índices y los IDs mantienen su significado. Una copia antigua con metadatos de pago por ficha que no tienen una representación inequívoca queda disponible para revisión manual.
- Se evaluó una revisión persistida, Web Locks y el control por comparación del valor completo. Una revisión adicional requeriría acordar cómo guardarla. Web Locks serializaría clientes que adoptaran el mismo protocolo, pero requeriría adaptar a escrituras asíncronas los formularios y no abarcaría clientes antiguos ni navegadores sin soporte. La mitigación de este ciclo acorta y comprueba la ventana con el modelo actual. Sigue existiendo una carrera si dos clientes leen el mismo valor inmediatamente antes de escribir. Tampoco se detecta una secuencia externa que restaure exactamente el texto inicial. Ante conflicto, conservar el borrador en pantalla hasta que el usuario decida cancelar o recargar. Evitar la edición simultánea de una misma instalación.
- `sw.js` incrementa a v17 con la política de espera existente. `manifest.json` conserva la identidad de Acompaña. `pastillas-v1` y el formato de respaldo se mantienen. Los casos sintéticos de `tests/persistence.spec.js` cubren fallos de lectura y escritura, concurrencia, legados y actualización de caché.

## QA-M002

Se usaron Node.js 24.20.0 y un perfil temporal de Edge 157.0.4341.46, con datos exclusivamente ficticios. La suite incluye controles de consola y regresión financiera, de medicamentos y de enfermería.

- La primera tanda pasó **90/90**. La ejecución final de `node --test tests/payments.spec.js tests/persistence.spec.js` pasó **92/92** con seis casos adicionales frente a MACRO-001 y regresiones ampliadas de concurrencia, lectura bloqueada y exportación tras actualizar.
- La actualización **v16 → v17** desde una copia exacta del SHA publicado `6896774` pasó **1/1**. La versión anterior mantuvo el borrador mientras el nuevo worker esperaba. Después del cierre del cliente anterior se comprobó activación, conservación de los datos, escritura y recarga offline, reconexión y exportación equivalente a lo guardado.
- Pasaron `node --check` en scripts y pruebas, lectura de `manifest.json` como JSON y `git diff --check`. Los casos de cuota y acceso denegado se inyectaron en el navegador aislado. La cuota efectiva y la apariencia de los avisos en dispositivos físicos siguen pendientes de validación manual.

## Checklist del propietario

- [ ] Crear y guardar una ficha ficticia. Recargar y verificar sus datos.
- [ ] Simular cuota o permiso denegado en un perfil de prueba. Comprobar borrador, mensaje, descarga y reintento.
- [ ] Abrir dos pestañas. Dejar un formulario abierto en una, guardar desde la otra y verificar que el intento posterior detecta el conflicto. Cancelar antes de recargar.
- [ ] Exportar el JSON y comparar recuentos de fichas, turnos, compras y movimientos. Cancelar primero una restauración y luego confirmar la misma copia ficticia.
- [ ] Abrir una ficha archivada y un enfermero inactivo con historial. Comprobar fechas antiguas, IDs, tarifas guardadas y turnos futuros.
- [ ] Revisar inventario compartido, pautas independientes, reposición, compras e historial de precios.
- [ ] Revisar jornadas de hoy y futuras, prepago, saldo a favor, abonos cancelados y recibos legados.
- [ ] Actualizar desde v16 con un borrador visible. Cerrar los clientes anteriores, abrir la nueva versión offline, guardar y recargar. Reconectar y exportar.

## Preparación para MACRO-003

Probar el recorrido completo en dispositivos físicos y en la Preview autenticada. Medir cuotas y tiempos con respaldos grandes y realizar una recuperación guiada con datos ficticios. Definir con el propietario los casos legados ambiguos y cómo validar la coexistencia de clientes antiguos antes de adoptar un protocolo cooperativo de escritura.
