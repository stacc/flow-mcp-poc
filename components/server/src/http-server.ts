#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	isInitializeRequest,
	type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";
import { FlowApiClient } from "./flow-client.ts";
import type { FlowApiConfig } from "./types.ts";

// Simple in-memory event store for resumability
class InMemoryEventStore {
	private events: Map<
		string,
		Array<{ id: string; message: JSONRPCMessage; timestamp: number }>
	> = new Map();
	private eventIdCounter = 0;

	async storeEvent(streamId: string, message: JSONRPCMessage): Promise<string> {
		const eventId = `event-${++this.eventIdCounter}`;

		if (!this.events.has(streamId)) {
			this.events.set(streamId, []);
		}
		this.events
			.get(streamId)!
			.push({ id: eventId, message, timestamp: Date.now() });

		return eventId;
	}

	async replayEventsAfter(
		lastEventId: string,
		{
			send,
		}: { send: (eventId: string, message: JSONRPCMessage) => Promise<void> },
	): Promise<string> {
		// Find all events after the last event ID across all streams
		let foundStartPoint = false;
		let streamId = "";

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
	private requestHeaders = new Map<string, Record<string, string>>();
	private currentRequestHeaders: Record<string, string> = {};

	constructor(config?: FlowApiConfig) {
		const defaultConfig: FlowApiConfig = {
			baseUrl: "http://localhost:1337",
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
			res.header("Access-Control-Allow-Origin", "*");
			res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
			res.header(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID",
			);
			if (req.method === "OPTIONS") {
				res.sendStatus(200);
				return;
			}
			next();
		});
	}

	private setupRoutes(): void {
		// MCP POST endpoint for JSON-RPC requests
		this.app.post("/mcp", this.handleMcpPost.bind(this));

		// MCP GET endpoint for SSE streams
		this.app.get("/mcp", this.handleMcpGet.bind(this));

		// MCP DELETE endpoint for session termination
		this.app.delete("/mcp", this.handleMcpDelete.bind(this));

		// Health check
		this.app.get("/healthz", (req, res) => {
			res
				.status(200)
				.json({ status: "ok", timestamp: new Date().toISOString() });
		});

		// Flow definitions listing
		this.app.get("/flow-definitions", this.handleFlowDefinitions.bind(this));
	}

