import type {Cartridge} from "./cartridge.ts";

const WRAM_SIZE = 0x2000;
const WRAM_START = 0xC000;
const WRAM_END = 0xDFFF;
const ROM_END = 0x7FFF

/**
 * Memory bus: routes every CPU read and write to the right component
 * according to the address (see the Game Boy memory map).
 */
export class Mmu {
    private readonly cartridge: Cartridge;
    private readonly wram: Uint8Array;

    constructor(cartridge: Cartridge) {
        this.cartridge = cartridge;
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
        } else if (address >= WRAM_START && address <= WRAM_END) {
            return this.wram[address - WRAM_START];
        }
        return 0xFF;
    }
}