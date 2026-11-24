/**
 * The main screen's calculation in a Web Worker. Only the latest scenario counts: while the
 * worker computes, newer changes wait and only the last of them is sent. Until the answer comes
 * the screen shows the previous result (`busy`). Without workers it computes on the main thread.
 */
import { useEffect, useRef, useState } from "react";
import type { RatesFile } from "../calc/rates";
import { calculator, type Computed, type Scenario } from "./model";
import { ratesFor, type RulesChoice } from "./rules";

/** One calculation: the scenario under the chosen rules (both compared by reference). */
interface Job {
  scenario: Scenario;
  rules: RulesChoice;
}

const sameJob = (a: Job | null | undefined, b: Job) => !!a && a.scenario === b.scenario && a.rules === b.rules;

/**
 * `files` - the rates files in use (bundled, or newer ones from "Odśwież"); a new list means new
 * `rules` objects too, so the result is computed again.
 */
export function useCalculation(scenario: Scenario, rules: RulesChoice, files: readonly RatesFile[]): { data: Computed; busy: boolean } {
  const locals = useRef(new Map<RulesChoice, (s: Scenario) => Computed>());
  const filesRef = useRef(files);
  const workerFiles = useRef<readonly RatesFile[] | null>(null);
  if (filesRef.current !== files) {
    filesRef.current = files;
    locals.current = new Map();
  }
  const local = (job: Job) => {
    let calc = locals.current.get(job.rules);
    if (!calc) {
      calc = calculator(ratesFor(job.rules, filesRef.current));
      locals.current.set(job.rules, calc);
    }
    return calc(job.scenario);
  };
  const [state, setState] = useState(() => ({ data: local({ scenario, rules }), of: { scenario, rules } as Job }));
  const worker = useRef<Worker | null>(null);
  const sent = useRef<({ id: number } & Job) | null>(null);
  const waiting = useRef<Job | null>(null);
  const nextId = useRef(0);

  const send = (job: Job) => {
    const w = worker.current;
    if (!w) {
      setState({ data: local(job), of: job });
      return;
    }
    if (workerFiles.current !== filesRef.current) {
      workerFiles.current = filesRef.current;
      w.postMessage({ files: filesRef.current });
    }
    const id = ++nextId.current;
    sent.current = { id, ...job };
    w.postMessage({ id, scenario: job.scenario, rules: { year: job.rules.year, variant: job.rules.variant } });
  };

  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("./calc.worker.ts", import.meta.url), { type: "module" });
    } catch {
      w = null;
    }
    worker.current = w;
    workerFiles.current = null;
    sent.current = null;
    waiting.current = null;
    if (!w) return;
    w.onmessage = (e: MessageEvent<{ id: number } & Computed>) => {
      const job = sent.current;
      if (!job || job.id !== e.data.id) return;
      sent.current = null;
      setState({ data: { result: e.data.result, model: e.data.model }, of: { scenario: job.scenario, rules: job.rules } });
      const next = waiting.current;
      waiting.current = null;
      if (next) send(next);
    };
    w.onerror = () => {
      // The worker failed (e.g. not allowed): compute here from now on.
      w!.terminate();
      worker.current = null;
      const job = sent.current ?? waiting.current;
      sent.current = null;
      waiting.current = null;
      if (job) send({ scenario: job.scenario, rules: job.rules });
    };
    return () => {
      w!.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const job = { scenario, rules };
    if (sameJob(state.of, job) || sameJob(sent.current, job)) return;
    if (sent.current) waiting.current = job;
    else send(job);
    // `state.of` changes only together with an answer for an earlier job.
  }, [scenario, rules]);

  return { data: state.data, busy: !sameJob(state.of, { scenario, rules }) };
}
