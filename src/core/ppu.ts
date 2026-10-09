const LCDC_ADDRESS = 0xFF40;
const LY_ADDRESS = 0xFF44;
const CYCLES_PER_LINE = 456;
const VBLANK_START_LINE = 144;
const LAST_LINE = 153;

/**
 * Picture Processing Unit: draws the screen line by line (154 lines of 456 cycles)
 * and requests the VBlank interrupt at the start of each vertical blank.
 * See https://gbdev.io/pandocs/Rendering.html
 */
export class Ppu {
    private lcdc: number;
    private ly: number;
    private lineCycles: number;

    constructor() {
        this.lcdc = 0x91;
        this.ly = 0;
        this.lineCycles = 0;
    }

    /** Reads a PPU register. Unimplemented registers read as 0xFF. */
    read(address: number): number {
        switch (address) {
            case LCDC_ADDRESS:
                return this.lcdc;
            case LY_ADDRESS:
                return this.ly;
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
            case LY_ADDRESS:
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
}