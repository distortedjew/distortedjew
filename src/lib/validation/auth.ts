import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.email("Enter a valid email address"),
  password: passwordSchema,
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
  acceptTerms: z.literal(true, { message: "You must accept the terms" }),
  captchaToken: z.string().optional(),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email"),
  password: z.string().min(1, "Enter your password"),
});

export const guestSchema = z.object({
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear()),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
