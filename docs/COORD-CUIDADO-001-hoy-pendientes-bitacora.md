# COORD-CUIDADO-001 · Pulido y coordinación del cuidado

19/11/2026. Base `cf90dee660f6c2f604f28c360d44c5267bf049e8`, development. Orden: terminar el pulido existente, probar e integrar progresivamente **Hoy, pendientes con responsable y bitácora**. No incluye todas las ideas futuras de documentos, avisos o entrega de turno. Las cuatro propuestas ajenas se conservan.

## Pulido previo

Migración15: `add_nurse_once`, ticket duradero y payload comprobado. Reintentar una solicitud devuelve el mismo registro; un alta intencional igual con otro ticket sigue permitida. Los RPC anteriores se conservan.

Catálogos de familias, membresías, fichas, enfermería, inventario, accesos y calendario: páginas acotadas con `readCatalog`, avance por filas recibidas y detección de repeticiones. Si supera20000 registros, informa error en vez de devolver un catálogo truncado como completo. Pruebas con451 registros y tope de servidor73, claves compuestas y desbordamiento explícito. Orden estable; no equivale a una instantánea entre peticiones concurrentes.

## Funciones integradas

| Función | Comportamiento |
| --- | --- |
| Hoy | Citas y turnos del día, reposiciones/agotamientos estimados y pendientes con fecha de hoy o vencida. Hasta8 asuntos, enlace a los apartados y aviso cuando hay más. Turnos según permisos previos; tareas sin fecha no se presentan como vencidas. |
| Pendientes | Título, detalles, ficha/fecha/responsable opcionales. Filtros por hacer/completados/todos e historial ampliable. Completar/reabrir comprueba revisión concurrente. |
| Bitácora | Notas por ficha con fecha y autor, historial ampliable y contenido tratado como texto. Este primer lote no borra ni edita notas históricas. |
| Equipo | Nombres temporales y etiquetas de rol mediante `list_care_members`, sólo miembros vigentes. Sin correos/códigos/administración. Asignar no concede permisos; se valida vigencia del responsable. |
| Respaldo | Formato conectado v2 con tareas/notas; acepta v1. Restaura en otra familia, remapea referencias, atribuye autorías operativas al recuperador y deja responsables sin asignar. No reactiva cuentas ni permisos. |

Si una ficha se archiva o un responsable se revoca durante una actualización, se conserva el destino y texto del borrador con advertencia. El envío exige elegir explícitamente una opción disponible. Fichas archivadas mantienen consulta; rechazan nuevas notas/tareas y cambios de sus tareas.

## Pruebas progresivas

- **109/109** conectadas: suites previas, catálogos, enfermería, Hoy, SQL de coordinación y controladorUI. Aislamiento, escrituras directas denegadas, temporales vencidos, revocación, replay, conflicto, archivo y recuperación v1/v2.
- **102/102** PWA: pagos, históricos, escritura fallida, concurrencia, JSON y offline. Raíz y `pastillas-v1` intactos.
- **1/1** recorrido integrado ampliado: dos cuentas, crear/asignar/completar tarea, dos notas, HTML tratado como texto, Hoy, copia restaurada con notas/tarea completada sin responsable importado; ocho apartados a320/390/768/1280 y texto200%; sesión, conflicto, offline y actualización SW.
- Build de **34 archivos públicos** mediante lista cerrada, módulos nuevos en servidores/SW. Sin SQL, respaldos, pruebas ni generador de iconos.
- Primer ensayo detectó respuesta tabular del RPC de miembros representada como escalar en el simulador. Corregida y repetido el recorrido completo aprobado.

## Migración remota respaldada

Autorización específica del propietario: «Sí, aplicar y probar en development» para migraciones15/16 tras copia privada y restauración comprobada.

Exportación privada de **23 tablas y19 filas**, más referencias mínimas Auth, en ruta ignorada. Restauración en PostgreSQL desechable, aplicación de16 migraciones y conteos preservados: `restored=true`, `existingRowsPreserved=true`. Sin contraseñas ni tokens exportados.

SQL completo comparado con la fuente y ejecutado en una transacción. Supabase confirmó `nurse_ready=true`, `tasks_ready=true`, `notes_ready=true`. Ensayo sobre PostgreSQL real con rol autenticado y datos ficticios: replay de enfermería, tarea/nota, finalización y recuperaciónv2; terminó con **ROLLBACK**, sin datos ficticios persistidos.

Consulta posterior: **original_counts_equal=true**, **new_rls_enabled=true**, **direct_access_denied=true**. Los23 conteos originales permanecen; las tres tablas nuevas tienen RLS y restricciones de acceso directo. Evidencia privada ignorada en `backend/supabase/.temp/`: pre-care-cloud-backup.json, pre-care-restore-result.json, care-incremental.sql, care-cloud-fixture.sql y care-cloud-integrity.jpg. No publicar sus contenidos.

## Límites

Offline sólo consulta opcional de lecturas previas con sesión vigente; temporales y escrituras necesitan internet. Los nombres del equipo se consultan online. No hay push, repetición automática de tareas, edición de notas, adjuntos ni entrega de turno. VoiceOver/TalkBack físico sigue pendiente; no se declara conformidad WCAG.

Main separado de development. Publicación y Preview se registran por separado al completar despliegue. La siguiente ampliación se decide tras probar este lote en uso real.

## Publicación comprobada

Código y pruebas publicados en `origin/development`: **`358fb573b2d87ec16d70273d10f42d82da0ab44b`**. [CI Calidad 44583330668](https://github.com/SantiagoArroyoBr/Mis_Pastillas/actions/runs/44583330668): **success** en todas las etapas, incluidos los recorridos de navegador en Linux/Chrome. Estados Vercel **success** para ambos proyectos.

La [Preview conectada](https://acompana-piloto-git-development-dinamita20.vercel.app/) contiene Hoy y el formulario de pendientes; `/today.mjs` y `/care-coordination.mjs` responden200. SQL016, respaldo privado y pruebaSQL responden404. Consultas anónimas reales a `care_tasks` y `care_notes`: **401**, sin lectura de datos. Esto complementa el ensayo real SQL con rollback; no se afirma un nuevo recorrido UI autenticado sobre datos reales.

33 enlaces locales verificados y diff correcto. El seguimiento documental final se conserva en commit local para revisión. Captura de la interfaz con datos exclusivamente ficticios: `backend/supabase/.temp/care-coordination-preview.jpg`. VoiceOver/TalkBack físico y main permanecen separados.
