import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { initNeo4jGraphFromEnv } from './graph/Neo4jBootstrap';
import { createCatalogRouter } from './modules/catalog/catalog.routes';
import { createImportRouter } from './modules/catalog/import/import.routes';

type Handler = (req: Request, res: Response, next?: NextFunction) => unknown;

type MockModuleShape = {
  default?: Record<string, Handler>;
} & Record<string, unknown>;

const PORT = Number(process.env.API_PORT ?? 3001);
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 15000);
const NEO4J_CONNECT_TIMEOUT_MS = Number(
  process.env.NEO4J_CONNECT_TIMEOUT_MS ?? 5000,
);

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    res.status(504).json({ success: false, errorMessage: 'Gateway Timeout' });
  }, REQUEST_TIMEOUT_MS);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  req.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const registered = new Set<string>();

const registerRoute = (key: string, handler: Handler) => {
  const firstSpace = key.indexOf(' ');
  if (firstSpace <= 0) return;

  const method = key.slice(0, firstSpace).trim().toLowerCase();
  const route = key.slice(firstSpace + 1).trim();
  if (!route.startsWith('/')) return;

  const id = `${method} ${route}`;
  if (registered.has(id)) return;
  registered.add(id);

  const verb = (app as any)[method];
  if (typeof verb !== 'function') return;

  verb.call(app, route, (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = handler(req, res, next);
      if (out && typeof (out as any).then === 'function') {
        (out as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  });
};

const loadMockFile = (filePath: string) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(filePath) as MockModuleShape;
  const maybe = (mod && (mod as any).default) || mod;
  if (!maybe || typeof maybe !== 'object') return;

  for (const [key, value] of Object.entries(maybe as Record<string, unknown>)) {
    if (typeof value === 'function') {
      registerRoute(key, value as Handler);
    }
  }
};

const mocksDir = path.resolve(__dirname, '..', 'mock');
const mockFiles = fs
  .readdirSync(mocksDir)
  .filter(
    (name) =>
      (name.endsWith('.ts') || name.endsWith('.js')) && !name.endsWith('.d.ts'),
  )
  .map((name) => path.join(mocksDir, name));

const bootstrap = async () => {
  const neo4jInit = initNeo4jGraphFromEnv();
  await Promise.race([
    neo4jInit,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('[neo4j] init timeout; continuing without graph adapter');
        resolve();
      }, NEO4J_CONNECT_TIMEOUT_MS);
    }),
  ]);

  for (const file of mockFiles) {
    loadMockFile(file);
  }

  app.use('/api', createImportRouter());
  app.use('/api', createCatalogRouter());

  // Fallback 404 for any unhandled /api route.
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, errorMessage: 'Not Found' });
  });

  // Basic error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Avoid noisy logs in normal dev flow.
    // eslint-disable-next-line no-console
    console.error('[api] error', err);
    res
      .status(500)
      .json({ success: false, errorMessage: 'Internal Server Error' });
  });

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[api] loaded ${registered.size} routes from /mock`);
  });
};

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] failed to start', err);
  process.exitCode = 1;
});
