/**
 * Conversation History - Firestore persistence (with in-memory fallback for local dev)
 *
 * Stores and retrieves AI conversation history per user.
 * Collection: ai_conversations
 *
 * Users can only access their own conversations (enforced by query).
 *
 * When running locally without Firestore credentials, automatically falls back
 * to in-memory storage so development can proceed without a service account.
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { MCPConversation, MCPMessage, MCPToolCallRecord } from './mcp-types';

const COLLECTION = 'ai_conversations';
const MAX_MESSAGES = 50; // Keep last 50 messages per conversation

// ─── In-Memory Store (local dev fallback) ──────────────────────────────────
const memoryStore = new Map<string, MCPConversation>();
let useMemory: boolean | null = null; // null = not yet determined

async function shouldUseMemory(): Promise<boolean> {
  if (useMemory !== null) return useMemory;

  // In production (Cloud Functions), Firestore credentials are automatic
  if (process.env.NODE_ENV !== 'development') {
    useMemory = false;
    return false;
  }

  // Local dev defaults to in-memory (Firestore writes typically fail without
  // a service account). Set USE_FIRESTORE=true to override.
  if (process.env.USE_FIRESTORE === 'true') {
    useMemory = false;
    console.log('Conversation store: using Firestore (USE_FIRESTORE=true)');
  } else {
    useMemory = true;
    console.log('Conversation store: using in-memory (local dev)');
  }

  return useMemory;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get or create a conversation.
 */
export async function getConversation(
  conversationId: string | undefined,
  userId: string,
  orgId: string
): Promise<MCPConversation> {
  if (await shouldUseMemory()) {
    return getConversationMemory(conversationId, userId, orgId);
  }
  return getConversationFirestore(conversationId, userId, orgId);
}

/**
 * Append messages to a conversation and persist.
 */
export async function appendMessages(
  conversationId: string,
  newMessages: MCPMessage[]
): Promise<void> {
  if (await shouldUseMemory()) {
    return appendMessagesMemory(conversationId, newMessages);
  }
  return appendMessagesFirestore(conversationId, newMessages);
}

/**
 * Convert stored messages to Gemini content format.
 * Includes tool call context so the model remembers what actions were taken.
 */
export function toGeminiHistory(
  messages: MCPMessage[]
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      let text = m.content;
      // Append tool call context so the model remembers what it did
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const toolSummary = m.toolCalls
          .map((tc) => `[Tool: ${tc.tool}, action: ${tc.action}, params: ${JSON.stringify(tc.params)}, success: ${tc.success}]`)
          .join('\n');
        text = `${text}\n\n--- Tool calls made ---\n${toolSummary}`;
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      };
    });
}

/**
 * Build a message record for the audit trail.
 */
export function buildMessage(
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: MCPToolCallRecord[]
): MCPMessage {
  return {
    role,
    content,
    timestamp: Date.now(),
    ...(toolCalls?.length ? { toolCalls } : {}),
  };
}

/**
 * List conversations for a user, ordered by most recently updated.
 * Returns lightweight summaries (no full message history).
 */
export async function listConversations(
  userId: string,
  orgId: string,
  limit = 30
): Promise<Array<{ id: string; preview: string; updatedAt: number; createdAt: number }>> {
  if (await shouldUseMemory()) {
    return listConversationsMemory(userId, limit);
  }
  return listConversationsFirestore(userId, orgId, limit);
}

function listConversationsMemory(
  userId: string,
  limit: number
): Array<{ id: string; preview: string; updatedAt: number; createdAt: number }> {
  const results: Array<{ id: string; preview: string; updatedAt: number; createdAt: number }> = [];
  for (const conv of memoryStore.values()) {
    if (conv.userId !== userId) continue;
    const firstUserMsg = conv.messages.find((m) => m.role === 'user');
    results.push({
      id: conv.id,
      preview: firstUserMsg?.content?.slice(0, 100) || 'New conversation',
      updatedAt: conv.updatedAt,
      createdAt: conv.createdAt,
    });
  }
  return results
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

async function listConversationsFirestore(
  userId: string,
  orgId: string,
  limit: number
): Promise<Array<{ id: string; preview: string; updatedAt: number; createdAt: number }>> {
  const db = admin.firestore();
  const snapshot = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('organizationId', '==', orgId)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const firstUserMsg = (data.messages || []).find((m: any) => m.role === 'user');
    return {
      id: doc.id,
      preview: firstUserMsg?.content?.slice(0, 100) || 'New conversation',
      updatedAt: data.updatedAt || 0,
      createdAt: data.createdAt || 0,
    };
  });
}

// ─── In-Memory Implementation ──────────────────────────────────────────────

function getConversationMemory(
  conversationId: string | undefined,
  userId: string,
  orgId: string
): MCPConversation {
  if (conversationId && memoryStore.has(conversationId)) {
    const conv = memoryStore.get(conversationId)!;
    if (conv.userId !== userId) {
      throw new Error('Access denied: conversation belongs to another user');
    }
    return conv;
  }

  const newId = conversationId || `conv-${uuidv4()}`;
  const now = Date.now();
  const conversation: MCPConversation = {
    id: newId,
    userId,
    organizationId: orgId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.set(newId, conversation);
  return conversation;
}

function appendMessagesMemory(
  conversationId: string,
  newMessages: MCPMessage[]
): void {
  const conv = memoryStore.get(conversationId);
  if (!conv) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  conv.messages = [...conv.messages, ...newMessages];
  if (conv.messages.length > MAX_MESSAGES) {
    conv.messages = conv.messages.slice(conv.messages.length - MAX_MESSAGES);
  }
  conv.updatedAt = Date.now();
}

// ─── Firestore Implementation ──────────────────────────────────────────────

async function getConversationFirestore(
  conversationId: string | undefined,
  userId: string,
  orgId: string
): Promise<MCPConversation> {
  const db = admin.firestore();

  if (conversationId) {
    const doc = await db.collection(COLLECTION).doc(conversationId).get();

    if (doc.exists) {
      const data = doc.data() as MCPConversation;
      if (data.userId !== userId) {
        throw new Error('Access denied: conversation belongs to another user');
      }
      return data;
    }
  }

  const newId = conversationId || `conv-${uuidv4()}`;
  const now = Date.now();
  const conversation: MCPConversation = {
    id: newId,
    userId,
    organizationId: orgId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTION).doc(newId).set(conversation);
  return conversation;
}

async function appendMessagesFirestore(
  conversationId: string,
  newMessages: MCPMessage[]
): Promise<void> {
  const db = admin.firestore();
  const docRef = db.collection(COLLECTION).doc(conversationId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const data = doc.data() as MCPConversation;
  const allMessages = [...data.messages, ...newMessages];
  const trimmed =
    allMessages.length > MAX_MESSAGES
      ? allMessages.slice(allMessages.length - MAX_MESSAGES)
      : allMessages;

  await docRef.update({
    messages: trimmed,
    updatedAt: Date.now(),
  });
}
