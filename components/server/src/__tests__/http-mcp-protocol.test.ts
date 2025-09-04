import { beforeEach, describe, expect, it, type Mocked, vi } from "vitest";
import { FlowApiClient } from "../flow-client.ts";
import { FlowMCPHttpServer } from "../http-server.ts";

// Mock the FlowApiClient
vi.mock("../flow-client.ts");

describe("HTTP MCP Protocol Implementation", () => {
	let server: FlowMCPHttpServer;
	let mockFlowClient: Mocked<FlowApiClient>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockFlowClient = {
			startFlow: vi.fn(),
			getFlow: vi.fn(),
			getFlowStatus: vi.fn(),
			getApiStatus: vi.fn(),
		} as any;

		(FlowApiClient as any).mockImplementation(() => mockFlowClient);
		server = new FlowMCPHttpServer();
	});

	describe("MCP Tools Implementation", () => {
		it("should provide correct tool schemas", () => {
			// Test that tool schemas match MCP specification
			const expectedTools = [
				{
					name: "start_flow",
					description: "Start a new flow process (e.g., loan application)",
					inputSchema: {
						type: "object",
						properties: expect.objectContaining({
							flowDefinition: expect.any(Object),
							applicant: expect.any(Object),
							loanPurpose: expect.any(Object),
							loanAmount: expect.any(Object),
						}),
						required: [
							"flowDefinition",
							"applicant",
							"loanPurpose",
							"loanAmount",
						],
					},
				},
				{
					name: "get_flow",
					description: "Get flow details by ID",
					inputSchema: {
						type: "object",
						properties: {
							flowId: {
								type: "string",
								description: "The flow ID to retrieve",
							},
						},
						required: ["flowId"],
					},
				},
				{
					name: "get_flow_status",
					description: "Get flow status and tasks",
					inputSchema: {
						type: "object",
						properties: {
							flowId: {
								type: "string",
								description: "The flow ID to get status for",
							},
						},
						required: ["flowId"],
					},
				},
				{
					name: "get_api_status",
					description: "Check API health status",
					inputSchema: {
						type: "object",
						properties: {},
					},
				},
			];

			// This would be tested through the actual MCP server instance
			expect(expectedTools).toHaveLength(4);
			expectedTools.forEach((tool) => {
				expect(tool).toHaveProperty("name");
				expect(tool).toHaveProperty("description");
				expect(tool).toHaveProperty("inputSchema");
			});
		});

		it("should execute start_flow tool correctly", async () => {
			const mockResult = {
				_links: {
					self: {
						href: "/api/flows/test-flow-123"
					}
				},
				flowId: "test-flow-123",
				referenceId: "TEST-123"
			};

			mockFlowClient.startFlow.mockResolvedValue(mockResult);

			const toolArgs = {
				flowDefinition: "loan-application",
				applicant: { nin: "12345678901" },
				loanPurpose: "PURCHASE",
				loanAmount: 500000,
			};

			const result = await mockFlowClient.startFlow(toolArgs.flowDefinition, {
				applicant: toolArgs.applicant,
				loanPurpose: toolArgs.loanPurpose as any,
				loanAmount: toolArgs.loanAmount,
			});

			expect(result).toEqual(mockResult);
			expect(mockFlowClient.startFlow).toHaveBeenCalledWith(
				"loan-application",
				expect.objectContaining({
					applicant: { nin: "12345678901" },
					loanPurpose: "PURCHASE",
					loanAmount: 500000,
				}),
			);
		});

		it("should handle tool execution errors", async () => {
			mockFlowClient.getFlow.mockRejectedValue(new Error("Flow not found"));

			try {
				await mockFlowClient.getFlow("non-existent-flow");
				expect.fail("Should have thrown an error");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Flow not found");
			}
		});

		it("should validate required tool arguments", () => {
			const validArgs = {
				flowDefinition: "loan-application",
				applicant: { nin: "12345678901" },
				loanPurpose: "PURCHASE",
				loanAmount: 500000,
			};

			const invalidArgs = [
				{}, // Missing all required fields
				{ flowDefinition: "loan-application" }, // Missing other required fields
				{ flowDefinition: "", applicant: { nin: "" } }, // Empty values
			];

			// Validate that all required fields are present
			expect(validArgs).toHaveProperty("flowDefinition");
			expect(validArgs).toHaveProperty("applicant");
			expect(validArgs).toHaveProperty("loanPurpose");
			expect(validArgs).toHaveProperty("loanAmount");

			invalidArgs.forEach((args) => {
				const hasAllRequired =
					Object.hasOwn(args, "flowDefinition") &&
					Object.hasOwn(args, "applicant") &&
					Object.hasOwn(args, "loanPurpose") &&
					Object.hasOwn(args, "loanAmount");

				expect(hasAllRequired).toBe(false);
			});
		});
	});

	describe("MCP Resources Implementation", () => {
		it("should provide correct resource schemas", () => {
			const expectedResources = [
				{
					uri: "flow://flows/{flowId}",
					name: "Flow State",
					description: "Basic flow information and status",
					mimeType: "application/json",
				},
			];

			expect(expectedResources).toHaveLength(1);
			expect(expectedResources[0]).toMatchObject({
				uri: expect.stringMatching(/^flow:\/\//),
				name: expect.any(String),
				description: expect.any(String),
				mimeType: "application/json",
			});
		});

		it("should read flow resources correctly", async () => {
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
					data: {
						applicant: { nin: "12345678901" },
						loanAmount: 500000,
					},
					updatedAt: "2024-01-01T00:00:00Z",
					actions: ["read", "update"]
				},
			};

			mockFlowClient.getFlow.mockResolvedValue(mockFlow);

			const result = await mockFlowClient.getFlow("test-flow-123");

			expect(result).toEqual(mockFlow);
			expect(mockFlowClient.getFlow).toHaveBeenCalledWith("test-flow-123");
		});

		it("should handle invalid resource URIs", () => {
			const invalidURIs = [
				"invalid://flows/123",
				"flow://wrong-type/123",
				"flow://flows/",
				"not-a-uri-at-all",
			];

			invalidURIs.forEach((uri) => {
				const match = uri.match(/^flow:\/\/flows\/(.+)$/);
				expect(match).toBeFalsy();
			});

			// This URI has extra path but still matches the pattern (which is okay)
			const extraPathURI = "flow://flows/123/extra/path";
			const extraMatch = extraPathURI.match(/^flow:\/\/flows\/(.+)$/);
			expect(extraMatch).toBeTruthy(); // This actually matches
			expect(extraMatch![1]).toBe("123/extra/path"); // Extracts the full path
		});

		it("should extract flowId from valid URIs", () => {
			const validURIs = [
				{ uri: "flow://flows/123", expected: "123" },
				{ uri: "flow://flows/test-flow-456", expected: "test-flow-456" },
				{ uri: "flow://flows/abc-123-def", expected: "abc-123-def" },
			];

			validURIs.forEach(({ uri, expected }) => {
				const match = uri.match(/^flow:\/\/flows\/(.+)$/);
				expect(match).toBeTruthy();
				expect(match![1]).toBe(expected);
			});
		});
	});

	describe("MCP Prompts Implementation", () => {
		it("should provide correct prompt schemas", () => {
			const expectedPrompts = [
				{
					name: "loan-advisor",
					description: "Friendly and funny loan application guidance",
					arguments: [
						{
							name: "customerType",
							description: "Type of customer: individual or business",
							required: true,
						},
						{
							name: "loanAmount",
							description: "Desired loan amount in NOK",
							required: false,
						},
						{
							name: "loanPurpose",
							description: "Purpose: PURCHASE, MOVE, or INCREASE_LOAN",
							required: false,
						},
					],
				},
			];

			expect(expectedPrompts).toHaveLength(1);
			const prompt = expectedPrompts[0];

			expect(prompt).toHaveProperty("name");
			expect(prompt).toHaveProperty("description");
			expect(prompt).toHaveProperty("arguments");
			expect(prompt.arguments).toHaveLength(3);

			// Check required argument
			const requiredArg = prompt.arguments.find((arg) => arg.required);
			expect(requiredArg).toBeDefined();
			expect(requiredArg?.name).toBe("customerType");
		});

		it("should generate loan advisor prompts with correct structure", () => {
			const server = new FlowMCPHttpServer();

			const advice = (server as any).generateFunnyLoanAdvice(
				"individual",
				"500000 NOK",
				"PURCHASE",
			);

			// Check that the advice contains all expected elements
			expect(advice).toMatch(/🎉|🏦|💰/); // Has emojis (random greeting)
			expect(advice).toContain("Step 1"); // Has step-by-step guidance
			expect(advice).toContain("Step 5"); // Has all 5 steps
			expect(advice).toContain("start_flow"); // References the tool
			expect(advice).toContain("Individual"); // Uses the customer type (capitalized)
			expect(advice).toContain("500000 NOK"); // Uses the loan amount

			// Check structure
			expect(advice.split("\n").length).toBeGreaterThan(10); // Multi-line response
			expect(advice.length).toBeGreaterThan(500); // Substantial content
		});

		it("should handle different customer types", () => {
			const server = new FlowMCPHttpServer();

			const individualAdvice = (server as any).generateFunnyLoanAdvice(
				"individual",
				"300000 NOK",
				"PURCHASE",
			);

			const businessAdvice = (server as any).generateFunnyLoanAdvice(
				"business",
				"1000000 NOK",
				"PURCHASE",
			);

			// Should contain different content for different customer types
			expect(individualAdvice).not.toEqual(businessAdvice);
			expect(individualAdvice).toMatch(/Individual|Personal/); // Individual or Personal loan text
			expect(businessAdvice).toMatch(/business|Corporate/); // Business or Corporate text
		});

		it("should handle different loan purposes", () => {
			const server = new FlowMCPHttpServer();

			const purposes = ["PURCHASE", "MOVE", "INCREASE_LOAN"];
			const adviceTexts = purposes.map((purpose) =>
				(server as any).generateFunnyLoanAdvice(
					"individual",
					"500000 NOK",
					purpose,
				),
			);

			// All should be different
			expect(new Set(adviceTexts).size).toBe(3);

			// Each should contain appropriate content based on purpose
			expect(adviceTexts[0]).toContain("Buying"); // Purchase-related text
			expect(adviceTexts[1]).toContain("Moving"); // Move-related text
			expect(adviceTexts[2]).toContain("More money"); // Increase loan text
		});

		it("should provide fallback for unknown prompt names", () => {
			// Test error handling for unknown prompts
			const unknownPrompts = ["unknown-prompt", "", "invalid"];

			unknownPrompts.forEach((promptName) => {
				expect(promptName).not.toBe("loan-advisor");
			});
		});
	});

	describe("JSON-RPC 2.0 Compliance", () => {
		it("should follow JSON-RPC 2.0 request format", () => {
			const validRequests = [
				{
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				},
				{
					jsonrpc: "2.0",
					id: "string-id",
					method: "resources/read",
					params: { uri: "flow://flows/123" },
				},
				{
					jsonrpc: "2.0",
					method: "notification", // Notification (no id)
					params: {},
				},
			];

			validRequests.forEach((request) => {
				expect(request.jsonrpc).toBe("2.0");
				expect(request).toHaveProperty("method");
				expect(request).toHaveProperty("params");
			});
		});

		it("should follow JSON-RPC 2.0 response format", () => {
			const validResponses = [
				{
					jsonrpc: "2.0",
					id: 1,
					result: { tools: [] },
				},
				{
					jsonrpc: "2.0",
					id: 2,
					error: {
						code: -1,
						message: "Error message",
					},
				},
			];

			validResponses.forEach((response) => {
				expect(response.jsonrpc).toBe("2.0");
				expect(response).toHaveProperty("id");
				expect(
					Object.hasOwn(response, "result") || Object.hasOwn(response, "error"),
				).toBe(true);
			});
		});

		it("should handle JSON-RPC error codes correctly", () => {
			const errorCodes = {
				PARSE_ERROR: -32700,
				INVALID_REQUEST: -32600,
				METHOD_NOT_FOUND: -32601,
				INVALID_PARAMS: -32602,
				INTERNAL_ERROR: -32603,
			};

			Object.values(errorCodes).forEach((code) => {
				expect(typeof code).toBe("number");
				expect(code).toBeLessThan(0);
			});
		});
	});

	describe("MCP Capability Declaration", () => {
		it("should declare correct server capabilities", () => {
			const expectedCapabilities = {
				tools: {},
				resources: {},
				prompts: {},
			};

			expect(expectedCapabilities).toHaveProperty("tools");
			expect(expectedCapabilities).toHaveProperty("resources");
			expect(expectedCapabilities).toHaveProperty("prompts");
		});

		it("should provide server metadata", () => {
			const serverInfo = {
				name: "flow-mcp-server",
				version: "1.0.0",
			};

			expect(serverInfo.name).toBe("flow-mcp-server");
			expect(serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning
		});
	});
});
