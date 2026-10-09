const DIV_ADDRESS = 0xFF04;
const TIMA_ADDRESS = 0xFF05;
const TMA_ADDRESS = 0xFF06;
const TAC_ADDRESS = 0xFF07;
const TIMA_PERIODS = [1024, 16, 64, 256];

/**
 * Hardware timer: DIV (free-running divider) and TIMA (configurable counter
 * that requests the timer interrupt when it overflows).
 * See https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
 */
export class Timer {
    private divCounter: number;
    private tima: number;
    private tma: number;
    private tac: number;
    private timaCounter: number;

    constructor() {
        this.divCounter = 0;
        this.tima = 0;
        this.tma = 0;
        this.tac = 0;
        this.timaCounter = 0;
    }

    /** Reads one of the timer registers (0xFF04–0xFF07). */
    read(address: number): number {
        switch (address) {
            case DIV_ADDRESS:
                return (this.divCounter >> 8) & 0xFF;

            case TIMA_ADDRESS:
                return this.tima;

            case TMA_ADDRESS:
                return this.tma;

            case TAC_ADDRESS:
                return this.tac | 0xF8;

            default:
                return 0xFF;
        }
    }

    /** Writes one of the timer registers. Any write to DIV resets it to 0. */
    write(address: number, value: number): void {
        value = value & 0xFF;

        switch (address) {
            case DIV_ADDRESS: // any write resets DIV
                this.divCounter = 0;
                break;

            case TIMA_ADDRESS:
                this.tima = value;
                break;

            case TMA_ADDRESS:
                this.tma = value;
                break;

            case TAC_ADDRESS:
                this.tac = value & 0x07;
        }
    }

    /**
     * Advances the timer by the given number of T-cycles.
     * Returns true if TIMA overflowed, so the caller can request the timer interrupt.
     */
    tick(cycles: number): boolean {
        this.divCounter = (this.divCounter + cycles) & 0xFFFF;

        if ((this.tac & 0x04) === 0) {
            return false;
        }

        this.timaCounter = (this.timaCounter + cycles);

        const period = TIMA_PERIODS[this.tac & 0x03];
        let overflowed = false;

        while (this.timaCounter >= period) {
            this.timaCounter = (this.timaCounter - period);
            this.tima += 1;
            if (this.tima > 0xFF) {
                this.tima = this.tma;
                overflowed = true;
            }
        }

        return overflowed;
    }
}