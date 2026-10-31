# Acompaña

**Gestión del cuidado familiar** · *Cuidar también es organizar.*

Acompaña es una aplicación web progresiva para organizar información del cuidado familiar. El repositorio contiene una aplicación frontend que funciona con datos guardados localmente en cada dispositivo. Comprueba el código antes de considerar disponible cualquier función descrita como objetivo o propuesta.

- Aplicación: https://pastillas-1.vercel.app/
- Repositorio: https://github.com/SantiagoArroyoBr/Mis_Pastillas
- Código de la aplicación: `index.html`, `styles.css`, `app.js`, `sw.js` y `manifest.json`.

## Documentación del proyecto

- [Plan de desarrollo](PLAN_DESARROLLO.md): fuente única de tareas, objetivos, dependencias, prioridades y estados.
- [Arquitectura](ARQUITECTURA.md): estado comprobado del sistema, reglas técnicas permanentes y propuestas diferenciadas.
- [Inventario funcional AUD-001](docs/auditorias/AUD-001-inventario-funcional.md): funcionalidades, reglas observadas, cobertura y vacíos comprobados en el código.
- [Propuesta DAT-001](docs/arquitectura/DAT-001-modelo-datos-y-acceso.md): modelo de familias, cuentas y registros, aislamiento, compatibilidad y estrategia de migración futura; no implementada.
- [Evaluación DAT-002](docs/arquitectura/DAT-002-evaluacion-backend-auth-aislamiento.md): compara alternativas de backend/Auth, controles, costos y condiciones; recomienda mantener por ahora la PWA local.
- [Diseño DAT-003](docs/arquitectura/DAT-003-respaldo-restauracion-migracion.md): validación de exportación/restauración sintética completada; no sustituye la comprobación privada del respaldo familiar previa a cualquier migración.
- [Matriz CAL-001](docs/arquitectura/CAL-001-matriz-pruebas-aislamiento.md): casos futuros de respaldo y aislamiento; ejecución bloqueada hasta que se adopten backend, roles y staging.
- [Evaluación PWA-001](docs/arquitectura/PWA-001-almacenamiento-y-sincronizacion-offline.md): analiza IndexedDB, colas, reintentos, idempotencia y conflictos sin implementar cambios.
- [Evaluación PWA-002](docs/arquitectura/PWA-002-evaluacion-notificaciones-push.md): compara avisos actuales y push remoto; no implementado.
- [Guía inicial de instalación y uso](docs/GUIA_INSTALACION_USO.md): explica almacenamiento local, límites offline y cuidado de respaldos; DOC-002 sigue como guía inicial hasta verificar documentalmente el proveedor/proyecto, la rama y el commit que publica producción, la comprobación posterior y la ruta de reversión; no se requiere desplegar para esta comprobación.
- [Evaluación DAT-004](docs/arquitectura/DAT-004-evaluacion-auditoria.md): propone alcance y controles para una bitácora administrativa futura; no implementada.
- [Historial de cambios](HISTORIAL_CAMBIOS.md): registro cronológico con archivos, validaciones, limitaciones y referencias de Git.

## Empezar

Para entender qué está implementado y qué queda pendiente, consulta primero el [plan](PLAN_DESARROLLO.md) y la [arquitectura vigente](ARQUITECTURA.md).

## Pruebas de persistencia

La suite de `tests/persistence.spec.js` usa el ejecutor integrado de Node.js y automatiza un navegador Chromium, Chrome o Microsoft Edge mediante el protocolo DevTools. No requiere `npm install`: el repositorio no tiene `package.json` ni dependencias npm para estas pruebas.

Requisitos:

- Node.js 22 o posterior (se requiere `node:test`, `fetch` y `WebSocket` integrados).
- Google Chrome, Chromium o Microsoft Edge instalado. La prueba busca ubicaciones habituales de esos navegadores en Linux y Windows.
- Si el navegador está instalado en una ubicación distinta, definir `CHROME_BIN` con la ruta completa a su ejecutable.
- Permiso del entorno para abrir un servidor HTTP y una conexión local de depuración en `127.0.0.1`.

Desde la raíz del repositorio, ejecutar:

```sh
node --test tests/persistence.spec.js
```

En PowerShell, si hace falta indicar la ruta del navegador:

```powershell
$env:CHROME_BIN = 'C:\ruta\al\navegador.exe'
node --test tests/persistence.spec.js
```

La suite crea un perfil temporal aislado, usa registros ficticios y borra sus archivos temporales al terminar. Si falla al conectar con `127.0.0.1`, permitir conexiones locales para el proceso de Node.js y volver a ejecutar; un entorno que deniega esa conexión no puede ejecutar realmente estas pruebas.

## Criterios permanentes

La rama `development` es la rama de trabajo. `main` es producción y no se modifica como parte del desarrollo ordinario. Los datos existentes, la clave `pastillas-v1`, la exportación y restauración JSON, la PWA y el funcionamiento offline se preservan; cualquier tarea que los afecte debe definir compatibilidad, respaldo, restauración y validación antes de implementarse. Utilizar datos ficticios en pruebas y documentación compartida.

El contenido de este README es una guía de entrada. El plan, la arquitectura y el historial enlazados arriba son las referencias centrales para sus respectivos temas.
