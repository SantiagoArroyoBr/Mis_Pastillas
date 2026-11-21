# INTEGRA-001 · Históricos integrados, turnos y hojas impresas

21/11/2026. Base `4362e3d6cbc49e055bcc5a58f4b8b803437ecb05`. El propietario aprueba construir las sugerencias debatidas: repartir los históricos en sus apartados, integrar personal sin inventar tarifas, revisar pendientes, registrar quién llenó las hojas impresas y sus fechas, programar turnos con término y confirmar su cierre, consultar historial por ficha y facilitar respaldos.

## Plan y límites

1. SQL19: vínculo durable de personal importado con ficha/origen, tarifas con revisión y vigencia para jornadas nuevas. No fusionar nombres automáticamente ni recalcular jornadas antiguas.
2. SQL20: programación de turnos separada del libro monetario, control y correcciones de bitácoras impresas, cierre manual. Reutilizar pendientes existentes. Respaldos v4 compatibles con formatos anteriores, remapeo de relaciones y tickets conservados.
3. Interfaz: datos anteriores en Enfermería/Pagos, revisión y original en Respaldo; formularios de hojas y turnos, historial por ficha, calendario y resumen con horarios, constancia de descarga solicitada por dispositivo.
4. QA con datos ficticios: aislamiento, concurrencia, reintentos, recuperación, históricos, horarios nocturnos, privacidad, móvil y offline. Documentar límites y preparar commits locales.

Los horarios concretos aún no se proporcionaron: se capturan inicio, término y zona horaria explícitos, incluido cambio de fecha. La zona inicial se propone desde el dispositivo y se muestra para confirmarla; cada turno conserva la suya. Llegar la hora no acredita atención ni completa la hoja y no genera cobros. Las hojas siguen llenándose en papel; la app registra su control administrativo. Sin firmas digitales ni carga obligatoria de documentos clínicos.

No se utiliza el archivo familiar real en las pruebas del producto ni se incorporan datos privados a Git. Cuatro propuestas ajenas preservadas. La habilitación remota requiere copia privada/restauración y autorización específica una vez preparado el lote. No modificar main.

## Comportamiento entregado

- El personal de nuevas conversiones se integra en nurses por SHA e índices originales, con ficha remapeable y tarifas pendientes. Para fuentes ya importadas hay selección explícita de ficha e integración por fila idempotente. Dos nombres iguales conservan identidades distintas.
- Enfermería/Pagos contiene personal anterior por revisar, asignaciones históricas y prepagos de cobertura, con paginación independiente y montos privados. Respaldo conserva selección de fuente, copia literal y revisión con enlaces. Los importes ausentes dicen «No registrado» y las modalidades desconocidas no se inventan.
- El propietario configura tarifas con revisión y fecha válida para nuevas jornadas. Los costos ya registrados permanecen congelados. Una tarifa nula se distingue de cero; una jornada anterior a la vigencia o sin tarifa para su modalidad se rechaza.
- Turnos de cuidado usa inicio/fin civiles con zona IANA. Calendario y Hoy muestran horarios/cierres pendientes; el estado local se actualiza cada minuto sin escribir ni pedir continuamente datos al servidor. En otra zona del teléfono se compara el mismo instante con la zona del cuidado.
- Cerrar un turno es una acción manual con ticket durable y crea un control de hoja pendiente/completada. La persona que llenó la hoja puede ser distinta del personal del turno. Auth registra quién lo capturó. También se pueden registrar hojas sin turno programado y corregir su control con revisión y auditoría.
- El traspaso entre turnos reutiliza los pendientes ya existentes; no crea una segunda lista ni copia tareas automáticamente.
- Fichas ofrece historial de citas, notas, pendientes, turnos y hojas, con filtros por ficha/tipo/fechas y carga adicional. Los históricos no equivalentes siguen en sus apartados. Se respetan fichas archivadas y no se muestran tarifas a cuidadores.
- La familia activa se identifica en la cabecera y se recuerda dentro de esa pestaña, aislada por API/cuenta y validada contra las membresías disponibles al recargar. Salir elimina esa preferencia. El ensayo de una familia antigua detectó que una recarga elegía la primera alfabética; se corrige para evitar un cambio de contexto inadvertido.
- Respaldo muestra la última descarga solicitada desde ese dispositivo para esa API/cuenta/familia. No afirma que el archivo siga guardado ni que exista un respaldo automático.

