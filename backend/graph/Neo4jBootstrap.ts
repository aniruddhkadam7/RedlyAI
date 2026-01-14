import neo4j, { type Driver } from 'neo4j-driver';

import { setGraphAbstractionLayer } from './GraphAbstractionLayerStore';
import { Neo4jGraphAdapter } from './Neo4jGraphAdapter';

type Shutdown = () => Promise<void> | void;

let activeDriver: Driver | null = null;
let shutdownHandler: Shutdown | null = null;

const cleanup = async () => {
  if (!activeDriver) return;
  try {
    await activeDriver.close();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[neo4j] close error', err);
  } finally {
    activeDriver = null;
  }
};

const registerShutdown = () => {
  if (shutdownHandler) return;
  shutdownHandler = async () => {
    await cleanup();
  };
  process.once('SIGINT', shutdownHandler);
  process.once('SIGTERM', shutdownHandler);
  process.once('exit', shutdownHandler);
};

const env = (name: string): string => (process.env[name] ?? '').trim();

/**
 * Initialize the Neo4j-backed GraphAbstractionLayer using environment variables.
 *
 * Required: NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
 * Optional: NEO4J_DATABASE, NEO4J_NODE_LABEL, NEO4J_EDGE_REL_TYPE
 */
export const initNeo4jGraphFromEnv = async (): Promise<boolean> => {
  const uri = env('NEO4J_URI');
  const user = env('NEO4J_USER');
  const password = env('NEO4J_PASSWORD');

  if (!uri || !user || !password) {
    return false; // Silent skip when not configured.
  }

  if (activeDriver) {
    return true; // Already initialized.
  }

  const database = env('NEO4J_DATABASE') || undefined;
  const nodeLabel = env('NEO4J_NODE_LABEL') || undefined;
  const edgeRelType = env('NEO4J_EDGE_REL_TYPE') || undefined;

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    await driver.verifyConnectivity();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[neo4j] connectivity check failed', err);
    await driver.close().catch(() => undefined);
    return false;
  }

  activeDriver = driver;
  registerShutdown();

  setGraphAbstractionLayer(
    new Neo4jGraphAdapter({
      driver,
      database,
      nodeLabel,
      edgeRelType,
    }),
  );

  // eslint-disable-next-line no-console
  console.log(`[neo4j] connected to ${uri}${database ? `/${database}` : ''}`);
  return true;
};

/**
 * Expose a way to close the driver explicitly for tests or manual shutdowns.
 */
export const closeNeo4jDriver = async () => {
  await cleanup();
};
