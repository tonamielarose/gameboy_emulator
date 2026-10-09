import type {Cartridge} from "./cartridge.ts";
import {Timer} from "./timer.ts";
import {Ppu} from "./ppu.ts";

// Memory map, in address order
// See https://gbdev.io/pandocs/Memory_Map.html
const ROM_END = 0x7FFF;

const VRAM_START = 0x8000;
const VRAM_END = 0x9FFF;
const VRAM_SIZE = VRAM_END - VRAM_START + 1;

const EXTERNAL_RAM_START = 0xA000;
const EXTERNAL_RAM_END = 0xBFFF;
const EXTERNAL_RAM_SIZE = EXTERNAL_RAM_END - EXTERNAL_RAM_START + 1;

const WRAM_START = 0xC000;
const WRAM_END = 0xDFFF;
const WRAM_SIZE = WRAM_END - WRAM_START + 1;

const ECHO_RAM_START = 0xE000;
const ECHO_RAM_END = 0xFDFF;

const OAM_START = 0xFE00;
const OAM_END = 0xFE9F;
const OAM_SIZE = OAM_END - OAM_START + 1;

const UNUSABLE_END = 0xFEFF;

const IO_REGISTERS_START = 0xFF00;
const TIMER_START = 0xFF04;
const TIMER_END = 0xFF07;
const IF_ADDRESS = 0xFF0F;
const PPU_REGISTERS_START = 0xFF40;
const PPU_REGISTERS_END = 0xFF4B;
const IO_REGISTERS_END = 0xFF7F;
const IO_REGISTERS_SIZE = IO_REGISTERS_END - IO_REGISTERS_START + 1;

const SERIAL_DATA = 0xFF01;
const SERIAL_CONTROL = 0xFF02;

const HRAM_START = 0xFF80;
const HRAM_END = 0xFFFE;
const HRAM_SIZE = HRAM_END - HRAM_START + 1;

const IE_ADDRESS = 0xFFFF;

/**
 * Memory bus: routes every CPU read and write to the right component
 * according to the address (see the Game Boy memory map).
 */
export class Mmu {
    private readonly cartridge: Cartridge;
    private readonly vram: Uint8Array;
    private readonly wram: Uint8Array;
    private readonly oam: Uint8Array;
    // Temporary storage until each I/O register is wired to its component.
    private readonly io: Uint8Array;
    private readonly hram: Uint8Array;
    private ie: number;
    private serialOutput: string;

    private readonly timer: Timer;
    private readonly ppu: Ppu;

    constructor(cartridge: Cartridge) {
        this.cartridge = cartridge;
        this.vram = new Uint8Array(VRAM_SIZE);
        this.wram = new Uint8Array(WRAM_SIZE);
        this.oam = new Uint8Array(OAM_SIZE);
        this.io = new Uint8Array(IO_REGISTERS_SIZE);
        this.hram = new Uint8Array(HRAM_SIZE);
        this.ie = 0;
        this.serialOutput = "";
        this.timer = new Timer();
        this.ppu = new Ppu(this.vram);
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
            return 0xFF; // external RAM: not implemented yet (requires MBC support)
        }
        if (address <= WRAM_END) {
            return this.wram[address - WRAM_START];
        }
        if (address <= ECHO_RAM_END) {
            return this.wram[address - ECHO_RAM_START];
        }
        if (address <= OAM_END) {
            return this.oam[address - OAM_START];
        }
        if (address <= UNUSABLE_END) {
            return 0xFF;
        }
        if (address <= IO_REGISTERS_END) {
            if (address >= TIMER_START && address <= TIMER_END) {
                return this.timer.read(address);
            }
            if (address >= PPU_REGISTERS_START && address <= PPU_REGISTERS_END) {
                return this.ppu.read(address);
            }
            return this.io[address - IO_REGISTERS_START];
        }
        if (address <= HRAM_END) {
            return this.hram[address - HRAM_START];
        }
        if (address === IE_ADDRESS) {
            return this.ie;
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
            return; // external RAM: not implemented yet (requires MBC support)
        }
        if (address <= WRAM_END) {
            this.wram[address - WRAM_START] = value;
            return;
        }
        if (address <= ECHO_RAM_END) {
            this.wram[address - ECHO_RAM_START] = value;
            return;
        }
        if (address <= OAM_END) {
            this.oam[address - OAM_START] = value;
            return;
        }
        if (address <= UNUSABLE_END) {
            return;
        }
        if (address <= IO_REGISTERS_END) {
            if (address >= TIMER_START && address <= TIMER_END) {
                this.timer.write(address, value);
                return;
            }
            if (address >= PPU_REGISTERS_START && address <= PPU_REGISTERS_END) {
                this.ppu.write(address, value);
                return;
            }

            this.io[address - IO_REGISTERS_START] = value;
            if (address === SERIAL_CONTROL && value === 0x81) {
                const char = String.fromCharCode(this.read(SERIAL_DATA));
                this.serialOutput += char;
            }
            return;
        }
        if (address <= HRAM_END) {
            this.hram[address - HRAM_START] = value;
            return;
        }
        if (address === IE_ADDRESS) {
            this.ie = value;
            return;
        }
    }

    /**
     * Reads a 16-bit value stored in little-endian order:
     * low byte at `address`, high byte at `address + 1`.
     */
    read16(address: number): number {
        const low = this.read(address) & 0xFF;
        const high = (this.read(address + 1)) & 0xFF;
        const value = (high << 8) | low;
        return value;
    }

    /**
     * Writes a 16-bit value in little-endian order:
     * low byte at `address`, high byte at `address + 1`.
     */
    write16(address: number, value: number): void {
        const low = value & 0xFF;
        this.write(address, low);
        const high = value >> 8;
        this.write(address + 1, high);
    }

    /**
     * Text sent through the serial port so far.
     * Test ROMs (such as Blargg's) report their results this way.
     */
    get serial(): string {
        return this.serialOutput;
    }

    /** The PPU's current image. */
    get framebuffer(): Uint8Array {
        return this.ppu.framebuffer;
    }

    /** Requests an interrupt by setting its bit in IF (0=VBlank, 1=STAT, 2=Timer, 3=Serial, 4=Joypad). */
    requestInterrupt(bit: number): void {
        this.io[IF_ADDRESS - IO_REGISTERS_START] |= 1 << bit;
    }

    /** Advances the hardware components by the given number of T-cycles. */
    tick(cycles: number): void {
        if (this.timer.tick(cycles)) {
            this.requestInterrupt(2);
        }
        const ppuInterrupts = this.ppu.tick(cycles);
        this.io[IF_ADDRESS - IO_REGISTERS_START] |= ppuInterrupts;
    }
}