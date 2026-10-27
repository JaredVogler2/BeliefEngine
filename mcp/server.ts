/**
 * Belief Engine as a local MCP server (stdio). An AI client (Claude Code, Claude Desktop, any MCP client) plays real runs through tools;
 * the browser stays the flagship experience and both use the same engine.
 *
 *   npm run mcp                         # stdio server, runs saved under ~/.belief-engine/mcp
 *   BELIEF_ENGINE_HOME=/tmp/be npm run mcp
 *   BELIEF_ENGINE_HOME=:memory: npm run mcp     # nothing written to disk
 *   BELIEF_ENGINE_DEBUG_TOOLS=1 npm run mcp     # adds debug_dump_state (local testing only; shows hidden convictions)
 *
 * No network, no API key, no LLM: the server only validates tool calls and runs the deterministic engine. MCP *transport* (how a client
 * talks to this process) is separate from LLM *inference* (which model the client uses): this file never calls a model.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GameService, SERVER_VERSION, actionSchema, runIdSchema, type ToolResult } from './service.ts';
import { RULES_TEXT, TOOLS_GUIDE, promptAlternateStrategy, promptExplainLoss, promptPlayCautiously } from './guide.ts';
import { RULES_VERSION } from '../src/engine/index.ts';
import { getScenarioDef, listScenarios } from '../src/engine/index.ts';

const MAX_TEXT = 100_000;

/** Turn a service result into an MCP tool result: a readable line, the machine-readable JSON, and `isError` for failures. */
export function toCallResult(res: ToolResult): CallToolResult {
  if (res.ok) {
    let json = JSON.stringify(res.data);
    if (json.length > MAX_TEXT) json = JSON.stringify({ truncated: true, note: 'Response too large; ask for a narrower view.', keys: Object.keys(res.data) });
    return { content: [{ type: 'text', text: res.text }, { type: 'text', text: json }], structuredContent: res.data };
  }
  const e = res.error;
  const alt = e.alternatives?.length ? ` Try: ${e.alternatives.join('; ')}.` : '';
  return { isError: true, content: [{ type: 'text', text: `${e.code}: ${e.message}${alt}` }], structuredContent: { error: e } };
}

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

