// Spec: 08-1 §3.1 (window.foo, zod-typed). M0 exposes platform facts only.
import { contextBridge, ipcRenderer } from 'electron';
import type { FooBridge, PlatformInfo } from '../shared/ipc';

const platform = ipcRenderer.sendSync('app:platform') as PlatformInfo;
const bridge: FooBridge = { platform };
contextBridge.exposeInMainWorld('foo', bridge);
