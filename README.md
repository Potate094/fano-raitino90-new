# Fano.in Stremio Addon

Local development and deployment notes.

Environment variables
- `PORT` — server port (default `7000`)
- `REDIS_URL` — optional Redis URL (e.g. `redis://localhost:6379`) to persist cookie cache across instances
- `LOG_LEVEL` — optional winston log level (`info`, `debug`, ...)
 - `BASE` or `TEST_BASE_URL` — optional base URL for integration tests (e.g. your Render service URL). If set, `node test.js` and CI integration step will target this URL.

Run locally

```bash
npm install
npm start
```

Run tests

```bash
npm test
# or run the integration script (may hit external services):
BASE=https://your-deployment.example.com node test.js
```

Docker

```bash
docker build -t fano-addon .
docker run -e PORT=7000 -p 7000:7000 fano-addon
```
