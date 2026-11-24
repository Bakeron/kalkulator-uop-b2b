/**
 * "Założenia" as sentences, not a form (assumption A9): every group of options is one sentence
 * of what is assumed; a tap opens its fields. A group with values other than the defaults says
 * "zmienione" (in words) and has "Przywróć domyślne".
 */
import { useId, useState, type ReactNode } from "react";
import type { CostItem, TaxForm, VatMode } from "../calc/b2b";
import type { Bp, Money } from "../calc/money";
import { dateShort, MONTHS, parseZl, plural, zlWhole } from "./format";
import type { Rates } from "../calc/rates";
import Hint, { type HintText } from "./Hint";
import { hints } from "./hints";
import { BENEFITS, defaultScenario, type Scenario } from "./model";
import Reveal from "./Reveal";

const FORM_NAMES: Record<TaxForm, string> = { skala: "skala", liniowy: "liniowy 19%", ryczalt: "ryczałt", ipbox: "IP Box 5%" };

/** Ryczałt rates that fit a specialist's services; 12% is the usual one for IT. */
const RYCZALT_RATES: { rate: Bp; name: string }[] = [
  { rate: 1200, name: "12% - usługi IT (programowanie, doradztwo)" },
  { rate: 850, name: "8,5% - inne usługi" },
  { rate: 1400, name: "14% - m.in. usługi inżynierskie, architektoniczne" },
  { rate: 1500, name: "15% - m.in. reklama, pośrednictwo" },
  { rate: 1700, name: "17% - wolne zawody (np. tłumacz)" },
];

const VAT_NAMES: Record<VatMode, string> = {
  czynny: "czynny podatnik VAT, klient w Polsce",
  zagranica: "klient firma za granicą (bez polskiego VAT na fakturze)",
  zwolniony: "zwolniony z VAT",
};

