# Flow MCP Server

A comprehensive Model Context Protocol (MCP) server built with TypeScript that provides Tools, Resources, and Prompts for Flow API integration. Supports both STDIO and HTTP/SSE transports.

## Features

### MCP Capabilities
- ✅ **Tools** - 8 Flow API operations (start flows, get status, complete tasks, etc.)
- ✅ **Resources** - Real-time flow state data via `flow://flows/{flowId}` URIs
- ✅ **Prompts** - Friendly loan advisor with personality and humor
- ✅ **Dual Transports** - STDIO for CLI tools, HTTP/SSE for web applications

### Flow API Integration
- Start and manage loan application flows
- Retrieve flow status and task information
- Complete tasks with validation
- Access flow and task schemas
- Monitor API health status

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   # STDIO server (for CLI MCP clients)
   npm run dev

   # HTTP server (for web applications)
   npm run dev:http   # Runs on http://localhost:3003
   ```

3. **Test the HTTP server:**
   ```bash
   curl http://localhost:3003/health
   ```

## Usage Examples

### Tools
```typescript
// Start a loan application flow
{
  "name": "start_flow",
  "arguments": {
    "flowDefinition": "loan-application",
    "applicant": { "nin": "12345678901" },
    "loanPurpose": "PURCHASE",
    "loanAmount": 500000
  }
}

// Get flow status
{
  "name": "get_flow_status",
  "arguments": { "flowId": "flow-123" }
}
```

### Resources
```typescript
// Access flow state data
URI: "flow://flows/flow-123"
// Returns comprehensive flow information as JSON
```

### Prompts
```typescript
// Get friendly loan advice
{
  "name": "loan-advisor",
  "arguments": {
    "customerType": "individual",
    "loanAmount": 500000,
    "loanPurpose": "PURCHASE"
  }
}
// Returns: "🎉 Welcome to the magical world of loans! ..."
```

## Development

### Available Scripts
- `npm run dev` - STDIO server with auto-reload
- `npm run dev:http` - HTTP server with auto-reload  
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Production STDIO server
- `npm run start:http` - Production HTTP server
- `npm run typecheck` - TypeScript type checking
- `npm run lint` - ESLint code analysis
- `npm run lint:fix` - Auto-fix linting issues

### Project Structure
```
src/
├── server.ts           # STDIO MCP server
├── http-server.ts      # HTTP/SSE MCP server
├── flow-client.ts      # Flow API client
├── types.ts            # TypeScript definitions
└── __tests__/          # Comprehensive test suite
```

## Testing

### Test Suite (73+ Tests)
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report

### Test Coverage
- ✅ **HTTP server functionality** - Endpoints, CORS, sessions
- ✅ **MCP protocol compliance** - JSON-RPC 2.0, capabilities  
- ✅ **Tools/Resources/Prompts** - Schema validation, execution
- ✅ **Error handling** - Edge cases, API failures
- ✅ **Integration testing** - End-to-end workflows
- ✅ **Performance & security** - Load testing, validation

## Transport Options

### STDIO Transport
- For command-line MCP clients
- Direct process communication
- Used by tools like Claude Desktop

### HTTP/SSE Transport  
- For web applications and HTTP clients
- Server-Sent Events for real-time updates
- RESTful endpoints with CORS support
- Runs on port 3003 (configurable)

## Configuration

The server connects to Flow API at:
- **Base URL**: `https://api.dev-2r.in.staccflow.com`
- **Timeout**: 30 seconds
- **Authentication**: API key based

## MCP Integration

### CLI Clients
Configure your MCP client to run:
```bash
npm run start  # STDIO transport
```

### Web Applications
Connect to HTTP endpoints:
- **SSE**: `GET http://localhost:3003/sse`
- **Messages**: `POST http://localhost:3003/message`
- **Health**: `GET http://localhost:3003/health`

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Run `npm run lint` before committing
4. Update documentation as needed

## License

MIT