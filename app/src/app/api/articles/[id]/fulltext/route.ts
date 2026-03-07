import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreFullContent } from '@/lib/services/readability';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const article = await fetchAndStoreFullContent(id);

    return NextResponse.json({
      success: true,
      data: article,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
