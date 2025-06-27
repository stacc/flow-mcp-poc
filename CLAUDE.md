# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Run the MCP server in development mode with auto-reload using tsx
- `npm run build` - Compile TypeScript to JavaScript in the dist/ directory
- `npm run start` - Run the compiled server from dist/index.js
- `npm run watch` - Run in watch mode for continuous development
- `npm run typecheck` - Run TypeScript type checking without compilation
- `npm run lint` - Run ESLint on the TypeScript source files
- `npm run lint:fix` - Run ESLint with automatic fixes

## Project Architecture

This is a Model Context Protocol (MCP) server built with:

- **@modelcontextprotocol/sdk**: Official MCP SDK for server implementation
- **TypeScript**: Type-safe development with ES2022 target
- **ESM modules**: Uses ES module syntax with `"type": "module"` in package.json

### Key Components

- `src/index.ts`: Main server implementation with FlowMCPServer class
- Server uses stdio transport for MCP communication
- Implements tool handlers for MCP tool calls
- Includes error handling and graceful shutdown

### MCP Protocol Implementation

The server implements the MCP protocol with:
- Tool listing via `ListToolsRequestSchema`
- Tool execution via `CallToolRequestSchema`
- Currently includes an "echo" tool as an example

### Development Patterns

- Use class-based architecture for the main server
- Separate concerns with private methods for setup and handlers
- Error handling includes both server errors and process signals
- All logging to stderr to avoid interference with stdio protocol