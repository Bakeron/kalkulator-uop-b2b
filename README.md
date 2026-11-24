# Kalkulator UoP i B2B

[English summary below](#in-english)

Kalkulator, który porównuje umowę o pracę z B2B. Pokazuje, ile naprawdę zostaje po uwzględnieniu urlopu, chorobowego i ZUS-u.

**Stan:** w budowie. Najpierw powstaje moduł obliczeń z testami (polskie przepisy 2026 i 2027), potem ekran główny, demo w przeglądarce i instalator na Windows.

## Uruchomienie

```
npm install
npm test           # testy obliczeń
npm run coverage   # testy z pokryciem modułu obliczeń
npm run tauri dev  # aplikacja na Windows (wymaga Rusta)
```

## Technologie

Tauri 2, React, TypeScript, Vitest. Obliczenia to osobny moduł bez interfejsu (`src/calc`), kwoty w groszach.

## Uwaga

To symulacja, nie porada podatkowa. Obliczenia odtwarzają przepisy dokładnie, nie w przybliżeniu, ale przed decyzją sprawdź je z księgowym.

## Licencja

MIT

---

## In English

A desktop and Android calculator (Tauri 2, React, TypeScript) that compares a Polish employment contract (UoP) with a B2B contract under the 2026 and 2027 tax and social security rules. Work in progress: the calculation module with unit tests comes first. Polish only. MIT license.
