import type { WebSocket } from 'ws';
import type { EventSendPayload } from '@agent-nexus/protocol';
import { send } from '../ws/send.js';
import { getConnectionByAgentId } from '../ws/state.js';
import { enqueueAudit } from './audit.js';
import { isRateLimited } from './rate-limit.js';
import * as dao from '../db/dao.js';

const MAX_CONTENT_BYTES = 64 * 1024; // 64KB
const MAX_URL_BYTES = 2 * 1024; // 2KB

export async function onEventSend(
  sourceAgentId: string,
  sourceWs: WebSocket,
  payload: EventSendPayload,
): void {
  const { eventId, correlationId, threadId, eventType, targetAgentId, content, url } = payload;

  // 1. Validate payload size
  if (content && Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
    sendAck(sourceWs, eventId, 'rejected', 'content_too_large');
    audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'rejected', 'content_too_large');
    return;
  }
  if (url && Buffer.byteLength(url, 'utf-8') > MAX_URL_BYTES) {
    sendAck(sourceWs, eventId, 'rejected', 'url_too_large');
    audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'rejected', 'url_too_large');
    return;
  }

  // 2. Rate limit
  if (isRateLimited(sourceAgentId)) {
    sendAck(sourceWs, eventId, 'rejected', 'rate_limited');
    audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'rejected', 'rate_limited');
    return;
  }

  // 3. Resolve target
  const targetConn = getConnectionByAgentId(targetAgentId);
  if (!targetConn) {
    // Distinguish unknown agent from offline agent
    const targetAgent = await dao.getAgentById(targetAgentId);
    const reason = targetAgent ? 'target_offline' : 'unknown_target';
    sendAck(sourceWs, eventId, 'rejected', reason);
    audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'rejected', reason);
    return;
  }
  if (targetConn.state !== 'active') {
    sendAck(sourceWs, eventId, 'rejected', 'target_offline');
    audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'rejected', 'target_offline');
    return;
  }

  // 4. Deliver to target
  send(targetConn.ws, {
    type: 'event.deliver',
    payload: {
      eventId,
      correlationId,
      threadId,
      eventType,
      sourceAgentId,
      content,
      url,
      payload: payload.payload,
    },
    ts: '',
  });

  // 5. Ack to source
  sendAck(sourceWs, eventId, 'delivered');

  // 6. Audit
  audit(eventId, correlationId, threadId, eventType, sourceAgentId, targetAgentId, payload.payload, 'delivered');
}

function sendAck(
  ws: WebSocket,
  eventId: string,
  status: 'delivered' | 'rejected',
  reason?: string,
): void {
  send(ws, {
    type: 'event.ack',
    payload: { eventId, status, reason },
    ts: '',
  });
}

function audit(
  eventId: string,
  correlationId: string | undefined,
  threadId: string | undefined,
  eventType: string,
  sourceAgentId: string,
  targetAgentId: string,
  payload: Record<string, unknown>,
  state: 'received' | 'delivered' | 'rejected',
  errorMessage?: string,
): void {
  enqueueAudit({
    eventId,
    correlationId,
    threadId,
    eventType,
    sourceAgentId,
    targetAgentId,
    payload,
    state,
    errorMessage,
  });
}
