export interface FlowApiConfig {
	baseUrl: string;
	timeout?: number;
	defaultUser?: Record<string, unknown>;
}

export interface StartFlowResponse {
	_links: {
		self: {
			href: string;
		};
	};
	flowId: string;
	referenceId: string;
}

export interface Task {
	taskId: string;
	taskType: string;
	taskCategory: "start-task" | "service-task" | "user-task";
	status: "pending" | "completed" | "failed";
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

export interface Flow {
	_links: {
		self: string;
		tasks: {
			href: string;
		};
	};
	flow: {
		flowId: string;
		_meta: {
			processDefinitionId: string;
			processInstanceId: string;
			processVersion: string;
		};
		createdAt: string;
		flowDefinitionId: string;
		flowNumber: number;
		hasErrors: boolean;
		hasIncidents: boolean;
		incidents: Record<string, unknown>;
		numAttachments: number;
		referenceId: string;
		referenceName: string | null;
		sandbox: boolean;
		sandboxConfig: Record<string, unknown>;
		status: "active" | "completed" | "failed" | "cancelled";
		version: number;
		versionTag: string | null;
		data: Record<string, unknown>;
		updatedAt: string;
		actions: string[];
	};
}

export interface FlowStatus {
	flow: {
		flowId: string;
		flowDefinitionId: string;
		hasErrors: boolean;
		status: "active" | "completed" | "failed" | "cancelled";
	};
	tasks: Task[];
}

export interface TaskDetails {
	_links: {
		self: string;
		flow: {
			href: string;
		};
	};
	task: {
		flowId: string;
		taskId: string;
		createdAt: string;
		data: Record<string, unknown>;
		onCreatePatches: unknown[];
		processDefinitionId: string;
		scope: Record<string, unknown>;
		status: "pending" | "completed" | "failed";
		taskCategory: "start-task" | "service-task" | "user-task";
		taskType: string;
		updatedAt: string;
		variables: Record<string, unknown>;
		context: {
			input: Record<string, unknown>;
			customerData?: Record<string, unknown>;
			[key: string]: unknown;
		};
		defaults: Record<string, unknown>;
		permissions: {
			read: boolean;
			save: boolean;
			complete: boolean;
		};
		actions: string[];
	};
}

export interface CompleteTaskRequest {
	taskId: string;
	data: Record<string, unknown>;
}

export interface CompleteTaskResponse {
	success?: boolean;
	message?: string;
	nextTask?: Task;
}

export interface TaskSchema {
	$schema: string;
	type: "object";
	description: string;
	required: string[];
	properties: Record<
		string,
		{
			type: string;
			description: string;
			enum?: string[];
			pattern?: string;
			properties?: Record<string, unknown>;
			items?: Record<string, unknown>;
			uiSchema?: Record<string, unknown>;
		}
	>;
}

export interface FlowSchema {
	$schema: string;
	type: "object";
	description: string;
	definitions: Record<string, unknown>;
	required: string[];
	properties: Record<
		string,
		{
			type: string;
			description: string;
			enum?: string[];
			pattern?: string;
			properties?: Record<string, unknown>;
			required?: string[];
		}
	>;
}

export interface FlowDefinition {
	id: string;
	name: string;
	description?: string;
	version?: string;
	category?: string;
	status: "active" | "inactive" | "draft";
	createdAt: string;
	updatedAt: string;
}

export interface ApiError {
	title: string;
	detail: string;
	status: number;
	errorType: string;
	errors?: Array<{
		keyword: string;
		dataPath: string;
		schemaPath: string;
		params: Record<string, unknown>;
		message: string;
	}>;
}
