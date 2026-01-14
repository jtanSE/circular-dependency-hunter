import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CodeGraphNode, CodeGraphRelationship, Configuration, DefaultApi } from '@supermodeltools/sdk';
import { findCircularDependencies, formatPrComment } from './circular-deps';

async function createZipArchive(workspacePath: string): Promise<string> {
  const zipPath = path.join(workspacePath, '.circular-dependency-hunter-repo.zip');

  core.info('Creating zip archive...');

  await exec.exec('git', ['archive', '-o', zipPath, 'HEAD'], {
    cwd: workspacePath,
  });

  const stats = await fs.stat(zipPath);
  core.info(`Archive size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  return zipPath;
}

async function generateIdempotencyKey(workspacePath: string): Promise<string> {
  let output = '';
  await exec.exec('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: workspacePath,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
    silent: true,
  });

  const commitHash = output.trim();
  const repoName = path.basename(workspacePath);

  return `${repoName}:supermodel:${commitHash}`;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput('supermodel-api-key', { required: true }).trim();

    if (!apiKey.startsWith('smsk_')) {
      core.warning('API key format looks incorrect. Get your key at https://dashboard.supermodeltools.com');
    }

    const commentOnPr = core.getBooleanInput('comment-on-pr');
    const failOnCircularDeps = core.getBooleanInput('fail-on-circular-deps');
    const ignorePatterns = JSON.parse(core.getInput('ignore-patterns') || '[]');
    const debug = core.getBooleanInput('debug');

    const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd();

    core.info('Circular Dependency Hunter starting...');

    // Step 1: Create zip archive
    const zipPath = await createZipArchive(workspacePath);

    // Step 2: Generate idempotency key
    const baseIdempotencyKey = await generateIdempotencyKey(workspacePath);

    // Step 3: Call Supermodel API
    core.info('Analyzing codebase with Supermodel...');

    const config = new Configuration({
      basePath: process.env.SUPERMODEL_BASE_URL || 'https://api.supermodeltools.com',
      apiKey: apiKey,
    });

    const api = new DefaultApi(config);

    const zipBuffer = await fs.readFile(zipPath);
    const zipBlob = new Blob([zipBuffer], { type: 'application/zip' });

    let response: any = await api.generateDependencyGraph({
      idempotencyKey: `${baseIdempotencyKey}:dep`,
      file: zipBlob,
    });

    if (!response?.graph || ((response.graph.nodes?.length ?? 0) === 0 && (response.graph.relationships?.length ?? 0) === 0)) {
      core.warning('Dependency graph empty, falling back to parse graph');
      response = await api.generateParseGraph({
        idempotencyKey: `${baseIdempotencyKey}:parse`,
        file: zipBlob,
      });
    }

    // Step 4: Analyze for circular dependencies
    const nodes: CodeGraphNode[] = response.graph?.nodes || [];
    const relationships: CodeGraphRelationship[] = response.graph?.relationships || [];

    if (debug) {
      const message = (response as any)?.message;
      const stats = (response as any)?.stats;
      if (message) {
        core.info(`Graph message: ${message}`);
      }
      if (stats) {
        core.info(`Graph stats: ${JSON.stringify(stats)}`);
      }
      const relationshipTypes = Array.from(
        new Set(relationships.map(rel => rel.type).filter(Boolean))
      ).sort();
      core.info(`Graph nodes: ${nodes.length}`);
      core.info(`Graph relationships: ${relationships.length}`);
      core.info(`Relationship types: ${relationshipTypes.join(', ') || 'none'}`);
      const sampleEdges = relationships.slice(0, 20).map(rel => ({
        type: rel.type,
        startNode: rel.startNode,
        endNode: rel.endNode,
      }));
      core.info(`Sample edges: ${JSON.stringify(sampleEdges, null, 2)}`);
    }

    const cycles = findCircularDependencies(nodes, relationships, ignorePatterns);

    core.info(`Found ${cycles.length} circular dependenc${cycles.length === 1 ? 'y' : 'ies'}`);

    // Step 5: Set outputs
    core.setOutput('circular-dependency-count', cycles.length);
    core.setOutput('circular-dependency-json', JSON.stringify(cycles));

    // Step 6: Post PR comment if enabled
    if (commentOnPr && github.context.payload.pull_request) {
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const octokit = github.getOctokit(token);
        const comment = formatPrComment(cycles);

        await octokit.rest.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: github.context.payload.pull_request.number,
          body: comment,
        });

        core.info('Posted findings to PR');
      } else {
        core.warning('GITHUB_TOKEN not available, skipping PR comment');
      }
    }

    // Step 7: Clean up
    await fs.unlink(zipPath);

    // Step 8: Fail if configured and circular dependencies found
    if (cycles.length > 0 && failOnCircularDeps) {
      core.setFailed(`Found ${cycles.length} circular dependenc${cycles.length === 1 ? 'y' : 'ies'}`);
    }

  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        core.error('Invalid API key. Get your key at https://dashboard.supermodeltools.com');
      } else {
        core.error(`API error (${status})`);
      }
    }

    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();

