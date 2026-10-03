const TITLE_START = 0x0134;
const TITLE_END = 0x0143;
const CARTRIDGE_TYPE = 0x0147;
const ROM_SIZE = 0x0148;
const RAM_SIZE = 0x0149;

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
}