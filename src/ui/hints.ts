/**
 * Texts of the "?" hints (plan A11, assumption A1 "Dymki „?” przy każdym pojęciu"): plain words,
 * amounts from the rates of the chosen year, almost every one with a link to its act.
 */
import { formatZl, type Bp, type Money } from "../calc/money";
import type { Rates } from "../calc/rates";
import { ACTS } from "./guide";
import type { HintText } from "./Hint";

const zl = (m: Money) => formatZl(m, m % 100 !== 0);
const pc = (b: Bp) => `${(b / 100).toLocaleString("pl-PL")}%`;
const more = (label: string, url: string) => ({ label, url });

/** ZUS report "Absencja chorobowa w 2025 roku" - average sick days per insured person. */
export const ZUS_SICK_REPORT = {
  average: "14,76",
  url: "https://www.zus.pl/documents/10182/39590/Raport+Absencja+chorobowa+w+2025+roku.pdf",
};

/** The two amounts at the top - the same in every year. */
export const MAIN_HINTS = {
  uopGross: {
    text: "Brutto to kwota z umowy o pracę przed składkami i podatkiem. Na konto wpływa mniej, a pracodawca płaci więcej - dolicza swoje składki.",
    more: more("Kodeks pracy", ACTS.labour.url),
  },
  b2bRate: {
    text: "Kwota z faktury bez VAT - tak zwykle podaje się stawki B2B. Z niej płaci się ZUS, zdrowotną, podatek i koszty firmy. VAT doliczony do faktury oddaje się do urzędu.",
    more: more("ustawa o VAT", ACTS.vat.url),
  },
  known: {
    text: "Znasz tylko jedną ofertę? Wybierz ją, a drugą kwotę kalkulator wyliczy: tyle samo na rękę przez cały rok (z urlopem i chorobą) i do tego te same korzyści - PPK od Ciebie i od pracodawcy oraz benefity z umowy o pracę. Składek emerytalnych nie wlicza - ich różnicę pokazuje osobno.",
    more: more("ustawa o PPK", ACTS.ppk.url),
  },
} satisfies Record<string, HintText>;

