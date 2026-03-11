/**
 * MCP Tool: Blanket API
 *
 * Manages listTemplates via the existing Blanket Cloud Functions API.
 * Calls endpoints at /api/v2/list-templates/* with the user's auth token.
 *
 * Request format: POST { data: { organizationId, ...params } }
 * Response format: { data: { success, message, result, metadata } }
 */

import axios from 'axios';
import { MCPTool, MCPAuthContext } from '../libs/mcp-types';
import { appConfig } from '../core/config';

type BlanketAction =
  | 'list_templates'
  | 'get_template'
  | 'update_template'
  | 'add_task_to_template'
  | 'create_template';

function getAxiosInstance(token: string) {
  const instance = axios.create({
    baseURL: appConfig.apiBaseUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return instance;
}

async function listTemplates(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);
  const response = await client.post('/v2/list-templates/list', {
    data: {
      organizationId: context.orgId,
      locationIds: params.locationIds,
      query: params.query,
      pageSize: params.pageSize || 20,
      page: params.page || 0,
      isDeleted: false,
    },
  });
  return response.data?.data?.result;
}

async function getTemplate(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);
  const response = await client.post('/v2/list-templates/list', {
    data: {
      organizationId: context.orgId,
      relations: ['tasks'],
      isJoinTasks: true,
      query: params.templateId || params.name,
      pageSize: 1,
      page: 0,
    },
  });
  const results = response.data?.data?.result;
  return results?.[0] || null;
}

async function updateTemplate(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);
  const response = await client.post('/v2/list-templates/update', {
    data: {
      id: params.templateId,
      organizationId: context.orgId,
      ...params.updates,
    },
  });
  return response.data?.data?.result;
}

async function addTaskToTemplate(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);

  // First get the template with its tasks
  const template = await getTemplate(
    { templateId: params.templateId },
    context
  );

  if (!template) {
    throw new Error(`Template not found: ${params.templateId}`);
  }

  const existingTasks = template.tasks || [];
  const insertIndex =
    params.afterTaskIndex !== undefined
      ? params.afterTaskIndex + 1
      : existingTasks.length;

  const newTask = {
    name: params.task.name,
    type: params.task.type || 'checkMark',
    description: params.task.description || '',
    required: params.task.required !== false,
    isCritical: params.task.isCritical || false,
    index: insertIndex,
    ...(params.task.type === 'temperature' && {
      minValue: params.task.minValue,
      maxValue: params.task.maxValue,
    }),
  };

  // Re-index tasks after insertion point
  const updatedTasks = [...existingTasks];
  updatedTasks.splice(insertIndex, 0, newTask);
  const reindexed = updatedTasks.map((t: any, i: number) => ({
    ...t,
    index: i,
  }));

  const response = await client.post('/v2/list-templates/update', {
    data: {
      id: params.templateId,
      organizationId: context.orgId,
      tasks: reindexed,
    },
  });

  return {
    templateId: params.templateId,
    templateName: template.name,
    taskAdded: newTask,
    totalTasks: reindexed.length,
    result: response.data?.data?.result,
  };
}

async function createTemplate(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);
  const response = await client.post('/v2/list-templates/create', {
    data: {
      organizationId: context.orgId,
      name: params.name,
      description: params.description || '',
      locationId: params.locationId,
      tasks: (params.tasks || []).map((t: any, i: number) => ({
        name: t.name,
        type: t.type || 'checkMark',
        description: t.description || '',
        required: t.required !== false,
        isCritical: t.isCritical || false,
        index: i,
        ...(t.type === 'temperature' && {
          minValue: t.minValue,
          maxValue: t.maxValue,
        }),
      })),
    },
  });
  return response.data?.data?.result;
}

const actionHandlers: Record<
  BlanketAction,
  (params: any, context: MCPAuthContext) => Promise<any>
> = {
  list_templates: listTemplates,
  get_template: getTemplate,
  update_template: updateTemplate,
  add_task_to_template: addTaskToTemplate,
  create_template: createTemplate,
};

export const blanketAPITool: MCPTool = {
  name: 'blanket-api',
  description:
    'Manage Blanket listTemplates. Actions: list_templates, get_template, update_template, add_task_to_template, create_template. All operations are scoped to the authenticated user\'s organization.',
  requiresAuth: true,

  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'list_templates',
          'get_template',
          'update_template',
          'add_task_to_template',
          'create_template',
        ],
        description: 'The action to perform on listTemplates',
      },
      params: {
        type: 'object',
        description:
          'Action-specific parameters. For list_templates: { locationIds?, query?, pageSize?, page? }. For get_template: { templateId or name }. For update_template: { templateId, updates }. For add_task_to_template: { templateId, task: { name, type, description?, required?, isCritical?, minValue?, maxValue? }, afterTaskIndex? }. For create_template: { name, description?, locationId?, tasks: [] }.',
      },
    },
    required: ['action', 'params'],
  },

  execute: async (params: any, context: MCPAuthContext) => {
    const { action, params: actionParams } = params;

    const handler = actionHandlers[action as BlanketAction];
    if (!handler) {
      throw new Error(`Unknown blanket-api action: ${action}`);
    }

    return handler(actionParams || {}, context);
  },
};
