# RC-003 · Pulido y ensayo de migración desde main

Estado posterior: [RC-004](RC-004-preparacion-ensayo-vercel.md) registra la copia privada recibida, la corrección de segunda recuperación y la aplicación de SQL18. Los pendientes de este informe describen su cierre original.

20/11/2026. Petición: pulir la versión actual y exportar un JSON ficticio desde main para comprobar y corregir la migración. Base de desarrollo `8fbc69205132149eb5c9052cbde4ad4f6faf9d32`; origen histórico `92c4034085e13bb38fd0a7ff2622c46ef797873d`. Trabajo local en development. Sin respaldo familiar real, aplicación remota de SQL18, push, main ni cambios de producción en este lote.

## Resultado y contrato

`main-export.integration.mjs` sirve los objetos Git de main en un origen temporal, carga datos ficticios y pulsa su botón original Exportar respaldo. El archivo descargado se conserva en `backend/tests/fixtures/main-backup.json`; su restauración confirmada en la misma versión original también se prueba. No es un JSON escrito a mano para imitar el formato. La prueba normal compara el resultado contra la fixture y la integración continua descarga el historial Git necesario.

El conversor local acepta la estructura de esa versión, valida relaciones y genera una copia conectada v3. La interfaz primero diagnostica el archivo, prepara la conversión sin escribir y presenta conteos y advertencias. La confirmación existente restaura en una familia nueva con identificador durable para conciliar reintentos. No reemplaza la familia abierta ni toca localStorage de la instalación antigua.

| Origen ficticio | Destino / conservación |
| --- | --- |
| Dos fichas homónimas | Dos identidades distintas; relaciones conservadas por índice |
| Tres artículos, cuatro pautas | Misma base, fecha inicial y frecuencias; consumo independiente con inventario compartido |
| Tres referencias de precio | Cotizaciones; no vuelven a sumar unidades al inventario |
| Dos citas | Ficha, fecha, hora, lugar y nota; las fechas históricas inválidas se conservan como legado |
| Tres registros de personal sin tarifa comprobable | Historial original consultable; requieren alta con tarifa verificada para nuevas jornadas |
| Tres prepagos de cobertura y cinco asignaciones | Historial separado; no se inventan costos, jornadas devengadas ni abonos actuales |
| JSON original completo | Copia literal y SHA256 dentro del respaldo v3; descarga comprobada idéntica |

La sección histórica sólo consulta la cuenta propietaria conectada. RLS impide acceso de cuidadores, temporales y familias ajenas. No se guarda ese documento privilegiado en la caché offline. Los montos tienen control propio y se ocultan a los30 segundos o al cambiar de fuente. Si una copia contiene varias fuentes históricas, se pueden seleccionar todas. El saldo administrativo advierte que excluye el historial anterior. El original sigue disponible para retorno a la PWA antigua.

SQL18 conserva respaldos v1/v2 y solicitudes de restauración ya confirmadas, remapea IDs/autores y aplica restauración atómica. Verifica el hash literal, límites y ausencia de campos de credenciales anidados. Texto inocuo que contiene esas palabras no se confunde con una credencial. Formatos financieros posteriores, campos superiores desconocidos, pautas ambiguas o datos fuera del contrato se rechazan antes de producir una conversión; no se truncan para forzar su aceptación.

## Pulido y fallos corregidos

- El botón de actualización de la aplicación estaba dentro de la sesión: ahora también es visible y funciona desde el acceso cerrado.
- Se completaron las etiquetas de conteos para notas, pendientes e históricos en la revisión de respaldos.
- El ensayo detectó que el servidor aislado limitaba todos los cuerpos a8KiB: sólo la restauración acepta ahora hasta10MiB; los endpoints de accesos conservan su límite pequeño. La conversión con el original superaba8KiB y era rechazada antes de llegar a SQL.
- Lecturas históricas atrasadas no repintan otra familia; el cambio de sesión/familia borra las filas y montos visibles. Un error de lectura no deja habilitada la descarga de otra familia.

## Verificación reproducible

Desde la raíz, con Node22+ y dependencias instaladas en backend:

```text
npm test --prefix backend
npm run test:ui --prefix backend
node --test tests/payments.spec.js tests/persistence.spec.js
node backend/build-preview.mjs
git diff --check
```

Resultado final del lote: **126/126** pruebas conectadas, **2/2** recorridos en Edge (main y candidata), **102/102** de pagos/persistencia/PWA y compilación de **36 archivos públicos**. Sin omisiones. La prueba conectada incluye importar el JSON real ficticio, confirmar que la revisión no escribe, comprobar conteos y original, descargarlo y comparar bytes, revisar privacidad, ancho320px, vuelta a otra familia, offline y actualización desde la pantalla de acceso. Las pruebas SQL incluyen exportación y segunda restauración v3, permisos, rollback por payload inválido y compatibilidad con v1/v2 y tickets antiguos. Auth/correo son simulados en estos recorridos; no equivalen a PostgREST remoto ni a validación física del archivo familiar.

La captura ficticia local `backend/supabase/.temp/legacy-migration-preview.jpg` sirve para inspección móvil y está excluida de Git. Las cuatro propuestas ajenas permanecen fuera del commit de este lote.

## Siguiente puerta

SQL18 está preparado y probado **sólo localmente**. Para habilitar esta importación en el proyecto real, hace falta su autorización específica, exportar una copia privada reciente y comprobar su restauración antes de aplicar18. Después publicar development y verificar Preview con Auth/PostgREST reales. No adelantar el frontend dependiente de18.

La mamá debe conservar su Android instalado y exportar el JSON desde esa instalación. Validar la copia privada real, restaurarla en un perfil aislado, conciliar el inventario a la misma hora y revisar con la familia los históricos que requieren nuevas tarifas. El ensayo ficticio prueba el mecanismo, no certifica un archivo aún no recibido. La integración a main y el cambio de producción se mantienen como decisiones separadas.
