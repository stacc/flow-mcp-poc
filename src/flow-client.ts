import {
  FlowApiConfig,
  LoanApplicationData,
  StartFlowResponse,
  Flow,
  FlowStatus,
  TaskDetails,
  CompleteTaskResponse,
  TaskSchema,
  FlowSchema,
} from './types.js';

export class FlowApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: FlowApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { 
          title?: string; 
          detail?: string; 
          message?: string; 
        };
        throw new Error(
          `API Error: ${response.status} - ${errorData.title || errorData.detail || errorData.message || response.statusText}`
        );
      }

      return await response.json() as T;
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
    data: LoanApplicationData
  ): Promise<StartFlowResponse> {
    return this.makeRequest<StartFlowResponse>(
      `/api/flow-definitions/${flowDefinition}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async getFlow(flowId: string): Promise<Flow> {
    return this.makeRequest<Flow>(`/api/flows/${flowId}`);
  }

  async getFlowStatus(flowId: string): Promise<FlowStatus> {
    return this.makeRequest<FlowStatus>(`/api/flows/${flowId}/status`);
  }

  async getTask(taskId: string): Promise<TaskDetails> {
    return this.makeRequest<TaskDetails>(`/api/tasks/${taskId}`);
  }

  async completeTask(
    taskId: string,
    data: Record<string, unknown>
  ): Promise<CompleteTaskResponse> {
    return this.makeRequest<CompleteTaskResponse>(
      `/api/tasks/${taskId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  async getFlowSchema(flowDefinition: string): Promise<FlowSchema> {
    return this.makeRequest<FlowSchema>(
      `/api/flow-definitions/${flowDefinition}/schema`
    );
  }

  async getTaskSchema(
    flowDefinition: string,
    taskType: string
  ): Promise<TaskSchema> {
    return this.makeRequest<TaskSchema>(
      `/api/task-definitions/${flowDefinition}/${taskType}/schema`
    );
  }

  async getApiStatus(): Promise<{ status: string; version?: string }> {
    try {
      const response = await this.makeRequest<{ version?: string }>('/api/health');
      return { status: 'healthy', version: response.version };
    } catch {
      return { status: 'unhealthy' };
    }
  }
}