import { NextRequest, NextResponse } from 'next/server';
import { buildPolauuhAuthUrls } from '@/lib/aipd-sso';

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get('next');
  return NextResponse.json({
    success: true,
    data: buildPolauuhAuthUrls(next),
  });
}
