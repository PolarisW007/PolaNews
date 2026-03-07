import { NextRequest, NextResponse } from 'next/server';
import { readAudioFile } from '@/lib/services/tts';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!filename || !/^[\w-]+\.mp3$/.test(filename)) {
      return NextResponse.json({ success: false, error: '无效的文件名' }, { status: 400 });
    }

    const buffer = await readAudioFile(filename);
    if (!buffer) {
      return NextResponse.json({ success: false, error: '音频文件不存在' }, { status: 404 });
    }

    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '读取音频失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
