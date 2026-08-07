import { describe, expect, test } from "bun:test";
import { activeCount, filterDevices, osName, sortDevices, statusLabels } from "./dashboard";
const devices = [
  {
    id: "a",
    name: "alpha",
    status: "stale",
    deviceType: "Windows",
    registrations: [],
    lastSeenAt: "2026-07-29T00:00:00Z",
  },
  {
    id: "b",
    name: "beta",
    status: "connected",
    deviceType: "Darwin",
    registrations: [{ status: "active" }],
    lastSeenAt: "2026-07-30T00:00:00Z",
  },
] as any[];
describe("dashboard helpers", () => {
  test("normalizes os", () => {
    expect(osName("Darwin 24")).toBe("macOS");
    expect(osName("Windows 11")).toBe("Windows");
  });
  test("filters", () => {
    expect(
      filterDevices(devices, { query: "beta", os: "", status: "Connected", profile: "" }),
    ).toHaveLength(1);
    expect(statusLabels.connected).toBe("Connected");
  });
  test("sorts and counts", () => {
    expect(sortDevices(devices, "lastSeen")[0].id).toBe("b");
    expect(activeCount(devices[1])).toBe(1);
  });
});
