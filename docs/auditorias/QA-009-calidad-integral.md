# QA-009 · Auditoría integral de calidad de Acompaña

Fecha: 18/11/2026. Versión auditada: `b201c03a2ba4b465a27eed084bd77fde561cf77a`, rama `development`. Alcance: PWA histórica de la raíz y candidata conectada de `backend`, con especial atención al uso móvil y multifamiliar. Se conservaron cuatro documentos ajenos pendientes. No se cambiaron código de producto, esquema, configuración de nube ni datos reales.

## Seguimiento posterior

Este informe conserva el diagnóstico original. [QA-010](../QA-010-calidad-y-github.md) corrigió borradores, acuse de guardado, mensajes y documentación/CI. [QA-012](../QA-012-cierre-calidad-conectada.md), código `6560bea`, completa idempotencia de altas, recuperación familiar, historial ampliable, sesión renovable, consulta offline y recarga al recuperar foco/conexión con protección de borradores. El simulador y la automatización también se ampliaron. Persisten límites: offline sin escrituras ni comprobación de revocación, equivalencia de PostgREST no exhaustiva, instalación física y recorrido dedicado de accesibilidad pendientes. El dictamen histórico siguiente no describe por sí solo el código actualizado.

## Dictamen

La base tiene controles útiles y regresiones aprobadas. Es razonable continuar un piloto controlado. No recomiendo declarar terminada la transición a producción: quedan riesgos de reintento y borradores, recuperación de datos de nube y límites funcionales de historial, sesión y conectividad. Aprobar pruebas no equivale a cobertura total ni a un porcentaje de calidad.

No se confirmó una vulnerabilidad crítica de acceso en las comprobaciones realizadas. Esta auditoría no es una prueba de penetración, certificación WCAG ni revisión de todas las políticas y ajustes efectivos de los proveedores.

Prioridad: P1 antes de ampliar uso real o cerrar la transición; P2 siguiente ciclo de calidad; P3 mejora posterior. Se distingue defecto, limitación diseñada y deuda documental.

## Hallazgos priorizados

### QA-009-01 · P1 · Alta duplicable tras un resultado incierto — defecto

`backend/pilot.mjs:524` restablece el formulario solo al terminar todo el handler. El alta de ficha (`:567`) primero escribe y después ejecuta `refreshFamily`. Si la escritura tiene éxito pero la lectura posterior falla, no se limpia el formulario y se presenta un fallo. `public.add_patient` en `20261116000100_family_pilot.sql:205` no recibe una clave de idempotencia. Reintentar los mismos datos crea otra ficha con otro ID. Crear familia sigue el mismo patrón de escritura y recarga.

Evidencia: ensayo PostgreSQL en memoria con `createAccessSandbox`, una cuenta y una familia ficticias. Se enviaron dos `add_patient` idénticos: ambos 200, IDs distintos, dos registros. Resultado: `{"case":"alta_reintentada","accepted":2,"distinctRecords":true,"fixtureOnly":true}`. El fallo de red intermedio no se inyectó en la UI; la consecuencia se fundamenta en la secuencia del handler y el ensayo de reenvío. Los nombres duplicados legítimos deben seguir permitidos: no resolverlo con una restricción única por nombre.

Recomendación: separar el resultado de escritura del refresco; si ya hay confirmación, informar «guardado, consulta pendiente». Para pérdida de respuesta de escritura, usar una clave estable de solicitud o conciliación explícita antes de repetir. La opción que cambie esquema requiere autorización y respaldo.

Criterio: escribir y fallar la recarga, o perder la respuesta tras commit, nunca debe crear una segunda ficha al reintentar la misma solicitud; un alta nueva e intencional con el mismo nombre sí debe funcionar.

### QA-009-02 · P1 · Recuperación de datos de la nube sin flujo completo — funcionalidad pendiente

`backend/index.html:382` y `backend/backup-diagnostics.mjs` solo revisan un JSON de la PWA. No exportan la familia conectada ni restauran pacientes, inventario, citas, pagos y accesos de manera integral. El respaldo técnico previo a las migraciones no sustituye un procedimiento operativo periódico para los datos futuros. Tampoco se comprobó en esta auditoría la retención o restauración ofrecida por el proveedor.

Recomendación: definir exportación por familia, formato versionado y prueba de restauración en destino desechable, con conciliación de IDs, relaciones y totales. Mantener códigos, tokens y secretos fuera de la exportación. No implementar una migración implícita desde `pastillas-v1`.

