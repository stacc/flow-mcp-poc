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

## MCP Integration

To use this server with an MCP client, configure it to run this server via stdio transport.