# RC-004 · Preparación de la prueba manual en Vercel

20/11/2026. Base `017fd0d82b80831e1fd0c767057bd97725f88ebc`. El propietario entrega una copia familiar para validación local y después precisa que hará personalmente la prueba en Vercel. Se preparan correcciones, esquema y development; **no se importa el archivo familiar a Supabase**. Main y producción original quedan intactos.

## Comprobación privada

Se verifica integridad de lectura y estructura compatible; se conserva otra copia privada. Conversión y primera restauración en PostgreSQL desechable aprobadas. Reintento de la misma solicitud devuelve la misma familia. Se cotejan las relaciones del inventario, bases, pautas y existencias calculadas a una misma hora entre origen, conversión y datos restaurados. Una cuenta ajena no puede consultar el original.

La exportación posterior se vuelve a restaurar y conserva literalmente el JSON original. Un perfil temporal de Edge recorre la interfaz local de development: revisión, preparación sin escrituras, confirmación en familia nueva, historial, descarga idéntica, cambio de familia y actualización. Sin capturas familiares ni contenido personal en los informes. Los materiales privados no se incorporan a fixtures, Git ni compilaciones públicas. El archivo recibido permanece intacto.

## Defecto reproducido y corrección

Al convertir desde main, administration puede omitir recovery_history. La exportación SQL anterior confundía JSON null con SQL NULL y concatenaba un elemento null al historial. La primera restauración funcionaba, pero la recuperación del respaldo posterior era rechazada como inválida.

La prueba de regresión usa exclusivamente la fixture ficticia exportada de main y reproduce el fallo. SQL18 normaliza únicamente la ausencia de ese agregado a una lista vacía. No borra históricos, no relaja la validación ni cambia reglas financieras. El respaldo posterior vuelve a restaurarse y mantiene el original. SQL18 se modifica antes de su primera aplicación remota; las migraciones ya aplicadas1–17 no se reescriben.

Se amplía además la espera al limpiar el perfil temporal de Edge: Windows podía mantener bloqueado su diccionario después de terminar el recorrido, provocando EBUSY durante la limpieza. La repetición quedó aprobada.

## Preparación real

Se guarda una exportación privada reciente de las tablas operativas/administrativas con las referencias Auth mínimas necesarias para ensayar relaciones. No es una copia portable de contraseñas ni del proveedor Auth completo. Su restauración y aplicación incremental se comprueban en PostgreSQL desechable, con datos anteriores conservados.

Después se aplica SQL18 en el proyecto Supabase existente y se solicita recarga de esquema a PostgREST. Se comprueba lectura propietaria real de respaldo v3, RLS activa, inserción directa denegada, conteos previos iguales y ausencia de importación en legacy_snapshots. Consultas de verificación con identidad autenticada terminan en ROLLBACK. No se alteran credenciales, correo, permisos de cuentas o familias existentes.

## Pruebas

- 126/126 conectadas, incluyendo regresión de segunda recuperación desde main y compatibilidad v1/v2.
- Recorrido privado local con el archivo entregado aprobado, sin divulgar datos.
- Recorrido conectado ficticio y exportación/restauración del main original aprobados; se repitió la limpieza tras EBUSY de Windows.
- Regresión conjunta de pagos y persistencia de la PWA: 102/102 aprobadas en Edge aislado.
- Compilación estática de36 archivos; SQL, copias privadas y herramientas excluidos del artefacto público.

La prueba física/manual de la familia pertenece al propietario. No se afirma haberla completado en Vercel.

## Cómo hará la prueba el propietario

1. Abrir la [candidata development](https://acompana-piloto-git-development-dinamita20.vercel.app/) e iniciar sesión con la cuenta principal.
2. Entrar en **Respaldo** y elegir el archivo original en **Copia JSON de la PWA anterior**, no en el selector de copia conectada.
3. Revisar el diagnóstico, indicar un nombre para la familia nueva y pulsar **Preparar importación**.
4. Revisar conteos y advertencias. Marcar la confirmación y restaurar en una familia nueva una sola vez. Si se pierde la respuesta, consultar las familias antes de repetir; los reintentos iguales se concilian.
5. Comprobar fichas, inventario, pautas y citas. En el historial de la versión anterior, comprobar personal, cobertura y asignaciones. El saldo nuevo excluye esos registros sin tarifa comprobable.
6. Exportar la familia conectada y conservar tanto esa copia como el JSON anterior. Mantener la app Android original hasta concluir la revisión familiar.

La importación enviará el respaldo a Supabase dentro de la familia nueva de la cuenta principal cuando el propietario la confirme. No fusiona familias ni reemplaza las existentes. Main y cambio de producción se deciden después.

## Publicación

Pendiente de registrar SHA, CI y comprobación de Preview al terminar el lote. El archivo familiar no forma parte de la publicación.
