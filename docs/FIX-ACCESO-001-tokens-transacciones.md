# FIX-ACCESO-001 · Sesión guardada y transacciones de consulta

19/11/2026. Base `1caa02439156657da62bad54e7d0a57415616a75`. El propietario informa HTTP400/token not found y el acceso muestra «La operación fue rechazada». Se revisa sin leer contraseñas ni guardar datos reales en el informe.

## Dos causas distintas

1. **Sesión guardada no reconocida:** Auth puede devolver HTTP400 `refresh_token_not_found`. Se elimina la autorización y caché de esa API, se conserva el ticket de operaciones inciertas y se vuelve al formulario. Durante uso activo se informa que hace falta entrar de nuevo. No se transforma un error de contraseña en una sesión válida.
2. **Carga posterior al acceso:** logs reales muestran Auth y lecturas de familias/fichas aprobadas, seguidas de HTTP405 en `/rest/v1/rpc/list_care_members` y SQL25006, `cannot execute SELECT FOR SHARE in a read-only transaction`. No es un error de contraseña. La consulta STABLE llama al control de membresía que toma un bloqueo; PostgREST decide una transacción sólo lectura por la volatilidad, incluso con POST.

El ensayo SQL anterior usaba una transacción read-write y no representaba esa decisión de PostgREST. Se corrige esa carencia de pruebas; el informe anterior conserva su alcance histórico.

## Corrección preparada

Migración17 cambia **únicamente** a VOLATILE los RPC públicos `list_care_members(uuid)` y `export_family_backup(uuid)`, que usan el mismo control con bloqueo. Conserva cuerpos, grants, políticas, datos y reglas. Las operaciones siguen siendo consultas para la aplicación; se permite la transacción necesaria para sus bloqueos de autorización.

El simulador consulta `pg_proc.provolatile` y representa el modo read-only para RPC estables. La prueba nueva reproduce25006 en la versión16 y comprueba la solución17, el listado de un cuidador, denegación de respaldo a ese cuidador y rechazo de anónimo/cuenta ajena. Grants y membresías iguales.

Cliente: códigos de refresh/sesión invalidada reciben estado de sesión terminada, sin mostrar el mensaje privado del proveedor ni recurrir a caché tras rechazo. Reanudación vuelve al formulario; una lectura durante uso pide nuevo inicio. Se conservan las guardas de respuestas tardías/cambio de identidad.

## Comprobaciones

- 112/112 pruebas conectadas, incluidas dos regresiones de refresh inválido y prueba de modo de transacción.
- 1/1 recorrido integrado ampliado con el simulador corregido, perfiles y datos ficticios.
- 102/102 en la regresión conjunta PWA de pagos/persistencia, con Edge aislado.
- Copia privada de26 tablas/20 filas restaurada en PostgreSQL desechable; aplicación de17 migraciones y conteos preservados (`restored=true`, `existingRowsPreserved=true`). Archivo y evidencia ignorados en supabase/.temp, sin publicar datos reales.

La aplicación de17 requería autorización específica según AGENTS.md, copia privada y restauración comprobada. El propietario aprobó explícitamente «Aplicalas y subelas quedan aprobadas» y confirmó la solicitud de17. Main y las cuatro propuestas ajenas se conservan. No se enviaron correos ni se cambió contraseña alguna.

## Aplicación y publicación comprobadas

Migración17 aplicada en Supabase tras restauración comprobada de26 tablas/20 filas. Se verificó `members_mode_ok=true` y `backup_mode_ok=true`. Con una identidad propietaria autorizada, dentro de una transacción terminada en ROLLBACK, las consultas reales devolvieron `members_read_ok=true` y `backup_read_ok=true`, sin imprimir el contenido privado. No se escribieron registros operativos.

Código publicado en `origin/development`: **`a7f2475b7dc5d1f292f58dbb7b433c024b815f67`**. [CI44590074054](https://github.com/SantiagoArroyoBr/Mis_Pastillas/actions/runs/44590074054): **success** en todas las etapas. Ambos estados Vercel **success**; cliente corregido servido y comprobado en la Preview. Captura ignorada sin datos personales: `backend/supabase/.temp/rpc-fix-applied.jpg`.

No se afirma un nuevo inicio de sesión manual en el teléfono del propietario. Al volver a abrir la app debe utilizarse el cliente actualizado e iniciar sesión otra vez si la autorización anterior fue invalidada. No borrar datos del navegador ni cambiar la contraseña como solución de este defecto. Seguimiento final en commit local para revisión.
