/**
 * MCP Tool: Blanket API
 *
 * Manages listTemplates via the existing Blanket Cloud Functions API.
 * - Read operations use V2: /api/v2/list-templates/*
 * - Mutations use V1: /api/v1/listTemplates/* (V2 is read-only)
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

  if (params.templateId) {
    // V1 has a direct get-by-ID endpoint
    // V1 returns { data: result } not { data: { result } }
    const response = await client.post('/v1/listTemplates/get', {
      data: {
        id: params.templateId,
        relations: ['tasks'],
        isJoinTasks: true,
      },
    });
    return response.data?.data || null;
  }

  // Search by name via V2 list
  const response = await client.post('/v2/list-templates/list', {
    data: {
      organizationId: context.orgId,
      relations: ['tasks'],
      isJoinTasks: true,
      query: params.name,
      pageSize: 1,
      page: 0,
      isDeleted: false,
    },
  });
  const results = response.data?.data?.result;
  return results?.[0] || null;
}

async function updateTemplate(params: any, context: MCPAuthContext) {
  const client = getAxiosInstance(context.token);
  // V1 for mutations — V2 is read-only
  const response = await client.post('/v1/listTemplates/update', {
    data: {
      id: params.templateId,
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

  console.log('Template found:', template.name, 'with', (template.tasks || []).length, 'existing tasks');

  const existingTasks = template.tasks || [];
  const insertIndex =
    params.afterTaskIndex !== undefined
      ? params.afterTaskIndex + 1
      : existingTasks.length;

  /**
   * Map common/AI-generated type names to valid Blanket API task types.
   * Valid types: checkMark, yesNo, photo, photoAndShortAnswer, multipleChoice,
   * number, shortAnswer, temperature, rangeScale, date, time, signature,
   * parFill, formula, page, section
   */
  const VALID_TASK_TYPES = new Set([
    'checkMark', 'yesNo', 'photo', 'photoAndShortAnswer', 'multipleChoice',
    'number', 'shortAnswer', 'temperature', 'rangeScale', 'date', 'time',
    'signature', 'parFill', 'formula', 'page', 'section', 'createAction',
  ]);

  const TYPE_ALIASES: Record<string, string> = {
    'text': 'shortAnswer',
    'TEXT': 'shortAnswer',
    'checkbox': 'checkMark',
    'check': 'checkMark',
    'CHECK': 'checkMark',
    'yes_no': 'yesNo',
    'boolean': 'yesNo',
    'temp': 'temperature',
    'range': 'rangeScale',
    'scale': 'rangeScale',
    'multiple_choice': 'multipleChoice',
    'mc': 'multipleChoice',
    'short_answer': 'shortAnswer',
    'image': 'photo',
  };

  function resolveTaskType(type: string): string {
    if (VALID_TASK_TYPES.has(type)) return type;
    const alias = TYPE_ALIASES[type] || TYPE_ALIASES[type.toLowerCase()];
    return alias || 'checkMark';
  }

  /**
   * Normalize a task object to ensure all required fields have defaults.
   * The Blanket API rejects tasks missing required/isCritical/etc.
   */
  function normalizeTask(t: any, idx: number): any {
    const resolvedType = resolveTaskType(t.type || 'checkMark');
    const normalized: any = {
      name: t.name || '',
      type: resolvedType,
      description: t.description || '',
      required: t.required !== undefined ? t.required : true,
      isCritical: t.isCritical !== undefined ? t.isCritical : false,
      points: t.points !== undefined ? t.points : 1,
      conditions: t.conditions !== undefined ? t.conditions : [],
      index: idx,
    };
    // Preserve id and parentId for existing tasks
    if (t.id) normalized.id = t.id;
    if (t.parentId) normalized.parentId = t.parentId;
    // Temperature-specific fields
    if (resolvedType === 'temperature') {
      normalized.minValue = t.minValue ?? null;
      normalized.maxValue = t.maxValue ?? null;
    }
    return normalized;
  }

  // Determine parentId for the new task:
  // - If explicitly provided, use it
  // - If template has pages/sections, default to the last page's ID
  // - Otherwise use the template ID itself
  let parentId = params.task.parentId;
  if (!parentId) {
    const pages = existingTasks.filter((t: any) => t.type === 'page' || t.type === 'section');
    if (pages.length > 0) {
      // Default to the last page — most likely where the user wants to add
      parentId = pages[pages.length - 1].id;
    } else {
      // No pages — use template ID as parent
      parentId = params.templateId;
    }
  }

  const newTask = normalizeTask({
    name: params.task.name,
    type: params.task.type || 'checkMark',
    description: params.task.description || '',
    required: params.task.required !== false,
    isCritical: params.task.isCritical || false,
    parentId,
  }, insertIndex);

  // Re-index all tasks (existing + new) with normalized schema
  const updatedTasks = [...existingTasks];
  updatedTasks.splice(insertIndex, 0, newTask);
  const reindexed = updatedTasks.map((t: any, i: number) => normalizeTask(t, i));

  const updatePayload = {
    data: {
      id: params.templateId,
      tasks: reindexed,
    },
  };

  console.log('Update payload task count:', reindexed.length);
  console.log('New task:', JSON.stringify(newTask));

  let response;
  try {
    // V1 for mutations — V2 is read-only
    response = await client.post('/v1/listTemplates/update', updatePayload);
  } catch (err: any) {
    console.error('addTaskToTemplate API error:', err?.response?.status, JSON.stringify(err?.response?.data));
    throw err;
  }

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
  // V1 for mutations — V2 is read-only
  const response = await client.post('/v1/listTemplates/create', {
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
          'Action-specific parameters. For list_templates: { locationIds?, query?, pageSize?, page? }. For get_template: { templateId or name }. For update_template: { templateId, updates }. For add_task_to_template: { templateId, task: { name, type, description?, required?, isCritical?, minValue?, maxValue? }, afterTaskIndex? }. For create_template: { name, description?, locationId?, tasks: [] }. Valid task types: checkMark (default checkbox), yesNo, shortAnswer (for text/free-form input), photo, photoAndShortAnswer, multipleChoice, number, temperature, rangeScale, date, time, signature, parFill, formula, page (section divider), section, createAction.',
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
