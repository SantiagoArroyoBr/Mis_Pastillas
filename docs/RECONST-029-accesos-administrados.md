# RECONST-029 — Familias y accesos administrados

## Alcance autorizado y estado

El propietario pidió una cuenta principal con correo que administre varias familias, accesos temporales con nombre sin correo, panel exclusivo del administrador y protección contra envíos repetidos. Base previa: `05fd3f8`, desarrollo en `development`. Los cuatro documentos ajenos del árbol se conservan fuera de este lote.

Implementación local y pruebas aisladas completas. No se aplicaron las migraciones 10 y 11 al Supabase del piloto ni a Docker. No se desplegó la función privilegiada y la nube mantiene deshabilitado el panel nuevo mediante la ausencia de `connection.accessUrl`. La integración con Auth real y la entrega real de correo siguen pendientes antes de habilitar la función en Preview.

## Recorrido aislado

Desde `backend`, ejecutar `npm run sandbox` y abrir [el ensayo local](http://127.0.0.1:4180/). El servidor escucha exclusivamente en loopback, crea PostgreSQL embebido en memoria y simula Auth y entrega de correo. No accede a Supabase nube ni a Brevo; sus credenciales ficticias no sirven fuera del ensayo. Los datos desaparecen al reiniciar y están separados de `pastillas-v1`, Docker y las fichas del piloto.

Credenciales públicas de fixture: `admin@acompana.test` / `Acompana-demo-2026!`. Esta cuenta tiene dos familias. `otra@acompana.test`, con la misma contraseña ficticia, administra una familia ajena. Nunca usar datos reales ni reutilizar contraseñas personales aquí.

En Configuración aparece el Panel de administración solo para el propietario. Crear un acceso con nombre y último día. Entregar identificador y código de activación a su destinatario. En otra sesión, usar Activar acceso temporal, establecer una contraseña de al menos 12 caracteres y entrar con el identificador generado. El código vence en 15 minutos, es de un solo uso y se almacena únicamente como SHA-256 en el esquema privado. La interfaz permite ocultarlo y lo descarta al cambiar de familia o sesión.

Los accesos conservan rol cuidador: fichas, citas e inventario; no administración ni valores financieros. No se introduce un rol nuevo de solo lectura en este lote. Los nombres pueden repetirse; la identidad es un UUID estable. Se conserva auditoría de creación, activación, recuperación, renovación y revocación. El vencimiento se interpreta como final del día en la zona del navegador administrador y se guarda como instante UTC; el criterio general de zona familiar sigue pendiente.

## Controles de servidor

La cuenta principal puede crear varias familias. Las identidades temporales solo pertenecen a su familia y no pueden crear otras ni aceptar invitaciones. Las reglas RLS y las funciones de escritura comprueban membresía, estado, revocación y vencimiento. No dependen de que el navegador oculte botones.

La recuperación pone el acceso en pendiente e invalida sus operaciones de datos. Al reactivarlo, el JWT debe pertenecer a una sesión de `auth.sessions` creada después del corte de recuperación. Refrescar un JWT de una sesión antigua no permite recuperar datos. Revocar durante una provisión impide completar esa activación; un claim caducado se puede reemplazar sin conceder acceso al anterior. Los registros y referencias históricas permanecen.

Crear, recuperar, renovar y revocar accesos exige una sesión Auth del propietario creada en los últimos 15 minutos. Un JWT refrescado no sustituye un inicio de sesión reciente. Las revisiones rechazan cambios obsoletos. La revocación legada también cancela la activación de un temporal.

`access-service.mjs` se ejecuta solo en servidor. Verifica el JWT administrativo con Auth y delega autorización familiar a SQL. La activación pública usa un código de alta entropía, nunca un nombre o un correo aportado para seleccionar la cuenta. La identidad Auth sintética queda vinculada al ID de acceso; no se envían mensajes a esa dirección. La clave de servicio se obtiene del entorno de la función y no se incluye en el frontend. El cuerpo está limitado a 8 KiB y CORS a un origen configurado.

La provisión entre Auth y SQL no es una transacción distribuida. Ante fallos, el acceso permanece pendiente; pueden quedar identidades Auth sin acceso familiar. El ID determinista permite reintento y la expiración del claim permite recuperación administrativa. Debe probarse esta compensación con GoTrue real antes de desplegar. El ensayo simula Auth; no prueba su implementación, sus correos, su disponibilidad ni el empaquetado remoto de la función.

## Frecuencia de solicitudes

Los contadores de la migración 11 están en PostgreSQL y se comparten entre instancias. Una reserva rechazada revierte también la reserva global, para que los reintentos denegados no gasten el presupuesto de envíos.

| Operación | Límite del nuevo servicio |
| --- | --- |
| Correo por dirección, entre confirmación/recuperación/reenvío | 60 segundos; 3 por hora; 5 por día |
| Correo global | 100 por hora; 250 por día, dejando margen frente al cupo de Brevo |
| Activación por hash | 20 intentos por hora; 50 por día |
| Activación global | 120 intentos por hora; 1,000 por día |
| Administración por actor y familia en gateway | 2 segundos; 30 por hora; 100 por día |
| Creación directa por familia en SQL | 2 segundos; 30 por hora; 100 por día |
| Recuperación directa por acceso en SQL | 60 segundos; 3 por hora; 5 por día |

Las ventanas son móviles a partir de su comienzo, no reinicios a medianoche. Los contadores por dirección solo guardan un hash. Los códigos temporales no consumen correo. El gateway admite confirmación/recuperación/reenvío; la interfaz completa de recuperación de la cuenta principal queda pendiente.

Estos límites están probados en el entorno aislado. No protegen aún los endpoints públicos directos de Auth de la nube. Antes del despliegue, configurar CAPTCHA y límites nativos de Auth, revisar el registro público y el encaminamiento de todos los envíos. Ocultar un botón o usar CORS no evita llamadas directas a Supabase. No anunciar el cupo diario del gateway como protección global hasta cerrar ese recorrido.

## Brevo real

Con autorización y verificación de identidad del propietario se creó una clave SMTP exclusiva para el piloto y se guardó en Supabase. Configuración persistente comprobada: SMTP personalizado habilitado, host `smtp-relay.brevo.com`, puerto 587, nombre Acompaña y contraseña almacenada oculta. No se guardaron clave, usuario SMTP ni correo personal en código, pruebas o este informe.

Brevo mostraba 300 envíos disponibles y el remitente verificado, con advertencia por dominio de correo gratuito. No se compró dominio ni plan. Brevo documenta una sustitución temporal del remitente sin dominio autenticado; la entrega y el aspecto final deben comprobarse. La pantalla de generación advierte vencimiento por 90 días de inactividad de la clave, además de su fecha de expiración: revisar antes de depender de esta vía para recuperación a largo plazo.

El guardado SMTP no demuestra entrega. No se enviaron mensajes a contactos ni se probó un restablecimiento real en este lote. Faltan prueba controlada de recepción, URL de retorno y recuperación principal completa. [SMTP Brevo](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [remitentes](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Evidencia y siguiente despliegue

`npm test`: 38/38. Regresión conjunta PWA: 102/102 en Edge. Cobertura nueva: dos familias por propietario, separación de propietario ajeno, temporal sin capacidad administrativa, identidad personal/ajena rechazada, vencimiento, recuperación, JWT antiguo y refrescado, sesión administrativa reciente, activación única, interrupción de provisión, revisión obsoleta, revocación legada, cuotas SQL y gateway, presupuesto global sin gasto por rechazo, ausencia de correos en el ciclo temporal y respuesta UI fuera de orden. Compilación estática: 17 recursos públicos, con rechazo de archivos inesperados en salida.

Recorrido de navegador: entrada con fixture, dos familias visibles, panel exclusivo, alta por nombre y vencimiento, listado pendiente y ocultación del código. Capturas locales no versionadas: `backend/supabase/.temp/admin-panel-sandbox.jpg` y `brevo-smtp-configured.jpg`. No confundir el recorrido de ensayo con una integración real de Auth.

Para habilitar en Preview: exportación previa y restauración comprobada de los datos afectados; aplicar solo las migraciones nuevas sobre la base de nueve existente; desplegar y probar `family-access` en un proyecto de pruebas, con origen explícito y credenciales de servidor; verificar Auth real, recuperación y correo, cerrar evasión de cuotas por endpoints directos, y finalmente configurar `accessUrl` y publicar. La función acepta activación sin JWT de plataforma (`verify_jwt=false`), pero valida dentro del handler el JWT de cada acción administrativa y las reglas SQL; esa configuración no debe reutilizarse para otros endpoints.
