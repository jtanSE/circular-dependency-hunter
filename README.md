# Circular Dependency Hunter

A GitHub Action that finds circular dependencies in your codebase using [Supermodel](https://supermodeltools.com).

## Installation

### 1. Get an API key

Sign up at [dashboard.supermodeltools.com](https://dashboard.supermodeltools.com) and create an API key.

### 2. Add the secret to your repository

Go to your repo Settings -> Secrets and variables -> Actions -> New repository secret

- Name: `SUPERMODEL_API_KEY`
- Value: Your API key from step 1

### 3. Create a workflow file

Create `.github/workflows/circular-deps.yml` in your repository:

```yaml
name: Circular Dependency Hunter

on:
  pull_request:

jobs:
  hunt:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: supermodeltools/circular-dependency-hunter@v1
        with:
          supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
```

That's it! The action will now analyze your code on every PR and comment with any circular dependencies found.

## Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `supermodel-api-key` | Your Supermodel API key | Yes | - |
| `comment-on-pr` | Post findings as PR comment | No | `true` |
| `fail-on-circular-deps` | Fail the action if circular deps are found | No | `false` |
| `ignore-patterns` | JSON array of glob patterns to ignore | No | `[]` |

### Example with options

```yaml
- uses: supermodeltools/circular-dependency-hunter@v1
  with:
    supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
    fail-on-circular-deps: true
    ignore-patterns: '["**/generated/**", "**/migrations/**"]'
```

## What it does

1. Creates a zip of your repository
2. Sends it to Supermodel for analysis
3. Builds a dependency graph
4. Detects circular dependency cycles
5. Posts findings as a PR comment

## Example output

> ## Circular Dependency Hunter
>
> Found **2** circular dependencies:
>
> | # | Cycle |
> |---|-------|
> | 1 | src/a.ts -> src/b.ts -> src/a.ts |
> | 2 | src/models/user.ts -> src/db/index.ts -> src/models/user.ts |
>
> ---
> _Powered by [Supermodel](https://supermodeltools.com) graph analysis_

## False positive filtering

The action automatically skips:

- **Test files**: `*.test.ts`, `*.spec.ts`, `__tests__/**`
- **Build output**: `node_modules`, `dist`, `build`, `target`

## Supported languages

- TypeScript / JavaScript
- Python
- Java
- Go
- Rust
- And more...

## License

MIT
