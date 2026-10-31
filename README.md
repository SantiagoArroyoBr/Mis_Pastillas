# Acompaña

**Gestión del cuidado familiar** · *Cuidar también es organizar.*

Acompaña es una aplicación web progresiva para organizar información del cuidado familiar. El repositorio contiene una aplicación frontend que funciona con datos guardados localmente en cada dispositivo. Comprueba el código antes de considerar disponible cualquier función descrita como objetivo o propuesta.

- Aplicación: https://pastillas-1.vercel.app/
- Repositorio: https://github.com/SantiagoArroyoBr/Mis_Pastillas
- Código de la aplicación: `index.html`, `styles.css`, `app.js`, `sw.js` y `manifest.json`.

## Documentación del proyecto

- [Plan de desarrollo](PLAN_DESARROLLO.md): fuente única de tareas, objetivos, dependencias, prioridades y estados.
- [Arquitectura](ARQUITECTURA.md): estado comprobado del sistema, reglas técnicas permanentes y propuestas diferenciadas.
- [Historial de cambios](HISTORIAL_CAMBIOS.md): registro cronológico con archivos, validaciones, limitaciones y referencias de Git.

## Empezar

Para entender qué está implementado y qué queda pendiente, consulta primero el [plan](PLAN_DESARROLLO.md) y la [arquitectura vigente](ARQUITECTURA.md). Las pruebas de persistencia están en `tests/persistence.spec.js`; sus comandos y dependencias se deben revisar en los archivos del repositorio antes de ejecutarlas.

## Criterios permanentes

La rama `development` es la rama de trabajo. `main` es producción y no se modifica como parte del desarrollo ordinario. Los datos existentes, la clave `pastillas-v1`, la exportación y restauración JSON, la PWA y el funcionamiento offline se preservan; cualquier tarea que los afecte debe definir compatibilidad, respaldo, restauración y validación antes de implementarse. Utilizar datos ficticios en pruebas y documentación compartida.

El contenido de este README es una guía de entrada. El plan, la arquitectura y el historial enlazados arriba son las referencias centrales para sus respectivos temas.
