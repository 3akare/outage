// Vite's ?raw imports: a file's text, used by the tests to read the static page scripts.
declare module '*?raw' {
  const text: string;
  export default text;
}
