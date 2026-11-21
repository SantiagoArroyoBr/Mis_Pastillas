# RC-002 · Respaldo Android y preparación de main

Actualización posterior: [RC-004](RC-004-preparacion-ensayo-vercel.md). Copia familiar recibida y validada sólo en local; SQL18 aplicado tras copia/restauración privada. El propietario hará la importación real en Vercel. Los estados siguientes documentan la preparación inicial y el ensayo ficticio anterior.

20/11/2026. El propietario pide cerrar la versión y preparar main, conservando la instalación Android de su mamá hasta migrarla. La familia utiliza la PWA instalada de main, no la candidata conectada. No cambiar main ni el origen que usa esa instalación antes de comprobar el respaldo y la transición.

## Estado confirmado

- Main remoto: `92c4034085e13bb38fd0a7ff2622c46ef797873d`, ancestro común de development;239 commits de development posteriores en la revisión actual.
- Producto conectado publicado y probado: `a7f2475b7dc5d1f292f58dbb7b433c024b815f67`, [CI44590074054](https://github.com/SantiagoArroyoBr/Mis_Pastillas/actions/runs/44590074054) aprobado. Seguimiento local `a0f4b5c`;112 pruebas conectadas,102 PWA y1 recorrido integrado en FIX-ACCESO-001.
- Supabase tiene17 migraciones; se conservan ambas aplicaciones. La referencia local funciona con `pastillas-v1`, por origen y dispositivo. La nueva utiliza familias y permisos en Supabase.
- El código de main contiene el botón **Exportar respaldo** y genera `cuidados-respaldo-AAAA-MM-DD.json`.
- Al preparar este documento la candidata sólo diagnosticaba el JSON anterior. El lote local [RC-003](RC-003-ensayo-migracion-main.md) añade conversión explícita y restauración v3 con historial original separado, comprobadas con una exportación ficticia real de main. Falta habilitar SQL18 remotamente y validar el archivo familiar. No indicar que el archivo anterior se carga directamente como copia conectada.

## Sacar la copia en el Android original

1. Abrir Acompaña desde el icono instalado que usa su mamá y comprobar que ve sus datos habituales.
2. Pulsar **Exportar respaldo**, conservando la instalación y sus datos.
3. En Archivos/Descargas, localizar el JSON descargado y comprobar que tiene tamaño mayor que cero. No modificar su contenido ni cambiar la extensión.
4. Conservar ese original en el teléfono y copiarlo a la computadora. Trabajar sobre otra copia privada, fuera de Git; no pegar nombres, datos de salud o movimientos en informes públicos.
5. Comunicar la ruta local de la copia para revisión. No restaurar encima de la instalación original, borrar almacenamiento, desinstalar ni sustituirla durante este proceso.

La exportación no migra ni elimina la información. Abrir el enlace nuevo en otro navegador no extrae los datos del icono antiguo. No asumir que el respaldo incluye información que no se haya capturado en esa instalación.

## Puertas antes del corte

| Etapa | Evidencia necesaria | Estado |
| --- | --- | --- |
| Copia del teléfono | Archivo original reciente y copia privada en computadora | Pendiente del propietario |
| Integridad y restauración local | Validar sin alterar el original; conteos y restauración en perfil aislado | Pendiente de archivo |
| Conversión compatible | Mapear índices, fechas, stock/pautas, compras/cotizaciones y libros financieros sin inventar equivalencias | Ensayo ficticio aprobado en RC-003; archivo familiar pendiente |
| Ensayo de destino | Familia nueva, conteos/totales/referencias conciliados, reintento seguro y respaldo recuperable | Aprobado aislado; SQL18 remoto y archivo real pendientes |
| Revisión familiar | Fichas, inventario, citas, enfermería y pagos verificados por la familia; original disponible para retorno | Pendiente |
| Integración y producción | Diff completo, pruebas del SHA, decisión de main y del proyecto/directorio de Vercel | Preparación, sin ejecutar |

Los históricos sin equivalencia no se descartan ni se convierten arbitrariamente en jornadas o abonos nuevos. Primero identificar el caso y preparar una representación compatible o dejarlo explícitamente pendiente. No transmitir el respaldo familiar al proyecto remoto sin confirmar destino/familia y la operación concreta.

Merge de código, importación de datos y cambio de producción son tres acciones distintas. El proyecto `pastillas-1` sirve la raíz local y `acompana-piloto` construye backend; unir development a main por sí solo no convierte automáticamente el enlace antiguo en la aplicación conectada. La autorización final del corte se pide con el plan concreto y la recuperación comprobada.

## Cierre de preparación

Esta preparación inicial no cambió producto ni esquema. Posteriormente RC-003 implementó y ensayó localmente el conversor, conservando main, producción y las cuatro propuestas ajenas. No se recibió aún el respaldo real. Siguiente acción familiar: exportar y copiar el JSON desde el Android instalado original. La habilitación remota y la comprobación de esa copia siguen pendientes antes de declarar la migración familiar lista.
