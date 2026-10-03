const input = document.querySelector<HTMLInputElement>('#rom-input')!;

input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const rom = new Uint8Array(buffer);
    console.log(rom.length);
});