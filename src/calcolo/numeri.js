// I millesimi hanno fino a 3 decimali: si lavora in interi (millesimi × 1000)
// per confrontare soglie senza errori di virgola mobile.
export const inInteri = (valore) => Math.round(Number(valore) * 1000);

export const daInteri = (intero) => intero / 1000;