export function hints(r: Rates) {
  const [child1, , child3, child4] = r.childRelief;
  return {
    ppk: {
      text: `PPK to oszczędzanie na emeryturę: pracownik wpłaca ${pc(r.ppkEmployee)} pensji, pracodawca ${pc(r.ppkEmployer)}. Wpłata pracodawcy jest dla pracownika przychodem, więc trochę podnosi podatek. Pieniądze są prywatne, a wypłata przed 60. rokiem życia jest możliwa, ale z potrąceniami.`,
      more: more("ustawa o PPK", ACTS.ppk.url),
    },
    commuter: {
      text: `Koszty pracy odejmuje się od pensji przed podatkiem: ${zl(r.employeeCosts)} miesięcznie, a przy dojazdach z innej miejscowości ${zl(r.employeeCostsCommuter)} (gdy nie ma dodatku za rozłąkę). Wystarczy oświadczenie dla pracodawcy.`,
      more: more("ustawa o PIT art. 22 ust. 2 pkt 1 i 3", ACTS.pit.url),
    },
    authors: {
      text: `Przy pracy twórczej (np. programowaniu) od części pensji liczy się koszty 50% zamiast zwykłych. Pensja i praca są te same, mniejszy jest tylko podatek. Warunek to zapis w umowie i ewidencja utworów u pracodawcy. Limit tych kosztów to ${zl(r.authorsCostsLimit)} w roku.`,
      more: more("ustawa o PIT art. 22 ust. 9 pkt 3 i ust. 9a", ACTS.pit.url),
    },
    creativePercent: {
      text: "Jaka część czasu pracy to praca twórcza. Koszty 50% liczy się tylko od tej części pensji - zwykle tyle, ile zapisano w umowie.",
      more: more("ustawa o PIT art. 22 ust. 9 pkt 3", ACTS.pit.url),
    },
    zeroPit: {
      text: `Zwolnienie z podatku przychodu do ${zl(r.zeroPitLimit)} w roku dla osób do 26 lat, wracających z zagranicy (przez 4 lata), rodziców co najmniej czworga dzieci i pracujących po wieku emerytalnym. Składki ZUS i zdrowotną płaci się normalnie.`,
      more: more("ustawa o PIT art. 21 ust. 1 pkt 148 i 152-154", ACTS.pit.url),
    },
    benefits: {
      text: "Benefity na umowie o pracę (karta sportowa, opieka medyczna, premia, trzynastka) dolicza się do przychodu - płaci się od nich podatek i zwykle składki. Na B2B ich nie ma albo płaci się za nie samemu.",
      more: more("ustawa o PIT art. 12", ACTS.pit.url),
    },
    form: {
      text: "Jak liczy się podatek na B2B. Kalkulator liczy wszystkie formy i może sam wybrać najkorzystniejszą. Porównanie form jest w zakładce „Co warto wiedzieć”.",
      more: more("ustawa o PIT art. 9a", ACTS.pit.url),
    },
    ryczaltRate: {
      text: "Stawka ryczałtu zależy od tego, co dokładnie robi firma. Programowanie i doradztwo w IT to zwykle 12%, ale inne usługi mają inne stawki - w razie wątpliwości warto zapytać urząd skarbowy.",
      more: more("ustawa o ryczałcie art. 12", ACTS.ryczalt.url),
    },
    ipBox: {
      text: `Jaka część dochodu pochodzi z praw do programów, które się tworzy (po przemnożeniu przez wskaźnik nexus). Od tej części podatek ${pc(r.ipBoxRate)}, od reszty jak na skali albo liniowym.`,
      more: more("ustawa o PIT art. 30ca", ACTS.pit.url),
    },
    startDate: {
      text: "Od tej daty liczą się etapy ZUS (ulga na start, preferencyjny ZUS) i to, od kiedy są faktury.",
    },
    startRelief: {
      text: `Przez ${r.startReliefMonths} miesięcy od założenia pierwszej firmy można nie płacić składek społecznych - płaci się tylko zdrowotną. Nie przysługuje przy pracy dla byłego pracodawcy w tym samym zakresie.`,
      more: more("Prawo przedsiębiorców art. 18", ACTS.business.url),
    },
    preferential: {
      text: `Przez ${r.preferentialMonths} miesiące po uldze na start składki społeczne liczy się od niższej podstawy ${zl(r.preferentialBase)} (30% płacy minimalnej).`,
      more: more("ustawa o systemie ubezpieczeń społecznych art. 18a", ACTS.zus.url),
    },
    smallZusPlus: {
      text: `Gdy przychód z firmy w poprzednim roku nie przekroczył ${zl(r.smallZusRevenueLimit)}, składki można liczyć od podstawy zależnej od dochodu. Najwyżej 36 miesięcy w każdych 60 miesiącach działalności.`,
      more: more("ustawa o systemie ubezpieczeń społecznych art. 18c", ACTS.zus.url),
    },
    voluntarySickness: {
      text: `Na B2B ubezpieczenie chorobowe jest dobrowolne (${pc(r.sickness)} podstawy). Bez niego za chorobę nie ma żadnych pieniędzy. Zasiłek przysługuje dopiero po ${r.voluntarySicknessWaitDays} dniach opłacania.`,
      more: more("ustawa zasiłkowa art. 4", ACTS.sickness.url),
    },
    contributionHoliday: {
      text: "Raz w roku można nie płacić składek społecznych za jeden miesiąc - zdrowotną płaci się normalnie. Wniosek składa się w ZUS w miesiącu wcześniej. Dla firm do 10 osób, bez pracy dla byłego pracodawcy.",
      more: more("ustawa o systemie ubezpieczeń społecznych art. 17a", ACTS.zus.url),
    },
    formerEmployer: {
      text: "Praca na B2B dla byłego pracodawcy przy tym samym, co na etacie, zamyka liniowy (w tym roku), ryczałt, ulgę na start, preferencyjny ZUS i Mały ZUS Plus (w tym i poprzednim roku). Podatek liczy się wtedy na skali.",
      more: more("ustawa o PIT art. 9a ust. 3", ACTS.pit.url),
    },
    clients: {
      text: "Jeden klient to więcej ryzyka: koniec zlecenia oznacza brak przychodu. Gdy praca wygląda jak etat, urząd albo sąd może uznać ją za umowę o pracę.",
      more: more("Kodeks pracy art. 22", ACTS.labour.url),
    },
    vat: {
      text: `Czynny podatnik VAT dolicza ${pc(r.vatRate)} do faktury i oddaje go do urzędu, odejmując VAT z kosztów. Klient z zagranicy dostaje fakturę bez polskiego VAT. Do ${zl(r.vatExemptLimit)} sprzedaży w roku można być zwolnionym - wtedy VAT z kosztów jest zwykłym kosztem.`,
      more: more("ustawa o VAT art. 113", ACTS.vat.url),
    },
    vacation: {
      text: "Na umowie o pracę przysługuje 20 dni urlopu, a po 10 latach pracy 26 dni. Do stażu liczy się m.in. szkoła.",
      more: more("Kodeks pracy art. 154", ACTS.labour.url),
    },
    paidDaysOff: {
      text: "Dni wolne, za które klient płaci mimo braku pracy - tylko gdy zapisano je w umowie B2B. Pozostałe dni wolne są bez faktury.",
    },
    sickDays: {
      text: `Ile dni zwolnienia lekarskiego przyjąć w roku. Domyślne 10 dni to założenie kalkulatora - według ZUS w 2025 r. przeciętnie wyszło ${ZUS_SICK_REPORT.average} dnia na jednego ubezpieczonego. Na umowie o pracę za chorobę dostaje się 80% albo 100% pensji, na B2B tylko zasiłek z dobrowolnego chorobowego.`,
      more: more("ZUS - Absencja chorobowa w 2025 roku", ZUS_SICK_REPORT.url),
    },
    sickKind: {
      text: "100% przysługuje za chorobę w ciąży i po wypadku w drodze do pracy lub z pracy. W innych przypadkach, także w szpitalu, 80%.",
      more: more("ustawa zasiłkowa art. 11", ACTS.sickness.url),
    },
    over50: {
      text: `Od roku po tym, w którym kończy się 50 lat, pracodawca płaci tylko za ${r.sickPayEmployerDaysOver50} dni choroby w roku (zamiast ${r.sickPayEmployerDays}), potem płaci ZUS.`,
      more: more("Kodeks pracy art. 92", ACTS.labour.url),
    },
    joint: {
      text: "Przy wspólnym rozliczeniu podatek liczy się od połowy wspólnych dochodów i mnoży przez 2. Opłaca się, gdy jedno z małżonków zarabia dużo więcej. Na B2B działa tylko na skali.",
      more: more("ustawa o PIT art. 6 ust. 2", ACTS.pit.url),
    },
    children: {
      text: `Ulga na dzieci rocznie: ${zl(child1 ?? 0)} na pierwsze i drugie dziecko, ${zl(child3 ?? 0)} na trzecie, ${zl(child4 ?? 0)} na czwarte i każde następne. Przy jednym dziecku obowiązuje limit dochodu. Na B2B tylko na skali.`,
      more: more("ustawa o PIT art. 27f", ACTS.pit.url),
    },
    job: {
      text: `Przy dwóch umowach o pracę podatek z obu sumuje się w zeznaniu rocznym. Koszty pracy liczy się u każdego pracodawcy, ale w roku razem najwyżej ${zl(r.employeeCostsMultiLimit)}.`,
      more: more("ustawa o PIT art. 22 ust. 2 pkt 2", ACTS.pit.url),
    },
    zlecenie: {
      text: "Zlecenie u własnego pracodawcy liczy się jak pensję - z pełnymi składkami. U kogoś innego, gdy pensja z etatu wynosi co najmniej płacę minimalną, ze zlecenia płaci się tylko zdrowotną, chyba że wybierze się dobrowolne składki społeczne.",
      more: more("ustawa o systemie ubezpieczeń społecznych art. 9", ACTS.zus.url),
    },
    dzielo: {
      text: `Umowa o dzieło jest bez składek ZUS i zdrowotnej. Koszty to ${pc(r.civilCostsRate)} przychodu, a przy przeniesieniu praw autorskich 50%.`,
      more: more("ustawa o PIT art. 22 ust. 9", ACTS.pit.url),
    },
    sideBusiness: {
      text: "Firma obok etatu: przy pensji co najmniej minimalnej składki społeczne z firmy są dobrowolne, zdrowotna jest obowiązkowa. Kalkulator liczy tę firmę na skali.",
      more: more("ustawa o systemie ubezpieczeń społecznych art. 9", ACTS.zus.url),
    },
  } satisfies Record<string, HintText>;
}

export type HintKey = keyof ReturnType<typeof hints>;
