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
    });
});