import { describe, expect, test } from "bun:test";
import {
  addressesHtml,
  statusHtml
} from "../public/dashboard-renderers.js";

describe("statusHtml", () => {
  test("renders only an accessible colored dot", () => {
    expect(statusHtml("connected")).toBe(
      '<span class="dot status-connected" role="img" aria-label="Connected" title="Connected"></span>'
    );
  });

  test("escapes an unknown status before using it in markup", () => {
    expect(statusHtml('"><script>')).toBe(
      '<span class="dot status-&quot;&gt;&lt;script&gt;" role="img" aria-label="Unknown" title="Unknown"></span>'
    );
  });
});

describe("addressesHtml", () => {
  test("renders IPv4 addresses but not DNS hostnames or IPv6 addresses", () => {
    const html = addressesHtml([
      {
        virtualIpv4: "100.96.0.1",
        virtualIpv6: "2606:4700:110:8765::1"
      },
      {
        virtualIpv4: "100.96.0.2",
        virtualIpv6: "2606:4700:110:8765::2"
      }
    ]);

    expect(html).toContain("100.96.0.1");
    expect(html).toContain("100.96.0.2");
    expect(html).not.toContain("2606:");
  });

  test("reports unavailable registration data separately from no IPv4 address", () => {
    expect(addressesHtml([], true)).toBe('<span class="subtle">Unavailable</span>');
    expect(addressesHtml([{ virtualIpv6: "2606:4700:110:8765::1" }])).toBe(
      '<span class="subtle">—</span>'
    );
  });

  test("limits the list to four IPv4 addresses", () => {
    const html = addressesHtml(
      Array.from({ length: 6 }, (_, index) => ({
        virtualIpv4: `100.96.0.${index + 1}`
      }))
    );

    expect(html).toContain("100.96.0.4");
    expect(html).not.toContain("100.96.0.5");
    expect(html).toContain("2 more addresses");
  });
});
