import {Cartridge} from "./core/cartridge.ts";

const input = document.querySelector<HTMLInputElement>('#rom-input')!;
const romInfo = document.querySelector<HTMLInputElement>('#rom-info')!;

input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const rom = new Uint8Array(buffer);
    console.log(rom.length);
    const cart = new Cartridge(rom);
    romInfo.textContent = [
        `Titre : ${cart.title}`,
        `Type : ${cart.type}`,
        `Taille de la ROM : ${cart.romSize / 1024} Ko`,
        `Taille de la RAM : ${cart.ramSize / 1024} Ko`,
        `Checksum valide : ${cart.isChecksumValid}`,
    ].join('\n');
});