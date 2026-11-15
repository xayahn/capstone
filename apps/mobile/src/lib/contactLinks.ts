export const isPlaceholderPhone = (phone: string | null | undefined): boolean =>
  Boolean(phone && /\b555[-\s]?010\d\b/.test(phone));

export const dialablePhoneUri = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digitCount = cleaned.replace(/\D/g, '').length;
  return digitCount >= 7 ? `tel:${cleaned}` : null;
};

export const mailtoUri = (email: string | null | undefined): string | null => {
  if (!email) return null;
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null;
  if (/\.(?:test|example|invalid|localhost)$/i.test(trimmed)) return null;
  return `mailto:${trimmed}`;
};
