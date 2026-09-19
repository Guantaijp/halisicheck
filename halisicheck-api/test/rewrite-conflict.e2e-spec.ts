import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * Regression cover for a real failure: accepting both the British and Kenyan
 * rewrite of the same span made GET /export splice two replacements into
 * identical offsets, which threw and returned 500.
 *
 * Needs the API's datastores and a MISTRAL_API_KEY, since it generates real
 * rewrites in two dialects.
 */
describe('Rewrite conflicts (e2e)', () => {
  let app: INestApplication<App>;
  let jobId: string;

  const SAMPLE =
    "In today's rapidly evolving digital landscape, it is important to note that mobile money has fundamentally transformed the financial inclusion ecosystem. Furthermore, it is worth noting that the adoption rate has been nothing short of remarkable.";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const created = await request(app.getHttpServer())
      .post('/jobs/text')
      .send({ text: SAMPLE, sourceName: 'conflict.txt' })
      .expect(201);
    jobId = created.body.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('keeps only one accepted rewrite per span, and exports cleanly', async () => {
    const server = app.getHttpServer();

    const british = await request(server)
      .post(`/jobs/${jobId}/rewrites`)
      .send({ dialect: 'british' })
      .expect(201);
    const kenyan = await request(server)
      .post(`/jobs/${jobId}/rewrites`)
      .send({ dialect: 'kenyan' })
      .expect(201);

    // Find a span both dialects produced a suggestion for.
    const kenyanBySpan = new Map<string, string>(
      kenyan.body.map((r: { spanId: string; id: string }) => [r.spanId, r.id]),
    );
    const pair = british.body.find((r: { spanId: string }) =>
      kenyanBySpan.has(r.spanId),
    );

    if (!pair) {
      // Nothing to conflict over; the export must still succeed.
      await request(server).get(`/jobs/${jobId}/export`).expect(200);
      return;
    }

    await request(server)
      .post(`/jobs/rewrites/${pair.id}/decision`)
      .send({ accepted: true })
      .expect(200);
    await request(server)
      .post(`/jobs/rewrites/${kenyanBySpan.get(pair.spanId)}/decision`)
      .send({ accepted: true })
      .expect(200);

    // This is the request that used to return 500.
    const exported = await request(server)
      .get(`/jobs/${jobId}/export`)
      .expect(200);

    expect(typeof exported.body.derivedText).toBe('string');
    expect(exported.body.derivedText.length).toBeGreaterThan(0);

    const result = await request(server).get(`/jobs/${jobId}/result`).expect(200);
    const acceptedForSpan = result.body.rewrites.filter(
      (r: { spanId: string; accepted: boolean | null }) =>
        r.spanId === pair.spanId && r.accepted === true,
    );
    expect(acceptedForSpan).toHaveLength(1);
  }, 300_000);
});

/**
 * The two endpoints that return rewrites must agree on their shape. They
 * diverged once: `scope` was added to POST /rewrites but not to GET /result,
 * which made a whole-passage rewrite vanish from the UI on refetch.
 */
describe('Rewrite response shape (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('returns the same fields from POST /rewrites and GET /result', async () => {
    const server = app.getHttpServer();

    const job = await request(server)
      .post('/jobs/text')
      .send({
        text: "In today's rapidly evolving digital landscape, it is important to note that mobile money has fundamentally transformed financial inclusion. Furthermore, it is worth noting that adoption has been nothing short of remarkable.",
        sourceName: 'shape.txt',
      })
      .expect(201);

    const generated = await request(server)
      .post(`/jobs/${job.body.id}/rewrites`)
      .send({ dialect: 'british', scope: 'passage' })
      .expect(201);

    expect(generated.body).toHaveLength(1);
    expect(generated.body[0].scope).toBe('passage');

    const result = await request(server)
      .get(`/jobs/${job.body.id}/result`)
      .expect(200);

    const fromResult = result.body.rewrites.find(
      (r: { id: string }) => r.id === generated.body[0].id,
    );
    expect(fromResult).toBeDefined();
    expect(Object.keys(fromResult).sort()).toEqual(
      Object.keys(generated.body[0]).sort(),
    );
    expect(fromResult.scope).toBe('passage');
  }, 300_000);
});
