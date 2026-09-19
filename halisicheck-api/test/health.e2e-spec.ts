import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * Boots the real application graph against the real Postgres and Redis from
 * docker-compose. It is an end-to-end test, so it needs those running:
 *   docker compose up -d && pnpm migration:run && pnpm test:e2e
 */
describe('HalisiCheck API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('reports health, distinguishing "not configured" from "down"', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.checks.database.ok).toBe(true);
    expect(response.body.checks).toHaveProperty('mistral');
  });

  it('rejects an empty text job', async () => {
    await request(app.getHttpServer())
      .post('/jobs/text')
      .send({ text: '' })
      .expect(400);
  });

  it('rejects unknown properties rather than ignoring them', async () => {
    await request(app.getHttpServer())
      .post('/jobs/text')
      .send({ text: 'a passage long enough to analyse properly', injected: true })
      .expect(400);
  });

  it('scores pasted text and returns spans with a confidence interval', async () => {
    const created = await request(app.getHttpServer())
      .post('/jobs/text')
      .send({
        text: "In today's rapidly evolving digital landscape, it is important to note that mobile money has fundamentally transformed the financial inclusion ecosystem. Furthermore, it is worth noting that adoption has been nothing short of remarkable. Mobile money began as a small pilot for repaying microfinance loans, and the people running it were surprised by what users did with it.",
        sourceName: 'e2e-sample.txt',
      })
      .expect(201);

    expect(created.body.status).toBe('done');

    const result = await request(app.getHttpServer())
      .get(`/jobs/${created.body.id}/result`)
      .expect(200);

    // A score is never reported without its interval or its caveat.
    expect(typeof result.body.score).toBe('number');
    expect(result.body.confidenceMargin).toBeGreaterThan(0);
    expect(result.body.caveat).toMatch(/probabilistic/i);
    expect(result.body).not.toHaveProperty('verdict');
    expect(result.body.spans.length).toBeGreaterThan(0);

    for (const span of result.body.spans) {
      expect(span.endOffset).toBeGreaterThan(span.startOffset);
      expect(span.reasons.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('404s an unknown job', async () => {
    await request(app.getHttpServer())
      .get('/jobs/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
