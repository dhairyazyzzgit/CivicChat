import http from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'api-dev-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url ? new URL(req.url, 'http://localhost').pathname : '';
            if (!pathname.startsWith('/api/')) {
              return next();
            }

            // Check if 3001 is listening
            const is3001Alive = await new Promise((resolve) => {
              const testReq = http.request(
                { host: '127.0.0.1', port: 3001, path: '/api/health', method: 'GET', timeout: 200 },
                (testRes) => resolve(testRes.statusCode >= 200 && testRes.statusCode < 500),
              );
              testReq.on('error', () => resolve(false));
              testReq.on('timeout', () => {
                testReq.destroy();
                resolve(false);
              });
              testReq.end();
            });

            if (is3001Alive) {
              return next();
            }

            // Fallback: execute local API handler directly in Vite dev server
            try {
              let handler = null;
              if (pathname === '/api/analyze') {
                const mod = await import('./api/analyze.js');
                handler = mod.default;
              } else if (pathname === '/api/compare') {
                const mod = await import('./api/compare.js');
                handler = mod.default;
              } else if (pathname === '/api/health') {
                const mod = await import('./api/health.js');
                handler = mod.default;
              }

              if (!handler) {
                return next();
              }

              let body = {};
              if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) {
                  chunks.push(chunk);
                }
                const raw = Buffer.concat(chunks).toString('utf8');
                try {
                  body = JSON.parse(raw);
                } catch {
                  body = {};
                }
              }

              req.body = body;
              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };

              await handler(req, res);
            } catch (err) {
              console.error('Local API dev handler error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: { code: 'internal_error', message: err?.message || 'Error' } }));
            }
          });
        },
      },
    ],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
