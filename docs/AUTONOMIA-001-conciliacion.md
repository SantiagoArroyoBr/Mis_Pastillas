# AUTONOMÍA-001 — Conciliación de entregas

El 15 de noviembre de 2026, `git fetch origin` confirmó `origin/development` en `6ea578c1dad72f1fb2a43f00cf870819d4dfa6c4`. El único worktree registrado por el repositorio principal estaba en `development`, con HEAD inicial `6b0d84c046e82c05eb0a7910d296b50811d88817`, cuatro commits por delante y cero por detrás. `main` y `origin/main` apuntaban a `92c4034085e13bb38fd0a7ff2622c46ef797873d`. El [historial](../HISTORIAL_CAMBIOS.md) conserva la secuencia completa.

| Entrega | Implementación y pruebas registradas | Aprobación y publicación | Evidencia pendiente |
| --- | --- | --- | --- |
| [PLAN-010](PLAN-010-turnos-pagos-abonos.md) | `fc2ff6f` a `c12be38`. Jornadas, tarifas y saldo. 73/73. | Diseño aprobado. Incluida en el tramo autorizado de PREVIEW-011 publicado hasta `f151111`. | Revisión visual, asistiva y en dispositivos. |
| [PLAN-011](PLAN-011-validacion-estabilidad-financiera.md) | `2495983` a `6f82eff`. Estabilidad financiera. 76/76 y actualización v12 → v13. | Incluida en PREVIEW-011 junto a PLAN-010. El informe original precede la publicación. | Validación funcional autenticada y conciliación histórica cuando exista un caso acreditado. |
| [FIX-FECHA-002](FIX-FECHA-002-integridad-recibos.md) | `d1f899a` a `f151111`. Preservación de recibos históricos. 78/78 y actualización v13 → v14. | PREVIEW-011 publicó el tramo autorizado hasta `f151111` con Vercel success registrado. | Revisión funcional autenticada de recibos y respaldos. |
| [PLAN-012](PLAN-012-consolidacion-funcional.md) | `fc5839c` a `7154612`. Consolidación de flujos. 82/82 y actualización v14 → v15. | Publicada en PREVIEW-M001 en el tramo autorizado hasta `6896774`. | Zoom real, lector de pantalla, dispositivos y Preview funcional. |
| [MACRO-001](MACRO-001-finalizacion-funcional-visual.md) | `265c9ed` a `6896774`. Cierre funcional y visual. 86/86 y actualización v15 → v16. | PREVIEW-M001 publicada hasta `6896774`, con Vercel success registrado. | Validación manual, asistiva y de Preview. |
| [MACRO-002](MACRO-002-estabilidad-integridad-recuperacion.md) | `09fb695`, `c5eb18e`, `f208ef6`, `6ea578c`. Persistencia y recuperación. 92/92 y actualización v16 → v17. | PREVIEW-M002 publicada en el tramo autorizado hasta `6ea578c`, con Vercel success registrado en el [informe posterior](MACRO-003-validacion-integral.md). | Preview autenticada, cuota y recuperación física, metadatos legados y coexistencia de versiones. |
| [MACRO-003](MACRO-003-validacion-integral.md) | `d31b289`, `c75e336`, `d59b4f9`, `6b0d84c`. Inventario, formularios, Calendar y candidata. 101/101 y actualización v17 → v18. | Local, en revisión. RC 1.0 permanece en B, candidata condicionada. | Publicación autorizada de la candidata, recorrido manual, instalación física, zoom y lector de pantalla. [Criterios](RC-1.0-criterios-lanzamiento.md). |
| MACRO-004 | Existe una propuesta de inicio según el encargo. La revisión de referencias Git y documentos disponibles no acreditó una implementación ni pruebas. | Pendiente de alcance y evidencia posterior a MACRO-003. | Registrar autorización y criterios cuando se defina el siguiente ciclo. |

Los SHA de las seis primeras entregas son ancestros de `origin/development`. Los resultados de QA corresponden a los informes históricos. En AUTONOMÍA-001 se verificaron referencias Git y documentación. El estado exitoso de un check de Vercel y la autorización del push acreditan hitos distintos de la revisión funcional y la aprobación de lanzamiento.

El `AGENTS.md` y el `BACKLOG.md` de la copia externa `acompaña-coordinacion` se recuperaron por lectura directa. Se integraron sus reglas y tareas aplicables sobre el HEAD principal, incluida la conciliación de COORD-001. Git en esa copia secundaria devolvió permiso denegado con `git -C`. La lectura directa de `.git/HEAD` y de la referencia de `development` confirmó que apuntaba a `6ea578c`. Los cuatro documentos con trabajo concurrente quedaron fuera del alcance.

## Validación del inicio autónomo

`codex debug prompt-input` confirmó que la instrucción de raíz y su referencia al backlog entran al contexto de un arranque nuevo. Una sesión efímera con sandbox de solo lectura recibió la guía. El lanzador de Windows rechazó la ejecución de sus comandos locales. La selección se comprobó por separado en el checkout principal, sin ejecutar tareas.

Sobre `development` en `6b0d84c`, la simulación local identificó `QA-RC-LOCAL-001` como la única tarea lista. El plan fue verificar la entrega en un perfil de escritorio aislado, recorrer los flujos familiares con datos ficticios, restaurar un respaldo, probar recarga offline y registrar SHA, entorno, casos, resultados y pendientes. Se detectaron seis tareas bloqueadas, entre ellas `PUB-M003` por autorización de publicación y `QA-PREVIEW-001` por acceso y SHA. MACRO-004 permaneció en **Pendiente**.

Se comprobaron 278 enlaces locales, incluidos los fragmentos de Markdown, y se corrigieron siete destinos preexistentes. La validación de este ciclo se limitó a Git, documentos y protocolo de coordinación.
