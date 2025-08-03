#!/usr/bin/env node
/**
 * MCP SmallEdit Server
 * Provides tools for making small, targeted edits to files using sed and other stream editors
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';


type ToolArgsMap = {
  'sed_edit': {
  file: string | boolean;
  pattern: string | boolean;
  backup?: string | boolean;
  preview?: string | boolean;
  };
  'sed_multifile': {
  pattern: string | boolean;
  filePattern: string | boolean;
  directory?: string | boolean;
  backup?: string | boolean;
  };
  'quick_replace': {
  file: string | boolean;
  find: string | boolean;
  replace: string | boolean;
  all?: string | boolean;
  };
  'line_edit': {
  file: string | boolean;
  lineNumber: string | boolean;
  lineRange: string | boolean;
  action: string | boolean;
  content: string | boolean;
  };
  'awk_process': {
  file: string | boolean;
  script: string | boolean;
  outputFile: string | boolean;
  };
  'diff_preview': {
  file: string | boolean;
  script: string | boolean;
  backup?: string | boolean;
  multiline?: string | boolean;
  };
  'perl_edit': {
  file: string | boolean;
  command: string | boolean;
  tool?: string | boolean;
  };
  'restore_backup': {
  file: string | boolean;
  keepBackup?: string | boolean;
  };
  'list_backups': {
  directory?: string | boolean;
  pattern?: string | boolean;
  };
  'read_file': {
  file: string | boolean;
  lines?: string | boolean;
  search?: string | boolean;
  context?: string | boolean;
  };
  'search_in_file': {
  file: string | boolean;
  pattern: string | boolean;
  context?: string | boolean;
  caseInsensitive?: string | boolean;
  };
  'show_around_line': {
  file: string | boolean;
  lineNumber: string | boolean;
  context?: string | boolean;
  };
  'overview': {
  tool?: string | boolean;
  };
};

type ToolArg<T extends keyof ToolArgsMap> = ToolArgsMap[T];
const execAsync = promisify(exec);

// Initialize server
const server = new Server(
  {
    name: 'mcp-smalledit',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sed_edit',
        description: 'Make small edits to files using sed patterns. Efficient for single-line changes, pattern replacements, and simple text transformations.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            pattern: {
              type: 'string',
              description: 'Sed pattern (e.g., "s/old/new/g" for substitution)'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup file before editing'
            },
            preview: {
              type: 'boolean',
              default: false,
              description: 'Preview changes without modifying file'
            }
          },
          required: ['file', 'pattern']
        }
      },
      {
        name: 'sed_multifile',
        description: 'Apply sed pattern to multiple files matching a glob pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Sed pattern to apply'
            },
            filePattern: {
              type: 'string',
              description: 'File glob pattern (e.g., "*.ts", "src/**/*.js")'
            },
            directory: {
              type: 'string',
              default: '.',
              description: 'Starting directory for search'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup files'
            }
          },
          required: ['pattern', 'filePattern']
        }
      },
      {
        name: 'awk_process',
        description: 'Process files using AWK for more complex operations like column manipulation, calculations, or conditional processing',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Input file path'
            },
            script: {
              type: 'string',
              description: 'AWK script to execute'
            },
            outputFile: {
              type: 'string',
              description: 'Output file path (optional, defaults to stdout)'
            }
          },
          required: ['file', 'script']
        }
      },
      {
        name: 'quick_replace',
        description: 'Simple find and replace across a file without regex',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            find: {
              type: 'string',
              description: 'Text to find (literal, not regex)'
            },
            replace: {
              type: 'string',
              description: 'Text to replace with'
            },
            all: {
              type: 'boolean',
              default: true,
              description: 'Replace all occurrences (false = first only)'
            }
          },
          required: ['file', 'find', 'replace']
        }
      },
      {
        name: 'line_edit',
        description: 'Edit specific lines by number or range',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            lineNumber: {
              type: 'number',
              description: 'Line number to edit (1-based)'
            },
            lineRange: {
              type: 'string',
              description: 'Line range (e.g., "10,20" or "5,$")'
            },
            action: {
              type: 'string',
              enum: ['replace', 'delete', 'insert_after', 'insert_before'],
              description: 'Action to perform'
            },
            content: {
              type: 'string',
              description: 'New content (for replace/insert actions)'
            }
          },
          required: ['file', 'action']
        }
      },
      {
        name: 'perl_edit',
        description: 'Edit files using Perl one-liners (more powerful than sed, better cross-platform support)',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to edit'
            },
            script: {
              type: 'string', 
              description: 'Perl script (e.g., "s/old/new/g" or "$_ = uc" for uppercase)'
            },
            backup: {
              type: 'boolean',
              default: true,
              description: 'Create backup file'
            },
            multiline: {
              type: 'boolean',
              default: false,
              description: 'Enable multiline mode (-0777)'
            }
          },
          required: ['file', 'script']
        }
      },
      {
        name: 'diff_preview', 
        description: 'Preview what changes would be made by showing a diff',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to preview changes for'
            },
            command: {
              type: 'string',
              description: 'Command that would make changes (e.g., "s/old/new/g")'
            },
            tool: {
              type: 'string',
              enum: ['sed', 'perl', 'awk'],
              default: 'perl',
              description: 'Which tool to use for the preview'
            }
          },
          required: ['file', 'command']
        }
      },
      {
        name: 'restore_backup',
        description: 'Restore a file from its most recent backup (.bak)',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to restore from backup'
            },
            keepBackup: {
              type: 'boolean',
              default: true,
              description: 'Keep the backup file after restoring'
            }
          },
          required: ['file']
        }
      },
      {
        name: 'list_backups',
        description: 'List all backup files in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              default: '.',
              description: 'Directory to search for backup files'
            },
            pattern: {
              type: 'string',
              default: '*.bak',
              description: 'Backup file pattern'
            }
          }
        }
      },
      {
        name: 'read_file',
        description: 'Read and examine file contents with options for line ranges, search patterns, or full file viewing',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the file to read'
            },
            lines: {
              type: 'string',
              description: 'Line range (e.g., "10-20", "1-5", "20-$")'
            },
            search: {
              type: 'string',
              description: 'Search pattern with context'
            },
            context: {
              type: 'number',
              default: 3,
              description: 'Lines of context around search matches'
            }
          },
          required: ['file']
        }
      },
      {
        name: 'search_in_file',
        description: 'Search for patterns in a file and show results with context',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the file to search'
            },
            pattern: {
              type: 'string',
              description: 'Pattern to search for (can be regex)'
            },
            context: {
              type: 'number',
              default: 3,
              description: 'Lines of context around matches'
            },
            caseInsensitive: {
              type: 'boolean',
              default: false,
              description: 'Case insensitive search'
            }
          },
          required: ['file', 'pattern']
        }
      },
      {
        name: 'show_around_line',
        description: 'Show content around a specific line number for context verification',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Path to the file'
            },
            lineNumber: {
              type: 'number',
              description: 'Line number to center on'
            },
            context: {
              type: 'number',
              default: 5,
              description: 'Lines before and after to show'
            }
          },
          required: ['file', 'lineNumber']
        }
      },
      {
        name: 'help',
        description: 'Get detailed help and examples for smalledit tools',
        inputSchema: {
          type: 'object',
          properties: {
            tool: {
              type: 'string',
              description: 'Tool name for help (e.g., "sed_edit", "perl_edit") or "all" for overview'
            }
          }
        }
      }
    ]
  };
});

