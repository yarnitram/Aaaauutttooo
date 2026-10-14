import { buildApp } from './app.js';

const server = buildApp();
const port = Number(process.env.PORT) || 3000;

server.listen({ port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Auth Service listening on ${address}`);
});
