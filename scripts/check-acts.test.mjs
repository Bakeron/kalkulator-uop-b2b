// Tests of the daily act check (node --test scripts/). No network - only the pure functions.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  topicsOf,
  daysAgo,
  eliOf,
  issueTitle,
  issueBody,
  plain,
  publishedSince,
  newRelevantActs,
} from "./check-acts.mjs";

const pitAct = {
  ELI: "DU/2026/1541",
  address: "WDU20260001541",
  displayAddress: "Dz.U. 2026 poz. 1541",
  publisher: "DU",
  year: 2026,
  pos: 1541,
  promulgation: "2026-11-24",
  entryIntoForce: "2027-01-01",
  title:
    "Ustawa z dnia 22 października 2026 r. o zmianie ustawy o podatku dochodowym od osób fizycznych oraz ustawy o zryczałtowanym podatku dochodowym",
  keywords: ["podatek dochodowy"],
};
const gusAct = {
  ELI: "MP/2026/1161",
  displayAddress: "M.P. 2026 poz. 1161",
  publisher: "MP",
  year: 2026,
  pos: 1161,
  promulgation: "2026-11-20",
  title: "Obwieszczenie Prezesa GUS w sprawie przeciętnego miesięcznego wynagrodzenia brutto w gospodarce narodowej",
};
const otherAct = {
  ELI: "DU/2026/1544",
  publisher: "DU",
  year: 2026,
  pos: 1544,
  promulgation: "2026-11-23",
  title: "Rozporządzenie w sprawie szczegółowego zakresu działania Ministra Funduszy i Polityki Regionalnej",
  keywords: ["organizacja i zakres działania"],
};

test("topicsOf finds the topics in the title and the keywords", () => {
  assert.deepEqual(topicsOf(pitAct), ["PIT", "ryczałt"]);
  assert.deepEqual(topicsOf(gusAct), ["przeciętne wynagrodzenie"]);
  assert.deepEqual(topicsOf(otherAct), []);
  assert.deepEqual(topicsOf({ title: "Rozporządzenie", keywords: ["minimalne wynagrodzenie za pracę"] }), ["płaca minimalna"]);
  assert.deepEqual(topicsOf({}), []);
});

test("daysAgo counts back in UTC, across a year", () => {
  assert.equal(daysAgo(new Date("2027-01-05T23:30:00Z"), 10), "2026-12-26");
  assert.equal(daysAgo(new Date("2026-11-24T00:00:00Z"), 0), "2026-11-24");
});

test("eliOf uses the ELI field or builds it", () => {
  assert.equal(eliOf(pitAct), "DU/2026/1541");
  assert.equal(eliOf({ publisher: "MP", year: 2026, pos: 7 }), "MP/2026/7");
  assert.equal(eliOf({ ELI: "../evil", publisher: "DU", year: 2026, pos: 1 }), "DU/2026/1");
});

test("issue title carries the ELI id used for deduplication", () => {
  assert.equal(issueTitle(pitAct), "Nowy akt - sprawdź stawki: Dz.U. 2026 poz. 1541 (DU/2026/1541)");
});

test("plain removes mentions, HTML and backticks and limits the length", () => {
  assert.equal(plain("<b>Hi</b> @user `x`"), "bHi/b @​user x");
  assert.equal(plain("a  \n b"), "a b");
  assert.equal(plain("x".repeat(700)).length, 600);
  assert.equal(plain(undefined), "");
});

test("issue body has the topics, dates and links", () => {
  const body = issueBody(pitAct, ["PIT", "ryczałt"]);
  assert.match(body, /Dotyczy: PIT, ryczałt/);
  assert.match(body, /Ogłoszony: 2026-11-24, wchodzi w życie: 2027-01-01/);
  assert.match(body, /https:\/\/api\.sejm\.gov\.pl\/eli\/acts\/DU\/2026\/1541\/text\.pdf/);
  assert.match(body, /DocDetails\.xsp\?id=WDU20260001541/);
  assert.match(issueBody(gusAct, ["x"]), /wchodzi w życie: -/);
});

test("publishedSince keeps acts published on the day or later", () => {
  const acts = [pitAct, gusAct, otherAct, { title: "bez daty" }];
  assert.deepEqual(
    publishedSince(acts, "2026-11-23").map((a) => a.title),
    [pitAct.title, otherAct.title, "bez daty"],
  );
});

test("newRelevantActs skips irrelevant acts, duplicates and acts with an issue", () => {
  const found = newRelevantActs([pitAct, otherAct, gusAct, pitAct], ["Nowy akt - sprawdź stawki: M.P. 2026 poz. 1161 (MP/2026/1161)"]);
  assert.equal(found.length, 1);
  assert.equal(found[0].act, pitAct);
  assert.deepEqual(found[0].topics, ["PIT", "ryczałt"]);
});
