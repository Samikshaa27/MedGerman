import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import explainHandler from './api/explain.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Expose env vars to process.env in dev
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'api-explain-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/explain' && req.method === 'POST') {
              try {
                await explainHandler(req, res);
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }
            next();
          });
        },
      },
    ],
  };
});
