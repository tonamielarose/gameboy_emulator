import type {Cartridge} from "./cartridge.ts";

// Memory map, in address order
// See https://gbdev.io/pandocs/Memory_Map.html
const ROM_END = 0x7FFF;

const VRAM_START = 0x8000;
const VRAM_END = 0x9FFF;
const VRAM_SIZE = VRAM_END - VRAM_START + 1;

const EXTERNAL_RAM_END = 0xBFFF;

const WRAM_START = 0xC000;
const WRAM_END = 0xDFFF;
const WRAM_SIZE = WRAM_END - WRAM_START + 1;

/**
 * Memory bus: routes every CPU read and write to the right component
 * according to the address (see the Game Boy memory map).
 */
export class Mmu {
    private readonly cartridge: Cartridge;
    private readonly vram: Uint8Array;
    private readonly wram: Uint8Array;

    constructor(cartridge: Cartridge) {
        this.cartridge = cartridge;
        this.vram = new Uint8Array(VRAM_SIZE);
        this.wram = new Uint8Array(WRAM_SIZE);
    }

    /**
     * Reads the byte at the given address, from whichever component
     * is mapped there. Unmapped addresses read as 0xFF.
     */
    read(address: number): number {
        address = address & 0xFFFF;

        if (address <= ROM_END) {
            return this.cartridge.readRom(address);
        }
        if (address <= VRAM_END) {
            return this.vram[address - VRAM_START];
        }
        if (address <= EXTERNAL_RAM_END) {
            return 0xFF;
        }
        if (address <= WRAM_END) {
            return this.wram[address - WRAM_START];
        }
        return 0xFF;
    }

    /**
     * Writes a byte at the given address, to whichever component
     * is mapped there. Writes to unmapped addresses are ignored.
     */
    write(address: number, value: number): void {
        address = address & 0xFFFF;
        value = value & 0xFF;

        if (address <= ROM_END) {
            return; // ROM is read-only. Writes here will be MBC commands.
        }
        if (address <= VRAM_END) {
            this.vram[address - VRAM_START] = value;
            return;
        }
        if (address <= EXTERNAL_RAM_END) {
            return;
        }
        if (address <= WRAM_END) {
            this.wram[address - WRAM_START] = value;
            return;
        }
    }
}