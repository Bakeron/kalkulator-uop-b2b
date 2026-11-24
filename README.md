# Kalkulator UoP i B2B

[English summary below](#in-english)

Kalkulator, który porównuje umowę o pracę z B2B. Pokazuje, ile naprawdę zostaje po uwzględnieniu urlopu, chorobowego i ZUS-u.

**Stan:** w budowie. Moduł obliczeń z testami jest gotowy dla przepisów 2026 i 2027. Ekran główny powstaje, a po nim demo w przeglądarce i wersja na Androida.

## Co umie

- Porównuje umowę o pracę i B2B dla tej samej osoby, w roku 2026 albo 2027.
- Na umowie o pracę liczy urlop, chorobowe, PPK, koszty autorskie i dodatki od pracodawcy.
- Na B2B liczy skalę, podatek liniowy, ryczałt i IP Box. Uwzględnia etapy ZUS od ulgi na start do pełnych składek, VAT i koszty firmy, także samochód.
- Szuka stawki B2B, przy której zostaje tyle samo co na etacie, i odwrotnie.
- Liczy kilka umów naraz, np. dwie umowy o pracę, zlecenie, dzieło albo B2B obok etatu. Uwzględnia też ulgę na dzieci.
- Pokazuje każdy miesiąc osobno, bo progi podatkowe i limit składek zmieniają wynik w ciągu roku.
- Przy każdej stawce ma źródło i status, np. „pewne”, „uchwalone” albo „projekt”. Zmiany, które jeszcze nie weszły w życie, można włączyć osobno.

## Skąd są stawki

Kwoty i stawki leżą w plikach `src/rates/2026.json` i `src/rates/2027.json`, każda z odnośnikiem do aktu prawnego i datą sprawdzenia. Gotowego API ze stawkami podatków i ZUS nie ma, dlatego raz dziennie automat na GitHubie pyta [API aktów prawnych Sejmu](https://api.sejm.gov.pl/eli_pl.html) o nowe akty w Dzienniku Ustaw i Monitorze Polskim. Gdy pojawi się akt o podatku dochodowym, ZUS, składce zdrowotnej, płacy minimalnej albo VAT, automat zakłada zgłoszenie „Nowy akt - sprawdź stawki”. Dzięki temu zmiana przepisów trafia do pliku stawek, zanim zauważy ją użytkownik.

## Uwaga

To symulacja, nie porada podatkowa. Obliczenia odtwarzają przepisy dokładnie, nie w przybliżeniu, ale przed decyzją warto sprawdzić je z księgowym.

## Prywatność

Kwoty wpisane w kalkulatorze zostają na urządzeniu. Aplikacja nie ma analityki ani reklam.

## Instalacja

Instalator `.exe` na Windows 10/11 powstaje poleceniem `npm run tauri build` (opis niżej). Gotowe wydania do pobrania pojawią się na GitHubie.

> Aplikacja nie ma jeszcze płatnego podpisu cyfrowego, dlatego Windows (SmartScreen) albo antywirus (np. Avast) mogą przy pierwszym uruchomieniu sprawdzać ją przez kilka sekund albo pokazać ostrzeżenie. To normalne dla nowych, mało znanych programów.

Ta sama informacja jest na pierwszej stronie instalatora, z polem „Rozumiem”. Przy ostrzeżeniu SmartScreen instalację uruchamia się przyciskiem „Więcej informacji”, a potem „Uruchom mimo to”.

## Uruchomienie

Do zbudowania potrzebne są Windows 10/11, [Node.js](https://nodejs.org/) 24, [Rust](https://rustup.rs/) i Visual Studio Build Tools (C++).

```
npm install
npm run dev                       # sam interfejs w przeglądarce, http://localhost:1420
npm run tauri dev                 # aplikacja na Windows
npm test                          # testy obliczeń
npm run coverage                  # testy z pokryciem modułu obliczeń
node --test "scripts/*.test.mjs"  # testy automatu sprawdzającego nowe akty
npm run tauri build               # instalator w src-tauri/target/release/bundle/nsis
```

## Technologie

Tauri 2, React, TypeScript i Vitest. Obliczenia to osobny moduł bez interfejsu (`src/calc`), w pełni pokryty testami. Kwoty są liczone w groszach, żeby uniknąć błędów zaokrągleń. Testy idą na GitHubie po każdej zmianie.

## Jak powstało z Claude Code

Cały kod napisał [Claude Code](https://claude.com/claude-code), a ja ustalałem założenia, pilnowałem testów i sprawdzałem każdą zmianę.

- **Najpierw założenia** - zanim powstał kod, spisałem pytania i odpowiedzi o przepisach, zakresie i wyglądzie. Każdą stawkę Claude Code sprawdzał w aktach prawnych i opisywał źródłem.
- **Potem kod partiami** - każda porcja pracy kończy się testami, a zmiana wyglądu zrzutem ekranu w trybie jasnym i ciemnym.
- **Testy jako warunek** - moduł obliczeń ma pokrycie testami 100%, sprawdzane na GitHubie.
- **Audyty** - okresowo sprawdzam dostępność i kontrast, teksty, zależności i bezpieczeństwo. Poprawki z nich trafiają do zwykłych commitów.

Notatki z założeniami i plan pracy leżą poza repozytorium.

## Licencja

Kod jest na licencji [MIT](LICENSE).

Czcionki mają własne licencje.

- **Atkinson Hyperlegible Next** (tekst) - [SIL Open Font License 1.1](https://openfontlicense.org/), pakiet [`@fontsource/atkinson-hyperlegible-next`](https://www.npmjs.com/package/@fontsource/atkinson-hyperlegible-next).
- **osifont** (cyfry na podziałkach, pismo techniczne wg ISO 3098) - [GNU LGPL 3 z wyjątkiem dla czcionek](https://github.com/hikikomori82/osifont), plik `src/assets/fonts/osifont-lgpl3fe.woff`.

---

## In English

Kalkulator UoP i B2B is a desktop calculator that compares a Polish employment contract (UoP) with a B2B contract under the 2026 and 2027 tax and social security rules.

- It counts paid leave, sick leave, social security (ZUS), health insurance and tax brackets month by month.
- It covers all four B2B tax forms, ZUS relief stages, VAT and business costs.
- It finds the B2B rate that gives the same net income as a given salary, and the other way round.
- Every rate has a source and a status. A daily GitHub workflow watches the Sejm legal acts API and opens an issue when a relevant act is published.

Tech: Tauri 2, React, TypeScript, Vitest (calculation module with 100% coverage). Work in progress, Windows first, Android and a web demo later. The app is in Polish and the full description is above. MIT license.
