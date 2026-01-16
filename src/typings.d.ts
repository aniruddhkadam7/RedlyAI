declare module 'slash2';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.svg';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';
declare module '*.bmp';
declare module '*.tiff';
declare module '*.webm';
declare module 'omit.js';
declare module 'numeral';
declare module 'mockjs';
declare module 'react-fittext';

declare global {
	interface Window {
		eaDesktop?: {
			saveProject: (args: {
				payload: unknown;
				filePath?: string | null;
				saveAs?: boolean;
				suggestedName?: string;
			}) => Promise<{ ok: true; filePath?: string; canceled?: boolean } | { ok: false; error: string }>;
			openProject: () => Promise<
				| { ok: true; filePath?: string; content?: string; canceled?: boolean }
				| { ok: false; error: string }
			>;
			openProjectAtPath: (filePath: string) => Promise<
				| { ok: true; filePath?: string; content?: string }
				| { ok: false; error: string }
			>;
			pickProjectFolder: () => Promise<
				| { ok: true; folderPath?: string; canceled?: boolean }
				| { ok: false; error: string }
			>;
			openDevTools: () => Promise<{ ok: true } | { ok: false; error: string }>;
		};
	}
}

export {};
