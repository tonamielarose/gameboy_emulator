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

    describe('IE register', () => {
        it('reads back what was written', () => {
            const mmu = makeMmu();
            mmu.write(0xFFFF, 0x1F);
            expect(mmu.read(0xFFFF)).toBe(0x1F);
        });
    });

    describe('16-bit access', () => {
        it('writes in little-endian order', () => {
            const mmu = makeMmu();
            mmu.write16(0xC000, 0x1234);
            expect(mmu.read(0xC000)).toBe(0x34);
            expect(mmu.read(0xC001)).toBe(0x12);
        });

        it('reads back a 16-bit value', () => {
            const mmu = makeMmu();
            mmu.write16(0xC000, 0xBEEF);
            expect(mmu.read16(0xC000)).toBe(0xBEEF);
        });

        it('wraps around at the end of the address space', () => {
            const mmu = makeMmu();
            mmu.write(0xFFFF, 0x34);
            mmu.write(0x0000, 0x12); // ROM: ignored, reads 0x00 from the fake ROM
            expect(mmu.read16(0xFFFF)).toBe(0x0034);
        });
    });

    describe('serial port', () => {
        it('captures characters sent through the serial port', () => {
            const mmu = makeMmu();
            mmu.write(0xFF01, 'O'.charCodeAt(0));
            mmu.write(0xFF02, 0x81);
            mmu.write(0xFF01, 'K'.charCodeAt(0));
            mmu.write(0xFF02, 0x81);
            expect(mmu.serial).toBe('OK');
        });

        it('ignores data that is never sent', () => {
            const mmu = makeMmu();
            mmu.write(0xFF01, 'X'.charCodeAt(0));
            expect(mmu.serial).toBe('');
        });
    });

    describe('timer', () => {
        it('routes the timer registers to the timer', () => {
            const mmu = makeMmu();
            mmu.write(0xFF07, 0x05);
            expect(mmu.read(0xFF07)).toBe(0xFD);   // unused TAC bits read as 1
        });

        it('requests the timer interrupt when TIMA overflows', () => {
            const mmu = makeMmu();
            mmu.write(0xFF05, 0xFF);               // TIMA about to overflow
            mmu.write(0xFF07, 0x05);               // enabled, 16-cycle period
            mmu.tick(16);
            expect(mmu.read(0xFF0F) & 0x04).toBe(0x04);
        });
    });

    describe('interrupt requests', () => {
        it('keeps other pending interrupts', () => {
            const mmu = makeMmu();
            mmu.requestInterrupt(0);               // VBlank
            mmu.requestInterrupt(2);               // Timer
            expect(mmu.read(0xFF0F) & 0x1F).toBe(0x05); // both still pending
        });
    });

    describe('PPU', () => {
        it('routes the PPU registers to the PPU', () => {
            const mmu = makeMmu();
            expect(mmu.read(0xFF40)).toBe(0x91);   // LCDC after boot
            mmu.tick(456);
            expect(mmu.read(0xFF44)).toBe(1);      // LY advanced
        });

        it('requests the VBlank interrupt', () => {
            const mmu = makeMmu();
            mmu.tick(456 * 144);
            expect(mmu.read(0xFF0F) & 0x01).toBe(0x01);
        });
    });
});