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
    it('should return Flow API tools', async () => {
      server = new FlowMCPServer();
      
      // Get the handler function that was registered
      const listToolsHandler = mockMCPServer.setRequestHandler.mock.calls
        .find((call: any) => call[0] === ListToolsRequestSchema)?.[1];
      
      expect(listToolsHandler).toBeDefined();
      
      const result = await listToolsHandler();
      
      expect(result.tools).toHaveLength(8);
      expect(result.tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'start_flow',
            description: 'Start a new flow process (e.g., loan application)',
          }),
          expect.objectContaining({
            name: 'get_flow',
            description: 'Get flow details by ID',
          }),
          expect.objectContaining({
            name: 'get_flow_status',
            description: 'Get flow status and tasks',
          }),
          expect.objectContaining({
            name: 'get_task',
            description: 'Get task details by task ID',
          }),
          expect.objectContaining({
            name: 'complete_task',
            description: 'Complete a task with the provided data',
          }),
          expect.objectContaining({
            name: 'get_flow_schema',
            description: 'Get schema for a flow definition',
          }),
          expect.objectContaining({
            name: 'get_task_schema',
            description: 'Get schema for a specific task type',
          }),
          expect.objectContaining({
            name: 'get_api_status',
            description: 'Check API health status',
          }),
        ])
      );
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

    it('should handle get_api_status tool', async () => {
      const request = {
        params: {
          name: 'get_api_status',
          arguments: {},
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('status'),
          },
        ],
        isError: undefined,
      });
    });

    it('should handle missing arguments with error', async () => {
      const request = {
        params: {
          name: 'start_flow',
          arguments: undefined,
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Error: Missing arguments',
          },
        ],
        isError: true,
      });
    });

    it('should handle API errors gracefully', async () => {
      const request = {
        params: {
          name: 'get_flow',
          arguments: { flowId: 'invalid-flow-id' },
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: expect.stringContaining('Error:'),
          },
        ],
        isError: true,
      });
    });

    it('should return error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };
      
      const result = await callToolHandler(request);
      
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Error: Unknown tool: unknown-tool',
          },
        ],
        isError: true,
      });
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