	private async handleMcpPost(
		req: express.Request,
		res: express.Response,
	): Promise<void> {
		const sessionId = req.headers["mcp-session-id"] as string;
		console.info(
			sessionId
				? `Received MCP request for session: ${sessionId}`
				: "Received MCP request:",
			req.body,
		);

		try {
			let transport: StreamableHTTPServerTransport;

			// Store headers from this request to be used by tool handlers
			// Filter out HTTP-specific headers that shouldn't be forwarded
			const excludedHeaders = new Set([
				"host",
				"content-length",
				"content-type",
				"connection",
				"transfer-encoding",
				"te",
				"trailer",
				"proxy-authorization",
				"proxy-authenticate",
				"upgrade",
				"expect",
			]);

			const forwardHeaders: Record<string, string> = {};
			for (const [key, value] of Object.entries(req.headers)) {
				const lowerKey = key.toLowerCase();
				if (
					typeof value === "string" &&
					!lowerKey.startsWith("mcp-") &&
					!excludedHeaders.has(lowerKey)
				) {
					forwardHeaders[key] = value;
				}
			}

			if (sessionId && this.transports.has(sessionId)) {
				// Reuse existing transport
				transport = this.transports.get(sessionId)!;
				console.info(`Reusing existing transport for session: ${sessionId}`);
				// Update headers for this session and current request
				this.requestHeaders.set(sessionId, forwardHeaders);
				this.currentRequestHeaders = forwardHeaders;
			} else if (!sessionId && isInitializeRequest(req.body)) {
				// New initialization request
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => randomUUID(),
					eventStore: this.eventStore,
					onsessioninitialized: (sessionId: string) => {
						console.info(`Session initialized with ID: ${sessionId}`);
						this.transports.set(sessionId, transport);
						// Store headers for the new session
						this.requestHeaders.set(sessionId, forwardHeaders);
						this.currentRequestHeaders = forwardHeaders;
					},
				});

				// Set up onclose handler to clean up transport when closed
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid && this.transports.has(sid)) {
						console.info(
							`Transport closed for session ${sid}, removing from transports map`,
						);
						this.transports.delete(sid);
						this.requestHeaders.delete(sid);
						this.eventStore.clearSession(sid);
					}
				};

				// Connect the transport to the MCP server
				const server = this.createMCPServer();
				console.info("Connecting MCP server to transport...");
				await server.connect(transport);
				console.info("Handling initialization request...");
				await transport.handleRequest(req, res, req.body);
				console.info(`MCP initialization response sent for new session`);
				return;
			} else {
				// Invalid request - no session ID or not initialization request
				console.warn(
					"Invalid MCP request: no session ID or not initialization request",
				);
				res.status(400).json({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Bad Request: No valid session ID provided",
					},
					id: null,
				});
				return;
			}

			// Handle the request with existing transport
			console.info(
				`Handling MCP request with existing transport for session: ${sessionId}`,
			);
			await transport.handleRequest(req, res, req.body);
			console.info(`MCP response sent for session: ${sessionId}`);
		} catch (error) {
			console.error("Error handling MCP request:", error);
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: "2.0",
					error: {
						code: -32603,
						message: "Internal server error",
					},
					id: null,
				});
			}
		}
	}

	private async handleMcpGet(
		req: express.Request,
		res: express.Response,
	): Promise<void> {
		const sessionId = req.headers["mcp-session-id"] as string;
		if (!sessionId || !this.transports.has(sessionId)) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		// Check for Last-Event-ID header for resumability
		const lastEventId = req.headers["last-event-id"] as string;
		if (lastEventId) {
			console.info(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
		} else {
			console.info(`Establishing new SSE stream for session ${sessionId}`);
		}

		const transport = this.transports.get(sessionId)!;
		await transport.handleRequest(req, res);
	}

	private async handleMcpDelete(
		req: express.Request,
		res: express.Response,
	): Promise<void> {
		const sessionId = req.headers["mcp-session-id"] as string;
		if (!sessionId || !this.transports.has(sessionId)) {
			res.status(400).send("Invalid or missing session ID");
			return;
		}

		console.info(
			`Received session termination request for session ${sessionId}`,
		);
		try {
			const transport = this.transports.get(sessionId)!;
			await transport.handleRequest(req, res);
		} catch (error) {
			console.error("Error handling session termination:", error);
			if (!res.headersSent) {
				res.status(500).send("Error processing session termination");
			}
		}
	}

	private async handleFlowDefinitions(
		req: express.Request,
		res: express.Response,
	): Promise<void> {
		try {
			const flowDefinitions = await this.flowClient.getFlowDefinitions();
			res.json(flowDefinitions);
		} catch (error) {
			console.error("Error fetching flow definitions:", error);
			res.status(500).json({
				error: "Failed to fetch flow definitions",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private createMCPServer(): McpServer {
		const server = new McpServer(
			{
				name: "flow-mcp-server",
				version: "1.0.0",
			},
			{
				capabilities: {
					tools: {},
					resources: {},
					prompts: {},
				},
			},
		);

		this.setupToolHandlers(server);
		this.setupResourceHandlers(server);

		return server;
	}

	private setupToolHandlers(server: McpServer): void {
		// Register start_flow tool
		server.registerTool(
			"start_flow",
			{
				title: "Start Flow",
				description:
					"Start a new flow process with data matching the flow definition schema",
				inputSchema: {
					flowDefinition: z.string().describe("The flow definition name"),
					data: z
						.record(z.unknown())
						.describe(
							"Flow input data - use get_flow_schema to get the required schema for this flow",
						),
				},
			},
			async ({ flowDefinition, data }) => {
				try {
					const startResult = await this.flowClient.startFlow(
						flowDefinition,
						data,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(startResult, null, 2),
							},
						],
					};
				} catch (error) {
					console.error("Error in start_flow tool:", error);
					if (error instanceof Error) {
						const cause = error.cause as { errors?: unknown[] } | undefined;
						return {
							content: [
								{
									type: "text",
									text: `Error: ${
										error instanceof Error ? error.message : String(error)
									}`,
									errors: cause?.errors,
								},
							],
							isError: true,
						};
					}
				}
			},
		);

		// Register get_flow tool
		server.registerTool(
			"get_flow",
			{
				title: "Get Flow",
				description: "Get flow details by ID",
				inputSchema: {
					flowId: z.string().describe("The flow ID to retrieve"),
				},
			},
			async ({ flowId }) => {
				try {
					const flow = await this.flowClient.getFlow(
						flowId,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(flow, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_flow_status tool
		server.registerTool(
			"get_flow_status",
			{
				title: "Get Flow Status",
				description: "Get flow status and tasks",
				inputSchema: {
					flowId: z.string().describe("The flow ID to get status for"),
				},
			},
			async ({ flowId }) => {
				try {
					const status = await this.flowClient.getFlowStatus(
						flowId,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(status, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_task tool
		server.registerTool(
			"get_task",
			{
				title: "Get Task",
				description: "Get task details by task ID",
				inputSchema: {
					taskId: z.string().describe("The task ID to retrieve"),
				},
			},
			async ({ taskId }) => {
				try {
					const task = await this.flowClient.getTask(
						taskId,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(task, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register complete_task tool
		server.registerTool(
			"complete_task",
			{
				title: "Complete Task",
				description: "Complete a task with the provided data",
				inputSchema: {
					taskId: z.string().describe("The task ID to complete"),
					data: z.record(z.unknown()).describe("Task completion data"),
				},
			},
			async ({ taskId, data }) => {
				try {
					const completeResult = await this.flowClient.completeTask(
						taskId,
						data,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text:
									typeof completeResult === "string"
										? completeResult
										: JSON.stringify(completeResult, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register trigger_task tool
		server.registerTool(
			"trigger_task",
			{
				title: "Trigger Task",
				description: "Trigger a message task with the provided data",
				inputSchema: {
					taskId: z.string().describe("The task ID to trigger"),
					data: z.record(z.unknown()).describe("Task trigger data"),
				},
			},
			async ({ taskId, data }) => {
				try {
					const triggerResult = await this.flowClient.triggerTask(
						taskId,
						data,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text:
									typeof triggerResult === "string"
										? triggerResult
										: JSON.stringify(triggerResult, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_flow_schema tool
		server.registerTool(
			"get_flow_schema",
			{
				title: "Get Flow Schema",
				description: "Get schema for a flow definition",
				inputSchema: {
					flowDefinition: z.string().describe("The flow definition name"),
				},
			},
			async ({ flowDefinition }) => {
				try {
					const flowSchema =
						await this.flowClient.getFlowSchema(flowDefinition);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(flowSchema, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_task_schema tool
		server.registerTool(
			"get_task_schema",
			{
				title: "Get Task Schema",
				description: "Get schema for a specific task type",
				inputSchema: {
					flowDefinition: z.string().describe("The flow definition name"),
					taskType: z.string().describe("The task type name"),
				},
			},
			async ({ flowDefinition, taskType }) => {
				try {
					const taskSchema = await this.flowClient.getTaskSchema(
						flowDefinition,
						taskType,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(taskSchema, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_api_status tool
		server.registerTool(
			"get_api_status",
			{
				title: "Get API Status",
				description: "Check API health status",
				inputSchema: {},
			},
			async () => {
				try {
					const apiStatus = await this.flowClient.getApiStatus();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(apiStatus, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register list_flow_definitions tool
		server.registerTool(
			"list_flow_definitions",
			{
				title: "List Flow Definitions",
				description: "List all available flow definitions",
				inputSchema: {},
			},
			async () => {
				try {
					const flowDefinitions = await this.flowClient.getFlowDefinitions();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(flowDefinitions, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);

		// Register get_flows tool
		server.registerTool(
			"get_flows",
			{
				title: "Get Flows",
				description:
					"List/query for flow instances with optional filtering and sorting",
				inputSchema: {
					view: z
						.string()
						.optional()
						.describe("Which view to use for filtering the response data"),
					sort: z
						.string()
						.optional()
						.describe("Which field to sort results by (e.g., 'createdAt')"),
					dir: z
						.union([z.literal(1), z.literal(-1)])
						.optional()
						.describe(
							"Sort direction: 1 for ascending (default), -1 for descending",
						),
				},
			},
			async ({ view, sort, dir }) => {
				try {
					const params = { view, sort, dir };

					// Filter out undefined values
					const filteredParams = Object.fromEntries(
						Object.entries(params).filter(([, value]) => value !== undefined),
					);

					const flows = await this.flowClient.getFlows(
						filteredParams,
						this.currentRequestHeaders,
					);
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(flows, null, 2),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${
									error instanceof Error ? error.message : String(error)
								}`,
							},
						],
						isError: true,
					};
				}
			},
		);
	}

	private setupResourceHandlers(server: McpServer): void {
		// Register flow state resource
		server.registerResource(
			"flow-state",
			"flow://flows/{flowId}",
			{
				title: "Flow State",
				description: "Basic flow information and status",
				mimeType: "application/json",
			},
			async (uri: URL) => {
				try {
					// Extract flowId from URI like "flow://flows/123"
					const match = uri.href.match(/^flow:\/\/flows\/(.+)$/);
					if (!match) {
						throw new Error(`Invalid resource URI: ${uri.href}`);
					}

					const flowId = match[1];
					const flow = await this.flowClient.getFlow(
						flowId,
						this.currentRequestHeaders,
					);

					return {
						contents: [
							{
								uri: uri.href,
								text: JSON.stringify(flow, null, 2),
								mimeType: "application/json",
							},
						],
					};
				} catch (error) {
					throw new Error(
						`Failed to read resource ${uri.href}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			},
		);
	}

	async start(
		port: number = parseInt(process.env.PORT || "3001", 10),
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = this.app.listen(port, "0.0.0.0", () => {
				resolve();
			});

			server.on("error", (error) => {
				console.error("Server error:", error);
				reject(error);
			});
		});
	}

	async shutdown(): Promise<void> {
		console.log("Shutting down server...");
		// Close all active transports to properly clean up resources
		for (const [sessionId, transport] of this.transports) {
			try {
				console.log(`Closing transport for session ${sessionId}`);
				await transport.close();
				this.transports.delete(sessionId);
				this.requestHeaders.delete(sessionId);
				this.eventStore.clearSession(sessionId);
			} catch (error) {
				console.error(
					`Error closing transport for session ${sessionId}:`,
					error,
				);
			}
		}
		console.log("Server shutdown complete");
	}
}

// Run the server if this file is executed directly
if (
	import.meta.url.endsWith(process.argv[1]) ||
	process.argv[1].endsWith("http-server.ts")
) {
	const server = new FlowMCPHttpServer();

	// Handle server shutdown
	process.on("SIGINT", async () => {
		console.log("\n👋 Shutting down server...");
		await server.shutdown();
		process.exit(0);
	});

	server.start().catch((error) => {
		console.error("Failed to start HTTP server:", error);
		process.exit(1);
	});
}
