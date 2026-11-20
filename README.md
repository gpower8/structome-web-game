Online Multiplayer Webgame Played Across Devices. Domain was structo.me but the server is no longer running. Check out my new game at ghostsdontsleep.com


## Development

Built with React 18 + TypeScript (bundled with [Vite](https://vite.dev/)) and a Node game server (`server.js`, express + socket.io). Requires Node `^20.19.0 || >=22.12.0`.

```sh
npm install
npm run build   # type-check + production build into ./build
npm start       # node server.js — serves ./build and socket.io on PORT (default 8080)
```

For hot-reload development, run the game server and the Vite dev server side by side:

```sh
npm start       # terminal 1: game server on :8080
npm run dev     # terminal 2: client on http://localhost:3000, proxies /socket.io to :8080
```

Other scripts: `npm run typecheck` (`tsc --noEmit`), `npm run preview` (serve the built client without the game server).

### Environment variables

- `PORT` — game server port (default `8080`).
- `CORS_ORIGIN` — allowed socket.io CORS origin for the game server.
- `VITE_DEV_BACKEND` — game server URL that `npm run dev` proxies `/socket.io` to (default `http://localhost:8080`).

Migrated from Create React App: client-side env vars must now be prefixed `VITE_` and read via `import.meta.env.VITE_*` (previously `REACT_APP_*` / `process.env`). The client did not use any `REACT_APP_*` variables, so nothing needed renaming.