// Help content for each tool
const helpContent = {
  overview: `SmallEdit MCP Tool - Help
========================
Provides efficient tools for small, targeted file edits.

Available tools:
- sed_edit: Pattern-based file editing (uses perl backend)
- perl_edit: Direct perl one-liner execution
- quick_replace: Simple find/replace without regex
- line_edit: Edit specific lines by number
- awk_process: AWK script processing
- sed_multifile: Apply patterns to multiple files
- diff_preview: Preview changes before applying
- restore_backup: Restore files from .bak backups
- list_backups: Find all backup files
- read_file: Read and examine file contents with ranges/search
- search_in_file: Search for patterns in files with context
- show_around_line: Show content around specific line numbers
- help: This help system

🎯 WHEN TO USE SMALLEDIT vs FILESYSTEM TOOLS:
==========================================
USE SMALLEDIT FOR:
- Single line changes
- Simple pattern replacements  
- Version number updates
- Removing debug statements
- Quick find/replace operations
- Bulk simple edits across files

USE FILESYSTEM TOOLS INSTEAD FOR:
- Multi-line code blocks
- Complex JSON/YAML structures
- Adding new functions or classes
- Large refactoring operations
- Any edit that's hard to express as a pattern
- When you need precise control over formatting

⚠️ COMMON ISSUES TO AVOID:
- Don't use smalledit for complex multi-line edits
- Be careful with quotes in shell commands
- Always preview changes first with diff_preview
- Clean up .bak files periodically
- Remember perl syntax differs from sed

💡 BETTER ALTERNATIVES:
- Instead of sed → Use perl (more portable)
- For JSON files → Consider jq instead
- For YAML files → Consider yq instead  
- For modern sed → Install 'sd' (brew install sd)
- For better grep → Use ripgrep (rg)

💡 RECOMMENDED WORKFLOW:
1. Use diff_preview first to check changes
2. If it looks good, apply the edit
3. If something goes wrong, use restore_backup
4. Use list_backups to find and clean old backups

General tips:
- Always use preview/diff_preview to test first
- Backups are created by default (.bak files)
- Perl patterns are more portable than sed
- Use quotes carefully in patterns

🛑 TROUBLESHOOTING:
================
If you see errors like:
- "undefined label 'ard/Code'" → macOS sed issue, use perl instead
- "unterminated substitute" → Quote escaping problem
- "extra characters at end" → Multi-line content issue, use filesystem tools
- "division by zero" (awk) → Check field separators and data format

📦 SMALLEDIT PHILOSOPHY:
=====================
SmallEdit is designed for SMALL edits. If you're trying to do something
complex and getting errors, you're probably using the wrong tool.
That's not a bug - it's a feature! Use filesystem:edit_file instead.
`,
  sed_edit: `sed_edit - Pattern-based file editing
===================================
Uses perl backend for cross-platform compatibility.

Examples:
  // Simple replacement
  sed_edit({ file: "config.json", pattern: "s/localhost/production/g" })
  
  // Delete lines containing pattern
  sed_edit({ file: "app.js", pattern: "$_ = '' if /console\\.log/" })
  
  // Preview changes first
  sed_edit({ file: "test.txt", pattern: "s/old/new/g", preview: true })
  
  // Edit without backup
  sed_edit({ file: "temp.txt", pattern: "s/a/b/g", backup: false })

Note: Actually uses perl internally for better compatibility.

WHEN NOT TO USE:
- Multi-line replacements
- Complex code modifications  
- JSON/YAML structure changes
→ Use filesystem:edit_file instead!
`,
  perl_edit: `perl_edit - Perl one-liner execution
===================================
Direct access to perl's text processing power.

Examples:
  // Simple substitution
  perl_edit({ file: "data.txt", script: "s/foo/bar/g" })
  
  // Delete lines
  perl_edit({ file: "log.txt", script: "$_ = '' if /DEBUG/" })
  
  // Transform to uppercase
  perl_edit({ file: "names.txt", script: "$_ = uc" })
  
  // Complex multiline operations
  perl_edit({ 
    file: "code.js", 
    script: "s/function\\s+(\\w+)\\s*\\(/const $1 = (/g",
    multiline: true 
  })

Tips:
- Use $_ for the current line
- Escape backslashes in regex
- multiline mode slurps entire file
`,
  quick_replace: `quick_replace - Simple find and replace
=====================================
Literal text replacement without regex.

Examples:
  // Replace all occurrences
  quick_replace({ file: "doc.txt", find: "Version 1.0", replace: "Version 2.0" })
  
  // Replace only first occurrence  
  quick_replace({ file: "config.ini", find: "debug=true", replace: "debug=false", all: false })
  
  // Replace with special characters
  quick_replace({ file: "data.csv", find: "$price", replace: "\\$19.99" })

Note: Special regex characters are automatically escaped.
`,
  line_edit: `line_edit - Line-specific operations
==================================
Edit, delete, or insert at specific line numbers.

Examples:
  // Replace line 10
  line_edit({ file: "list.txt", lineNumber: 10, action: "replace", content: "New line 10" })
  
  // Delete lines 5-15
  line_edit({ file: "data.txt", lineRange: "5,15", action: "delete" })
  
  // Insert after line 1
  line_edit({ file: "imports.js", lineNumber: 1, action: "insert_after", content: "import React from 'react';" })
  
  // Insert before last line
  line_edit({ file: "footer.html", lineRange: "$", action: "insert_before", content: "<!-- Updated -->" })

Ranges:
- Single line: lineNumber: 42
- Range: lineRange: "10,20" 
- To end: lineRange: "5,$"
`,
  awk_process: `awk_process - AWK script processing
=================================
Powerful text processing with AWK.

Examples:
  // Sum second column
  awk_process({ file: "numbers.txt", script: "{sum += $2} END {print sum}" })
  
  // Process CSV (comma-separated)
  awk_process({ file: "data.csv", script: "BEGIN{FS=\",\"} {print $1, $3}" })
  
  // Filter and calculate
  awk_process({ 
    file: "sales.txt", 
    script: "$3 > 100 {count++; total += $3} END {print \"Count:\", count, \"Avg:\", total/count}"
  })
  
  // Output to file
  awk_process({ file: "input.txt", script: "{print $2, $1}", outputFile: "reversed.txt" })

Tips:
- Use FS for field separator
- $1, $2 etc are fields
- NR is line number
- END block runs after processing
`,
  sed_multifile: `sed_multifile - Multi-file operations  
===================================
Apply patterns to multiple files at once.

Examples:
  // Update all JS files
  sed_multifile({ filePattern: "*.js", pattern: "s/var /let /g" })
  
  // Process files in subdirectories
  sed_multifile({ 
    directory: "./src", 
    filePattern: "*.ts", 
    pattern: "s/console\\.log.*//g" 
  })
  
  // Without backups (careful!)
  sed_multifile({ filePattern: "*.tmp", pattern: "s/old/new/g", backup: false })

Note: Uses perl internally. Be careful with patterns affecting many files!
`,
  diff_preview: `diff_preview - Preview changes
============================
See what changes would be made before applying.

Examples:
  // Preview perl substitution
  diff_preview({ file: "config.json", command: "s/8080/3000/g" })
  
  // Preview with sed syntax
  diff_preview({ file: "data.txt", command: "10,20d", tool: "sed" })
  
  // Preview AWK processing  
  diff_preview({ file: "log.csv", command: "BEGIN{FS=\",\"} {print $2}", tool: "awk" })

Output:
- Shows unified diff format
- No changes made to original file
- Temp files are cleaned up
`,
  restore_backup: `restore_backup - Restore from backup
=================================
Restore a file from its .bak backup file.

Examples:
  // Basic restore
  restore_backup({ file: "config.json" })
  // Looks for config.json.bak and restores it
  
  // Restore and remove backup
  restore_backup({ file: "data.txt", keepBackup: false })
  
  // After a bad edit
  sed_edit({ file: "app.js", pattern: "s/function/fungtion/g" }) // Oops!
  restore_backup({ file: "app.js" }) // Fixed!

Safety features:
- Creates .before-restore backup of current file
- Checks for alternative backup formats (.backup, .orig, ~)
- Clear error if no backup found
`,
  list_backups: `list_backups - Find backup files
==============================
List all backup files in a directory.

Examples:
  // List all .bak files in current directory
  list_backups({})
  
  // Search specific directory
  list_backups({ directory: "./src" })
  
  // Find different backup patterns
  list_backups({ pattern: "*.backup" })
  list_backups({ pattern: "*~" })  // Emacs-style
  
  // Check entire project
  list_backups({ directory: ".", pattern: "*.bak" })

Output shows:
- Backup file path
- File size
- Modification date
- Original file name (inferred)

Useful for cleanup or finding old versions.
`,
  read_file: `read_file - Read and examine file contents
===========================================
Read files with line ranges, search patterns, or full content viewing.

Examples:
  // Read entire file (limited to 100 lines)
  read_file({ file: "config.json" })
  
  // Read specific line range
  read_file({ file: "app.js", lines: "10-20" })
  read_file({ file: "data.txt", lines: "50-$" }) // Line 50 to end
  
  // Search with context
  read_file({ file: "server.js", search: "function.*start", context: 5 })
  
  // Quick verification after edit
  sed_edit({ file: "config.js", pattern: "s/8080/3000/g" })
  read_file({ file: "config.js", search: "3000", context: 2 })

Modes:
- Full file: Shows first 100 lines with line numbers
- Line range: Shows specific lines ("start-end" format)
- Search: Shows matches with surrounding context

Perfect for:
- Verifying edits without using brain
- Understanding file structure
- Finding content before making changes
`,
  search_in_file: `search_in_file - Advanced file searching
=======================================
Search for patterns with context and case options.

Examples:
  // Basic search
  search_in_file({ file: "app.js", pattern: "console\\.log" })
  
  // Case insensitive with more context
  search_in_file({ 
    file: "README.md", 
    pattern: "installation", 
    caseInsensitive: true,
    context: 5 
  })
  
  // Find function definitions
  search_in_file({ file: "utils.js", pattern: "^function\\s+\\w+" })
  
  // Search for TODO comments
  search_in_file({ file: "src/main.ts", pattern: "TODO|FIXME|XXX" })

Features:
- Regex pattern support
- Case sensitive/insensitive options
- Configurable context lines
- Multiple matches per file
- Line numbers for easy navigation

Great for:
- Finding where to make edits
- Code review and debugging
- Locating specific patterns
`,
  show_around_line: `show_around_line - Show context around specific lines
===================================================
Display content around a specific line number.

Examples:
  // Show context around line 42
  show_around_line({ file: "server.js", lineNumber: 42 })
  
  // More context (10 lines before/after)
  show_around_line({ file: "config.json", lineNumber: 15, context: 10 })
  
  // Verify edit results
  line_edit({ file: "app.js", lineNumber: 25, action: "replace", content: "const port = 3000;" })
  show_around_line({ file: "app.js", lineNumber: 25, context: 3 })

Output:
- Shows line numbers
- Centers on target line
- Configurable context (default: 5 lines)
- Marked target line with >

Perfect for:
- Verifying line-based edits
- Understanding code context
- Quick inspection after changes
- Debugging specific line issues
`
};

