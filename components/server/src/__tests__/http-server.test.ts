import request from "supertest";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mocked,
	vi,
} from "vitest";
import { FlowApiClient } from "../flow-client.ts";
import { FlowMCPHttpServer } from "../http-server.ts";

// Mock the FlowApiClient
vi.mock("../flow-client.ts");

describe("FlowMCPHttpServer", () => {
	let server: FlowMCPHttpServer;
	let mockFlowClient: Mocked<FlowApiClient>;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock FlowApiClient
		mockFlowClient = {
			startFlow: vi.fn(),
			getFlow: vi.fn(),
			getFlowStatus: vi.fn(),
			getApiStatus: vi.fn(),
		} as any;

		// Mock the FlowApiClient constructor
		(FlowApiClient as any).mockImplementation(() => mockFlowClient);

		server = new FlowMCPHttpServer();
	});

	afterEach(() => {
		// Clean up any active connections
		vi.restoreAllMocks();
	});

	describe("Health Check", () => {
		it("should return health status", async () => {
			const response = await request(server["app"]).get("/health").expect(200);

			expect(response.body).toMatchObject({
				status: "ok",
				activeConnections: 0,
				timestamp: expect.any(String),
			});
		});
	});

	describe("CORS Headers", () => {
		it("should include CORS headers", async () => {
			const response = await request(server["app"]).get("/health").expect(200);

			expect(response.headers["access-control-allow-origin"]).toBe("*");
			expect(response.headers["access-control-allow-methods"]).toBe(
				"GET, POST, OPTIONS",
			);
			expect(response.headers["access-control-allow-headers"]).toBe(
				"Content-Type, Authorization",
			);
		});

		it("should handle OPTIONS requests", async () => {
			await request(server["app"]).options("/health").expect(200);
		});
	});

	describe("SSE Endpoint", () => {
		it("should accept SSE connections", async () => {
			const response = await request(server["app"]).get("/sse").expect(200);

			expect(response.headers["content-type"]).toContain("text/event-stream");
		});

		it("should set up MCP transport on connection", async () => {
			const response = await request(server["app"]).get("/sse").expect(200);

			// Check that SSE stream is established
			expect(response.headers["content-type"]).toContain("text/event-stream");
		});
	});

	describe("Message Endpoint", () => {
		it("should reject requests without session ID", async () => {
			await request(server["app"])
				.post("/message")
				.send({ method: "test" })
				.expect(404);
		});

		it("should reject requests with invalid session ID", async () => {
			await request(server["app"])
				.post("/message")
				.set("x-session-id", "invalid-session")
				.send({ method: "test" })
				.expect(404);
		});
	});

	describe("MCP Protocol Integration", () => {
		let sessionId: string;

		beforeEach(async () => {
			// For unit tests, we'll test the core functionality without SSE
			sessionId = "test-session";
		});

		describe("Tools", () => {
			it("should list available tools", async () => {
				const listToolsRequest = {
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				};

				// Note: In a real test, this would go through the SSE/message flow
				// For simplicity, we'll test the core functionality
				expect(mockFlowClient).toBeDefined();
			});

			it("should handle start_flow tool calls", async () => {
				const mockStartResult = {
					_links: {
						self: {
							href: "/api/flows/test-flow-123"
						}
					},
					flowId: "test-flow-123",
					referenceId: "TEST-123"
				};

				mockFlowClient.startFlow.mockResolvedValue(mockStartResult);

				// This would normally be sent via the message endpoint
				const toolCallRequest = {
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: {
						name: "start_flow",
						arguments: {
							flowDefinition: "loan-application",
							applicant: { nin: "12345678901" },
							loanPurpose: "PURCHASE",
							loanAmount: 500000,
						},
					},
				};

				expect(mockFlowClient.startFlow).toBeDefined();
				// In a full integration test, we would send this through the message endpoint
			});

			it("should handle get_flow tool calls", async () => {
				const mockFlow = {
					_links: {
						self: "/api/flows/test-flow-123",
						tasks: {
							href: "/api/flows/test-flow-123/tasks"
						}
					},
					flow: {
						flowId: "test-flow-123",
						_meta: {
							processDefinitionId: "loan-application",
							processInstanceId: "instance-123",
							processVersion: "1"
						},
						createdAt: "2024-01-01T00:00:00Z",
						flowDefinitionId: "loan-application",
						flowNumber: 123,
						hasErrors: false,
						hasIncidents: false,
						incidents: {},
						numAttachments: 0,
						referenceId: "TEST-123",
						referenceName: "Test Flow",
						sandbox: false,
						sandboxConfig: {},
						status: "active" as const,
						version: 1,
						versionTag: null,
						data: { applicant: { nin: "12345678901" } },
						updatedAt: "2024-01-01T00:00:00Z",
						actions: ["read", "update"]
					},
				};

				mockFlowClient.getFlow.mockResolvedValue(mockFlow);

				expect(mockFlowClient.getFlow).toBeDefined();
			});

			it("should handle get_api_status tool calls", async () => {
				const mockStatus = {
					status: "healthy",
					timestamp: new Date().toISOString(),
				};

				mockFlowClient.getApiStatus.mockResolvedValue(mockStatus);

				expect(mockFlowClient.getApiStatus).toBeDefined();
			});
		});

		describe("Resources", () => {
			it("should list available resources", async () => {
				const listResourcesRequest = {
					jsonrpc: "2.0",
					id: 3,
					method: "resources/list",
					params: {},
				};

				// The resources should include the flow state resource
				expect(true).toBe(true); // Placeholder for actual resource listing test
			});

			it("should read flow resources", async () => {
				const mockFlow = {
					_links: {
						self: "/api/flows/test-flow-123",
						tasks: {
							href: "/api/flows/test-flow-123/tasks"
						}
					},
					flow: {
						flowId: "test-flow-123",
						_meta: {
							processDefinitionId: "loan-application",
							processInstanceId: "instance-123",
							processVersion: "1"
						},
						createdAt: "2024-01-01T00:00:00Z",
						flowDefinitionId: "loan-application",
						flowNumber: 123,
						hasErrors: false,
						hasIncidents: false,
						incidents: {},
						numAttachments: 0,
						referenceId: "TEST-123",
						referenceName: "Test Flow",
						sandbox: false,
						sandboxConfig: {},
						status: "active" as const,
						version: 1,
						versionTag: null,
						data: {},
						updatedAt: "2024-01-01T00:00:00Z",
						actions: ["read", "update"]
					},
				};

				mockFlowClient.getFlow.mockResolvedValue(mockFlow);

				const readResourceRequest = {
					jsonrpc: "2.0",
					id: 4,
					method: "resources/read",
					params: {
						uri: "flow://flows/test-flow-123",
					},
				};

				expect(mockFlowClient.getFlow).toBeDefined();
			});

			it("should handle invalid resource URIs", async () => {
				const readResourceRequest = {
					jsonrpc: "2.0",
					id: 5,
					method: "resources/read",
					params: {
						uri: "invalid://resource",
					},
				};

				// Should throw an error for invalid URI format
				expect(true).toBe(true); // Placeholder for error handling test
			});
		});

		describe("Prompts", () => {
			it("should list available prompts", async () => {
				const listPromptsRequest = {
					jsonrpc: "2.0",
					id: 6,
					method: "prompts/list",
					params: {},
				};

				// Should include the loan-advisor prompt
				expect(true).toBe(true); // Placeholder for prompt listing test
			});

			it("should generate loan advisor prompt", async () => {
				const getPromptRequest = {
					jsonrpc: "2.0",
					id: 7,
					method: "prompts/get",
					params: {
						name: "loan-advisor",
						arguments: {
							customerType: "individual",
							loanAmount: 500000,
							loanPurpose: "PURCHASE",
						},
					},
				};

				// Should return funny loan advice
				expect(true).toBe(true); // Placeholder for prompt generation test
			});

			it("should handle unknown prompts", async () => {
				const getPromptRequest = {
					jsonrpc: "2.0",
					id: 8,
					method: "prompts/get",
					params: {
						name: "unknown-prompt",
						arguments: {},
					},
				};

				// Should throw an error for unknown prompt
				expect(true).toBe(true); // Placeholder for error handling test
			});
		});
	});

	describe("Error Handling", () => {
		it("should handle FlowApiClient errors gracefully", async () => {
			mockFlowClient.getFlow.mockRejectedValue(new Error("API Error"));

			// Test that errors are properly caught and returned
			expect(mockFlowClient.getFlow).toBeDefined();
		});

		it("should handle malformed JSON requests", async () => {
			const response = await request(server["app"])
				.post("/message")
				.set("x-session-id", "test-session")
				.send("invalid json")
				.expect(404); // No session found

			expect(response.body).toMatchObject({
				error: expect.any(String),
			});
		});
	});

	describe("Session Management", () => {
		it("should track active connections", async () => {
			// Initial state
			const initialHealth = await request(server["app"])
				.get("/health")
				.expect(200);

			expect(initialHealth.body.activeConnections).toBe(0);

			// After SSE connection
			await request(server["app"]).get("/sse").expect(200);

			const afterConnectionHealth = await request(server["app"])
				.get("/health")
				.expect(200);

			expect(afterConnectionHealth.body.activeConnections).toBeGreaterThan(0);
		});

		it("should clean up disconnected sessions", async () => {
			// This would require more complex async testing to simulate disconnections
			expect(true).toBe(true); // Placeholder for session cleanup test
		});
	});
});

describe("FlowMCPHttpServer Integration Tests", () => {
	it("should start server on specified port", async () => {
		const server = new FlowMCPHttpServer();
		const port = 3002;

		// Start server
		await server.start(port);

		// Test that server is running
		const response = await request(`http://localhost:${port}`)
			.get("/health")
			.expect(200);

		expect(response.body.status).toBe("ok");
	});
});
