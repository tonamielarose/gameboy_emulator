import { describe, it, expect } from 'vitest';
import { Timer } from './timer';

describe('Timer', () => {
    it('increments DIV every 256 cycles', () => {
        const timer = new Timer();
        timer.tick(255);
        expect(timer.read(0xFF04)).toBe(0);
        timer.tick(1);
        expect(timer.read(0xFF04)).toBe(1);
    });

    it('resets DIV on any write', () => {
        const timer = new Timer();
        timer.tick(1024);
        timer.write(0xFF04, 0x42);
        expect(timer.read(0xFF04)).toBe(0);
    });

    it('does not run TIMA when disabled', () => {
        const timer = new Timer();
        timer.write(0xFF07, 0x01);          // 16-cycle period, but bit 2 off
        timer.tick(1024);
        expect(timer.read(0xFF05)).toBe(0);
    });

    it('increments TIMA at the selected rate', () => {
        const timer = new Timer();
        timer.write(0xFF07, 0x05);          // enabled, 16-cycle period
        timer.tick(16);
        expect(timer.read(0xFF05)).toBe(1);
        timer.tick(32);                     // two periods at once
        expect(timer.read(0xFF05)).toBe(3);
    });

    it('reloads TIMA from TMA and reports the overflow', () => {
        const timer = new Timer();
        timer.write(0xFF05, 0xFF);
        timer.write(0xFF06, 0x42);
        timer.write(0xFF07, 0x05);
        expect(timer.tick(16)).toBe(true);
        expect(timer.read(0xFF05)).toBe(0x42);
        expect(timer.tick(16)).toBe(false);
    });
});