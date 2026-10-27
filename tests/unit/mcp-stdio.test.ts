import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, describe, expect, it } from 'vitest';
import { replayRun, stateHash, eventHash } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';

/**
 * The real thing: the actual server process, spoken to by the official MCP SDK client over stdio, plus a raw JSON-RPC probe for protocol
 * behaviour the SDK client would hide. No mocks of the engine or of the transport.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVER = join(ROOT, 'mcp', 'server.ts');
const traces = JSON.parse(readFileSync(new URL('../fixtures/redbank-traces.json', import.meta.url), 'utf8')) as { canonicalSeed: number; witnessBridge: { actions: Action[]; stateHash: string }; noop: { actions: Action[] } };

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function home(): string {
  const d = mkdtempSync(join(tmpdir(), 'be-mcp-stdio-'));
  dirs.push(d);
  return d;
}

async function connect(env: Record<string, string> = {}): Promise<{ client: Client; close: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', SERVER],
    cwd: ROOT,
    env: { ...(process.env as Record<string, string>), BELIEF_ENGINE_HOME: ':memory:', ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'belief-engine-test-client', version: '1.0.0' });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

type Structured = Record<string, unknown>;
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; data: Structured; text: string }> {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: Structured; content: { type: string; text?: string }[] };
  return { isError: !!res.isError, data: res.structuredContent ?? {}, text: res.content.map((c) => c.text ?? '').join('\n') };
}

const REQUIRED = ['list_scenarios', 'create_game', 'get_game_state', 'inspect_map', 'inspect_villager', 'inspect_claim', 'list_actions', 'take_action', 'end_day', 'get_history', 'get_results', 'retry_or_new_game', 'submit_belief'];

describe('MCP over stdio with the official SDK client', () => {
  it('negotiates a protocol version, advertises tools, resources and prompts, and exposes every required tool with a schema and a description', async () => {
    const { client, close } = await connect();
    try {
      expect(client.getServerVersion()?.name).toBe('belief-engine');
      const caps = client.getServerCapabilities();
      expect(caps?.tools).toBeTruthy();
      expect(caps?.resources).toBeTruthy();
      expect(caps?.prompts).toBeTruthy();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      for (const n of REQUIRED) expect(names, `tool ${n}`).toContain(n);
      for (const extra of ['compare_possible_actions', 'export_replay', 'import_game', 'export_game', 'grant_control', 'get_tutorial']) expect(names).toContain(extra);
      expect(names, 'debug tools are off by default').not.toContain('debug_dump_state');
      for (const t of tools) {
        expect(t.description && t.description.length, `${t.name} has a description`).toBeGreaterThan(20);
        expect(t.inputSchema.type).toBe('object');
      }
      const take = tools.find((t) => t.name === 'take_action')!;
      expect(JSON.stringify(take.inputSchema)).toMatch(/PICK_STARTER|SEED/);
      expect(take.annotations?.readOnlyHint).toBe(false);
      expect(tools.find((t) => t.name === 'get_game_state')!.annotations?.readOnlyHint).toBe(true);
    } finally {
      await close();
    }
  }, 60_000);

  it('plays a whole story chapter to victory through tool calls, and the run matches the browser engine\'s state and event hashes', async () => {
    const { client, close } = await connect();
    try {
      const scen = await call(client, 'list_scenarios');
      expect((scen.data.scenarios as unknown[]).length).toBe(3);
      const created = await call(client, 'create_game', { scenarioId: 'redbank', seed: traces.canonicalSeed, difficulty: 'normal' });
      expect(created.isError).toBe(false);
      const runId = created.data.runId as string;
      expect(runId).toMatch(/^r_[0-9a-f]{32}$/);
      expect(created.data.day).toBe(1);
      let revision = created.data.revision as number;
      let key = 0;
      for (const a of traces.witnessBridge.actions) {
        const res = a.type === 'END_DAY'
          ? await call(client, 'end_day', { runId, expectedRevision: revision, idempotencyKey: `k${key++}` })
          : await call(client, 'take_action', { runId, action: a, expectedRevision: revision, idempotencyKey: `k${key++}` });
        expect(res.isError, `${JSON.stringify(a)}: ${res.text}`).toBe(false);
        revision = res.data.revision as number;
      }
      const results = await call(client, 'get_results', { runId });
      expect(results.data.result).toBe('victory');
      const v = results.data.verification as { stateHash: string; eventHash: string };
      const direct = replayRun({ scenarioId: 'redbank', seed: traces.canonicalSeed, difficulty: 'normal', actions: traces.witnessBridge.actions });
      expect(v.stateHash).toBe(stateHash(direct.state));
      expect(v.eventHash).toBe(eventHash(direct.state));
      expect(v.stateHash).toBe(traces.witnessBridge.stateHash);
      // history carries causes and reasons
      const hist = await call(client, 'get_history', { runId, minImportance: 2, limit: 100 });
      const events = hist.data.events as { code: string; reason?: string; cause?: number[] }[];
      expect(events.some((e) => e.code === 'LAW_ACTIVATED')).toBe(true);
      expect(events.some((e) => e.reason || e.cause?.length)).toBe(true);
      // the run is over: further play is refused over the wire too
      const late = await call(client, 'end_day', { runId });
      expect(late.isError).toBe(true);
      expect((late.data.error as { code: string }).code).toBe('RUN_OVER');
    } finally {
      await close();
    }
  }, 120_000);

  it('invalid, malformed, stale and unknown calls return structured errors and change nothing', async () => {
    const { client, close } = await connect();
    try {
      const created = await call(client, 'create_game', { scenarioId: 'redbank', seed: 1 });
      const runId = created.data.runId as string;
      const before = (await call(client, 'get_game_state', { runId })).data;
      // schema violations are rejected before reaching the engine
      const junk = await call(client, 'take_action', { runId, action: { type: 'TELEPORT', target: 'ivo' } });
      expect(junk.isError).toBe(true);
      const badId = await call(client, 'get_game_state', { runId: 'r_../../etc/passwd' });
      expect(badId.isError).toBe(true);
      const huge = await call(client, 'import_game', { saveJson: 'x'.repeat(2_000_001) });
      expect(huge.isError).toBe(true);
      // engine refusals carry a code and alternatives
      const early = await call(client, 'take_action', { runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' } });
      expect(early.isError).toBe(true);
      expect((early.data.error as { code: string; alternatives?: string[] }).code).toBe('CHOOSE_STORY');
      expect((early.data.error as { alternatives?: string[] }).alternatives?.length).toBeGreaterThan(0);
      // stale revision
      await call(client, 'take_action', { runId, action: { type: 'PICK_STARTER', claim: 'river_fears_fire' } });
      const stale = await call(client, 'take_action', { runId, action: { type: 'SEED', claim: 'river_fears_fire', target: 'ivo' }, expectedRevision: 0 });
      expect((stale.data.error as { code: string }).code).toBe('STALE_REVISION');
      // an unknown tool is an error result, not a hang or a crash
      const cheat = await call(client, 'cheat_and_win', {});
      expect(cheat.isError).toBe(true);
      expect(cheat.text).toMatch(/not found/i);
      const after = (await call(client, 'get_game_state', { runId })).data;
      expect(after.revision).toBe(1); // only the opening story was accepted
      expect(before.revision).toBe(0);
      expect(after.influence).toEqual(before.influence);
    } finally {
      await close();
    }
  }, 60_000);

  it('serves rules, mission resources and prompts, and a restarted server still has the run', async () => {
    const dir = home();
    const a = await connect({ BELIEF_ENGINE_HOME: dir });
    let runId: string;
    try {
      const { resources } = await a.client.listResources();
      const uris = resources.map((r) => r.uri);
      expect(uris).toContain('belief-engine://rules');
      expect(uris).toContain('belief-engine://scenario/redbank');
      const rules = await a.client.readResource({ uri: 'belief-engine://rules' });
      expect(JSON.stringify(rules.contents)).toMatch(/Keeper of Stories/);
      expect(JSON.stringify(rules.contents)).toMatch(/hidden/i);
      const { prompts } = await a.client.listPrompts();
      expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(['play_cautiously', 'find_alternate_strategy', 'explain_loss']));
      const p = await a.client.getPrompt({ name: 'play_cautiously', arguments: { scenario: 'Wolves of Ashwood' } });
      expect(JSON.stringify(p.messages)).toMatch(/Ashwood/);
      expect(JSON.stringify(p.messages)).toMatch(/compare_possible_actions/);
      runId = (await call(a.client, 'create_game', { scenarioId: 'harvest', seed: 4 })).data.runId as string;
      await call(a.client, 'take_action', { runId, action: { type: 'PICK_STARTER', claim: 'moonlight_ripens_grain' } });
    } finally {
      await a.close();
    }
    const b = await connect({ BELIEF_ENGINE_HOME: dir });
    try {
      const st = await call(b.client, 'get_game_state', { runId });
      expect(st.isError).toBe(false);
      expect(st.data.revision).toBe(1);
      expect(st.data.openingStoryChosen).toBe(true);
    } finally {
      await b.close();
    }
  }, 90_000);

  it('the debug tool only exists when the server is started with BELIEF_ENGINE_DEBUG_TOOLS=1', async () => {
    const { client, close } = await connect({ BELIEF_ENGINE_DEBUG_TOOLS: '1' });
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain('debug_dump_state');
    } finally {
      await close();
    }
  }, 60_000);
});

describe('raw JSON-RPC protocol probe (no SDK client in the way)', () => {
  it('answers initialize with a supported protocol version, survives garbage, reports unknown methods, and keeps stdout pure JSON-RPC', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', SERVER], { cwd: ROOT, env: { ...process.env, BELIEF_ENGINE_HOME: ':memory:' }, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines: string[] = [];
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (l) => lines.push(l));
    const send = (o: unknown) => child.stdin.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n');
    const waitFor = async (pred: (o: Record<string, unknown>) => boolean, ms = 15_000): Promise<Record<string, unknown>> => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        for (const l of lines) {
          let o: Record<string, unknown>;
          try {
            o = JSON.parse(l) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (pred(o)) return o;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`no matching response in ${ms} ms; got ${lines.join(' | ').slice(0, 500)}`);
    };
    try {
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'probe', version: '0' } } });
      const init = await waitFor((o) => o.id === 1);
      const result = init.result as { protocolVersion: string; serverInfo: { name: string }; capabilities: Record<string, unknown>; instructions?: string };
      expect(init.jsonrpc).toBe('2.0');
      expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(result.protocolVersion);
      expect(result.serverInfo.name).toBe('belief-engine');
      expect(result.capabilities.tools).toBeTruthy();
      expect(result.instructions).toMatch(/Belief Engine/);
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      // an older client version is negotiated down, never rejected
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tl = await waitFor((o) => o.id === 2);
      expect(((tl.result as { tools: unknown[] }).tools).length).toBeGreaterThanOrEqual(13);
      // garbage does not kill the server
      send('this is not json');
      send({ jsonrpc: '2.0', id: 3, method: 'definitely/not/a/method' });
      const unknown = await waitFor((o) => o.id === 3);
      expect((unknown.error as { code: number }).code).toBe(-32601);
      send({ jsonrpc: '2.0', id: 4, method: 'ping' });
      expect((await waitFor((o) => o.id === 4)).result).toEqual({});
      // a tool call with bad arguments is a result with isError (or a JSON-RPC error), never a crash
      send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_game_state', arguments: { runId: 42 } } });
      const bad = await waitFor((o) => o.id === 5);
      expect(bad.error ?? (bad.result as { isError?: boolean }).isError).toBeTruthy();
      expect(child.exitCode).toBeNull();
      // stdout carried nothing but JSON-RPC (diagnostics go to stderr)
      for (const l of lines) expect(() => JSON.parse(l), `stdout line: ${l.slice(0, 80)}`).not.toThrow();
    } finally {
      child.kill();
      rl.close();
    }
  }, 60_000);

  it('starting a server with an unwritable home fails loudly instead of pretending to work', async () => {
    // /dev/null is a file, so no directory can be made beneath it
    const child = spawn(process.execPath, ['--import', 'tsx', SERVER], { cwd: ROOT, env: { ...process.env, BELIEF_ENGINE_HOME: '/dev/null/belief' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += String(d)));
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(code).toBe(1);
    expect(err).toMatch(/fatal:.*ENOTDIR/);
  }, 30_000);
});
