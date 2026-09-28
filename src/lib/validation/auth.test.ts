import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema, guestSchema, usernameSchema, passwordSchema } from "./auth";

describe("registerSchema", () => {
  const valid = {
    username: "wanderlust_22",
    email: "person@example.com",
    password: "Passw0rd!",
    birthYear: 1995,
    acceptTerms: true as const,
  };

  it("accepts a fully valid registration payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects usernames with disallowed characters", () => {
    const result = registerSchema.safeParse({ ...valid, username: "bad name!" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email address", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password missing an uppercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "password1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ ...valid, password: "Pw1" });
    expect(result.success).toBe(false);
  });

  it("rejects when terms are not accepted", () => {
    const result = registerSchema.safeParse({ ...valid, acceptTerms: false });
    expect(result.success).toBe(false);
  });

  it("rejects a birth year in the future", () => {
    const result = registerSchema.safeParse({ ...valid, birthYear: new Date().getFullYear() + 1 });
    expect(result.success).toBe(false);
  });

  it("treats captchaToken as optional", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts an identifier and password", () => {
    expect(loginSchema.safeParse({ identifier: "wanderlust_22", password: "x" }).success).toBe(true);
  });

  it("rejects an empty identifier", () => {
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ identifier: "a", password: "" }).success).toBe(false);
  });
});

describe("guestSchema", () => {
  it("accepts a plausible birth year", () => {
    expect(guestSchema.safeParse({ birthYear: 2000 }).success).toBe(true);
  });

  it("rejects a non-integer birth year", () => {
    expect(guestSchema.safeParse({ birthYear: 2000.5 }).success).toBe(false);
  });
});

describe("usernameSchema / passwordSchema", () => {
  it("trims and enforces length bounds on usernames", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("a".repeat(21)).success).toBe(false);
    expect(usernameSchema.safeParse("valid_user1").success).toBe(true);
  });

  it("requires lowercase, uppercase, and a digit in passwords", () => {
    expect(passwordSchema.safeParse("alllowercase1").success).toBe(false);
    expect(passwordSchema.safeParse("ALLUPPERCASE1").success).toBe(false);
    expect(passwordSchema.safeParse("NoDigitsHere").success).toBe(false);
    expect(passwordSchema.safeParse("Valid1Password").success).toBe(true);
  });
});
