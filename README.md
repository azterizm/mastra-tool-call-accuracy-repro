# Two scoring gaps in Mastra's Tool Call Accuracy scorer

This repository reproduces two gaps in `createToolCallAccuracyScorerLLM` from `@mastra/evals`. A scripted judge stands in for the LLM, so the tests need no API key. Each test checks the current behaviour and passes.

## What the tests show

A missed tool stops counting once the agent calls any tool. The user asks for the weather in Paris and for 20 C in Fahrenheit. The agent calls only the weather tool. The judge marks that call right and reports the unit converter as missing, yet the score is 1.0. The same request with no tool called scores 0.

The score also depends on how many verdicts the judge returns. The agent calls the weather tool three times, once as a repeat. This is the case in the package's own test "should handle repeated tool calls", which expects 0.67. If the judge returns one verdict per call, the score is 0.67. If it returns one verdict for the tool name, the same run scores 1.0.

Both gaps come from `generateScore` in `packages/evals/src/scorers/llm/tool-call-accuracy/index.ts`.

```ts
if (evaluations.length === 0) {
  const missingTools = results.analyzeStepResult?.missingTools || [];
  return missingTools.length > 0 ? 0.0 : 1.0;
}
return roundToTwoDecimals(appropriateToolCalls / evaluations.length);
```

The package's own tests don't reach this code. In its `index.test.ts`, 12 of the 16 tests replace `scorer.run` with a mock, so the scoring step never runs in them.

## Run the tests

```bash
npm install
npm test
```

The tests ran on Node.js 26.7.0 and macOS 26.6.2, with @mastra/core 1.80.0, @mastra/evals 1.10.9, ai 5.0.282, vitest 4.1.12 and zod 4.6.7.
