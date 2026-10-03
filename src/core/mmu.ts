import type {Cartridge} from "./cartridge.ts";

const WRAM_SIZE = 0x2000

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
}