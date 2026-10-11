import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdmin, workspaceOpen } from "@/lib/auth";

describe("WORKSPACE_AUTH=off", () => {
  beforeEach(() => { process.env.ADMIN_TOKEN = "secret"; delete process.env.WORKSPACE_AUTH; });
  afterEach(() => { delete process.env.WORKSPACE_AUTH; });

  it("is closed by default: no token, no access", () => {
    expect(workspaceOpen()).toBe(false);
    expect(isAdmin(new Request("http://x/api/export"))).toBe(false);
  });
  it("only the exact value 'off' opens it", () => {
    for (const v of ["", "false", "0", "OFF", "no"]) { process.env.WORKSPACE_AUTH = v; expect(workspaceOpen()).toBe(false); }
    process.env.WORKSPACE_AUTH = "off";
    expect(workspaceOpen()).toBe(true);
    expect(isAdmin(new Request("http://x/api/export"))).toBe(true);
  });
});
