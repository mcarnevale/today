// ── GRANOLA MCP CLIENT ──
// Calls list_meetings and get_meetings via Streamable HTTP transport.
// MCP endpoint: https://mcp.granola.ai/mcp

const MCP_URL = 'https://mcp.granola.ai/mcp';
const MCP_VERSION = '2025-03-26';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

let nextId = 1;
function nextRequestId(): number {
  return nextId++;
}

async function ensureSession(accessToken: string): Promise<string | undefined> {
  const initRes = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_VERSION,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_VERSION,
        capabilities: {},
        clientInfo: { name: 'today', version: '1.0.0' },
      },
    }),
  });
  if (!initRes.ok) return undefined;
  const sessionId = initRes.headers.get('mcp-session-id') ?? undefined;
  // Send initialized notification (fire-and-forget)
  await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_VERSION,
      Authorization: `Bearer ${accessToken}`,
      ...(sessionId && { 'Mcp-Session-Id': sessionId }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  return sessionId;
}

async function mcpPost(
  accessToken: string,
  body: JsonRpcRequest,
  sessionId?: string
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': MCP_VERSION,
    Authorization: `Bearer ${accessToken}`,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Granola MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  let data: JsonRpcResponse;

  if (contentType.includes('text/event-stream')) {
    const text = await res.text();
    data = parseSseResponse(text);
  } else {
    data = (await res.json()) as JsonRpcResponse;
  }

  if (data.error) {
    throw new Error(`Granola MCP: ${data.error.message}`);
  }
  return data;
}

function parseSseResponse(text: string): JsonRpcResponse {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('data: ')) {
      const json = lines[i].slice(6).trim();
      if (json && json !== '[DONE]') {
        try {
          return JSON.parse(json) as JsonRpcResponse;
        } catch {
          // try next data line
        }
      }
    }
  }
  throw new Error('Granola MCP: No JSON in SSE response');
}

export interface GranolaMeeting {
  id: string;
  title?: string;
  summary?: string;
  start_time?: string;
  end_time?: string;
  attendees?: string[];
  [key: string]: unknown;
}

export async function listMeetings(
  accessToken: string,
  startDate?: string,
  endDate?: string,
  limit = 50
): Promise<GranolaMeeting[]> {
  const params: Record<string, unknown> = { per_page: limit };
  if (startDate) {
    params.start_date = startDate;
    params.created_after = `${startDate}T00:00:00Z`;
  }
  if (endDate) {
    params.end_date = endDate;
    params.created_before = `${endDate}T23:59:59Z`;
  }
  return mcpCall<GranolaMeeting[]>(accessToken, 'list_meetings', params);
}

export async function getMeetings(
  accessToken: string,
  meetingIds: string[]
): Promise<GranolaMeeting[]> {
  if (meetingIds.length === 0) return [];
  return mcpCall<GranolaMeeting[]>(accessToken, 'get_meetings', {
    meeting_ids: meetingIds,
  });
}

async function mcpCall<T>(
  accessToken: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const sessionId = await ensureSession(accessToken);
  const res = await mcpPost(accessToken, {
    jsonrpc: '2.0',
    id: nextRequestId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  }, sessionId);

  const result = res.result as {
    content?: Array<{ type: string; text?: string; resource?: { uri: string } }>;
  };
  const blocks = result?.content ?? [];
  if (blocks.length === 0) return [] as unknown as T;

  let raw: string | undefined;
  for (const block of blocks) {
    if (block.type === 'resource' && block.resource?.uri) {
      raw = await fetchResource(accessToken, sessionId, block.resource.uri);
      if (raw) break;
    }
    if (block.type === 'text' && block.text?.trim()) {
      const text = block.text.trim();
      if (text.startsWith('[') || text.startsWith('{')) {
        raw = text;
        break;
      }
      // Might be a resource URI in text — try fetching
      if (text.startsWith('<') || text.includes('://')) {
        raw = await fetchResource(accessToken, sessionId, text);
        if (raw) break;
      }
    }
  }

  if (!raw || (!raw.startsWith('[') && !raw.startsWith('{'))) {
    return [] as unknown as T;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as T;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.meetings)) return obj.meetings as T;
      if (Array.isArray(obj.data)) return obj.data as T;
      if (Array.isArray(obj.items)) return obj.items as T;
      if (Array.isArray(obj.results)) return obj.results as T;
    }
    return [] as unknown as T;
  } catch {
    return [] as unknown as T;
  }
}

async function fetchResource(
  accessToken: string,
  sessionId: string | undefined,
  uri: string
): Promise<string | undefined> {
  try {
    const res = await mcpPost(accessToken, {
      jsonrpc: '2.0',
      id: nextRequestId(),
      method: 'resources/read',
      params: { uri },
    }, sessionId);
    const result = res.result as { contents?: Array<{ text?: string }> };
    const text = result?.contents?.[0]?.text;
    return text ?? undefined;
  } catch {
    return undefined;
  }
}
