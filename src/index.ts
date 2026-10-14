import { buildServer } from './server.js';
import { config } from './config/env.js';

async function start() {
  const server = await buildServer();

  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`🚀 Aaaauutttooo AuthApp running on http://${config.host}:${config.port}`);
    console.log(`📚 Swagger documentation at http://${config.host}:${config.port}/documentation`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
