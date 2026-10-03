import { describe, it, expect } from 'vitest';
import { Cartridge } from './cartridge';

// Create a fake 32 KiB ROM with a title written at 0x0134.
function makeRomWithTitle(title: string): Uint8Array {
    const rom = new Uint8Array(0x8000);
    for (let i = 0; i < title.length; i++) {
        rom[0x0134 + i] = title.charCodeAt(i);
    }
    return rom;
}

describe('Cartridge', () => {
    describe('title', () => {
        it('reads a short title', () => {
            const rom = makeRomWithTitle('TEST');
            const cart = new Cartridge(rom);
            expect(cart.title).toBe('TEST');
        });

        it('reads a long title and stops at the end of the zone', () => {
            const rom = makeRomWithTitle('ANTICONSTITUTION');
            rom[0x0144] = 'X'.charCodeAt(0); // non-null byte after the title zone
            const cart = new Cartridge(rom);
            expect(cart.title).toBe('ANTICONSTITUTION');
        });

        it('ignores the Game Boy Color flag', () => {
            const rom = makeRomWithTitle('QUINZECARACTERE');
            rom[0x0143] = 0x80; // Game Boy Color flag
            const cart = new Cartridge(rom);
            expect(cart.title).toBe('QUINZECARACTERE');
        });
    });

    describe('type', () => {
        it('reads a known cartridge type', () => {
            const rom = new Uint8Array(0x8000);
            rom[0x0147] = 0x01;
            const cart = new Cartridge(rom);
            expect(cart.type).toBe('MBC1');
        });

        it('returns UNKNOWN for an unsupported code', () => {
            const rom = new Uint8Array(0x8000);
            rom[0x0147] = 0xFF;
            const cart = new Cartridge(rom);
            expect(cart.type).toBe('UNKNOWN');
        });
    });

    describe('romSize', () => {
        it('returns 32 KiB for code 0x00', () => {
            const rom = new Uint8Array(0x8000);
            rom[0x0148] = 0x00;
            expect(new Cartridge(rom).romSize).toBe(32 * 1024);
        });

        it('returns 1 MiB for code 0x05', () => {
            const rom = new Uint8Array(0x8000);
            rom[0x0148] = 0x05;
            expect(new Cartridge(rom).romSize).toBe(1024 * 1024);
        });
    });
});