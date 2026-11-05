# Changelog

Todos los cambios de tiendanube-mcp. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y
las versiones siguen [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0] - 2026-11-05

### Agregado

- Siete tools para desarrollar en Tiendanube / Nuvemshop: `search-docs` y `read-doc` (documentación oficial en vivo
  desde nuvemshop.dev), `lookup-endpoint`, `lookup-scope` y `lookup-webhook-event` (índices de la Admin API 2025-03,
  sin red) y `scaffold-webhook-handler` y `scaffold-oauth-callback` (código Express en TypeScript).
- `scripts/ingerir.ts`: arma los índices de `data/` desde las páginas Markdown oficiales. Solo hechos y enlaces.
- El gate `npm run check`: formato, tipos, build, pruebas con páginas sintéticas, `probar-mcp` y búsqueda de rastros.
