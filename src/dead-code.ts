import { minimatch } from 'minimatch';
import { CodeGraphNode, CodeGraphRelationship } from '@supermodeltools/sdk';

/**
 * Represents a potentially unused function found in the codebase.
 */
export interface DeadCodeResult {
  id: string;
  name: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

/** Default glob patterns for files to exclude from dead code analysis. */
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

/** Glob patterns for files that are considered entry points. */
export const ENTRY_POINT_PATTERNS = [
  '**/index.ts',
  '**/index.js',
  '**/main.ts',
  '**/main.js',
  '**/app.ts',
  '**/app.js',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
];

/** Function names that are considered entry points. */
export const ENTRY_POINT_FUNCTION_NAMES = [
  'main',
  'run',
  'start',
  'init',
  'setup',
  'bootstrap',
  'default',
  'handler',
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
];

/**
 * Checks if a file path matches any entry point pattern.
 * @param filePath - The file path to check
 * @returns True if the file is an entry point
 */
export function isEntryPointFile(filePath: string): boolean {
  return ENTRY_POINT_PATTERNS.some(pattern => minimatch(filePath, pattern));
}

/**
 * Checks if a function name is a common entry point name.
 * @param name - The function name to check
 * @returns True if the function name is an entry point
 */
export function isEntryPointFunction(name: string): boolean {
  const lowerName = name.toLowerCase();
  return ENTRY_POINT_FUNCTION_NAMES.some(ep => lowerName === ep.toLowerCase());
}

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

/**
 * Analyzes a code graph to find functions that are never called.
 * @param nodes - All nodes from the code graph
 * @param relationships - All relationships from the code graph
 * @param ignorePatterns - Additional glob patterns to ignore
 * @returns Array of potentially unused functions
 */
export function findDeadCode(
  nodes: CodeGraphNode[],
  relationships: CodeGraphRelationship[],
  ignorePatterns: string[] = []
): DeadCodeResult[] {
  const functionNodes = nodes.filter(node =>
    node.labels?.includes('Function')
  );

  const callRelationships = relationships.filter(rel => rel.type === 'calls');
  const calledFunctionIds = new Set(callRelationships.map(rel => rel.endNode));

  const deadCode: DeadCodeResult[] = [];

  for (const node of functionNodes) {
    const props = node.properties || {};
    const filePath = props.filePath || props.file || '';
    const name = props.name || 'anonymous';

    if (calledFunctionIds.has(node.id)) {
      continue;
    }

    if (shouldIgnoreFile(filePath, ignorePatterns)) {
      continue;
    }

    if (isEntryPointFile(filePath)) {
      continue;
    }

    if (isEntryPointFunction(name)) {
      continue;
    }

    if (props.exported === true || props.isExported === true) {
      continue;
    }

    deadCode.push({
      id: node.id,
      name,
      filePath,
      startLine: props.startLine,
      endLine: props.endLine,
    });
  }

  return deadCode;
}

/**
 * Formats dead code results as a GitHub PR comment.
 * @param deadCode - Array of dead code results
 * @returns Markdown-formatted comment string
 */
export function formatPrComment(deadCode: DeadCodeResult[]): string {
  if (deadCode.length === 0) {
    return `## Dead Code Hunter

No dead code found! Your codebase is clean.`;
  }

  const rows = deadCode
    .slice(0, 50)
    .map(dc => {
      const lineInfo = dc.startLine ? `L${dc.startLine}` : '';
      const fileLink = dc.startLine
        ? `${dc.filePath}#L${dc.startLine}`
        : dc.filePath;
      return `| \`${dc.name}\` | ${fileLink} | ${lineInfo} |`;
    })
    .join('\n');

  let comment = `## Dead Code Hunter

Found **${deadCode.length}** potentially unused function${deadCode.length === 1 ? '' : 's'}:

| Function | File | Line |
|----------|------|------|
${rows}`;

  if (deadCode.length > 50) {
    comment += `\n\n_...and ${deadCode.length - 50} more. See action output for full list._`;
  }

  comment += `\n\n---\n_Powered by [Supermodel](https://supermodeltools.com) graph analysis_`;

  return comment;
}
