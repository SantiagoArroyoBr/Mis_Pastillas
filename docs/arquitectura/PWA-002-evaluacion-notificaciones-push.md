# PWA-002 — Evaluación de notificaciones push de reposición

**Estado:** evaluación documental completada; push no implementado.  
**Recomendación:** mantener los avisos locales actuales mientras la aplicación no tenga backend ni requisito de aviso con la app cerrada.

## 1. Hechos actuales

AUD-001 encontró avisos generados al abrir/renderizar la app cuando el permiso del navegador ya está concedido. Dependen de que la aplicación se abra; no hay push, envío en segundo plano, programación de toma ni recordatorios cuando está cerrada. Esta evaluación no cambia permisos ni solicita consentimiento.

Las notificaciones requieren contexto seguro y permiso concedido por la persona. La solicitud debe originarse en una acción explícita; el soporte de Notifications API no es uniforme. En móvil conviene usar notificación persistente mediante service worker en vez del constructor de página. [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [guía de permisos y móvil](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API).

Push permite que un servidor envíe datos al navegador aunque la página no esté abierta, pero requiere una suscripción vinculada al service worker, endpoint y claves, además de un emisor servidor con entrega cifrada. No se resuelve solo con `sw.js`; implica almacenar y proteger suscripciones, caducidad/revocación, costos y operación de backend. [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [suscripción](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe), [evento push](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event).

## 2. Riesgos y requisitos previos

- Acordar qué evento justifica aviso, su frecuencia, horario silencioso, zona horaria, canal de baja y prevención de duplicados.
- Definir privacidad: no incluir diagnósticos, nombres, medicamento o dosis en pantalla bloqueada ni en payload/logs sin evaluación específica. Preferir mensaje genérico que abra la app.
- Dar consentimiento contextual y revocable; manejar permiso denegado, suspendido, token expirado, cambio de dispositivo y baja de cuenta.
- Un servicio remoto sería necesario para disparar push cuando el cliente esté cerrado. Eso reabre DAT-002, DAT-003 y CAL-001; no enviar datos familiares mientras backend, autorización, retención, costos, soporte y recuperación no estén definidos.
- Tratar endpoint y material de suscripción como secreto operativo; restringir acceso, rotar, borrar al desvincular y no subirlos a Git.
- Establecer claves estables de deduplicación y vencimiento para que una repetición del proveedor no genere avisos duplicados o viejos.
- Verificar soporte por navegador, sistema y modo instalado con una matriz vigente antes de seleccionar alcance. La capacidad web disponible varía por plataforma y puede depender de permiso, HTTPS y estado del service worker.

## 3. Alternativas

| Alternativa | Beneficio | Límite/costo | Adecuación actual |
|---|---|---|---|
| Mantener avisos locales al abrir | Sin servicio nuevo ni suscripciones | No avisa con la app cerrada; depende de apertura/renderizado | Recomendada ahora |
| Notificación local/persistente mientras el cliente trabaja | Puede mejorar presentación en móviles compatibles | Permisos/plataformas; no asegura ejecución futura ni aviso cerrado | Considerar solo tras requisito y compatibilidad comprobados |
| Push remoto desde servidor | Puede notificar con la app cerrada | Requiere backend, suscripción, seguridad, operación, deduplicación, permisos y costos | No justificado ni aprobado actualmente |

## 4. Validación futura

En staging y con clientes/datos sintéticos comprobar permiso concedido/denegado/revocado, app abierta/cerrada, modo offline, expiración, duplicado, mensajes antiguos, zona horaria, cancelación, endpoint inválido, ausencia de datos sensibles en pantalla bloqueada y borrado de suscripción. Probar en cada navegador/dispositivo que el producto decida soportar. No usar suscripciones de usuarios reales.

Las fuentes web fueron consultadas el 2026-10-31; la matriz y compatibilidad deben revisarse nuevamente al iniciar implementación porque soporte y políticas del navegador pueden cambiar.
