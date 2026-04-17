import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Milu API',
      version: '1.0.0',
      description: 'AI voice customer service platform for African businesses',
      contact: { name: 'Milu Support', email: 'support@miluai.app' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Development' },
      { url: 'https://api.miluai.app', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Validation error' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        Business: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            industry: { type: 'string', nullable: true },
            subscriptionTier: { type: 'string', enum: ['STARTER', 'GROWTH', 'ENTERPRISE'] },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['OWNER', 'ADMIN'] },
            businessId: { type: 'string', nullable: true },
            emailVerified: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Call: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            businessId: { type: 'string' },
            callerNumber: { type: 'string' },
            status: { type: 'string', enum: ['ACTIVE', 'COMPLETED', 'FAILED'] },
            resolution: { type: 'string', enum: ['AI', 'HUMAN', 'ABANDONED'], nullable: true },
            intent: { type: 'string', nullable: true },
            duration: { type: 'integer', nullable: true },
            startedAt: { type: 'string', format: 'date-time' },
            endedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        KnowledgeBase: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            businessId: { type: 'string' },
            businessName: { type: 'string' },
            operatingHours: { type: 'object' },
            faqs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                },
              },
            },
            escalationNumber: { type: 'string', nullable: true },
            voiceId: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
});
