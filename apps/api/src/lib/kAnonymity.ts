// Defence-in-depth k-anonymity gate. The mining service already enforces the
// k-threshold at the SQL layer, but the gateway re-checks every aggregate it
// forwards so a misconfigured or compromised mining service can never leak a
// cohort smaller than k. Keeping this logic in one tested place means the core
// privacy invariant lives somewhere a unit test can pin it down.

/** Drop any aggregate whose contributing-student count is below the threshold. */
export function filterByKAnonymity<T extends { nStudents: number }>(
  items: readonly T[],
  threshold: number
): T[] {
  return items.filter((item) => meetsKAnonymity(item.nStudents, threshold));
}

/** True when a cohort is large enough to be exposed. */
export function meetsKAnonymity(nStudents: number, threshold: number): boolean {
  return nStudents >= threshold;
}
