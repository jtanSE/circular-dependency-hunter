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
export declare const DEFAULT_EXCLUDE_PATTERNS: string[];
/** Glob patterns for files that are considered entry points. */
export declare const ENTRY_POINT_PATTERNS: string[];
/** Function names that are considered entry points. */
export declare const ENTRY_POINT_FUNCTION_NAMES: string[];
/**
 * Checks if a file path matches any entry point pattern.
 * @param filePath - The file path to check
 * @returns True if the file is an entry point
 */
export declare function isEntryPointFile(filePath: string): boolean;
/**
 * Checks if a function name is a common entry point name.
 * @param name - The function name to check
 * @returns True if the function name is an entry point
 */
export declare function isEntryPointFunction(name: string): boolean;
/**
 * Checks if a file should be ignored based on exclude patterns.
 * @param filePath - The file path to check
 * @param ignorePatterns - Additional patterns to ignore
 * @returns True if the file should be ignored
 */
export declare function shouldIgnoreFile(filePath: string, ignorePatterns?: string[]): boolean;
/**
 * Analyzes a code graph to find functions that are never called.
 * @param nodes - All nodes from the code graph
 * @param relationships - All relationships from the code graph
 * @param ignorePatterns - Additional glob patterns to ignore
 * @returns Array of potentially unused functions
 */
export declare function findDeadCode(nodes: CodeGraphNode[], relationships: CodeGraphRelationship[], ignorePatterns?: string[]): DeadCodeResult[];
/**
 * Formats dead code results as a GitHub PR comment.
 * @param deadCode - Array of dead code results
 * @returns Markdown-formatted comment string
 */
export declare function formatPrComment(deadCode: DeadCodeResult[]): string;
