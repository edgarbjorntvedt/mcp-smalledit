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
      }
    ]
  };
});

// Tool implementation handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'sed_edit': {
        const { file, pattern, backup = true, preview = false } = args;
        
        // Check if file exists
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Build sed command - use perl for better compatibility
        let sedCmd;
        if (preview) {
          // For preview, create a temp copy and diff
          const tempFile = `${file}.preview.tmp`;
          await execAsync(`cp '${file}' '${tempFile}'`);
          
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
        const { pattern, filePattern, directory = '.', backup = true } = args;
        
        // Use find to get files matching pattern
        const findCmd = `find ${directory} -name "${filePattern}" -type f`;
        const { stdout: files } = await execAsync(findCmd);
        
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
            await execAsync(sedCmd);
            results.push(`✓ ${file}`);
          } catch (error) {
            results.push(`✗ ${file}: ${error.message}`);
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
        const { file, script, outputFile } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let awkCmd = `awk '${script}' '${file}'`;
        if (outputFile) {
          awkCmd += ` > '${outputFile}'`;
        }
        
        const { stdout, stderr } = await execAsync(awkCmd);
        
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
        const { file, find, replace, all = true } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Escape special characters for sed
        const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedReplace = replace.replace(/[&/\\]/g, '\\$&');
        
        const pattern = all ? 
          `s/${escapedFind}/${escapedReplace}/g` :
          `s/${escapedFind}/${escapedReplace}/`;
        
        const sedCmd = `sed -i.bak '${pattern}' '${file}'`;
        await execAsync(sedCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Replaced "${find}" with "${replace}" in ${file}`
          }]
        };
      }
      
      case 'line_edit': {
        const { file, lineNumber, lineRange, action, content } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        let sedCmd = 'sed -i.bak ';
        const range = lineRange || `${lineNumber}`;
        
        switch (action) {
          case 'replace':
            sedCmd += `'${range}s/.*/${content}/' '${file}'`;
            break;
          case 'delete':
            sedCmd += `'${range}d' '${file}'`;
            break;
          case 'insert_after':
            sedCmd += `'${range}a\\
${content}' '${file}'`;
            break;
          case 'insert_before':
            sedCmd += `'${range}i\\
${content}' '${file}'`;
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        await execAsync(sedCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully performed ${action} on line(s) ${range} in ${file}`
          }]
        };
      }
      
      case 'perl_edit': {
        const { file, script, backup = true, multiline = false } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        const backupExt = backup ? '.bak' : '';
        const multilineFlag = multiline ? '-0777 ' : '';
        const perlCmd = `perl -i${backupExt} ${multilineFlag}-pe '${script}' '${file}'`;
        
        await execAsync(perlCmd);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully edited ${file} using Perl${backup ? ' (backup created as .bak)' : ''}`
          }]
        };
      }
      
      case 'diff_preview': {
        const { file, command, tool = 'perl' } = args;
        
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }
        
        // Create temp file
        const tempFile = `${file}.preview.tmp`;
        await execAsync(`cp '${file}' '${tempFile}'`);
        
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
        
        await execAsync(editCmd);
        
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
