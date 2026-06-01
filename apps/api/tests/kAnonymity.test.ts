/**
 * k-anonymity gate tests. This is the core privacy invariant: no aggregate
 * representing fewer than k contributing students may ever reach a client.
 * The gateway re-applies this filter as defence-in-depth even though the
 * mining service enforces it at the SQL layer.
 */

import { filterByKAnonymity, meetsKAnonymity } from "../src/lib/kAnonymity.js";

const K = 10;

interface Combo {
  courseA: string;
  courseB: string;
  nStudents: number;
}

describe("filterByKAnonymity", () => {
  it("drops aggregates with fewer than k contributing students", () => {
    const combos: Combo[] = [
      { courseA: "CSC201", courseB: "CSC301", nStudents: 15 },
      { courseA: "MAT101", courseB: "PHY101", nStudents: 9 },
      { courseA: "CHM101", courseB: "BIO101", nStudents: 10 },
    ];

    const result = filterByKAnonymity(combos, K);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.courseA)).toEqual(["CSC201", "CHM101"]);
    expect(result.some((c) => c.nStudents < K)).toBe(false);
  });

  it("returns an empty array when no cohort meets the threshold", () => {
    const combos: Combo[] = [
      { courseA: "A", courseB: "B", nStudents: 1 },
      { courseA: "C", courseB: "D", nStudents: 9 },
    ];
    expect(filterByKAnonymity(combos, K)).toEqual([]);
  });

  it("keeps every cohort when all meet the threshold", () => {
    const combos: Combo[] = [
      { courseA: "A", courseB: "B", nStudents: 10 },
      { courseA: "C", courseB: "D", nStudents: 100 },
    ];
    expect(filterByKAnonymity(combos, K)).toHaveLength(2);
  });
});

describe("meetsKAnonymity", () => {
  it("is inclusive at exactly k", () => {
    expect(meetsKAnonymity(10, 10)).toBe(true);
  });

  it("rejects one below k", () => {
    expect(meetsKAnonymity(9, 10)).toBe(false);
  });
});
