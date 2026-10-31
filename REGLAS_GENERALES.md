# Reglas generales de trabajo — Acompaña

> **Lectura obligatoria:** todos los chats y colaboradores deben leer este archivo antes de analizar, proponer o modificar cualquier parte del proyecto.
>
> Los documentos operativos relacionados son:
> - [Centro de coordinación](CENTRO_DE_COORDINACION.md)
> - [Solicitudes y aprobaciones](SOLICITUDES.md)
> - [Trabajo activo](TRABAJO_ACTIVO.md)
> - [Decisiones técnicas](DECISIONES_TECNICAS.md)

## 1. Contexto del proyecto

Acompaña es una aplicación PWA para organizar el cuidado familiar. Evoluciona del proyecto Mis pastillas.

- Repositorio: https://github.com/SantiagoArroyoBr/Mis_Pastillas
- Rama de producción: `main`
- Rama de desarrollo: `development`
- Producción: https://pastillas-1.vercel.app/
- Commit estable de referencia: `92c4034085e13bb38fd0a7ff2622c46ef797873d`

La aplicación actual utiliza principalmente HTML, CSS y JavaScript, PWA y almacenamiento local mediante `localStorage`. No se debe asumir que existe backend centralizado, autenticación o sincronización multiusuario.

El producto contempla pacientes, medicamentos, inventarios, consumos, compras, insumos, enfermería, pagos, citas, panel general y funciones complementarias. La implementación real de cada función debe comprobarse antes de describirla como terminada.

## 2. Protección de producción y datos

1. Nunca trabajar directamente sobre `main`.
2. El trabajo de desarrollo se realiza en `development` o en ramas de tarea creadas desde ella y coordinadas previamente.
3. No fusionar a `main`, desplegar a producción ni cambiar la configuración de Vercel sin autorización explícita del propietario.
4. No borrar ni reemplazar datos, funcionalidades o archivos sin evaluar el impacto.
5. Los datos de la aplicación pueden estar almacenados en dispositivos familiares mediante `localStorage`; no están protegidos por el control de versiones de GitHub.
6. Antes de migraciones o cambios de almacenamiento, definir exportación, respaldo, restauración, compatibilidad y recuperación.
7. No cambiar claves de almacenamiento, estructuras de datos, service worker o cachés sin análisis de compatibilidad.
8. No afirmar que algo fue implementado, probado o desplegado si no existe evidencia verificable.

## 3. Aprobación obligatoria del propietario

El propietario del proyecto conserva la decisión final.

- Los chats especializados pueden investigar, analizar y preparar propuestas.
- Toda modificación que afecte archivos compartidos, arquitectura, datos, infraestructura, seguridad o comportamiento de la aplicación debe presentarse para aprobación antes de ejecutarse.
- Una propuesta no equivale a autorización.
- No interpretar el silencio, una conversación previa o la aprobación de otra área como autorización.
- La aprobación debe identificar claramente el alcance: archivos, cambios y rama.
- Una vez aprobada una tarea, no ampliar su alcance sin volver a solicitar autorización.

Para cambios documentales de coordinación, el propietario puede aprobar la incorporación de una aportación concreta. No se deben editar los documentos compartidos directamente por iniciativa propia.

## 4. Flujo obligatorio al iniciar cualquier tarea

Antes de analizar en profundidad, proponer cambios o editar archivos, todos los agentes y chats deben:

1. Leer estos cinco documentos en la rama de trabajo más reciente: [REGLAS_GENERALES.md](REGLAS_GENERALES.md), [CENTRO_DE_COORDINACION.md](CENTRO_DE_COORDINACION.md), [SOLICITUDES.md](SOLICITUDES.md), [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md) y [DECISIONES_TECNICAS.md](DECISIONES_TECNICAS.md).
2. Comprobar rama, estado local, SHA, remoto y estado actual de GitHub; revisar TRABAJO_ACTIVO.md y las tareas o PR abiertos para detectar trabajo concurrente.
3. Buscar en SOLICITUDES.md una solicitud equivalente por ID, objetivo, alcance y sistemas/archivos afectados; buscar en TRABAJO_ACTIVO.md una tarea equivalente o activa y comparar sus archivos. No crear duplicados: actualizar el registro existente y respetar su estado.
4. Si no existe una solicitud equivalente, crearla en SOLICITUDES.md con la plantilla vigente y estado «Pendiente de aprobación» antes de editar archivos de la aplicación o documentos compartidos.
5. Tratar el registro de la solicitud solo como constancia del pedido: no autoriza por sí mismo su implementación. Verificar que exista aprobación explícita del propietario para el alcance, archivos y rama. Si el alcance requiere aprobación y no está registrada o no es inequívoca, solicitarla y esperar; mientras tanto, limitarse a análisis y al registro administrativo autorizado.
6. Una vez aprobada la solicitud, registrar la tarea en TRABAJO_ACTIVO.md con responsable, rama, archivos, estado y criterios de aceptación antes de editar cualquiera de los archivos previstos, incluidos documentos de reglas y coordinación.
7. Si hay tareas concurrentes que asignan o modifican los mismos archivos, coordinar primero; no sobrescribir ni integrar trabajo pendiente sin autorización.

