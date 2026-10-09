/** Formats a number as uppercase hexadecimal, padded to the given number of digits. */
export function hex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, '0');
}
/** Interprets a byte as a signed two's-complement value (-128 to 127). */
export function toSigned8(byte: number): number {
    return byte >= 0x80 ? byte - 0x100 : byte;
}