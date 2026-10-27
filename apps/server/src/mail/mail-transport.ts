/** One finished message for one recipient. `to` has passed `isSafeMailAddress`. */
export interface OutgoingMail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Delivers a message or rejects; tests replace it with a fake. */
export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}

/** Nest injection token; its value is `undefined` when mail is not configured. */
export const MAIL_TRANSPORT = Symbol('MailTransport');
