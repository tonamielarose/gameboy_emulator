import type {Mmu} from "./mmu.ts";

/** Formats a number as uppercase hexadecimal, padded to the given number of digits. */
function hex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, '0');
}

/**
 * Sharp SM83 CPU: registers, flags and instruction execution.
 */
export class Cpu {
    private readonly mmu: Mmu;
    a: number;
    f: number;
    b: number;
    c: number;
    d: number;
    e: number;
    h: number;
    l: number;
    sp: number;
    pc: number;
    ime: boolean;


    constructor(mmu: Mmu) {
        this.mmu = mmu;
        this.a = 0;
        this.f = 0;
        this.b = 0;
        this.c = 0;
        this.d = 0;
        this.e = 0;
        this.h = 0;
        this.l = 0;
        this.sp = 0xFFFE;
        this.pc = 0x0100;

        // Register values left by the DMG boot ROM, which is not emulated.
        // See https://gbdev.io/pandocs/Power_Up_Sequence.html
        this.af = 0x01B0;
        this.bc = 0x0013;
        this.de = 0x00D8;
        this.hl = 0x014D;

        this.ime = false;
    }

    /** Register pair AF (A = high byte, F = low byte). The low 4 bits of F always read as 0. */
    get af(): number {
        return (this.a << 8) | this.f;
    }

    set af(value: number) {
        this.a = (value >> 8) & 0xFF;
        this.f = value & 0xF0;
    }

    /** Register pair BC (B = high byte, C = low byte). */
    get bc(): number {
        return (this.b << 8) | this.c;
    }

    set bc(value: number) {
        this.b = (value >> 8) & 0xFF;
        this.c = value & 0xFF;
    }

    /** Register pair DE (D = high byte, E = low byte). */
    get de(): number {
        return (this.d << 8) | this.e;
    }

    set de(value: number) {
        this.d = (value >> 8) & 0xFF;
        this.e = value & 0xFF;
    }

    /** Register pair HL (H = high byte, L = low byte). Often used as a memory pointer. */
    get hl(): number {
        return (this.h << 8) | this.l;
    }

    set hl(value: number) {
        this.h = (value >> 8) & 0xFF;
        this.l = value & 0xFF;
    }

    /**
     * Reads the byte at PC and advances PC by one.
     */
    private fetch8(): number {
        const value = this.mmu.read(this.pc);
        this.pc = (this.pc + 1) & 0xFFFF;
        return value;
    }

    /**
     * Reads a little-endian 16-bit value at PC and advances PC by two.
     */
    private fetch16(): number {
        const value = this.mmu.read16(this.pc);
        this.pc = (this.pc + 2) & 0xFFFF;
        return value;
    }

    /**
     * Writes an 8-bit register by its index in the opcode encoding:
     * 0=B, 1=C, 2=D, 3=E, 4=H, 5=L, 6=(HL) (memory at address HL), 7=A.
     */
    private setRegister(index: number, value: number) {
        value = value & 0xFF;
        switch (index) {
            case 0:
                this.b = value;
                return;
            case 1:
                this.c = value;
                return;
            case 2:
                this.d = value;
                return;
            case 3:
                this.e = value;
                return;
            case 4:
                this.h = value;
                return;
            case 5:
                this.l = value;
                return;
            case 6:
                this.mmu.write(this.hl, value);
                return;
            case 7:
                this.a = value;
                return;
            default:
                return
        }
    }

    /**
     * Executes one instruction at PC and returns the number of T-cycles it took.
     * Throws on opcodes that are not implemented yet.
     *
     * @see https://gbdev.io/gb-opcodes/optables/ for opcodes, timings and flags.
     */
    step(): number {
        const opcode = this.fetch8();
        switch (opcode) {
            case 0x00: // NOP
                return 4;
            case 0x01: // LD BC, nn
                this.bc = this.fetch16();
                return 12;
            case 0x06:
            case 0x0E:
            case 0x16:
            case 0x1E:
            case 0x26:
            case 0x2E:
            case 0x36:
            case 0x3E: { // LD r, n
                const r = (opcode >> 3) & 0x07;
                this.setRegister(r, this.fetch8());
                return r === 6 ? 12 : 8;
            }
            case 0x11: // LD DE, nn
                this.de = this.fetch16();
                return 12;
            case 0x21: // LD HL, nn
                this.hl = this.fetch16();
                return 12;
            case 0x31: // LD SP, nn
                this.sp = this.fetch16();
                return 12;
            case 0xC3: // JP nn
                this.pc = this.fetch16();
                return 16;
            case 0xE0: // LDH (n), A
                this.mmu.write(this.fetch8() + 0xFF00, this.a);
                return 12;
            case 0xEA: // LD (nn), A
                this.mmu.write(this.fetch16(), this.a);
                return 16;
            case 0xF0: // LDH A, (n)
                this.a = this.mmu.read(this.fetch8() + 0xFF00);
                return 12;
            case 0xF3: // DI
                this.ime = false;
                return 4;
            case 0xFA: // LD A, (nn)
                this.a = this.mmu.read(this.fetch16());
                return 16;
            default:
                throw new Error(`Unknown opcode 0x${hex(opcode, 2)} at 0x${hex((this.pc - 1) & 0xFFFF, 4)}`);
        }
    }
}