const TITLE_START = 0x0134;
const TITLE_END = 0x0143;
const CARTRIDGE_TYPE = 0x0147;
const ROM_SIZE = 0x0148;
const RAM_SIZE = 0x0149;
const CARTRIDGE_TYPE_NAMES: Record<number, string> = {
    0x00: "ROM ONLY",
    0x01: "MBC1",
    0x02: "MBC1+RAM",
    0x03: "MBC1+RAM+BATTERY",
    0x0F: "MBC3+TIMER+BATTERY",
    0x10: "MBC3+TIMER+RAM+BATTERY",
    0x11: "MBC3",
    0x12: "MBC3+RAM",
    0x13: "MBC3+RAM+BATTERY",
    0x19: "MBC5",
    0x1A: "MBC5+RAM",
    0x1B: "MBC5+RAM+BATTERY",
    0x1C: "MBC5+RUMBLE",
    0x1D: "MBC5+RUMBLE+RAM",
    0x1E: "MBC5+RUMBLE+RAM+BATTERY",
};
const RAM_SIZES: Record<number, number> = {
    0x00: 0,
    0x01: 0,
    0x02: 8 * 1024,
    0x03: 32 * 1024,
    0x04: 128 * 1024,
    0x05: 64 * 1024,
}
const CHECKSUM_ADDRESS = 0x014D
const CHECKSUM_RANGE_END = 0x014C;

export class Cartridge {
    private readonly rom: Uint8Array;

    constructor(rom: Uint8Array) {
        this.rom = rom;
    }


    get title(): string {
        let title = "";
        for (let address = TITLE_START; address <= TITLE_END; address++) {
            const byte = this.rom[address];
            if (byte === 0x00 || byte >= 0x80) {
                break;
            }
            title += String.fromCharCode(byte);
        }
        return title;
    }

    get type(): string {
        return CARTRIDGE_TYPE_NAMES[this.rom[CARTRIDGE_TYPE]] ?? "UNKNOWN";
    }

    // return rom size in bytes
    get romSize(): number {
        const code = this.rom[ROM_SIZE];
        return 32768 * (2 ** code); // 32 KiB in bytes * 2^code
    }

    get ramSize(): number {
        const code = this.rom[RAM_SIZE];
        return RAM_SIZES[code] ?? 0;
    }

    get isChecksumValid(): boolean {
        let checksum = 0;
        for (let address = TITLE_START; address <= CHECKSUM_RANGE_END; address++) {
            checksum = (checksum - this.rom[address] - 1) & 0xFF;
        }
        return this.rom[CHECKSUM_ADDRESS] === checksum;
    }
}