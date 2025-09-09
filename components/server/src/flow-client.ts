import type {
	CompleteTaskResponse,
	Flow,
	FlowApiConfig,
	FlowDefinition,
	FlowSchema,
	FlowStatus,
	FlowsQueryParams,
	FlowsResponse,
	StartFlowResponse,
	TaskDetails,
	TaskSchema,
} from "./types.ts";

export class FlowApiClient {
	private baseUrl: string;
	private timeout: number;

	constructor(config: FlowApiConfig) {
		this.baseUrl = config.baseUrl.replace(/\/$/, "");
		this.timeout = config.timeout || 30000;
	}

	private async makeRequest<T>(
		endpoint: string,
		options: {
			method?: string;
			headers?: Record<string, string>;
			body?: string;
			signal?: AbortSignal;
			forwardHeaders?: Record<string, string>;
		} = {},
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				...options.headers,
			};

			// Forward headers from the client request
			if (options.forwardHeaders) {
				for (const [key, value] of Object.entries(options.forwardHeaders)) {
					headers[key] = value;
				}
			}

			const response = await fetch(url, {
				...options,
				signal: controller.signal,
				headers,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as {
					title?: string;
					detail?: string;
					message?: string;
				};
				throw new Error(
					`API Error: ${response.status} - ${errorData.title || errorData.detail || errorData.message || response.statusText}`,
					{
						cause: errorData,
					},
				);
			}

			// Handle 204 No Content responses
			if (response.status === 204) {
				return {} as T;
			}

			// Check if response has content to parse
			const contentType = response.headers.get('content-type');
			if (!contentType || !contentType.includes('application/json')) {
				// If no JSON content type, try to get text or return empty object
				const text = await response.text();
				return (text ? { message: text } : {}) as T;
			}

			return (await response.json()) as T;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Request failed: ${String(error)}`);
		}
	}

	async startFlow(
		flowDefinition: string,
		data: Record<string, unknown>,
		forwardHeaders?: Record<string, string>,
	): Promise<StartFlowResponse> {
		return this.makeRequest<StartFlowResponse>(
			`/api/flow-definitions/${flowDefinition}`,
			{
				method: "POST",
				body: JSON.stringify(data),
				forwardHeaders,
			},
		);
	}

	async getFlow(
		flowId: string,
		forwardHeaders?: Record<string, string>,
	): Promise<Flow> {
		return this.makeRequest<Flow>(`/api/flows/${flowId}`, { forwardHeaders });
	}

	async getFlowStatus(
		flowId: string,
		forwardHeaders?: Record<string, string>,
	): Promise<FlowStatus> {
		return this.makeRequest<FlowStatus>(`/api/flows/${flowId}/status`, {
			forwardHeaders,
		});
	}

	async getTask(
		taskId: string,
		forwardHeaders?: Record<string, string>,
	): Promise<TaskDetails> {
		return this.makeRequest<TaskDetails>(`/api/tasks/${taskId}`, {
			forwardHeaders,
		});
	}

	async completeTask(
		taskId: string,
		data: Record<string, unknown>,
		forwardHeaders?: Record<string, string>,
	): Promise<CompleteTaskResponse> {
		return this.makeRequest<CompleteTaskResponse>(
			`/api/tasks/${taskId}/complete`,
			{
				method: "POST",
				body: JSON.stringify(data),
				forwardHeaders,
			},
		);
	}

	async triggerTask(
		taskId: string,
		data: Record<string, unknown>,
		forwardHeaders?: Record<string, string>,
	): Promise<CompleteTaskResponse> {
		return this.makeRequest<CompleteTaskResponse>(
			`/api/tasks/${taskId}/trigger`,
			{
				method: "POST",
				body: JSON.stringify(data),
				forwardHeaders,
			},
		);
	}

	async getFlowSchema(flowDefinition: string): Promise<FlowSchema> {
		return this.makeRequest<FlowSchema>(
			`/api/flow-definitions/${flowDefinition}/schema`,
		);
	}

	async getTaskSchema(
		flowDefinition: string,
		taskType: string,
	): Promise<TaskSchema> {
		return this.makeRequest<TaskSchema>(
			`/api/task-definitions/${flowDefinition}/${taskType}/schema`,
		);
	}

	async getApiStatus(): Promise<{ status: string; version?: string }> {
		try {
			const response = await this.makeRequest<{ version?: string }>(
				"/api/health",
			);
			return { status: "healthy", version: response.version };
		} catch {
			return { status: "unhealthy" };
		}
	}

	async getFlowDefinitions(): Promise<FlowDefinition[]> {
		return this.makeRequest<FlowDefinition[]>("/api/flow-definitions");
	}

	async getFlows(
		params?: FlowsQueryParams,
		forwardHeaders?: Record<string, string>,
	): Promise<FlowsResponse> {
		let endpoint = "/api/flows";

		if (params && Object.keys(params).length > 0) {
			const searchParams = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined && value !== null) {
					searchParams.append(key, String(value));
				}
			}
			if (searchParams.toString()) {
				endpoint += `?${searchParams.toString()}`;
			}
		}

		return this.makeRequest<FlowsResponse>(endpoint, { forwardHeaders });
	}
}
