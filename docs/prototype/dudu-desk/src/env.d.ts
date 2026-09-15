declare module "*.css";
declare module "*.svg?inline" {
  const source: string;
  export default source;
}
