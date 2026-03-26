import { createServer } from 'node:http';

process.on('uncaughtException', err => console.error('Uncaught exception:', err.message, err.stack));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
import { readFile, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './lib/db.js';
import { handleAuth } from './routes/auth.js';
import { handleClasses } from './routes/classes.js';
import { handleBookings } from './routes/bookings.js';
import { handleMembers } from './routes/members.js';
import { handleDashboard } from './routes/dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function serveStatic(res, filePath) {
  readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', MIME[extname(filePath)] || 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  });
}

const server = createServer(async (req, res) => {
  setCors(res);
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Parse body for mutating requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    req.body = await parseBody(req);
  }

  // API routing
  if (path.startsWith('/api/')) {
    try {
      const handled =
        handleAuth(req, res, path) ||
        handleClasses(req, res, path) ||
        handleBookings(req, res, path) ||
        handleMembers(req, res, path) ||
        handleDashboard(req, res, path);
      if (!handled) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Route not found' })); }
    } catch (err) {
      console.error('API Error:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error', detail: err.message }));
    }
    return;
  }

  // Static file serving
  res.setHeader('Content-Type', 'text/html');
  const publicDir = join(__dirname, 'public');

  if (path === '/' || path === '/login' || path.startsWith('/owner')) {
    return serveStatic(res, join(publicDir, 'index.html'));
  }
  if (path.startsWith('/book') || path.startsWith('/portal') || path.startsWith('/member')) {
    return serveStatic(res, join(publicDir, 'portal.html'));
  }

  const filePath = join(publicDir, path);
  if (existsSync(filePath) && !filePath.includes('..')) {
    return serveStatic(res, filePath);
  }

  serveStatic(res, join(publicDir, 'index.html'));
});

initDb();
server.listen(PORT, () => {
  console.log(`\n🏋️  FitBook is running at http://localhost:${PORT}`);
  console.log(`📋  Owner portal:  http://localhost:${PORT}/`);
  console.log(`🧘  Member portal: http://localhost:${PORT}/book/[your-studio-slug]\n`);
});
