import { describe, it, expect } from 'vitest';
import { Cartridge } from './cartridge';
import { Mmu } from './mmu';

// Create a bus with a fake 32 KiB ROM, optionally modified by the caller.
function makeMmu(setup?: (rom: Uint8Array) => void): Mmu {
    const rom = new Uint8Array(0x8000);
    setup?.(rom);
    return new Mmu(new Cartridge(rom));
}

describe('Mmu', () => {
    describe('WRAM', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0xC010, 0x42);
            expect(mmu.read(0xC010)).toBe(0x42);
        });

        it('wraps addresses above 0xFFFF', () => {
            const mmu = makeMmu();
            mmu.write(0x1C000, 0x42);
            expect(mmu.read(0xC000)).toBe(0x42);
        });
    });

    describe('ROM', () => {
        it('reads from the cartridge', () => {
            const mmu = makeMmu((rom) => { rom[0x0100] = 0x42; });
            expect(mmu.read(0x0100)).toBe(0x42);
        });

        it('ignores writes', () => {
            const mmu = makeMmu((rom) => { rom[0x0100] = 0x42; });
            mmu.write(0x0100, 0x99);
            expect(mmu.read(0x0100)).toBe(0x42);
        });
    });

    describe('unmapped addresses', () => {
        it('read as 0xFF', () => {
            const mmu = makeMmu();
            expect(mmu.read(0xA000)).toBe(0xFF);
        });
    });
});