import { Platform } from "react-native";

// Copied from diff-context/client/web.ts. This plugin typechecks without the DOM library: declare only what is used.
interface KeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
  preventDefault(): void;
}
declare const document:
  | {
      addEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
      removeEventListener(type: "keydown", listener: (event: KeyEvent) => void): void;
    }
  | undefined;

/** Single-key shortcuts; ignored while typing anywhere (composer, comment box, search) or with modifiers held. */
export function listenShortcuts(handler: (key: string) => boolean): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const listener = (event: KeyEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return;
    if (handler(event.key)) event.preventDefault();
  };
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}
