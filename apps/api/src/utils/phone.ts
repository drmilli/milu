export function normalizePhone(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return '+234' + digits.slice(1);
  }
  if (!number.startsWith('+')) return '+' + digits;
  return number;
}

export function maskPhone(number: string): string {
  if (number.length < 6) return '***';
  return number.slice(0, -4).replace(/\d/g, '*') + number.slice(-4);
}
