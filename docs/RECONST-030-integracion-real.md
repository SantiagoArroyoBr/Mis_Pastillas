# RECONST-030 · Integración real y acceso móvil

Fecha: 17/11/2026. Base de código: `8328963`. Este informe actualiza los pendientes de integración real del [lote anterior](RECONST-029-accesos-administrados.md).

## Implementación y autorización

El propietario autorizó conectar los servicios reales, aplicar las migraciones respaldadas, guardar una clave restringida de Brevo únicamente en Supabase y enviar una prueba controlada de recuperación. También confirmó específicamente quitar Require Log In solo del proyecto Vercel `acompana-piloto`. `main` y el proyecto `pastillas-1` no se modificaron.

Antes de aplicar las migraciones 10–12 se exportaron las tablas afectadas y se comprobó su restauración en PostgreSQL desechable. El respaldo privado permanece fuera de Git y de la salida pública. Las migraciones se aplicaron al proyecto real; las funciones `family-access` y `auth-email` quedaron desplegadas. La validación JWT administrativa se realiza dentro del handler y SQL. La función de correo verifica firma HMAC y aplica cuotas e idempotencia también a las solicitudes nativas de Auth.

La clave API de Brevo tiene permisos transaccionales y está guardada como secreto de Supabase. No se incorporaron claves privadas, códigos, contraseñas, tokens ni direcciones personales a este informe o al repositorio. La URL de retorno y el origen autorizado apuntan a la candidata de development. El hook HTTPS es la vía activa de correo; la configuración SMTP previa no demuestra ni sustituye esa ruta.

## Evidencia real

- Auth real: el propietario inició sesión y utilizó el panel administrativo.
- Una familia vacía de verificación y un acceso ficticio permitieron comprobar activación, inicio de sesión, lectura de una sola familia, aislamiento de otra familia y rechazo de administración. Tras revocarlo desde el panel, el JWT existente perdió inmediatamente la lectura de familias. El acceso queda revocado para conservar trazabilidad; la familia de verificación sigue vacía.
- Brevo confirmó entrega. La primera solicitud devolvió error aunque el proveedor aceptó el correo: se corrigió el tratamiento del acuse SQL para que un correo aceptado no produzca un fallo de Auth ni un reenvío. La prueba nueva reproduce ese caso. Se conservan las cuotas y la misma clave de idempotencia ante entrega incierta.
- Tras quitar la barrera de Vercel, el propietario solicitó el enlace y confirmó que el restablecimiento funcionó desde su iPhone. Esta es evidencia manual declarada, sin inspección de su contraseña ni medición de versión de iOS.
- Comprobación HTTP sin cookies: portada 200; servicio privado, `.env` y ruta del respaldo 404. Las fichas siguen requiriendo Auth y permisos de Supabase.

`backend/verify-live-access.mjs` reproduce el recorrido temporal con autorización explícita, consume y elimina el archivo privado de activación y conserva únicamente resultados booleanos. No envía correos.

## Mejora del inicio de sesión

Por petición del propietario se conserva la paleta y se presenta una tarjeta con bienvenida, selector Entrar/Crear cuenta, una sola acción de envío, contraseña con Mostrar/Ocultar y ayudas desplegables de recuperación y código temporal. Crear cuenta usa correo, autocompletado de contraseña nueva y mínimo de 12 caracteres. Entrar conserva los identificadores temporales y el autocompletado de contraseña existente. Cambiar de modo vacía la contraseña y vuelve a ocultarla. Los enlaces de recuperación abren automáticamente su apartado.

Revisión visual en navegador integrado a 390 px y comprobación a 320 px sin desbordamiento horizontal. Se verificaron selección de registro, requisitos del campo, retorno a entrada, mostrar/ocultar y apertura de recuperación sin enviar solicitudes ni introducir credenciales reales. Controles táctiles de al menos 44 px y campos de 16 px. Captura local no versionada: `backend/supabase/.temp/auth-mobile-refined.jpg`.

## Pruebas, publicación y límites

- Suite conectada: **54/54**, incluidas SQL, cliente, permisos, acceso temporal, administración, recuperación y correo.
- Regresión conjunta de pagos y persistencia PWA: **102/102**.
- Compilación estática: **18 archivos públicos**. Sintaxis JavaScript y `git diff --check` correctos.
- La publicación previa `8328963` estaba comprobada en development. El nuevo lote de interfaz y acuse de correo se registra por separado en el historial al comprobar su despliegue.

El registro de entrega y la recuperación real están comprobados. No equivale a una auditoría externa ni garantiza entregabilidad futura con un remitente gratuito. Los cambios de correo de cuenta permanecen rechazados por el hook; no habilitar esa función sin implementar y probar ambos destinatarios. La recuperación temporal se cubre en las suites, pero no se repitió con una segunda cuenta real. No se enviaron correos adicionales automáticamente.

La candidata conectada requiere conexión. La equivalencia offline completa, la transición de `pastillas-v1` a la nube y el corte de producción siguen siendo trabajos separados. No se ha realizado un merge a main ni se han migrado los datos locales de usuarios.
