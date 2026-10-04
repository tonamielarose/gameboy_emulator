import { describe, it, expect } from 'vitest';
import { Cartridge } from './cartridge';
import { Mmu } from './mmu';
import { Cpu } from './cpu';

function makeCpu(): Cpu {
    const rom = new Uint8Array(0x8000);
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
});