## Integridad y recuperación

SQL19/20 son incrementales sobre18 y deben aplicarse conjuntamente en una transacción antes de publicar el frontend. El respaldo v4 conserva las tres tablas nuevas y la procedencia del personal, remapea relaciones y mantiene formatos1/2/3 y tickets ya confirmados. La tabla privada shift_care_requests debe incluirse en la copia operativa previa a cualquier aplicación remota.

La revisión defensiva reprodujo y corrigió una referencia opcional desconocida que se convertía silenciosamente en null; ahora revierte la restauración. También se rechazan respaldos con turno cerrado sin hoja, hoja ligada a turno abierto o fecha distinta del inicio. Zonas desconocidas y horas inexistentes por adelanto horario fallan también al restaurar. No se reescriben las migraciones1–18 ya aplicadas.

La consulta offline no intenta ejecutar el RPC de catálogo del personal. Permite leer datos previamente guardados de la cuenta válida; nombres no disponibles se identifican por referencia corta. No guarda el JSON original privilegiado en la caché ni habilita escrituras sin conexión.

## Evidencia de cierre

Entorno: Node22+, PostgreSQL PGlite desechable, Edge con perfiles temporales y datos ficticios. Ningún respaldo familiar real utilizado en esta batería.

- `npm test --prefix backend`: **147/147**, sin omisiones. Permisos propietario/cuidador/temporal, revocación, archivos, reintentos, revisión, homónimos, tarifas nulas/cero, vigencia, horarios nocturnos, dos zonas, DST y recuperación completa.
- `node --test tests/payments.spec.js tests/persistence.spec.js`: **102/102**. Persistencia original, fallos de escritura, concurrencia, finanzas, respaldo y actualización offline conservados.
- `npm run test:ui --prefix backend`: **2/2** recorridos. Main original exporta/restaura su fixture; candidata recorre importar, tarifas, turno nocturno, cierre, corrección de hoja, historial por ficha, familia ya importada, separación de históricos, móvil320/390/768/1280, texto200%, offline y actualización desde login.
- `node backend/build-preview.mjs`: **40 archivos públicos**. SQL, pruebas y materiales privados excluidos.
- `git diff --check`: aprobado. Cuatro propuestas ajenas fuera del lote.

Captura móvil ficticia: `backend/supabase/.temp/integra-turnos-preview.jpg`, ignorada por Git. Auth/correo simulados; no se afirma verificación de PostgREST remoto, VoiceOver/TalkBack físico ni ejecución en Vercel del lote nuevo.

## Límites y siguiente paso

La configuración conserva una tarifa disponible por modalidad y fecha inicial; no es un planificador de múltiples tarifas futuras. La interfaz propone fechas hasta hoy y explica este límite. Los registros financieros anteriores mantienen su costo. Las asignaciones antiguas sin modalidad siguen en consulta, sin convertirse en cobros.

Los turnos nuevos se programan y cierran, sin repetición recurrente ni edición/cancelación de programación en este lote. Una corrección de hoja no cambia ficha/fecha/turno; conserva el registro anterior y su autor. El historial por ficha es una vista de consulta paginada, no un expediente clínico ni un reemplazo del papel.

Pendiente autorización específica para exportar/restaurar una copia privada reciente del proyecto, aplicar19/20 conjuntamente y publicar development; después verificar Preview real. Mantener main y la instalación familiar original hasta la revisión del propietario. No se transmite el respaldo de su mamá para este trabajo.
