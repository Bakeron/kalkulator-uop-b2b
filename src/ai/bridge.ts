/**
 * Calls to the Rust side of "Sprawdź przepisy z AI". The API key stays there (system vault) -
 * the page gets its last 4 characters, and the whole key only on "Pokaż klucz" (not kept). Outside the desktop app (browser, demo) nothing is
 * called.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SourcePage } from "./check";
import type { Usage } from "./spend";

export const inApp = (): boolean => isTauri();

/** An error of the Rust side, or of reading the answer here. */
export interface AiError {
  kind: string;
  message: string;
}

export interface AskAnswer extends Usage {
  text: string;
  stopReason: string;
}

const asError = (e: unknown): AiError =>
  typeof e === "object" && e !== null && "kind" in e
    ? (e as AiError)
    : { kind: "other", message: e instanceof Error ? e.message : String(e) };

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw asError(e);
  }
}

export const keyHint = () => call<string | null>("ai_key_hint");
export const setKey = (value: string) => call<string>("ai_key_set", { value });
export const deleteKey = () => call<void>("ai_key_delete");
export const revealKey = () => call<string | null>("ai_key_reveal");
export const ask = (system: string, question: string) => call<AskAnswer>("ai_ask", { system, question });

export async function fetchSource(url: string): Promise<SourcePage> {
  try {
    return await call<{ text: string; contentType: string }>("ai_fetch_source", { url });
  } catch (e) {
    const err = asError(e);
    return { error: err.kind === "offline" ? "brak połączenia" : err.kind === "timeout" ? "brak odpowiedzi w czasie" : err.message };
  }
}

/** What went wrong and what to do - always with the next step (assumption A4 "Sieć"). */
export function errorText(e: AiError): string {
  switch (e.kind) {
    case "nokey":
      return "Brak klucza API - wklej go w Ustawienia → AI.";
    case "key":
      return "Klucz API nie działa (zły, wyłączony albo usunięty). Sprawdź go na console.anthropic.com i wklej ponownie.";
    case "funds":
      return "Brak środków na koncie Anthropic. Doładuj konto na console.anthropic.com (Billing) i spróbuj ponownie.";
    case "busy":
      return "Anthropic jest chwilowo zajęty (limit zapytań na minutę). Spróbuj za minutę - to nie blokada do jutra.";
    case "overloaded":
      return "Serwery Anthropic są przeciążone. Spróbuj za kilka minut.";
    case "server":
      return "Błąd po stronie Anthropic. Spróbuj za kilka minut.";
    case "offline":
      return "Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.";
    case "timeout":
      return "Brak odpowiedzi w czasie (5 minut). Spróbuj ponownie później.";
    case "vault":
      return "Nie udało się użyć sejfu systemu na klucz (Menedżer poświadczeń Windows). Uruchom aplikację ponownie.";
    case "format":
      return "Klucz ma zły format - wklej go bez spacji i nowych linii.";
    case "answer":
      return "Odpowiedź AI nie miała oczekiwanej postaci - nic się nie zmieniło. Spróbuj ponownie.";
    case "refused":
      return "AI odmówiło odpowiedzi - nic się nie zmieniło.";
    default:
      return `Coś poszło nie tak - nic się nie zmieniło. Szczegóły: ${e.message}`;
  }
}
