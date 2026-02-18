/**
 * Swagger API Documentation Configuration
 * Phase 5.3: API Documentation
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Restaurant WhatsApp Bot API',
      version: '1.0.0',
      description: 'API documentation for Restaurant WhatsApp Bot backend services',
      contact: {
        name: 'API Support',
        email: 'support@restaurant.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'https://restaruntbot.onrender.com',
        description: 'Production server'
      },
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.restaurant.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code'
            }
          }
        },
        Health: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ok', 'healthy', 'degraded', 'unhealthy']
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds'
            }
          }
        },
        Metrics: {
          type: 'object',
          properties: {
            requests: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                success: { type: 'number' },
                failure: { type: 'number' },
                successRate: { type: 'string' }
              }
            },
            responseTimes: {
              type: 'object'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints'
      },
      {
        name: 'Auth',
        description: 'Authentication endpoints'
      },
      {
        name: 'Menu',
        description: 'Menu management'
      },
      {
        name: 'Orders',
        description: 'Order management'
      },
      {
        name: 'Metrics',
        description: 'System metrics and monitoring'
      }
    ]
  },
  apis: ['./routes/*.js', './swagger.js'] // Path to API docs
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Health'
 */

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check (Kubernetes)
 *     tags: [Health]
 *     description: Returns 200 if all dependencies are ready
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check (Kubernetes)
 *     tags: [Health]
 *     description: Returns 200 if server is alive
 *     responses:
 *       200:
 *         description: Server is alive
 */

/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: Get system metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Metrics'
 *       401:
 *         description: Unauthorized
 */

module.exports = {
  swaggerUi,
  swaggerSpec
};
