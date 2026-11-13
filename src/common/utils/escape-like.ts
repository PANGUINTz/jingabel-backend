// Escapes LIKE/ILIKE wildcards so user input matches literally.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
