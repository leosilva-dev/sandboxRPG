export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 16;

// Letras (com acentos), números, espaço, hífen e underscore.
const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]+$/;

export function normalizeName(raw) {
  return (raw ?? '').trim().replace(/\s+/g, ' ');
}

export function isValidName(name) {
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH && NAME_PATTERN.test(name);
}
