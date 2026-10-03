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
    romInfo.textContent = `Nom de la cartouche : ${cart.title} \nType de cartouche : ${cart.type}\nTaille de la cartouche : ${cart.romSize / 1024}ko\nTaille de la ram : ${cart.ramSize / 1024}k`;

});