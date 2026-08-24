// Customer notification messages (WhatsApp) — one place so a sales invoice and
// a debt-settlement receipt always carry the same agreed set of facts:
//
//   Current amount · Total · Payment type · Sale ID · Remaining
//
// Previously each screen composed its own ad-hoc sentence, so the two messages
// disagreed on both wording and which figures they included.

const PAYMENT_TYPE_LABELS = {
  cash: 'Cash',
  debt: 'Credit (Debt)',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  other: 'Other'
};

export function paymentTypeLabel(value) {
  return PAYMENT_TYPE_LABELS[value] || 'Cash';
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Sri Lankan mobile number in the international form wa.me expects.
 * '0771234567' -> '94771234567'. Returns '' when there's nothing usable.
 */
export function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0')) return `94${digits.slice(1)}`;
  return digits;
}

export function whatsAppUrl(phone, message) {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * International dialling form for SMS: '0771234567' -> '+94771234567'.
 * Messaging apps accept the local form too, but the international one is
 * unambiguous whichever network the device is on.
 */
export function toSmsNumber(phone) {
  const digits = toWhatsAppNumber(phone);
  return digits ? `+${digits}` : '';
}

/**
 * `sms:` link that opens the device's own messaging app with the message
 * pre-filled — the fallback for a customer whose phone has no WhatsApp.
 *
 * The body separator is not consistent across platforms: RFC 5724 says `?`,
 * and that is what Android and desktop handlers expect, but iOS only fills the
 * body in when it is `&`. Getting it wrong opens the app with an empty
 * message, so the platform is sniffed rather than guessed.
 */
export function smsUrl(phone, message) {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(ua);
  const separator = isApple ? '&' : '?';
  return `sms:${toSmsNumber(phone)}${separator}body=${encodeURIComponent(message)}`;
}

/** The link for a given channel — 'whatsapp' or 'sms'. */
export function notificationUrl(channel, phone, message) {
  return channel === 'sms' ? smsUrl(phone, message) : whatsAppUrl(phone, message);
}

/** Roughly how many 160-character SMS parts a message will be split into. */
export function smsPartCount(message) {
  return Math.max(1, Math.ceil((message || '').length / 160));
}

/**
 * Sale invoice notification.
 * `currentAmount` is what this order came to; `totalAmount` is what the
 * customer owes in all (this order plus any balance carried forward);
 * `remainingAmount` is what is still outstanding after this order.
 */
export function buildSaleNotification({
  customerName,
  saleCode,
  quantity,
  currentAmount,
  totalAmount,
  paymentType,
  remainingAmount,
  billUrl
}) {
  const lines = [
    `Hello ${customerName || 'Customer'},`,
    '',
    `Your order ${saleCode} for ${Number(quantity || 0).toLocaleString()} ice cubes is complete.`,
    '',
    `Sale ID: ${saleCode}`,
    `Payment Type: ${paymentTypeLabel(paymentType)}`,
    `Current Amount: ${money(currentAmount)}`,
    `Total: ${money(totalAmount)}`,
    `Remaining: ${money(remainingAmount)}`
  ];

  if (billUrl) {
    lines.push('', '📄 View/Download your bill (valid 24 hours):', billUrl);
  }

  lines.push('', 'Thank you for your business.');
  return lines.join('\n');
}

/**
 * Debt settlement receipt notification.
 * `currentAmount` is the payment just made, `totalAmount` the total debt it
 * was applied against, `remainingAmount` what is still owed afterwards.
 */
export function buildSettlementNotification({
  customerName,
  settlementCode,
  saleRef,
  currentAmount,
  totalAmount,
  paymentType,
  remainingAmount,
  receiptUrl
}) {
  const lines = [
    `Hello ${customerName || 'Customer'},`,
    '',
    'We have received your payment. Thank you.',
    '',
    `Receipt No: ${settlementCode}`,
    `Sale ID: ${saleRef || 'N/A'}`,
    `Payment Type: ${paymentTypeLabel(paymentType)}`,
    `Current Amount: ${money(currentAmount)}`,
    `Total: ${money(totalAmount)}`,
    `Remaining: ${money(remainingAmount)}`
  ];

  if (receiptUrl) {
    lines.push('', '📄 View/Download your receipt:', receiptUrl);
  }

  return lines.join('\n');
}