/** Typical costs to add with one tap (net amounts, the user changes them). */
const COST_PRESETS: CostItem[] = [
  { name: "Sprzęt (laptop)", amount: 500_000, vatRate: 2300, month: 0, kind: "zwykly", enabled: true },
  { name: "Internet", amount: 6_000, vatRate: 2300, month: null, kind: "zwykly", enabled: true },
  { name: "Telefon", amount: 5_000, vatRate: 2300, month: null, kind: "zwykly", enabled: true },
  { name: "Oprogramowanie", amount: 10_000, vatRate: 2300, month: null, kind: "zwykly", enabled: true },
  { name: "Coworking", amount: 60_000, vatRate: 2300, month: null, kind: "zwykly", enabled: true },
  { name: "Auto (paliwo, leasing)", amount: 150_000, vatRate: 2300, month: null, kind: "auto-mieszany", enabled: true },
  { name: "Własna pozycja", amount: 0, vatRate: 2300, month: null, kind: "zwykly", enabled: true },
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface Props {
  scenario: Scenario;
  best: TaxForm;
  year: number;
  rates: Rates;
  onChange: (s: Scenario) => void;
}

export default function Assumptions({ scenario: s, best, year, rates, onChange }: Props) {
  const h = hints(rates);
  const d = defaultScenario();
  const set = <K extends keyof Scenario>(key: K, value: Scenario[K]) => onChange({ ...s, [key]: value });
  const setUop = (patch: Partial<Scenario["uop"]>) => set("uop", { ...s.uop, ...patch });
  const setB2b = (patch: Partial<Scenario["b2b"]>) => set("b2b", { ...s.b2b, ...patch });
  const setFamily = (patch: Partial<Scenario["family"]>) => set("family", { ...s.family, ...patch });
  const setExtra = (patch: Partial<Scenario["extra"]>) => set("extra", { ...s.extra, ...patch });

  return (
    <section className="assume" aria-labelledby="assume-t">
      <h2 id="assume-t" className="assume__title">
        Założenia
      </h2>
      <p className="assume__lead">Wszystko ma rozsądne wartości domyślne. Stuknij zdanie, żeby je zmienić.</p>

      <Group
        sentence={uopSentence(s)}
        changed={!same(s.uop, d.uop)}
        onReset={() => set("uop", d.uop)}
      >
        <Check hint={h.ppk} label="PPK - wpłaty do Pracowniczych Planów Kapitałowych" checked={s.uop.ppk} onChange={(ppk) => setUop({ ppk })} />
        <Check hint={h.commuter} label="Dojeżdżam z innej miejscowości (koszty pracy 300 zł zamiast 250 zł)" checked={s.uop.commuter} onChange={(commuter) => setUop({ commuter })} />
        <Check hint={h.authors} label="Koszty autorskie 50% (praca twórcza, zapis w umowie)" checked={s.uop.authors} onChange={(authors) => setUop({ authors })} />
        <Reveal show={s.uop.authors}>{() => (
          <NumField hint={h.creativePercent} label="Procent pracy twórczej" value={s.uop.creativePercent} min={1} max={100} unit="%" onChange={(creativePercent) => setUop({ creativePercent })} />
        )}</Reveal>
        <Check
          hint={h.zeroPit}
          label="Zerowy PIT (do 26 lat, powrót z zagranicy, 4+ dzieci, praca po wieku emerytalnym)"
          checked={s.uop.zeroPit}
          onChange={(zeroPit) => setUop({ zeroPit })}
        />
        <fieldset className="field">
          <legend>
            Benefity <Hint term="Benefity" hint={h.benefits} />
          </legend>
          {s.uop.benefits.map((b, i) => {
            const info = BENEFITS[b.kind];
            const change = (patch: Partial<typeof b>) => setUop({ benefits: s.uop.benefits.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={b.kind} className="assume__row">
                <Check label={info.name} checked={b.on} onChange={(on) => change({ on })} />
                <Reveal show={b.on}>{() => (
                  <ZlField
                    label={`${info.name} - kwota ${info.month === null ? "miesięcznie" : "raz w roku"}`}
                    value={b.amount}
                    onChange={(amount) => change({ amount })}
                  />
                )}</Reveal>
              </div>
            );
          })}
        </fieldset>
      </Group>

      <Group
        sentence={b2bSentence(s, best, year)}
        changed={s.form !== d.form || !same({ ...s.b2b, paidDaysOff: 0 }, { ...d.b2b, paidDaysOff: 0 })}
        onReset={() => onChange({ ...s, form: d.form, b2b: { ...d.b2b, paidDaysOff: s.b2b.paidDaysOff } })}
      >
        <fieldset className="field">
          <legend>
            Forma opodatkowania na B2B <Hint term="Forma opodatkowania" hint={h.form} />
          </legend>
          {([null, "skala", "liniowy", "ryczalt", "ipbox"] as const).map((f) => (
            <label key={f ?? "auto"} className="choice">
              <input type="radio" name="form" checked={s.form === f} onChange={() => set("form", f)} />
              {f === null ? "Najkorzystniejsza (wybiera kalkulator)" : FORM_NAMES[f]}
            </label>
          ))}
        </fieldset>
        <Hinted term="Stawka ryczałtu" hint={h.ryczaltRate}>
          <label className="field">
            <span>Stawka ryczałtu</span>
            <select value={s.b2b.ryczaltRate ?? 1200} onChange={(e) => setB2b({ ryczaltRate: Number(e.target.value) === 1200 ? null : Number(e.target.value) })}>
              {RYCZALT_RATES.map((r) => (
                <option key={r.rate} value={r.rate}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </Hinted>
        <NumField
          hint={h.ipBox}
          label="IP Box - część dochodu z praw do programów (wskaźnik nexus wliczony)"
          value={s.b2b.ipBoxPercent}
          min={0}
          max={100}
          unit="%"
          onChange={(ipBoxPercent) => setB2b({ ipBoxPercent })}
        />
        <Hinted term="Data założenia firmy" hint={h.startDate}>
          <label className="field">
            <span>Data założenia firmy</span>
            <input type="date" value={s.b2b.startDate || `${year}-01-01`} onChange={(e) => setB2b({ startDate: e.target.value })} />
          </label>
        </Hinted>
        <Check hint={h.startRelief} label="Ulga na start - pierwsze 6 miesięcy bez składek społecznych" checked={s.b2b.startRelief} onChange={(startRelief) => setB2b({ startRelief })} />
        <Check hint={h.preferential} label="Preferencyjny ZUS - kolejne 24 miesiące od niższej podstawy" checked={s.b2b.preferential} onChange={(preferential) => setB2b({ preferential })} />
        <Check hint={h.smallZusPlus} label="Mały ZUS Plus po preferencyjnym (zależy od zeszłego roku)" checked={s.b2b.smallZusPlus} onChange={(smallZusPlus) => setB2b({ smallZusPlus })} />
        <Reveal show={s.b2b.smallZusPlus}>{() => (
          <>
            <ZlField label="Przychód z firmy w zeszłym roku" value={s.b2b.prevRevenue} onChange={(prevRevenue) => setB2b({ prevRevenue })} />
            <ZlField label="Dochód z firmy w zeszłym roku" value={s.b2b.prevIncome} onChange={(prevIncome) => setB2b({ prevIncome })} />
          </>
        )}</Reveal>
        <Check hint={h.voluntarySickness} label="Dobrowolne ubezpieczenie chorobowe" checked={s.b2b.voluntarySickness} onChange={(voluntarySickness) => setB2b({ voluntarySickness })} />
        <Hinted term="Wakacje składkowe" hint={h.contributionHoliday}>
          <label className="field">
            <span>Wakacje składkowe - miesiąc bez składek społecznych</span>
            <select
              value={s.b2b.contributionHoliday ?? ""}
              onChange={(e) => setB2b({ contributionHoliday: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">nie korzystam</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </Hinted>
        <Check
          hint={h.formerEmployer}
          label="Klient to mój obecny albo były pracodawca i robię to samo, co na etacie"
          checked={s.b2b.formerEmployer}
          onChange={(formerEmployer) => setB2b({ formerEmployer })}
        />
        <fieldset className="field">
          <legend>
            Klienci <Hint term="Jeden czy kilku klientów" hint={h.clients} />
          </legend>
          {(["jeden", "kilku"] as const).map((c) => (
            <label key={c} className="choice">
              <input type="radio" name="clients" checked={s.b2b.clients === c} onChange={() => setB2b({ clients: c })} />
              {c === "jeden" ? "Jeden klient" : "Kilku klientów"}
            </label>
          ))}
        </fieldset>
      </Group>

      <Group sentence={costsSentence(s)} changed={!same(s.costs, d.costs)} onReset={() => set("costs", d.costs)}>
        {s.costs.map((c, i) => (
          <CostRow
            key={i}
            cost={c}
            onChange={(cost) => set("costs", s.costs.map((x, j) => (j === i ? cost : x)))}
            onRemove={() => set("costs", s.costs.filter((_, j) => j !== i))}
          />
        ))}
        <label className="field">
          <span>Dodaj koszt</span>
          <select
            value=""
            onChange={(e) => {
              const preset = COST_PRESETS[Number(e.target.value)];
              if (preset) set("costs", [...s.costs, { ...preset }]);
            }}
          >
            <option value="">wybierz...</option>
            {COST_PRESETS.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <Reveal show={s.form === "ryczalt" || (s.form === null && best === "ryczalt")}>{() => (
          <p className="assume__note">Na ryczałcie koszty nie zmniejszają podatku - płacisz je, ale podatek liczy się od całego przychodu.</p>
        )}</Reveal>
      </Group>

      <Group sentence={`VAT: ${VAT_NAMES[s.vat]}.`} changed={s.vat !== d.vat} onReset={() => set("vat", d.vat)}>
        <fieldset className="field">
          <legend>
            VAT na B2B <Hint term="VAT na B2B" hint={h.vat} />
          </legend>
          {(Object.keys(VAT_NAMES) as VatMode[]).map((v) => (
            <label key={v} className="choice">
              <input type="radio" name="vat" checked={s.vat === v} onChange={() => set("vat", v)} />
              {VAT_NAMES[v]}
            </label>
          ))}
        </fieldset>
      </Group>

      <Group
        sentence={daysSentence(s)}
        changed={s.vacationDays !== d.vacationDays || s.sickDays !== d.sickDays || s.sickKind !== d.sickKind || s.over50 !== d.over50 || s.b2b.paidDaysOff !== 0}
        onReset={() => onChange({ ...s, vacationDays: d.vacationDays, sickDays: d.sickDays, sickKind: d.sickKind, over50: d.over50, b2b: { ...s.b2b, paidDaysOff: 0 } })}
      >
        <fieldset className="field">
          <legend>
            Urlop na umowie o pracę <Hint term="Urlop na umowie o pracę" hint={h.vacation} />
          </legend>
          {([26, 20] as const).map((v) => (
            <label key={v} className="choice">
              <input type="radio" name="vacation" checked={s.vacationDays === v} onChange={() => set("vacationDays", v)} />
              {v} dni {v === 26 ? "(staż co najmniej 10 lat)" : "(staż poniżej 10 lat)"}
            </label>
          ))}
        </fieldset>
        <NumField hint={h.paidDaysOff} label="Płatne dni wolne z umowy B2B w roku" value={s.b2b.paidDaysOff} min={0} max={s.vacationDays} unit="dni" onChange={(paidDaysOff) => setB2b({ paidDaysOff })} />
        <Hinted term="Dni choroby w roku" hint={h.sickDays}>
          <label className="field">
            <span>Dni choroby w roku: {s.sickDays}</span>
            <input type="range" min={0} max={60} value={s.sickDays} onChange={(e) => set("sickDays", Number(e.target.value))} />
          </label>
        </Hinted>
        <fieldset className="field">
          <legend>
            Powód choroby <Hint term="Powód choroby" hint={h.sickKind} />
          </legend>
          <label className="choice">
            <input type="radio" name="sickKind" checked={s.sickKind === "zwykla"} onChange={() => set("sickKind", "zwykla")} />
            zwykła choroba, także szpital (80%)
          </label>
          <label className="choice">
            <input type="radio" name="sickKind" checked={s.sickKind === "ciaza-wypadek"} onChange={() => set("sickKind", "ciaza-wypadek")} />
            ciąża albo wypadek w drodze do pracy (100%)
          </label>
        </fieldset>
        <Check hint={h.over50} label="Mam ponad 50 lat (pracodawca płaci za 14 dni choroby, nie 33)" checked={s.over50} onChange={(over50) => set("over50", over50)} />
      </Group>

      <Group sentence={familySentence(s)} changed={!same(s.family, d.family)} onReset={() => set("family", d.family)}>
        <Check label="Jestem w związku małżeńskim przez cały rok" checked={s.family.married} onChange={(married) => setFamily({ married, joint: married && s.family.joint })} />
        <Reveal show={s.family.married}>{() => (
          <>
            <Check hint={h.joint} label="Rozliczam się wspólnie z małżonkiem" checked={s.family.joint} onChange={(joint) => setFamily({ joint })} />
            <ZlField label="Dochód małżonka w roku (po kosztach i składkach)" value={s.family.spouseIncome} onChange={(spouseIncome) => setFamily({ spouseIncome })} />
          </>
        )}</Reveal>
        <NumField hint={h.children} label="Dzieci (ulga na dzieci)" value={s.family.children} min={0} max={10} unit="" onChange={(children) => setFamily({ children })} />
        <p className="assume__note">Na B2B wspólne rozliczenie i ulga na dzieci działają tylko na skali - na liniowym i ryczałcie nie.</p>
      </Group>

      <Group sentence={extraSentence(s)} changed={!same(s.extra, d.extra)} onReset={() => set("extra", d.extra)}>
        <p className="assume__note">Te umowy masz niezależnie od wybranej oferty, więc liczę je przy obu - podatek ze wszystkich razem.</p>
        <Check hint={h.job} label="Druga umowa o pracę (u innego pracodawcy)" checked={s.extra.job !== null} onChange={(on) => setExtra({ job: on ? 400_000 : null })} />
        {s.extra.job !== null && <ZlField label="Druga umowa o pracę - brutto miesięcznie" value={s.extra.job} onChange={(job) => setExtra({ job })} />}
        <Check
          hint={h.zlecenie}
          label="Umowa zlecenie"
          checked={s.extra.zlecenie !== null}
          onChange={(on) => setExtra({ zlecenie: on ? { amount: 200_000, sameEmployer: false, voluntarySocial: false } : null })}
        />
        <Reveal show={s.extra.zlecenie !== null}>{() => (
          <>
            <ZlField label="Zlecenie - brutto miesięcznie" value={s.extra.zlecenie!.amount} onChange={(amount) => setExtra({ zlecenie: { ...s.extra.zlecenie!, amount } })} />
            <Check
              label="U tego samego pracodawcy, co umowa o pracę (składki jak z pensji)"
              checked={s.extra.zlecenie!.sameEmployer}
              onChange={(sameEmployer) => setExtra({ zlecenie: { ...s.extra.zlecenie!, sameEmployer } })}
            />
            <Check
              label="Płacę dobrowolne składki społeczne ze zlecenia"
              checked={s.extra.zlecenie!.voluntarySocial}
              onChange={(voluntarySocial) => setExtra({ zlecenie: { ...s.extra.zlecenie!, voluntarySocial } })}
            />
          </>
        )}</Reveal>
        <Check hint={h.dzielo} label="Umowa o dzieło" checked={s.extra.dzielo !== null} onChange={(on) => setExtra({ dzielo: on ? { amount: 200_000, authors: true } : null })} />
        <Reveal show={s.extra.dzielo !== null}>{() => (
          <>
            <ZlField label="Dzieło - brutto miesięcznie" value={s.extra.dzielo!.amount} onChange={(amount) => setExtra({ dzielo: { ...s.extra.dzielo!, amount } })} />
            <Check
              label="Koszty autorskie 50% (zamiast 20%)"
              checked={s.extra.dzielo!.authors}
              onChange={(authors) => setExtra({ dzielo: { ...s.extra.dzielo!, authors } })}
            />
          </>
        )}</Reveal>
        <Check
          hint={h.sideBusiness}
          label="Przy umowie o pracę prowadzę też firmę (liczę ją na skali)"
          checked={s.extra.sideBusiness !== null}
          onChange={(on) => setExtra({ sideBusiness: on ? 300_000 : null })}
        />
        <Reveal show={s.extra.sideBusiness !== null}>{() => (
          <ZlField label="Firma obok etatu - netto na fakturze miesięcznie" value={s.extra.sideBusiness!} onChange={(sideBusiness) => setExtra({ sideBusiness })} />
        )}</Reveal>
      </Group>
    </section>
  );
}

function uopSentence(s: Scenario): string {
  const u = s.uop;
  const parts = [
    `PPK ${u.ppk ? "włączone" : "wyłączone"}`,
    `koszty pracy ${u.commuter ? "300" : "250"} zł`,
    u.authors ? `koszty autorskie 50% od ${u.creativePercent}% pensji` : "bez kosztów autorskich",
  ];
  if (u.zeroPit) parts.push("zerowy PIT");
  const benefits = u.benefits.filter((b) => b.on).map((b) => BENEFITS[b.kind].name.toLowerCase());
  parts.push(benefits.length ? `benefity: ${benefits.join(", ")}` : "bez benefitów");
  return `Umowa o pracę: ${parts.join(", ")}.`;
}

function b2bSentence(s: Scenario, best: TaxForm, year: number): string {
  const b = s.b2b;
  const ryczalt = `ryczałt ${((b.ryczaltRate ?? 1200) / 100).toLocaleString("pl-PL")}%`;
  const name = (f: TaxForm) => (f === "ryczalt" ? ryczalt : FORM_NAMES[f]);
  const form = s.form === null ? `najkorzystniejsza forma podatku - teraz ${name(best)}` : `tylko ${name(s.form)}`;
  const stages = b.formerEmployer
    ? "klient to były pracodawca, więc bez ulg ZUS"
    : [b.startRelief && "ulga na start", b.preferential && "preferencyjny ZUS", b.smallZusPlus && "Mały ZUS Plus"].filter(Boolean).join(", ") || "pełny ZUS";
  return `B2B: ${form}; firma od ${dateShort(b.startDate || `${year}-01-01`)}, ${stages}, ${b.voluntarySickness ? "z dobrowolnym chorobowym" : "bez chorobowego"}.`;
}

function costsSentence(s: Scenario): string {
  const on = s.costs.filter((c) => c.enabled && c.amount > 0);
  if (on.length === 0) return "Koszty firmy: brak.";
  const list = on.map((c) => `${c.name.toLowerCase()} ${zlWhole(c.amount)}${c.month === null ? " miesięcznie" : " raz"}`);
  return `Koszty firmy (netto): ${list.join(", ")}.`;
}

function daysSentence(s: Scenario): string {
  const paid = s.b2b.paidDaysOff;
  const b2b = paid > 0 ? `na B2B ${paid} ${plural(paid, "dzień", "dni", "dni")} wolne płatne, reszta bez faktury` : "na B2B dni wolne są bez faktury";
  const sick = `${s.sickDays} ${plural(s.sickDays, "dzień", "dni", "dni")} choroby${s.sickKind === "ciaza-wypadek" ? " (100%)" : ""}`;
  return `Urlop i choroba: ${s.vacationDays} dni urlopu i ${sick} w roku${s.over50 ? ", ponad 50 lat" : ""}; ${b2b}.`;
}

function familySentence(s: Scenario): string {
  const f = s.family;
  const who = f.married && f.joint ? `wspólnie z małżonkiem (dochód ${zlWhole(f.spouseIncome)} w roku)` : "samodzielnie";
  const kids = f.children === 0 ? "bez dzieci" : `${f.children} ${plural(f.children, "dziecko", "dzieci", "dzieci")}`;
  return `Rozliczenie roczne: ${who}, ${kids}.`;
}

function extraSentence(s: Scenario): string {
  const e = s.extra;
  const list = [
    e.job !== null && `druga umowa o pracę ${zlWhole(e.job)}`,
    e.zlecenie !== null && `zlecenie ${zlWhole(e.zlecenie.amount)}`,
    e.dzielo !== null && `dzieło ${zlWhole(e.dzielo.amount)}`,
    e.sideBusiness !== null && `firma obok etatu ${zlWhole(e.sideBusiness)}`,
  ].filter(Boolean);
  return list.length === 0 ? "Inne umowy: brak - tylko te dwie oferty." : `Inne umowy miesięcznie: ${list.join(", ")}.`;
}

/** The assumptions in the same sentences as on the screen - for the PDF. */
export function assumptionSentences(s: Scenario, best: TaxForm, year: number): string[] {
  return [uopSentence(s), b2bSentence(s, best, year), costsSentence(s), daysSentence(s), familySentence(s), extraSentence(s)];
}

function Group({ sentence, changed = false, onReset, children }: { sentence: string; changed?: boolean; onReset?: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`assume__group${open ? " is-open" : ""}`}>
      <button type="button" className="assume__sentence" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {sentence}
        {changed && <span className="assume__changed"> (zmienione)</span>}
      </button>
      <div className="assume__fields" id={id} inert={!open}>
        <div>
          {children}
          <Reveal show={changed && !!onReset}>{() => (
            <button type="button" className="link" onClick={onReset}>
              Przywróć domyślne
            </button>
          )}</Reveal>
        </div>
      </div>
    </div>
  );
}

/** A field with its "?" next to it - outside the <label>, so a tap on "?" does not tick the box (assumption A6). */
function Hinted({ term, hint, children }: { term: string; hint?: HintText; children: ReactNode }) {
  if (!hint) return <>{children}</>;
  return (
    <div className="hinted">
      {children}
      <Hint term={term} hint={hint} />
    </div>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: HintText }) {
  return (
    <Hinted term={label} hint={hint}>
      <label className="choice">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    </Hinted>
  );
}

function NumField(props: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void; hint?: HintText }) {
  return (
    <Hinted term={props.label} hint={props.hint}>
      <NumInput {...props} />
    </Hinted>
  );
}

function NumInput({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="field field--inline">
      <span>{label}</span>
      <span className="field__box">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value));
            if (e.target.value !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
        {unit && <span className="field__unit">{unit}</span>}
      </span>
    </label>
  );
}

/** An amount in złoty typed with a Polish format; a wrong text stays in the field with a hint. */
export function ZlField({ label, value, onChange }: { label: string; value: Money; onChange: (v: Money) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? zlWhole(value).replace(/ zł$/, "");
  const invalid = text !== null && parseZl(text) === null;
  return (
    <label className="field field--inline">
      <span>{label}</span>
      <span className="field__box">
        <input
          inputMode="decimal"
          value={shown}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseZl(e.target.value);
            if (v !== null) onChange(v);
          }}
          onBlur={() => setText(null)}
        />
        <span className="field__unit">zł</span>
      </span>
      {invalid && <span className="money__error">Wpisz kwotę cyframi, np. 250.</span>}
    </label>
  );
}

function CostRow({ cost: c, onChange, onRemove }: { cost: CostItem; onChange: (c: CostItem) => void; onRemove: () => void }) {
  const set = (patch: Partial<CostItem>) => onChange({ ...c, ...patch });
  return (
    <fieldset className="field cost">
      <legend className="sr-only">{c.name}</legend>
      <div className="cost__head">
        <label className="cost__tick">
          <input type="checkbox" className="cost__on" aria-label={`Wliczaj: ${c.name}`} checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>
        <input className="cost__name" aria-label="Nazwa kosztu" value={c.name} onChange={(e) => set({ name: e.target.value })} />
        <button type="button" className="link" onClick={onRemove} aria-label={`Usuń: ${c.name}`}>
          Usuń
        </button>
      </div>
      <Reveal show={c.enabled}>{() => (
        <div className="cost__body">
          <ZlField label="Kwota netto" value={c.amount} onChange={(amount) => set({ amount })} />
          <label className="field field--inline">
            <span>VAT</span>
            <select value={c.vatRate} onChange={(e) => set({ vatRate: Number(e.target.value) })}>
              {[2300, 800, 500, 0].map((r) => (
                <option key={r} value={r}>
                  {r / 100}%
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span>Kiedy</span>
            <select value={c.month ?? ""} onChange={(e) => set({ month: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">co miesiąc</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  raz - {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span>Rodzaj</span>
            <select value={c.kind} onChange={(e) => set({ kind: e.target.value as CostItem["kind"] })}>
              <option value="zwykly">zwykły koszt</option>
              <option value="auto-mieszany">auto także prywatnie (75% kosztów, 50% VAT)</option>
              <option value="auto-firmowy">auto tylko do firmy (100%)</option>
            </select>
          </label>
        </div>
      )}</Reveal>
    </fieldset>
  );
}
