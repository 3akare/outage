// Vite turns `import text from './x.md?raw'` into the file's text; the golden report tests use it.
declare module '*.md?raw' {
  const text: string;
  export default text;
}
