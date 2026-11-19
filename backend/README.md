# Estado vigente · Acompaña conectada

**Lote COORD-CUIDADO-001, 19/11/2026:** Supabase actualizado con las migraciones15/16 tras respaldo/restauración privada verificada. Añade alta segura de enfermería, catálogos completos por páginas, Hoy, pendientes con responsable y bitácora. Copia conectada v2 compatible con v1; al restaurar se dejan responsables sin asignar y las autorías operativas se atribuyen al recuperador. [Pruebas, autorización y estado de publicación](../docs/COORD-CUIDADO-001-hoy-pendientes-bitacora.md). Las referencias anteriores a14 migraciones describen el lote previo.

Actualizado el 18/11/2026. Supabase tiene instaladas las migraciones 1–16. family-access y auth-email están desplegadas; el correo usa el hook firmado hacia Brevo. La barrera de acceso de Vercel está retirada. La recuperación principal se comprobó en iPhone. El código del lote [QA-012](../docs/QA-012-cierre-calidad-conectada.md) incorpora las capacidades siguientes; su publicación se registra por separado en ese informe.

La sesión se conserva por pestaña y permite recordar un dispositivo personal; renueva su autorización y borra tokens al salir. La consulta offline es opcional, conserva únicamente lecturas previas y exige una sesión no vencida. Pagos administrativos, accesos temporales y escrituras necesitan conexión. Una revocación remota no se puede comprobar mientras el dispositivo está desconectado.

En **Respaldo**, la cuenta propietaria exporta un JSON privado de la familia. Seleccionar el archivo permite revisar conteos y confirmar la restauración en **una familia nueva**: la original queda intacta. Las cuentas, contraseñas y permisos no se restauran; los registros administrativos se conservan como procedencia y las autorías operativas se atribuyen a quien recupera. El formato conectado `acompana-family` es distinto del respaldo local `pastillas-v1`; este último conserva su diagnóstico y restauración en la PWA original.

Los historiales de citas, jornadas, abonos y movimientos de inventario empiezan en 20 filas y permiten **Cargar más**. Los montos se vuelven a ocultar al actualizar el historial. No repetir el bootstrap SQL sobre una base existente ni tomar los pendientes históricos siguientes como el estado actual. Las pruebas de sandbox simulan Auth/correo y no sustituyen PostgREST real. `npm run test:ui` ejecuta el recorrido de navegador con datos desechables y necesita Chrome/Edge disponible o `CHROME_BIN`.

[Volver a la portada](../README.md) · [Mapa documental](../docs/README.md)

---

# Acompaña · Piloto local de datos y cuentas

