import {SCREEN_WIDTH, SCREEN_HEIGHT} from "../core/ppu.ts";

// Display colors for the 4 Game Boy shades (0 = lightest … 3 = darkest), as [red, green, blue].
const PALETTE = [
    [0x9B, 0xBC, 0x0F],
    [0x8B, 0xAC, 0x0F],
    [0x30, 0x62, 0x30],
    [0x0F, 0x38, 0x0F],
];

/** Draws the emulator's framebuffer into a canvas, using a 4-color display palette. */
export class Renderer {
    private readonly ctx: CanvasRenderingContext2D;
    private readonly imageData: ImageData;

    constructor(canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext("2d")!;
        this.imageData = this.ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    }

    /** Converts each shade to its palette color and displays the whole image. */
    draw(framebuffer: Uint8Array): void {
        const data = this.imageData.data;
        for (let i = 0; i <= framebuffer.length - 1; i++) {
            const color = PALETTE[framebuffer[i]];
            data[i * 4] = color[0];
            data[i * 4 + 1] = color[1];
            data[i * 4 + 2] = color[2];
            data[i * 4 + 3] = 255;
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }
}