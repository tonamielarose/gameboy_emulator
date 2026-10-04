import { describe, it, expect } from 'vitest';
import { Cartridge } from './cartridge';
import { Mmu } from './mmu';
import { Cpu } from './cpu';

function makeCpu(setup?: (rom: Uint8Array) => void): Cpu {
    const rom = new Uint8Array(0x8000);
    setup?.(rom);
    return new Cpu(new Mmu(new Cartridge(rom)));
}

describe('Cpu', () => {
    describe('register pairs', () => {
        it('splits a 16-bit value into two registers', () => {
            const cpu = makeCpu();
            cpu.bc = 0x1234;
            expect(cpu.b).toBe(0x12);
            expect(cpu.c).toBe(0x34);
        });

        it('combines two registers into a 16-bit value', () => {
            const cpu = makeCpu();
            cpu.d = 0xAB;
            cpu.e = 0xCD;
            expect(cpu.de).toBe(0xABCD);
        });

        it('masks values above 16 bits', () => {
            const cpu = makeCpu();
            cpu.hl = 0x12345;
            expect(cpu.h).toBe(0x23);
            expect(cpu.l).toBe(0x45);
        });

        it('forces the low 4 bits of F to 0', () => {
            const cpu = makeCpu();
            cpu.af = 0x12FF;
            expect(cpu.a).toBe(0x12);
            expect(cpu.f).toBe(0xF0);
            expect(cpu.af).toBe(0x12F0);
        });
    });

    describe('initial state', () => {
        it('starts with the values left by the DMG boot ROM', () => {
            const cpu = makeCpu();
            expect(cpu.af).toBe(0x01B0);
            expect(cpu.bc).toBe(0x0013);
            expect(cpu.de).toBe(0x00D8);
            expect(cpu.hl).toBe(0x014D);
            expect(cpu.sp).toBe(0xFFFE);
            expect(cpu.pc).toBe(0x0100);
        });
    });

    describe('step', () => {
        it('executes NOP', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x00; });
            expect(cpu.step()).toBe(4);
            expect(cpu.pc).toBe(0x0101);
        });

        it('executes JP nn', () => {
            const cpu = makeCpu((rom) => {
                rom[0x0100] = 0xC3; // JP
                rom[0x0101] = 0x50; // low byte
                rom[0x0102] = 0x01; // high byte
            });
            expect(cpu.step()).toBe(16);
            expect(cpu.pc).toBe(0x0150);
        });

        it('throws on an unknown opcode', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xD3; });
            expect(() => cpu.step()).toThrow('Unknown opcode 0xD3 at 0x0100');
        });

        it('executes LD SP, nn', () => {
            const cpu = makeCpu((rom) => {
                rom[0x0100] = 0x31;
                rom[0x0101] = 0xFE;
                rom[0x0102] = 0xFF;
            });
            expect(cpu.step()).toBe(12);
            expect(cpu.sp).toBe(0xFFFE);
            expect(cpu.pc).toBe(0x0103);
        });

        it('executes LD BC, nn', () => {
            const cpu = makeCpu((rom) => {
                rom[0x0100] = 0x01;
                rom[0x0101] = 0x34;
                rom[0x0102] = 0x12;
            });
            cpu.step();
            expect(cpu.b).toBe(0x12);
            expect(cpu.c).toBe(0x34);
        });

        it('executes DI', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xF3; });
            cpu.ime = true;
            expect(cpu.step()).toBe(4);
            expect(cpu.ime).toBe(false);
        });

        it('executes LD (nn), A and LD A, (nn)', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xEA, 0x00, 0xC0], 0x0100); // LD (0xC000), A
                rom.set([0xFA, 0x00, 0xC0], 0x0103); // LD A, (0xC000)
            });
            cpu.a = 0x42;
            expect(cpu.step()).toBe(16);   // writes 0x42 at 0xC000
            cpu.a = 0x00;                  // clear A to prove the next read
            expect(cpu.step()).toBe(16);   // reads 0xC000 back into A
            expect(cpu.a).toBe(0x42);
        });

        it('executes LD r, n', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x3E, 0x42], 0x0100); // LD A, 0x42
            });
            expect(cpu.step()).toBe(8);
            expect(cpu.a).toBe(0x42);
            expect(cpu.pc).toBe(0x0102);
        });

        it('executes LD (HL), n', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x36, 0x42], 0x0100); // LD (HL), 0x42
                rom.set([0x7E], 0x0102);       // LD A, (HL), to read it back
            });
            cpu.hl = 0xC000;
            expect(cpu.step()).toBe(12);
            expect(cpu.hl).toBe(0xC000);       // HL itself is unchanged
        });

        it('executes LDH (n), A and LDH A, (n)', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xE0, 0x80], 0x0100); // LDH (0x80), A → writes 0xFF80
                rom.set([0xF0, 0x80], 0x0102); // LDH A, (0x80) → reads 0xFF80
            });
            cpu.a = 0x42;
            expect(cpu.step()).toBe(12);
            cpu.a = 0x00;
            expect(cpu.step()).toBe(12);
            expect(cpu.a).toBe(0x42);
        });

        it('executes CALL nn and RET', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xCD, 0x00, 0x20], 0x0100); // CALL 0x2000
                rom.set([0xC9], 0x2000);             // RET
            });
            expect(cpu.step()).toBe(24);
            expect(cpu.pc).toBe(0x2000);  // jumped to the subroutine
            expect(cpu.sp).toBe(0xFFFC);  // return address pushed (SP went down by 2)

            expect(cpu.step()).toBe(16);
            expect(cpu.pc).toBe(0x0103);  // back right after the CALL
            expect(cpu.sp).toBe(0xFFFE);  // stack restored
        });
    });
});