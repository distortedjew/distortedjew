export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  name: string;
  send(input: SendEmailInput): Promise<boolean>;
}