La falta de una entrada previa nunca se interpreta como permiso para implementar ni se resuelve mediante una aprobación retroactiva. No asumir que los chats pueden ver el historial completo de los demás; la información necesaria debe quedar documentada aquí o entregarse explícitamente.

Al terminar una tarea, informar hallazgos, archivos, commits, pruebas realmente ejecutadas, límites, impactos y decisiones pendientes. Actualizar SOLICITUDES.md y TRABAJO_ACTIVO.md con el resultado; proponer al centro de coordinación solo la información transversal aprobada.

## 5. Trabajo simultáneo y conflictos

- Antes de editar código, registrar la tarea, responsable/chat, rama, archivos previstos y estado en [TRABAJO_ACTIVO.md](TRABAJO_ACTIVO.md), una vez aprobada.
- No asignar simultáneamente el mismo archivo a dos tareas sin coordinación expresa.
- Si aparece un solapamiento, detener la edición de los archivos en conflicto y comunicarlo.
- Mantener los cambios acotados.
- Revisar el estado más reciente de la rama antes de escribir.
- No sobrescribir cambios ajenos ni resolver conflictos eliminando trabajo sin autorización.
- Al terminar, solicitar que se actualice el registro de trabajo activo.

**Limitación:** este registro es un control documental, no un bloqueo técnico de Git. No impide que dos chats o colaboradores escriban simultáneamente. Para evitar conflictos reales se necesitan ramas separadas, commits pequeños y revisión antes de integrar.

## 6. Criterios de calidad

- Diferenciar hechos comprobados, hipótesis, recomendaciones y decisiones.
- Preferir cambios pequeños y reversibles.
- Definir criterios de aceptación antes de implementar.
- Ejecutar pruebas pertinentes y reportar exactamente sus resultados.
- Considerar regresiones en datos, cálculos, fechas, funcionamiento offline, instalación PWA y dispositivos móviles.
- Mantener el README y la documentación técnica actualizados mediante cambios aprobados.

## 7. Estados oficiales

Usar estos estados de forma consistente:

- **Propuesta:** idea aún no aprobada.
- **Pendiente de aprobación:** requiere decisión del propietario.
- **Aprobada:** autorizada, aún no necesariamente iniciada.
- **En curso:** trabajo iniciado dentro del alcance aprobado.
- **Bloqueada:** no puede avanzar por una dependencia o problema.
- **Implementada:** cambio realizado en la rama correspondiente.
- **Probada:** validación ejecutada y resultados registrados.
- **Incorporada:** cambios integrados en la rama destino autorizada.
- **Desplegada:** publicada en el entorno indicado.
- **Rechazada:** propuesta descartada.

No utilizar “implementada”, “probada” o “desplegada” como sinónimos.

## 8. Formato de comunicación entre áreas

Toda aportación que se proponga incorporar debe incluir:

- Área y chat de origen.
- Fecha.
- Estado.
- Resumen concreto.
- Evidencia o referencias (archivos, líneas, commits o pruebas).
- Impacto en otras áreas.
- Riesgos y dependencias.
- Decisión o acción solicitada.
- Archivos y rama afectados, si aplica.

## 9. Identidad del producto

- Nombre: Acompaña.
- Descriptor: Gestión del cuidado familiar.
- Eslogan: Cuidar también es organizar.
- Verde bosque: `#315B50`.
- Verde salvia: `#789486`.
- Crema: `#F4EBDD`.
- Terracota: `#D6A17B`.
- Carbón: `#293A34`.

El sistema visual está definido como propuesta; no afirmar que ya está implementado sin comprobar el código.

## 10. Prioridad rectora

La prioridad es proteger los datos y la continuidad de uso familiar. Después, comprender el estado real, definir reglas y arquitectura, probar y documentar, e implementar progresivamente. La velocidad nunca justifica poner en riesgo producción o los datos.
