#!/usr/bin/env node

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FlowApiClient } from './flow-client.js';
import { FlowApiConfig } from './types.js';

// Simple in-memory event store for resumability
class InMemoryEventStore {
  private events: Map<string, Array<{ id: string; message: JSONRPCMessage; timestamp: number }>> = new Map();
  private eventIdCounter = 0;

  async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
    const eventId = `event-${++this.eventIdCounter}`;
    
    if (!this.events.has(streamId)) {
      this.events.set(streamId, []);
    }
    this.events.get(streamId)!.push({ id: eventId, message, timestamp: Date.now() });
    
    return eventId;
  }

  async replayEventsAfter(lastEventId: string, { send }: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> }): Promise<string> {
    // Find all events after the last event ID across all streams
    let foundStartPoint = false;
    let streamId = '';
    
    for (const [sid, events] of this.events.entries()) {
      for (const event of events) {
        if (foundStartPoint) {
          await send(event.id, event.message);
        } else if (event.id === lastEventId) {
          foundStartPoint = true;
          streamId = sid;
        }
      }
    }
    
    return streamId;
  }

  async clearSession(sessionId: string): Promise<void> {
    this.events.delete(sessionId);
  }
}

export class FlowMCPHttpServer {
  private app: express.Application;
  private flowClient: FlowApiClient;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private eventStore: InMemoryEventStore;

