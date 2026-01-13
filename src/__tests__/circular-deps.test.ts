import { describe, it, expect } from 'vitest';
import {
  findCircularDependencies,
  formatPrComment,
  shouldIgnoreFile,
  CircularDependencyResult,
} from '../circular-deps';
import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';

describe('shouldIgnoreFile', () => {
  it('should ignore node_modules', () => {
    expect(shouldIgnoreFile('node_modules/lodash/index.js')).toBe(true);
  });

  it('should ignore build output', () => {
    expect(shouldIgnoreFile('dist/index.js')).toBe(true);
    expect(shouldIgnoreFile('build/main.js')).toBe(true);
  });

  it('should ignore test files', () => {
    expect(shouldIgnoreFile('src/utils.test.ts')).toBe(true);
    expect(shouldIgnoreFile('src/utils.spec.js')).toBe(true);
    expect(shouldIgnoreFile('src/__tests__/utils.ts')).toBe(true);
  });

  it('should respect custom ignore patterns', () => {
    expect(shouldIgnoreFile('src/generated/api.ts', ['**/generated/**'])).toBe(true);
    expect(shouldIgnoreFile('src/utils.ts', ['**/generated/**'])).toBe(false);
  });
});

describe('findCircularDependencies', () => {
  it('should find a simple cycle', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'a', labels: ['File'], properties: { filePath: 'src/a.ts' } },
      { id: 'b', labels: ['File'], properties: { filePath: 'src/b.ts' } },
      { id: 'c', labels: ['File'], properties: { filePath: 'src/c.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'r1', type: 'imports', startNode: 'a', endNode: 'b' },
      { id: 'r2', type: 'imports', startNode: 'b', endNode: 'c' },
      { id: 'r3', type: 'imports', startNode: 'c', endNode: 'a' },
    ];

    const cycles = findCircularDependencies(nodes, relationships);

    expect(cycles).toHaveLength(1);
    expect(cycles[0].length).toBe(3);
    expect(cycles[0].cycle).toContain('src/a.ts');
    expect(cycles[0].cycle).toContain('src/b.ts');
    expect(cycles[0].cycle).toContain('src/c.ts');
  });

  it('should ignore cycles in ignored paths', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'a', labels: ['File'], properties: { filePath: 'src/__tests__/a.ts' } },
      { id: 'b', labels: ['File'], properties: { filePath: 'src/b.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'r1', type: 'imports', startNode: 'a', endNode: 'b' },
      { id: 'r2', type: 'imports', startNode: 'b', endNode: 'a' },
    ];

    const cycles = findCircularDependencies(nodes, relationships);

    expect(cycles).toHaveLength(0);
  });

  it('should ignore non-dependency relationships', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'a', labels: ['File'], properties: { filePath: 'src/a.ts' } },
      { id: 'b', labels: ['File'], properties: { filePath: 'src/b.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'r1', type: 'calls', startNode: 'a', endNode: 'b' },
      { id: 'r2', type: 'calls', startNode: 'b', endNode: 'a' },
    ];

    const cycles = findCircularDependencies(nodes, relationships);

    expect(cycles).toHaveLength(0);
  });

  it('should accept dependsOn relationships', () => {
    const nodes: CodeGraphNode[] = [
      { id: 'a', labels: ['File'], properties: { filePath: 'src/a.ts' } },
      { id: 'b', labels: ['File'], properties: { filePath: 'src/b.ts' } },
    ];

    const relationships: CodeGraphRelationship[] = [
      { id: 'r1', type: 'dependsOn', startNode: 'a', endNode: 'b' },
      { id: 'r2', type: 'dependsOn', startNode: 'b', endNode: 'a' },
    ];

    const cycles = findCircularDependencies(nodes, relationships);

    expect(cycles).toHaveLength(1);
  });
});

describe('formatPrComment', () => {
  it('should format empty results', () => {
    const comment = formatPrComment([]);
    expect(comment).toContain('No circular dependencies found');
  });

  it('should format multiple cycles', () => {
    const cycles: CircularDependencyResult[] = [
      { id: 'c1', cycle: ['src/a.ts', 'src/b.ts'], length: 2 },
      { id: 'c2', cycle: ['src/c.ts', 'src/d.ts', 'src/e.ts'], length: 3 },
    ];

    const comment = formatPrComment(cycles);

    expect(comment).toContain('2** circular dependenc');
    expect(comment).toContain('src/a.ts -> src/b.ts -> src/a.ts');
    expect(comment).toContain('src/c.ts -> src/d.ts -> src/e.ts -> src/c.ts');
  });
});
