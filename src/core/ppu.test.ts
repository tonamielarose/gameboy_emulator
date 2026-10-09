import { describe, it, expect } from 'vitest';
import { Ppu } from './ppu';

const LINE = 456;

const makePpu = () => new Ppu(new Uint8Array(0x2000));
describe('Ppu', () => {
    it('advances LY every 456 cycles', () => {
        const ppu = makePpu();
        ppu.tick(LINE - 1);
        expect(ppu.read(0xFF44)).toBe(0);
        ppu.tick(1);
        expect(ppu.read(0xFF44)).toBe(1);
    });

    it('requests VBlank when entering line 144', () => {
        const ppu = makePpu();
        expect(ppu.tick(LINE * 143)).toBe(0);
        expect(ppu.tick(LINE)).toBe(0x01);
        expect(ppu.read(0xFF44)).toBe(144);
    });

    it('goes through line 153 before wrapping to 0', () => {
        const ppu = makePpu();
        ppu.tick(LINE * 153);
        expect(ppu.read(0xFF44)).toBe(153);
        ppu.tick(LINE);
        expect(ppu.read(0xFF44)).toBe(0);  // a full frame is 154 lines
    });

    it('stops while the LCD is off', () => {
        const ppu = makePpu();
        ppu.write(0xFF40, 0x00);
        expect(ppu.tick(LINE * 200)).toBe(0);
        expect(ppu.read(0xFF44)).toBe(0);
    });

    it('ignores writes to LY', () => {
        const ppu = makePpu();
        ppu.write(0xFF44, 0x42);
        expect(ppu.read(0xFF44)).toBe(0);
    });
});

describe('background rendering', () => {
    function makePpuWithTile(): Ppu {
        const vram = new Uint8Array(0x2000);
        vram[0x0000] = 0xFF;  // tile 0, row 0: low bits all set
        vram[0x0001] = 0x00;  // high bits clear → color 1 on the whole row
        return new Ppu(vram);
    }

    it('draws a background line through the palette', () => {
        const ppu = makePpuWithTile();
        ppu.tick(456);                       // line 0 is drawn
        expect(ppu.framebuffer[0]).toBe(3);  // color 1 → shade 3 with BGP = 0xFC
        expect(ppu.framebuffer[7]).toBe(3);
        expect(ppu.framebuffer[160]).toBe(0); // line 1 not drawn yet
    });

    it('applies vertical scrolling', () => {
        const ppu = makePpuWithTile();
        ppu.write(0xFF42, 1);                // SCY = 1: line 0 shows row 1 of the tile
        ppu.tick(456);
        expect(ppu.framebuffer[0]).toBe(0);  // row 1 is empty → color 0 → white
    });

    it('draws white when the background is disabled', () => {
        const ppu = makePpuWithTile();
        ppu.write(0xFF40, 0x90);             // LCD on, background off
        ppu.tick(456);
        expect(ppu.framebuffer[0]).toBe(0);
    });
});