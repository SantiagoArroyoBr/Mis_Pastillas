# Acompaña · Piloto local de datos y cuentas

El piloto corre en `127.0.0.1` y tiene su propio servidor, origen y configuración. Úsalo con cuentas y datos ficticios. La PWA de referencia conserva su propio servidor, respaldo y clave `pastillas-v1`. `.vercelignore` excluye el piloto del despliegue estático actual. [Exclusiones de Vercel](https://vercel.com/docs/deployments/vercel-ignore).

## Ejecutar

Requiere Node.js 22+ y un motor de contenedores compatible con Docker. `npm ci` instala la versión fijada de Supabase CLI en este directorio. Ejecuta los comandos desde aquí con Docker ya iniciado. La [guía de instalación de Supabase](https://supabase.com/docs/guides/local-development) cubre el motor, la CLI y la red local.

```text
npm ci
docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 acompana-pilot-loopback
npx supabase start --network-id acompana-pilot-loopback
npx supabase status
npm start
```

Crea la red una sola vez. Reutilízala al iniciar de nuevo. En Windows, la primera instalación de WSL 2 puede requerir un reinicio antes de que Docker pueda arrancar. [Instalación de WSL](https://learn.microsoft.com/en-us/windows/wsl/install).

**Comprobación en Docker Desktop para Windows.** Verifica los puertos publicados con `docker ps --filter network=acompana-pilot-loopback`. En el equipo de prueba, la opción de la red por sí sola permitió enlaces en todas las interfaces. Los cinco contenedores publicados se recrearon allí con `HostIp=127.0.0.1` y los mismos volúmenes. Las instancias anteriores quedaron detenidas para recuperación local. Volver a crear el stack con la CLI puede restablecer los enlaces predeterminados, así que verifica los puertos si se recrea.

Abre `http://127.0.0.1:4173` y usa la clave **Publishable** local de `supabase status`. Utiliza correos `@acompana.test` y contraseñas exclusivas del piloto. Crea una familia y una ficha, genera una invitación, y acéptala desde otra cuenta en una ventana aparte. Guarda un nombre desde una cuenta y pulsa **Actualizar fichas** en la otra. Puedes revocar a la segunda cuenta desde la propietaria y actualizar sus fichas para comprobar la pérdida de acceso.

En **Citas**, la cuenta propietaria o cuidadora puede registrar una cita vinculada a una ficha activa. **Próximas citas** incluye hoy y ordena las citas desde la más cercana. **Citas anteriores** muestra primero las más recientes. Si hay fechas históricas inválidas, aparecen en su propia lista. Cada lista muestra hasta 20 registros. Desde la cuenta propietaria, confirma **Archivar ficha** y comprueba que la ficha desaparece de los selectores de citas y jornadas y que sus registros anteriores siguen visibles. **Reactivar ficha** devuelve la misma ficha a los selectores.

**Editar cita** permite cambiar fecha, hora, lugar y notas de una cita con fecha válida y ficha activa. Si dos cuentas abren la misma cita, el primer guardado actualiza su revisión. La segunda recibe un aviso y conserva su borrador. Puede copiar lo que escribió y volver a abrir la cita actualizada. Los recordatorios y la exportación a Calendar siguen pendientes.

**Filtrar citas por ficha** aplica la selección a las tres listas. Las fichas archivadas se pueden seleccionar para consultar su historial, y las fichas del mismo nombre muestran una referencia breve en el selector. Las citas del día llevan la etiqueta **Hoy**. El filtro se conserva al pulsar **Actualizar fichas** dentro de la misma familia.

Auth utiliza correo y contraseña con confirmación externa desactivada únicamente en este stack local. La sesión vive en memoria durante la prueba. La recarga, el cierre o la expiración requieren volver a iniciar sesión. Las invitaciones son códigos revocables de un solo uso, caducan en siete días y se canjean desde la cuenta con el correo indicado. Antes de un piloto externo, habilitar y comprobar la confirmación de correo, la recuperación de cuenta y la política de sesión.

Si el stack ya está iniciado, ejecuta `npx supabase migration up` desde este directorio para aplicar migraciones pendientes. Reinicia el servidor web del piloto con `npm start` si estaba ejecutando una versión anterior.

El saldo visible muestra el crédito disponible con signo positivo y el importe pendiente con signo negativo. Con $300 de jornadas y $400 en abonos muestra **Saldo a favor** de +$100. Con $300 de jornadas y $200 en abonos muestra **Saldo pendiente** de −$100. Con un pago exacto se muestra **Sin saldo pendiente** y $0. Al ocultar los montos, la etiqueta vuelve a decir **Saldo**.

Desde una cuenta propietaria, registra a una persona de enfermería con tarifa de media jornada de $65 MXN. Registra una media jornada de hoy para una ficha y un abono general de $50 MXN. **Ver montos** en el saldo debe mostrar $15 MXN pendientes. **Ver montos** en los últimos abonos revela únicamente los importes de ese listado. Los dos controles se ocultan por separado al cabo de 30 segundos. Confirma la cancelación del abono y comprueba el saldo de $65 MXN y la marca de cancelación en el listado.

**Últimas jornadas registradas** muestra hasta 20 jornadas ordenadas por fecha, con ficha, enfermero y modalidad. Una fecha futura aparece como programada. Su botón **Ver montos** revela durante 30 segundos el costo registrado, lo abonado mediante pagos individuales y lo pendiente de cada jornada. Funciona de forma independiente de los demás botones de montos.

**Abonos individuales** aplica el pago a las jornadas pendientes del enfermero, de la más antigua a la más reciente y hasta la fecha indicada. Para probarlo, registra dos jornadas de $100 para el mismo enfermero y abona $150 con fecha igual o posterior a ambas. Pulsa **Ver montos** en el historial de jornadas. La primera mostrará $100 abonados y $0 pendientes. La segunda mostrará $50 abonados y $50 pendientes. Un intento de abonar $51 se rechaza y conserva el importe en el formulario. Puedes consultar los últimos 20 abonos individuales con su propio **Ver montos**. El saldo general sigue la regla de la PWA y considera los abonos generales activos.

## Pruebas

- `npm test` aplica el SQL real a PostgreSQL embebido en memoria. Las pruebas simulan la identidad que Supabase aporta a PostgreSQL y comprueban permisos de lectura y escritura, aislamiento, conflictos, revocación e integridad de pagos. También verifican el cliente HTTP con respuestas simuladas. Este comando funciona sin contenedores.
- Con el stack iniciado, configura `ACOMPANA_SUPABASE_PUBLISHABLE_KEY` con la clave publicable local y ejecuta `npm run test:auth`. El caso registra tres cuentas nuevas y prueba Auth y PostgREST, con acceso compartido, aislamiento, reintentos de abono y revocación. Deja registros ficticios en el stack local para inspección. La URL de integración está fijada a loopback.

## Alcance

Las migraciones incluyen familias, membresías, fichas, enfermería, jornadas, recibos y cancelaciones. Los miembros activos pueden editar fichas de su familia. La cuenta propietaria administra membresías y valores financieros. Las escrituras de fichas detectan una revisión obsoleta. Jornada, abono y cancelación aceptan un ID de operación reutilizable en un reintento durante la sesión. Los importes se guardan en centavos y el costo de una jornada se fija con la tarifa registrada. El saldo usa la fecha local como corte de devengo, considera todos los abonos generales activos y se puede consultar con conexión. El listado muestra los últimos 20 abonos y sus cancelaciones. El piloto todavía requiere conexión para acceder a los datos.

Para extender el piloto se mantienen separados los flujos de inventario, calendario, libros legados, recuperación de cuenta, sincronización offline y transición de respaldos. La configuración local tiene alta de cuentas habilitada para las pruebas y debe revisarse antes de cualquier despliegue. Mantén los archivos de entorno, credenciales y respaldos reales fuera de Git.
