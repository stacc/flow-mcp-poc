import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

export class FlowMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'flow-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'echo',
            description: 'Echo back the input text',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to echo back',
                },
              },
              required: ['text'],
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'echo':
          return {
            content: [
              {
                type: 'text',
                text: `Echo: ${args?.text || ''}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Flow MCP Server running on stdio');
  }
}