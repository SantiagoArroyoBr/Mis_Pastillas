# Seguridad y privacidad

Acompaña puede contener información familiar sensible. No publiques datos de pacientes, copias JSON, tokens, códigos temporales ni claves privadas en issues, pull requests o capturas.

Si detectas una vulnerabilidad, utiliza **Report a vulnerability** en la pestaña Security de GitHub si está habilitada. Si no está disponible, contacta al propietario por un canal privado ya acordado, sin crear un issue público con los detalles sensibles. Este documento no afirma que el canal privado de GitHub esté activado.

Las claves publicables de Supabase pueden aparecer en el frontend; la protección de los datos depende de Auth, RLS y las funciones autorizadas. Las claves de servicio y de Brevo deben permanecer exclusivamente en los secretos del servidor.

La auditoría más reciente y sus límites están en [QA-009](docs/auditorias/QA-009-calidad-integral.md). Los resultados de las pruebas no constituyen una garantía de ausencia de vulnerabilidades.
