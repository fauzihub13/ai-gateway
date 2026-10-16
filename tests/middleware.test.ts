import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { describe, it, expect } from 'vitest';

describe('middleware config', () => {
  it('exports matcher', async () => {
    const mod = await import('../middleware');
    expect(mod.config.matcher).toContain('/dashboard/:path*');
    expect(typeof mod.middleware).toBe('function');
  });
});

describe('middleware redirect', () => {
  it('redirect ke login bila tanpa token', async () => {
    const req = new NextRequest('http://localhost/dashboard');
    const res = await middleware(req);
    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toContain('/login');
  });
});