import { json } from '@sveltejs/kit';

// Simple in-memory debug log
let debugLogs = [];

export function POST({ request }) {
  const log = request.body;
  debugLogs.push({
    timestamp: new Date(),
    log
  });
  
  return json({ success: true });
}

export function GET() {
  return json({ logs: debugLogs });
} 