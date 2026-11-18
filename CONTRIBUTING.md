# Colaborar con Acompaña

Gracias por ayudar a mejorar el cuidado familiar. Antes de cambiar código, consulta [AGENTS.md](AGENTS.md), el [backlog](BACKLOG.md) y la [auditoría vigente](docs/auditorias/QA-009-calidad-integral.md).

1. Trabaja sobre development y conserva los cambios de otras personas.
2. Usa datos ficticios, perfiles aislados y cuentas de prueba. Nunca adjuntes fichas reales, respaldos privados, contraseñas o códigos de acceso a un issue.
3. Describe el problema, el comportamiento esperado y la versión afectada: PWA local o candidata conectada.
4. Conserva IDs, historial financiero, `pastillas-v1`, confirmaciones de restauración y permisos. Una modificación de esquema o de reglas requiere autorización específica.
5. Ejecuta las pruebas relacionadas, el build y `git diff --check`. Registra el resultado real, incluyendo fallos y pruebas pendientes.

## Comprobaciones locales

```sh
npm ci --prefix backend
npm test --prefix backend
node --test tests/payments.spec.js tests/persistence.spec.js
node backend/build-preview.mjs
git diff --check
```

Requiere Node.js 22 o posterior. La regresión de la PWA necesita Chrome, Chromium o Edge; `CHROME_BIN` permite indicar el ejecutable. Ejecuta las suites por separado para evitar competencia de recursos. El build público es una lista cerrada: nunca agregues claves privadas, SQL o respaldos a ella.

El workflow de calidad ejecuta estas comprobaciones en GitHub al publicarse. No despliega ni aplica migraciones. La protección de ramas y la obligatoriedad de los checks son ajustes independientes del repositorio.
