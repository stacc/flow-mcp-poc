import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
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

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'flow://flows/{flowId}',
            name: 'Flow State',
            description: 'Basic flow information and status',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      try {
        // Extract flowId from URI like "flow://flows/123"
        const match = uri.match(/^flow:\/\/flows\/(.+)$/);
        if (!match) {
          throw new Error(`Invalid resource URI: ${uri}`);
        }
        
        const flowId = match[1];
        const flow = await this.flowClient.getFlow(flowId);
        
        return {
          contents: [
            {
              type: 'text',
              text: JSON.stringify(flow, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private setupPromptHandlers(): void {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'loan-advisor',
            description: 'Friendly and funny loan application guidance',
            arguments: [
              {
                name: 'customerType',
                description: 'Type of customer: individual or business',
                required: true,
              },
              {
                name: 'loanAmount',
                description: 'Desired loan amount in NOK',
                required: false,
              },
              {
                name: 'loanPurpose',
                description: 'Purpose: PURCHASE, MOVE, or INCREASE_LOAN',
                required: false,
              },
            ],
          },
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'loan-advisor') {
        const customerType = args?.customerType || 'individual';
        const loanAmount = args?.loanAmount ? `${args.loanAmount} NOK` : 'some money';
        const loanPurpose = args?.loanPurpose || 'buying something awesome';

        const funnyAdvice = this.generateFunnyLoanAdvice(customerType, loanAmount, loanPurpose);

        return {
          description: `Friendly loan advice for ${customerType} customer`,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: funnyAdvice,
              },
            },
          ],
        };
      }

      throw new Error(`Unknown prompt: ${name}`);
    });
  }

  private generateFunnyLoanAdvice(customerType: string, loanAmount: string, loanPurpose: string): string {
    const greetings = [
      "🎉 Welcome to the magical world of loans!",
      "🏦 Hello there, future borrower!",
      "💰 Greetings, money enthusiast!",
    ];

    const customerJokes = customerType === 'business' 
      ? [
          "Ah, a business customer! Someone who knows that money makes the world go round (and sometimes makes it go 'round in circles).",
          "Business loan, eh? I see you're ready to turn your dreams into... well, hopefully not nightmares! 😄",
          "Corporate customer detected! Time to talk serious money with seriously fun people.",
        ]
      : [
          "An individual loan! Perfect - just one person to blame when things get interesting! 😉",
          "Personal loan coming up! Don't worry, we won't judge your spending habits... much.",
          "Individual customer! The best kind - simple, straightforward, and hopefully good at math!",
        ];

    const purposeJokes: Record<string, string[]> = {
      'PURCHASE': [
        "Buying something? Excellent! The economy thanks you for your service! 🛍️",
        "A purchase loan! Because sometimes 'I want it' is the best financial strategy.",
        "Shopping with borrowed money - a time-honored tradition since... well, since money was invented!",
      ],
      'MOVE': [
        "Moving? Remember: a house is just a very expensive box to keep your stuff in! 📦",
        "Relocation loan! Because apparently 'staying put' isn't adventurous enough for you!",
        "Moving loans: helping people trade one set of problems for a completely different set since forever!",
      ],
      'INCREASE_LOAN': [
        "More money? I like your style! Go big or go home (preferably in a bigger home)! 🏠",
        "Loan increase! Because the first loan was just the appetizer, right?",
        "Increasing your loan? Bold move! Fortune favors the... well, hopefully you!",
      ],
      'buying something awesome': [
        "Something awesome? Now we're talking! Awesome things require awesome financing! ⭐",
        "Mystery purchase! I love the suspense. Plot twist: it better be worth it!",
        "Buying something awesome with borrowed money? You're living the dream! 🌟",
      ],
    };

    const advice = [
      `📋 **Step 1**: Make sure you actually need ${loanAmount}. Sometimes we want things more than we need them (looking at you, gold-plated toilet seats).`,
      `🧮 **Step 2**: Check if you can afford the monthly payments. Pro tip: your calculator is your friend, not your enemy!`,
      `📄 **Step 3**: Gather your documents. Yes, ALL of them. Banks love paperwork almost as much as they love money.`,
      `🔍 **Step 4**: Read the fine print. It's called 'fine' print because finding someone who actually reads it is quite... fine indeed!`,
      `✅ **Step 5**: Apply and cross your fingers! (But don't rely on finger-crossing as your primary financial strategy.)`,
    ];

    const disclaimer = `\n\n💡 **Friendly Reminder**: Loans are like relationships - they work best when you understand the commitment and can handle the monthly obligations! 😊\n\n🤝 **Ready to start?** Use the 'start_flow' tool with your loan details. I'll be here cheering you on (quietly, from the server room)!`;

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    const customerJoke = customerJokes[Math.floor(Math.random() * customerJokes.length)];
    const purposeJoke = (purposeJokes[loanPurpose] || purposeJokes['buying something awesome'])[0];

    return `${greeting}\n\n${customerJoke}\n\n${purposeJoke}\n\n**Your Friendly Loan Adventure Guide:**\n\n${advice.join('\n\n')}${disclaimer}`;
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