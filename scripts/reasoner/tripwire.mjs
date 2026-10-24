/**
 * The reasoner service's independent tripwire: does a request body carry text shaped like a value
 * the client should never have sent?
 *
 * Metadata-only shapes. Deliberately crude and deliberately not the client's detectors — an
 * independent observer that agreed with the thing it is observing would be worth less. Moved here
 * from `tests/browser/demo/reasoner-service.mjs` unchanged (M20), so the product launcher and the
 * test front share one implementation.
 */
const SHAPES = [
  { class: "PHONE", re: /\b[6-9]\d{9}\b/ },
  { class: "AADHAAR", re: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/ },
  { class: "DOB", re: /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/ },
  { class: "OTP", re: /\b\d{6}\b/ },
];

/** Classes only. The matched text is never captured, logged or returned. */
export const tripwire = (body) =>
  SHAPES.filter((shape) => shape.re.test(body)).map((shape) => ({ class: shape.class, source: "server-tripwire" }));