### QA-009-03 · P2 · Borradores inconsistentes al cambiar familia — defecto reproducido

En navegador y con datos ficticios se escribió una cita sin guardar y un nombre de ficha nueva en familia A. Al seleccionar familia B en Configuración, el lugar de la cita quedó vacío y el nombre de la ficha permaneció. No apareció confirmación. `families.change` (`backend/pilot.mjs:542`) llama a `refreshFamily`, que a su vez ejecuta `resetAppointments` (`:340` y `:138`). El formulario de nueva ficha no se restablece en esa ruta.

Impacto: pérdida de texto y posibilidad de guardar un borrador originado en otra familia. No se guardaron datos cruzados en el ensayo.

Recomendación: detectar borradores antes del cambio, permitir cancelar y vincular cada borrador a su familia de origen. Aplicarlo también al cierre/recarga y a abrir una edición desde Inventario: `backend/inventory.mjs:185` solo pide confirmar cuando ya existe `editDraft`, no cuando se estaba creando un artículo nuevo con texto.

Criterio: cita, ficha, pauta o compra no se pierden ni cambian de familia de destino silenciosamente.

### QA-009-04 · P2 · Historial inaccesible después de los primeros 20 — limitación funcional

`backend/supabase-client.mjs:8`, `backend/finance.mjs:153` y `backend/inventory.mjs:47` limitan listas a 20 sin un control para cargar el resto. En pagos, la acción de cancelar un abono se crea desde la lista cargada: un movimiento más antiguo queda sin acceso desde esa pantalla. En citas puede no quedar claro que faltan registros. Los datos no se borran y los cálculos SQL no se limitan a esa lista.

Recomendación: paginación estable por fecha e ID, filtro por fechas/persona y aviso de cuántos resultados se muestran. Verificar 21 y 50 registros, empates de fecha y ausencia de duplicados entre páginas. Contemplar también paginación de listas sin límite explícito sujetas al máximo del servidor.

### QA-009-05 · P2 · Sesión en memoria sin renovación — limitación diseñada

`backend/supabase-client.mjs:119` conserva solo `access_token` en memoria y descarta el resto de la sesión. Recargar o cerrar requiere autenticarse; un 401 durante una operación lleva a `endSession` en `backend/pilot.mjs:207`. El código no implementa renovación de sesión.

Recomendación: definir explícitamente dispositivo propio/compartido, renovación, cierre y revocación antes de añadir persistencia. Probar expiración mientras hay borrador y fallo de red. No almacenar una contraseña ni persistir tokens sin una decisión de seguridad.

### QA-009-06 · P2 · Candidata conectada sin equivalencia offline — funcionalidad pendiente

El build público de backend no contiene manifest, service worker ni sincronización offline. Su `Cache-Control: no-store` y su cliente requieren red. La suite offline aprobada corresponde a la PWA histórica, no acredita offline en la versión conectada.

Recomendación: empezar por consulta offline con fecha de última sincronización y limpieza de datos locales al cerrar/revocar; después plantear escrituras y resolución de conflictos. No mezclar silenciosamente los datos de ambos orígenes.

### QA-009-07 · P2 · Datos de otro teléfono solo se actualizan bajo demanda — limitación diseñada

La guía y los handlers de carga dependen de Actualizar fichas o de una operación local. No se encontró suscripción realtime, sondeo periódico ni recarga automática al volver a primer plano. Las revisiones/idempotencia mitigan ciertos conflictos, pero no hacen que la pantalla se actualice sola.

Recomendación: indicador de última actualización y recarga al recuperar foco/conexión, respetando borradores. Probar dos sesiones editando la misma cita e inventario; no describir este estado como sincronización instantánea.

### QA-009-08 · P2 · Documentación operativa contradictoria — deuda documental

`backend/README.md` todavía describe protección Vercel activa, recuperación y entrega pendientes, migraciones 10/11 sin aplicar y ausencia de accessUrl. Los informes RECONST-030–032 y las comprobaciones actuales contradicen ese estado histórico. Esto puede llevar a repetir inicializaciones o diagnosticar mal un acceso.

Recomendación: añadir una entrada de estado vigente y separar las instrucciones históricas de la operación actual, enlazando los informes sin borrar su trazabilidad. La transición a main debe incluir un procedimiento de despliegue, reversión y configuración por entorno.

