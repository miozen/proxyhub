import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { openDatabase } from './db/index.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
const app = createApp({ config, database });

const server = app.listen(config.port, config.host, () => {
  console.log(`[proxyhub] listening on http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`[proxyhub] received ${signal}, shutting down`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));





