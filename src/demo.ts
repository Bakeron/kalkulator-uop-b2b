/**
 * The website demo (`npm run build:demo`, vite mode "demo"). Rules of the demo (shared app decisions,
 * "Tryb demo"): nothing is kept between visits - a reload brings back the defaults - and features that
 * need the desktop app say "W wersji demonstracyjnej nie działa - w prawdziwej aplikacji tak".
 */
export const IS_DEMO = import.meta.env.MODE === "demo";

export const DEMO_NOTE = "W wersji demonstracyjnej nie działa - w prawdziwej aplikacji tak";
