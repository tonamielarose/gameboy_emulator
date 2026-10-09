import { describe, it, expect } from 'vitest';
import { Ppu } from './ppu';

const LINE = 456;

describe('Ppu', () => {
    it('advances LY every 456 cycles', () => {
        const ppu = new Ppu();
        ppu.tick(LINE - 1);
        expect(ppu.read(0xFF44)).toBe(0);
        ppu.tick(1);
        expect(ppu.read(0xFF44)).toBe(1);
    });

    it('requests VBlank when entering line 144', () => {
        const ppu = new Ppu();
        expect(ppu.tick(LINE * 143)).toBe(0);
        expect(ppu.tick(LINE)).toBe(0x01);
        expect(ppu.read(0xFF44)).toBe(144);
    });

    it('goes through line 153 before wrapping to 0', () => {
        const ppu = new Ppu();
        ppu.tick(LINE * 153);
        expect(ppu.read(0xFF44)).toBe(153);
        ppu.tick(LINE);
        expect(ppu.read(0xFF44)).toBe(0);  // a full frame is 154 lines
    });

    it('stops while the LCD is off', () => {
        const ppu = new Ppu();
        ppu.write(0xFF40, 0x00);
        expect(ppu.tick(LINE * 200)).toBe(0);
        expect(ppu.read(0xFF44)).toBe(0);
    });

    it('ignores writes to LY', () => {
        const ppu = new Ppu();
        ppu.write(0xFF44, 0x42);
        expect(ppu.read(0xFF44)).toBe(0);
    });
});