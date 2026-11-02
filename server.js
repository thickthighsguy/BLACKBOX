import { createServer } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8000);
const SESSION_TTL = 8 * 60 * 60 * 1000;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const passwordSalt = Buffer.from('e58f62f9ae81f3ce73dfa11985b18200', 'hex');
const passwordHash = Buffer.from('3c7dc4ddf92fc2b625a418675c57112ac3abd2e3b3755cd203d9bd8157096237e311131ab2f00af022a849b55943afd698d8a0231030cbe0c10839b6e947fed2', 'hex');
const sessions = new Map();
const loginAttempts = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function securityHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'self' blob:; base-uri 'self'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

function respond(response, status, body = '', contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': contentType,
    ...extraHeaders
  });
  response.end(body);
}

function getSessionToken(request) {
  const cookie = request.headers.cookie || '';
  const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('echo_session='));
  return match ? match.slice('echo_session='.length) : '';
}

function hasSession(request) {
  const token = getSessionToken(request);
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

async function readJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2048) throw new Error('Request body too large');
  }
  return JSON.parse(body || '{}');
}

async function serveFile(request, response, filePath) {
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    respond(response, 404, 'Not found');
  }
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
  } catch {
    respond(response, 400, 'Bad request');
    return;
  }

  if (pathname === '/auth/login') {
    if (request.method !== 'POST') {
      respond(response, 405, 'Method not allowed');
      return;
    }

    const client = request.socket.remoteAddress || 'local';
    const attempt = loginAttempts.get(client);
    if (attempt && attempt.until > Date.now() && attempt.count >= MAX_ATTEMPTS) {
      respond(response, 429, JSON.stringify({ error: 'Too many attempts. Try again later.' }), 'application/json; charset=utf-8');
      return;
    }

    try {
      const payload = await readJsonBody(request);
      if (typeof payload.password !== 'string' || payload.password.length > 1024) throw new Error('Invalid request');
      const candidate = scryptSync(payload.password, passwordSalt, passwordHash.length, {
        N: 32768,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024
      });
      if (!timingSafeEqual(passwordHash, candidate)) {
        const nextAttempt = attempt && attempt.until > Date.now()
          ? { count: attempt.count + 1, until: attempt.until }
          : { count: 1, until: Date.now() + ATTEMPT_WINDOW };
        loginAttempts.set(client, nextAttempt);
        respond(response, 401, JSON.stringify({ error: 'Incorrect password.' }), 'application/json; charset=utf-8');
        return;
      }

      loginAttempts.delete(client);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_TTL);
      respond(response, 200, JSON.stringify({ authenticated: true }), 'application/json; charset=utf-8', {
        'Set-Cookie': `echo_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`
      });
    } catch {
      respond(response, 400, JSON.stringify({ error: 'Invalid login request.' }), 'application/json; charset=utf-8');
    }
    return;
  }

  if (pathname === '/auth/logout') {
    if (request.method !== 'POST') {
      respond(response, 405, 'Method not allowed');
      return;
    }
    sessions.delete(getSessionToken(request));
    respond(response, 204, '', 'text/plain; charset=utf-8', {
      'Set-Cookie': 'echo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    respond(response, 405, 'Method not allowed');
    return;
  }

  if (pathname === '/login.css' || pathname === '/login.js') {
    const filePath = pathname === '/login.css' ? resolve(ROOT, 'css/login.css') : resolve(ROOT, 'js/login.js');
    await serveFile(request, response, filePath);
    return;
  }

  if (!hasSession(request)) {
    if (pathname === '/' || pathname === '/index.html') {
      await serveFile(request, response, resolve(ROOT, 'login.html'));
    } else {
      respond(response, 401, 'Authentication required');
    }
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relativePath.split('/').some((part) => part.startsWith('.')) || ['server.js', 'package.json', 'package-lock.json'].includes(relativePath)) {
    respond(response, 404, 'Not found');
    return;
  }
  const filePath = resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${sep}`)) {
    respond(response, 403, 'Forbidden');
    return;
  }
  await serveFile(request, response, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`E.C.H.O. available at http://${HOST}:${PORT}`);
});
