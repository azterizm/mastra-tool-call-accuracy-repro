# Tool Call Accuracy (LLM): two scoring gaps

Minimal reproduction for `createToolCallAccuracyScorerLLM` in `@mastra/evals`. A scripted judge stands in for the LLM, so the tests run without a provider or API key. Each test asserts the current behaviour and passes.

## What it shows

1. **`missingTools` is ignored once any tool is called.** The user asks for the weather in Paris and a unit conversion. The agent calls only the weather tool. The judge marks that call appropriate and reports the converter as missing. The score is 1.0. The same request with no tool called scores 0.
2. **The denominator is the number of evaluations the judge returns, not the number of calls.** The agent calls `weather-tool` three times, once as a duplicate. The scenario is the one in the package's own "should handle repeated tool calls" test, which expects 0.67. If the judge returns one evaluation per call, the score is 0.67. If it returns one evaluation for the tool name, the same run scores 1.0.

Both come from `generateScore` in `packages/evals/src/scorers/llm/tool-call-accuracy/index.ts`:

```ts
if (evaluations.length === 0) {
  const missingTools = results.analyzeStepResult?.missingTools || [];
  return missingTools.length > 0 ? 0.0 : 1.0;
}
return roundToTwoDecimals(appropriateToolCalls / evaluations.length);
```

In the package's `index.test.ts`, the 12 tests under Scoring Logic, Edge Cases and Real-world Scenarios replace `scorer.run` with `vi.fn().mockResolvedValue(...)`, so the scoring code above never runs in them.

## Run

```bash
npm install
npm test
```

## Environment

- `@mastra/core` 1.80.0, `@mastra/evals` 1.10.9
- `ai` 5.0.282 (for `MockLanguageModelV2`), `vitest` 4.1.12, `zod` 4.6.7
- Node.js 26.7.0, macOS 26.6.2 (Apple Silicon)
