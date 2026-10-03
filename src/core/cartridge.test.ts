import { describe, it, expect } from 'vitest';
import { Cartridge } from './cartridge';


// create a fake 32ko ROM with a title wrote in 0x0134.
function makeRomWithTitle(title : string){
    const rom = new Uint8Array(0x8000);
    for (let i = 0; i < title.length; i++) {
        rom[0x0134 + i] = title.charCodeAt(i);
    }
    return rom;
}

describe('Cartridge', () => {
    it('read a short title', () => {
        const rom = makeRomWithTitle("TEST");
        const cart = new Cartridge(rom);
        expect(cart.title).toBe("TEST");
    });

    it('read a long title and stop at the end of the zone', () => {
        const rom = makeRomWithTitle("ANTICONSTITUTION");
        rom[0x0144] = 'X'.charCodeAt(0); // not null byte after title zone
        const cart = new Cartridge(rom);
        expect(cart.title).toBe("ANTICONSTITUTION");
    });

    it('ignore gameboy color flag', () => {
        const rom = makeRomWithTitle("QUINZECARACTERE");
        rom[0x0143] = 0x80; // gameboy color flag
        const cart = new Cartridge(rom);
        expect(cart.title).toBe("QUINZECARACTERE");
    });
});