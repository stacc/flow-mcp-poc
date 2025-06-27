# Flow MCP Server

A Model Context Protocol (MCP) server built with TypeScript and the official MCP SDK.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

## Usage

The server runs on stdio and implements the MCP protocol. It currently includes:

- **echo tool**: Echoes back the provided text

## Development

- `npm run dev` - Run in development mode with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## Testing

- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Open Vitest UI
- `npm run test:coverage` - Run tests with coverage report

The test suite includes:
- **Unit tests** for the FlowMCPServer class with mocked dependencies
- **Functional tests** for the echo tool logic
- **Error handling tests** to ensure robustness
- **Input validation tests** for edge cases

Current test coverage: ~90% of source code

## MCP Integration

To use this server with an MCP client, configure it to run this server via stdio transport.