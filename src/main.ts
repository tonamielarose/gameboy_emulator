import {Cartridge} from "./core/cartridge.ts";
import {Mmu} from "./core/mmu.ts";
import {Cpu} from "./core/cpu.ts";
import './style.css';
import {Renderer} from "./frontend/renderer.ts";

const input = document.querySelector<HTMLInputElement>('#rom-input')!;
const romInfo = document.querySelector<HTMLPreElement>('#rom-info')!;
const canvas = document.querySelector<HTMLCanvasElement>('#screen');
const renderer = new Renderer(canvas!);
const MAX_STEPS = 500_000_000;

input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const rom = new Uint8Array(buffer);
    const cart = new Cartridge(rom);
    romInfo.textContent = [
        `Titre : ${cart.title}`,
        `Type : ${cart.type}`,
        `Taille de la ROM : ${cart.romSize / 1024} Ko`,
        `Taille de la RAM : ${cart.ramSize / 1024} Ko`,
        `Checksum valide : ${cart.isChecksumValid}`,
    ].join('\n');

    const mmu = new Mmu(cart);
    const cpu = new Cpu(mmu);

    let steps = 0
    for (; steps < MAX_STEPS; steps++) {
        try {
            const cycles = cpu.step();
            mmu.tick(cycles);
            if (steps % 100_000 === 0 && /Passed|Failed/.test(mmu.serial)) {
                break;
            }
        } catch (e) {
            console.error(e);
            break;
        }
    }
    console.log(`Serial: ${mmu.serial}`);
    console.log(`Nombre de tours : ${steps}`);
    renderer.draw(mmu.framebuffer);

});