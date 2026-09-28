import "server-only";
import { signVerifyToken } from "./verify-token";
import { getEmailProvider } from "@/lib/email";
import { APP_NAME } from "@/lib/constants";

export async function sendVerificationEmail(userId: string, email: string) {
  const token = await signVerifyToken(userId, email);
  const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify-email?token=${token}`;

  await getEmailProvider().send({
    to: email,
    subject: `Verify your ${APP_NAME} email`,
    text:
      `Welcome to ${APP_NAME}! Please confirm this is your email address.\n\n` +
      `Verify your email: ${verifyUrl}\n\n` +
      `This link expires in 24 hours.`,
  });
}
