import { describe, it, expect } from "vitest";
import { parseBulkText } from "./bulkGrades.ts";

interface TestCourse {
  id: string;
  code: string;
}

const courses = new Map<string, TestCourse>([
  ["CSC201", { id: "c-201", code: "CSC201" }],
  ["CSC301", { id: "c-301", code: "CSC301" }],
]);

describe("parseBulkText", () => {
  it("skips blank lines, comments, and header rows", () => {
    const text = ["# a comment", "", "Course, Grade, Semester, Year", "  "].join("\n");
    expect(parseBulkText(text, courses)).toEqual([]);
  });

  it("parses a fully valid comma-delimited row and resolves courseId", () => {
    const rows = parseBulkText("CSC201, A, 1, 2024", courses);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      courseCode: "CSC201",
      courseId: "c-201",
      grade: "A",
      semester: 1,
      academicYear: 2024,
      error: undefined,
    });
  });

  it("parses tab-delimited rows", () => {
    const rows = parseBulkText("CSC301\tB\t2\t2023", courses);
    expect(rows[0]).toMatchObject({
      courseCode: "CSC301",
      courseId: "c-301",
      grade: "B",
      semester: 2,
      academicYear: 2023,
      error: undefined,
    });
  });

  it("uppercases the course code before lookup", () => {
    const rows = parseBulkText("csc201, A, 1, 2024", courses);
    expect(rows[0]?.courseCode).toBe("CSC201");
    expect(rows[0]?.courseId).toBe("c-201");
  });

  it("flags a missing course code", () => {
    const rows = parseBulkText(", A, 1, 2024", courses);
    expect(rows[0]?.error).toBe("Missing course code");
  });

  it("flags a missing grade", () => {
    const rows = parseBulkText("CSC201, , 1, 2024", courses);
    expect(rows[0]?.error).toBe("Missing grade");
  });

  it("flags an invalid semester (not 1 or 2)", () => {
    const rows = parseBulkText("CSC201, A, 3, 2024", courses);
    expect(rows[0]?.error).toBe("Semester must be 1 or 2");
  });

  it("flags an out-of-range year", () => {
    const rows = parseBulkText("CSC201, A, 1, 1999", courses);
    expect(rows[0]?.error).toBe("Year must be between 2000 and 2100");
  });

  it("flags an unknown course code", () => {
    const rows = parseBulkText("CSC999, A, 1, 2024", courses);
    expect(rows[0]?.error).toBe("Course 'CSC999' not found");
    expect(rows[0]?.courseId).toBeUndefined();
  });

  it("parses multiple rows with mixed validity", () => {
    const text = ["CSC201, A, 1, 2024", "CSC999, B, 1, 2024", "CSC301, C, 2, 2023"].join("\n");
    const rows = parseBulkText(text, courses);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.error).toBeUndefined();
    expect(rows[1]?.error).toBe("Course 'CSC999' not found");
    expect(rows[2]?.error).toBeUndefined();
  });
});
