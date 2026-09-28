export interface CaptchaProvider {
  name: string;
  verify(token: string | null | undefined, remoteIpHash?: string): Promise<boolean>;
}
