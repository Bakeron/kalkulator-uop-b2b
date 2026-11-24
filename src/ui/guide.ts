/**
 * The "Co warto wiedzieć" tab (assumption A1, plan A12): a guide next to the calculator, in
 * chapters, every section with the acts it comes from. Amounts and rates are taken from the rates
 * of the chosen year, so the text never disagrees with the calculation. Pure data, no interface.
 */
import { formatZl, type Bp, type Money } from "../calc/money";
import type { Bracket, Rates } from "../calc/rates";

export interface Source {
  label: string;
  url: string;
}

export interface Section {
  title: string;
  /** Paragraphs; a paragraph given as a list becomes bullet points. */
  body: (string | string[])[];
  sources: Source[];
}

export interface FormsTable {
  /** Column heads (the forms) and rows: [what, value per form]. */
  forms: string[];
  rows: [string, ...string[]][];
}

export interface Chapter {
  id: string;
  title: string;
  lead: string;
  table?: FormsTable;
  sections: Section[];
}

const ACT = (path: string) => `https://api.sejm.gov.pl/eli/acts/${path}/text.pdf`;

export const ACTS = {
  pit: { label: "ustawa o podatku dochodowym od osób fizycznych (Dz.U. 2026 poz. 592)", url: ACT("DU/2026/592") },
  ryczalt: { label: "ustawa o zryczałtowanym podatku dochodowym (Dz.U. 2025 poz. 843)", url: ACT("DU/2025/843") },
  zus: { label: "ustawa o systemie ubezpieczeń społecznych (Dz.U. 2026 poz. 199)", url: ACT("DU/2026/199") },
  health: { label: "ustawa o świadczeniach opieki zdrowotnej (Dz.U. 2025 poz. 1461)", url: ACT("DU/2025/1461") },
  vat: { label: "ustawa o podatku od towarów i usług (Dz.U. 2026 poz. 1263)", url: ACT("DU/2026/1263") },
  business: { label: "Prawo przedsiębiorców (Dz.U. 2026 poz. 1484)", url: ACT("DU/2026/1484") },
  labour: { label: "Kodeks pracy (Dz.U. 2026 poz. 1245)", url: ACT("DU/2026/1245") },
  ppk: { label: "ustawa o pracowniczych planach kapitałowych (Dz.U. 2026 poz. 192)", url: ACT("DU/2026/192") },
  sickness: { label: "ustawa zasiłkowa (Dz.U. 2026 poz. 854)", url: ACT("DU/2026/854") },
} satisfies Record<string, Source>;

const PAGES = {
  ceidg: { label: "biznes.gov.pl - zakładanie firmy i CEIDG", url: "https://www.biznes.gov.pl/" },
  ksef: { label: "Krajowy System e-Faktur (Ministerstwo Finansów)", url: "https://ksef.podatki.gov.pl/" },
  zus: { label: "ZUS - składki przedsiębiorców", url: "https://www.zus.pl/" },
  podatki: { label: "podatki.gov.pl - e-Urząd Skarbowy", url: "https://www.podatki.gov.pl/" },
} satisfies Record<string, Source>;

/** "12 000 zł", "1 441,80 zł" from grosze - grosze only when there are any. */
const zl = (m: Money) => formatZl(m, m % 100 !== 0);
/** "9,76%" from basis points. */
const pc = (b: Bp) => `${(b / 100).toLocaleString("pl-PL")}%`;

/** "12% do 120 000 zł dochodu, 32% powyżej" - any number of brackets. */
function scaleText(scale: Bracket[]): string {
  return scale.map((b, i) => (b.upTo === null ? `${pc(b.rate)} powyżej` : `${pc(b.rate)} do ${zl(b.upTo)}${i === 0 ? " dochodu" : ""}`)).join(", ");
}

