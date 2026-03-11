/**
 * Conversation History - Firestore persistence
 *
 * Stores and retrieves AI conversation history per user.
 * Collection: ai_conversations
 *
 * Users can only access their own conversations (enforced by query).
 */

import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import { MCPConversation, MCPMessage, MCPToolCallRecord } from './mcp-types';

function getFirestore(): admin.firestore.Firestore {
  return admin.firestore();
}

const COLLECTION = 'ai_conversations';
const MAX_MESSAGES = 50; // Keep last 50 messages per conversation

/**
 * Get or create a conversation.
 */
export async function getConversation(
  conversationId: string | undefined,
  userId: string,
  orgId: string
): Promise<MCPConversation> {
  const db = getFirestore();

  if (conversationId) {
    const doc = await db.collection(COLLECTION).doc(conversationId).get();

    if (doc.exists) {
      const data = doc.data() as MCPConversation;

      // Verify ownership
      if (data.userId !== userId) {
        throw new Error('Access denied: conversation belongs to another user');
      }

      return data;
    }
  }

  // Create new conversation
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

/**
 * Append messages to a conversation and persist.
 */
export async function appendMessages(
  conversationId: string,
  newMessages: MCPMessage[]
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTION).doc(conversationId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const data = doc.data() as MCPConversation;
  const allMessages = [...data.messages, ...newMessages];

  // Trim to max messages (keep most recent)
  const trimmed =
    allMessages.length > MAX_MESSAGES
      ? allMessages.slice(allMessages.length - MAX_MESSAGES)
      : allMessages;

  await docRef.update({
    messages: trimmed,
    updatedAt: Date.now(),
  });
}

/**
 * Convert stored messages to Gemini content format.
 */
export function toGeminiHistory(
  messages: MCPMessage[]
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
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
