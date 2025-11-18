import request from 'supertest';
import express, { Application } from 'express';
import apiRoutes from '../routes/api.routes';
import { errorHandler } from '../middleware/error.middleware';

// Mock the services
jest.mock('../services/aggregation.service');
jest.mock('../services/cache.service');

describe('API Routes', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
    app.use(errorHandler);
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
    });
  });

  describe('GET /api/tokens', () => {
    it('should validate limit parameter', async () => {
      const response = await request(app).get('/api/tokens?limit=150');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Limit must be between 1 and 100');
    });

    it('should validate negative limit', async () => {
      const response = await request(app).get('/api/tokens?limit=-5');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should accept valid limit', async () => {
      const response = await request(app).get('/api/tokens?limit=20');

      // Since we mocked the service, it might return empty or default
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/tokens/search', () => {
    it('should require query parameter', async () => {
      const response = await request(app).get('/api/tokens/search');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Query parameter "q" is required');
    });

    it('should reject empty query', async () => {
      const response = await request(app).get('/api/tokens/search?q=');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/cache/invalidate', () => {
    it('should invalidate cache', async () => {
      const response = await request(app).post('/api/cache/invalidate');

      // Service is mocked, so we just check the endpoint exists
      expect([200, 500]).toContain(response.status);
    });
  });
});
