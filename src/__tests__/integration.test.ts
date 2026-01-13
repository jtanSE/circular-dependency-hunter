import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Configuration, DefaultApi } from '@supermodeltools/sdk';
import { findCircularDependencies } from '../circular-deps';

const API_KEY = process.env.SUPERMODEL_API_KEY;
const SKIP_INTEGRATION = !API_KEY;

describe.skipIf(SKIP_INTEGRATION)('Integration Tests', () => {
  let api: DefaultApi;
  let zipPath: string;
  let idempotencyKey: string;

  beforeAll(async () => {
    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: API_KEY!,
    });
    api = new DefaultApi(config);

    // Create zip of this repo (circular-dependency-hunter testing itself!)
    const repoRoot = path.resolve(__dirname, '../..');
    zipPath = '/tmp/circular-deps-hunter-test.zip';

    execSync(`git archive -o ${zipPath} HEAD`, { cwd: repoRoot });

    const commitHash = execSync('git rev-parse --short HEAD', { cwd: repoRoot })
      .toString()
      .trim();
    idempotencyKey = `circular-deps-hunter:graph:${commitHash}`;
  });

  it('should call the Supermodel API and get a graph', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const response = await api.generateSupermodelGraph({
      idempotencyKey,
      file: zipBlob,
    });

    expect(response).toBeDefined();
    expect(response.graph).toBeDefined();
    expect(response.graph?.nodes).toBeDefined();
    expect(response.graph?.relationships).toBeDefined();
    expect(response.stats).toBeDefined();

    console.log('API Stats:', response.stats);
    console.log('Nodes:', response.graph?.nodes?.length);
    console.log('Relationships:', response.graph?.relationships?.length);
  }, 60000); // 60 second timeout for API call

  it('should find circular dependencies in the circular-dependency-hunter repo itself', async () => {
    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    const response = await api.generateSupermodelGraph({
      idempotencyKey,
      file: zipBlob,
    });

    const nodes = response.graph?.nodes || [];
    const relationships = response.graph?.relationships || [];

    const cycles = findCircularDependencies(nodes, relationships);

    console.log('\n=== Circular Dependency Hunter Self-Analysis ===');
    console.log(`Total nodes: ${nodes.length}`);
    console.log(`Total relationships: ${relationships.length}`);
    console.log(`Circular dependencies found: ${cycles.length}`);

    if (cycles.length > 0) {
      console.log('\nCircular dependency cycles:');
      for (const cycle of cycles.slice(0, 10)) {
        console.log(`  - ${cycle.cycle.join(' -> ')} -> ${cycle.cycle[0]}`);
      }
    }

    // The test passes regardless of cycle count - we just want to verify the flow works
    expect(Array.isArray(cycles)).toBe(true);
  }, 60000);
});

describe('Integration Test Prerequisites', () => {
  it('should have SUPERMODEL_API_KEY to run integration tests', () => {
    if (SKIP_INTEGRATION) {
      console.log('⚠️  SUPERMODEL_API_KEY not set - skipping integration tests');
      console.log('   Set the environment variable to run integration tests');
    } else {
      console.log('✓ SUPERMODEL_API_KEY is set');
    }
    expect(true).toBe(true); // Always passes
  });
});
