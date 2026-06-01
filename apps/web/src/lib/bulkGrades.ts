// Pure parser for the bulk-paste grade importer. Kept free of React/DOM so it
// can be unit-tested directly. Each input line is "CODE, GRADE, SEMESTER, YEAR"
// (comma- or tab-delimited); header rows, comments (#), and blanks are skipped.

export interface ParsedRow {
  rowIndex: number;
  rawLine: string;
  courseCode: string;
  courseId: string | undefined;
  grade: string;
  semester: number;
  academicYear: number;
  error: string | undefined;
}

const HEADER_PATTERN = /^(course|code|subject)/i;

export function parseBulkText<C extends { id: string }>(
  text: string,
  coursesByCode: Map<string, C>
): ParsedRow[] {
  const results: ParsedRow[] = [];

  text.split("\n").forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || HEADER_PATTERN.test(line)) return;

    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const courseCode = (parts[0] ?? "").toUpperCase();
    const grade = parts[1] ?? "";
    const semStr = parts[2] ?? "";
    const yearStr = parts[3] ?? "";

    let error: string | undefined;
    let courseId: string | undefined;

    if (!courseCode) {
      error = "Missing course code";
    } else if (!grade) {
      error = "Missing grade";
    } else {
      const semester = parseInt(semStr, 10);
      const academicYear = parseInt(yearStr, 10);

      if (isNaN(semester) || (semester !== 1 && semester !== 2)) {
        error = "Semester must be 1 or 2";
      } else if (isNaN(academicYear) || academicYear < 2000 || academicYear > 2100) {
        error = "Year must be between 2000 and 2100";
      } else {
        const course = coursesByCode.get(courseCode);
        if (!course) {
          error = `Course '${courseCode}' not found`;
        } else {
          courseId = course.id;
        }
      }

      results.push({
        rowIndex: i,
        rawLine,
        courseCode,
        courseId,
        grade,
        semester: isNaN(semester) ? 0 : semester,
        academicYear: isNaN(academicYear) ? 0 : academicYear,
        error,
      });
      return;
    }

    results.push({
      rowIndex: i,
      rawLine,
      courseCode,
      courseId,
      grade,
      semester: 0,
      academicYear: 0,
      error,
    });
  });

  return results;
}
