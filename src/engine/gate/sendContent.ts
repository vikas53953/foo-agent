// Spec: 08-2 §9.2 `send` row, hard-limit column ("the content includes address/phone/bank details/attachments from Documents
// or agrees to pay", J12 branches), §9.4 (`isHardLimit` for the send class). M5 T8 (T7 review hand-off): the three content
// marks the engine reads from a message itself; address and phone stay in `ApprovalFields.personalShared`. implementation-
// notes M5-T8 G-M5-31: a separate input to `isHardLimit`, so the shared `personalShared` enum does not change.

/** What a message about to be sent carries (its text and the files attached to it). */
export interface SendContent {
  text: string;
  /** Paths of the files attached, as main resolved them. */
  attachments?: readonly string[];
}

export interface SendContentMarks {
  bankDetails: boolean;
  documentsAttachment: boolean;
  agreesToPay: boolean;
}

/** An Indian IFSC code (4 letters, 0, 6 letters or digits). */
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/u;
/** An account number: a 9–18 digit run with an account word before it. */
const ACCOUNT = /\b(?:a\/c|acc(?:oun)?t|account)\s*(?:no\.?|number|#)?\s*[:-]?\s*\d[\d\s-]{7,20}\d\b/iu;
/** A UPI id on a common handle. */
const UPI = /\b[\w.-]{2,}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|paytm|upi|apl|airtel)\b/iu;
const PAY_WORDS = [
  /\bI(?:'ll|’ll| will| shall| agree to| can)\s+(?:pay|transfer|send (?:you )?(?:the )?(?:money|amount|payment|₹))/iu,
  /\b(?:agree|agreed|happy|ok(?:ay)?) to pay\b/iu,
  /\bpayment will be (?:made|sent|done)\b/iu,
  /\bwill (?:pay|transfer) (?:you|the|₹|rs\.?)/iu,
  /(?:भुगतान|पेमेंट)\s*(?:कर\s*)?(?:दूंगा|दूँगा|दूंगी|दूँगी|करूंगा|करूँगा|करूंगी|करूँगी)/u,
  /(?:पैसे|रुपये)\s*(?:भेज|दे)\s*(?:दूंगा|दूँगा|दूंगी|दूँगी)/u,
];
/** A folder named Documents anywhere in the path (Windows or POSIX separators). */
const DOCUMENTS = /(?:^|[\\/])documents(?:[\\/]|$)/iu;

export function sendContentMarks(c: SendContent): SendContentMarks {
  return {
    bankDetails: IFSC.test(c.text) || ACCOUNT.test(c.text) || UPI.test(c.text),
    documentsAttachment: (c.attachments ?? []).some((p) => DOCUMENTS.test(p)),
    agreesToPay: PAY_WORDS.some((r) => r.test(c.text)),
  };
}

/** §9.2: any of the three makes a send a hard limit. */
export function sendContentHard(c: SendContent | undefined): boolean {
  if (!c) return false;
  const m = sendContentMarks(c);
  return m.bankDetails || m.documentsAttachment || m.agreesToPay;
}
