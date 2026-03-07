import { NextRequest, NextResponse } from 'next/server';
import { MCP_TOOLS, MCP_RESOURCES, handleToolCall, handleResourceRead } from '@/lib/mcp/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, params } = body as { method: string; params?: Record<string, unknown> };

    switch (method) {
      case 'tools/list': {
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { tools: MCP_TOOLS },
        });
      }

      case 'tools/call': {
        const name = params?.name as string;
        const args = (params?.arguments || {}) as Record<string, unknown>;
        const result = await handleToolCall(name, args);
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        });
      }

      case 'resources/list': {
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { resources: MCP_RESOURCES },
        });
      }

      case 'resources/read': {
        const uri = params?.uri as string;
        const result = await handleResourceRead(uri);
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { contents: [{ uri, text: JSON.stringify(result, null, 2) }] },
        });
      }

      default:
        return NextResponse.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
        }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32603, message },
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: 'WorldOverview MCP Server',
      version: '1.0.0',
      tools: MCP_TOOLS.map(t => t.name),
      resources: MCP_RESOURCES.map(r => r.uri),
    },
  });
}
