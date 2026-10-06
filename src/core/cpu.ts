import type {Mmu} from "./mmu.ts";

/** Formats a number as uppercase hexadecimal, padded to the given number of digits. */
function hex(value: number, digits: number): string {
    return value.toString(16).toUpperCase().padStart(digits, '0');
}

function toSigned8(byte: number): number {
    return byte >= 0x80 ? byte - 0x100 : byte;
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
                throw new Error(`Invalid register index ${index}`);
        }
    }

    /**
     * Reads an 8-bit register by its index in the opcode encoding:
     * 0=B, 1=C, 2=D, 3=E, 4=H, 5=L, 6=(HL) (memory at address HL), 7=A.
     */
    private getRegister(index: number): number {
        switch (index) {
            case 0:
                return this.b;
            case 1:
                return this.c;
            case 2:
                return this.d;
            case 3:
                return this.e;
            case 4:
                return this.h;
            case 5:
                return this.l;
            case 6:
                return this.mmu.read(this.hl);
            case 7:
                return this.a;
            default:
                throw new Error(`Invalid register index ${index}`);
        }
    }

    /**
     * Reads a register pair by its index in stack instructions (PUSH, POP):
     * 0=BC, 1=DE, 2=HL, 3=AF.
     */
    private getStackPair(index: number): number {
        switch (index) {
            case 0:
                return this.bc;
            case 1:
                return this.de;
            case 2:
                return this.hl;
            case 3:
                return this.af;
            default:
                throw new Error(`Invalid pair index ${index}`);
        }
    }

    /**
     * Writes a register pair by its index in stack instructions (PUSH, POP):
     * 0=BC, 1=DE, 2=HL, 3=AF.
     */
    private setStackPair(index: number, value: number) {
        switch (index) {
            case 0:
                this.bc = value;
                break;
            case 1:
                this.de = value;
                break;
            case 2:
                this.hl = value;
                break;
            case 3:
                this.af = value;
                break;
            default:
                throw new Error(`Invalid pair index ${index}`);
        }
    }

    /**
     * Pushes a 16-bit value onto the stack (the stack grows downwards).
     */
    private push16(value: number): void {
        this.sp = (this.sp - 2) & 0xFFFF;
        this.mmu.write16(this.sp, value);
    }

    /**
     * Pops a 16-bit value from the stack.
     */
    private pop16(): number {
        const value = this.mmu.read16(this.sp);
        this.sp = (this.sp + 2) & 0xFFFF;
        return value;
    }

    /**
     * Reads a register pair by its index in most 16-bit instructions:
     * 0=BC, 1=DE, 2=HL, 3=SP.
     */
    private getPair(index: number): number {
        switch (index) {
            case 0:
                return this.bc;
            case 1:
                return this.de;
            case 2:
                return this.hl;
            case 3:
                return this.sp;
            default:
                throw new Error(`Invalid pair index ${index}`);
        }
    }

    /**
     * Writes a register pair by its index in most 16-bit instructions:
     * 0=BC, 1=DE, 2=HL, 3=SP.
     */
    private setPair(index: number, value: number): void {
        value = value & 0xFFFF;
        switch (index) {
            case 0:
                this.bc = value;
                break;
            case 1:
                this.de = value;
                break;
            case 2:
                this.hl = value;
                break;
            case 3:
                this.sp = value;
                break;
            default:
                throw new Error(`Invalid pair index ${index}`);
        }
    }

    /**
     * Returns the memory address used by (BC), (DE), (HL+) and (HL-) operands,
     * by index: 0=BC, 1=DE, 2=HL then increment, 3=HL then decrement.
     */
    private pointerAddress(index: number): number {
        switch (index) {
            case 0:
                return this.bc;
            case 1:
                return this.de;
            case 2: {
                const value = this.hl;
                this.hl += 1;
                return value;
            }
            case 3: {
                const value = this.hl;
                this.hl -= 1;
                return value;
            }
            default:
                throw new Error(`Invalid pointer index ${index}`);
        }
    }

    /** Zero flag (bit 7 of F): set when the last result was zero. */
    get flagZ(): boolean {
        return (this.f & 0x80) !== 0;
    }

    set flagZ(value: boolean) {
        this.f = value ? this.f | 0x80 : this.f & ~0x80 & 0xFF;
    }

    /** Subtract flag (bit 6 of F): set when the last operation was a subtraction. */
    get flagN(): boolean {
        return (this.f & 0x40) !== 0;
    }

    set flagN(value: boolean) {
        this.f = value ? this.f | 0x40 : this.f & ~0x40 & 0xFF;
    }

    /** Half-carry flag (bit 5 of F): set on a carry from bit 3 to bit 4. */
    get flagH(): boolean {
        return (this.f & 0x20) !== 0;
    }

    set flagH(value: boolean) {
        this.f = value ? this.f | 0x20 : this.f & ~0x20 & 0xFF;
    }

    /** Carry flag (bit 4 of F): set when the last result overflowed 8 bits. */
    get flagC(): boolean {
        return (this.f & 0x10) !== 0;
    }

    set flagC(value: boolean) {
        this.f = value ? this.f | 0x10 : this.f & ~0x10 & 0xFF;
    }

    /**
     * Performs one of the 8 ALU operations on A with the given operand,
     * by index: 0=ADD, 1=ADC, 2=SUB, 3=SBC, 4=AND, 5=XOR, 6=OR, 7=CP.
     * The result goes into A (except CP) and the flags are updated.
     */
    private alu(op: number, value: number): void {
        switch (op) {
            case 4: // AND
                this.a = this.a & value;
                this.flagZ = this.a === 0;
                this.flagN = false;
                this.flagH = true;
                this.flagC = false;
                break;
            case 5: // XOR
                this.a = this.a ^ value;
                this.flagZ = this.a === 0;
                this.flagN = false;
                this.flagH = false;
                this.flagC = false;
                break;
            case 6: // OR
                this.a = this.a | value;
                this.flagZ = this.a === 0;
                this.flagN = false;
                this.flagH = false;
                this.flagC = false;
                break;
            default:
                throw new Error(`ALU operation ${op} not implemented`);
        }
    }

    /**
     * Evaluates a jump condition by its index in the opcode encoding:
     * 0=NZ, 1=Z, 2=NC, 3=C.
     */
    private condition(index: number): boolean {
        switch (index) {
            case 0: // NZ
                return !this.flagZ;
            case 1: // Z
                return this.flagZ;
            case 2: // NC
                return !this.flagC;
            case 3: // C
                return this.flagC;
            default:
                throw new Error(`Invalid condition index ${index}`);
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

        if (opcode >= 0x40 && opcode <= 0x7F && opcode !== 0x76) { // LD r, r'
            const dst = (opcode >> 3) & 0x07;
            const src = opcode & 0x07;
            this.setRegister(dst, this.getRegister(src));
            return (dst === 6 || src === 6) ? 8 : 4;
        }

        if (opcode >= 0x80 && opcode <= 0xBF) { // ALU A, r
            const op = (opcode >> 3) & 0x07;
            const z = opcode & 0x07;
            this.alu(op, this.getRegister(z));
            return z === 6 ? 8 : 4;
        }

        switch (opcode) {
            case 0x00: // NOP
                return 4;
            case 0x01: // LD BC, nn
                this.bc = this.fetch16();
                return 12;

            case 0x03:
            case 0x13:
            case 0x23:
            case 0x33: { // INC rr
                const p = (opcode >> 4) & 0x03;
                this.setPair(p, this.getPair(p) + 1);
                return 8;
            }

            case 0x0B:
            case 0x1B:
            case 0X2B:
            case 0X3B: { // DEC rr
                const p = (opcode >> 4) & 0x03;
                this.setPair(p, this.getPair(p) - 1);
                return 8;
            }

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

            case 0x02:
            case 0x12:
            case 0x22:
            case 0x32: { // LD (rr), A
                const p = (opcode >> 4) & 0x03;
                this.mmu.write(this.pointerAddress(p), this.a);
                return 8;
            }

            case 0x0A:
            case 0x1A:
            case 0x2A:
            case 0x3A: { // LD A, (rr)
                const p = (opcode >> 4) & 0x03;
                this.a = this.mmu.read(this.pointerAddress(p));
                return 8;
            }

            case 0x11: // LD DE, nn
                this.de = this.fetch16();
                return 12;

            case 0x18: { // JR e
                const offset = toSigned8(this.fetch8());
                this.pc = (this.pc + offset) & 0xFFFF;
                return 12;
            }

            case 0x20:
            case 0x28:
            case 0x30:
            case 0x38: { // JR cc, e
                const offset = toSigned8(this.fetch8());
                const conditionNumber = (opcode >> 3) & 0x03;
                if (this.condition(conditionNumber)) {
                    this.pc = (this.pc + offset) & 0xFFFF;
                    return 12;
                }
                return 8;
            }

            case 0x21: // LD HL, nn
                this.hl = this.fetch16();
                return 12;

            case 0x31: // LD SP, nn
                this.sp = this.fetch16();
                return 12;

            case 0xC3: // JP nn
                this.pc = this.fetch16();
                return 16;

            case 0xC9: // RET
                this.pc = this.pop16();
                return 16;

            case 0xC1:
            case 0xD1:
            case 0xE1:
            case 0xF1: { // POP rr
                const p = (opcode >> 4) & 0x03;
                this.setStackPair(p, this.pop16());
                return 12;
            }

            case 0xC5:
            case 0xD5:
            case 0xE5:
            case 0xF5: { // PUSH rr
                const p = (opcode >> 4) & 0x03;
                this.push16(this.getStackPair(p));
                return 16;
            }

            case 0xCD: { // CALL nn
                const target = this.fetch16();
                this.push16(this.pc);
                this.pc = target;
                return 24;
            }

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