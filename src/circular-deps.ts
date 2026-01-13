import { minimatch } from 'minimatch';
import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';

/**
 * Represents a circular dependency cycle found in the codebase.
 */
export interface CircularDependencyResult {
  id: string;
  cycle: string[];
  length: number;
}

/** Default glob patterns for files to exclude from analysis. */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/__tests__/**',
  '**/__mocks__/**',
];

/**
 * Checks if a file should be ignored based on exclude patterns.
 * @param filePath - The file path to check
 * @param ignorePatterns - Additional patterns to ignore
 * @returns True if the file should be ignored
 */
export function shouldIgnoreFile(filePath: string, ignorePatterns: string[] = []): boolean {
  const allPatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...ignorePatterns];
  return allPatterns.some(pattern => minimatch(filePath, pattern));
}

function getFilePathFromNode(node: CodeGraphNode): string {
  const props = node.properties || {};
  return (
    props.filePath ||
    props.path ||
    props.file ||
    props.name ||
    node.id
  );
}

function isDependencyRelationship(rel: CodeGraphRelationship): boolean {
  const type = (rel.type || '').toLowerCase();
  if (type.includes('call')) {
    return false;
  }
  const dependencyMarkers = [
    'import',
    'depend',
    'require',
    'use',
    'include',
    'reference',
    'module',
  ];
  return dependencyMarkers.some(marker => type.includes(marker));
}

function rotateToSmallest(values: string[]): string[] {
  if (values.length === 0) {
    return values;
  }
  let minIndex = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[minIndex]) {
      minIndex = i;
    }
  }
  return values.slice(minIndex).concat(values.slice(0, minIndex));
}

function normalizeCycle(cycle: string[]): string[] {
  const trimmed = cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]
    ? cycle.slice(0, -1)
    : cycle.slice();

  const forward = rotateToSmallest(trimmed);
  const backward = rotateToSmallest(trimmed.slice().reverse());

  const forwardKey = forward.join('->');
  const backwardKey = backward.join('->');

  return forwardKey <= backwardKey ? forward : backward;
}

/**
 * Analyzes a code graph to find circular dependencies between files/modules.
 * @param nodes - All nodes from the code graph
 * @param relationships - All relationships from the code graph
 * @param ignorePatterns - Additional glob patterns to ignore
 * @returns Array of circular dependency cycles
 */
export function findCircularDependencies(
  nodes: CodeGraphNode[],
  relationships: CodeGraphRelationship[],
  ignorePatterns: string[] = []
): CircularDependencyResult[] {
  const fileNodes = nodes.filter(node =>
    node.labels?.some(label => label === 'File' || label === 'Module')
  );

  const filePathById = new Map<string, string>();
  for (const node of fileNodes) {
    const filePath = getFilePathFromNode(node);
    if (!filePath || shouldIgnoreFile(filePath, ignorePatterns)) {
      continue;
    }
    filePathById.set(node.id, filePath);
  }

  const adjacency = new Map<string, string[]>();
  for (const nodeId of filePathById.keys()) {
    adjacency.set(nodeId, []);
  }

  const dependencyRelationships = relationships.filter(isDependencyRelationship);
  for (const rel of dependencyRelationships) {
    if (!filePathById.has(rel.startNode) || !filePathById.has(rel.endNode)) {
      continue;
    }
    adjacency.get(rel.startNode)?.push(rel.endNode);
  }

  const results: CircularDependencyResult[] = [];
  const seenCycles = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (nodeId: string) => {
    visited.add(nodeId);
    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
        continue;
      }
      if (onStack.has(neighbor)) {
        const cycleStartIndex = stack.indexOf(neighbor);
        const cycleIds = stack.slice(cycleStartIndex).concat(neighbor);
        const cyclePaths = cycleIds.map(id => filePathById.get(id) || id);
        const normalized = normalizeCycle(cyclePaths);
        const cycleKey = normalized.join('->');
        if (!seenCycles.has(cycleKey)) {
          seenCycles.add(cycleKey);
          results.push({
            id: cycleKey,
            cycle: normalized,
            length: normalized.length,
          });
        }
      }
    }

    stack.pop();
    onStack.delete(nodeId);
  };

  for (const nodeId of adjacency.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return results;
}

/**
 * Formats circular dependency results as a GitHub PR comment.
 * @param cycles - Array of circular dependency cycles
 * @returns Markdown-formatted comment string
 */
export function formatPrComment(cycles: CircularDependencyResult[]): string {
  if (cycles.length === 0) {
    return `## Circular Dependency Hunter

No circular dependencies found! Your codebase is clean.`;
  }

  const rows = cycles
    .slice(0, 50)
    .map((cycle, index) => {
      const path = cycle.cycle.concat(cycle.cycle[0]).join(' -> ');
      return `| ${index + 1} | ${path} |`;
    })
    .join('\n');

  let comment = `## Circular Dependency Hunter

Found **${cycles.length}** circular dependenc${cycles.length === 1 ? 'y' : 'ies'}:

| # | Cycle |
|---|-------|
${rows}`;

  if (cycles.length > 50) {
    comment += `\n\n_...and ${cycles.length - 50} more. See action output for full list._`;
  }

  comment += `\n\n---\n_Powered by [Supermodel](https://supermodeltools.com) graph analysis_`;

  return comment;
}
