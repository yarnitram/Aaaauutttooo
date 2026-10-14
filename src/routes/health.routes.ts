import { FastifyInstance } from 'fastify';

export async function healthRoutes(server: FastifyInstance) {
  server.get('/healthz', {
    schema: {
      description: 'Liveness and health check endpoint for Cloudflare and Docker',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            uptime: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  server.get('/server/ping', {
    schema: {
      description: 'Ping endpoint for Proxmox deployment check',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            ping: { type: 'string' },
          },
        },
      },
    },
  }, async (_req, reply) => {
    return reply.status(200).send({ ping: 'pong' });
  });
}
