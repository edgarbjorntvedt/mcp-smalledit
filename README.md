# MCP SmallEdit

A Model Context Protocol (MCP) server that provides tools for making small, targeted edits to files using stream editors like `sed` and `awk`.

## Why SmallEdit?

When making minor changes to files (fixing typos, updating version numbers, changing config values), using full file replacement is inefficient. SmallEdit provides targeted editing capabilities that:

- Save tokens by only specifying what to change
- Reduce errors by not rewriting entire files
- Enable bulk operations across multiple files
- Provide preview capabilities before applying changes
- Inspect files before and after edits for verification
- Search and examine code context efficiently

## Installation

```bash
npm install -g @bard/mcp-smalledit
```

## Tools Available

### 1. `sed_edit`
Make small edits using sed patterns.

**Examples:**
```javascript
// Replace all occurrences
sed_edit({
  file: "package.json",
  pattern: "s/0.1.0/0.2.0/g"
})

// Delete lines containing pattern
sed_edit({
  file: "config.ts",
  pattern: "/DEBUG_MODE/d"
})

// Preview changes first
sed_edit({
  file: "index.ts",
  pattern: "s/foo/bar/g",
  preview: true
})
```

### 2. `sed_multifile`
Apply patterns to multiple files.

**Examples:**
```javascript
// Update imports across all TypeScript files
sed_multifile({
  pattern: "s/'.\\//src\\//g",
  filePattern: "*.ts",
  directory: "src"
})

// Remove console.log from all JS files
sed_multifile({
  pattern: "/console\\.log/d",
  filePattern: "*.js"
})
```

### 3. `quick_replace`
Simple find and replace without regex.

**Examples:**
```javascript
// Replace text literally
quick_replace({
  file: "README.md",
  find: "version 1.0",
  replace: "version 2.0"
})

// Replace only first occurrence
quick_replace({
  file: "config.json",
  find: "localhost",
  replace: "production.server.com",
  all: false
})
```

### 4. `line_edit`
Edit specific lines by number.

**Examples:**
```javascript
// Replace line 42
line_edit({
  file: "index.ts",
  lineNumber: 42,
  action: "replace",
  content: "export const VERSION = '2.0.0';"
})

// Delete lines 10-20
line_edit({
  file: "test.ts",
  lineRange: "10,20",
  action: "delete"
})

// Insert after line 5
line_edit({
  file: "imports.ts",
  lineNumber: 5,
  action: "insert_after",
  content: "import { newModule } from './new-module';"
})
```

### 5. `awk_process`
Process files with AWK for complex operations.

**Examples:**
```javascript
// Sum numbers in second column
awk_process({
  file: "data.csv",
  script: "{sum += $2} END {print sum}"
})

// Extract specific columns
awk_process({
  file: "data.tsv",
  script: "{print $1, $3}",
  outputFile: "extracted.txt"
})
```

### 6. `read_file`
Read and examine file contents with optional filtering.

**Examples:**
```javascript
// Read entire file (first 100 lines)
read_file({
  file: "index.ts"
})

// Read specific line range
read_file({
  file: "config.json",
  lines: "10-20"
})

// Read from line 50 to end
read_file({
  file: "large-file.txt",
  lines: "50-$"
})

// Search for pattern with context
read_file({
  file: "src/app.ts",
  search: "export",
  context: 2
})
```

### 7. `search_in_file`
Search for patterns in files with context lines.

**Examples:**
```javascript
// Basic pattern search
search_in_file({
  file: "index.ts",
  pattern: "function"
})

// Case insensitive search with more context
search_in_file({
  file: "README.md",
  pattern: "installation",
  caseInsensitive: true,
  context: 5
})

// Regex pattern search
search_in_file({
  file: "package.json",
  pattern: "\"version\": \"[0-9.]+\"",
  context: 2
})
```

### 8. `show_around_line`
Show context around a specific line number.

**Examples:**
```javascript
// Show context around line 42
show_around_line({
  file: "index.ts",
  lineNumber: 42
})

// Show more context (10 lines before/after)
show_around_line({
  file: "config.js",
  lineNumber: 25,
  context: 10
})
```

## Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "smalledit": {
      "command": "mcp-smalledit"
    }
  }
}
```

## Common Use Cases

### Version Bumping Workflow
```javascript
// 1. First, check current version
read_file({
  file: "package.json",
  search: "version",
  context: 1
})

// 2. Update the version
sed_edit({
  file: "package.json",
  pattern: 's/"version": "[^"]*"/"version": "1.2.3"/g'
})

// 3. Verify the change
show_around_line({
  file: "package.json",
  lineNumber: 3  // assuming version is around line 3
})
```

### Update Import Paths
```javascript
sed_multifile({
  pattern: "s|'@old/package|'@new/package|g",
  filePattern: "*.ts"
})
```

### Code Inspection Before Editing
```javascript
// Find all function definitions
search_in_file({
  file: "src/main.ts",
  pattern: "function",
  context: 2
})

// Check specific lines before editing
show_around_line({
  file: "src/main.ts",
  lineNumber: 42,
  context: 5
})
```

### Remove Debug Code
```javascript
sed_multifile({
  pattern: "/\\/\\/\\s*DEBUG:/d",
  filePattern: "*.js"
})
```

### Fix Formatting
```javascript
// Add missing semicolons
sed_multifile({
  pattern: "s/^\\([^;]*\\)$/\\1;/",
  filePattern: "*.ts"
})
```

## Safety Features

- **Automatic Backups**: Creates `.bak` files by default
- **Preview Mode**: Test patterns before applying
- **Error Handling**: Clear error messages for invalid patterns
- **File Validation**: Checks file existence before editing

## Notes

- All file paths are relative to the current working directory
- Backup files (`.bak`) are created by default unless disabled
- Use preview mode to test complex patterns
- Escape special characters appropriately in patterns

## License

MIT
-e 
## Known Issues

### Pattern Delimiters
When using path replacements, use pipe  delimiter instead of forward slash  to avoid quoting issues:

```javascript
// ❌ Problematic with paths
sed_edit({ pattern: "s/old/path/new/path/g" })

// ✅ Works correctly
sed_edit({ pattern: "s|old/path|new/path|g" })
```
