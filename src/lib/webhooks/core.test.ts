import { describe, expect, it } from "vitest";
import { isPrivateAddress, signWebhook, verifyWebhookSignature, webhookUrlProblem } from "./core";

describe("webhook signatures", () => {
  it("verifies its own signature and rejects tampering or old timestamps", () => {
    const now = 1_800_000_000_000;
    const header = signWebhook("whsec_test", '{"a":1}', now / 1000);
    expect(verifyWebhookSignature("whsec_test", '{"a":1}', header, 300, now)).toBe(true);
    expect(verifyWebhookSignature("whsec_test", '{"a":2}', header, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", '{"a":1}', header, 300, now)).toBe(false);
    expect(verifyWebhookSignature("whsec_test", '{"a":1}', header, 300, now + 600_000)).toBe(false);
  });
});

describe("webhook URL checks", () => {
  it("accepts public https URLs", () => {
    expect(webhookUrlProblem("https://hooks.zapier.com/hooks/catch/1/abc")).toBeNull();
    expect(webhookUrlProblem("https://my-agent.example.com/webhook")).toBeNull();
  });
  it("rejects http, credentials, odd ports and private hosts", () => {
    expect(webhookUrlProblem("http://example.com")).toMatch(/https/);
    expect(webhookUrlProblem("https://u:p@example.com")).toMatch(/password/);
    expect(webhookUrlProblem("https://example.com:8443/x")).toMatch(/port/);
    expect(webhookUrlProblem("https://localhost/x")).toMatch(/public/);
    expect(webhookUrlProblem("https://127.0.0.1/x")).toMatch(/public/);
    expect(webhookUrlProblem("https://169.254.169.254/latest")).toMatch(/public/);
    expect(webhookUrlProblem("https://[::1]/x")).toMatch(/public/);
    expect(webhookUrlProblem("not a url")).toMatch(/full URL/);
  });
  it("classifies addresses", () => {
    for (const ip of ["10.0.0.1", "172.16.5.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::ffff:127.0.0.1", "fd00::1", "fe80::1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});
