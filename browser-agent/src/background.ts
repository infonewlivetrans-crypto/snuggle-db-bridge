// Radius Track Browser Agent — background service worker (skeleton).
// НЕ использует API ATI. Работает через видимые страницы пользователя.
// Следующий этап: heartbeat + polling команд из /api/public/agent/ai-dispatcher/*.
type AgentCommand = { id: string; command_type: string; command_payload_json?: unknown };

async function heartbeat(): Promise<void> {
  // TODO: POST /api/public/agent/ai-dispatcher/heartbeat  (endpoint пока 501 на dev)
}
async function pollCommands(): Promise<AgentCommand[]> {
  // TODO: GET /api/public/agent/ai-dispatcher/commands/poll
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function tick(): Promise<void> {
  await heartbeat();
  const cmds = await pollCommands();
  for (const c of cmds) {
    // TODO: диспатч команды в content script выбранной вкладки
    console.log("[radius-track-agent] cmd", c.command_type);
  }
}

// setInterval(tick, 30_000);
console.log("[radius-track-agent] skeleton background loaded");
