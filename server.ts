import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth } from './src/middleware/auth.ts';
import { coreRouter } from './src/server/routes/core.ts';
import { inventoryRouter } from './src/server/routes/inventory.ts';
import { transactionsRouter } from './src/server/routes/transactions.ts';
import { crmFinanceRouter } from './src/server/routes/crmFinance.ts';
import { solarExtrasRouter } from './src/server/routes/solarExtras.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Public health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timezone: 'Asia/Yangon' });
  });

  // Protected ERP & POS API routes (Firebase Auth verified)
  app.use('/api', requireAuth, coreRouter);
  app.use('/api', requireAuth, inventoryRouter);
  app.use('/api', requireAuth, transactionsRouter);
  app.use('/api', requireAuth, crmFinanceRouter);
  app.use('/api', requireAuth, solarExtrasRouter);

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Solar Shop Management & POS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