export function knowledge(r: Rates): Chapter[] {
  const low = r.pitScale[0];
  const scale = scaleText(r.pitScale);
  const [rLow, rHigh] = r.ryczaltHealthThresholds;
  const freeAmount = Math.round((r.taxReduction * 10_000) / (low?.rate ?? 1200) / 100) * 100;

  return [
    {
      id: "formy",
      title: "Formy opodatkowania",
      lead: `Na B2B wybiera się, jak liczyć podatek. Kalkulator liczy wszystkie formy naraz i pokazuje najkorzystniejszą przy podanych kwotach. Formę wybiera się co roku: do 20. dnia miesiąca po pierwszym przychodzie w roku (przy przychodzie w styczniu - do 20 lutego), w CEIDG albo w urzędzie skarbowym. Bez zgłoszenia zostaje skala.`,
      table: {
        forms: ["Skala", "Liniowy", "Ryczałt", "IP Box"],
        rows: [
          ["Podatek", scale, `${pc(r.linearRate)} od dochodu`, `${pc(r.ryczaltItRate)} od przychodu (programiści; inne zawody mają inne stawki)`, `${pc(r.ipBoxRate)} od dochodu z praw do programu, reszta jak na skali albo liniowym`],
          ["Kwota wolna", `tak - ${zl(freeAmount)} rocznie`, "nie", "nie", "jak na skali albo liniowym"],
          ["Koszty firmy", "odejmuje się od przychodu", "odejmuje się od przychodu", "nie odejmuje się - podatek od całej faktury", "odejmuje się od przychodu"],
          ["Składka zdrowotna", `${pc(r.health)} dochodu, nie mniej niż ${zl(r.healthMin)} miesięcznie`, `${pc(r.healthLinear)} dochodu, nie mniej niż ${zl(r.healthMin)}; do ${zl(r.linearHealthDeductionLimit)} rocznie odlicza się od dochodu`, `stała kwota w 3 progach przychodu (do ${zl(rLow ?? 0)}, do ${zl(rHigh ?? 0)}, powyżej); połowę odlicza się od przychodu`, "jak przy formie, na której stoi"],
          ["Wspólne rozliczenie z małżonkiem i ulga na dzieci", "tak", "nie", "nie", "przy skali tak"],
          ["Dla kogo zwykle", "niskie dochody albo wspólne rozliczenie", "wysokie dochody i duże koszty", "programista z małymi kosztami", "kto tworzy programy i prowadzi ich ewidencję"],
        ],
      },
      sections: [
        {
          title: "Skala podatkowa",
          body: [
            `Podatek od dochodu w roku: ${scale}. Kwota zmniejszająca podatek to ${zl(r.taxReduction)} rocznie, więc pierwsze ${zl(freeAmount)} dochodu jest bez podatku.`,
            "Tylko na skali można rozliczyć się razem z małżonkiem i skorzystać z ulgi na dzieci. Składki społeczne odlicza się od dochodu, zdrowotnej nie.",
          ],
          sources: [ACTS.pit],
        },
        {
          title: "Podatek liniowy",
          body: [
            `Zawsze ${pc(r.linearRate)} od dochodu, bez kwoty wolnej i bez drugiego progu. Opłaca się przy wysokich dochodach.`,
            `Zdrowotna to ${pc(r.healthLinear)} dochodu. Zapłaconą zdrowotną odlicza się od dochodu, ale najwyżej ${zl(r.linearHealthDeductionLimit)} w roku. Nie ma wspólnego rozliczenia z małżonkiem ani ulgi na dzieci.`,
          ],
          sources: [ACTS.pit, ACTS.health],
        },
        {
          title: "Ryczałt od przychodów ewidencjonowanych",
          body: [
            `Podatek liczy się od całej kwoty z faktur, bez kosztów. Stawka zależy od rodzaju pracy - dla programistów zwykle ${pc(r.ryczaltItRate)}. Ewidencja jest najprostsza: wystarczy zapisywać przychody.`,
            `Zdrowotna nie zależy od dochodu, tylko od progu przychodu w roku: do ${zl(rLow ?? 0)}, do ${zl(rHigh ?? 0)} i powyżej. Połowę zapłaconej zdrowotnej odlicza się od przychodu.`,
            `Ryczałtu nie wybierze firma, której przychód w poprzednim roku przekroczył ${zl(r.ryczaltLimit)}. Przy dużych kosztach (sprzęt, auto, biuro) ryczałt przestaje się opłacać - kalkulator to pokazuje.`,
          ],
          sources: [ACTS.ryczalt, ACTS.health],
        },
        {
          title: "IP Box",
          body: [
            `Obniżony podatek ${pc(r.ipBoxRate)} od dochodu z praw do tego, co się tworzy, np. programów komputerowych. Działa przy skali albo liniowym, a ulgę pokazuje się w zeznaniu rocznym (załącznik PIT/IP).`,
            "Warunek to osobna ewidencja każdego projektu i jego dochodu. Urzędy często pytają o szczegóły, dlatego wiele osób najpierw prosi o interpretację podatkową.",
          ],
          sources: [ACTS.pit],
        },
      ],
    },
    {
      id: "zus",
      title: "ZUS na B2B",
      lead: "Na B2B składki płaci się samemu, od zadeklarowanej podstawy, a nie od faktur. Nowa firma przechodzi kilka etapów - im później, tym wyższe składki.",
      sections: [
        {
          title: "Etapy",
          body: [
            [
              `Ulga na start - pierwsze ${r.startReliefMonths} miesięcy bez składek społecznych, płaci się tylko zdrowotną.`,
              `Preferencyjny ZUS - kolejne ${r.preferentialMonths} miesiące od podstawy ${zl(r.preferentialBase)} (30% płacy minimalnej).`,
              `Mały ZUS Plus - gdy przychód z poprzedniego roku nie przekroczył ${zl(r.smallZusRevenueLimit)}; podstawa zależy od dochodu, najwyżej 36 miesięcy w każdych 60.`,
              `Pełny ZUS - od podstawy ${zl(r.fullBase)} (60% prognozowanego przeciętnego wynagrodzenia).`,
            ],
            "Ulga na start i preferencyjny ZUS nie przysługują, gdy firma pracuje dla byłego pracodawcy w tym samym zakresie, co na etacie w tym albo poprzednim roku.",
          ],
          sources: [ACTS.business, ACTS.zus],
        },
        {
          title: "Dobrowolne chorobowe",
          body: [
            `Składka chorobowa na B2B jest dobrowolna (${pc(r.sickness)} podstawy). Bez niej za chorobę nie ma żadnych pieniędzy. Zasiłek przysługuje dopiero po ${r.voluntarySicknessWaitDays} dniach nieprzerwanego opłacania i liczy się od zadeklarowanej podstawy, więc przy minimalnej jest niski.`,
          ],
          sources: [ACTS.sickness, ACTS.zus],
        },
        {
          title: "Wakacje składkowe",
          body: [
            "Raz w roku można nie płacić składek społecznych za jeden wybrany miesiąc (emerytalnej, rentowej, wypadkowej, a przy dobrowolnym chorobowym także chorobowej). Zdrowotną płaci się normalnie.",
            "Wniosek składa się w ZUS w miesiącu przed wybranym miesiącem. Warunki to m.in. najwyżej 10 ubezpieczonych w firmie, przychód do 2 mln euro w jednym z dwóch poprzednich lat i brak pracy dla byłego pracodawcy.",
          ],
          sources: [{ label: "ustawa o systemie ubezpieczeń społecznych art. 17a-17b", url: ACTS.zus.url }],
        },
      ],
    },
    {
      id: "vat",
      title: "VAT",
      lead: "VAT nie jest zarobkiem. Doliczony do faktury trafia do urzędu skarbowego, a kalkulator liczy wszystko na kwotach netto.",
      sections: [
        {
          title: "Czynny podatnik VAT",
          body: [
            `Do kwoty z oferty dolicza się ${pc(r.vatRate)} VAT. Ten VAT oddaje się do urzędu, ale wcześniej odejmuje się od niego VAT z kosztów - laptop za ${zl(615_000)} z VAT kosztuje firmę naprawdę ${zl(500_000)}.`,
            `Auto używane też prywatnie: odlicza się ${pc(r.carVatShare)} VAT, a w kosztach ${pc(r.carCostShare)} wydatków.`,
            "Deklarację JPK_V7M wysyła się i VAT płaci do 25. dnia następnego miesiąca.",
          ],
          sources: [ACTS.vat],
        },
        {
          title: "Klient za granicą",
          body: [
            "Usługi dla firmy z innego kraju zwykle opodatkowuje się tam, gdzie jest klient. Faktura jest bez polskiego VAT, z dopiskiem „odwrotne obciążenie”. VAT z kosztów i tak można odliczyć.",
          ],
          sources: [{ label: "ustawa o VAT art. 28b", url: ACTS.vat.url }],
        },
        {
          title: "Zwolnienie z VAT",
          body: [
            `Do ${zl(r.vatExemptLimit)} sprzedaży w roku można nie być płatnikiem VAT. Wtedy nie dolicza się VAT do faktur, ale też nie odlicza go z kosztów.`,
            "Zwolnienia nie mają m.in. usługi prawnicze, doradcze, jubilerskie i ściągania długów. Przy zwolnieniu VAT zapłacony przy zakupach (np. sprzętu) staje się zwykłym kosztem.",
          ],
          sources: [{ label: "ustawa o VAT art. 113", url: ACTS.vat.url }],
        },
      ],
    },
    {
      id: "ksiegowosc",
      title: "Księgowość",
      lead: "Księgowość można prowadzić samemu albo oddać biuru. Kalkulator przyjmuje 250 zł miesięcznie - kwotę można zmienić w założeniach.",
      sections: [
        {
          title: "Biuro czy samemu",
          body: [
            "Najprościej samemu jest na ryczałcie bez VAT: wystarczy ewidencja przychodów. Na skali i liniowym prowadzi się podatkową księgę przychodów i rozchodów, a przy VAT co miesiąc deklarację JPK_V7M.",
            "Cena biura zależy głównie od liczby dokumentów w miesiącu, formy podatku, tego, czy firma płaci VAT, i od zatrudnionych osób. Koszt biura można wpisać w koszty firmy.",
          ],
          sources: [ACTS.pit, ACTS.ryczalt],
        },
      ],
    },
    {
      id: "uwaga",
      title: "Na co uważać",
      lead: "Pułapki, przez które B2B wychodzi gorzej, niż pokazywała kartka z ofertą.",
      sections: [
        {
          title: "B2B u byłego pracodawcy",
          body: [
            "Gdy na B2B robi się dla byłego pracodawcy to samo, co na etacie, przepadają: liniowy (przy pracy w tym roku), ryczałt, ulga na start, preferencyjny ZUS i Mały ZUS Plus (przy pracy w tym albo poprzednim roku). Podatek liczy się wtedy na skali, a przy liniowym trzeba dopłacić zaliczki wstecz z odsetkami.",
          ],
          sources: [
            { label: "ustawa o PIT art. 9a ust. 3", url: ACTS.pit.url },
            { label: "ustawa o ryczałcie art. 8 ust. 2", url: ACTS.ryczalt.url },
            { label: "Prawo przedsiębiorców art. 18", url: ACTS.business.url },
          ],
        },
        {
          title: "Pozorne samozatrudnienie",
          body: [
            "Jeśli praca wygląda jak etat (stałe godziny, przełożony, praca pod kierownictwem i w miejscu wskazanym przez firmę), to według Kodeksu pracy jest to umowa o pracę, niezależnie od nazwy umowy. Zastąpienie etatu umową cywilną przy tych samych warunkach jest niedopuszczalne.",
          ],
          sources: [{ label: "Kodeks pracy art. 22 § 1¹ i § 1²", url: ACTS.labour.url }],
        },
        {
          title: "Urlop, choroba i przerwy w zleceniach",
          body: [
            "Na B2B urlop jest płatny tylko wtedy, gdy zapisano go w umowie. Za chorobę płaci ZUS, i to tylko przy dobrowolnym chorobowym. Przerwa między zleceniami to miesiące bez faktury, a składki płaci się dalej.",
          ],
          sources: [ACTS.sickness],
        },
        {
          title: "Terminy i odsetki",
          body: [
            "Składki ZUS i zaliczkę na podatek płaci się do 20. dnia następnego miesiąca, VAT do 25. Spóźnienie kosztuje odsetki za zwłokę. Zakładka „Rok” pokazuje wszystkie terminy.",
            "Zdrowotną na skali, liniowym i ryczałcie rozlicza się raz w roku - w deklaracji ZUS za kwiecień (do 20 maja). Przy wyższym dochodzie niż zaliczki trzeba wtedy dopłacić.",
          ],
          sources: [ACTS.zus, { label: "ustawa o świadczeniach opieki zdrowotnej art. 81 ust. 2k-2l", url: ACTS.health.url }],
        },
        {
          title: "Limit ryczałtu",
          body: [
            `Przychód powyżej ${zl(r.ryczaltLimit)} w roku zamyka drogę do ryczałtu na następny rok.`,
          ],
          sources: [ACTS.ryczalt],
        },
      ],
    },
    {
      id: "firma",
      title: "Założenie i codzienność firmy",
      lead: "Jednoosobową firmę zakłada się przez internet, bez opłat.",
      sections: [
        {
          title: "Założenie",
          body: [
            [
              "Wniosek w CEIDG - w nim kody PKD (rodzaje działalności), forma podatku, zgłoszenie do ZUS i VAT.",
              "Ulga na start działa sama - żeby z niej zrezygnować, trzeba zgłosić się do ubezpieczeń społecznych.",
              "Zgłoszenie do VAT (VAT-R) można dołączyć do wniosku albo złożyć osobno, przed pierwszą sprzedażą z VAT.",
            ],
          ],
          sources: [PAGES.ceidg, { label: "Prawo przedsiębiorców art. 18", url: ACTS.business.url }],
        },
        {
          title: "Codzienność",
          body: [
            "Konto firmowe: płatności z innymi firmami powyżej 15 000 zł muszą iść przez rachunek. Do tego warto mieć osobne konto, żeby pieniądze firmy nie mieszały się z prywatnymi.",
            "Faktury dla firm wystawia się w Krajowym Systemie e-Faktur (KSeF). Od kiedy obowiązkowo, zależy od wielkości firmy - szczegóły na stronie Ministerstwa Finansów.",
            "Co miesiąc: faktura, składki ZUS i zaliczka na podatek do 20., VAT do 25. Raz w roku: zeznanie do 30 kwietnia i roczne rozliczenie zdrowotnej do 20 maja.",
            `Sprzęt do ${zl(r.fixedAssetLimit)} netto można od razu wpisać w koszty, droższy się amortyzuje.`,
          ],
          sources: [{ label: "Prawo przedsiębiorców art. 19", url: ACTS.business.url }, PAGES.ksef, ACTS.pit],
        },
      ],
    },
    {
      id: "uop",
      title: "Umowa o pracę",
      lead: "Na etacie większością spraw zajmuje się pracodawca. Warto znać kilka rzeczy, które zmieniają pensję albo bezpieczeństwo.",
      sections: [
        {
          title: "PIT-2 i PPK",
          body: [
            `PIT-2 to oświadczenie dla pracodawcy - dzięki niemu co miesiąc pobiera mniej podatku (o ${zl(Math.round(r.taxReduction / 12))}). Bez niego ta kwota wraca dopiero w zeznaniu rocznym.`,
            `PPK jest domyślne: pracownik wpłaca ${pc(r.ppkEmployee)}, pracodawca ${pc(r.ppkEmployer)} pensji. Z PPK można zrezygnować deklaracją u pracodawcy, ale co kilka lat pracodawca zapisuje wszystkich ponownie.`,
          ],
          sources: [ACTS.pit, ACTS.ppk],
        },
        {
          title: "Urlop, choroba, wypowiedzenie",
          body: [
            "Urlop: 20 dni rocznie, a po 10 latach pracy 26 dni (do stażu liczy się m.in. szkoła).",
            `Choroba: przez pierwsze ${r.sickPayEmployerDays} dni w roku płaci pracodawca, potem ZUS - zwykle 80% pensji.`,
            "Wypowiedzenie: 2 tygodnie przy pracy krótszej niż 6 miesięcy, miesiąc po 6 miesiącach, 3 miesiące po 3 latach u tego pracodawcy.",
          ],
          sources: [ACTS.labour, ACTS.sickness],
        },
        {
          title: "Zdolność kredytowa",
          body: [
            "Banki najłatwiej liczą zdolność przy umowie o pracę. Przy B2B zwykle chcą zobaczyć, jak długo działa firma i jakie ma dochody w zeznaniach - przed zmianą umowy warto zapytać w banku, jeśli planuje się kredyt.",
          ],
          sources: [PAGES.podatki],
        },
      ],
    },
  ];
}
