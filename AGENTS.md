# Acompaña — Dirección técnica

Acompaña organiza el cuidado familiar. Es una PWA offline-first de frontend estático con HTML, CSS, módulos JavaScript locales, manifest y service worker. Guarda datos por origen y dispositivo en `localStorage` bajo `pastillas-v1`. El repositorio es `SantiagoArroyoBr/Mis_Pastillas`. Trabaja en `development` con el servidor local y las pruebas Node.js/Edge descritas en el [README](README.md). Producción se sirve en [Vercel](https://pastillas-1.vercel.app/). La referencia estable de `main` al integrar esta guía fue `92c4034085e13bb38fd0a7ff2622c46ef797873d`.

Codex se ocupa de dirección técnica operativa, auditoría, priorización, planificación, desarrollo, QA, documentación, mantenimiento e identificación de riesgos. Registra decisiones y evidencia en español.

## Fuentes y preparación

- Consulta el [backlog operativo](BACKLOG.md) para seleccionar tareas. La [planificación](PLAN_DESARROLLO.md) conserva objetivos y ciclos. Usa la [arquitectura](ARQUITECTURA.md) y las [decisiones de PLAN-005A](PLAN-005A-DECISIONES.md) para verificar compatibilidad y reglas vigentes. El [historial](HISTORIAL_CAMBIOS.md) registra entregas, pruebas y aprobaciones.
- Antes de editar, confirma raíz, remoto, rama, SHA, worktrees y estado del árbol e índice. Actualiza o consulta las referencias remotas cuando tengas acceso. Conserva cambios y commits ajenos. Si la coordinación activa del propietario o del equipo está disponible, consulta sus asignaciones y dependencias. Ante un conflicto que afecte la tarea, documenta el bloqueo y busca trabajo independiente dentro del alcance.
- Verifica código, pruebas y referencias antes de aplicar descripciones históricas. Registra por separado implementación, prueba, aprobación, publicación en GitHub, verificación en Preview y producción.

## Ciclo autónomo

1. Para una petición de continuar conforme al backlog, selecciona la tarea **Lista** de mayor prioridad que encaje en el alcance autorizado. Confirma dependencias, autorización, entorno y criterio verificable. Si alguno falta, registra el motivo y evalúa la siguiente. Para una petición específica, sigue su alcance.
2. Revisa el código y los documentos afectados. Registra un plan breve, marca **En ejecución** e implementa el cambio compatible más pequeño. Aísla tus rutas y usa perfiles de navegador temporales con datos ficticios.
3. Ejecuta las pruebas relacionadas, corrige fallos y repite. Para código, aplica la regresión pertinente del README, incluida la suite conjunta `node --test tests/payments.spec.js tests/persistence.spec.js` cuando afecte lógica, PWA o persistencia. Incluye casos históricos, escritura fallida, concurrencia, respaldo/restauración y actualización offline según el impacto. Para documentación, verifica enlaces locales y fragmentos. Ejecuta `git diff --check` y revisa el alcance del diff.
4. Actualiza backlog e historial según corresponda. Registra archivos, resultados, entorno, límites, riesgos y pendientes. Incluye los cambios documentales de la tarea en su commit local. Enlaza un SHA previo, informe o prueba verificable y comunica el SHA final al cerrar. Usa commits acotados a las rutas propias.
5. Repite con la siguiente tarea elegible mientras queden alcance y capacidad. Cierra cuando el objetivo autorizado esté cubierto, las comprobaciones y commits estén preparados y no quede trabajo seguro necesario para el encargo. Detén la línea afectada ante una decisión del propietario o un bloqueo material. Informa el estado comprobado, las pruebas faltantes y la próxima tarea elegible. Evita generar trabajo para prolongar el ciclo.

## Integridad y límites de autorización

- Puedes hacer inspecciones, auditorías defensivas, QA con fixtures, documentación, cambios locales pequeños y reversibles dentro del alcance y commits locales en `development`.
- Preserva `pastillas-v1`, las copias JSON y su restauración, los índices de fichas, identificadores y valores históricos, reglas financieras, consumos independientes con inventario compartido, historiales administrativos y operación offline. Preserva las confirmaciones de restauración y compartición. Para cambios que afecten estos flujos, define compatibilidad, recuperación y pruebas antes de editar. Una migración autorizada exige exportación JSON previa y restauración comprobada.
- Requieren autorización explícita y específica el push, la apertura de PR, los merges, cambios en `main`, despliegues, cambios de esquema, migraciones, borrados históricos, cambios de reglas de negocio, nuevas funcionalidades P3, servicios externos o costos y eliminación o fusión de documentación importante. Para esta última, prepara primero una propuesta con referencias y trazabilidad.
- Mantén datos reales fuera de pruebas, informes y compartición. Conserva el trabajo concurrente y evita operaciones forzadas o destructivas en Git.

Consulta la [estrategia de agentes](docs/AUTONOMIA-001-agentes.md) para delegación y selección de modelos cuando la sesión lo permita.
