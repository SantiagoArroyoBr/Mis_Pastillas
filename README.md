<p align="center">
  <img src="docs/assets/acompana-banner.svg" alt="Acompaña — Cuidar también es organizar" width="1000">
</p>

<p align="center">
  <a href="https://acompana-piloto-git-development-dinamita20.vercel.app/">Abrir candidata conectada</a> ·
  <a href="https://pastillas-1.vercel.app/">Abrir PWA de referencia</a> ·
  <a href="docs/README.md">Documentación</a> ·
  <a href="BACKLOG.md">Próximos pasos</a>
</p>

# Cuidado familiar, en un mismo lugar

Acompaña ayuda a organizar fichas, citas médicas, medicamentos, insumos, jornadas de enfermería y pagos. Está pensada principalmente para el teléfono, con una interfaz en español y controles independientes para mostrar montos.

> **Estado · 18 de noviembre de 2026:** hay dos versiones en este repositorio. La candidata conectada permite compartir datos mediante cuentas y familias; la PWA de referencia guarda los datos en cada dispositivo. La transición entre ambas todavía está en desarrollo.

## Qué puedes organizar

| Apartado | Para qué sirve |
| --- | --- |
| **Inicio** | Consultar el calendario del cuidado y abrir el detalle de citas, turnos y reposiciones estimadas. |
| **Fichas** | Organizar a las personas de la familia y conservar su historial al archivar. |
| **Citas médicas** | Registrar fecha, hora, médico, lugar y notas. |
| **Inventario** | Registrar medicinas, pautas, compras e insumos con conteo manual. |
| **Enfermería y pagos** | Consultar tarifas, jornadas, abonos individuales y saldo general. |
| **Configuración** | Administrar familias, invitaciones y accesos temporales con nombre y vencimiento. |

## Elige la versión correcta

| | PWA de referencia · raíz | Candidata conectada · `backend/` |
| --- | --- | --- |
| Datos | `localStorage`, por origen y dispositivo | Supabase, con permisos por familia |
| Cuenta | No necesita cuenta de nube | Cuenta principal y accesos temporales |
| Sin conexión | Disponible, con service worker | Consulta opcional de datos ya leídos, con sesión vigente; sin escrituras |
| Respaldos | JSON y restauración local | Exportación familiar y restauración en una familia nueva |
| Publicación | [pastillas-1](https://pastillas-1.vercel.app/) | [development](https://acompana-piloto-git-development-dinamita20.vercel.app/) |

Los datos locales no se transfieren automáticamente a la nube. No interpretes una prueba offline de la PWA como prueba offline de la candidata conectada.

## Probar sin datos reales

Necesitas **Node.js 22 o posterior**. El ensayo utiliza PostgreSQL en memoria y simula Auth y correo; no necesita Docker ni modifica Supabase o Brevo.

```sh
npm ci --prefix backend
npm run sandbox --prefix backend
```

Abre [127.0.0.1:4180](http://127.0.0.1:4180/). La cabecera del ensayo muestra las credenciales ficticias. Sus datos desaparecen al reiniciar; utiliza contraseñas de prueba.

Para levantar Supabase local, seguir el recorrido completo o ejecutar la PWA de referencia, consulta la [guía de backend](backend/README.md) y la [referencia técnica conservada](README-REFERENCIA.md).

## Calidad y prioridades

La [auditoría QA-009](docs/auditorias/QA-009-calidad-integral.md) registra errores, limitaciones y evidencia. Los resultados locales de QA-010 fueron **56/56 pruebas conectadas y 102/102 de la PWA**; cada entrega posterior registra sus propios resultados en el [historial](HISTORIAL_CAMBIOS.md).

El [lote QA-012](docs/QA-012-cierre-calidad-conectada.md) añade altas recuperables ante respuestas perdidas, historiales ampliables, respaldo familiar, sesión renovable y consulta offline opcional. El acceso temporal requiere conexión. La caché privada se elimina al cerrar sesión; actívala solo en un dispositivo personal. La instalación física y el corte de producción se comprueban por separado.

```sh
npm test --prefix backend
npm run test:ui --prefix backend
node --test tests/payments.spec.js tests/persistence.spec.js
node backend/build-preview.mjs
```

La regresión de navegador requiere Chrome, Chromium o Edge. Las pruebas usan datos ficticios. El workflow **Calidad** está definido en este repositorio; una ejecución remota aprobada y la protección de ramas se verifican por separado.

## Entender y colaborar

- [Mapa documental](docs/README.md): encuentra la guía adecuada sin recorrer todos los informes.
- [Contribución](CONTRIBUTING.md): entorno, comprobaciones y cuidado de los datos.
- [Seguridad](SECURITY.md): cómo informar un problema sin exponer información familiar.
- [Arquitectura](ARQUITECTURA.md) y [backlog](BACKLOG.md): decisiones y trabajo pendiente.
- [Historial](HISTORIAL_CAMBIOS.md): implementación, pruebas, aprobaciones y publicaciones.

La documentación técnica y las validaciones históricas del README anterior se conservan en [README-REFERENCIA.md](README-REFERENCIA.md). El estado vigente de nube figura al principio de la [guía conectada](backend/README.md).
