import { defineConfig, loadEnv } from 'vite';
import copilotHandler from './api/copilot.js';
import marketHandler from './api/market.js';
import plaidHandler from './api/plaid.js';

function localApiRoutes() {
  const handlers = { copilot: copilotHandler, market: marketHandler, plaid: plaidHandler };
  return {
    name: 'velora-local-api-routes',
    configResolved(config) {
      const localSecrets = loadEnv(config.mode, config.root, '');
      for (const name of ['GEMINI_API_KEY', 'PLAID_CLIENT_ID', 'PLAID_SECRET']) {
        if (localSecrets[name]) process.env[name] = localSecrets[name];
      }
    },
    configureServer(server) {
      server.middlewares.use('/api', async (request, response, next) => {
        const route = new URL(request.url || '/', 'http://localhost');
        const handler = handlers[route.pathname.replace(/^\//, '')];
        if (!handler) return next();

        request.url = `${route.pathname}${route.search}`;
        if (request.method === 'POST') {
          try {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            request.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          } catch {
            return response.status(400).json({ error: 'Invalid JSON request body.' });
          }
        }

        response.status = status => {
          response.statusCode = status;
          return response;
        };
        response.json = payload => {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
          return response;
        };

        try {
          await handler(request, response);
        } catch {
          if (!response.headersSent) response.status(500).json({ error: 'Local API request failed.' });
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [localApiRoutes()],
});
