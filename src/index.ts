#!/usr/bin/env node

import { FlowMCPServer } from './server.js';

const server = new FlowMCPServer();
server.run().catch((error) => {
  console.error('Failed to run server:', error);
  process.exit(1);
});