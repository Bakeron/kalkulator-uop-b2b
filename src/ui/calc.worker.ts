/**
 * The main screen's calculation off the main thread: with other contracts one change takes up
 * to a second and the screen would stop for that time (plan A7b).
 */
import type { RatesFile } from "../calc/rates";
import { calculator, type Computed, type Scenario } from "./model";
import { RATES_FILES, ratesFor, type RulesChoice } from "./rules";

let files: readonly RatesFile[] = RATES_FILES;
let calcs = new Map<string, (s: Scenario) => Computed>();

type Message = { files: readonly RatesFile[] } | { id: number; scenario: Scenario; rules: RulesChoice };

self.onmessage = (e: MessageEvent<Message>) => {
  if ("files" in e.data) {
    // "Odśwież" brought a newer rates file: every calculator is built again from it.
    files = e.data.files;
    calcs = new Map();
    return;
  }
  const { id, scenario, rules } = e.data;
  const key = `${rules.year}:${rules.variant}`;
  let calc = calcs.get(key);
  if (!calc) {
    calc = calculator(ratesFor(rules, files));
    calcs.set(key, calc);
  }
  self.postMessage({ id, ...calc(scenario) });
};
