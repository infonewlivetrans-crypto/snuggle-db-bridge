// Vitest: origin whitelist на стороне Web.
import { describe, it, expect } from "vitest";
import { isTrustedAgentOrigin, normalizeOrigin } from "../agent-origins";

describe("agent-origins", () => {
  it("radius-track.ru доверен", () => {
    expect(isTrustedAgentOrigin("https://radius-track.ru")).toBe(true);
  });
  it("Lovable dev preview доверен", () => {
    expect(
      isTrustedAgentOrigin("https://id-preview--d0d5cb47-0414-4a28-a4e9-a8beda3d2828.lovable.app"),
    ).toBe(true);
  });
  it("localhost доверен", () => {
    expect(isTrustedAgentOrigin("http://localhost:8080")).toBe(true);
    expect(isTrustedAgentOrigin("http://127.0.0.1:5173")).toBe(true);
  });
  it("случайный lovable.app отклоняется", () => {
    expect(isTrustedAgentOrigin("https://other-project.lovable.app")).toBe(false);
  });
  it("file:// и javascript: отклоняются", () => {
    expect(isTrustedAgentOrigin("file:///etc/passwd")).toBe(false);
    expect(isTrustedAgentOrigin("javascript:alert(1)")).toBe(false);
  });
  it("chrome-extension:// отклоняется", () => {
    expect(isTrustedAgentOrigin("chrome-extension://abc/index.html")).toBe(false);
  });
  it("normalizeOrigin понижает регистр и убирает путь", () => {
    expect(normalizeOrigin("https://Radius-Track.ru/x?y")).toBe("https://radius-track.ru");
  });
});
