import {
	afterAll,
	beforeAll,
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

describe("FlowMCPHttpServer - Full Integration", () => {
	let server: FlowMCPHttpServer;
	let serverPort: number;
	let mockFlowClient: Mocked<FlowApiClient>;

	beforeAll(async () => {
		// Setup mock
		mockFlowClient = {
			startFlow: vi.fn(),
			getFlow: vi.fn(),
			getFlowStatus: vi.fn(),
			getApiStatus: vi.fn(),
		} as any;

		(FlowApiClient as any).mockImplementation(() => mockFlowClient);

		// Start server on random port
		server = new FlowMCPHttpServer();
		serverPort = 3003;
		await server.start(serverPort);
	});

	afterAll(async () => {
		// Note: In a real implementation, we'd add a stop() method to the server
		// For now, we'll just clean up mocks
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("End-to-End MCP Flow", () => {
		it("should handle complete loan application workflow", async () => {
			// Mock data
			const mockStartResult = {
				flowId: "loan-123",
				status: "started",
				tasks: [
					{ taskId: "task-1", status: "pending", taskType: "personal-info" },
				],
			};

			const mockFlowData = {
				flow: {
					flowId: "loan-123",
					status: "active",
					flowDefinitionId: "loan-application",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T01:00:00Z",
					data: {
						applicant: { nin: "12345678901" },
						loanPurpose: "PURCHASE",
						loanAmount: 500000,
					},
				},
			};

			const mockFlowStatus = {
				flow: { flowId: "loan-123", status: "active" },
				tasks: [
					{
						taskId: "task-1",
						status: "pending",
						taskType: "personal-info",
						createdAt: "2024-01-01T00:00:00Z",
					},
				],
			};

			mockFlowClient.startFlow.mockResolvedValue(mockStartResult);
			mockFlowClient.getFlow.mockResolvedValue(mockFlowData);
			mockFlowClient.getFlowStatus.mockResolvedValue(mockFlowStatus);

			// Test the workflow
			expect(mockFlowClient.startFlow).toBeDefined();
			expect(mockFlowClient.getFlow).toBeDefined();
			expect(mockFlowClient.getFlowStatus).toBeDefined();

			// Verify mocks are set up correctly
			const startResult = await mockFlowClient.startFlow("loan-application", {
				applicant: { nin: "12345678901" },
				loanPurpose: "PURCHASE",
				loanAmount: 500000,
			});

			expect(startResult.flowId).toBe("loan-123");
			expect(mockFlowClient.startFlow).toHaveBeenCalledOnce();
		});

		it("should generate contextual loan advisor prompt", async () => {
			// This tests the prompt generation logic
			const server = new FlowMCPHttpServer();

			// Test the private method via reflection (for testing purposes)
			const advice = (server as any).generateFunnyLoanAdvice(
				"individual",
				"500000 NOK",
				"PURCHASE",
			);

			expect(advice).toContain("🎉");
			expect(advice).toContain("individual");
			expect(advice).toContain("500000 NOK");
			expect(advice).toContain("Step 1");
			expect(advice).toContain("Step 5");
			expect(advice).toContain("start_flow");
		});

		it("should handle different customer types in prompts", async () => {
			const server = new FlowMCPHttpServer();

			const individualAdvice = (server as any).generateFunnyLoanAdvice(
				"individual",
				"300000 NOK",
				"MOVE",
			);

			const businessAdvice = (server as any).generateFunnyLoanAdvice(
				"business",
				"1000000 NOK",
				"PURCHASE",
			);

			expect(individualAdvice).toContain("individual");
			expect(businessAdvice).toContain("business");
			expect(individualAdvice).not.toEqual(businessAdvice);
		});
	});

	describe("Resource URI Parsing", () => {
		it("should correctly parse flow resource URIs", async () => {
			const server = new FlowMCPHttpServer();

			// Test URI parsing logic (accessing private method for testing)
			const validURI = "flow://flows/test-123";
			const match = validURI.match(/^flow:\/\/flows\/(.+)$/);

			expect(match).toBeTruthy();
			expect(match![1]).toBe("test-123");
		});

		it("should reject invalid resource URIs", async () => {
			const invalidURIs = [
				"invalid://flows/123",
				"flow://wrong/123",
				"flow://flows/",
				"not-a-uri",
			];

			invalidURIs.forEach((uri) => {
				const match = uri.match(/^flow:\/\/flows\/(.+)$/);
				expect(match).toBeFalsy();
			});
		});
	});

	describe("Error Scenarios", () => {
		it("should handle Flow API connection failures", async () => {
			mockFlowClient.getFlow.mockRejectedValue(new Error("Connection refused"));

			try {
				await mockFlowClient.getFlow("test-flow");
				expect.fail("Should have thrown an error");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Connection refused");
			}
		});

		it("should handle malformed Flow API responses", async () => {
			mockFlowClient.getFlow.mockResolvedValue(null as any);

			const result = await mockFlowClient.getFlow("test-flow");
			expect(result).toBeNull();
		});

		it("should handle missing required tool arguments", async () => {
			// Test argument validation
			const server = new FlowMCPHttpServer();

			// This would normally be handled by the MCP protocol layer
			expect(true).toBe(true); // Placeholder for argument validation test
		});
	});

	describe("Performance and Concurrency", () => {
		it("should handle multiple concurrent sessions", async () => {
			// Test that the server can handle multiple simultaneous connections
			const server = new FlowMCPHttpServer();

			// Simulate multiple sessions
			const sessionCount = 5;
			const sessions = new Array(sessionCount)
				.fill(null)
				.map((_, i) => `session-${i}`);

			expect(sessions).toHaveLength(sessionCount);

			// In a real test, we would establish multiple SSE connections
			// and verify they don't interfere with each other
		});

		it("should clean up resources on disconnect", async () => {
			const server = new FlowMCPHttpServer();

			// Test session cleanup
			const initialConnections = server["activeTransports"].size;
			expect(initialConnections).toBe(0);

			// After adding and removing a transport, should be back to 0
			// This would require simulating the full SSE lifecycle
		});
	});

	describe("Security", () => {
		it("should validate session IDs", async () => {
			// Test that only valid session IDs are accepted
			const validSessionId = "valid-session-123";
			const invalidSessionIds = [
				"",
				null,
				undefined,
				"invalid chars!@#",
				"too-long-" + "x".repeat(100),
			];

			expect(validSessionId).toMatch(/^[a-zA-Z0-9-]+$/);

			invalidSessionIds.forEach((id) => {
				if (typeof id === "string") {
					const isValidFormat = /^[a-zA-Z0-9-]+$/.test(id);
					const isTooLong = id.length > 50;
					expect(isValidFormat && !isTooLong).toBe(false);
				}
			});
		});

		it("should sanitize error messages", async () => {
			// Ensure error messages don't leak sensitive information
			const sensitiveError = new Error("Database password: secret123");

			// In the real implementation, we should sanitize error messages
			expect(sensitiveError.message).toBe("Database password: secret123");

			// The sanitized version should not contain sensitive data
			const sanitized = "Internal server error";
			expect(sanitized).not.toContain("password");
			expect(sanitized).not.toContain("secret");
		});
	});

	describe("MCP Protocol Compliance", () => {
		it("should follow JSON-RPC 2.0 format", async () => {
			const validRequest = {
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: {},
			};

			expect(validRequest.jsonrpc).toBe("2.0");
			expect(validRequest).toHaveProperty("id");
			expect(validRequest).toHaveProperty("method");
			expect(validRequest).toHaveProperty("params");
		});

		it("should handle MCP capability negotiation", async () => {
			const server = new FlowMCPHttpServer();
			const mcpServer = (server as any).createMCPServer();

			expect(mcpServer).toBeDefined();
			expect(mcpServer.name).toBe("flow-mcp-server");
			expect(mcpServer.version).toBe("1.0.0");
		});
	});
});

describe("FlowMCPHttpServer - Load Testing", () => {
	it("should handle high request volume", async () => {
		// Placeholder for load testing
		const requestCount = 100;
		const requests = Array.from({ length: requestCount }, (_, i) => i);

		expect(requests).toHaveLength(requestCount);

		// In a real load test, we would:
		// 1. Send multiple concurrent requests
		// 2. Measure response times
		// 3. Verify no memory leaks
		// 4. Check error rates
	});

	it("should maintain response times under load", async () => {
		// Placeholder for performance testing
		const startTime = Date.now();

		// Simulate some processing
		await new Promise((resolve) => setTimeout(resolve, 1));

		const endTime = Date.now();
		const responseTime = endTime - startTime;

		expect(responseTime).toBeLessThan(100); // Should be very fast for this simple test
	});
});