### QA-009-09 · P2 · Automatización y simulador incompletos — deuda de QA

No existe `.github/workflows` en este checkout. Las suites se ejecutan manualmente; no se comprobó una barrera remota que impida publicar con fallos. El simulador no equivale a PostgREST: tiene un parser parcial de filtros, relaciones, orden y paginación. Se encontró además que una respuesta de fecha del simulador se representa como timestamp ISO en la tabla; no permite concluir que la nube tenga ese mismo defecto.

Recomendación: CI con pruebas unitarias/SQL y build; recorrido de navegador del artefacto y una prueba de contrato Auth/PostgREST real en entorno aislado. Mantener una matriz separada de simulación, integración real y dispositivos físicos. No declarar «probado en Safari» a partir de un viewport móvil.

### QA-009-10 · P3 · Mensajes, carga y accesibilidad necesitan recorrido dedicado — mejora

`backend/pilot.mjs:82` desvanece errores/advertencias a los 12 segundos. El wrapper de operaciones bloquea mediante `busy`, pero no comunica un estado global de carga accesible ni deshabilita de forma uniforme todos los envíos. No se comprobó VoiceOver de extremo a extremo en este lote. La evidencia previa de iPhone valida recorridos concretos, no una conformidad general.

Recomendación: progreso visible, errores importantes persistentes hasta cierre o corrección, feedback junto al campo, foco al error pertinente y ensayo con teclado, VoiceOver, ampliación de texto y preferencias de movimiento reducido. Conservar el cierre manual y la privacidad de nombres/montos.

## Controles favorables verificados

- Suite backend **54/54**, incluyendo SQL con RLS, aislamiento, revocación, sesiones temporales, recuperación, cuotas y correo; prueba de equivalencia financiera y restauración de fixture en PostgreSQL desechable.
- Suite conjunta PWA **102/102**, incluyendo persistencia, escritura fallida, concurrencia, JSON, pagos, inventario y actualización/recarga offline de la PWA histórica. Esta ejecución fue secuencial respecto de la suite backend y terminó sin fallos.
- Build estático: **18 archivos**, lista cerrada que rechaza archivos inesperados.
- HTTP público sin cookies: portada 200; `access-service.mjs`, `email-hook.mjs`, `.env` y ruta de respaldo privado 404. CSP presente, `frame-ancestors 'none'` y no-store. Son rutas comprobadas, no enumeración exhaustiva del hosting.
- API de familias sin sesión: 401. No se consultaron familias mediante credenciales reales.
- `npm audit --json`: cero avisos reportados para el lockfile instalado. Es una consulta de avisos conocidos, no prueba de ausencia de vulnerabilidades.
- Búsqueda acotada de patrones de claves privadas versionadas: el único resultado fue el fixture `sb_secret_synthetic` de rechazo en tests; no se encontró un secreto real con esos patrones. No equivale a escaneo forense completo.
- UI usa construcción DOM y texto; no se encontró innerHTML/eval en módulos revisados. No implica que todas las superficies estén auditadas contra todas las variantes de inyección.

## Evidencia, alcance y siguiente lote propuesto

Comandos: `npm test` en backend; `node --test tests/payments.spec.js tests/persistence.spec.js`; `node backend/build-preview.mjs`; `npm audit --json`; consultas HTTP de recursos públicos y API anónima; recorrido del simulador local con cuentas `.test`.

Artefactos locales ignorados: `backend/supabase/.temp/quality-audit-retry.mjs`, `quality-audit-http.mjs`, `quality-audit-dependencies.json`, `quality-audit-draft.jpg`. No contienen datos reales o claves privadas; el ensayo de duplicado solo opera sobre PostgreSQL en memoria.

Lote recomendado: resolver resultados inciertos de altas y proteger borradores multifamiliares; después historial paginado y unificar la documentación vigente. Definir por separado la exportación/restauración conectada antes de ampliar el uso real. Sesión persistente y offline necesitan diseño y autorización específicos, no son arreglos cosméticos.

No se aplicaron correcciones de producto en la auditoría. No hubo push, merge, despliegue, envío de correos, creación de cuentas reales ni revisión de consolas privadas de Supabase/Brevo/Vercel. Falta auditoría física de Safari/VoiceOver, prueba de recuperación operativa de la nube y ensayo de carga concurrente real. Los resultados se registran en commit local para revisión.