  constructor(config?: FlowApiConfig) {
    const defaultConfig: FlowApiConfig = {
      baseUrl: 'https://api.dev-2r.in.staccflow.com',
      timeout: 30000,
    };
    
    this.flowClient = new FlowApiClient(config || defaultConfig);
    this.app = express();
    this.eventStore = new InMemoryEventStore();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
    // MCP POST endpoint for JSON-RPC requests
    this.app.post('/mcp', this.handleMcpPost.bind(this));
    
    // MCP GET endpoint for SSE streams
    this.app.get('/mcp', this.handleMcpGet.bind(this));
    
    // MCP DELETE endpoint for session termination
    this.app.delete('/mcp', this.handleMcpDelete.bind(this));

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        activeConnections: this.transports.size,
        timestamp: new Date().toISOString()
      });
    });
  }

  private async handleMcpPost(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    console.log(sessionId ? `Received MCP request for session: ${sessionId}` : 'Received MCP request:', req.body);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport
        transport = this.transports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore: this.eventStore,
          onsessioninitialized: (sessionId: string) => {
            console.log(`Session initialized with ID: ${sessionId}`);
            this.transports.set(sessionId, transport);
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            console.log(`Transport closed for session ${sid}, removing from transports map`);
            this.transports.delete(sid);
            this.eventStore.clearSession(sid);
          }
        };

        // Connect the transport to the MCP server
        const server = this.createMCPServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  private async handleMcpGet(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !this.transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers['last-event-id'] as string;
    if (lastEventId) {
      console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = this.transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  }

  private async handleMcpDelete(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (!sessionId || !this.transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`Received session termination request for session ${sessionId}`);
    try {
      const transport = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  }

  private createMCPServer(): McpServer {
    const server = new McpServer(
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

    this.setupToolHandlers(server);
    this.setupResourceHandlers(server);
    this.setupPromptHandlers(server);

    return server;
  }

  private setupToolHandlers(server: McpServer): void {
    // Register start_flow tool
    server.registerTool('start_flow', {
      title: 'Start Flow',
      description: 'Start a new flow process (e.g., loan application)',
      inputSchema: {
        flowDefinition: z.string().describe('The flow definition name (e.g., "loan-application")'),
        applicant: z.object({
          nin: z.string().describe('National identification number'),
        }),
        loanPurpose: z.string().describe('Purpose of the loan'),
        loanAmount: z.number().describe('Loan amount requested'),
        coApplicant: z.object({
          nin: z.string().describe('Co-applicant national identification number'),
        }).optional(),
      },
    }, async ({ flowDefinition, applicant, loanPurpose, loanAmount, coApplicant }) => {
      try {
        const startResult = await this.flowClient.startFlow(
          flowDefinition,
          {
            applicant,
            loanPurpose: loanPurpose as 'PURCHASE' | 'MOVE' | 'INCREASE_LOAN',
            loanAmount,
            coApplicant,
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

    // Register get_flow tool
    server.registerTool('get_flow', {
      title: 'Get Flow',
      description: 'Get flow details by ID',
      inputSchema: {
        flowId: z.string().describe('The flow ID to retrieve'),
      },
    }, async ({ flowId }) => {
      try {
        const flow = await this.flowClient.getFlow(flowId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(flow, null, 2),
            },
          ],
        };
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

    // Register get_flow_status tool
    server.registerTool('get_flow_status', {
      title: 'Get Flow Status',
      description: 'Get flow status and tasks',
      inputSchema: {
        flowId: z.string().describe('The flow ID to get status for'),
      },
    }, async ({ flowId }) => {
      try {
        const status = await this.flowClient.getFlowStatus(flowId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
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

    // Register get_api_status tool
    server.registerTool('get_api_status', {
      title: 'Get API Status',
      description: 'Check API health status',
      inputSchema: {},
    }, async () => {
      try {
        const apiStatus = await this.flowClient.getApiStatus();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(apiStatus, null, 2),
            },
          ],
        };
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

  private setupResourceHandlers(server: McpServer): void {
    // Register flow state resource
    server.registerResource('flow-state', 'flow://flows/{flowId}', {
      title: 'Flow State',
      description: 'Basic flow information and status',
      mimeType: 'application/json'
    }, async (uri: URL) => {
      try {
        // Extract flowId from URI like "flow://flows/123"
        const match = uri.href.match(/^flow:\/\/flows\/(.+)$/);
        if (!match) {
          throw new Error(`Invalid resource URI: ${uri.href}`);
        }
        
        const flowId = match[1];
        const flow = await this.flowClient.getFlow(flowId);
        
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(flow, null, 2),
              mimeType: 'application/json',
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to read resource ${uri.href}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private setupPromptHandlers(server: McpServer): void {
    // Register loan advisor prompt
    server.registerPrompt('loan-advisor', {
      title: 'Loan Advisor',
      description: 'Friendly and funny loan application guidance',
      argsSchema: {
        customerType: z.string().describe('Type of customer: individual or business'),
        loanAmount: z.string().optional().describe('Desired loan amount in NOK'),
        loanPurpose: z.string().optional().describe('Purpose: PURCHASE, MOVE, or INCREASE_LOAN'),
      },
    }, async ({ customerType, loanAmount, loanPurpose }) => {
      const loanAmountStr = loanAmount || 'some money';
      const purposeStr = loanPurpose || 'buying something awesome';

      const funnyAdvice = this.generateFunnyLoanAdvice(customerType || 'individual', loanAmountStr, purposeStr);

      return {
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

  async start(port: number = 3003): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, '127.0.0.1', () => {
        console.log(`🚀 Flow MCP HTTP Server running on http://localhost:${port}`);
        console.log(`📡 MCP endpoint: http://localhost:${port}/mcp`);
        console.log(`❤️  Health check: http://localhost:${port}/health`);
        resolve();
      });
      
      server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
    });
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down server...');
    // Close all active transports to properly clean up resources
    for (const [sessionId, transport] of this.transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transport.close();
        this.transports.delete(sessionId);
        this.eventStore.clearSession(sessionId);
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log('Server shutdown complete');
  }
}

// Run the server if this file is executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith('http-server.ts')) {
  const server = new FlowMCPHttpServer();
  
  // Handle server shutdown
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down server...');
    await server.shutdown();
    process.exit(0);
  });
  
  server.start().catch((error) => {
    console.error('Failed to start HTTP server:', error);
    process.exit(1);
  });
}