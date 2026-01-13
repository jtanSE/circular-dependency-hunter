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
export declare const DEFAULT_EXCLUDE_PATTERNS: string[];
/**
 * Checks if a file should be ignored based on exclude patterns.
 * @param filePath - The file path to check
 * @param ignorePatterns - Additional patterns to ignore
 * @returns True if the file should be ignored
 */
export declare function shouldIgnoreFile(filePath: string, ignorePatterns?: string[]): boolean;
/**
 * Analyzes a code graph to find circular dependencies between files/modules.
 * @param nodes - All nodes from the code graph
 * @param relationships - All relationships from the code graph
 * @param ignorePatterns - Additional glob patterns to ignore
 * @returns Array of circular dependency cycles
 */
export declare function findCircularDependencies(nodes: CodeGraphNode[], relationships: CodeGraphRelationship[], ignorePatterns?: string[]): CircularDependencyResult[];
/**
 * Formats circular dependency results as a GitHub PR comment.
 * @param cycles - Array of circular dependency cycles
 * @returns Markdown-formatted comment string
 */
export declare function formatPrComment(cycles: CircularDependencyResult[]): string;
