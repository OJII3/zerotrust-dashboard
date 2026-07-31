import { expect, test } from "bun:test";
import { enabled } from "./env";

test("accepts boolean and string environment flags", () => {
  expect(enabled(true)).toBe(true);
  expect(enabled(false)).toBe(false);
  expect(enabled("true")).toBe(true);
  expect(enabled("false")).toBe(false);
});
