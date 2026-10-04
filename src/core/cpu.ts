import type {Mmu} from "./mmu.ts";

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
}