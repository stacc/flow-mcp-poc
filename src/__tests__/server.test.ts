import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/server/stdio.js');

// Import after mocking
const { FlowMCPServer } = await import('../server.js');

describe('FlowMCPServer', () => {
  let server: any;
  let mockMCPServer: any;
  let mockTransport: any;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create mock instances
    mockMCPServer = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
      onerror: null,
    };
    
    mockTransport = {};
    
    // Mock constructors
    vi.mocked(Server).mockImplementation(() => mockMCPServer);
    vi.mocked(StdioServerTransport).mockImplementation(() => mockTransport);
  });

  describe('constructor', () => {
    it('should create server with correct configuration', () => {
      server = new FlowMCPServer();
      
      expect(Server).toHaveBeenCalledWith(
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
    });

    it('should set up request handlers', () => {
      server = new FlowMCPServer();
      
      expect(mockMCPServer.setRequestHandler).toHaveBeenCalledWith(
        ListToolsRequestSchema,
        expect.any(Function)
      );
      
      expect(mockMCPServer.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function)
      );
    });

    it('should set up error handling', () => {
      server = new FlowMCPServer();
      
      expect(mockMCPServer.onerror).toEqual(expect.any(Function));
    });
  });

  describe('list tools handler', () => {
    it('should return echo tool', async () => {
      server = new FlowMCPServer();
      
      // Get the handler function that was registered
      const listToolsHandler = mockMCPServer.setRequestHandler.mock.calls
        .find((call: any) => call[0] === ListToolsRequestSchema)?.[1];
      
      expect(listToolsHandler).toBeDefined();
      
      const result = await listToolsHandler();
      
      expect(result).toEqual({
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
        ],
      });
    });
  });

  describe('call tool handler', () => {
    let callToolHandler: any;

    beforeEach(() => {
      server = new FlowMCPServer();
      
      // Get the handler function that was registered
      callToolHandler = mockMCPServer.setRequestHandler.mock.calls
        .find((call: any) => call[0] === CallToolRequestSchema)?.[1];
      
      expect(callToolHandler).toBeDefined();
    });

    it('should handle echo tool with valid arguments', async () => {
      const request = {
        params: {
          name: 'echo',
          arguments: { text: 'Hello, World!' },
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: Hello, World!',
          },
        ],
      });
    });

    it('should handle echo tool with empty arguments', async () => {
      const request = {
        params: {
          name: 'echo',
          arguments: undefined,
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: ',
          },
        ],
      });
    });

    it('should handle echo tool with missing text property', async () => {
      const request = {
        params: {
          name: 'echo',
          arguments: {},
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: ',
          },
        ],
      });
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };
      
      await expect(callToolHandler(request)).rejects.toThrow('Unknown tool: unknown-tool');
    });
  });

  describe('run method', () => {
    it('should create transport and connect server', async () => {
      server = new FlowMCPServer();
      
      await server.run();
      
      expect(StdioServerTransport).toHaveBeenCalled();
      expect(mockMCPServer.connect).toHaveBeenCalledWith(mockTransport);
    });
  });

  describe('error handling', () => {
    it('should handle server errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      server = new FlowMCPServer();
      
      // Trigger error handler
      const error = new Error('Test error');
      mockMCPServer.onerror(error);
      
      expect(consoleSpy).toHaveBeenCalledWith('[MCP Error]', error);
      consoleSpy.mockRestore();
    });
  });
});