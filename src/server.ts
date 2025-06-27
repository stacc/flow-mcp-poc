import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { FlowApiClient } from './flow-client.js';
import { FlowApiConfig } from './types.js';

export class FlowMCPServer {
  private server: Server;
  private flowClient: FlowApiClient;

  constructor(config?: FlowApiConfig) {
    const defaultConfig: FlowApiConfig = {
      baseUrl: 'https://api.dev-2r.in.staccflow.com',
      timeout: 30000,
    };
    
    this.flowClient = new FlowApiClient(config || defaultConfig);
    
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
            name: 'start_flow',
            description: 'Start a new flow process (e.g., loan application)',
            inputSchema: {
              type: 'object',
              properties: {
                flowDefinition: {
                  type: 'string',
                  description: 'The flow definition name (e.g., "loan-application")',
                },
                applicant: {
                  type: 'object',
                  properties: {
                    nin: { type: 'string', description: 'National identification number' },
                  },
                  required: ['nin'],
                },
                loanPurpose: {
                  type: 'string',
                  description: 'Purpose of the loan',
                },
                loanAmount: {
                  type: 'number',
                  description: 'Loan amount requested',
                },
                coApplicant: {
                  type: 'object',
                  properties: {
                    nin: { type: 'string', description: 'Co-applicant national identification number' },
                  },
                  required: ['nin'],
                },
              },
              required: ['flowDefinition', 'applicant', 'loanPurpose', 'loanAmount'],
            },
          },
          {
            name: 'get_flow',
            description: 'Get flow details by ID',
            inputSchema: {
              type: 'object',
              properties: {
                flowId: {
                  type: 'string',
                  description: 'The flow ID to retrieve',
                },
              },
              required: ['flowId'],
            },
          },
          {
            name: 'get_flow_status',
            description: 'Get flow status and tasks',
            inputSchema: {
              type: 'object',
              properties: {
                flowId: {
                  type: 'string',
                  description: 'The flow ID to get status for',
                },
              },
              required: ['flowId'],
            },
          },
          {
            name: 'get_task',
            description: 'Get task details by task ID',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'The task ID to retrieve',
                },
              },
              required: ['taskId'],
            },
          },
          {
            name: 'complete_task',
            description: 'Complete a task with the provided data',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: {
                  type: 'string',
                  description: 'The task ID to complete',
                },
                data: {
                  type: 'object',
                  description: 'Task completion data',
                },
              },
              required: ['taskId', 'data'],
            },
          },
          {
            name: 'get_flow_schema',
            description: 'Get schema for a flow definition',
            inputSchema: {
              type: 'object',
              properties: {
                flowDefinition: {
                  type: 'string',
                  description: 'The flow definition name',
                },
              },
              required: ['flowDefinition'],
            },
          },
          {
            name: 'get_task_schema',
            description: 'Get schema for a specific task type',
            inputSchema: {
              type: 'object',
              properties: {
                flowDefinition: {
                  type: 'string',
                  description: 'The flow definition name',
                },
                taskType: {
                  type: 'string',
                  description: 'The task type name',
                },
              },
              required: ['flowDefinition', 'taskType'],
            },
          },
          {
            name: 'get_api_status',
            description: 'Check API health status',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error('Missing arguments');
        }

        switch (name) {
          case 'start_flow': {
            const startResult = await this.flowClient.startFlow(
              args.flowDefinition as string,
              {
                applicant: args.applicant as { nin: string },
                loanPurpose: args.loanPurpose as 'PURCHASE' | 'MOVE' | 'INCREASE_LOAN',
                loanAmount: args.loanAmount as number,
                coApplicant: args.coApplicant as { nin: string } | undefined,
              }
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(startResult, null, 2),
                },
              ],
            };
          }

          case 'get_flow': {
            const flow = await this.flowClient.getFlow(args.flowId as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(flow, null, 2),
                },
              ],
            };
          }

          case 'get_flow_status': {
            const status = await this.flowClient.getFlowStatus(args.flowId as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(status, null, 2),
                },
              ],
            };
          }

          case 'get_task': {
            const task = await this.flowClient.getTask(args.taskId as string);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task, null, 2),
                },
              ],
            };
          }

          case 'complete_task': {
            const completeResult = await this.flowClient.completeTask(
              args.taskId as string,
              args.data as Record<string, unknown>
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(completeResult, null, 2),
                },
              ],
            };
          }

          case 'get_flow_schema': {
            const flowSchema = await this.flowClient.getFlowSchema(
              args.flowDefinition as string
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(flowSchema, null, 2),
                },
              ],
            };
          }

          case 'get_task_schema': {
            const taskSchema = await this.flowClient.getTaskSchema(
              args.flowDefinition as string,
              args.taskType as string
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(taskSchema, null, 2),
                },
              ],
            };
          }

          case 'get_api_status': {
            const apiStatus = await this.flowClient.getApiStatus();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(apiStatus, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
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