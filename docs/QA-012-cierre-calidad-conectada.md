# QA-012 · Recuperación, sesión e instalación

18/11/2026. Lote autorizado por «sigue ese orden que recomiendas hazlo todo», retomado tras restablecerse el límite. Base: `e5aaf48e16bd24ccc3ccbce3b532b76936078d6a`. Conserva las propuestas de cobertura y gestión de fichas que ya estaban modificadas por separado.

## Implementación

| Área | Resultado y rutas principales |
| --- | --- |
| Altas | `durable-requests.mjs` y migración 13: ticket persistente, bloqueo SQL por operación, respuesta repetible tras pérdida de red y rechazo de un ticket con otro contenido. Crear intencionalmente dos nombres iguales sigue permitido. La confirmación distingue escritura realizada de fallo al releer o limpiar almacenamiento. |
| Historial | `history.mjs`, cliente, finanzas e inventario: ventanas ampliables desde 20, paginación estable con identificador final, consultas relacionadas acotadas y cancelaciones antiguas visibles. Cada cambio vuelve a ocultar montos. |
| Recuperación | `family-backup.mjs` y migración 14: JSON familiar privado, revisión, confirmación y restauración atómica en una familia nueva. Remapea identificadores y referencias; conserva importes, fechas históricas, ediciones y archivo. No restaura cuentas ni permisos. Autorías operativas se atribuyen al recuperador; procedencia administrativa queda como registro de consulta. |
| Sesión | `session-state.mjs` y cliente: almacenamiento por pestaña, recordar dispositivo opcional, renovación coordinada y protección contra respuestas tardías después de salir. Contraseñas fuera del almacenamiento. |
| Offline | `offline-cache.mjs` y SW conectado: apertura del artefacto compilado y consulta opcional de lecturas previas con token vigente. Caché por API, usuario y consulta, hasta 2 MiB/120 consultas; sin RPC, credenciales ni respuestas administrativas. Mutaciones bloqueadas. Salir elimina sesión y caché privada, conserva tickets para conciliar respuestas perdidas. |
| Identidad | Corazón petróleo/crema/terracota, favicon, apple-touch y variantes any/maskable. Integrado en ambas versiones; PWA de referencia actualiza caché v22→v23. Build conectado de 32 archivos con revisión por contenido y actualización explícita. |
| QA | Sandbox aislado con renovación de tokens y subconjunto de SELECT PostgREST: orden, nulos, cursores, filtros y relaciones bajo RLS. Nueva prueba integrada de navegador y paso CI. |

## Base remota y recuperación previa

Antes de las migraciones 13/14 se exportaron privadamente **21 tablas, 19 filas** y referencias mínimas de Auth. El archivo está ignorado en `backend/supabase/.temp/`; no contiene contraseñas/tokens y no se publica. En PostgreSQL desechable se restauraron todas las tablas, se aplicaron las 14 migraciones y se comprobaron los conteos originales. Resultado privado reproducible: `restored=true`, `existingRowsPreserved=true`.

Las migraciones se aplicaron en una transacción al proyecto existente. Un error de inserción del editor SQL se revirtió mediante ROLLBACK; se comprobó ausencia de esquema parcial antes de reinsertar y comparar el SQL completo con su fuente. Supabase confirmó las funciones de alta, exportación y restauración. Una consulta posterior devolvió **original_counts_preserved=true** para las 21 tablas y **internal_rls_enabled=true** para ambas tablas internas nuevas. No se enviaron correos ni se cambiaron credenciales en este lote.

## Validación

- Suite conectada: **87/87** con fixtures SQL, Auth/correo simulados, recuperación, idempotencia, historiales, sesión y parser de sandbox. El parser cruza páginas de 200 entre 450 citas y comprueba aislamiento de propietarios.
- PWA: **102/102**, suite conjunta de pagos/persistencia en Edge aislado. Incluye escritura fallida, concurrencia, respaldo/restauración, apertura y actualización offline. Se ajustó la comprobación del manifest a tres iconos y finalidades separadas.
- Navegador conectado compilado: **1/1** en Edge aislado, 390 px. Inicio, persistencia de sesión tras recargar, 20→25 abonos, ocultación independiente, revisión/restauración de copia, conservación de la familia original, recarga offline, bloqueo de formularios, reconexión, actualización de SW y conservación de caché ajena, limpieza privada al salir.
- Build: 32 archivos públicos mediante lista cerrada; SQL, respaldos, pruebas y generador de iconos quedan fuera.
- Los primeros intentos de navegador bajo sandbox no pudieron acceder a loopback (`EACCES`); se repitieron con permiso de ejecución local. El primer ensayo del SW detectó la ruta `/index.html` ausente en el servidor de fixtures; corregida. Ninguno de esos intentos se contabiliza como aprobado.

## Límites prácticos

La consulta offline no incluye escrituras ni garantiza que estén disponibles todas las pantallas: sólo lecturas cacheadas; pagos y administración requieren internet. No puede comprobar revocación remota desconectada. Un token vencido impide nuevas lecturas offline, pero no borra remotamente información que ya quedó visible en pantalla. Usar únicamente en dispositivos personales; los accesos temporales no reciben caché offline.

La restauración conectada no importa automáticamente `pastillas-v1`. El formato JSON conectado tiene versión explícita y columnas permitidas; futuros cambios de esquema requieren revisar su compatibilidad. La prueba de sandbox no certifica la equivalencia exhaustiva de PostgREST real. No se afirma una nueva prueba física en iPhone/Android ni de lector de pantalla.

## Preparación de main

Con referencias actualizadas, antes de este lote `development` tenía **230 commits** posteriores a `main`, con ancestro `92c4034085e13bb38fd0a7ff2622c46ef797873d`; el diferencial abarcaba 139 archivos. Esto exige revisar la integración completa, además del lote actual.

1. Mantener los dos proyectos de Vercel y sus orígenes de datos identificados; integrar código a main no equivale a migrar datos ni a cambiar el destino de producción.
2. Conservar la PWA raíz y su restauración local; acordar por separado cualquier transición automática a Supabase.
3. Exigir CI aprobado del SHA final y comprobar Preview compilada sobre ese SHA.
4. Recorrer instalación/nuevo icono, recuperación, navegación y recarga en iPhone físico y Android si está disponible. Un icono ya instalado puede conservarse por el sistema; comprobar una instalación nueva sin borrar datos locales.
5. Confirmar corte de producción y plan de retorno antes de integrar: la versión anterior puede seguir usando los RPC previos, conservados por estas migraciones. No revertir la base eliminando registros ni funciones con datos históricos.

**Main permanece sin modificar.** Merge, cambio de producción y sincronización offline con escrituras quedan fuera de esta publicación de development. Publicación GitHub, CI remoto y Preview se registran con evidencia al terminar.
