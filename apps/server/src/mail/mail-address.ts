const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;

// RFC 5322 "atext": the characters a dot-atom local part may use. No quotes, spaces, commas,
// semicolons or angle brackets, so one value is always exactly one mailbox.
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// A host name of at least two ASCII labels whose last label is not all digits (not an IP address).
const DOMAIN =
  /^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const NUMERIC_LABEL = /^[0-9]+$/;

/**
 * True when `address` is a plain `local@domain` mailbox and nothing else (OPS-07). The check is
 * deliberately stricter than the RFC: no display name, quoted local part, comment, list, IP
 * literal or non-ASCII character, and no control character, so an address can never add a header
 * or a recipient to the message. Registration validates addresses at the contract; this is the
 * last line of defence before the SMTP envelope.
 */
export function isSafeMailAddress(address: string): boolean {
  if (typeof address !== 'string' || address.length > MAX_ADDRESS_LENGTH) return false;
  const at = address.indexOf('@');
  if (at < 1 || at !== address.lastIndexOf('@')) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > MAX_LOCAL_PART_LENGTH || domain.length > MAX_DOMAIN_LENGTH) return false;
  if (!LOCAL_PART.test(local) || !DOMAIN.test(domain)) return false;
  return !NUMERIC_LABEL.test(domain.slice(domain.lastIndexOf('.') + 1));
}
