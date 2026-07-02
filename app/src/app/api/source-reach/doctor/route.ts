import { NextRequest, NextResponse } from 'next/server';
import { getSourceReachDoctor } from '@/lib/source-reach/doctor';

export async function GET(req: NextRequest) {
  try {
    const liveValue = req.nextUrl.searchParams.get('live');
    const live = liveValue === '1' || liveValue === 'true';
    const report = await getSourceReachDoctor({ live });
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