El piloto corre en `127.0.0.1` y tiene su propio servidor, origen y configuración. Úsalo con cuentas y datos ficticios. La PWA de referencia conserva su propio servidor, respaldo y clave `pastillas-v1`. `.vercelignore` permite los archivos públicos del piloto y excluye SQL, pruebas, herramientas y entorno. [Exclusiones de Vercel](https://vercel.com/docs/deployments/vercel-ignore).

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

**Nueva cita médica** y **Editar cita** incluyen **Médico o especialista**, separado de la clínica o consultorio. La agenda y el detalle del calendario muestran ambos datos.

**Filtrar citas por ficha** aplica la selección a las tres listas. Las fichas archivadas se pueden seleccionar para consultar su historial, y las fichas del mismo nombre muestran una referencia breve en el selector. Las citas del día llevan la etiqueta **Hoy**. El filtro se conserva al pulsar **Actualizar fichas** dentro de la misma familia.

En **Inventario**, da de alta una medicina o insumo para una ficha activa y agrega las pautas necesarias. Las frecuencias disponibles son diaria, días de la semana e intervalo. Las existencias se calculan con el mismo módulo de la PWA y se actualizan al guardar y al pulsar **Actualizar fichas**. Registra una compra con su cantidad y, si aplica, el precio total y la tienda. **Últimas compras** muestra hasta 20 movimientos. Su botón **Ver montos** revela los precios por 30 segundos y es independiente de Pagos.

**Agregar insumo** activa **Controlar por conteo manual** al abrir. Indica las piezas disponibles, corrige el conteo al editar o registra una compra para sumar unidades. El calendario omite proyecciones para estos insumos. Si puedes estimar su uso, desmarca el conteo manual y captura una frecuencia. Las medicinas siguen usando pautas. Los importes se registran al capturar la compra o cotización.

Los abonos generales e individuales admiten un **Concepto** opcional. El historial usa el concepto, la fecha y el importe según el control de privacidad. La referencia interna se conserva para conciliar y cancelar el movimiento correcto.

**Filtrar existencias y compras por ficha** aplica la selección a ambos listados, incluidas las fichas archivadas. En una ficha activa se distingue el stock agotado del que aún tiene unidades, pero no alcanza para la siguiente toma. Cuando hay existencias, el aviso de reposición usa la proyección de la PWA. Las fichas archivadas mantienen su consulta sin avisos de reposición.

En cada artículo, **Ver pautas** muestra la cantidad y las horas de cada pauta, su frecuencia y la fecha de inicio cuando es por intervalo. Para fichas activas también muestra la última toma o uso completo proyectado cuando el cálculo dispone de ese dato. El detalle permanece abierto al actualizar la misma familia.

Auth utiliza correo y contraseña con confirmación externa desactivada únicamente en este stack local. La sesión vive en memoria durante la prueba. La recarga, el cierre o la expiración requieren volver a iniciar sesión. Las invitaciones son códigos revocables de un solo uso, caducan en siete días y se canjean desde la cuenta con el correo indicado. Antes de un piloto externo, habilitar y comprobar la confirmación de correo, la recuperación de cuenta y la política de sesión.

Si el stack ya está iniciado, ejecuta `npx supabase migration up` desde este directorio para aplicar migraciones pendientes. Reinicia el servidor web del piloto con `npm start` si estaba ejecutando una versión anterior.

El saldo visible muestra el crédito disponible con signo positivo y el importe pendiente con signo negativo. Con $300 de jornadas y $400 en abonos muestra **Saldo a favor** de +$100. Con $300 de jornadas y $200 en abonos muestra **Saldo pendiente** de −$100. Con un pago exacto se muestra **Sin saldo pendiente** y $0. Al ocultar los montos, la etiqueta vuelve a decir **Saldo**.

Desde una cuenta propietaria, registra a una persona de enfermería con tarifa de media jornada de $65 MXN. Registra una media jornada de hoy para una ficha y un abono general de $50 MXN. **Ver montos** en el saldo debe mostrar $15 MXN pendientes. **Ver montos** en los últimos abonos revela únicamente los importes de ese listado. Los dos controles se ocultan por separado al cabo de 30 segundos. Confirma la cancelación del abono y comprueba el saldo de $65 MXN y la marca de cancelación en el listado.

**Últimas jornadas registradas** muestra hasta 20 jornadas ordenadas por fecha, con ficha, enfermero y modalidad. Una fecha futura aparece como programada. Su botón **Ver montos** revela durante 30 segundos el costo registrado, lo abonado mediante pagos individuales y lo pendiente de cada jornada. Funciona de forma independiente de los demás botones de montos.

**Abonos individuales** aplica el pago a las jornadas pendientes del enfermero, de la más antigua a la más reciente y hasta la fecha indicada. Para probarlo, registra dos jornadas de $100 para el mismo enfermero y abona $150 con fecha igual o posterior a ambas. Pulsa **Ver montos** en el historial de jornadas. La primera mostrará $100 abonados y $0 pendientes. La segunda mostrará $50 abonados y $50 pendientes. Un intento de abonar $51 se rechaza y conserva el importe en el formulario. Puedes consultar los últimos 20 abonos individuales con su propio **Ver montos**. El saldo general sigue la regla de la PWA y considera los abonos generales activos.

## Recorrido del esqueleto local

Usa una cuenta y una familia ficticias. El piloto en el puerto 4173 comparte la paleta, la fuente Nunito y los iconos de la PWA. El menú muestra un apartado a la vez y **Inicio** cuenta las fichas activas y archivadas de la familia seleccionada. En **Configuración** puedes cambiar o crear una familia, gestionar invitaciones según tu rol y cerrar sesión. Si tu cuenta todavía no pertenece a una familia, se abre Configuración. **Actualizar fichas** está disponible desde cualquier apartado con una familia activa.

El **Calendario del cuidado** de Inicio resume cuántas citas, turnos, reposiciones y agotamientos estimados hay por día. En un día con más de nueve eventos de un tipo aparece un signo «+» y el detalle muestra los registros. Selecciona una ficha o consulta todas. Al abrir un día puedes ver la hora, el lugar y las notas de una cita, la modalidad de los turnos y las existencias de los artículos al momento de la consulta. Los turnos se muestran según los permisos vigentes. Las proyecciones corresponden a fichas activas y usan el cálculo de la PWA en la zona horaria del navegador.

| Sección | Qué revisar |
| --- | --- |
| Cuenta y fichas | Inicia sesión, crea dos fichas, invita a una cuenta cuidadora y verifica que archivar y reactivar conserva el historial. |
| Citas | Registra una cita, cambia su fecha, verifica su lista y filtra por ficha. Al editar desde dos cuentas, una revisión obsoleta conserva el borrador. |
| Inventario | Registra un artículo con dos pautas, consulta la proyección, compra unidades, edita su nombre o pauta y registra una cotización. La cotización deja las existencias intactas. Los precios se ocultan al inicio. |
| Enfermería y pagos | Registra una jornada y un abono individual. Comprueba costo, abonado y pendiente. Registra y cancela un abono general y revisa el signo del saldo. |
| Respaldo | Selecciona un JSON ficticio válido y uno inválido. El diagnóstico usa el validador de la PWA, muestra conteos y procesa el archivo en el navegador. |

Este recorrido cubre el esqueleto local con conexión. La importación completa, el trabajo sin conexión, la sincronización entre teléfonos, los recordatorios y la reconstrucción visual de los HUDs tienen validaciones y alcance pendientes.

Desde el detalle del calendario, **Abrir cita** muestra la cita concreta y **Abrir artículo** preselecciona ese registro en el formulario de compra. Si hay un borrador de compra de un artículo distinto, el piloto pide confirmación antes de descartarlo.

## Prueba móvil propuesta

El piloto local usa una URL de Supabase fijada a loopback y cuentas ficticias. Para probar el flujo compartido desde iPhone, la propuesta es publicar un frontend de prueba separado en Vercel, conectarlo por HTTPS a un proyecto de Supabase de pruebas con las migraciones y configurar Auth para cuentas de acceso controlado. El navegador usa la clave publicable y los permisos por familia. [Claves de API de Supabase](https://supabase.com/docs/guides/getting-started/api-keys) · [Configuración de Auth](https://supabase.com/docs/guides/auth/general-configuration).

La prueba de móviles usaría dos cuentas y una familia ficticia. Verificar lectura y edición compartidas, permisos de una segunda familia, recuperación de cuenta y restauración de un respaldo de prueba. La Preview propuesta conserva su base separada de producción.

## Pruebas

- `npm test` aplica el SQL real a PostgreSQL embebido en memoria. Las pruebas simulan la identidad que Supabase aporta a PostgreSQL y comprueban permisos de lectura y escritura, aislamiento, conflictos, revocación e integridad de pagos. También verifican el cliente HTTP con respuestas simuladas. Este comando funciona sin contenedores.
- Con el stack iniciado, configura `ACOMPANA_SUPABASE_PUBLISHABLE_KEY` con la clave publicable local y ejecuta `npm run test:auth`. El caso registra tres cuentas nuevas y prueba Auth y PostgREST, con acceso compartido, aislamiento, reintentos de abono y revocación. Deja registros ficticios en el stack local para inspección. La URL de integración está fijada a loopback.

## Alcance

El modelo local de inventario conserva una cantidad medida y su instante de referencia por artículo, junto con las pautas independientes de la PWA. Las compras guardan cantidad, fecha, tienda y precio opcional en la misma transacción que actualiza el stock. El piloto calcula el remanente con `AcompanaDomain.calc`, en la zona horaria del navegador. La revisión protege escrituras simultáneas de edición y compra. Las cotizaciones guardan precio y cantidad de referencia sin aplicar stock. El criterio de zona horaria compartida sigue pendiente.

Las migraciones incluyen familias, membresías, fichas, enfermería, jornadas, recibos y cancelaciones. Los miembros activos pueden editar fichas de su familia. La cuenta propietaria administra membresías y valores financieros. Las escrituras de fichas detectan una revisión obsoleta. Jornada, abono y cancelación aceptan un ID de operación reutilizable en un reintento durante la sesión. Los importes se guardan en centavos y el costo de una jornada se fija con la tarifa registrada. El saldo usa la fecha local como corte de devengo, considera todos los abonos generales activos y se puede consultar con conexión. El listado muestra los últimos 20 abonos y sus cancelaciones. El piloto todavía requiere conexión para acceder a los datos.

Para extender el piloto se mantienen separados los flujos de inventario, calendario, libros legados, recuperación de cuenta, sincronización offline y transición de respaldos. La configuración local tiene alta de cuentas habilitada para las pruebas y debe revisarse antes de cualquier despliegue. Mantén los archivos de entorno, credenciales y respaldos reales fuera de Git.

## Conexión de pruebas en la nube — 2026-11-17

En el formulario de acceso selecciona **Supabase de pruebas en la nube**. La URL y la clave publicable del proyecto `hpjqzncfxomxkhyavbkx` se configuran en `connection-config.mjs`; el selector rellena la clave. El cliente acepta únicamente los dos destinos configurados y mantiene el token en memoria. Usa un correo que puedas confirmar y datos ficticios. La confirmación de correo permanece activada: después del registro, confirma el mensaje recibido y vuelve a iniciar sesión. La recuperación de contraseña y la redirección definitiva de confirmación siguen pendientes antes de una Preview móvil.

El proyecto nuevo se inicializó mediante SQL Editor con las nueve migraciones del repositorio en una transacción. La comprobación remota devolvió **15 tablas, todas con RLS**. La API denegó lectura anónima de `families` con código `42501`. No se importaron fichas locales ni respaldos reales.

`npm run schema:cloud` genera `supabase/.temp/cloud-bootstrap.sql`, excluido de Git. Es solo para inicializar un proyecto vacío una vez; no reemplaza el seguimiento incremental de migraciones futuras. Conservar esta fecha y el último archivo aplicado: `20261116000900_manual_supply_stock.sql`. Para futuras actualizaciones usar migraciones incrementales y respaldo previo, sin repetir el archivo completo.

Estado: esquema remoto instalado y selector comprobado; acceso con una cuenta confirmada, pruebas de dos cuentas en la nube, recuperación y publicación separada en Vercel pendientes. La PWA actual y `pastillas-v1` permanecen independientes.

Diagnóstico Auth (2026-11-17): se observaron respuestas 429 `over_email_send_rate_limit` al registrar y 400 `invalid_credentials` al entrar. El cliente interpreta `error_code` y `code`, conserva mensajes seguros y no muestra cuerpos remotos. Ante límite de correo, evitar solicitudes repetidas; revisar un correo de confirmación previo o esperar al restablecimiento del límite. La configuración de correo transaccional queda pendiente antes del uso continuado. La confirmación permanece habilitada.

## Despliegue estático del piloto

Proyecto Vercel separado de `pastillas-1`, repositorio compartido, rama `development`. Raíz `backend`; habilitar inclusión de archivos fuera de la raíz durante compilación. `vercel.json` en backend fija compilación `node build-preview.mjs`, sin instalación de dependencias, y salida `supabase/.temp/preview`. No cambiar la raíz del proyecto de producción existente. El artefacto usa solo Supabase nube y necesita conexión; no incluye service worker ni sincronización offline. La clave incluida es publicable, los tokens permanecen en memoria y RLS controla los datos.

Preview verificada (commit `428686f`): [piloto de development](https://acompana-piloto-git-development-dinamita20.vercel.app/). Proyecto separado `acompana-piloto`, entorno Preview. La protección de Vercel está activa: entrar en Vercel primero y luego usar la cuenta de Acompaña. Comprobación visual del formulario HTTPS realizada; recorrido autenticado y dispositivo iPhone pendientes.

## Ensayo de administración y accesos temporales

`npm run sandbox` abre un servidor independiente en `http://127.0.0.1:4180/`. Usa PostgreSQL embebido en memoria y simula Auth y el correo; nunca accede a Docker ni a Supabase/Brevo reales. Cuenta ficticia `admin@acompana.test` / `Acompana-demo-2026!`, con dos familias. En Configuración aparece el Panel de administración. Los datos desaparecen al reiniciar. No introducir datos ni contraseñas reales. [Modelo, cobertura y límites](../docs/RECONST-029-accesos-administrados.md).

Las migraciones 10 y 11 y la función `family-access` están preparadas localmente; no están aplicadas ni desplegadas en la nube. `accessUrl` ausente mantiene deshabilitada la función en el piloto actual. El gateway usa credenciales privadas de servidor y comprueba Auth/SQL; no copiar claves privilegiadas al frontend. Los límites por dirección y presupuesto diario solo protegen solicitudes que pasan por él: cerrar los endpoints directos mediante controles nativos y CAPTCHA antes de habilitar.

Brevo SMTP ya se guardó en el Supabase de pruebas con clave exclusiva. Persistencia verificada; entrega real y recuperación de cuenta principal pendientes. El proveedor integrado de Supabase ha sido reemplazado para ese proyecto; no se compró un dominio ni se alteró la confirmación de correo. El remitente gratuito sigue sujeto a advertencias de entregabilidad de Brevo.
