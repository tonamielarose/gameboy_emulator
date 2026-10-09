import {toSigned8} from "./utils.ts";

const LCDC_ADDRESS = 0xFF40;
const SCY_ADDRESS = 0xFF42;
const SCX_ADDRESS = 0xFF43;
const LY_ADDRESS = 0xFF44;
const BGP_ADDRESS = 0xFF47;

const CYCLES_PER_LINE = 456;
const VBLANK_START_LINE = 144;
const LAST_LINE = 153;

export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 144;

const VRAM_START = 0x8000;
const TILE_MAP_0 = 0x9800;
const TILE_MAP_1 = 0x9C00;
const TILE_DATA_UNSIGNED = 0x8000;
const TILE_DATA_SIGNED = 0x9000;
const BYTES_PER_TILE = 16;

/**
 * Picture Processing Unit: draws the screen line by line (154 lines of 456 cycles)
 * and requests the VBlank interrupt at the start of each vertical blank.
 * See https://gbdev.io/pandocs/Rendering.html
 */
export class Ppu {
    private lcdc: number;
    private scy: number;
    private scx: number;
    private ly: number;
    private bgp: number;

    private lineCycles: number;

    private readonly vram: Uint8Array;
    private readonly screen: Uint8Array;

    constructor(vram: Uint8Array) {
        this.lcdc = 0x91;
        this.scy = 0;
        this.scx = 0;
        this.ly = 0;
        this.bgp = 0xFC;
        this.lineCycles = 0;
        this.vram = vram;
        this.screen = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    }

    /** The current image, one shade (0 = white … 3 = black) per pixel, row by row. */
    get framebuffer(): Uint8Array {
        return this.screen;
    }

    /** Reads a PPU register. Unimplemented registers read as 0xFF. */
    read(address: number): number {
        switch (address) {
            case LCDC_ADDRESS:
                return this.lcdc;
            case SCY_ADDRESS:
                return this.scy;
            case SCX_ADDRESS:
                return this.scx;
            case LY_ADDRESS:
                return this.ly;
            case BGP_ADDRESS:
                return this.bgp;
            default:
                return 0xFF;
        }
    }

    /** Writes a PPU register. LY is read-only. */
    write(address: number, value: number): void {
        value = value & 0xFF;

        switch (address) {
            case LCDC_ADDRESS:
                this.lcdc = value;
                break;
            case SCY_ADDRESS:
                this.scy = value;
                break;
            case SCX_ADDRESS:
                this.scx = value;
                break;
            case LY_ADDRESS:
                break;
            case BGP_ADDRESS:
                this.bgp = value;
                break;
        }
    }

    /**
     * Advances the PPU by the given number of T-cycles.
     * Returns the interrupts to request, as IF bits (0x01 = VBlank).
     */
    tick(cycles: number): number {
        if ((this.lcdc & 0x80) === 0) {
            this.ly = 0;
            this.lineCycles = 0;
            return 0;
        }

        this.lineCycles += cycles;
        let interrupts = 0;

        while (this.lineCycles >= CYCLES_PER_LINE) {
            this.lineCycles -= CYCLES_PER_LINE;

            if (this.ly < VBLANK_START_LINE){
                this.renderLine(this.ly);
            }

            this.ly += 1;
            if (this.ly === VBLANK_START_LINE) {
                interrupts |= 0x01;
            }
            if (this.ly > LAST_LINE) {
                this.ly = 0;
            }
        }

        return interrupts;
    }

    /**
     * Color number (0–3) of the background pixel at (x, y) in the 256×256 background map,
     * using the tile map and tile data area selected by LCDC.
     */
    private backgroundColorAt(x: number, y: number): number {
        const mapBase = (this.lcdc & 0x08) === 0 ? TILE_MAP_0 : TILE_MAP_1;

        const tileIndex = this.vram[mapBase - VRAM_START + (y >> 3) * 32 + (x >> 3)];

        const tileAddress = (this.lcdc & 0x10) === 0
            ? TILE_DATA_SIGNED + toSigned8(tileIndex) * BYTES_PER_TILE
            : TILE_DATA_UNSIGNED + tileIndex * BYTES_PER_TILE;

        const row = y & 7;
        const low = this.vram[tileAddress - VRAM_START + row * 2];
        const high = this.vram[tileAddress - VRAM_START + row * 2 + 1];

        const bit = 7 - (x & 7);
        return (((high >> bit) & 1) << 1) | ((low >> bit) & 1);
    }

    /** Draws one line of the screen into the framebuffer: background only for now. */
    private renderLine(line: number): void {
        if ((this.lcdc & 0x01) === 0) {
            this.screen.fill(0, line * SCREEN_WIDTH, (line + 1) * SCREEN_WIDTH);
            return;
        }
        const bgY = (line + this.scy) & 0xFF;
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const bgX = (x + this.scx) & 0xFF;

            const color = this.backgroundColorAt(bgX, bgY);

            const shade = (this.bgp >> (color * 2)) & 0x03;

            this.screen[line * SCREEN_WIDTH + x] = shade;
        }
    }
}