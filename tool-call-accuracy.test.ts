import { createToolCallAccuracyScorerLLM } from '@mastra/evals/scorers/prebuilt';
import { createAgentTestRun, createTestMessage } from '@mastra/evals/scorers/utils';
import { createTool } from '@mastra/core/tools';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// A judge that answers each call with the next scripted response: analyze, then reason.
// No provider or API key is needed.
function scriptedJudge(responses: string[]) {
  let call = 0;
  return new MockLanguageModelV2({
    doStream: async () => {
      const text = responses[call] ?? responses.at(-1)!;
      call += 1;
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'response-metadata', id: `r${call}`, modelId: 'scripted-judge', timestamp: new Date(0) },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: text },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
        ]),
      };
    },
  });
}

const tool = (id: string, description: string) =>
  createTool({ id, description, inputSchema: z.object({}), execute: async () => ({}) });

const availableTools = [
  tool('weather-tool', 'Current weather for a city'),
  tool('unit-converter', 'Converts between units, such as Celsius and Fahrenheit'),
];

const call = (id: string, toolName: string, args: Record<string, unknown>) => ({
  toolCallId: id,
  toolName,
  args,
  result: {},
  state: 'result' as const,
});

const analyze = (evaluations: Array<[string, boolean]>, missingTools: string[] = []) =>
  JSON.stringify({
    evaluations: evaluations.map(([toolCalled, wasAppropriate]) => ({ toolCalled, wasAppropriate, reasoning: 'r' })),
    missingTools,
  });

const score = async (judgeAnalysis: string, userText: string, calls: ReturnType<typeof call>[]) => {
  const scorer = createToolCallAccuracyScorerLLM({
    model: scriptedJudge([judgeAnalysis, 'reason']),
    availableTools,
  });
  const run = createAgentTestRun({
    inputMessages: [createTestMessage({ id: 'u1', role: 'user', content: userText })],
    output: [createTestMessage({ id: 'a1', role: 'assistant', content: 'Done.', toolInvocations: calls })],
  });
  return (await scorer.run(run)).score;
};

describe('missingTools is ignored once any tool is called', () => {
  const ask = 'What is the weather in Paris, and what is 20 C in Fahrenheit?';

  it('control: no tool called, judge reports both tools missing -> 0', async () => {
    expect(await score(analyze([], ['weather-tool', 'unit-converter']), ask, [])).toBe(0);
  });

  it('one of two needed tools called, judge reports the other missing -> scores 1.0', async () => {
    const s = await score(analyze([['weather-tool', true]], ['unit-converter']), ask, [
      call('c1', 'weather-tool', { city: 'Paris' }),
    ]);
    expect(s).toBe(1); // current behaviour: the judge's own missingTools has no effect
  });
});

describe('the denominator is the number of evaluations the judge returns, not the number of calls', () => {
  // The scenario of the suite's own "should handle repeated tool calls" test, which expects 0.67
  // but replaces scorer.run with a mock, so the scoring code never runs.
  const ask = 'Compare weather in Paris and London';
  const calls = [
    call('c1', 'weather-tool', { city: 'Paris' }),
    call('c2', 'weather-tool', { city: 'London' }),
    call('c3', 'weather-tool', { city: 'Paris' }),
  ];

  it('judge returns one evaluation per call (third is a duplicate) -> 0.67', async () => {
    const s = await score(analyze([['weather-tool', true], ['weather-tool', true], ['weather-tool', false]]), ask, calls);
    expect(s).toBe(0.67);
  });

  it('same run, judge returns one evaluation for the tool name -> 1.0', async () => {
    const s = await score(analyze([['weather-tool', true]]), ask, calls);
    expect(s).toBe(1); // current behaviour: three calls, one evaluation, denominator 1
  });
});
