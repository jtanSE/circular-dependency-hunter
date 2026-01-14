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

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
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

function resolveFilePath(candidate: string, referencePaths: Set<string>): string | undefined {
  const normalized = normalizePath(candidate);
  if (referencePaths.has(normalized)) {
    return normalized;
  }

  const hasExtension = /\.[^/]+$/.test(normalized);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  if (!hasExtension) {
    for (const ext of extensions) {
      const withExt = `${normalized}${ext}`;
      if (referencePaths.has(withExt)) {
        return withExt;
      }
      const withIndex = `${normalized}/index${ext}`;
      if (referencePaths.has(withIndex)) {
        return withIndex;
      }
    }
  }

  return undefined;
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
  const fileNodePaths = new Set<string>();
  for (const node of nodes) {
    if (!node.labels?.some(label => label === 'File' || label === 'Module')) {
      continue;
    }
    const rawPath = normalizePath(getFilePathFromNode(node));
    if (!rawPath || shouldIgnoreFile(rawPath, ignorePatterns)) {
      continue;
    }
    fileNodePaths.add(rawPath);
  }

  const referencePaths = fileNodePaths.size > 0 ? fileNodePaths : new Set<string>();
  if (fileNodePaths.size === 0) {
    for (const node of nodes) {
      const rawPath = normalizePath(getFilePathFromNode(node));
      if (!rawPath || shouldIgnoreFile(rawPath, ignorePatterns)) {
        continue;
      }
      referencePaths.add(rawPath);
    }
  }

  const filePathById = new Map<string, string>();
  for (const node of nodes) {
    const rawPath = normalizePath(getFilePathFromNode(node));
    if (!rawPath || shouldIgnoreFile(rawPath, ignorePatterns)) {
      continue;
    }
    const resolved = resolveFilePath(rawPath, referencePaths) || rawPath;
    filePathById.set(node.id, resolved);
  }

  const adjacency = new Map<string, Set<string>>();
  for (const filePath of filePathById.values()) {
    if (!adjacency.has(filePath)) {
      adjacency.set(filePath, new Set<string>());
    }
  }

  const dependencyRelationships = relationships.filter(isDependencyRelationship);
  for (const rel of dependencyRelationships) {
    const startPath = filePathById.get(rel.startNode);
    const endPath = filePathById.get(rel.endNode);
    if (!startPath || !endPath) {
      continue;
    }
    if (startPath === endPath) {
      continue;
    }
    adjacency.get(startPath)?.add(endPath);
  }

  const results: CircularDependencyResult[] = [];
  const seenCycles = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (nodePath: string) => {
    visited.add(nodePath);
    stack.push(nodePath);
    onStack.add(nodePath);

    const neighbors = adjacency.get(nodePath) || new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
        continue;
      }
      if (onStack.has(neighbor)) {
        const cycleStartIndex = stack.indexOf(neighbor);
        const cycleIds = stack.slice(cycleStartIndex).concat(neighbor);
        const normalized = normalizeCycle(cycleIds);
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
    onStack.delete(nodePath);
  };

  for (const nodePath of adjacency.keys()) {
    if (!visited.has(nodePath)) {
      dfs(nodePath);
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
