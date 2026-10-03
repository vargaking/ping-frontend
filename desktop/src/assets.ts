import { nativeImage } from 'electron';
import path from 'node:path';

const dir = path.join(__dirname, '..', 'assets');

export const assetPath = (name: string) => path.join(dir, name);

export const image = (name: string) => nativeImage.createFromPath(assetPath(name));
