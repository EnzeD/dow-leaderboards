import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const getClientIpHash = (req: NextRequest): string => {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');

  const ip = cfConnectingIp || forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
  return createHash('sha256').update(ip).digest('hex');
};

export async function GET(req: NextRequest) {
  const ipHash = getClientIpHash(req);

  return NextResponse.json({
    ipHash,
    headers: {
      'x-forwarded-for': req.headers.get('x-forwarded-for'),
      'x-real-ip': req.headers.get('x-real-ip'),
      'cf-connecting-ip': req.headers.get('cf-connecting-ip'),
    }
  });
}