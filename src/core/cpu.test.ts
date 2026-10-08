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

        it('executes LD r, r\'', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x7D; }); // LD A, L
            cpu.l = 0x42;
            expect(cpu.step()).toBe(4);
            expect(cpu.a).toBe(0x42);
        });

        it('executes LD (HL), r and LD r, (HL)', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x70], 0x0100); // LD (HL), B
                rom.set([0x7E], 0x0101); // LD A, (HL)
            });
            cpu.hl = 0xC000;
            cpu.b = 0x42;
            expect(cpu.step()).toBe(8); // writes B at 0xC000
            expect(cpu.step()).toBe(8); // reads 0xC000 into A
            expect(cpu.a).toBe(0x42);
        });

        it('does not treat 0x76 (HALT) as a load', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x76; });
            expect(() => cpu.step()).toThrow('Unknown opcode 0x76');
        });

        it('executes JR e forwards', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x18, 0x05], 0x0100); // JR +5
            });
            expect(cpu.step()).toBe(12);
            expect(cpu.pc).toBe(0x0107); // 0x0102 + 5
        });

        it('executes JR e backwards', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x18, 0xFE], 0x0100); // JR -2
            });
            cpu.step();
            expect(cpu.pc).toBe(0x0100); // 0x0102 - 2: jumps onto itself
        });

        it('executes PUSH rr and POP rr', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xC5], 0x0100); // PUSH BC
                rom.set([0xD1], 0x0101); // POP DE
            });
            cpu.bc = 0x1234;
            expect(cpu.step()).toBe(16);
            expect(cpu.sp).toBe(0xFFFC);
            expect(cpu.step()).toBe(12);
            expect(cpu.de).toBe(0x1234); // BC copied into DE through the stack
            expect(cpu.sp).toBe(0xFFFE);
        });

        it('clears the low 4 bits of F on POP AF', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xC5], 0x0100); // PUSH BC
                rom.set([0xF1], 0x0101); // POP AF
            });
            cpu.bc = 0x12FF;
            cpu.step();
            cpu.step();
            expect(cpu.af).toBe(0x12F0);
        });

        it('executes INC rr', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x23; }); // INC HL
            cpu.hl = 0x12FF;
            expect(cpu.step()).toBe(8);
            expect(cpu.hl).toBe(0x1300);
        });

        it('wraps around on DEC rr', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x3B; }); // DEC SP
            cpu.sp = 0x0000;
            cpu.step();
            expect(cpu.sp).toBe(0xFFFF);
        });

        it('does not change flags on INC rr', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x03; }); // INC BC
            cpu.f = 0xF0;
            cpu.bc = 0xFFFF;
            cpu.step();
            expect(cpu.bc).toBe(0x0000);
            expect(cpu.f).toBe(0xF0); // unchanged, even though the result is zero
        });

        it('executes LD (HL+), A', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x22; });
            cpu.hl = 0xC000;
            cpu.a = 0x42;
            expect(cpu.step()).toBe(8);
            expect(cpu.hl).toBe(0xC001); // HL incremented after the write
        });

        it('executes LD A, (HL-)', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x70], 0x0100); // LD (HL), B  — store a value first
                rom.set([0x3A], 0x0101); // LD A, (HL-)
            });
            cpu.hl = 0xC000;
            cpu.b = 0x42;
            cpu.step();
            expect(cpu.step()).toBe(8);
            expect(cpu.a).toBe(0x42);
            expect(cpu.hl).toBe(0xBFFF); // HL decremented after the read
        });

        it('executes OR r', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xB1; }); // OR C
            cpu.a = 0b1100_0000;
            cpu.c = 0b0000_0011;
            expect(cpu.step()).toBe(4);
            expect(cpu.a).toBe(0b1100_0011);
            expect(cpu.f).toBe(0x00);
        });

        it('sets H on AND r', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xA0; }); // AND B
            cpu.a = 0xF0;
            cpu.b = 0x0F;
            cpu.step();
            expect(cpu.a).toBe(0x00);
            expect(cpu.flagZ).toBe(true);
            expect(cpu.flagH).toBe(true);
        });

        it('clears A with XOR A', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xAF; }); // XOR A
            cpu.a = 0x42;
            cpu.step();
            expect(cpu.a).toBe(0x00);
            expect(cpu.flagZ).toBe(true);
        });

        it('takes JR cc, e when the condition is met', () => {
            const cpu = makeCpu((rom) => { rom.set([0x28, 0x05], 0x0100); }); // JR Z, +5
            cpu.flagZ = true;
            expect(cpu.step()).toBe(12);
            expect(cpu.pc).toBe(0x0107);
        });

        it('skips JR cc, e when the condition is not met', () => {
            const cpu = makeCpu((rom) => { rom.set([0x20, 0x05], 0x0100); }); // JR NZ, +5
            cpu.flagZ = true;
            expect(cpu.step()).toBe(8);
            expect(cpu.pc).toBe(0x0102); // continues after the operand
        });

        it('executes SUB r with borrow', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x90; }); // SUB B
            cpu.a = 0x05;
            cpu.b = 0x10;
            cpu.step();
            expect(cpu.a).toBe(0xF5);
            expect(cpu.flagN).toBe(true);
            expect(cpu.flagC).toBe(true);  // 0x05 < 0x10
            expect(cpu.flagH).toBe(false); // low nibbles: 5 >= 0
        });

        it('sets H on SUB r when the low nibble borrows', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x90; }); // SUB B
            cpu.a = 0x10;
            cpu.b = 0x01;
            cpu.step();
            expect(cpu.a).toBe(0x0F);
            expect(cpu.flagH).toBe(true);  // low nibbles: 0 < 1
            expect(cpu.flagC).toBe(false);
        });

        it('executes CP n without changing A', () => {
            const cpu = makeCpu((rom) => { rom.set([0xFE, 0x42], 0x0100); }); // CP 0x42
            cpu.a = 0x42;
            expect(cpu.step()).toBe(8);
            expect(cpu.a).toBe(0x42);      // A unchanged
            expect(cpu.flagZ).toBe(true);  // A == n
        });

        it('takes CALL cc, nn when the condition is met', () => {
            const cpu = makeCpu((rom) => { rom.set([0xC4, 0x00, 0x20], 0x0100); }); // CALL NZ, 0x2000
            cpu.flagZ = false;
            expect(cpu.step()).toBe(24);
            expect(cpu.pc).toBe(0x2000);
            expect(cpu.sp).toBe(0xFFFC);
        });

        it('skips CALL cc, nn when the condition is not met', () => {
            const cpu = makeCpu((rom) => { rom.set([0xC4, 0x00, 0x20], 0x0100); }); // CALL NZ, 0x2000
            cpu.flagZ = true;
            expect(cpu.step()).toBe(12);
            expect(cpu.pc).toBe(0x0103); // skips the operand
            expect(cpu.sp).toBe(0xFFFE); // nothing pushed
        });

        it('takes RET cc when the condition is met', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0xCD, 0x00, 0x20], 0x0100); // CALL 0x2000
                rom.set([0xC8], 0x2000);             // RET Z
            });
            cpu.step();
            cpu.flagZ = true;
            expect(cpu.step()).toBe(20);
            expect(cpu.pc).toBe(0x0103);
        });

        it('skips RET cc when the condition is not met', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0xC8; }); // RET Z
            cpu.flagZ = false;
            expect(cpu.step()).toBe(8);
            expect(cpu.pc).toBe(0x0101);
            expect(cpu.sp).toBe(0xFFFE); // nothing popped
        });

        it('executes JP cc, nn', () => {
            const cpu = makeCpu((rom) => { rom.set([0xDA, 0x00, 0x20], 0x0100); }); // JP C, 0x2000
            cpu.flagC = true;
            expect(cpu.step()).toBe(16);
            expect(cpu.pc).toBe(0x2000);
        });

        it('executes INC r with half carry', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x2C; }); // INC L
            cpu.l = 0x0F;
            expect(cpu.step()).toBe(4);
            expect(cpu.l).toBe(0x10);
            expect(cpu.flagH).toBe(true);
            expect(cpu.flagN).toBe(false);
        });

        it('does not change C on INC r', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x3C; }); // INC A
            cpu.a = 0xFF;
            cpu.flagC = false;
            cpu.step();
            expect(cpu.a).toBe(0x00);
            expect(cpu.flagZ).toBe(true);
            expect(cpu.flagC).toBe(false); // overflowed, but C is untouched
        });

        it('executes DEC r', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x05; }); // DEC B
            cpu.b = 0x01;
            cpu.step();
            expect(cpu.b).toBe(0x00);
            expect(cpu.flagZ).toBe(true);
            expect(cpu.flagN).toBe(true);
        });

        it('executes DEC (HL)', () => {
            const cpu = makeCpu((rom) => {
                rom.set([0x35], 0x0100); // DEC (HL)
                rom.set([0x7E], 0x0101); // LD A, (HL), to read it back
            });
            cpu.hl = 0xC000;           // WRAM starts at 0x00
            expect(cpu.step()).toBe(12);
            cpu.step();
            expect(cpu.a).toBe(0xFF);  // 0x00 - 1 wraps to 0xFF
            expect(cpu.flagH).toBe(true);
        });

        it('executes ADD r with carries', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x80; }); // ADD A, B
            cpu.a = 0xFF;
            cpu.b = 0x01;
            cpu.step();
            expect(cpu.a).toBe(0x00);
            expect(cpu.flagZ).toBe(true);
            expect(cpu.flagH).toBe(true); // 0xF + 0x1 overflows the low nibble
            expect(cpu.flagC).toBe(true); // 0xFF + 0x01 overflows the byte
        });

        it('adds the carry on ADC', () => {
            const cpu = makeCpu((rom) => { rom.set([0xCE, 0x0E], 0x0100); }); // ADC A, 0x0E
            cpu.a = 0x01;
            cpu.flagC = true;
            cpu.step();
            expect(cpu.a).toBe(0x10);     // 0x01 + 0x0E + 1
            expect(cpu.flagH).toBe(true); // 0x1 + 0xE + 1 overflows the low nibble
            expect(cpu.flagC).toBe(false);
        });

        it('subtracts the carry on SBC', () => {
            const cpu = makeCpu((rom) => { rom[0x0100] = 0x98; }); // SBC A, B
            cpu.a = 0x10;
            cpu.b = 0x10;
            cpu.flagC = true;
            cpu.step();
            expect(cpu.a).toBe(0xFF);     // 0x10 - 0x10 - 1
            expect(cpu.flagC).toBe(true); // borrow
            expect(cpu.flagH).toBe(true); // 0x0 - 0x0 - 1 < 0
        });

        describe('CB prefix', () => {
            it('executes BIT b, r', () => {
                const cpu = makeCpu((rom) => {
                    rom.set([0xCB, 0x7C], 0x0100); // BIT 7, H
                    rom.set([0xCB, 0x74], 0x0102); // BIT 6, H
                });
                cpu.h = 0x80;           // 1000 0000
                cpu.flagC = true;
                expect(cpu.step()).toBe(8);
                expect(cpu.flagZ).toBe(false); // bit 7 is 1
                cpu.step();
                expect(cpu.flagZ).toBe(true);  // bit 6 is 0
                expect(cpu.flagH).toBe(true);
                expect(cpu.flagC).toBe(true);  // untouched
                expect(cpu.h).toBe(0x80);      // register unchanged
            });

            it('executes RES b, r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x87], 0x0100); }); // RES 0, A
                cpu.a = 0xFF;
                expect(cpu.step()).toBe(8);
                expect(cpu.a).toBe(0xFE);
            });

            it('executes SET b, (HL)', () => {
                const cpu = makeCpu((rom) => {
                    rom.set([0xCB, 0xDE], 0x0100); // SET 3, (HL)
                    rom.set([0x7E], 0x0102);       // LD A, (HL), to read it back
                });
                cpu.hl = 0xC000;
                expect(cpu.step()).toBe(16);
                cpu.step();
                expect(cpu.a).toBe(0x08);      // 0000 1000
            });

            it('executes RLC r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x00], 0x0100); }); // RLC B
                cpu.b = 0b1000_0001;
                expect(cpu.step()).toBe(8);
                expect(cpu.b).toBe(0b0000_0011); // bit 7 wraps around to bit 0
                expect(cpu.flagC).toBe(true);
            });

            it('rotates through the carry on RL r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x11], 0x0100); }); // RL C
                cpu.c = 0b1000_0000;
                cpu.flagC = false;
                cpu.step();
                expect(cpu.c).toBe(0x00);       // the old carry (0) entered bit 0
                expect(cpu.flagZ).toBe(true);
                expect(cpu.flagC).toBe(true);   // bit 7 went out into C
            });

            it('keeps the sign bit on SRA r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x2F], 0x0100); }); // SRA A
                cpu.a = 0b1000_0010;
                cpu.step();
                expect(cpu.a).toBe(0b1100_0001);
                expect(cpu.flagC).toBe(false);
            });

            it('executes SWAP r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x37], 0x0100); }); // SWAP A
                cpu.a = 0x12;
                cpu.flagC = true;
                cpu.step();
                expect(cpu.a).toBe(0x21);
                expect(cpu.flagC).toBe(false);  // SWAP always clears C
            });

            it('executes RLC r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x00], 0x0100); }); // RLC B
                cpu.b = 0b1000_0001;
                expect(cpu.step()).toBe(8);
                expect(cpu.b).toBe(0b0000_0011); // bit 7 wraps around to bit 0
                expect(cpu.flagC).toBe(true);
            });

            it('rotates through the carry on RL r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x11], 0x0100); }); // RL C
                cpu.c = 0b1000_0000;
                cpu.flagC = false;
                cpu.step();
                expect(cpu.c).toBe(0x00);       // the old carry (0) entered bit 0
                expect(cpu.flagZ).toBe(true);
                expect(cpu.flagC).toBe(true);   // bit 7 went out into C
            });

            it('keeps the sign bit on SRA r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x2F], 0x0100); }); // SRA A
                cpu.a = 0b1000_0010;
                cpu.step();
                expect(cpu.a).toBe(0b1100_0001);
                expect(cpu.flagC).toBe(false);
            });

            it('executes SWAP r', () => {
                const cpu = makeCpu((rom) => { rom.set([0xCB, 0x37], 0x0100); }); // SWAP A
                cpu.a = 0x12;
                cpu.flagC = true;
                cpu.step();
                expect(cpu.a).toBe(0x21);
                expect(cpu.flagC).toBe(false);  // SWAP always clears C
            });

            it('clears Z on RRA even when the result is zero', () => {
                const cpu = makeCpu((rom) => { rom[0x0100] = 0x1F; }); // RRA
                cpu.a = 0x01;
                cpu.flagC = false;
                expect(cpu.step()).toBe(4);
                expect(cpu.a).toBe(0x00);
                expect(cpu.flagC).toBe(true);   // bit 0 went out into C
                expect(cpu.flagZ).toBe(false);  // always cleared, unlike RR A
            });

            it('executes ADD HL, rr', () => {
                const cpu = makeCpu((rom) => { rom[0x0100] = 0x29; }); // ADD HL, HL
                cpu.hl = 0x8800;
                cpu.flagZ = true;
                expect(cpu.step()).toBe(8);
                expect(cpu.hl).toBe(0x1000);    // 0x8800 + 0x8800 = 0x11000, wrapped
                expect(cpu.flagC).toBe(true);   // overflowed 16 bits
                expect(cpu.flagH).toBe(true);   // 0x800 + 0x800 overflows 12 bits
                expect(cpu.flagZ).toBe(true);   // unchanged
            });

            it('executes JP (HL)', () => {
                const cpu = makeCpu((rom) => { rom[0x0100] = 0xE9; });
                cpu.hl = 0x2000;
                expect(cpu.step()).toBe(4);
                expect(cpu.pc).toBe(0x2000);
            });

            it('executes LD HL, SP+e with a negative offset', () => {
                const cpu = makeCpu((rom) => { rom.set([0xF8, 0xFF], 0x0100); }); // LD HL, SP-1
                cpu.sp = 0x00FF;
                expect(cpu.step()).toBe(12);
                expect(cpu.hl).toBe(0x00FE);    // 0x00FF - 1
                expect(cpu.flagC).toBe(true);   // 0xFF + 0xFF (raw bytes) overflows 8 bits
                expect(cpu.flagH).toBe(true);   // 0xF + 0xF overflows 4 bits
                expect(cpu.sp).toBe(0x00FF);    // SP unchanged
            });

            it('executes ADD SP, e', () => {
                const cpu = makeCpu((rom) => { rom.set([0xE8, 0x02], 0x0100); }); // ADD SP, +2
                cpu.sp = 0xFFFE;
                expect(cpu.step()).toBe(16);
                expect(cpu.sp).toBe(0x0000);    // wraps around
            });

            it('adjusts A to BCD after an addition with DAA', () => {
                const cpu = makeCpu((rom) => {
                    rom.set([0xC6, 0x27], 0x0100); // ADD A, 0x27
                    rom.set([0x27], 0x0102);       // DAA
                });
                cpu.a = 0x15;                   // 15 + 27 in BCD
                cpu.step();
                expect(cpu.a).toBe(0x3C);       // raw binary result
                expect(cpu.step()).toBe(4);
                expect(cpu.a).toBe(0x42);       // corrected: 42
            });

            it('sets Z and C when DAA wraps to zero', () => {
                const cpu = makeCpu((rom) => {
                    rom.set([0xC6, 0x01], 0x0100); // ADD A, 0x01
                    rom.set([0x27], 0x0102);       // DAA
                });
                cpu.a = 0x99;                   // 99 + 1 in BCD
                cpu.step();
                cpu.step();
                expect(cpu.a).toBe(0x00);       // 100 → 00, with a carry
                expect(cpu.flagZ).toBe(true);
                expect(cpu.flagC).toBe(true);
            });

            it('adjusts A to BCD after a subtraction with DAA', () => {
                const cpu = makeCpu((rom) => {
                    rom.set([0xD6, 0x05], 0x0100); // SUB A, 0x05
                    rom.set([0x27], 0x0102);       // DAA
                });
                cpu.a = 0x20;                   // 20 - 5 in BCD
                cpu.step();
                cpu.step();
                expect(cpu.a).toBe(0x15);       // corrected: 15
            });
        });
    });
});