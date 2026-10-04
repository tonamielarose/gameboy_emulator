import {describe, it, expect} from 'vitest';
import {Cartridge} from './cartridge';
import {Mmu} from './mmu';

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
            const mmu = makeMmu((rom) => {
                rom[0x0100] = 0x42;
            });
            expect(mmu.read(0x0100)).toBe(0x42);
        });

        it('ignores writes', () => {
            const mmu = makeMmu((rom) => {
                rom[0x0100] = 0x42;
            });
            mmu.write(0x0100, 0x99);
            expect(mmu.read(0x0100)).toBe(0x42);
        });
    });

    describe('unusable area', () => {
        it('reads as 0xFF', () => {
            const mmu = makeMmu();
            expect(mmu.read(0xFEA0)).toBe(0xFF);
        });

        it('ignores writes', () => {
            const mmu = makeMmu();
            mmu.write(0xFEA0, 0x42);
            expect(mmu.read(0xFEA0)).toBe(0xFF);
        });
    });

    describe('VRAM', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0x8010, 0x42);
            expect(mmu.read(0x8010)).toBe(0x42);
        });
    });

    describe('Echo RAM', () => {
        it('mirrors WRAM writes', () => {
            const mmu = makeMmu();
            mmu.write(0xC010, 0x42);
            expect(mmu.read(0xE010)).toBe(0x42);
        });

        it('writes through to WRAM', () => {
            const mmu = makeMmu();
            mmu.write(0xE020, 0x42);
            expect(mmu.read(0xC020)).toBe(0x42);
        });
    });

    describe('OAM', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0xFE10, 0x42);
            expect(mmu.read(0xFE10)).toBe(0x42);
        });
    });

    describe('I/O registers', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0xFF40, 0x42);
            expect(mmu.read(0xFF40)).toBe(0x42);
        });

        it('does not affect OAM', () => {
            const mmu = makeMmu();
            mmu.write(0xFF40, 0x42);
            expect(mmu.read(0xFE40)).toBe(0x00);
        });
    });

    describe('HRAM', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0xFF90, 0x42);
            expect(mmu.read(0xFF90)).toBe(0x42);
        });
    });
});