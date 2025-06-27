# Flow MCP POC

## Goal ✅ COMPLETE
Prove MCP protocol works with Flow API with HTTP transport.

## Implementation 
**Two server variants:**
- `src/server.ts` - Original STDIO transport
- `src/http-server.ts` - New HTTP/SSE transport

## HTTP Server Features
- **SSE endpoint**: `GET /sse` - establishes MCP connection
- **Message endpoint**: `POST /message` - sends MCP messages  
- **Health check**: `GET /health` - server status
- **CORS enabled** for web clients
- **Express.js** based HTTP server

## Usage
```bash
# STDIO version (original)
npm run dev

# HTTP version (new)
npm run dev:http   # Runs on http://localhost:3003
# Note: Port 3001 conflicts with OrbStack, using 3003

# Production builds  
npm run start      # STDIO
npm run start:http # HTTP

# Test server
curl http://localhost:3003/health
```

## Fixed Issues
- ✅ Port conflict (3001 → 3003) 
- ✅ Server binding to all interfaces (0.0.0.0)
- ✅ Process lifecycle management

## Result
✅ **POC Complete** - MCP now works with Flow API via HTTP

**Supports all MCP primitives:**
- **Tools** - 4 Flow API operations (simplified for POC)
- **Resources** - `flow://flows/{flowId}` returns flow data  
- **Prompts** - Funny loan advisor with personality

**Transport options:**
- **STDIO** - For command-line MCP clients
- **HTTP/SSE** - For web applications and HTTP clients

## Tests ✅
```bash
npm run test   # All tests pass
# - HTTP server functionality 
# - MCP protocol compliance
# - Tool/Resource/Prompt implementations
# - Error handling and security
```

Ready for both CLI and web MCP client integration.