// Tool implementation handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'sed_edit': {
        const { file, pattern, backup = true, preview = false } = args as ToolArg<'sed_edit'>;
        
        // Check if file exists
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Build sed command - use perl for better compatibility
        let sedCmd;
        if (preview) {
          // For preview, create a temp copy and diff
          const tempFile = `${file}.preview.tmp`;
          await execAsync(`rm -f .bak; cp '${file}' '${tempFile}'`);
          
          // Apply change to temp file
          sedCmd = `perl -i -pe '${pattern}' '${tempFile}' && diff -u '${file}' '${tempFile}' | head -50; rm -f '${tempFile}'`;
        } else {
          // Use perl for actual edits (more portable than sed)
          const backupExt = backup ? '.bak' : '';
          sedCmd = `perl -i${backupExt} -pe '${pattern}' '${file}'`;
        }
        
        const { stdout, stderr } = await execAsync(sedCmd);
        
        if (stderr) {
          throw new Error(`Sed error: ${stderr}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: preview ? 
                `Preview of changes:\n${stdout || 'No changes would be made'}` :
                `Successfully edited ${file}${backup ? ' (backup created as .bak)' : ''}`
            }
          ]
        };
      }
      
      case 'sed_multifile': {
        const { pattern, filePattern, directory = '.', backup = true } = args as ToolArg<'sed_multifile'>;
        
        // Use find to get files matching pattern
        const findCmd = `find ${directory} -name "${filePattern}" -type f`;
        const { stdout: files } = await execAsync(typeof findCmd === 'string' ? findCmd : '');
        
        if (!files.trim()) {
          return {
            content: [{
              type: 'text',
              text: `No files found matching pattern: ${filePattern}`
            }]
          };
        }
        
        const fileList = files.trim().split('\n');
        const results = [];
        
        for (const file of fileList) {
          try {
            const backupExt = backup ? '.bak' : '';
            const sedCmd = `perl -i${backupExt} -pe '${pattern}' '${file}'`;
            await execAsync(typeof sedCmd === 'string' ? sedCmd : '');
            results.push(`✓ ${file}`);
          } catch (error) {
            results.push(`✗ ${file}: ${(error as any).message}`);
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: `Processed ${fileList.length} files:\n${results.join('\n')}`
          }]
        };
      }
      
      case 'awk_process': {
        const { file, script, outputFile } = args as ToolArg<'awk_process'>;
        
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let awkCmd = `awk '${script}' '${file}'`;
        if (outputFile) {
          awkCmd += ` > '${outputFile}'`;
        }
        
        const { stdout, stderr } = await execAsync(typeof awkCmd === 'string' ? awkCmd : '');
        
        if (stderr) {
          throw new Error(`AWK error: ${stderr}`);
        }
        
        return {
          content: [{
            type: 'text',
            text: outputFile ? 
              `Processed ${file} -> ${outputFile}` :
              stdout || 'AWK processing complete'
          }]
        };
      }
      
      case 'quick_replace': {
        const { file, find, replace, all = true } = args as ToolArg<'quick_replace'>;
        
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Escape special characters for sed
        const escapedFind = (typeof find === 'string' ? find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "'\\''") : '');
        const escapedReplace = (typeof replace === 'string' ? replace.replace(/[&/\\]/g, '\\$&').replace(/'/g, "'\\''") : '');

        const pattern = all ?
          `s/${escapedFind}/${escapedReplace}/g` :
          `s/${escapedFind}/${escapedReplace}/`;
        
        const sedCmd = `sed -i.bak '${pattern}' '${file}'`;
        await execAsync(typeof sedCmd === 'string' ? sedCmd : '');
        
        return {
          content: [{
            type: 'text',
            text: `Replaced "${find}" with "${replace}" in ${file}`
          }]
        };
      }
      
      case 'line_edit': {
        const { file, lineNumber, lineRange, action, content } = args as ToolArg<'line_edit'>;
        
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let sedCmd = 'sed -i.bak ';
        const range = lineRange || `${lineNumber}`;

        // Escape single quotes in content for sed
        const escapedContent = content ? String(content).replace(/'/g, "'\\''") : '';

        switch (action) {
          case 'replace':
            sedCmd += `'${range}s/.*/${escapedContent}/' '${file}'`;
            break;
          case 'delete':
            sedCmd += `'${range}d' '${file}'`;
            break;
          case 'insert_after':
            sedCmd += `'${range}a\\
${escapedContent}' '${file}'`;
            break;
          case 'insert_before':
            sedCmd += `'${range}i\\
${escapedContent}' '${file}'`;
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        await execAsync(typeof sedCmd === 'string' ? sedCmd : '');
        
        return {
          content: [{
            type: 'text',
            text: `Successfully performed ${action} on line(s) ${range} in ${file}`
          }]
        };
      }
      
      case 'perl_edit': {
        const { file, script, backup = true, multiline = false } = args as ToolArg<'diff_preview'>;
        
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        const backupExt = backup ? '.bak' : '';
        const multilineFlag = multiline ? '-0777 ' : '';
        const perlCmd = `perl -i${backupExt} ${multilineFlag}-pe '${script}' '${file}'`;
        
        await execAsync(typeof perlCmd === 'string' ? perlCmd : '');
        
        return {
          content: [{
            type: 'text',
            text: `Successfully edited ${file} using Perl${backup ? ' (backup created as .bak)' : ''}`
          }]
        };
      }
      
      case 'diff_preview': {
        const { file, command, tool = 'perl' } = args as ToolArg<'perl_edit'>;
        
        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Create temp file
        const tempFile = `${file}.preview.tmp`;
        await execAsync(`rm -f .bak; cp '${file}' '${tempFile}'`);
        
        // Apply command to temp file
        let editCmd;
        switch (tool) {
          case 'perl':
            editCmd = `perl -i -pe '${command}' '${tempFile}'`;
            break;
          case 'sed':
            editCmd = `sed -i.tmp '${command}' '${tempFile}' && rm -f '${tempFile}.tmp'`;
            break;
          case 'awk':
            editCmd = `awk '${command}' '${tempFile}' > '${tempFile}.new' && mv '${tempFile}.new' '${tempFile}'`;
            break;
        }
        
        await execAsync(typeof editCmd === 'string' ? editCmd : '');
        
        // Generate diff
        const { stdout } = await execAsync(`diff -u '${file}' '${tempFile}' || true`);
        
        // Cleanup
        await execAsync(`rm -f '${tempFile}'`);
        
        return {
          content: [{
            type: 'text',
            text: stdout ? `Preview of changes:\n${stdout}` : 'No changes would be made'
          }]
        };
      }
      
      case 'help': {
        const { tool = 'all' } = args as ToolArg<'perl_edit'>;
        
        const helpKey = tool === 'all' ? 'overview' : tool;
        const toolKey = String(helpKey) as keyof typeof helpContent;
        const content = helpContent[toolKey] || `No help available for tool: ${tool}\n\nAvailable tools: ${Object.keys(helpContent).join(', ')}`;

        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }
      
      case 'restore_backup': {
        const { file, keepBackup = true } = args as ToolArg<'restore_backup'>;
        
        const backupFile = `${file}.bak`;
        
        // Check if backup exists
        if (typeof backupFile === 'string' && !existsSync(backupFile)) {
          // Look for other common backup patterns
          const alternatives = [
            `${file}~`,
            `${file}.backup`,
            `${file}.orig`
          ].filter(existsSync);
          
          if (alternatives.length > 0) {
            throw new Error(`No .bak file found, but found: ${alternatives.join(', ')}`);
          }
          throw new Error(`No backup file found for ${file}`);
        }
        
        // Read backup content
        const backupContent = await readFile(typeof backupFile === 'string' ? backupFile : '', 'utf-8');
        
        // Check if current file exists and create a safety backup
        if (typeof file === 'string' && existsSync(file)) {
          await writeFile(`${file}.before-restore`, await readFile(typeof file === 'string' ? file : '', 'utf-8'));
        }
        
        // Restore the backup
        await writeFile(typeof file === 'string' ? file : '', backupContent);
        
        // Remove backup if requested
        if (!keepBackup) {
          await execAsync(`rm -f '${backupFile}'`);
        }
        
        return {
          content: [{
            type: 'text',
            text: `Successfully restored ${file} from backup${!keepBackup ? ' (backup removed)' : ''}\nSafety backup created: ${file}.before-restore`
          }]
        };
      }
      
      case 'list_backups': {
        const { directory = '.', pattern = '*.bak' } = args as ToolArg<'sed_multifile'>;
        
        // Find all backup files
        const findCmd = `find ${directory} -name "${pattern}" -type f | head -100`;
        const { stdout } = await execAsync(typeof findCmd === 'string' ? findCmd : '');
        
        if (!stdout.trim()) {
          return {
            content: [{
              type: 'text',
              text: `No backup files found matching pattern: ${pattern}`
            }]
          };
        }
        
        const files = stdout.trim().split('\n');
        
        // Get file info for each backup
        const backupInfo = [];
        for (const backupFile of files) {
          try {
            const stats = await execAsync(`stat -f "%m %z" '${backupFile}' 2>/dev/null || stat -c "%Y %s" '${backupFile}'`);
            const [mtime, size] = stats.stdout.trim().split(' ');
            const date = new Date(parseInt(mtime) * 1000).toISOString().split('T')[0];
            const sizeKB = Math.round(parseInt(size) / 1024);
            
            // Infer original file name
            const originalFile = (typeof backupFile === 'string' ? backupFile.replace(/\.(bak|backup|orig|~)$/, '') : '');
            backupInfo.push(`${backupFile} (${sizeKB}KB, ${date}) -> ${originalFile}`);
          } catch {
            backupInfo.push(backupFile);
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: `Found ${files.length} backup files:\n\n${backupInfo.join('\n')}\n\nTip: Use restore_backup to restore any of these files`
          }]
        };
      }

      case 'read_file': {
        const { file, lines, search, context = 3 } = args as ToolArg<'read_file'>;

        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }

        const content = await readFile(typeof file === 'string' ? file : '', 'utf-8');
        const fileLines = content.split('\n');

        if (search) {
          // Search mode - find pattern and show with context
          const results: string[] = [];
          const regex = new RegExp(String(search), 'gi');

          fileLines.forEach((line, index) => {
            if (regex.test(line)) {
              const startLine = Math.max(0, index - Number(context));
              const endLine = Math.min(fileLines.length - 1, index + Number(context));

              results.push(`\n--- Match at line ${index + 1} ---`);
              for (let i = startLine; i <= endLine; i++) {
                const marker = i === index ? '>' : ' ';
                results.push(`${marker} ${(i + 1).toString().padStart(4)}: ${fileLines[i]}`);
              }
            }
          });

          return {
            content: [{
              type: 'text',
              text: results.length > 0 ?
                  `Search results for "${search}" in ${file}:\n${results.join('\n')}` :
                  `No matches found for "${search}" in ${file}`
            }]
          };
        }

        if (lines) {
          // Support both string and array for lines
          let startStr: string, endStr: string;
          if (Array.isArray(lines)) {
            [startStr, endStr] = lines;
          } else if (typeof lines === 'string') {
            [startStr, endStr] = lines.includes('-') ? lines.split('-') : [lines, lines];
          } else {
            startStr = endStr = String(lines);
          }
          const start = parseInt(startStr);
          const end = endStr === '$' ? fileLines.length : parseInt(endStr);

          const selectedLines = fileLines.slice(start - 1, end);
          const numberedLines = selectedLines.map((line, index) =>
              `${(start + index).toString().padStart(4)}: ${line}`
          );

          return {
            content: [{
              type: 'text',
              text: `Lines ${start}-${end === fileLines.length ? '$' : end} of ${file}:\n${numberedLines.join('\n')}`
            }]
          };
        }

        // Full file mode (limit for performance)
        const maxLines = 100;
        const displayLines = fileLines.length > maxLines ?
            fileLines.slice(0, maxLines) : fileLines;

        const numberedLines = displayLines.map((line, index) =>
            `${(index + 1).toString().padStart(4)}: ${line}`
        );

        const truncated = fileLines.length > maxLines ?
            `\n... (showing first ${maxLines} of ${fileLines.length} lines)` : '';

        return {
          content: [{
            type: 'text',
            text: `Contents of ${file}:\n${numberedLines.join('\n')}${truncated}`
          }]
        };
      }

      case 'search_in_file': {
        const { file, pattern, context = 3, caseInsensitive = false } = args as ToolArg<'search_in_file'>;

        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }

        const content = await readFile(typeof file === 'string' ? file : '', 'utf-8');
        const fileLines = content.split('\n');
        const flags = caseInsensitive ? 'gi' : 'g';
        const regex = new RegExp(String(pattern), flags);

        const results: string[] = [];
        let matchCount = 0;

        fileLines.forEach((line, index) => {
          if (regex.test(line)) {
            matchCount++;
            const startLine = Math.max(0, index - Number(context));
            const endLine = Math.min(fileLines.length - 1, index + Number(context));

            results.push(`\n--- Match ${matchCount} at line ${index + 1} ---`);
            for (let i = startLine; i <= endLine; i++) {
              const marker = i === index ? '>' : ' ';
              results.push(`${marker} ${(i + 1).toString().padStart(4)}: ${fileLines[i]}`);
            }
          }
        });

        return {
          content: [{
            type: 'text',
            text: results.length > 0 ?
                `Found ${matchCount} matches for "${pattern}" in ${file}:\n${results.join('\n')}` :
                `No matches found for "${pattern}" in ${file}`
          }]
        };
      }
      case 'show_around_line': {
        const { file, lineNumber, context = 5 } = args as ToolArg<'show_around_line'>;

        if (typeof file === 'string' && !existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }

        const content = await readFile(typeof file === 'string' ? file : '', 'utf-8');
        const fileLines = content.split('\n');
        const targetLine = typeof lineNumber === 'number' ? lineNumber : parseInt(String(lineNumber));

        if (targetLine < 1 || targetLine > fileLines.length) {
          throw new Error(`Line number ${targetLine} is out of range (file has ${fileLines.length} lines)`);
        }

        const startLine = Math.max(1, targetLine - Number(context));
        const endLine = Math.min(fileLines.length, targetLine + Number(context));

        const results: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          const marker = i === targetLine ? '>' : ' ';
          results.push(`${marker} ${i.toString().padStart(4)}: ${fileLines[i - 1]}`);
        }

        return {
          content: [{
            type: 'text',
            text: `Context around line ${targetLine} in ${file}:\n${results.join('\n')}`
          }]
        };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

// Start the server
const transport = new StdioServerTransport();
server.connect(transport);
console.error('MCP SmallEdit server running on stdio');