export function buildServer(service: GameService): McpServer {
  const server = new McpServer({ name: 'belief-engine', version: SERVER_VERSION }, {
    instructions: 'Belief Engine: play a village strategy game by changing what its people believe. Start with list_scenarios and create_game; read the belief-engine://rules resource once. Mutating calls return a revision; pass expectedRevision and idempotencyKey. Hidden information stays hidden: you see what a browser player sees.',
  });
  const run = (fn: () => ToolResult): CallToolResult => {
    try {
      return toCallResult(fn());
    } catch (e) {
      return toCallResult({ ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : 'Unexpected error.' } });
    }
  };

  server.registerTool('list_scenarios', { title: 'List scenarios', description: 'Story chapters with missions and objectives, the rules version, and how to start generated villages.', inputSchema: {}, annotations: RO }, async () => run(() => service.listScenarios()));

  server.registerTool('create_game', {
    title: 'Create a game',
    description: 'Start a new run. Story chapters: scenarioId redbank | harvest | ashwood. Generated village: mode "expedition" with a seed. Returns runId, briefing, state and legal next actions. controller "coach" starts a read-only run.',
    inputSchema: {
      scenarioId: z.string().max(80).optional(),
      seed: z.number().int().min(-2147483648).max(2147483647).optional(),
      difficulty: z.enum(['story', 'normal', 'hard']).optional(),
      mode: z.enum(['story', 'expedition']).optional(),
      controller: z.enum(['delegate', 'coach']).optional(),
    },
    annotations: WRITE,
  }, async (a) => run(() => service.createGame(a)));

  server.registerTool('get_game_state', {
    title: 'Game state', description: 'Day, phase, Influence, objectives, tonight\'s danger, resources, laws with public support, recent important events and next steps. detail "full" adds the forecast and the claim hand.',
    inputSchema: { runId: runIdSchema, detail: z.enum(['brief', 'full']).optional() }, annotations: RO,
  }, async (a) => run(() => service.getGameState(a)));

  server.registerTool('inspect_map', {
    title: 'Inspect the map', description: 'ASCII map with coordinates, landmarks (hp, lit, watchers), villagers, who the Keeper cannot reach, and tonight\'s predicted flood depth. Optional region id narrows it.',
    inputSchema: { runId: runIdSchema, region: z.string().max(40).optional() }, annotations: RO,
  }, async (a) => run(() => service.inspectMap(a)));

  server.registerTool('inspect_villager', {
    title: 'Inspect a villager', description: 'Trust ties, traits, needs, location and duty, what changes their mind, beliefs (exact only if scouted or just spoken to), reason codes, and feasible actions.',
    inputSchema: { runId: runIdSchema, villagerId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.inspectVillager(a)));

  server.registerTool('inspect_claim', {
    title: 'Inspect a claim', description: 'What a story does (effect, trigger, radius, intensity, side effects, contradictions), the support it has per region against the thresholds a law needs, and the most influential villagers.',
    inputSchema: { runId: runIdSchema, claimId: z.string().max(80) }, annotations: RO,
  }, async (a) => run(() => service.inspectClaim(a)));

  server.registerTool('list_actions', {
    title: 'List legal actions', description: 'Legal action templates with costs for the current planning phase, optionally only those involving a villager or landmark. includeDisabled adds illegal ones with the reason.',
    inputSchema: { runId: runIdSchema, targetId: z.string().max(80).optional(), includeDisabled: z.boolean().optional(), limit: z.number().int().min(1).max(120).optional() }, annotations: RO,
  }, async (a) => run(() => service.listActions(a)));

  server.registerTool('compare_possible_actions', {
    title: 'Compare actions', description: 'Exact dry-run previews (the same ones the browser shows) of up to 12 given actions, or the top candidates; best conviction per Influence first. Changes nothing.',
    inputSchema: { runId: runIdSchema, actions: z.array(actionSchema).max(12).optional(), top: z.number().int().min(1).max(20).optional() }, annotations: RO,
  }, async (a) => run(() => service.compareActions(a)));

  server.registerTool('take_action', {
    title: 'Take an action', description: 'Perform one validated action. Costs Influence exactly as in the browser. Invalid, stale, duplicate or unaffordable calls change nothing and return a structured error with alternatives.',
    inputSchema: { runId: runIdSchema, action: actionSchema, expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.takeAction(a)));

  server.registerTool('end_day', {
    title: 'End the day', description: 'Resolve one night: stories travel, laws wake or fade, the world is tested, dawn comes. Never simulates more than one day. Choose an opening story first.',
    inputSchema: { runId: runIdSchema, expectedRevision: z.number().int().min(0).optional(), idempotencyKey: z.string().min(1).max(80).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.endDay(a)));

  server.registerTool('get_history', {
    title: 'Event history', description: 'Causal event log with reason codes and cause ids, paginated by afterEventId; filter by day and importance.',
    inputSchema: { runId: runIdSchema, fromDay: z.number().int().min(1).optional(), afterEventId: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(100).optional(), minImportance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() }, annotations: RO,
  }, async (a) => run(() => service.getHistory(a)));

  server.registerTool('get_results', {
    title: 'Results and debrief', description: 'Available only after the run ends: verdict, story, score breakdown, causal chains, what was missed, and the hashes that verify the run against the browser engine.',
    inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.getResults(a)));

  server.registerTool('retry_or_new_game', {
    title: 'Retry or new game', description: 'Start a fresh, independent run of the same scenario (same seed if reuseSeed, otherwise a new one). No state carries over.',
    inputSchema: { runId: runIdSchema, reuseSeed: z.boolean().optional(), controller: z.enum(['delegate', 'coach']).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.retryOrNew(a)));

  server.registerTool('export_replay', {
    title: 'Export replay', description: 'The exact accepted action log plus the final state and event hashes; replaying it in the browser engine gives the identical run.',
    inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.exportReplay(a)));

  server.registerTool('export_game', {
    title: 'Export a browser save', description: 'This run as a Belief Engine save file the browser can load.', inputSchema: { runId: runIdSchema }, annotations: RO,
  }, async (a) => run(() => service.exportGame(a)));

  server.registerTool('import_game', {
    title: 'Import a browser save', description: 'Load a save exported from the browser (validated exactly as the browser validates it). Defaults to read-only coach mode so a human who is also playing is never surprised.',
    inputSchema: { saveJson: z.string().max(2_000_000), controller: z.enum(['delegate', 'coach']).optional() }, annotations: WRITE,
  }, async (a) => run(() => service.importGame(a)));

  server.registerTool('grant_control', {
    title: 'Grant control to the agent', description: 'Switch a coach-mode run to delegate so the agent may take actions. Only call this when the human has said so.',
    inputSchema: { runId: runIdSchema }, annotations: WRITE,
  }, async (a) => run(() => service.grantControl(a)));

  server.registerTool('get_tutorial', { title: 'Tutorial', description: 'Rules, what is hidden, how to play well, and tool usage examples in one text.', inputSchema: {}, annotations: RO },
    async () => ({ content: [{ type: 'text', text: `${RULES_TEXT}\n${TOOLS_GUIDE}` }], structuredContent: { rulesVersion: RULES_VERSION, serverVersion: SERVER_VERSION } }));

  // Phase 17 plugs the natural-language composer in here; until then the capability is honestly reported as not enabled.
  server.registerTool('submit_belief', {
    title: 'Submit a belief (natural language)', description: 'Propose a story in your own words. The same offline composer as the browser interprets it into bounded mechanics and returns interpretations and a confirmation token; confirm_belief then pays and adds it.',
    inputSchema: { runId: runIdSchema, text: z.string().min(1).max(280), targetRegion: z.string().max(40).optional() }, annotations: WRITE,
  }, async () => toCallResult({ ok: false, error: { code: 'CAPABILITY_NOT_ENABLED', message: 'The natural-language belief composer is not enabled in this build.', alternatives: ['inspect_claim on a canonical claim', 'take_action with a canonical claim id'] } }));

  if (service.debugTools) {
    server.registerTool('debug_dump_state', {
      title: 'DEBUG: full state', description: 'LOCAL TESTING ONLY. The whole run state including every private conviction. Never enable on a shared server.',
      inputSchema: { runId: runIdSchema }, annotations: RO,
    }, async (a) => run(() => service.debugDump(a)));
  }

  // resources: what an agent should read once
  server.registerResource('rules', 'belief-engine://rules', { title: 'Rules for agents', description: 'What the game is, what you can do, what is hidden, how to play well.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: RULES_TEXT }] }));
  server.registerResource('tool-guide', 'belief-engine://tool-guide', { title: 'Tool cheat sheet', description: 'Example calls for every tool.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: TOOLS_GUIDE }] }));
  for (const l of listScenarios()) {
    server.registerResource(`scenario-${l.id}`, `belief-engine://scenario/${l.id}`, { title: `${l.name}: mission and objective`, description: l.tagline, mimeType: 'text/markdown' }, async (uri) => {
      const def = getScenarioDef(l.id).runtime;
      const text = [`# ${def.name}`, '', def.tagline, '', ...def.briefing, '', '## Objectives', ...def.objectives.filter((o) => !o.instantLoss).map((o) => `- ${o.label}${o.heroic ? ' (heroic)' : ''}`), '', '## Opening stories', ...def.starters.map((c) => `- ${c}: ${def.claimDefs.find((d) => d.id === c)?.text}`), '', '## Hints', ...def.hints.map((h) => `- ${h}`)].join('\n');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    });
  }

  // prompts (instructions only: the tools enforce the rules)
  server.registerPrompt('play_cautiously', { title: 'Play cautiously', description: 'Play a game turn by turn with previews and explanations.', argsSchema: { scenario: z.string().max(40).optional() } },
    ({ scenario }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptPlayCautiously(scenario ?? 'Flood at Redbank') } }] }));
  server.registerPrompt('find_alternate_strategy', { title: 'Find an alternate winning strategy', description: 'Win with a different plan from the obvious one.', argsSchema: { scenario: z.string().max(40).optional(), avoid: z.string().max(120).optional() } },
    ({ scenario, avoid }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptAlternateStrategy(scenario ?? 'Flood at Redbank', avoid ?? '') } }] }));
  server.registerPrompt('explain_loss', { title: 'Explain why I lost', description: 'Read the history and explain a defeat with causes.', argsSchema: { runId: z.string().max(60).optional() } },
    ({ runId }) => ({ messages: [{ role: 'user', content: { type: 'text', text: promptExplainLoss(runId ?? '') } }] }));
  return server;
}

export function defaultHome(): string | null {
  const env = process.env.BELIEF_ENGINE_HOME;
  if (env === ':memory:') return null;
  return env && env.length ? env : join(homedir(), '.belief-engine', 'mcp');
}

async function main(): Promise<void> {
  const service = new GameService({ home: defaultHome(), maxRuns: Number(process.env.BELIEF_ENGINE_MAX_RUNS ?? 50), debugTools: process.env.BELIEF_ENGINE_DEBUG_TOOLS === '1' });
  const server = buildServer(service);
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol: all diagnostics go to stderr
  process.stderr.write(`belief-engine MCP server ${SERVER_VERSION} (rules ${RULES_VERSION}) on stdio; runs: ${defaultHome() ?? 'memory only'}${service.debugTools ? '; DEBUG TOOLS ON' : ''}\n`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mcp/server.ts')) {
  main().catch((e) => {
    process.stderr.write(`fatal: ${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(1);
  });
}
