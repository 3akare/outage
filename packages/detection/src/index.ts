// @outage/detection: the pure detection engine. See README.md for the contract.
import {
  areaStatus,
  buildDecisions,
  diffDecisions,
  selectPushes,
  spotStates,
} from './decisions.ts';
import { hintProblems } from './hints.ts';
import { mergeInputs } from './merge.ts';
import { assertParams, type Params } from './params.ts';
import { emptyState, settle } from './settle.ts';
import { sweep } from './sweep.ts';
import { DAY_MS } from './time.ts';
import type { EngineInput, EngineOutputs, EngineState } from './types.ts';

export { levelFromExplanation, explainWindow } from './decisions.ts';
export { applyHints, hintProblems } from './hints.ts';
export { DEFAULT_PARAMS, ParamsError, assertParams, validateParams, type Params } from './params.ts';
export { emptyState, migrate, removeInstall, settle, StateVersionError } from './settle.ts';
export { sweep, outageIdFor, p95Before } from './sweep.ts';
export { lnGamma, tail } from './tail.ts';
export { dayStartMs, localDay, localHour } from './time.ts';
export { classifyWindow } from './window.ts';
export * from './types.ts';

/**
 * evaluate(state, input, params) -> { state, outputs }. Pure: no I/O, no clock, no randomness, no mutation of its
 * arguments. The decisions are a pure function of the retained event set and `nowMs`, not of arrival order.
 */
export function evaluate(
  state: EngineState,
  input: EngineInput,
  params: Params,
): { state: EngineState; outputs: EngineOutputs } {
  assertParams(params);
  if (!Number.isSafeInteger(input.nowMs)) throw new RangeError('nowMs must be an integer');
  const merged = mergeInputs(state, input.events, input.labels);
  const merged_state: EngineState = { ...state, installs: merged.installs };
  const sw = sweep(merged_state, merged.installs, params);
  const decisions = buildDecisions(sw, input.context, input.nowMs, params);
  const { pushes, pushed } = selectPushes(decisions, merged_state, input.nowMs, params);
  const changes = diffDecisions(state.decisions, decisions);
  const settled = settle({ ...merged_state, pushed }, sw, decisions, input.nowMs, params);
  const live = decisions.filter((d) => !settled.archivedIds.has(d.outageId));
  const next: EngineState = { ...settled.state, decisions: live };
  const outputs: EngineOutputs = {
    decisions: live,
    changes,
    pushes,
    areaStatus: areaStatus(decisions, sw, input.nowMs, params),
    spotStates: spotStates(sw, merged.installs, params),
    rejected: [...merged.rejected, ...hintProblems(input.context)],
    ignoredSimulated: merged.ignoredSimulated,
    clockSkew: sw.lastEventMs !== null && input.nowMs < sw.lastEventMs - DAY_MS,
  };
  return { state: next, outputs };
}

export { emptyState as initialState };
